import { NextResponse } from 'next/server';
import { getSql, runMigrations } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function GET(req) {
  try {
    await runMigrations();
    const sql = getSql();

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    let patients;
    if (q.length >= 2) {
      const pattern = `%${q}%`;
      patients = await sql`
        SELECT p.id, p.name, p.phone, p.age, p.sex, p.wa_id, p.created_at,
          (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'completed') AS visit_count,
          (SELECT MAX(a.date) FROM appointments a WHERE a.patient_id = p.id) AS last_visit
        FROM patients p
        WHERE p.name ILIKE ${pattern} OR p.phone ILIKE ${pattern}
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      patients = await sql`
        SELECT p.id, p.name, p.phone, p.age, p.sex, p.wa_id, p.created_at,
          (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'completed') AS visit_count,
          (SELECT MAX(a.date) FROM appointments a WHERE a.patient_id = p.id) AS last_visit
        FROM patients p
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    }

    return NextResponse.json({ patients: patients || [] });
  } catch (error) {
    logger.error('DASHBOARD_PATIENTS_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
