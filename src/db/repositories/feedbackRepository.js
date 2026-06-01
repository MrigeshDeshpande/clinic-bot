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

export async function getFeedbackSummary() {
  const sql = getSql();
  if (!sql) return null;

  try {
    const [stats, recent, callbackRows] = await Promise.all([
      sql`
        SELECT
          COUNT(*)::int AS total,
          ROUND(AVG(rating)::numeric, 1)::float AS avg_rating,
          COUNT(*) FILTER (WHERE rating >= 4)::int AS positive,
          COUNT(*) FILTER (WHERE rating <= 2)::int AS negative,
          COUNT(*) FILTER (WHERE callback = true)::int AS callbacks
        FROM feedback
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `,
      sql`
        SELECT f.id, f.rating, f.comment, f.created_at,
               a.patient_name, a.patient_phone
        FROM feedback f
        LEFT JOIN appointments a ON f.appointment_id = a.id
        ORDER BY f.created_at DESC
        LIMIT 5
      `,
      sql`
        SELECT f.id, f.rating, f.comment, f.wa_id, f.created_at,
               a.patient_name, a.patient_phone
        FROM feedback f
        LEFT JOIN appointments a ON f.appointment_id = a.id
        WHERE f.callback = true
        ORDER BY f.created_at DESC
        LIMIT 10
      `,
    ]);

    return {
      stats: stats[0] || { total: 0, avg_rating: 0, positive: 0, negative: 0, callbacks: 0 },
      recent,
      pendingCallbacks: callbackRows,
    };
  } catch (error) {
    logger.error('FEEDBACK_SUMMARY_ERROR', { error: error.message });
    return null;
  }
}
