import { logger } from '@/lib/logger';
import {
  recordExtractionApproved,
  recordDiagnosisRecorded,
  recordTreatmentRecommended,
  recordTreatmentEstimated,
} from '@/services/timelineService';
import { approveExtraction } from '@/services/prescriptionExtractionService';

export async function approveExtractionAndCreateTimeline(sql, extractionId, { actor_id, review_method = 'dashboard' } = {}) {
  if (!extractionId) {
    throw Object.assign(new Error('extractionId is required'), { status: 400 });
  }

  const [extraction] = await sql`
    SELECT
      pe.id,
      pe.extraction_status,
      pe.structured_json,
      pe.media_asset_id,
      ma.patient_id
    FROM prescription_extractions pe
    JOIN media_assets ma ON ma.id = pe.media_asset_id
    WHERE pe.id = ${extractionId}
  `;

  if (!extraction) {
    throw Object.assign(new Error('Extraction not found'), { status: 404 });
  }

  if (extraction.extraction_status === 'approved') {
    logger.warn('EXTRACTION_ALREADY_APPROVED', { extractionId });
    return { idempotent: true };
  }

  if (extraction.extraction_status !== 'extraction_completed' && extraction.extraction_status !== 'review_pending') {
    throw Object.assign(
      new Error(`Cannot approve extraction in status "${extraction.extraction_status}"`),
      { status: 400 }
    );
  }

  const patientId = extraction.patient_id;
  const mediaAssetId = extraction.media_asset_id;
  const structured = extraction.structured_json || {};
  const source = 'prescription_photo';

  await sql.begin(async (tx) => {
    await recordExtractionApproved(tx, {
      patient_id: patientId,
      actor_type: 'doctor',
      actor_id,
      extraction_id: extractionId,
      media_asset_id: mediaAssetId,
      source,
      review_method,
    });

    const diagnoses = structured.diagnoses || [];
    for (const d of diagnoses) {
      await recordDiagnosisRecorded(tx, {
        patient_id: patientId,
        actor_type: 'doctor',
        actor_id,
        diagnosis: d.diagnosis,
        tooth_numbers: d.tooth_numbers || [],
        surface: d.surface || null,
        notes: d.notes || null,
        source,
        extraction_id: extractionId,
      });
    }

    const treatments = structured.treatment_recommendations || [];
    for (const t of treatments) {
      await recordTreatmentRecommended(tx, {
        patient_id: patientId,
        actor_type: 'doctor',
        actor_id,
        procedure: t.procedure,
        tooth_numbers: t.tooth_numbers || [],
        cost_estimate: t.cost_estimate || null,
        notes: t.notes || null,
        source,
        extraction_id: extractionId,
      });
    }

    const estimates = structured.financial_estimates || [];
    for (const e of estimates) {
      await recordTreatmentEstimated(tx, {
        patient_id: patientId,
        actor_type: 'doctor',
        actor_id,
        item: e.item,
        amount: e.amount || null,
        currency: 'INR',
        notes: e.notes || null,
        source,
        extraction_id: extractionId,
      });
    }

    await approveExtraction(tx, extractionId);
  });

  logger.info('EXTRACTION_APPROVED_WITH_TIMELINE', {
    extractionId,
    patientId,
    diagnosisCount: (structured.diagnoses || []).length,
    treatmentCount: (structured.treatment_recommendations || []).length,
    estimateCount: (structured.financial_estimates || []).length,
  });

  return { success: true };
}
