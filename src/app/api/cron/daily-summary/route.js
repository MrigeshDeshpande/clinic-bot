import { fetchTodayAppointments } from '@/db/repositories/appointmentRepository';
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
    const appointments = await fetchTodayAppointments();

    const doctorWaId = CLINIC.doctor?.waId;
    if (!doctorWaId) {
      logger.warn('DAILY_SUMMARY_NO_DOCTOR_WA_ID');
      return Response.json({ sent: false, reason: 'DOCTOR_WA_ID not configured' });
    }

    const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    let body;
    if (appointments.length === 0) {
      body = `☀️ Good morning, ${CLINIC.doctor.name}!\n\nNo appointments today (${today}).`;
    } else {
      const lines = appointments
        .map(a => `${a.time}  ${(a.patient_name || 'Patient').padEnd(18)}  ${a.treatment || ''}`)
        .join('\n');
      body = `☀️ Good morning, ${CLINIC.doctor.name}!\n\n*Today — ${today}*\n\`\`\`\n${lines}\n\`\`\`\nTotal: ${appointments.length} appointment${appointments.length !== 1 ? 's' : ''}`;
    }

    await sendText(doctorWaId, body);
    logger.info('DAILY_SUMMARY_SENT', { count: appointments.length });
    return Response.json({ sent: true, count: appointments.length });
  } catch (error) {
    logger.error('DAILY_SUMMARY_ERROR', { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
}
