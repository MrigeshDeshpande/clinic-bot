import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function GET(req) {
  try {
    const sql = getSql();

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const [appointments, totalsRaw] = await Promise.all([
      sql`
        SELECT a.id, a.logical_id, a.wa_id, a.patient_name, a.date, a.time, a.treatment,
               a.status, a.arrival_status, a.arrived_at, a.called_at, a.is_priority,
               a.consultation_fee, a.treatment_charges, a.medicine_charges, a.notes,
               a.created_at, a.updated_at
        FROM appointments a
        WHERE a.date = ${date}
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
        WHERE a.date = ${date}
          AND a.status IN ('confirmed', 'completed', 'no_show')
      `,
    ]);

    return NextResponse.json({ appointments: appointments || [], totals: totalsRaw[0] || {} });
  } catch (error) {
    logger.error('DASHBOARD_APPOINTMENTS_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
