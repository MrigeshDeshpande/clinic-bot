import { NextResponse } from 'next/server';
import { runMigrations } from '@/db/pool';
import { fetchAppointmentsForDueReminder, markDueReminderSent } from '@/db/repositories/appointmentRepository';
import { insertDueReminderLog, fetchDueReminderLogs } from '@/db/repositories/dueReminderRepository';
import { sendTemplate } from '@/lib/whatsapp';
import { CLINIC } from '@/config/clinic';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError } from '@/lib/apiAuth';

export async function GET(req) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    await runMigrations();
    const [logs, queue] = await Promise.all([
      fetchDueReminderLogs(100),
      fetchAppointmentsForDueReminder(),
    ]);
    const queueWithDue = (queue || []).map(a => ({
      id: a.id,
      patientName: a.patient_name,
      waId: a.wa_id,
      date: a.date,
      time: a.time,
      due: Number(a.consultation_fee || 0) + Number(a.treatment_charges || 0) + Number(a.medicine_charges || 0) - Number(a.paid_amount || 0),
    }));
    return NextResponse.json({ logs, queue: queueWithDue });
  } catch (error) {
    logger.error('DUE_REMINDER_LOGS_ERROR', { error: error.message });
    return jsonError(error);
  }
}

export async function POST(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const sizeErr = checkBodySize(req);
  if (sizeErr) return sizeErr;

  try {
    await runMigrations();
    const body = await req.json().catch(() => ({}));
    const appointmentId = body?.appointmentId || null;

    let appointments = await fetchAppointmentsForDueReminder();
    if (appointmentId) {
      appointments = appointments.filter(a => a.id === appointmentId);
    }

    let sent = 0;
    for (const appt of appointments) {
      const total = (appt.consultation_fee || 0) + (appt.treatment_charges || 0) + (appt.medicine_charges || 0);
      const paid = appt.paid_amount || 0;
      const due = total - paid;
      if (due <= 0) continue;

      const firstName = appt.patient_name ? appt.patient_name.split(' ')[0] : 'Patient';

      try {
        const ok = await sendTemplate(appt.wa_id, 'due_reminder', [
          firstName, CLINIC.name, String(due), CLINIC.upiId,
        ]);
        if (ok) {
          await markDueReminderSent(appt.id);
          sent++;
        }
      } catch (err) {
        logger.error('DUE_REMINDER_SEND_ERROR', { apptId: appt.id, waId: appt.wa_id, error: err.message });
      }
    }

    await insertDueReminderLog({
      triggeredBy: 'manual',
      totalAppointments: appointments.length,
      sentCount: sent,
      templateSentCount: sent,
      details: {
        appointments: appointments.map(a => ({
          id: a.id,
          name: a.patient_name,
          due: (a.consultation_fee || 0) + (a.treatment_charges || 0) + (a.medicine_charges || 0) - (a.paid_amount || 0),
        })),
      },
    });

    logger.info('DUE_REMINDERS_MANUAL', { total: appointments.length, sent });
    return NextResponse.json({ total: appointments.length, sent });
  } catch (error) {
    logger.error('DUE_REMINDERS_MANUAL_ERROR', { error: error.message });
    return jsonError(error);
  }
}
