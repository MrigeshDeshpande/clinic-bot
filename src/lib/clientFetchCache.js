function getCache() {
  if (typeof window !== 'undefined') {
    if (!window.__appDataCache) window.__appDataCache = new Map();
    return window.__appDataCache;
  }
  return new Map();
}

function getInflight() {
  if (typeof window !== 'undefined') {
    if (!window.__appInflight) window.__appInflight = new Map();
    return window.__appInflight;
  }
  return new Map();
}

const DEFAULT_TTL = 60_000;

function cacheKey(url, options) {
  if (options?.method && options.method !== 'GET') return null;
  return url;
}

export function fetchCached(url, options, ttl = DEFAULT_TTL) {
  const key = cacheKey(url, options);
  if (!key) return fetch(url, options).then(r => r.json());

  const cache = getCache();
  const inflight = getInflight();

  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return Promise.resolve(cached.data);
  }

  if (inflight.has(key)) return inflight.get(key);

  const promise = fetch(url, options)
    .then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed');
      cache.set(key, { data, expiry: Date.now() + ttl });
      return data;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

export function invalidateFetchCache(pattern) {
  const cache = getCache();
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}
