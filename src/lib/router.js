import { GLOBAL_INTENTS, STATE_INTENTS } from '@/config/intents';
import { CLINIC } from '@/config/clinic';
import { extractEntities } from '@/lib/entities';

function matchKeywords(text, keywords) {
  for (const kw of keywords) {
    if (kw.includes(' ')) {
      // Multi-word: phrase match
      if (text.includes(kw)) return true;
    } else {
      // Single word: word boundary match
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(text)) return true;
    }
  }
  return false;
}

const ID_TO_INTENT = {
  'apt': 'appointment',
  'svc': 'services',
  'loc': 'location',
  'tim': 'timings',
  'confirm': 'confirm',
  'edit_date': 'edit_date',
  'edit_time': 'edit_time',
  'cancel': 'cancel',
  'time_other': 'time_custom',
};

export function classifyIntent(normalized, session) {
  // Priority 0: Interactive ID match — deterministic, always wins
  if (normalized.interactiveId && ID_TO_INTENT[normalized.interactiveId]) {
    return { intent: ID_TO_INTENT[normalized.interactiveId], confidence: 1.0, source: 'interactive_id' };
  }

  const text = normalized.textLower;

  // Priority 1: Global intents — emergency first
  for (const [intent, keywords] of Object.entries(GLOBAL_INTENTS)) {
    if (matchKeywords(text, keywords)) {
      return { intent, confidence: 1.0, source: 'global' };
    }
  }

  // Priority 2: State-specific intents
  const state = session.state;
  const stateIntents = STATE_INTENTS[state];
  if (stateIntents) {
    for (const [intent, keywords] of Object.entries(stateIntents)) {
      if (matchKeywords(text, keywords)) {
        return { intent, confidence: 1.0, source: 'state' };
      }
    }
  }

  // Priority 3: Entity-derived intents (state-guarded)
  const entities = extractEntities(text);
  if (entities.date && ['BOOKING_DATE', 'IDLE', 'MAIN_MENU'].includes(session.state)) {
    return { intent: 'provide_date', confidence: 0.9, source: 'entity' };
  }
  if (entities.time && session.state === 'BOOKING_TIME') {
    return { intent: 'provide_time', confidence: 0.9, source: 'entity' };
  }
  if (entities.treatment && session.state === 'BOOKING_TREATMENT') {
    return { intent: 'provide_treatment', confidence: 0.9, source: 'entity' };
  }
  if (entities.phone && session.state === 'CALLBACK_REQUESTED') {
    return { intent: 'provide_phone', confidence: 0.9, source: 'entity' };
  }

  // Priority 4: For BOOKING_TREATMENT state, check if it's a number
  if (state === 'BOOKING_TREATMENT') {
    const num = text.trim().match(/^(\d+)$/);
    if (num) {
      const idx = parseInt(num[1], 10) - 1;
      if (CLINIC.treatments[idx]) {
        return { intent: 'provide_treatment', confidence: 0.9, source: 'number_match' };
      }
    }
  }

  // Fallback
  return { intent: 'unknown', confidence: 0, source: 'fallback' };
}
