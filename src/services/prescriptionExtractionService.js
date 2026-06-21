import { logger } from '@/lib/logger';
import { extractPrescription } from '@/lib/ai/extractionClient';

export async function performExtraction(sql, extractionId) {
  if (!extractionId) {
    throw Object.assign(new Error('extractionId is required'), { status: 400 });
  }

  const [extraction] = await sql`
    SELECT id, media_asset_id, raw_text, extraction_status
    FROM prescription_extractions
    WHERE id = ${extractionId}
  `;

  if (!extraction) {
    throw Object.assign(new Error('Extraction record not found'), { status: 404 });
  }

  if (extraction.extraction_status === 'extraction_completed') {
    logger.warn('EXTRACTION_ALREADY_COMPLETED', { extractionId });
    return;
  }

  if (!extraction.raw_text) {
    throw Object.assign(new Error('No raw_text available for extraction'), { status: 400 });
  }

  logger.info('EXTRACTION_STARTED', { extractionId, mediaAssetId: extraction.media_asset_id });

  const result = await extractPrescription(extraction.raw_text);

  await sql`
    UPDATE prescription_extractions
    SET
      structured_json = ${sql.json(result.structuredJson)},
      extraction_status = 'extraction_completed',
      extraction_model = ${result.model},
      extraction_version = 'qwen-extraction-v1',
      extraction_completed_at = NOW()
    WHERE id = ${extractionId}
  `;

  logger.info('EXTRACTION_COMPLETED', {
    extractionId,
    model: result.model,
    processingMs: result.processingMs,
  });

  return result;
}

export async function getPendingExtractions(sql, limit = 20) {
  return sql`
    SELECT
      pe.id,
      pe.media_asset_id,
      pe.raw_text,
      pe.structured_json,
      pe.extraction_status,
      pe.extraction_model,
      pe.extraction_version,
      pe.extraction_completed_at,
      pe.created_at,
      pe.error_message,
      p.name AS patient_name,
      p.phone AS patient_phone,
      a.date AS appointment_date
    FROM prescription_extractions pe
    LEFT JOIN media_assets ma ON ma.id = pe.media_asset_id
    LEFT JOIN patients p ON p.id = ma.patient_id
    LEFT JOIN appointments a ON a.id = ma.appointment_id
    WHERE pe.extraction_status IN ('extraction_completed', 'review_pending')
    ORDER BY
      CASE WHEN pe.extraction_status = 'review_pending' THEN 0 ELSE 1 END,
      pe.extraction_completed_at DESC NULLS LAST
    LIMIT ${limit}
  `;
}

export async function getExtractionsByStatus(sql, status = 'pending', limit = 50) {
  const where = {
    pending: sql`pe.extraction_status IN ('extraction_completed', 'review_pending')`,
    approved: sql`pe.extraction_status = 'approved'`,
    rejected: sql`pe.extraction_status = 'rejected'`,
    all: sql`1=1`,
  };
  return sql`
    SELECT
      pe.id,
      pe.media_asset_id,
      pe.raw_text,
      pe.structured_json,
      pe.extraction_status,
      pe.extraction_model,
      pe.extraction_version,
      pe.extraction_completed_at,
      pe.created_at,
      pe.error_message,
      p.name AS patient_name,
      p.phone AS patient_phone,
      a.date AS appointment_date
    FROM prescription_extractions pe
    LEFT JOIN media_assets ma ON ma.id = pe.media_asset_id
    LEFT JOIN patients p ON p.id = ma.patient_id
    LEFT JOIN appointments a ON a.id = ma.appointment_id
    WHERE ${where[status] || where.pending}
    ORDER BY pe.created_at DESC
    LIMIT ${limit}
  `;
}

export async function approveExtraction(sql, extractionId) {
  if (!extractionId) {
    throw Object.assign(new Error('extractionId is required'), { status: 400 });
  }

  const [current] = await sql`
    SELECT extraction_status FROM prescription_extractions WHERE id = ${extractionId}
  `;

  if (!current) {
    throw Object.assign(new Error('Extraction record not found'), { status: 404 });
  }

  if (current.extraction_status === 'approved') {
    return;
  }

  if (current.extraction_status !== 'extraction_completed' && current.extraction_status !== 'review_pending') {
    throw Object.assign(
      new Error(`Cannot approve extraction in status "${current.extraction_status}"`),
      { status: 400 }
    );
  }

  await sql`
    UPDATE prescription_extractions
    SET extraction_status = 'approved'
    WHERE id = ${extractionId}
  `;

  logger.info('EXTRACTION_APPROVED', { extractionId });
}

export async function rejectExtraction(sql, extractionId, reason) {
  if (!extractionId) {
    throw Object.assign(new Error('extractionId is required'), { status: 400 });
  }

  const [current] = await sql`
    SELECT extraction_status FROM prescription_extractions WHERE id = ${extractionId}
  `;

  if (!current) {
    throw Object.assign(new Error('Extraction record not found'), { status: 404 });
  }

  if (current.extraction_status === 'rejected') {
    return;
  }

  if (current.extraction_status !== 'extraction_completed' && current.extraction_status !== 'review_pending') {
    throw Object.assign(
      new Error(`Cannot reject extraction in status "${current.extraction_status}"`),
      { status: 400 }
    );
  }

  await sql`
    UPDATE prescription_extractions
    SET
      extraction_status = 'rejected',
      error_message = ${reason || 'Rejected by reviewer'}
    WHERE id = ${extractionId}
  `;

  logger.info('EXTRACTION_REJECTED', { extractionId, reason });
}
