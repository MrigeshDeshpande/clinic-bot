const store = new Map();

export function rateLimit({ windowMs = 60000, max = 30, keyPrefix = 'default' } = {}) {
  return (req) => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now - entry.resetTime > windowMs) {
      entry = { count: 0, resetTime: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    if (entry.count > max) {
      return {
        blocked: true,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        remaining: 0,
      };
    }

    return {
      blocked: false,
      remaining: max - entry.count,
      retryAfter: 0,
    };
  };
}

const WEBHOOK_LIMITER = rateLimit({ windowMs: 60000, max: 60, keyPrefix: 'webhook' });
const DASHBOARD_API_LIMITER = rateLimit({ windowMs: 60000, max: 120, keyPrefix: 'dashboard-api' });
const LOGIN_LIMITER = rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'login' });
const CRON_LIMITER = rateLimit({ windowMs: 60000, max: 20, keyPrefix: 'cron' });

export { WEBHOOK_LIMITER, DASHBOARD_API_LIMITER, LOGIN_LIMITER, CRON_LIMITER };
