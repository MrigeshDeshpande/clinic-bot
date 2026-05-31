import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function insertFeedback({ appointmentId, waId, rating, comment = '', callback = false }) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      INSERT INTO feedback (appointment_id, wa_id, rating, comment, callback)
      VALUES (${appointmentId}, ${waId}, ${rating}, ${comment}, ${callback})
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('FEEDBACK_INSERT_ERROR', { appointmentId, waId, rating, error: error.message });
    return null;
  }
}

export async function fetchCompletedAppointmentsForFeedback() {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT a.id, a.wa_id, a.patient_name, a.date, a.time, a.treatment, a.updated_at
      FROM appointments a
      WHERE a.status = 'completed'
        AND a.feedback_sent_at IS NULL
        AND a.wa_id IS NOT NULL
        AND a.updated_at <= NOW() - INTERVAL '24 hours'
      ORDER BY a.updated_at ASC
    `;
    return rows;
  } catch (error) {
    logger.error('FEEDBACK_FETCH_COMPLETED_ERROR', { error: error.message });
    return [];
  }
}

export async function markFeedbackSent(appointmentId) {
  const sql = getSql();
  if (!sql) return;

  try {
    await sql`
      UPDATE appointments
      SET feedback_sent_at = NOW()
      WHERE id = ${appointmentId}
    `;
  } catch (error) {
    logger.error('FEEDBACK_MARK_SENT_ERROR', { appointmentId, error: error.message });
  }
}
