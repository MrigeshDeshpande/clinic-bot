import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { approveExtraction, rejectExtraction } from '@/services/prescriptionExtractionService';

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const { action, reason } = body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
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

    if (action === 'approve') {
      await approveExtraction(sql, params.id);
    } else {
      await rejectExtraction(sql, params.id, reason);
    }

    return NextResponse.json({ success: true, extraction_id: params.id });
  } catch (e) {
    const httpStatus = e.status || 500;
    return NextResponse.json({ error: e.message }, { status: httpStatus });
  }
}

export async function GET(req, { params }) {
  try {
    const sql = getSql();
    if (!sql) return NextResponse.json({ error: 'Database not ready' }, { status: 503 });

    const [extraction] = await sql`
      SELECT
        id, media_asset_id, raw_text, structured_json,
        extraction_status, extraction_model, extraction_version,
        extraction_completed_at, created_at, error_message
      FROM prescription_extractions
      WHERE id = ${params.id}
    `;

    if (!extraction) {
      return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
    }

    return NextResponse.json({ extraction });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
