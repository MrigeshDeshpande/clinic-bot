import { describe, it, expect } from 'vitest';

function makeContext() {
  return {
    normalized: {
      waId: 'test_wa_id',
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

describe('AI failure paths — rule fallback', () => {
  it('falls back to rule classifier when Kali is not configured', async () => {
    const { classifyWithFallback } = await import('@/lib/ai/index');
    const { normalized, session } = makeContext();
    const result = await classifyWithFallback(normalized, session);

    expect(result.source).toBe('rule_fallback');
    expect(result.intent).toBe('greeting');
  });
});
