import { NextResponse } from 'next/server';
import { cancelAppointment } from '@/db/repositories/appointmentRepository';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, jsonError } from '@/lib/apiAuth';

export async function POST(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const { id } = await params;
    const body = await req.json();
    const reason = body.reason || 'Cancelled from dashboard';

    const result = await cancelAppointment(id, reason);
    if (!result) {
      return NextResponse.json({ error: 'Appointment not found or cannot be cancelled' }, { status: 400 });
    }

    logger.info('APPOINTMENT_CANCELLED_DASHBOARD', { id, reason });
    return NextResponse.json({ success: true, appointment: result });
  } catch (error) {
    logger.error('APPOINTMENT_CANCEL_DASHBOARD_ERROR', { error: error.message });
    return jsonError(error);
  }
}
