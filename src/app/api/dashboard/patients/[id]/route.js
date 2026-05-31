import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function GET(req, { params }) {
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
               a.chit_media, a.status, a.created_at, a.updated_at
        FROM appointments a
        WHERE a.patient_id = ${id}
          AND a.status IN ('completed', 'confirmed', 'no_show')
        ORDER BY a.date DESC, a.time DESC
      `,
    ]);

    const patient = patientRows[0] || null;

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json({ patient, visits: visits || [] });
  } catch (error) {
    logger.error('PATIENT_DETAIL_ERROR', { params, error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
