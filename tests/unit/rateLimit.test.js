import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit } from '../../src/lib/rateLimit';

function mockRequest(ip = '127.0.0.1') {
  return {
    headers: new Map(Object.entries({ 'x-forwarded-for': ip })),
    get(name) {
      return this.headers.get(name);
    },
  };
}

describe('rateLimit', () => {
  let limiter;

  beforeEach(() => {
    limiter = rateLimit({ windowMs: 60000, max: 3, keyPrefix: 'test' });
  });

  it('allows requests within the limit', () => {
    const req = mockRequest();
    expect(limiter(req).blocked).toBe(false);
    expect(limiter(req).blocked).toBe(false);
    expect(limiter(req).blocked).toBe(false);
  });

  it('blocks requests exceeding the limit', () => {
    const req = mockRequest('10.0.0.1');
    limiter(req); limiter(req); limiter(req);
    const result = limiter(req);
    expect(result.blocked).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('tracks different IPs independently', () => {
    const req1 = mockRequest('10.0.0.1');
    const req2 = mockRequest('10.0.0.2');
    limiter(req1); limiter(req1); limiter(req1);
    expect(limiter(req1).blocked).toBe(true);
    expect(limiter(req2).blocked).toBe(false);
  });

  it('returns remaining count for non-blocked requests', () => {
    const req = mockRequest('10.0.0.3');
    expect(limiter(req).remaining).toBe(2);
    expect(limiter(req).remaining).toBe(1);
  });
});
