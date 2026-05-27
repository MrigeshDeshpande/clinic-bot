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

export function isDuplicate(msgId) {
  if (!msgId) return false;

  if (seen.has(msgId)) {
    logger.debug('DEDUP_MEMORY_HIT', { msgId });
    return true;
  }

  seen.add(msgId);
  trimCache();
  return false;
}
