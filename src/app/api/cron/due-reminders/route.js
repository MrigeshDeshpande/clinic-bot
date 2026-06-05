import { runMigrations } from '@/db/pool';
import { fetchAppointmentsForDueReminder, markDueReminderSent } from '@/db/repositories/appointmentRepository';
import { insertDueReminderLog } from '@/db/repositories/dueReminderRepository';
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
    await runMigrations();
    const appointments = await fetchAppointmentsForDueReminder();

    let sent = 0;
    let templateSent = 0;
    for (const appt of appointments) {
      const total = (appt.consultation_fee || 0) + (appt.treatment_charges || 0) + (appt.medicine_charges || 0);
      const paid = appt.paid_amount || 0;
      const due = total - paid;
      if (due <= 0) continue;

      const firstName = appt.patient_name ? appt.patient_name.split(' ')[0] : 'Patient';

      try {
        const templateOk = await sendTemplate(appt.wa_id, 'due_reminder', [
          firstName, CLINIC.name, String(due), CLINIC.upiId,
        ]);
        if (templateOk) {
          templateSent++;
        } else {
          const body =
            `Hi ${firstName},\n\n` +
            `This is a reminder regarding your visit to ${CLINIC.name}.\n\n` +
            `💰 *Outstanding Amount: ₹${due}*\n\n` +
            `Please clear the pending dues at your earliest convenience.\n\n` +
            `Pay via UPI: *${CLINIC.upiId}*\n\n` +
            `Thank you!`;
          await sendText(appt.wa_id, body);
        }
        await markDueReminderSent(appt.id);
        sent++;
      } catch (err) {
        logger.error('DUE_REMINDER_SEND_ERROR', { apptId: appt.id, waId: appt.wa_id, error: err.message });
      }
    }

    if (templateSent > 0) {
      logger.info('DUE_REMINDER_TEMPLATES_SENT', { count: templateSent });
    }

    await insertDueReminderLog({
      triggeredBy: 'cron',
      totalAppointments: appointments.length,
      sentCount: sent,
      templateSentCount: templateSent,
      details: {
        appointments: appointments.map(a => ({
          id: a.id,
          name: a.patient_name,
          due: (a.consultation_fee || 0) + (a.treatment_charges || 0) + (a.medicine_charges || 0) - (a.paid_amount || 0),
        })),
      },
    });

    logger.info('DUE_REMINDERS_SENT', { total: appointments.length, sent });
    return Response.json({ total: appointments.length, sent });
  } catch (error) {
    logger.error('DUE_REMINDERS_ERROR', { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
}
