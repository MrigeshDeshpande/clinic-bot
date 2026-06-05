import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { checkRateLimit, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function GET(req) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const hourAgo = new Date(now);
    hourAgo.setHours(now.getHours() - 1);
    const hourAgoStr = hourAgo.toISOString();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1);
    const nextHourStr = nextHour.toISOString();

    const [todayAppts, newPatients, pendingCallbacks, recentCancellations, upcomingAppts] = await Promise.all([
      sql`
        SELECT COUNT(*)::int AS count
        FROM appointments
        WHERE date = ${today}::date AND status IN ('confirmed', 'completed')
      `.then(r => r[0]?.count || 0),
      sql`
        SELECT COUNT(*)::int AS count
        FROM patients
        WHERE created_at::date = ${today}::date
      `.then(r => r[0]?.count || 0),
      sql`
        SELECT f.id, f.wa_id, f.comment, a.patient_name, f.created_at
        FROM feedback f
        LEFT JOIN appointments a ON f.appointment_id = a.id
        WHERE f.callback = TRUE
        ORDER BY f.created_at DESC
        LIMIT 5
      `,
      sql`
        SELECT a.id, a.patient_name, a.time, a.updated_at
        FROM appointments a
        WHERE a.date = ${today}::date AND a.status = 'cancelled'
        ORDER BY a.updated_at DESC
        LIMIT 5
      `,
      sql`
        SELECT a.id, a.patient_name, a.time, a.treatment
        FROM appointments a
        WHERE a.date = ${today}::date
          AND a.status = 'confirmed'
          AND a.time >= ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
          AND a.time <= ${nextHour.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
        ORDER BY a.time ASC
        LIMIT 5
      `,
    ]);

    return NextResponse.json({
      todayAppointments: todayAppts,
      newPatients,
      pendingCallbacks: sanitizeResponse(pendingCallbacks || []),
      recentCancellations: sanitizeResponse(recentCancellations || []),
      upcomingAppointments: sanitizeResponse(upcomingAppts || []),
    });
  } catch (error) {
    logger.error('NOTIFICATIONS_FETCH_ERROR', { error: error.message });
    return jsonError(error);
  }
}
