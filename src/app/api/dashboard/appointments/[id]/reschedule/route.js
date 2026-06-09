import { NextResponse } from 'next/server';
import { getSql, runMigrations } from '@/db/pool';
import { supersedeAppointment } from '@/db/repositories/appointmentRepository';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function POST(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    await runMigrations();
    const sql = getSql();
    const { id } = await params;
    const body = await req.json();
    const { date, time, treatment } = body;

    if (!date || !time) {
      return NextResponse.json({ error: 'date and time are required' }, { status: 400 });
    }

    // Get logical_id from the appointment id
    const rows = await sql`
      SELECT logical_id FROM appointments WHERE id = ${id} LIMIT 1
    `;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    const logicalId = rows[0].logical_id;

    const result = await supersedeAppointment(logicalId, { date, time, treatment: treatment || null });

    if (result?.reason === 'slot_conflict') {
      return NextResponse.json({ error: 'This time slot is already booked' }, { status: 409 });
    }
    if (!result) {
      return NextResponse.json({ error: 'Failed to reschedule appointment' }, { status: 500 });
    }

    logger.info('APPOINTMENT_RESCHEDULED_DASHBOARD', { id, logicalId, date, time, treatment });
    return NextResponse.json({ success: true, appointment: sanitizeResponse(result) });
  } catch (error) {
    logger.error('APPOINTMENT_RESCHEDULE_DASHBOARD_ERROR', { error: error.message });
    return jsonError(error);
  }
}
