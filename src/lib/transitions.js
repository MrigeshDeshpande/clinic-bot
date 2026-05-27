import { TRANSITIONS } from '@/config/states';

const GLOBAL_INTENT_NAMES = ['emergency', 'cancel', 'main_menu', 'escalate', 'back', 'location', 'timings', 'services'];
const CORRECTION_INTENT_NAMES = ['correction_date', 'correction_time', 'correction_treatment'];

export function isValidTransition(state, intent) {
  // Global intents are always valid
  if (GLOBAL_INTENT_NAMES.includes(intent)) return true;

  // Correction intents are valid during any booking-related state
  if (CORRECTION_INTENT_NAMES.includes(intent)) {
    const bookingStates = ['BOOKING_COLLECTION', 'BOOKING_CONFIRMATION', 'BOOKED'];
    return bookingStates.includes(state);
  }

  const allowed = TRANSITIONS[state];
  if (!allowed) return false;

  return allowed.includes(intent);
}

export function getNextState(state, intent, entities) {
  if (!isValidTransition(state, intent)) return null;

  // Global intents map to specific next states
  switch (intent) {
    case 'emergency':    return 'EMERGENCY';
    case 'cancel':       return 'MAIN_MENU';
    case 'main_menu':    return 'MAIN_MENU';
    case 'escalate':     return 'HUMAN_ESCALATION';
    case 'back':
      // Back from within booking flow
      switch (state) {
        case 'BOOKING_COLLECTION':   return 'MAIN_MENU';
        case 'BOOKING_CONFIRMATION': return 'BOOKING_COLLECTION';
        case 'BOOKED':               return 'BOOKING_CONFIRMATION';
        default:                     return 'MAIN_MENU';
      }
    case 'greeting':
      return null; // Handler decides whether to change state
    case 'callback':
      return 'CALLBACK_REQUESTED';
    case 'appointment':
      return 'BOOKING_COLLECTION';
    case 'services':
    case 'location':
    case 'timings':
      // Info queries don't change state — handler shows info and stays in current state
      return null;
    case 'provide_date':
    case 'provide_time':
    case 'provide_treatment':
      // Handler manages collection state progression — engine should not override
      return null;
    case 'confirm':
      return 'BOOKED';
    case 'confirm_cancel':
      return 'MAIN_MENU';
    case 'edit_date':
      return 'BOOKING_COLLECTION';
    case 'edit_time':
      return 'BOOKING_COLLECTION';
    case 'provide_phone':
      return 'DONE';

    // Correction intents — handled by the booking collection handler
    case 'correction_date':
    case 'correction_time':
    case 'correction_treatment':
      return null; // Handler manages state internally

    default:
      return null; // Stay in current state
  }
}
