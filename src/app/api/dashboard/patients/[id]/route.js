import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function GET(req, { params }) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const [patientRows, visits] = await Promise.all([
      sql`
        SELECT p.id, p.name, p.phone, p.age, p.sex, p.wa_id, p.created_at,
          (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'completed') AS visit_count,
          (SELECT COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0)
           FROM appointments a WHERE a.patient_id = p.id AND a.status = 'completed') AS total_spent
        FROM patients p
        WHERE p.id = ${id}
        LIMIT 1
      `,
      sql`
        SELECT a.id, a.date, a.time, a.treatment, a.diagnosis, a.medicines,
               a.consultation_fee, a.treatment_charges, a.medicine_charges,
               a.notes, a.follow_up_date, a.follow_up_instructions,
               a.chit_media, a.prescription_key, a.status, a.created_at, a.updated_at,
               COALESCE(p.name, a.patient_name) AS patient_name
        FROM appointments a
        LEFT JOIN patients p ON p.id = a.patient_id
        WHERE a.patient_id = ${id}
          AND a.status IN ('completed', 'confirmed', 'no_show')
        ORDER BY a.date DESC, a.time DESC
      `,
    ]);

    const patient = patientRows[0] || null;

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json({ patient: sanitizeResponse(patient), visits: sanitizeResponse(visits || []) });
  } catch (error) {
    logger.error('PATIENT_DETAIL_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}

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
    const { name, age, sex, phone } = body;

    if (!id) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const setClauses = [];
    const queryParams = [];
    let p = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${p++}`);
      queryParams.push(name);
    }
    if (age !== undefined) {
      setClauses.push(`age = $${p++}`);
      queryParams.push(age || null);
    }
    if (sex !== undefined) {
      setClauses.push(`sex = $${p++}`);
      queryParams.push(sex || null);
    }
    if (phone !== undefined) {
      setClauses.push(`phone = $${p++}`);
      queryParams.push(phone);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push('updated_at = NOW()');
    queryParams.push(id);

    const rows = await sql.query(
      `UPDATE patients SET ${setClauses.join(', ')} WHERE id = $${p} RETURNING *`,
      queryParams
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Sync updated name to all appointments for this patient
    if (name !== undefined) {
      await sql`
        UPDATE appointments SET patient_name = ${name}, updated_at = NOW()
        WHERE patient_id = ${id}
      `;
    }

    logger.info('PATIENT_UPDATED', { id, fields: setClauses.map(c => c.split(' =')[0]) });
    return NextResponse.json({ patient: rows[0] });
  } catch (error) {
    logger.error('PATIENT_UPDATE_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}
