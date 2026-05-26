import { TRANSITIONS } from '@/config/states';

const GLOBAL_INTENT_NAMES = ['emergency', 'cancel', 'main_menu', 'escalate', 'back', 'location', 'timings', 'services'];
const CORRECTION_INTENT_NAMES = ['correction_date', 'correction_time', 'correction_treatment'];

export function isValidTransition(state, intent) {
  // Global intents are always valid
  if (GLOBAL_INTENT_NAMES.includes(intent)) return true;

  // Correction intents are valid during any booking-related state
  if (CORRECTION_INTENT_NAMES.includes(intent)) {
    const bookingStates = ['BOOKING_DATE', 'BOOKING_TIME', 'BOOKING_TREATMENT', 'BOOKING_CONFIRMATION', 'BOOKED'];
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
        case 'BOOKING_TIME':         return 'BOOKING_DATE';
        case 'BOOKING_TREATMENT':    return 'BOOKING_TIME';
        case 'BOOKING_CONFIRMATION': return 'BOOKING_TREATMENT';
        default:                     return 'MAIN_MENU';
      }
    case 'greeting':
      return null; // Handler decides whether to change state
    case 'callback':
      return 'CALLBACK_REQUESTED';
    case 'appointment':
      return 'BOOKING_DATE';
    case 'services':
      return 'SERVICES';
    case 'location':
      return 'LOCATION';
    case 'timings':
      return 'TIMINGS';
    case 'provide_date':
      return 'BOOKING_TIME';
    case 'provide_time':
      return 'BOOKING_TREATMENT';
    case 'provide_treatment':
      return 'BOOKING_CONFIRMATION';
    case 'confirm':
      return 'BOOKED';
    case 'confirm_cancel':
      return 'MAIN_MENU';
    case 'edit_date':
      return 'BOOKING_DATE';
    case 'edit_time':
      return 'BOOKING_TIME';
    case 'provide_phone':
      return 'DONE';

    // Correction intents — redirect to the appropriate field collection state
    case 'correction_date':
      // If currently collecting something else, redirect to date
      return 'BOOKING_DATE';
    case 'correction_time':
      return 'BOOKING_TIME';
    case 'correction_treatment':
      return 'BOOKING_TREATMENT';

    default:
      return null; // Stay in current state
  }
}
