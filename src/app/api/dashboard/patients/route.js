import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { checkRateLimit, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function GET(req) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    let patients;
    if (q.length >= 2) {
      const pattern = `%${q}%`;
      patients = await sql`
        SELECT p.id, p.name, p.phone, p.age, p.sex, p.wa_id, p.created_at,
          COALESCE(ac.visit_count, 0)::int AS visit_count,
          ac.last_visit,
          lv.time AS last_visit_time
        FROM patients p
        LEFT JOIN (
          SELECT patient_id,
            COUNT(*) FILTER (WHERE status = 'completed') AS visit_count,
            MAX(date) AS last_visit
          FROM appointments
          GROUP BY patient_id
        ) ac ON ac.patient_id = p.id
        LEFT JOIN LATERAL (
          SELECT time FROM appointments
          WHERE patient_id = p.id AND date = ac.last_visit AND status = 'completed'
          LIMIT 1
        ) lv ON true
        WHERE p.name ILIKE ${pattern} OR p.phone ILIKE ${pattern}
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      patients = await sql`
        SELECT p.id, p.name, p.phone, p.age, p.sex, p.wa_id, p.created_at,
          COALESCE(ac.visit_count, 0)::int AS visit_count,
          ac.last_visit,
          lv.time AS last_visit_time
        FROM patients p
        LEFT JOIN (
          SELECT patient_id,
            COUNT(*) FILTER (WHERE status = 'completed') AS visit_count,
            MAX(date) AS last_visit
          FROM appointments
          GROUP BY patient_id
        ) ac ON ac.patient_id = p.id
        LEFT JOIN LATERAL (
          SELECT time FROM appointments
          WHERE patient_id = p.id AND date = ac.last_visit AND status = 'completed'
          LIMIT 1
        ) lv ON true
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    }

    return NextResponse.json({ patients: sanitizeResponse(patients || []) });
  } catch (error) {
    logger.error('DASHBOARD_PATIENTS_ERROR', { error: error.message });
    return jsonError(error);
  }
}
