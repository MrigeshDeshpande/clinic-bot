import { describe, it, expect, beforeAll } from 'vitest';
import { sign, verify, generateCsrfToken, csrfCookieName } from '../../src/lib/auth';

beforeAll(() => {
  process.env.DASHBOARD_PASSWORD = 'test-password-123';
});

describe('auth', () => {
  it('signs and verifies a valid token', async () => {
    const token = await sign({ role: 'admin' });
    expect(token).toBeTruthy();
    expect(token.split('.').length).toBe(3);

    const payload = await verify(token);
    expect(payload).toBeTruthy();
    expect(payload.role).toBe('admin');
    expect(payload.iss).toBe('clinic-bot');
    expect(payload.iat).toBeTypeOf('number');
    expect(payload.exp).toBeTypeOf('number');
  });

  it('rejects a tampered token', async () => {
    const token = await sign({ role: 'admin' });
    const parts = token.split('.');
    const tampered = [parts[0], 'eyJyb2xlIjoiYXR0YWNrZXIifQ', parts[2]].join('.');
    expect(await verify(tampered)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      Buffer.from(JSON.stringify({ role: 'admin', exp: 0 })).toString('base64url').replace(/=/g, ''),
      'dummy',
    ].join('.');
    expect(await verify(token)).toBeNull();
  });

  it('rejects malformed tokens', async () => {
    expect(await verify('')).toBeNull();
    expect(await verify('not-a-token')).toBeNull();
    expect(await verify('a.b')).toBeNull();
    expect(await verify('a.b.c.d')).toBeNull();
  });

  it('rejects tokens with invalid signature', async () => {
    const token = 'header.payload.invalidsignature';
    expect(await verify(token)).toBeNull();
  });
});

describe('csrfCookieName', () => {
  it('returns the CSRF cookie name', () => {
    expect(csrfCookieName()).toBe('csrf_token');
  });
});

describe('generateCsrfToken', () => {
  it('generates a 64-character hex token', () => {
    const token = generateCsrfToken();
    expect(token).toBeTruthy();
    expect(token.length).toBe(64);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it('generates unique tokens each time', () => {
    const t1 = generateCsrfToken();
    const t2 = generateCsrfToken();
    expect(t1).not.toBe(t2);
  });
});
