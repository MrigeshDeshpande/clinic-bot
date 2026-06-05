import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function insertDueReminderLog({ triggeredBy, totalAppointments, sentCount, templateSentCount, details }) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      INSERT INTO due_reminder_log (triggered_by, total_appointments, sent_count, template_sent_count, details)
      VALUES (${triggeredBy || 'manual'}, ${totalAppointments}, ${sentCount}, ${templateSentCount}, ${sql.json(details || {})})
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('DUE_REMINDER_LOG_INSERT_ERROR', { error: error.message });
    return null;
  }
}

export async function fetchDueReminderLogs(limit = 50) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT * FROM due_reminder_log
      ORDER BY triggered_at DESC
      LIMIT ${limit}
    `;
    return rows;
  } catch (error) {
    logger.error('DUE_REMINDER_LOG_FETCH_ERROR', { error: error.message });
    return [];
  }
}
