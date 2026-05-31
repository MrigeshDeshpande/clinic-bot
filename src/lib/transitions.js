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
        case 'DOCTOR_VIEW_QUEUE': return 'DOCTOR_MAIN_MENU';
        case 'DOCTOR_LOG_VISIT_NAME': return 'DOCTOR_MAIN_MENU';
        case 'FAMILY_SELECTION': return 'MAIN_MENU';
        // Receptionist back navigation
        case 'RECEPTIONIST_VIEW_QUEUE': return 'RECEPTIONIST_MAIN_MENU';
        case 'RECEPTIONIST_QUEUE_DETAIL': return 'RECEPTIONIST_VIEW_QUEUE';
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
      return 'LOG_TREATMENT';
    case 'doctor_mark_noshow':
      return 'DOCTOR_APPOINTMENT_LIST';
    case 'doctor_block_date':
    case 'doctor_view_blocked':
      return 'DOCTOR_MANAGE_SCHEDULE';
    case 'doctor_register_patient':
      return 'REGISTER_NAME';
    case 'doctor_search_patient':
      return 'DOCTOR_SEARCH_PATIENT';
    case 'doctor_view_queue':
      return 'DOCTOR_VIEW_QUEUE';
    case 'doctor_log_visit':
      return 'DOCTOR_LOG_VISIT_NAME';

    // Receptionist transitions
    case 'receptionist_view_queue':
      return 'RECEPTIONIST_VIEW_QUEUE';
    case 'receptionist_register_walkin':
      return 'REGISTER_NAME';
    case 'receptionist_search':
      return 'DOCTOR_SEARCH_PATIENT';

    // Registration transitions
    case 'provide_name':
      return 'REGISTER_AGE';
    case 'provide_age':
      return 'REGISTER_SEX';
    case 'provide_sex':
      return 'REGISTER_PHONE';
    case 'provide_phone':
      return 'REGISTER_APPOINTMENT';
    case 'provide_appointment_time':
    case 'walk_in':
      return 'DOCTOR_MAIN_MENU';

    // Visit log transitions
    case 'provide_log_treatment':
      return 'LOG_CONSULTATION_FEE';
    case 'provide_fee':
      // State-dependent: if in LOG_CONSULTATION_FEE → next is LOG_TREATMENT_CHARGES, etc.
      return null;
    case 'provide_next_visit':
    case 'no_next_visit':
      return 'LOG_NOTES';
    case 'provide_notes':
    case 'no_notes':
      return 'LOG_MEDIA';
    case 'provide_media':
    case 'skip_media':
      return 'DOCTOR_MAIN_MENU';
    case 'provide_search_query':
      return 'DOCTOR_SEARCH_PATIENT';
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
