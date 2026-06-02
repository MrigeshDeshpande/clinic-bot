import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { checkRateLimit, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function GET(req, { params }) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();
    const { id } = await params;

    const patient = await sql`
      SELECT wa_id FROM patients WHERE id = ${id} LIMIT 1
    `;
    if (!patient || patient.length === 0) {
      return NextResponse.json({ family: [] });
    }
    const waId = patient[0].wa_id;
    if (!waId) {
      return NextResponse.json({ family: [] });
    }

    const family = await sql`
      SELECT id, name, age, sex, phone, created_at
      FROM patients WHERE wa_id = ${waId} AND id != ${id}
      ORDER BY created_at ASC
    `;

    return NextResponse.json({ family: sanitizeResponse(family || []) });
  } catch (error) {
    logger.error('PATIENT_FAMILY_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}
