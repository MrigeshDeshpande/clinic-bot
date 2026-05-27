import { GLOBAL_INTENTS, STATE_INTENTS, CORRECTION_INTENTS } from '@/config/intents';
import { CLINIC } from '@/config/clinic';
import { extractEntities } from '@/lib/entities';
import { detectCorrection } from '@/lib/correction-detector';

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
  'back': 'back',
  'main_menu': 'main_menu',
  'treatment_help': 'treatment_help',
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

    // Treatment/symptom selection via interactive list — ID is the treatment id
    const treatment = CLINIC.treatments.find(t => t.id === id);
    if (treatment) {
      return { intent: 'provide_treatment', confidence: 1.0, source: 'interactive_id', entities: { treatment: treatment.name } };
    }
  }

  const text = normalized.textLower;

  // Priority 1: Global intents — emergency first
  for (const [intent, keywords] of Object.entries(GLOBAL_INTENTS)) {
    if (matchKeywords(text, keywords)) {
      return { intent, confidence: 1.0, source: 'global' };
    }
  }

  // Priority 1b: Correction intent detection (before state-specific, after global)
  // Only check corrections if session has booking state context
  const bookingStates = ['BOOKING_COLLECTION', 'BOOKING_CONFIRMATION', 'BOOKED'];
  if (bookingStates.includes(session.state)) {
    const entitiesForCorrection = extractEntities(text);
    const correction = detectCorrection({ ...normalized, _entities: entitiesForCorrection }, session);
    if (correction && correction.isCorrection && !correction.requiresEditFlow) {
      const intentKey = `correction_${correction.field}`;
      if (CORRECTION_INTENTS.includes(intentKey)) {
        return { intent: intentKey, confidence: correction.confidence || 0.8, source: 'correction', entities: entitiesForCorrection };
      }
    }
    // If correction requires edit flow and we're in BOOKING_CONFIRMATION or BOOKED,
    // map to the standard edit intent
    if (correction && correction.isCorrection && correction.requiresEditFlow) {
      if (session.state === 'BOOKING_CONFIRMATION' || session.state === 'BOOKED') {
        const editIntent = `edit_${correction.field}`;
        if (editIntent === 'edit_date' || editIntent === 'edit_time') {
          return { intent: editIntent, confidence: 0.8, source: 'correction_edit_redirect', entities: entitiesForCorrection };
        }
        // For treatment changes in BOOKED, route to reschedule
        if (editIntent === 'edit_treatment') {
          return { intent: 'reschedule', confidence: 0.8, source: 'correction_edit_redirect' };
        }
      }
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
  // Includes MAIN_MENU for "Back from booking" flows and HUMAN_ESCALATION
  // for recovery — user can still provide booking data to resume.
  const entityStates = ['BOOKING_COLLECTION', 'BOOKING_CONFIRMATION', 'MAIN_MENU', 'HUMAN_ESCALATION'];
  const entities = extractEntities(text);
  if (entities.date && entityStates.includes(session.state)) {
    return { intent: 'provide_date', confidence: 0.9, source: 'entity', entities };
  }
  if (entities.time && entityStates.includes(session.state)) {
    return { intent: 'provide_time', confidence: 0.9, source: 'entity', entities };
  }
  if (entities.treatment && entityStates.includes(session.state)) {
    return { intent: 'provide_treatment', confidence: 0.9, source: 'entity', entities };
  }
  if (entities.phone && session.state === 'CALLBACK_REQUESTED') {
    return { intent: 'provide_phone', confidence: 0.9, source: 'entity', entities };
  }

  // Priority 4: For BOOKING_COLLECTION state, check if it's a number
  if (state === 'BOOKING_COLLECTION') {
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
