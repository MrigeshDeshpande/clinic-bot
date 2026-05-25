import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

const seen = new Set();
const MAX_CACHE_SIZE = 10000;

function trimCache() {
  if (seen.size > MAX_CACHE_SIZE) {
    const entries = [...seen].slice(-5000);
    seen.clear();
    entries.forEach(id => seen.add(id));
  }
}

export async function isDuplicate(msgId) {
  if (!msgId) return false;

  // Layer 1: In-memory fast path
  if (seen.has(msgId)) {
    logger.debug('DEDUP_MEMORY_HIT', { msgId });
    return true;
  }

  // Layer 2: DB — insert a dedup placeholder row; if it conflicts, it's a duplicate
  const sql = getSql();
  if (sql) {
    try {
      const result = await sql`
        INSERT INTO messages (msg_id, wa_id, role, content)
        VALUES (${msgId}, 'system', 'system', 'dedup_check')
        ON CONFLICT (msg_id) DO NOTHING
        RETURNING msg_id
      `;

      if (result.length === 0) {
        // Already existed in DB — duplicate webhook
        logger.info('DEDUP_DB_HIT', { msgId });
        seen.add(msgId);
        trimCache();
        return true;
      }
    } catch (err) {
      logger.warn('DEDUP_DB_ERROR', { msgId, error: err.message });
      // On error, allow through (better to process twice than drop a message)
    }
  }

  seen.add(msgId);
  trimCache();
  return false;
}
