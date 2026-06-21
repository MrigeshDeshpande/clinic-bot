import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { rejectExtraction } from '@/services/prescriptionExtractionService';
import { approveExtractionAndCreateTimeline } from '@/services/extractionApprovalService';

export async function PATCH(req, { params: paramsPromise }) {
  try {
    const params = await paramsPromise;
    const body = await req.json();
    const { action, reason } = body;

    if (!action || !['approve', 'reject', 'save_section'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve", "reject", or "save_section"' },
        { status: 400 }
      );
    }

    if (action === 'reject' && !reason) {
      return NextResponse.json(
        { error: 'reason is required when rejecting' },
        { status: 400 }
      );
    }

    const sql = getSql();
    if (!sql) return NextResponse.json({ error: 'Database not ready' }, { status: 503 });

    if (action === 'save_section') {
      if (!body.structured_json) {
        return NextResponse.json({ error: 'structured_json required' }, { status: 400 });
      }
      await sql`
        UPDATE prescription_extractions
        SET structured_json = ${sql.json(body.structured_json)}
        WHERE id = ${params.id}
      `;

      // Sync patient fields to patients table if that section was saved
      if (body.section === 'patient') {
        const p = body.structured_json.patient;
        if (p?.name) {
          const [{ patient_id }] = await sql`
            SELECT ma.patient_id
            FROM prescription_extractions pe
            JOIN media_assets ma ON ma.id = pe.media_asset_id
            WHERE pe.id = ${params.id}
            LIMIT 1
          `;
          if (patient_id) {
            await sql`
              UPDATE patients
              SET name = ${p.name},
                  phone = ${p.phone || null},
                  age = ${p.age ? parseInt(p.age, 10) : null},
                  sex = ${p.sex || null}
              WHERE id = ${patient_id}
            `;
          }
        }
      }

      logger.info('EXTRACTION_SECTION_SAVED', { extractionId: params.id });
      return NextResponse.json({ success: true });
    }

    if (action === 'approve') {
      if (body.structured_json) {
        await sql`
          UPDATE prescription_extractions
          SET structured_json = ${sql.json(body.structured_json)}
          WHERE id = ${params.id}
        `;
      }
      await approveExtractionAndCreateTimeline(sql, params.id, {
        actor_id: body.approved_by || null,
        review_method: 'dashboard',
      });
    } else {
      await rejectExtraction(sql, params.id, reason);
    }

    return NextResponse.json({ success: true, extraction_id: params.id });
  } catch (e) {
    const httpStatus = e.status || 500;
    return NextResponse.json({ error: e.message }, { status: httpStatus });
  }
}

export async function GET(req, { params: paramsPromise }) {
  try {
    const params = await paramsPromise;
    const sql = getSql();
    if (!sql) return NextResponse.json({ error: 'Database not ready' }, { status: 503 });

    const [extraction] = await sql`
      SELECT
        pe.id, pe.media_asset_id, pe.raw_text, pe.structured_json,
        pe.extraction_status, pe.extraction_model, pe.extraction_version,
        pe.extraction_completed_at, pe.created_at, pe.error_message,
        p.name AS patient_name,
        p.phone AS patient_phone,
        a.date AS appointment_date
      FROM prescription_extractions pe
      LEFT JOIN media_assets ma ON ma.id = pe.media_asset_id
      LEFT JOIN patients p ON p.id = ma.patient_id
      LEFT JOIN appointments a ON a.id = ma.appointment_id
      WHERE pe.id = ${params.id}
    `;

    if (!extraction) {
      return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
    }

    return NextResponse.json({ extraction });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
