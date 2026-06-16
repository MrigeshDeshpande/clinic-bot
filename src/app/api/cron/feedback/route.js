import { runMigrations } from '@/db/pool';
import { fetchCompletedAppointmentsForFeedback, markFeedbackSent } from '@/db/repositories/feedbackRepository';
import { sendTemplate } from '@/lib/whatsapp';
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
    const appointments = await fetchCompletedAppointmentsForFeedback();

    let sent = 0;
    for (const appt of appointments) {
      const name = appt.patient_name ? appt.patient_name.split(' ')[0] : 'Patient';

      try {
        const ok = await sendTemplate(appt.wa_id, 'feedback_request', [
          name, CLINIC.name,
        ]);
        if (ok) {
          await markFeedbackSent(appt.id);
          sent++;
        }
      } catch (err) {
        logger.error('FEEDBACK_SEND_ERROR', { apptId: appt.id, waId: appt.wa_id, error: err.message });
      }
    }

    logger.info('FEEDBACK_SENT', { total: appointments.length, sent });
    return Response.json({ total: appointments.length, sent });
  } catch (error) {
    logger.error('FEEDBACK_CRON_ERROR', { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
}
