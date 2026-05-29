import { fetchAppointmentsForReminder, markReminderSent } from '@/db/repositories/appointmentRepository';
import { runMigrations } from '@/db/pool';
import { sendText } from '@/lib/whatsapp';
import { CLINIC } from '@/config/clinic';
import { logger } from '@/lib/logger';

export async function GET(req) {
  const secret = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await runMigrations();
    const appointments = await fetchAppointmentsForReminder();

    let sent = 0;
    for (const appt of appointments) {
      const name = appt.patient_name ? `Hi ${appt.patient_name.split(' ')[0]}! 👋` : 'Hi! 👋';
      const date = new Date(appt.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
      const time = new Date(`2000-01-01T${appt.time}`).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      const doctor = CLINIC.doctor?.name ? ` with Dr. ${CLINIC.doctor.name}` : '';

      const body =
        `${name} Just a reminder:\n\n` +
        `📅 Tomorrow — ${date} at ${time}\n` +
        `🦷 ${appt.treatment || 'Appointment'}${doctor}\n` +
        `📍 ${CLINIC.name}, Bhilai\n\n` +
        `Reply *confirm* to keep it or *cancel* to cancel.`;

      try {
        await sendText(appt.wa_id, body);
        await markReminderSent(appt.id);
        sent++;
      } catch (err) {
        logger.error('REMINDER_SEND_ERROR', { apptId: appt.id, waId: appt.wa_id, error: err.message });
      }
    }

    logger.info('REMINDERS_SENT', { total: appointments.length, sent });
    return Response.json({ total: appointments.length, sent });
  } catch (error) {
    logger.error('REMINDERS_ERROR', { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
}
