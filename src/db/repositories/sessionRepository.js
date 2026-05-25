import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function findSessionByWaId(waId) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      SELECT * FROM sessions WHERE wa_id = ${waId}
    `;
    const row = rows[0] || null;
    if (row) {
      logger.info('SESSION_LOADED', {
        waId,
        state: row.state,
        expiresAt: row.expires_at,
        now: new Date(),
      });
    }
    return row;
  } catch (error) {
    logger.error('SESSION_FIND_ERROR', { waId, error: error.message });
    return null;
  }
}

export async function upsertSession({ waId, phoneNumberId, profileName }) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      INSERT INTO sessions (wa_id, phone_number_id, profile_name)
      VALUES (${waId}, ${phoneNumberId || null}, ${profileName || null})
      ON CONFLICT (wa_id) DO UPDATE
        SET phone_number_id = EXCLUDED.phone_number_id,
            profile_name = EXCLUDED.profile_name
      RETURNING *
    `;
    return rows[0];
  } catch (error) {
    logger.error('SESSION_UPSERT_ERROR', { waId, error: error.message });
    return null;
  }
}

export async function saveSession(session) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      UPDATE sessions SET
        state = ${session.state},
        previous_state = ${session.previousState},
        context = ${JSON.stringify(session.context)},
        metrics = ${JSON.stringify(session.metrics)},
        profile_name = ${session.profileName},
        is_escalated = ${session.isEscalated},
        last_activity_at = NOW(),
        expires_at = NOW() + INTERVAL '30 minutes',
        version = version + 1
      WHERE wa_id = ${session.waId}
      RETURNING *
    `;

    if (rows.length === 0) {
      logger.warn('SESSION_SAVE_NO_ROWS', { waId: session.waId });
      return null;
    }

    logger.info('SESSION_SAVED', {
      waId: session.waId,
      state: session.state,
      rowsAffected: rows.length,
    });

    return rows[0];
  } catch (error) {
    logger.error('SESSION_SAVE_ERROR', { sessionId: session.id, waId: session.waId, error: error.message });
    return null;
  }
}
