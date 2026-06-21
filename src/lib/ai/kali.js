import { logger } from '@/lib/logger';

const KALI_AI_URL = process.env.KALI_AI_URL;
const TIMEOUT_MS = 3000;

export async function understand(input) {
  if (!KALI_AI_URL) {
    throw new Error('KALI_AI_URL not configured');
  }

  const startTime = Date.now();

  const response = await Promise.race([
    fetch(`${KALI_AI_URL}/understand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('KALI_TIMEOUT')), TIMEOUT_MS)
    ),
  ]);

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    throw new Error(`Kali error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const processingMs = Date.now() - startTime;

  logger.info('KALI_RESPONSE', {
    intent: data.intent,
    language: data.language,
    provider: data.provider,
    processingMs,
    message: input.message?.slice(0, 50),
  });

  return {
    intent: data.intent || 'unknown',
    entities: data.entities || {},
    language: data.language || 'unknown',
    provider: data.provider || 'kali',
    processingMs,
  };
}
