import { NextResponse } from 'next/server';
import { getSql, runMigrations } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError, sanitizeResponse } from '@/lib/apiAuth';
import { getClinicDateStr, getClinicMinutes } from '@/lib/clinicTime';
import { CLINIC } from '@/config/clinic';

export async function POST(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const sizeErr = checkBodySize(req);
  if (sizeErr) return sizeErr;
  try {
    await runMigrations();
    const sql = getSql();
    const body = await req.json();
    const { patientName, patientPhone, patientAge, patientSex, date, time, treatment, location } = body;

    if (!patientName || !date || !time) {
      return NextResponse.json({ error: 'patientName, date, and time are required' }, { status: 400 });
    }

    // Reject past-time bookings in clinic timezone
    if (date === getClinicDateStr()) {
      const [h, m] = time.split(':').map(Number);
      const timeMinutes = h * 60 + m;
      if (timeMinutes <= getClinicMinutes()) {
        return NextResponse.json({ error: 'That time has already passed today.' }, { status: 400 });
      }
    }

    // Find or create patient record (with age and sex)
    let patientId = null;
    if (patientPhone) {
      const existing = await sql`
        SELECT id FROM patients WHERE phone = ${patientPhone} LIMIT 1
      `;
      if (existing && existing.length > 0) {
        patientId = existing[0].id;
        // Update age/sex if provided
        const ageVal = patientAge ? parseInt(patientAge, 10) : null;
        if (ageVal || patientSex) {
          const setParts = [];
          const params = [];
          let idx = 1;
          if (ageVal) { setParts.push(`age = $${idx++}`); params.push(ageVal); }
          if (patientSex) { setParts.push(`sex = $${idx++}`); params.push(patientSex); }
          params.push(patientId);
          await sql.query(`UPDATE patients SET ${setParts.join(', ')} WHERE id = $${idx}`, params);
          // Invalidate cached prescriptions for this patient
          await sql`UPDATE appointments SET prescription_key = NULL, updated_at = NOW() WHERE patient_id = ${patientId} AND prescription_key IS NOT NULL`;
        }
      } else {
        const ageVal = patientAge ? parseInt(patientAge, 10) : null;
        const cols = ['name', 'phone', 'wa_id'];
        const vals = [patientName, patientPhone, patientPhone];
        const placeholders = ['$1', '$2', '$3'];
        let idx = 4;
        if (ageVal) { cols.push('age'); vals.push(ageVal); placeholders.push(`$${idx++}`); }
        if (patientSex) { cols.push('sex'); vals.push(patientSex); placeholders.push(`$${idx++}`); }
        const created = await sql.query(
          `INSERT INTO patients (${cols.join(', ')})
           VALUES (${placeholders.join(', ')})
           ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          vals
        );
        if (created && created.length > 0) patientId = created[0].id;
      }
    }

    // Check if slot is already booked
    const existingAppt = await sql`
      SELECT id FROM appointments
      WHERE date = ${date}::date AND time = ${time} AND status = 'confirmed'
      LIMIT 1
    `;
    if (existingAppt && existingAppt.length > 0) {
      return NextResponse.json({ error: 'This slot is already booked' }, { status: 409 });
    }

    // Create appointment — use phone as wa_id for walk-in tracking, or a placeholder if no phone
    const waId = patientPhone || `w-${Date.now()}`;
    // Derive treatments array from single treatment string
    const treatmentsArr = treatment ? [treatment] : [];

    const rows = await sql`
      INSERT INTO appointments (logical_id, version, wa_id, patient_name, patient_phone, patient_id, date, time, treatment, treatments, status, location)
      VALUES (gen_random_uuid(), 1, ${waId}, ${patientName}, ${patientPhone || null}, ${patientId}, ${date}::date, ${time}, ${treatment || null}, ${JSON.stringify(treatmentsArr)}, 'confirmed', ${location || ''})
      RETURNING *
    `;

    logger.info('QUICK_BOOK_DASHBOARD', { patientName, date, time, treatment });
    return NextResponse.json({ appointment: sanitizeResponse(rows[0] || null) });
  } catch (error) {
    logger.error('QUICK_BOOK_ERROR', { error: error.message });
    return jsonError(error);
  }
}

export async function GET(req) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const date = searchParams.get('date');
    const scope = searchParams.get('scope');

    // Single appointment by ID
    if (id) {
      const rows = await sql`
        SELECT a.id, a.logical_id, a.wa_id,
               COALESCE(p.name, a.patient_name) AS patient_name,
               a.patient_phone, a.patient_id, a.date, a.time, a.treatment,
               a.treatments,
         a.status, a.arrival_status, a.arrived_at, a.called_at, a.is_priority,
               a.consultation_fee, a.treatment_charges, a.medicine_charges,
               a.diagnosis, a.medicines, a.notes, a.follow_up_date, a.follow_up_instructions,
               a.chit_media, a.prescription_key, a.location, a.created_at, a.updated_at,
               a.advice_selected, a.diagnosis_selected, a.tooth_diagnoses,
               a.payment_status, a.payment_method, a.transaction_id, a.paid_amount
        FROM appointments a
        LEFT JOIN patients p ON p.id = a.patient_id
        WHERE a.id = ${id}
        LIMIT 1
      `;
      if (!rows || rows.length === 0) {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }
      return NextResponse.json({ appointment: sanitizeResponse(rows[0]) });
    }

    const isFutureScope = scope === 'future';
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const [appointments, totalsRaw] = await Promise.all(
      isFutureScope
        ? [
            sql`
              SELECT a.id, a.logical_id, a.wa_id,
                     COALESCE(p.name, a.patient_name) AS patient_name,
                     a.patient_phone, a.patient_id, a.date, a.time, a.treatment,
                     a.treatments,
                     a.status, a.arrival_status, a.arrived_at, a.called_at, a.is_priority,
                     a.consultation_fee, a.treatment_charges, a.medicine_charges,
                     a.diagnosis, a.medicines, a.notes,
                     a.follow_up_date, a.follow_up_instructions,
                     a.advice_selected, a.diagnosis_selected, a.tooth_diagnoses,
                     a.location, p.location AS patient_location,
                     a.payment_status, a.payment_method, a.transaction_id, a.paid_amount, a.paid_at,
                     a.chit_media, a.prescription_key, a.created_at, a.updated_at
              FROM appointments a
              LEFT JOIN patients p ON p.id = a.patient_id
              WHERE a.date >= CURRENT_DATE
                AND a.status IN ('confirmed', 'completed', 'no_show')
              ORDER BY a.date ASC, a.time ASC
            `,
            sql`
              SELECT
                COUNT(*) FILTER (WHERE a.status = 'confirmed' AND a.arrival_status != 'called') AS waiting,
                COUNT(*) FILTER (WHERE a.status = 'confirmed' AND a.arrival_status = 'called') AS in_session,
                COUNT(*) FILTER (WHERE a.status = 'confirmed') AS confirmed,
                COUNT(*) FILTER (WHERE a.status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE a.status = 'no_show') AS no_show,
                COUNT(*) FILTER (WHERE a.status = 'cancelled') AS cancelled
              FROM appointments a
              WHERE a.date >= CURRENT_DATE
                AND a.status IN ('confirmed', 'completed', 'no_show', 'cancelled')
            `,
          ]
        : [
            sql`
              SELECT a.id, a.logical_id, a.wa_id,
                     COALESCE(p.name, a.patient_name) AS patient_name,
                     a.patient_phone, a.patient_id, a.date, a.time, a.treatment,
                     a.treatments,
                     a.status, a.arrival_status, a.arrived_at, a.called_at, a.is_priority,
                     a.consultation_fee, a.treatment_charges, a.medicine_charges,
                     a.diagnosis, a.medicines, a.notes,
                     a.follow_up_date, a.follow_up_instructions,
                     a.advice_selected, a.diagnosis_selected, a.tooth_diagnoses,
                     a.location, p.location AS patient_location,
                     a.payment_status, a.payment_method, a.transaction_id, a.paid_amount, a.paid_at,
                     a.chit_media, a.prescription_key, a.created_at, a.updated_at
              FROM appointments a
              LEFT JOIN patients p ON p.id = a.patient_id
              WHERE a.date = ${targetDate}
                AND a.status IN ('confirmed', 'completed', 'no_show')
              ORDER BY a.time ASC
            `,
            sql`
              SELECT
                COUNT(*) FILTER (WHERE a.status = 'confirmed' AND a.arrival_status != 'called') AS waiting,
                COUNT(*) FILTER (WHERE a.status = 'confirmed' AND a.arrival_status = 'called') AS in_session,
                COUNT(*) FILTER (WHERE a.status = 'confirmed') AS confirmed,
                COUNT(*) FILTER (WHERE a.status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE a.status = 'no_show') AS no_show,
                COUNT(*) FILTER (WHERE a.status = 'cancelled') AS cancelled
              FROM appointments a
              WHERE a.date = ${targetDate}
                AND a.status IN ('confirmed', 'completed', 'no_show', 'cancelled')
            `,
          ]
    );

    return NextResponse.json({ appointments: sanitizeResponse(appointments || []), totals: totalsRaw[0] || {} });
  } catch (error) {
    logger.error('DASHBOARD_APPOINTMENTS_ERROR', { error: error.message });
    return jsonError(error);
  }
}
