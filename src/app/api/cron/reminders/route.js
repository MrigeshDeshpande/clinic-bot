import { fetchAppointmentsForReminder, markReminderSent } from '@/db/repositories/appointmentRepository';
import { sendTemplate, sendText } from '@/lib/whatsapp';
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
    const appointments = await fetchAppointmentsForReminder();

    let sent = 0;
    let templateSent = 0;
    for (const appt of appointments) {
      const firstName = appt.patient_name ? appt.patient_name.split(' ')[0] : 'Patient';
      const [y, m, d] = appt.date.slice(0, 10).split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const date = dateObj.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
      const time = new Date(`2000-01-01T${appt.time}`).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      const doctor = CLINIC.doctor?.name ? ` with Dr. ${CLINIC.doctor.name}` : '';

      try {
        const templateOk = await sendTemplate(appt.wa_id, 'appointment_reminder', [
          firstName, date, time, appt.treatment || 'Appointment', CLINIC.name, 'Bhilai',
        ]);
        if (templateOk) {
          templateSent++;
        } else {
          // Fallback to text (works within 24h window; noop outside it)
          const body =
            `${firstName} Just a reminder:\n\n` +
            `📅 Tomorrow — ${date} at ${time}\n` +
            `🦷 ${appt.treatment || 'Appointment'}${doctor}\n` +
            `📍 ${CLINIC.name}, Bhilai\n\n` +
            `Reply *confirm* to keep it or *cancel* to cancel.`;
          await sendText(appt.wa_id, body);
        }
        await markReminderSent(appt.id);
        sent++;
      } catch (err) {
        logger.error('REMINDER_SEND_ERROR', { apptId: appt.id, waId: appt.wa_id, error: err.message });
      }
    }

    if (templateSent > 0) {
      logger.info('REMINDER_TEMPLATES_SENT', { count: templateSent });
    }

    logger.info('REMINDERS_SENT', { total: appointments.length, sent });
    return Response.json({ total: appointments.length, sent });
  } catch (error) {
    logger.error('REMINDERS_ERROR', { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
}
