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
        // Doctor back navigation
        case 'DOCTOR_APPOINTMENT_LIST':
        case 'DOCTOR_VIEW_DATE':
        case 'DOCTOR_STATS':
        case 'DOCTOR_MANAGE_SCHEDULE': return 'DOCTOR_MAIN_MENU';
        case 'DOCTOR_APPOINTMENT_DETAIL': return 'DOCTOR_APPOINTMENT_LIST';
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
    case 'edit_time':
    case 'edit_treatment':
      return 'BOOKING_COLLECTION';

    // Doctor transitions
    case 'doctor_view_today':
    case 'doctor_view_by_date':
      return 'DOCTOR_APPOINTMENT_LIST';
    case 'doctor_view_stats':
      return 'DOCTOR_STATS';
    case 'doctor_manage_schedule':
      return 'DOCTOR_MANAGE_SCHEDULE';
    case 'doctor_appt_detail':
      return 'DOCTOR_APPOINTMENT_DETAIL';
    case 'doctor_mark_completed':
    case 'doctor_mark_noshow':
      return 'DOCTOR_APPOINTMENT_LIST';
    case 'doctor_block_date':
    case 'doctor_view_blocked':
      return 'DOCTOR_MANAGE_SCHEDULE';
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
