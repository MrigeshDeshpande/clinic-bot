import { fetchAppointmentsForFollowUpReminder, markFollowUpReminderSent } from '@/db/repositories/appointmentRepository';
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
    const appointments = await fetchAppointmentsForFollowUpReminder();

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    let sent = 0;
    for (const appt of appointments) {
      const firstName = appt.patient_name ? appt.patient_name.split(' ')[0] : 'Patient';
      const isUpcoming = appt.follow_up_date === tomorrow;
      const dateStr = new Date(appt.follow_up_date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long',
      });

      try {
        let body;
        if (isUpcoming) {
          body =
            `👋 Hi ${firstName},\n\n` +
            `This is a friendly reminder that your follow-up visit at *${CLINIC.name}* is scheduled for *tomorrow (${dateStr})*.\n\n` +
            `Please reply *confirm* if you'll be coming, or *reschedule* to pick a new date.`;
        } else {
          const overdueDays = Math.floor((Date.now() - new Date(appt.follow_up_date + 'T00:00:00').getTime()) / 86400000);
          body =
            `👋 Hi ${firstName},\n\n` +
            `Your follow-up visit at *${CLINIC.name}* was due on *${dateStr}* (${overdueDays} day${overdueDays !== 1 ? 's' : ''} ago).\n\n` +
            `Please book your follow-up at your earliest convenience. Reply *book* to schedule.`;
        }

        await sendText(appt.wa_id, body);
        await markFollowUpReminderSent(appt.id);
        sent++;
      } catch (err) {
        logger.error('FOLLOW_UP_REMINDER_SEND_ERROR', { apptId: appt.id, waId: appt.wa_id, error: err.message });
      }
    }

    logger.info('FOLLOW_UP_REMINDERS_SENT', { total: appointments.length, sent });
    return Response.json({ total: appointments.length, sent });
  } catch (error) {
    logger.error('FOLLOW_UP_REMINDERS_ERROR', { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
}
