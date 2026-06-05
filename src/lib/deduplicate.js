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

  // Fast path: in-memory cache
  if (seen.has(msgId)) {
    logger.debug('DEDUP_MEMORY_HIT', { msgId });
    return true;
  }

  // Slow path: cross-instance check via DB (messages table has UNIQUE on msg_id)
  try {
    const sql = getSql();
    if (sql) {
      const rows = await sql`
        SELECT 1 FROM messages WHERE msg_id = ${msgId} LIMIT 1
      `;
      if (rows && rows.length > 0) {
        seen.add(msgId);
        trimCache();
        logger.debug('DEDUP_DB_HIT', { msgId });
        return true;
      }
    }
  } catch (e) {
    logger.warn('DEDUP_DB_CHECK_FAILED', { msgId, error: e.message });
  }

  seen.add(msgId);
  trimCache();
  return false;
}
