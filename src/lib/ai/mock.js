import { logger } from '@/lib/logger';

/**
 * @type {Array<{text: string, intent: string, entities: Object}>}
 */
let replayData = [];

export function loadReplayData(data) {
  replayData = Array.isArray(data) ? data : [];
}

export function clearReplayData() {
  replayData = [];
}

export async function classify(request) {
  const text = request.text.toLowerCase().trim();

  for (const entry of replayData) {
    const matchText = (entry.text || '').toLowerCase().trim();
    if (matchText === text) {
      logger.debug('MOCK_MATCH', { text, intent: entry.intent });
      return {
        intent: entry.intent || 'unknown',
        confidence: 1.0,
        entities: entry.entities || {},
        isCorrection: entry.isCorrection || false,
        correctionField: entry.correctionField || null,
        reasoning: 'Replay fixture match',
        source: 'mock',
      };
    }
  }

  throw new Error('MOCK_NO_MATCH');
}
