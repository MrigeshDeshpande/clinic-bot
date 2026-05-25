import { TRANSITIONS } from '@/config/states';

const GLOBAL_INTENT_NAMES = ['emergency', 'cancel', 'main_menu', 'escalate', 'back', 'location', 'timings', 'services'];

export function isValidTransition(state, intent) {
  // Global intents are always valid
  if (GLOBAL_INTENT_NAMES.includes(intent)) return true;

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
    default:
      return null; // Stay in current state
  }
}
