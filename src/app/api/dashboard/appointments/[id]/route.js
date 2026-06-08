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
      'diagnosis', 'medicines', 'notes', 'follow_up_date', 'follow_up_instructions',
      'treatments', 'advice_selected', 'diagnosis_selected',
      'payment_status', 'payment_method', 'transaction_id', 'paid_amount'];

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

    setClauses.push(`prescription_key = NULL`, `compiled_document_key = NULL`, `updated_at = NOW()`);
    values.push(id);

    await sql.query(`UPDATE appointments SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);

    const updated = await sql`
      SELECT id, logical_id, wa_id, patient_name, patient_phone, patient_id,
             date, time, treatment, treatments, diagnosis, medicines, status,
             consultation_fee, treatment_charges, medicine_charges, location,
             arrival_status, is_priority, notes, chit_media,
             follow_up_date, follow_up_instructions, advice_selected, diagnosis_selected,
             payment_status, payment_method, transaction_id, paid_amount,
             prescription_key, created_at, updated_at
      FROM appointments WHERE id = ${id}
    `;

    return NextResponse.json({ appointment: sanitizeResponse(updated[0] || null) });
  } catch (error) {
    logger.error('APPOINTMENT_PATCH_ERROR', { error: error.message });
    return jsonError(error);
  }
}
