import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateEnv } from '../../src/lib/envValidate';

describe('envValidate', () => {
  const originalEnv = { ...process.env };

  afterAll(() => {
    process.env = originalEnv;
  });

  it('passes when all required vars are set', () => {
    process.env.DASHBOARD_PASSWORD = 'test';
    process.env.WHATSAPP_ACCESS_TOKEN = 'test';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'test';
    process.env.WHATSAPP_VERIFY_TOKEN = 'test';
    process.env.DATABASE_URL = 'test';
    process.env.CRON_SECRET = 'test';
    expect(() => validateEnv()).not.toThrow();
  });

  it('throws when required vars are missing', () => {
    delete process.env.DASHBOARD_PASSWORD;
    delete process.env.CRON_SECRET;
    expect(() => validateEnv()).toThrow(/DASHBOARD_PASSWORD/);
    expect(() => validateEnv()).toThrow(/CRON_SECRET/);
  });
});
