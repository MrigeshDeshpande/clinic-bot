import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function PATCH(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const sizeErr = checkBodySize(req);
  if (sizeErr) return sizeErr;

  try {
    const sql = getSql();
    const { id } = await params;
    const body = await req.json();

    const allowed = ['patient_name', 'patient_phone', 'treatment', 'status',
      'consultation_fee', 'treatment_charges', 'medicine_charges', 'location',
      'diagnosis', 'notes', 'follow_up_date', 'follow_up_instructions', 'treatments'];

    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (body[key] !== undefined) {
        const col = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
        setClauses.push(`${col} = $${idx++}`);
        if (key === 'medicines' || key === 'treatments') {
          values.push(JSON.stringify(body[key]));
        } else if (key.endsWith('_fee') || key.endsWith('_charges')) {
          values.push(parseInt(body[key], 10) || 0);
        } else {
          values.push(body[key]);
        }
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    setClauses.push(`prescription_key = NULL`, `updated_at = NOW()`);
    values.push(id);

    await sql.query(`UPDATE appointments SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);

    const updated = await sql`
      SELECT id, patient_name, patient_phone, treatment, treatments, status,
             consultation_fee, treatment_charges, medicine_charges, location,
             arrival_status, is_priority, notes, chit_media
      FROM appointments WHERE id = ${id}
    `;

    return NextResponse.json({ appointment: sanitizeResponse(updated[0] || null) });
  } catch (error) {
    logger.error('APPOINTMENT_PATCH_ERROR', { error: error.message });
    return jsonError(error);
  }
}
