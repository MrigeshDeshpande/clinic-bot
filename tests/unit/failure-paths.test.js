import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

function makeContext() {
  return {
    normalized: {
      waId: 'test_wa_id',
      // "hi" matches global greeting intent — reliable across states
      textClean: 'hi',
      textLower: 'hi',
      textTrimmed: 'hi',
      text: 'hi',
      type: 'text',
      interactiveId: null,
      msgId: `test_msg_${Date.now()}`,
      timestamp: Date.now(),
      hasMedia: false,
    },
    session: {
      state: 'IDLE',
      context: { booking: {}, lastMessageIds: [], messageSequence: 0 },
    },
  };
}

describe('Gemini failure paths', () => {
  beforeAll(() => {
    process.env.SHADOW_MODE = 'true';
    process.env.NODE_ENV = 'production';
    process.env.GEMINI_API_KEY = 'test-key-for-failure-testing';
  });

  afterAll(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.GEMINI_API_KEY;
    delete process.env.SHADOW_MODE;
  });

  it('1. Invalid API key — falls back to router', async () => {
    process.env.GEMINI_API_KEY = 'invalid-key-that-will-403';

    const { classifyWithFallback } = await import('@/lib/ai/index');
    const { normalized, session } = makeContext();
    const result = await classifyWithFallback(normalized, session);

    expect(result.source).toBe('rule_fallback');
    expect(result.intent).toBe('greeting');
  });

  it('2. Timeout — falls back to router', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ai/gemini', () => ({
      classify: async () => {
        await new Promise(r => setTimeout(r, 5000));
        return { intent: 'unknown', confidence: 0 };
      },
    }));

    const { classifyWithFallback } = await import('@/lib/ai/index');
    const { normalized, session } = makeContext();
    const result = await classifyWithFallback(normalized, session);

    expect(result.source).toBe('rule_fallback');
    expect(result.intent).toBe('greeting');
  });

  it('3. Malformed JSON (non-JSON text) — falls back to router', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ai/gemini', () => ({
      classify: async () => {
        throw new Error('Failed to parse Gemini response');
      },
    }));

    const { classifyWithFallback } = await import('@/lib/ai/index');
    const { normalized, session } = makeContext();
    const result = await classifyWithFallback(normalized, session);

    expect(result.source).toBe('rule_fallback');
    expect(result.intent).toBe('greeting');
  });

  it('4. Empty JSON object — falls back to router', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ai/gemini', () => ({
      classify: async () => {
        throw new Error('Failed to parse Gemini response');
      },
    }));

    const { classifyWithFallback } = await import('@/lib/ai/index');
    const { normalized, session } = makeContext();
    const result = await classifyWithFallback(normalized, session);

    expect(result.source).toBe('rule_fallback');
    expect(result.intent).toBe('greeting');
  });

  it('5. 429 rate limit — falls back to router', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ai/gemini', () => ({
      classify: async () => {
        throw new Error('Gemini API error: 429');
      },
    }));

    const { classifyWithFallback } = await import('@/lib/ai/index');
    const { normalized, session } = makeContext();
    const result = await classifyWithFallback(normalized, session);

    expect(result.source).toBe('rule_fallback');
    expect(result.intent).toBe('greeting');
  });
});
