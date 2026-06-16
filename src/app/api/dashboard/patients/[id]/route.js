import { NextResponse } from 'next/server';
import { getSql, runMigrations } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError, sanitizeResponse } from '@/lib/apiAuth';
import { getCached, setCache, invalidateCache } from '@/lib/dataCache';

export async function GET(req, { params }) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const cacheKey = `patient_detail:${id}`;
    const cached = getCached(cacheKey, 60_000);
    if (cached) return NextResponse.json(cached);

    const [patientRows, visits, settingsRows] = await Promise.all([
      sql`
        SELECT p.id, p.name, p.phone, p.age, p.sex, p.wa_id, p.created_at,
          p.location, p.allergies, p.chronic_conditions, p.blood_group, p.bp, p.weight, p.medications, p.patient_ratings, p.habits,
          p.address, p.occupation, p.dental_history, p.family_history,
          (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'completed') AS visit_count,
          (SELECT COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0)
           FROM appointments a WHERE a.patient_id = p.id AND a.status = 'completed') AS total_spent
        FROM patients p
        WHERE p.id = ${id}
        LIMIT 1
      `,
      sql`
        SELECT a.id, a.date, a.time, a.treatment, a.treatments, a.diagnosis, a.medicines,
               a.consultation_fee, a.treatment_charges, a.medicine_charges,
               a.notes, a.follow_up_date, a.follow_up_instructions,
         a.advice_selected, a.diagnosis_selected, a.tooth_diagnoses,
               a.chit_media, a.prescription_key, a.status, a.created_at, a.updated_at,
               a.chief_complaint, a.general_examination, a.extra_oral_examination,
               a.payment_status, a.paid_amount,
               COALESCE(p.name, a.patient_name) AS patient_name
        FROM appointments a
        LEFT JOIN patients p ON p.id = a.patient_id
        WHERE a.patient_id = ${id}
          AND a.status IN ('completed', 'confirmed', 'no_show')
        ORDER BY a.date DESC, a.time DESC
      `,
      sql`
        SELECT value FROM settings WHERE key = 'google_maps'
      `,
    ]);

    const patient = patientRows[0] || null;

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const reviewUrl = settingsRows[0]?.value?.review_url || '';
    const responseData = { patient: sanitizeResponse(patient), visits: sanitizeResponse(visits || []), review_url: reviewUrl };
    setCache(cacheKey, responseData, 60_000);
    return NextResponse.json(responseData);
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
  await runMigrations();
  try {
    const sql = getSql();
    const { id } = await params;
    const body = await req.json();
    const { name, age, sex, phone, location, patient_ratings, address, occupation } = body;

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
    if (location !== undefined) {
      setClauses.push(`location = $${p++}`);
      queryParams.push(location);
    }
    if (patient_ratings !== undefined) {
      setClauses.push(`patient_ratings = $${p++}::jsonb`);
      queryParams.push(JSON.stringify(patient_ratings));
    }
    if (address !== undefined) {
      setClauses.push(`address = $${p++}`);
      queryParams.push(address);
    }
    if (occupation !== undefined) {
      setClauses.push(`occupation = $${p++}`);
      queryParams.push(occupation);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push('updated_at = NOW()');
    queryParams.push(id);

    const rows = await sql.unsafe(
      `UPDATE patients SET ${setClauses.join(', ')} WHERE id = $${p} RETURNING *`,
      queryParams
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Sync updated name and invalidate cached prescriptions for this patient
    if (name !== undefined) {
      await sql`
        UPDATE appointments SET patient_name = ${name}, prescription_key = NULL, compiled_document_key = NULL, updated_at = NOW()
        WHERE patient_id = ${id}
      `;
    } else {
      await sql`
        UPDATE appointments SET prescription_key = NULL, compiled_document_key = NULL, updated_at = NOW()
        WHERE patient_id = ${id}
      `;
    }

    invalidateCache(`patient_detail:${id}`);
    logger.info('PATIENT_UPDATED', { id, fields: setClauses.map(c => c.split(' =')[0]) });
    return NextResponse.json({ patient: rows[0] });
  } catch (error) {
    logger.error('PATIENT_UPDATE_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}
