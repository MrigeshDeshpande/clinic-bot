import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function POST(req) {
  try {
    const sql = getSql();
    const body = await req.json();
    const { patientName, patientPhone, date, time, treatment } = body;

    if (!patientName || !date || !time) {
      return NextResponse.json({ error: 'patientName, date, and time are required' }, { status: 400 });
    }

    // Find or create patient record
    let patientId = null;
    if (patientPhone) {
      const existing = await sql`
        SELECT id FROM patients WHERE phone = ${patientPhone} LIMIT 1
      `;
      if (existing && existing.length > 0) {
        patientId = existing[0].id;
      } else {
        const created = await sql`
          INSERT INTO patients (name, phone, wa_id)
          VALUES (${patientName}, ${patientPhone}, ${patientPhone})
          ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `;
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
    const rows = await sql`
      INSERT INTO appointments (logical_id, version, wa_id, patient_name, patient_phone, patient_id, date, time, treatment, status)
      VALUES (gen_random_uuid(), 1, ${waId}, ${patientName}, ${patientPhone || null}, ${patientId}, ${date}::date, ${time}, ${treatment || null}, 'confirmed')
      RETURNING *
    `;

    logger.info('QUICK_BOOK_DASHBOARD', { patientName, date, time, treatment });
    return NextResponse.json({ appointment: rows[0] || null });
  } catch (error) {
    logger.error('QUICK_BOOK_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const sql = getSql();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const date = searchParams.get('date');

    // Single appointment by ID
    if (id) {
      const rows = await sql`
        SELECT a.id, a.logical_id, a.wa_id, a.patient_name, a.patient_phone, a.patient_id, a.date, a.time, a.treatment,
               a.status, a.arrival_status, a.arrived_at, a.called_at, a.is_priority,
               a.consultation_fee, a.treatment_charges, a.medicine_charges,
               a.diagnosis, a.medicines, a.notes, a.follow_up_date, a.follow_up_instructions,
               a.chit_media, a.created_at, a.updated_at
        FROM appointments a
        WHERE a.id = ${id}
        LIMIT 1
      `;
      if (!rows || rows.length === 0) {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }
      return NextResponse.json({ appointment: rows[0] });
    }

    const targetDate = date || new Date().toISOString().slice(0, 10);

    const [appointments, totalsRaw] = await Promise.all([
      sql`
        SELECT a.id, a.logical_id, a.wa_id, a.patient_name, a.patient_phone, a.patient_id, a.date, a.time, a.treatment,
               a.status, a.arrival_status, a.arrived_at, a.called_at, a.is_priority,
               a.consultation_fee, a.treatment_charges, a.medicine_charges, a.notes,
               a.chit_media, a.created_at, a.updated_at
        FROM appointments a
        WHERE a.date = ${targetDate}
          AND a.status IN ('confirmed', 'completed', 'no_show')
        ORDER BY a.time ASC
      `,
      sql`
        SELECT
          COUNT(*) FILTER (WHERE a.status = 'confirmed' AND a.arrival_status = 'arrived') AS waiting,
          COUNT(*) FILTER (WHERE a.status = 'confirmed' AND a.arrival_status = 'called') AS in_session,
          COUNT(*) FILTER (WHERE a.status = 'confirmed') AS confirmed,
          COUNT(*) FILTER (WHERE a.status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE a.status = 'no_show') AS no_show
        FROM appointments a
        WHERE a.date = ${targetDate}
          AND a.status IN ('confirmed', 'completed', 'no_show')
      `,
    ]);

    return NextResponse.json({ appointments: appointments || [], totals: totalsRaw[0] || {} });
  } catch (error) {
    logger.error('DASHBOARD_APPOINTMENTS_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
