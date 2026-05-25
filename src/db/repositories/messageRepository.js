import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function createMessage({ msgId, sessionId, waId, role, content, intent, metadata }) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      INSERT INTO messages (msg_id, session_id, wa_id, role, content, intent, metadata)
      VALUES (${msgId || null}, ${sessionId || null}, ${waId},
              ${role}, ${content || null}, ${intent || null},
              ${metadata ? JSON.stringify(metadata) : '{}'})
      ON CONFLICT (msg_id) DO UPDATE SET
        session_id = EXCLUDED.session_id,
        wa_id = EXCLUDED.wa_id,
        role = EXCLUDED.role,
        content = EXCLUDED.content,
        intent = EXCLUDED.intent,
        metadata = EXCLUDED.metadata
      RETURNING id
    `;
    return rows[0]?.id || null;
  } catch (error) {
    logger.error('MESSAGE_CREATE_ERROR', { waId, role, error: error.message });
    return null;
  }
}

export async function findMessageByMsgId(msgId) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      SELECT id FROM messages WHERE msg_id = ${msgId}
    `;
    return rows[0] || null;
  } catch (error) {
    logger.warn('MESSAGE_FIND_ERROR', { msgId, error: error.message });
    return null;
  }
}
