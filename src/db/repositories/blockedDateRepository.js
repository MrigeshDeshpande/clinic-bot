import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function fetchBlockedDates() {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT * FROM blocked_dates ORDER BY date ASC
    `;
    return rows;
  } catch (error) {
    logger.error('BLOCKED_DATES_FETCH_ERROR', { error: error.message });
    return [];
  }
}

export async function blockDate(date, reason) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      INSERT INTO blocked_dates (date, reason)
      VALUES (${date}, ${reason || null})
      ON CONFLICT (date) DO NOTHING
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('BLOCKED_DATE_INSERT_ERROR', { date, error: error.message });
    return null;
  }
}

export async function unblockDate(date) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      DELETE FROM blocked_dates WHERE date = ${date}
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('BLOCKED_DATE_DELETE_ERROR', { date, error: error.message });
    return null;
  }
}

export async function isDateBlocked(date) {
  const sql = getSql();
  if (!sql) return false;

  try {
    const rows = await sql`
      SELECT 1 FROM blocked_dates WHERE date = ${date} LIMIT 1
    `;
    return rows.length > 0;
  } catch (error) {
    logger.error('BLOCKED_DATE_CHECK_ERROR', { date, error: error.message });
    return false;
  }
}
