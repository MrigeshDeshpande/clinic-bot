import { GLOBAL_INTENTS, STATE_INTENTS, CORRECTION_INTENTS } from '@/config/intents';
import { CLINIC } from '@/config/clinic';
import { extractEntities } from '@/lib/entities';
import { detectCorrection } from '@/lib/correction-detector';

function matchKeywords(text, keywords) {
  for (const kw of keywords) {
    const hasNonAscii = /[^\x00-\x7F]/.test(kw);
    if (kw.includes(' ')) {
      // Multi-word: phrase match
      if (text.includes(kw)) return true;
    } else if (hasNonAscii) {
      // Devanagari/non-ASCII terms — use includes, word boundaries are unreliable
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
  'edit_treatment': 'edit_treatment',
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
  'change': 'change_booking',
  'date_more': 'date_more',
  'doc_today': 'doctor_view_today',
  'doc_by_date': 'doctor_view_by_date',
  'doc_schedule': 'doctor_manage_schedule',
  'doc_stats': 'doctor_view_stats',
  'mark_done': 'doctor_mark_completed',
  'mark_noshow': 'doctor_mark_noshow',
  'block_date': 'doctor_block_date',
  'view_blocked': 'doctor_view_blocked',
  'register': 'doctor_register_patient',
  'search_pt': 'doctor_search_patient',
  'log_skip_media': 'skip_media',
  'log_no_notes': 'no_notes',
  'log_no_next': 'no_next_visit',
  'walk_in': 'walk_in',
  'view_chit': 'view_chit',
  'add_chit': 'add_chit',
  // Receptionist menu
  'rec_view_queue': 'receptionist_view_queue',
  'rec_register_walkin': 'receptionist_register_walkin',
  'rec_search': 'receptionist_search',
  // Doctor queue
  'doc_view_queue': 'doctor_view_queue',
  'doc_call_next': 'doctor_call_next',
  'doc_log_visit': 'doctor_log_visit',
  // Receptionist queue actions
  'queue_call_now': 'queue_mark_called',
  'queue_toggle_priority': 'queue_toggle_priority',
  'queue_mark_arrived': 'queue_mark_arrived',
  'log_visit_register_new': 'log_visit_register_new',
  'bulk_complete': 'doctor_bulk_complete',
  'block_cancel_all': 'block_cancel_all',
  'block_notify_reschedule': 'block_notify_reschedule',
  'add_treatment': 'add_treatment',
  'treatment_done': 'treatment_done',
  'transcription_accept': 'transcription_accept',
  'transcription_edit': 'transcription_edit',
  'transcription_rerrecord': 'transcription_rerrecord',
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

    // Doctor appointment detail tap: doc_appt_<uuid>
    if (id.startsWith('doc_appt_')) {
      const apptId = id.replace('doc_appt_', '');
      if (apptId) {
        return { intent: 'doctor_appt_detail', confidence: 1.0, source: 'interactive_id', entities: { appointmentId: apptId } };
      }
    }

    // Doctor unblock date: unblock_<date>
    if (id.startsWith('unblock_')) {
      const dateStr = id.replace('unblock_', '');
      if (dateStr) {
        return { intent: 'unblock_date', confidence: 1.0, source: 'interactive_id', entities: { date: dateStr } };
      }
    }

    // Doctor patient selection from search: patient_<uuid>
    if (id.startsWith('patient_')) {
      const patientId = id.replace('patient_', '');
      if (patientId) {
        return { intent: 'select_patient', confidence: 1.0, source: 'interactive_id', entities: { patientId } };
      }
    }

    // Family member selection: family_patient_<uuid>
    if (id.startsWith('family_patient_')) {
      const patientId = id.replace('family_patient_', '');
      if (patientId) {
        return { intent: 'select_family_patient', confidence: 1.0, source: 'interactive_id', entities: { patientId } };
      }
    }

    // Chit media item tap: chit_media_<idx>_<apptId>
    if (id.startsWith('chit_media_')) {
      const parts = id.replace('chit_media_', '').split('_');
      if (parts.length >= 2) {
        const mediaIdx = parseInt(parts[0], 10);
        const apptId = parts.slice(1).join('_');
        if (!isNaN(mediaIdx) && apptId) {
          return { intent: 'view_media', confidence: 1.0, source: 'interactive_id', entities: { mediaIdx, appointmentId: apptId } };
        }
      }
    }

    // Queue patient item tap (receptionist view): queue_patient_<apptId>
    if (id.startsWith('queue_patient_')) {
      const apptId = id.replace('queue_patient_', '');
      if (apptId) {
        return { intent: 'receptionist_queue_patient', confidence: 1.0, source: 'interactive_id', entities: { appointmentId: apptId } };
      }
    }

    // Doctor call specific patient from queue: call_patient_<apptId>
    if (id.startsWith('call_patient_')) {
      const apptId = id.replace('call_patient_', '');
      if (apptId) {
        return { intent: 'doctor_call_patient', confidence: 1.0, source: 'interactive_id', entities: { appointmentId: apptId } };
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
      if (session.state === 'BOOKING_CONFIRMATION') {
        const editIntent = `edit_${correction.field}`;
        if (['edit_date', 'edit_time', 'edit_treatment'].includes(editIntent)) {
          return { intent: editIntent, confidence: 0.8, source: 'correction_edit_redirect', entities: entitiesForCorrection };
        }
      }
      if (session.state === 'BOOKED') {
        // From BOOKED, route treatment changes to reschedule; date/time to edit
        const editIntent = `edit_${correction.field}`;
        if (editIntent === 'edit_date' || editIntent === 'edit_time') {
          return { intent: editIntent, confidence: 0.8, source: 'correction_edit_redirect', entities: entitiesForCorrection };
        }
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
