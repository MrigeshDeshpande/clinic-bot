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

export async function createMessages(messages) {
  if (!messages || messages.length === 0) return;
  const sql = getSql();
  if (!sql) return;

  const cols = ['msg_id', 'session_id', 'wa_id', 'role', 'content', 'intent', 'metadata'];
  const perRow = cols.length;
  const placeholders = messages.map((_, i) =>
    `(${cols.map((_, j) => `$${i * perRow + j + 1}`).join(', ')})`
  ).join(', ');
  const params = messages.flatMap(m => [
    m.msgId || null,
    m.sessionId || null,
    m.waId,
    m.role,
    m.content || null,
    m.intent || null,
    m.metadata ? JSON.stringify(m.metadata) : '{}',
  ]);

  try {
    await sql.unsafe(`
      INSERT INTO messages (msg_id, session_id, wa_id, role, content, intent, metadata)
      VALUES ${placeholders}
      ON CONFLICT (msg_id) DO UPDATE SET
        session_id = EXCLUDED.session_id,
        wa_id = EXCLUDED.wa_id,
        role = EXCLUDED.role,
        content = EXCLUDED.content,
        intent = EXCLUDED.intent,
        metadata = EXCLUDED.metadata
    `, params);
  } catch (error) {
    logger.error('MESSAGES_BATCH_CREATE_ERROR', { count: messages.length, error: error.message });
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
