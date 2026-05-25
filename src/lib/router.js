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
  'my_appts': 'my_appointments',
  'book_another': 'appointment',
  'cancel_appt': 'cancel_appointment',
  'resched': 'reschedule',
  'confirm_cancel_yes': 'confirm_cancel',
  'confirm_cancel_no': 'back',
};

function resolveDateId(id) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (id === 'date_today') return new Date(today);
  if (id === 'date_tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (id === 'date_next_mon') {
    // Next Monday from today — if today is Monday, returns 7 days out
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    return d;
  }

  const match = id.match(/^date_(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
  }

  return null;
}

export function classifyIntent(normalized, session) {
  // Priority 0: Interactive ID match — deterministic, always wins
  if (normalized.interactiveId) {
    const id = normalized.interactiveId;

    // Handle date_* IDs — resolve date and return as entity
    if (id.startsWith('date_')) {
      if (id === 'date_other') {
        return { intent: 'date_custom', confidence: 1.0, source: 'interactive_id' };
      }
      const date = resolveDateId(id);
      if (date) {
        return { intent: 'provide_date', confidence: 1.0, source: 'interactive_id', entities: { date } };
      }
    }

    // Standard intent mapping
    if (ID_TO_INTENT[id]) {
      return { intent: ID_TO_INTENT[id], confidence: 1.0, source: 'interactive_id' };
    }
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
