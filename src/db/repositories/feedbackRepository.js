import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

// insertFeedback is a no-op — the feedback table has been replaced by patient_reviews (doctor reviews of patients).
// Patient satisfaction is now captured via the feedback_request template → Google Reviews.
export async function insertFeedback() {
  return null;
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

// markCallbackContacted is a no-op — old feedback table dropped.
export async function markCallbackContacted() {
  return null;
}

// getFeedbackSummary is a no-op — old feedback table dropped.
export async function getFeedbackSummary() {
  return {
    stats: { total: 0, avg_rating: 0, positive: 0, negative: 0, callbacks: 0 },
    recent: [],
    pendingCallbacks: [],
  };
}
