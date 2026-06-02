import { fetchTodayAppointments } from '@/db/repositories/appointmentRepository';
import { runMigrations } from '@/db/pool';
import { sendText } from '@/lib/whatsapp';
import { CLINIC } from '@/config/clinic';
import { logger } from '@/lib/logger';
import { CRON_LIMITER } from '@/lib/rateLimit';

export async function GET(req) {
  const rateCheck = CRON_LIMITER(req);
  if (rateCheck.blocked) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET_NOT_SET');
    return Response.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const secret = bearerToken || req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret');
  if (secret !== cronSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await runMigrations();
    const appointments = await fetchTodayAppointments();

    const doctorWaId = CLINIC.doctor?.waId;
    if (!doctorWaId) {
      logger.warn('EVENING_CHECKIN_NO_DOCTOR_WA_ID');
      return Response.json({ sent: false, reason: 'DOCTOR_WA_ID not configured' });
    }

    const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    let body;
    if (appointments.length === 0) {
      body = `🌆 Evening check-in, ${CLINIC.doctor.name}!\n\nNo appointments today (${today}). Enjoy your evening!`;
    } else {
      const lines = appointments
        .map(a => `${a.time}  ${(a.patient_name || 'Patient').padEnd(18)}  ${(a.wa_id || '').slice(-10)}  ${a.treatment || ''}`)
        .join('\n');
      body =
        `🌆 Evening check-in, ${CLINIC.doctor.name}!\n\n` +
        `*Today — ${today}*\nYou had ${appointments.length} appointment${appointments.length !== 1 ? 's' : ''}:\n\n` +
        `\`\`\`\n${lines}\n\`\`\`\n\n` +
        `Reply *missed <time>* if someone didn't show (e.g. *missed 11:30*), or *all good* if everyone came.`;
    }

    await sendText(doctorWaId, body);
    logger.info('EVENING_CHECKIN_SENT', { count: appointments.length });
    return Response.json({ sent: true, count: appointments.length });
  } catch (error) {
    logger.error('EVENING_CHECKIN_ERROR', { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
}
