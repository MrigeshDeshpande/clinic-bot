import { getSql } from '@/db/pool';
import { CLINIC } from '@/config/clinic';
import { validateDate, validateTime, validateTreatment, validatePhone } from '@/lib/validators';
import { formatDate, formatTime, formatPhone } from '@/utils/formatters';
import { getClinicMinutes, getClinicToday, getClinicDateStr } from '@/lib/clinicTime';
import { createAppointment, findAppointmentsByWaId, findUpcomingByWaId, supersedeAppointment, cancelAppointment,
         fetchAppointmentsByDate, updateAppointmentStatus, countAppointmentsByDateRange,
          countAppointmentsBySlot, findBookedTimesForDate, findNextAvailableSlots, fetchLatestCompletedByWaId, fetchTodayQueue, updateArrivalStatus,
         countTodayByArrivalStatus, toggleAppointmentPriority,
         findAppointmentById, bulkCompleteAppointmentsForDate, bulkCancelAppointmentsForDate,
         fetchTodayScheduledAppointments } from '@/db/repositories/appointmentRepository';
import { isDateBlocked, fetchBlockedDates, blockDate, unblockDate } from '@/db/repositories/blockedDateRepository';
import { createPatient, searchPatients, findPatientById, createAppointmentForPatient, getVisitsByPatientPhone,
         updateVisitLog, findPatientsByWaId, updatePatient } from '@/db/repositories/patientRepository';
import { insertFeedback } from '@/db/repositories/feedbackRepository';
import { processAndStoreMedia, downloadMediaFromMeta } from '@/lib/media';
import { T } from '@/config/translations';
import { transcribeAudio } from '@/lib/transcriber';
import { getR2SignedUrl, r2Configured } from '@/lib/r2';
import { sendList, sendText, sendDocument } from '@/lib/whatsapp';
import { logger } from '@/lib/logger';
import { evaluateOverwrite, applyFieldOverwrite, getTargetState } from '@/lib/overwrite-policy';
import { accumulateEntities, computePendingFields } from '@/lib/entities';
import { getNextState } from '@/lib/transitions';

// ───────────────────────────────────────────────
// State-aware greeting for returning users
// ───────────────────────────────────────────────
const STATE_GREETING = {
  BOOKING_COLLECTION:   'We were setting up your appointment — let\'s pick up where we left off.',
  BOOKING_CONFIRMATION: 'Your appointment details are ready to confirm.',
  BOOKED:               'You have an appointment coming up.',
  CANCEL_CONFIRM:       'Were you looking to cancel your appointment?',
};

function firstName(session) {
  const name = session.profileName || '';
  return name.split(' ')[0] || '';
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function detectLanguageHint(text = '') {
  const t = text.toLowerCase();
  const hindiSignals = [
    'kal', 'parso', 'aaj', 'shaam', 'subah', 'baje', 'dard', 'khun', 'khoon',
    'sujan', 'soojan', 'hindi', 'haan', 'nahi', 'krdo', 'kar do'
  ];
  let score = 0;
  for (const s of hindiSignals) {
    if (t.includes(s)) score += 1;
  }
  if (score >= 2) return 'hi';
  return 'en';
}

function getLang(session) {
  return session?.context?.language || 'en';
}

function tr(session, keyOrEn, hi) {
  const lang = getLang(session);
  // Key-based lookup: tr(session, 'welcome', { clinic: '...' })
  if (hi === undefined && typeof keyOrEn === 'string') {
    const entry = T[keyOrEn];
    if (!entry) return keyOrEn;
    const text = entry[lang] || entry.en || keyOrEn;
    return text;
  }
  // Template variable substitution
  if (hi && typeof hi === 'object' && !Array.isArray(hi)) {
    const entry = T[keyOrEn];
    if (!entry) return keyOrEn;
    let text = entry[lang] || entry.en || keyOrEn;
    for (const [k, v] of Object.entries(hi)) {
      text = text.replace(`{${k}}`, v);
    }
    return text;
  }
  // Legacy inline: tr(session, 'English text', 'Hindi text')
  return lang === 'hi' ? hi : keyOrEn;
}

function _tr(key, vars) {
  return function(session) {
    return tr(session, key, vars);
  };
}



// ───────────────────────────────────────────────
// Frustration score
// ───────────────────────────────────────────────
function calculateFrustration(session, textLower) {
  let score = 0;
  if (/\b(?:no|stop|wrong|ugh|stupid|bad)\b/i.test(textLower)) score += 2;
  if (session.metrics.messagesInState > 4) score += 1;
  if (textLower.length < 3 && session.metrics.messagesInState > 2) score += 1;
  if (session.metrics.failedAttempts >= 2) score += 2;
  return score;
}

// ───────────────────────────────────────────────
// Progressive field fill — tries to auto-advance by checking
// accumulated entities for the next booking field.
// Supports fragmented messages like "Tomorrow after 5" sent
// as two separate messages before the bot replies.
// ───────────────────────────────────────────────
async function progressiveFieldFill(session, justSetField, entities) {
  const booking = session.context.booking;
  const accumulated = session.context.receivedEntities || {};

  // Step 1: After setting date, re-validate existing time against the new date's day type
  if (justSetField === 'date' && booking.time) {
    const result = validateTime(booking.time, new Date(booking.date));
    if (!result.valid) {
      booking.time = null;
      session.context.bookingTimestamps.time = null;
    }
  }

  // Step 2: After setting date, check if we have a valid time in entities or accumulated
  if (justSetField === 'date' && !booking.time) {
    const timeEntity = entities?.time || (accumulated.times && accumulated.times.length > 0 ? accumulated.times[accumulated.times.length - 1] : null);
    if (timeEntity) {
      const timeStr = typeof timeEntity === 'string' ? timeEntity : String(timeEntity);
      const bookingDate = booking.date ? new Date(booking.date) : new Date();
      // Re-validate via validateTime using the raw time string
      const result = validateTime(timeStr, bookingDate);
      if (result.valid && result.parsed) {
        const updated = applyFieldOverwrite(booking, session.context.bookingTimestamps, 'time', result.parsed);
        session.context.booking = updated.booking;
        session.context.bookingTimestamps = updated.bookingTimestamps;
        // Now check if treatment also available
        return await progressiveFieldFill(session, 'time', entities);
      }
    }
  }

  // Step 3: After setting time, check if we have a valid treatment
  if (justSetField === 'time' && !booking.treatment) {
    const treatmentEntity = entities?.treatment || (accumulated.treatments && accumulated.treatments.length > 0 ? accumulated.treatments[accumulated.treatments.length - 1] : null);
    if (treatmentEntity) {
      const result = validateTreatment(treatmentEntity);
      if (result.valid && result.parsed) {
        const updated = applyFieldOverwrite(booking, session.context.bookingTimestamps, 'treatment', result.parsed);
        session.context.booking = updated.booking;
        session.context.bookingTimestamps = updated.bookingTimestamps;
      }
    }
  }

  return session;
}

// ───────────────────────────────────────────────
// Main dispatch
// ───────────────────────────────────────────────
export async function handle(state, { session, normalized, entities, intent }) {
  const langHint = detectLanguageHint(normalized?.textLower || '');
  session.context = { ...session.context, language: session.context?.language || langHint };

  // Increment messagesInState
  session = { ...session };
  session.metrics = { ...session.metrics, messagesInState: session.metrics.messagesInState + 1 };

  // Accumulate entities from this message into session context
  if (entities && Object.keys(entities).length > 0) {
    const { receivedEntities, pendingFields } = accumulateEntities(session.context, entities);
    session.context.receivedEntities = receivedEntities;
    session.context.pendingFields = pendingFields;
  }

  // Update message sequence counter for rapid-fire detection
  session.context.messageSequence = (session.context.messageSequence || 0) + 1;

  // Global intent handling (before state-specific routing)
  if (intent === 'arrival') {
    // Doctor/receptionist scanning QR should go to their own menu, not patient walk-in
    if (session.context?.role === 'doctor') return handleDoctorGreeting(session);
    if (session.context?.role === 'receptionist') return handleReceptionistGreeting(session);
    return handleArrival(session);
  }
  if (intent === 'emergency') return handleEmergency(session);
  if (intent === 'language_en') {
    session.context = { ...session.context, language: 'en' };
    return { session, reply: 'Sure. I will continue in English.', replyType: 'text' };
  }
  if (intent === 'language_hi') {
    session.context = { ...session.context, language: 'hi' };
    return { session, reply: 'Theek hai. Main simple Hindi/English me reply karunga.', replyType: 'text' };
  }
  if (intent === 'escalate') return handleHumanEscalation(session);
  if (intent === 'cancel') return handleCancel(session);
  if (intent === 'main_menu') {
    if (session.context?.role === 'doctor') {
      return handleDoctorDispatch(session, normalized, entities, intent);
    }
    if (session.context?.role === 'receptionist') {
      return handleReceptionistDispatch(session, normalized, entities, intent);
    }
    return handleMainMenu(session);
  }
  if (intent === 'greeting') {
    if (session.context?.role === 'doctor') {
      return handleDoctorDispatch(session, normalized, entities, intent);
    }
    if (session.context?.role === 'receptionist') {
      return handleReceptionistDispatch(session, normalized, entities, intent);
    }
    return handleGreeting(session);
  }
  if (intent === 'thanks') return { session, reply: tr(session, 'thanks_reply'), replyType: 'text' };
  if (intent === 'help') return handleHelp(session);
  if (intent === 'affirm') {
    if (session.context?.role === 'doctor') return handleDoctorAffirm(session);
    if (session.context?.role === 'receptionist') return handleReceptionistAffirm(session);
    return handleAffirm(session);
  }
  if (intent === 'location') return handleLocation(session);
  if (intent === 'timings') return handleTimings(session);
  if (intent === 'services') return handleServices(session);
  if (intent === 'my_appointments') return handleMyAppointments(session);
  if (intent === 'feedback_great' || intent === 'feedback_okay' || intent === 'feedback_poor') {
    return handleFeedbackRating(session, intent, normalized);
  }
  if (intent === 'feedback_callback') {
    return handleFeedbackCallback(session);
  }
  if (intent === 'appointment') {
    // Family accounts: check if multiple patients share this wa_id
    const patients = await findPatientsByWaId(session.waId);
    if (patients.length > 1) {
      const rows = patients.map(p => ({
        id: `family_patient_${p.id}`,
        title: `${p.name}${p.age ? ` (${p.age})` : ''}`,
        description: p.phone ? `📞 ${p.phone}` : '',
      }));
      session = {
        ...session,
        state: 'FAMILY_SELECTION',
        context: { ...session.context, familyPatients: patients.map(p => p.id) },
      };
      return {
        session,
        reply: { body: 'Who is this appointment for?', buttonLabel: 'Select', sections: [{ title: 'Family Members', rows }] },
        replyType: 'list',
      };
    }
    if (patients.length === 1) {
      session.context = { ...session.context, selectedPatientId: patients[0].id };
    }
    // Check if patient demographics are needed — if so, collect them
    const missingDemographics = await checkPatientDemographicsNeeded(session);
    if (missingDemographics && missingDemographics.length > 0) {
      const needed = { needsAge: missingDemographics.includes('age'), needsSex: missingDemographics.includes('sex'), needsLocation: missingDemographics.includes('location') };
      session = {
        ...session,
        state: 'BOOKING_PATIENT_AGE',
        context: {
          ...session.context,
          patientProfile: { age: null, sex: null, location: null, ...needed },
        },
        metrics: { ...session.metrics, failedAttempts: 0, messagesInState: 0 },
      };
      const name = session.profileName || 'Patient';
      return {
        session,
        reply: tr(session, 'booking_ask_age', { name }),
        replyType: 'text',
      };
    }
  }
  if (intent === 'back') {
    if (session.context?.role === 'doctor') {
      return handleDoctorDispatch(session, normalized, entities, intent);
    }
    if (session.context?.role === 'receptionist') {
      return handleReceptionistDispatch(session, normalized, entities, intent);
    }
    if (session.state === 'CANCEL_CONFIRM') {
      return handleCancelConfirm(session, 'back');
    }
    return handleBack(session);
  }

  // Entity-derived booking intents — route from ANY state to booking collection.
  // This handles "Back from booking" (state=MAIN_MENU) and escalation recovery
  // (state=HUMAN_ESCALATION) where the router now returns provide_date/time/treatment.
  if (['provide_date', 'provide_time', 'provide_treatment'].includes(intent) && session.state !== 'BOOKING_COLLECTION') {
    const prevState = session.state;
    session = {
      ...session,
      state: 'BOOKING_COLLECTION',
      previousState: prevState,
      metrics: { ...session.metrics, failedAttempts: 0, messagesInState: 0 },
    };
    return handleBookingCollection(session, entities, normalized, intent);
  }

  // Treatment_help can also come from text input (not just list tap)
  if (intent === 'treatment_help') {
    session.context = { ...session.context, awaitingTreatmentHelp: true };
    return {
      session,
      reply: tr(session, 'treatment_help_prompt'),
    replyType: 'text',
  };
}

async function handleDoctorMediaPatientLookup(session, query) {
  const pm = session.context?.pendingMedia;
  if (!pm) {
    return handleDoctorMainMenu(session);
  }

  const patients = await searchPatients(query);

  if (patients.length === 0) {
    session = {
      ...session,
      state: 'DOCTOR_MAIN_MENU',
      context: { ...session.context, pendingMedia: undefined, pendingMediaQuery: undefined },
    };
    return {
      session,
      reply: { body: `No patient found matching "${query}". Image not saved. Tap Register New Patient to add them first.`, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  // Single match — ask which visit to save to
  if (patients.length === 1) {
    const patient = patients[0];
    const visits = await getVisitsByPatientPhone(patient.phone);
    if (visits.length === 0) {
      // No visits — create a new appointment row for the image
      await processAndStoreMedia({
        mediaId: pm.mediaId,
        mimeType: pm.mimeType,
        appointmentId: null,
        waId: null,
        patientId: patient.id,
      });
      session = {
        ...session,
        state: 'DOCTOR_MAIN_MENU',
        context: { ...session.context, pendingMedia: undefined, pendingMediaQuery: undefined },
      };
      return {
        session,
        reply: { body: `*✅ Media saved for ${patient.name}.*`, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
        replyType: 'list',
      };
    }
    // Save to most recent visit
    const latestVisit = visits[0];
    await processAndStoreMedia({
      mediaId: pm.mediaId,
      mimeType: pm.mimeType,
      appointmentId: latestVisit.id,
      waId: null,
      patientId: patient.id,
    });
    session = {
      ...session,
      state: 'DOCTOR_MAIN_MENU',
      context: { ...session.context, pendingMedia: undefined, pendingMediaQuery: undefined },
    };
    return {
      session,
      reply: { body: `*✅ Media saved to ${patient.name}'s visit on ${latestVisit.date}.*`, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  // Multiple matches — show list
  const rows = patients.map(p => ({
    id: `patient_${p.id}`,
    title: p.name,
    description: p.phone ? '📞 ' + p.phone.slice(-8) : '',
  }));

  session = {
    ...session,
    state: 'DOCTOR_SEARCH_PATIENT',
    context: { ...session.context, searchResults: patients.map(p => p.id) },
  };

  return {
    session,
    reply: { body: `Found ${patients.length} patients matching "${query}". Select one to save the image:`, buttonLabel: 'Patients', sections: [{ title: 'Matching Patients', rows }] },
    replyType: 'list',
  };
}

  // Correction intents — route to the right handler but pass correction context
  if (intent === 'correction_date') {
    // Enforce overwrite policy before proceeding
    const policy = evaluateOverwrite({
      state: session.state,
      field: 'date',
      isCorrection: true,
      booking: session.context.booking,
    });
    if (!policy.allowed && policy.action === 'require_edit') {
      return { session, reply: 'Your appointment is already confirmed. Would you like to reschedule instead?', replyType: 'text' };
    }
    if (entities?.date) {
      session.context.lastCorrection = { field: 'date', fromValue: session.context.booking.date, timestamp: new Date().toISOString() };
      return handleBookingCollection(session, entities, normalized, intent);
    }
    // If no date entity but correction intent, ask for the new date
    session.context.lastCorrection = { field: 'date', timestamp: new Date().toISOString() };
    return {
      session,
      reply: getDateListReply(tr(session, 'ask_date_again'), session),
      replyType: 'list',
    };
  }
  if (intent === 'correction_time') {
    const policy = evaluateOverwrite({
      state: session.state,
      field: 'time',
      isCorrection: true,
      booking: session.context.booking,
    });
    if (!policy.allowed && policy.action === 'require_edit') {
      return { session, reply: 'Your appointment is already confirmed. Would you like to reschedule instead?', replyType: 'text' };
    }
    if (entities?.time) {
      session.context.lastCorrection = { field: 'time', fromValue: session.context.booking.time, timestamp: new Date().toISOString() };
      return handleBookingCollection(session, entities, normalized, intent);
    }
    session.context.lastCorrection = { field: 'time', timestamp: new Date().toISOString() };
    return { session, reply: 'Sure, which time works better?', replyType: 'text' };
  }
  if (intent === 'correction_treatment') {
    const policy = evaluateOverwrite({
      state: session.state,
      field: 'treatment',
      isCorrection: true,
      booking: session.context.booking,
    });
    if (!policy.allowed && policy.action === 'require_edit') {
      return { session, reply: 'Your appointment is already confirmed. Would you like to reschedule instead?', replyType: 'text' };
    }
    if (entities?.treatment) {
      session.context.lastCorrection = { field: 'treatment', fromValue: session.context.booking.treatment, timestamp: new Date().toISOString() };
      return handleBookingCollection(session, entities, normalized, intent);
    }
    session.context.lastCorrection = { field: 'treatment', timestamp: new Date().toISOString() };
    return {
      session,
      reply: {
        body: tr(session, 'change_treatment_q'),
        buttonLabel: tr(session, 'select_option'),
        sections: treatmentSections(session),
      },
      replyType: 'list',
    };
  }

  // Role routing — role is set on session by getOrCreate()
  if (session.context?.role === 'doctor') {
    return handleDoctorDispatch(session, normalized, entities, intent);
  }
  if (session.context?.role === 'receptionist') {
    return handleReceptionistDispatch(session, normalized, entities, intent);
  }

  // State-specific routing
  switch (state) {
    case 'IDLE':
    case 'ABANDONED':
      return handleIdle(session);

    case 'MAIN_MENU':
      return handleMainMenu(session, intent);

    case 'BOOKING_COLLECTION':
      return handleBookingCollection(session, entities, normalized, intent);

    case 'BOOKING_CONFIRMATION':
      return handleBookingConfirmation(session, intent, entities);

    case 'BOOKED':
      return handleBooked(session, intent);

    case 'WALKIN_NAME':
      return handleWalkinName(session, normalized, entities, intent);

    case 'WALKIN_AGE':
      return handleWalkinAge(session, normalized, entities, intent);

    case 'WALKIN_SEX':
      return handleWalkinSex(session, normalized, entities, intent);

    case 'WALKIN_TREATMENT':
      return handleWalkinTreatment(session, entities, normalized, intent);

    case 'CANCEL_CONFIRM':
      return handleCancelConfirm(session, intent);

    case 'BOOKING_PATIENT_AGE':
      return handleBookingPatientAge(session, normalized, entities, intent);

    case 'BOOKING_PATIENT_SEX':
      return handleBookingPatientSex(session, normalized, entities, intent);

    case 'BOOKING_PATIENT_LOCATION':
      return handleBookingPatientLocation(session, normalized, entities, intent);

    case 'FAMILY_SELECTION':
      return handleFamilySelection(session, intent, entities, normalized);

    case 'EMERGENCY':
      // Safety net — handleEmergency now transitions to MAIN_MENU directly,
      // so this case should rarely be hit. If it is, guide the user out.
      session = { ...session, state: 'MAIN_MENU' };
      return {
        session,
        reply: { body: tr(session, 'what_next'), buttonLabel: tr(session, 'select_option'), sections: mainMenuSections(session) },
        replyType: 'list',
      };

    case 'HUMAN_ESCALATION':
      return handleHumanEscalation(session);

    case 'CALLBACK_REQUESTED':
      return handleCallbackRequested(session, entities);

    default:
      return handleUnknown(session, normalized);
  }
}

// ───────────────────────────────────────────────
// Family accounts — select patient for booking
// ───────────────────────────────────────────────
async function handleFamilySelection(session, intent, entities, normalized) {
  if (intent === 'back') {
    return handleMainMenu(session, 'main_menu');
  }

  if (intent === 'select_family_patient' && entities?.patientId) {
    const patient = await findPatientById(entities.patientId);
    if (patient) {
      session = {
        ...session,
        state: 'BOOKING_COLLECTION',
        previousState: session.state,
        context: {
          ...resetBookingContext(session.context),
          selectedPatientId: patient.id,
          familyPatients: undefined,
          patientProfile: {
            age: patient.age || null,
            sex: patient.sex || null,
            location: patient.location || null,
          },
        },
        metrics: { ...session.metrics, failedAttempts: 0, messagesInState: 0 },
      };
      // Check if this family member needs demographics
      const missing = [];
      if (!patient.age) missing.push('age');
      if (!patient.sex) missing.push('sex');
      if (!patient.location) missing.push('location');

      if (missing.length > 0) {
        session.state = 'BOOKING_PATIENT_AGE';
        session.context.patientProfile = {
          age: null, sex: null, location: null,
          needsAge: missing.includes('age'),
          needsSex: missing.includes('sex'),
          needsLocation: missing.includes('location'),
        };
        return {
          session,
          reply: tr(session, 'booking_ask_age', { name: patient.name }),
          replyType: 'text',
        };
      }

      return {
        session,
        reply: { body: tr(session, 'ask_date_for_name', { name: patient.name }), buttonLabel: tr(session, 'select_date'), sections: getDateQuickPickSections(session) },
        replyType: 'list',
      };
    }
  }

  // If patient not found or intent unknown, show selection again
  const patients = await findPatientsByWaId(session.waId);
  if (patients.length <= 1) {
    session = { ...session, state: 'MAIN_MENU' };
    return handleMainMenu(session, 'main_menu');
  }
  const rows = patients.map(p => ({
    id: `family_patient_${p.id}`,
    title: `${p.name}${p.age ? ` (${p.age})` : ''}`,
    description: p.phone ? `📞 ${p.phone}` : '',
  }));
  return {
    session,
    reply: { body: 'Who is this appointment for?', buttonLabel: 'Select', sections: [{ title: 'Family Members', rows }] },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// View chit media for an appointment
// ───────────────────────────────────────────────
async function handleDoctorViewChit(session, normalized, intent, entities) {
  if (intent === 'back') {
    const prev = session.context?.returnToState || 'DOCTOR_MAIN_MENU';
    if (prev === 'DOCTOR_APPOINTMENT_DETAIL') {
      const apptId = session.context?.selectedAppointmentId;
      if (apptId) {
        session.state = 'DOCTOR_APPOINTMENT_DETAIL';
        return handleDoctorAppointmentDetail(session, entities, intent);
      }
    }
    return handleDoctorBack(session);
  }

  // User taps a specific media item: view_media intent with mediaIdx + appointmentId
  if (intent === 'view_media' && entities?.mediaIdx !== undefined && entities?.appointmentId) {
    return handleDoctorViewSingleMedia(session, entities.mediaIdx, entities.appointmentId);
  }

  const apptId = session.context?.selectedAppointmentId;
  if (!apptId) {
    return handleDoctorBack(session);
  }

  const appt = session.context?.selectedAppointment;
  if (!appt) {
    return handleDoctorBack(session);
  }

  const media = appt.chit_media || [];

  if (media.length === 0) {
    return {
      session,
      reply: { body: '*No chit media for this appointment.*\n\nSend a photo or audio to add media.', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  const rows = await getChitMediaRows(media, apptId);
  const patientName = appt.patient_name || 'Patient';
  const body = `*📎 Chit Media — ${patientName}*\n${media.length} item(s)\n\nTap to view:`;

  session = {
    ...session,
    state: 'DOCTOR_VIEW_CHIT',
    context: { ...session.context, returnToState: 'DOCTOR_APPOINTMENT_DETAIL' },
  };

  return {
    session,
    reply: { body, buttonLabel: 'Media', sections: [{ title: 'Chit Media', rows }] },
    replyType: 'list',
  };
}

async function handleDoctorViewSingleMedia(session, mediaIdx, apptId) {
  const mediaUrl = await getR2SignedUrl(mediaIdx, 3600);
  // For audio, the URL will be playable; for images, viewable.
  // WhatsApp only supports sending media URLs in limited ways.
  // We send the signed URL as text so the doctor can tap to view.
  if (!mediaUrl) {
    return {
      session,
      reply: `Could not generate view link for item #${mediaIdx + 1}. It may have expired or been deleted.`,
      replyType: 'text',
    };
  }

  return {
    session,
    reply: `📎 *Media #${mediaIdx + 1}*\n\n${mediaUrl}\n\nTap the link to view.`,
    replyType: 'text',
  };
}

async function getChitMediaRows(media, apptId) {
  const rows = [];
  for (let i = 0; i < media.length; i++) {
    const key = media[i];
    const isAudio = key.includes('audio');
    const isPhoto = key.includes('photo');
    const icon = isAudio ? '🎵' : isPhoto ? '🖼️' : '📎';
    const typeLabel = isAudio ? 'Audio' : isPhoto ? 'Photo' : 'File';
    rows.push({
      id: `chit_media_${i}_${apptId}`,
      title: `${icon} ${typeLabel} #${i + 1}`,
      description: key.split('/').pop() || '',
    });
  }
  return rows;
}

// ───────────────────────────────────────────────
// ARRIVAL — patient checks in at clinic (via QR scan or keyword)
// ───────────────────────────────────────────────
async function handleArrival(session) {
  // If already in walk-in registration, don't restart — just continue
  const walkinStates = ['WALKIN_NAME', 'WALKIN_AGE', 'WALKIN_SEX', 'WALKIN_TREATMENT'];
  if (walkinStates.includes(session.state)) {
    const prompts = {
      WALKIN_NAME: 'walkin_ask_name_again',
      WALKIN_AGE: 'walkin_ask_age_again',
      WALKIN_SEX: 'walkin_ask_sex_again',
      WALKIN_TREATMENT: 'walkin_ask_treatment_again',
    };
    return {
      session,
      reply: tr(session, 'walkin_resume') + '\n\n' + tr(session, prompts[session.state]),
      replyType: 'text',
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    // Find today's confirmed appointments for this patient
    const appointments = await findAppointmentsByWaId(session.waId);
    const todaysAppts = appointments.filter(a =>
      a.date && a.date.slice(0, 10) === today &&
      a.status === 'confirmed' &&
      a.status !== 'cancelled'
    );

    if (todaysAppts.length > 0) {
      // Pick the earliest appointment for today
      todaysAppts.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const appt = todaysAppts[0];

      // Mark as arrived
      await updateArrivalStatus(appt.id, 'arrived');

      const name = appt.patient_name || session.profileName || '';
      const firstName = name.split(' ')[0];

      session = { ...session, state: session.state === 'IDLE' ? 'MAIN_MENU' : session.state };

      return {
        session,
        reply: tr(session, 'arrival_welcome', {
          clinic: CLINIC.name,
          name: firstName || 'Patient',
          doctor: CLINIC.doctor?.name || 'the doctor',
        }),
        replyType: 'text',
      };
    }

    // No appointment found — start walk-in registration
    session = {
      ...session,
      state: 'WALKIN_NAME',
      previousState: session.state,
      context: {
        ...session.context,
        walkin: { name: null, age: null, sex: null, treatment: null },
      },
      metrics: { ...session.metrics, failedAttempts: 0, messagesInState: 0 },
    };
    return {
      session,
      reply: tr(session, 'walkin_ask_name'),
      replyType: 'text',
    };
  } catch (error) {
    logger.error('ARRIVAL_HANDLER_ERROR', { waId: session.waId, error: error.message });
    return {
      session,
      reply: tr(session, 'walkin_failed', { phone: CLINIC.phone }),
      replyType: 'text',
    };
  }
}

// ───────────────────────────────────────────────
// Walk-in registration handlers
// ───────────────────────────────────────────────
async function handleWalkinName(session, normalized, entities, intent) {
  // 'back' is handled by the handle() function via global intent before reaching here
  const text = (normalized?.textTrimmed || '').trim();
  if (!text || text.length < 1) {
    session.metrics = { ...session.metrics, failedAttempts: (session.metrics.failedAttempts || 0) + 1 };
    return { session, reply: tr(session, 'walkin_ask_name_again'), replyType: 'text' };
  }
  const name = text;
  session = {
    ...session,
    state: 'WALKIN_AGE',
    context: { ...session.context, walkin: { ...session.context.walkin, name } },
    metrics: { ...session.metrics, failedAttempts: 0, messagesInState: 0 },
  };
  return { session, reply: tr(session, 'walkin_ask_age', { name }), replyType: 'text' };
}

async function handleWalkinAge(session, normalized, entities, intent) {
  const text = (normalized?.textTrimmed || '').trim();
  const ageMatch = text.match(/(\d+)/);
  const age = ageMatch ? parseInt(ageMatch[1], 10) : null;
  if (!age || age < 1 || age > 150) {
    session.metrics = { ...session.metrics, failedAttempts: (session.metrics.failedAttempts || 0) + 1 };
    return { session, reply: tr(session, 'walkin_ask_age_again'), replyType: 'text' };
  }
  session = {
    ...session,
    state: 'WALKIN_SEX',
    context: { ...session.context, walkin: { ...session.context.walkin, age } },
    metrics: { ...session.metrics, failedAttempts: 0, messagesInState: 0 },
  };
  return { session, reply: tr(session, 'walkin_ask_sex', { name: session.context.walkin.name }), replyType: 'text' };
}

async function handleWalkinSex(session, normalized, entities, intent) {
  const text = (normalized?.textLower || '').trim();
  let sex = null;
  if (/^m(ale)?$/i.test(text)) sex = 'Male';
  else if (/^f(emale)?$/i.test(text)) sex = 'Female';
  else sex = text; // Allow any input as custom response

  if (!sex) {
    session.metrics = { ...session.metrics, failedAttempts: (session.metrics.failedAttempts || 0) + 1 };
    return { session, reply: tr(session, 'walkin_ask_sex_again'), replyType: 'text' };
  }
  session = {
    ...session,
    state: 'WALKIN_TREATMENT',
    context: { ...session.context, walkin: { ...session.context.walkin, sex } },
    metrics: { ...session.metrics, failedAttempts: 0, messagesInState: 0 },
  };
  return {
    session,
    reply: {
      body: tr(session, 'walkin_ask_treatment', { name: session.context.walkin.name }),
      buttonLabel: tr(session, 'select_option'),
      sections: symptomSections(session),
    },
    replyType: 'list',
  };
}

async function handleWalkinTreatment(session, entities, normalized, intent) {
  let treatment = entities?.treatment || null;

  if (!treatment && normalized) {
    const num = normalized.textTrimmed.match(/^(\d+)$/);
    if (num) {
      const idx = parseInt(num[1], 10) - 1;
      if (CLINIC.treatments[idx]) {
        treatment = CLINIC.treatments[idx].name;
      }
    }
  }

  if (!treatment && normalized?.textTrimmed) {
    const suggestion = recommendTreatment(normalized.textLower);
    if (suggestion) treatment = suggestion;
  }

  if (!treatment) {
    return {
      session,
      reply: {
        body: tr(session, 'walkin_ask_treatment_again'),
        buttonLabel: tr(session, 'select_option'),
        sections: symptomSections(session),
      },
      replyType: 'list',
    };
  }

  // All walk-in info collected — create appointment + patient record
  const walkin = session.context.walkin;
  const today = new Date().toISOString().slice(0, 10);

  try {
    let patientId = null;
    const existingPatients = await findPatientsByWaId(session.waId);

    if (existingPatients.length > 0) {
      const patient = existingPatients[0];
      patientId = patient.id;
      // Update existing patient with walk-in info
      await updatePatient(patientId, { name: walkin.name, age: walkin.age, sex: walkin.sex });
    } else {
      const newPatient = await createPatient({
        name: walkin.name,
        waId: session.waId,
        phone: session.waId,
      });
      if (newPatient) {
        patientId = newPatient.id;
        await updatePatient(patientId, { age: walkin.age, sex: walkin.sex });
      }
    }

    const appointment = await createAppointment({
      sessionId: session.id,
      waId: session.waId,
      patientName: walkin.name,
      patientId,
      patientPhone: session.waId,
      date: today,
      time: null,
      treatment,
    });

    if (appointment) {
      await updateArrivalStatus(appointment.id, 'arrived');

      logger.info('WALKIN_CREATED', {
        waId: session.waId,
        appointmentId: appointment.id,
        patientName: walkin.name,
        age: walkin.age,
        sex: walkin.sex,
        treatment,
      });

      session = {
        ...session,
        state: 'MAIN_MENU',
        context: { ...session.context, walkin: undefined, appointmentId: appointment.id, logicalId: appointment.logical_id },
        metrics: { ...session.metrics, failedAttempts: 0, messagesInState: 0 },
      };

      return {
        session,
        reply: tr(session, 'walkin_done', {
          name: walkin.name,
          treatment,
          age: String(walkin.age),
          sex: walkin.sex,
          doctor: CLINIC.doctor?.name || 'the doctor',
        }),
        replyType: 'text',
      };
    }
  } catch (error) {
    logger.error('WALKIN_CREATE_ERROR', { waId: session.waId, error: error.message });
  }

  return {
    session,
    reply: tr(session, 'walkin_failed', { phone: CLINIC.phone }),
    replyType: 'text',
  };
}

// ───────────────────────────────────────────────
// Check if a patient's demographics need to be collected
// Looks up the existing patient record by waId and returns
// which fields (age, sex, location) are missing.
// Returns empty array if patient doesn't exist yet or has all fields.
// ───────────────────────────────────────────────
async function checkPatientDemographicsNeeded(session) {
  // Skip demographics in replay mode — fixtures assume direct booking flow
  if (process.env.REPLAY_MODE === 'true') return [];

  try {
    // Check session-level stored demographics first (already collected in this session)
    const pp = session.context?.patientProfile;
    if (pp) {
      const missing = [];
      if (pp.needsAge && !pp.age) missing.push('age');
      if (pp.needsSex && !pp.sex) missing.push('sex');
      if (pp.needsLocation && !pp.location) missing.push('location');
      if (missing.length > 0) return missing;
    }

    // Look up existing patient record
    const patients = await findPatientsByWaId(session.waId);
    if (patients.length === 0) {
      // New patient — needs all demographics
      return ['age', 'sex', 'location'];
    }

    const patient = patients[0];
    const missing = [];
    if (!patient.age) missing.push('age');
    if (!patient.sex) missing.push('sex');
    if (!patient.location) missing.push('location');
    return missing;
  } catch (error) {
    logger.warn('DEMOGRAPHICS_CHECK_FAILED', { waId: session.waId, error: error.message });
    return [];
  }
}

// ───────────────────────────────────────────────
// Booking — Patient demographic collection handlers
// These run before the normal booking flow when demographics are missing.
// ───────────────────────────────────────────────
async function handleBookingPatientAge(session, normalized, entities, intent) {
  const text = (normalized?.textTrimmed || '').trim();
  const ageMatch = text.match(/(\d+)/);
  const age = ageMatch ? parseInt(ageMatch[1], 10) : null;
  if (!age || age < 1 || age > 150) {
    session.metrics = { ...session.metrics, failedAttempts: (session.metrics.failedAttempts || 0) + 1 };
    return { session, reply: tr(session, 'booking_ask_age_again'), replyType: 'text' };
  }

  const needsSex = session.context.patientProfile?.needsSex !== false;
  session = {
    ...session,
    state: 'BOOKING_PATIENT_SEX',
    context: {
      ...session.context,
      patientProfile: { ...session.context.patientProfile, age },
    },
    metrics: { ...session.metrics, failedAttempts: 0, messagesInState: 0 },
  };
  const name = session.profileName || 'Patient';
  return { session, reply: tr(session, 'booking_ask_sex', { name }), replyType: 'text' };
}

async function handleBookingPatientSex(session, normalized, entities, intent) {
  const text = (normalized?.textLower || '').trim();
  let sex = null;
  if (/^m(ale)?$/i.test(text)) sex = 'Male';
  else if (/^f(emale)?$/i.test(text)) sex = 'Female';
  else sex = text;

  if (!sex) {
    session.metrics = { ...session.metrics, failedAttempts: (session.metrics.failedAttempts || 0) + 1 };
    return { session, reply: tr(session, 'booking_ask_sex_again'), replyType: 'text' };
  }

  const needsLocation = session.context.patientProfile?.needsLocation !== false;
  if (!needsLocation) {
    // Location not needed — skip straight to booking collection
    return proceedToBookingCollection(session, { sex });
  }

  session = {
    ...session,
    state: 'BOOKING_PATIENT_LOCATION',
    context: {
      ...session.context,
      patientProfile: { ...session.context.patientProfile, sex },
    },
    metrics: { ...session.metrics, failedAttempts: 0, messagesInState: 0 },
  };
  return { session, reply: tr(session, 'booking_ask_location'), replyType: 'text' };
}

async function handleBookingPatientLocation(session, normalized, entities, intent) {
  const text = (normalized?.textTrimmed || '').trim();
  if (!text || text.length < 2) {
    session.metrics = { ...session.metrics, failedAttempts: (session.metrics.failedAttempts || 0) + 1 };
    return { session, reply: tr(session, 'booking_ask_location_again'), replyType: 'text' };
  }

  return proceedToBookingCollection(session, { location: text });
}

/**
 * Transition from demographic collection to normal booking collection.
 */
function proceedToBookingCollection(session, additionalProfile) {
  const profile = { ...session.context.patientProfile, ...additionalProfile };
  session = {
    ...session,
    state: 'BOOKING_COLLECTION',
    previousState: session.state,
    context: {
      ...resetBookingContext(session.context),
      patientProfile: profile,
    },
    metrics: { ...session.metrics, failedAttempts: 0, messagesInState: 0 },
  };
  return {
    session,
    reply: {
      body: tr(session, 'ask_date'),
      buttonLabel: tr(session, 'select_date'),
      sections: getDateQuickPickSections(session),
    },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Post-visit summary check — fire-and-forget from engine.js
// Sends a post-visit message if the patient's appointment time + 40 min has passed.
// ───────────────────────────────────────────────
export async function checkAndSendPostVisit(waId) {
  try {
    const sql = getSql();
    if (!sql) return;

    const today = getClinicDateStr();
    const nowMinutes = getClinicMinutes();

    // Find today's confirmed appointments for this patient
    // that haven't received a post-visit message yet
    const rows = await sql`
      SELECT * FROM appointments
      WHERE wa_id = ${waId}
        AND date = ${today}
        AND status = 'confirmed'
        AND post_visit_sent_at IS NULL
    `;

    for (const appt of rows) {
      if (!appt.time) continue;

      const [h, m] = appt.time.split(':').map(Number);
      const apptEndMinutes = h * 60 + m + 40; // 40-min buffer for visit duration

      if (nowMinutes < apptEndMinutes) continue;

      // Time has passed — send post-visit summary
      const name = appt.patient_name || 'Patient';
      const firstName = name.split(' ')[0];

      const timeFormatted = new Date(`2000-01-01T${appt.time}`).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });

      const lang = 'en';
      let visitDetails = appt.treatment
        ? `🦷 Treatment: ${appt.treatment}`
        : `🦷 Visit completed at ${timeFormatted}`;

      let nextVisit = '';
      if (appt.follow_up_date) {
        const d = new Date(appt.follow_up_date);
        const dateStr = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
        nextVisit = `\n🗓 *Next visit:* ${dateStr}`;
      }

      let instructions = '';
      if (appt.follow_up_instructions) {
        instructions = `\n📝 *Instructions:* ${appt.follow_up_instructions}`;
      } else if (appt.notes) {
        instructions = `\n📝 *Note:* ${appt.notes}`;
      }

      const message =
        `🌟 *Hope your visit went well, ${firstName}!*\n\n` +
        `${visitDetails}` +
        `${nextVisit}${instructions}\n\n` +
        `If you have any questions, just message us. We're here to help! \u{1F60A}`;

      await sendText(waId, message);
      await sql`UPDATE appointments SET post_visit_sent_at = NOW() WHERE id = ${appt.id}`;

      logger.info('POST_VISIT_SENT', { waId, appointmentId: appt.id });
    }
  } catch (error) {
    logger.warn('POST_VISIT_CHECK_ERROR', { waId, error: error.message });
  }
}

// ───────────────────────────────────────────────
// IDLE / ABANDONED
// ───────────────────────────────────────────────
function handleIdle(session) {
  session = { ...session, state: 'MAIN_MENU', previousState: session.state, context: resetBookingContext(session.context) };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0, frustrationScore: 0 };
  return {
    session,
    reply: { body: `Welcome to ${CLINIC.name} 🦷\nHow can I help you today?`, buttonLabel: 'Select option', sections: mainMenuSections(session) },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// MAIN_MENU
// ───────────────────────────────────────────────
function handleMainMenu(session, intent) {
  // Handle transition intents from list taps — return the correct reply
  // for the NEXT state instead of showing the main menu again
  if (intent === 'appointment') {
    session = { ...session, state: 'BOOKING_COLLECTION', previousState: session.state, context: resetBookingContext(session.context) };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: {
        body: tr(session, 'ask_date'),
        buttonLabel: tr(session, 'select_date'),
        sections: getDateQuickPickSections(session),
      },
      replyType: 'list',
    };
  }

  session = { ...session, state: 'MAIN_MENU', previousState: session.state };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0, frustrationScore: 0 };
  return {
    session,
    reply: { body: `Welcome to ${CLINIC.name} 🦷\nHow can I help you today?`, buttonLabel: 'Select option', sections: mainMenuSections(session) },
    replyType: 'list',
  };
}

function mainMenuSections(session) {
  return [{
    title: session ? tr(session, 'menu_section') : 'Menu',
    rows: [
      { id: 'apt',  title: session ? tr(session, 'menu_book') : 'Book Appointment', description: session ? tr(session, 'menu_book_desc') : 'Schedule a visit' },
      { id: 'svc',  title: session ? tr(session, 'menu_services') : 'Dental Services',  description: session ? tr(session, 'menu_services_desc') : 'What we offer' },
      { id: 'loc',  title: session ? tr(session, 'menu_location') : 'Clinic Location',  description: session ? tr(session, 'menu_location_desc') : 'Address & directions' },
      { id: 'tim',  title: session ? tr(session, 'menu_timings') : 'Clinic Timings',   description: session ? tr(session, 'menu_timings_desc') : 'Opening hours' },
    ],
  }];
}

// ───────────────────────────────────────────────
// BOOKING_COLLECTION — unified field collection
// Collects date, time, and treatment in sequence based on
// computePendingFields(). Replaces BOOKING_DATE, BOOKING_TIME,
// and BOOKING_TREATMENT as a single state.
// ───────────────────────────────────────────────
async function handleBookingCollection(session, entities, normalized, intent) {
  // ── Non-field intents ──
  if (intent === 'date_custom') {
    return {
      session,
      reply: tr(session, 'ask_date_custom'),
      replyType: 'text',
    };
  }
  if (intent === 'date_more') {
    const pending = computePendingFields(session.context, session.context.receivedEntities || {});
    const currentField = pending[0];
    const body = currentField === 'date' ? tr(session, 'pick_a_date') : tr(session, 'select_date');
    return {
      session,
      reply: { body, buttonLabel: tr(session, 'select_date'), sections: getDateMoreSections(session) },
      replyType: 'list',
    };
  }
  if (intent === 'time_custom') {
    return {
      session,
      reply: tr(session, 'ask_time_custom'),
      replyType: 'text',
    };
  }

  // Multi-treatment: done adding treatments — proceed to next field
  if (intent === 'treatment_done') {
    session.context = { ...session.context, multiTreatmentActive: undefined };
    const pending = computePendingFields(session.context, session.context.receivedEntities || {});
    if (pending.length === 0) {
      const filledSession = { ...session };
      filledSession.state = 'BOOKING_CONFIRMATION';
      filledSession.metrics = { ...filledSession.metrics, failedAttempts: 0, messagesInState: 0, currentField: null };
      return {
        session: filledSession,
        reply: {
          body: buildConfirmationBody(filledSession.context.booking, filledSession),
          buttons: confirmationButtons(filledSession),
        },
        replyType: 'buttons',
      };
    }
    const fp = await buildFieldPrompt(pending[0], session.context.booking, undefined, undefined, session);
    return { session, ...fp };
  }

  // Multi-treatment: add another treatment — re-prompt treatment selection
  if (intent === 'add_treatment') {
    const fp2 = await buildFieldPrompt('treatment', session.context.booking, undefined, undefined, session);
    return { session, ...fp2 };
  }

  // Treatment help flow — user already set awaitingTreatmentHelp via global intent
  // ── Non-field intents — just re-prompt without penalty ──
  // If the intent is unknown or not field-specific, don't treat the text
  // as a field value. This prevents "Banana" from counting as a failed date
  // attempt (fixture 9) and "O'clock" from counting as a failed time attempt.
  if (!['provide_date', 'provide_time', 'provide_treatment',
        'correction_date', 'correction_time', 'correction_treatment',
        'date_custom', 'time_custom', 'treatment_help',
        'add_treatment', 'treatment_done'].includes(intent)) {
    const noFieldPending = computePendingFields(session.context, session.context.receivedEntities || {});
    const noFieldCurrent = noFieldPending[0];
    if (!noFieldCurrent) {
      const filledSession = { ...session };
      filledSession.state = 'BOOKING_CONFIRMATION';
      filledSession.metrics = { ...filledSession.metrics, failedAttempts: 0, messagesInState: 0, currentField: null };
      return {
        session: filledSession,
        reply: {
          body: buildConfirmationBody(filledSession.context.booking, filledSession),
          buttons: confirmationButtons(filledSession),
        },
        replyType: 'buttons',
      };
    }
    // Allow free-text name input to fall through to field processing
    if (noFieldCurrent !== 'patientName') {
      session.metrics = { ...session.metrics };
      const fp3 = await buildFieldPrompt(noFieldCurrent, session.context.booking, undefined, undefined, session);
      return { session, ...fp3 };
    }
  }

  if (session.context.awaitingTreatmentHelp && normalized?.textTrimmed) {
    session.context = { ...session.context };
    delete session.context.awaitingTreatmentHelp;
    const suggestion = recommendTreatment(normalized.textLower);
    if (suggestion) {
      entities = { ...entities, treatment: suggestion };
    } else {
      return {
        session,
        reply: {
          body: "I'm not quite sure based on what you described. Pick the closest symptom or tell me more:",
          buttonLabel: 'Select symptom',
          sections: symptomSectionsWithBack(session),
        },
        replyType: 'list',
      };
    }
  }

  // ── Determine current field being collected ──
  // Correction intents override the target field
  let targetField = null;
  if (intent.startsWith('correction_')) {
    const field = intent.replace('correction_', '');
    if (['date', 'time', 'treatment'].includes(field)) {
      targetField = field;
    }
  }

  // Determine field from intent first (if it's a provide_* intent)
  // This ensures the handler respects what the user actually said, rather
  // than always following computePendingFields order. E.g. "2pm" after "10am"
  // (fixture 10) should set time to 14:00, not try to collect treatment.
  let intentField = null;
  if (intent.startsWith('provide_')) {
    const field = intent.replace('provide_', '');
    if (['date', 'time', 'treatment'].includes(field)) {
      intentField = field;
    }
  }

  const pending = computePendingFields(session.context, session.context.receivedEntities || {});
  // Correction targets override, then intent-derived field, then pending order
  const currentField = targetField || intentField || pending[0];

  // All fields filled → go to confirmation
  if (!currentField) {
    const filledSession = { ...session };
    filledSession.state = 'BOOKING_CONFIRMATION';
    filledSession.metrics = {
      ...filledSession.metrics,
      failedAttempts: 0,
      messagesInState: 0,
      currentField: null,
    };
    return {
      session: filledSession,
      reply: {
        body: buildConfirmationBody(filledSession.context.booking, filledSession),
        buttons: confirmationButtons(session),
      },
      replyType: 'buttons',
    };
  }

  // ── Get field value from entities or text input ──
  const text = normalized ? normalized.textTrimmed : '';
  let rawValue = entities?.[currentField] || text || null;

  // Number input for treatment list
  if (!rawValue && currentField === 'treatment' && normalized) {
    const num = normalized.textTrimmed.match(/^(\d+)$/);
    if (num) {
      const idx = parseInt(num[1], 10) - 1;
      if (CLINIC.treatments[idx]) {
        rawValue = CLINIC.treatments[idx].name;
      }
    }
  }

  // ── Validate and process field value ──
  if (rawValue) {
    let validation;

    if (currentField === 'date') {
      const dateStr = rawValue instanceof Date ? rawValue.toLocaleDateString('en-CA') : rawValue;
      validation = validateDate(dateStr);
    } else if (currentField === 'time') {
      const bookingDate = session.context.booking.date ? new Date(session.context.booking.date) : new Date();
      validation = validateTime(rawValue, bookingDate);
    } else if (currentField === 'treatment') {
      validation = validateTreatment(rawValue);
    } else if (currentField === 'patientName') {
      validation = rawValue.trim().length > 0 ? { valid: true, parsed: rawValue.trim() } : { valid: false };
    }

    if (validation?.valid && validation?.parsed) {
      // ── Field value is valid — set it ──
      let setValue;
      if (currentField === 'date') {
        setValue = validation.parsed.toLocaleDateString('en-CA');
      } else if (currentField === 'treatment' && session.context.booking?.treatment) {
        const existing = session.context.booking.treatment;
        const treatments = existing.split(', ').map(t => t.trim());
        if (!treatments.includes(validation.parsed)) {
          treatments.push(validation.parsed);
        }
        setValue = treatments.join(', ');
      } else {
        setValue = validation.parsed;
      }

      const { booking, bookingTimestamps } = applyFieldOverwrite(
        session.context.booking,
        session.context.bookingTimestamps,
        currentField,
        setValue
      );

      session = {
        ...session,
        previousState: session.state,
        context: {
          ...session.context,
          booking,
          bookingTimestamps,
        },
      };

      // Try progressive fill: check if entities also contain the next field
      const filledSession = await progressiveFieldFill(session, currentField, entities);
      const newPending = computePendingFields(filledSession.context, filledSession.context.receivedEntities || {});

      if (currentField === 'treatment') {
        // Multi-treatment: ask if they want to add more
        filledSession.context.multiTreatmentActive = true;
        return {
          session: filledSession,
          reply: {
            body: `✅ *${setValue}* selected.\n\nTap "Add Another" to add more treatments or "Done" when finished.`,
            buttons: [
              { id: 'add_treatment', title: '➕ Add Another' },
              { id: 'treatment_done', title: '✅ Done' },
            ],
          },
          replyType: 'buttons',
        };
      }

      if (newPending.length === 0) {
        // All fields filled — go to confirmation
        filledSession.state = 'BOOKING_CONFIRMATION';
        filledSession.metrics = {
          ...filledSession.metrics,
          failedAttempts: 0,
          messagesInState: 0,
          currentField: null,
        };
        return {
          session: filledSession,
          reply: {
            body: buildConfirmationBody(filledSession.context.booking, filledSession),
            buttons: confirmationButtons(session),
          },
          replyType: 'buttons',
        };
      }

      // Still collecting — show next field prompt with acknowledgment
      const nextField = newPending[0];
      const ack = buildFieldAck(currentField, setValue);
      filledSession.metrics = {
        ...filledSession.metrics,
        failedAttempts: 0,
        messagesInState: 0,
        currentField: nextField,
      };

      const fp4 = await buildFieldPrompt(nextField, filledSession.context.booking, ack, undefined, filledSession);
      return { session: filledSession, ...fp4 };
    }

    // ── Invalid value — show suggestion and re-prompt ──
    session.metrics = { ...session.metrics };
    session.metrics.failedAttempts++;
    session.metrics.totalFailedAttempts = (session.metrics.totalFailedAttempts || 0) + 1;
    if (session.metrics.failedAttempts >= 3) {
      return escalateForFailure(session);
    }
    const fp5 = await buildFieldPrompt(currentField, session.context.booking, null, validation?.suggestion || '', session);
    return { session, ...fp5 };
  }

  // ── No recognizable value — re-prompt ──
  session.metrics = { ...session.metrics };
  session.metrics.failedAttempts++;
  session.metrics.totalFailedAttempts = (session.metrics.totalFailedAttempts || 0) + 1;
  if (session.metrics.failedAttempts >= 3) {
    return escalateForFailure(session);
  }
  const fp6 = await buildFieldPrompt(currentField, session.context.booking, undefined, undefined, session);
  return { session, ...fp6 };
}

// ───────────────────────────────────────────────
// Time quick pick sections
// ───────────────────────────────────────────────
function timeQuickPickSections(slots, bookingDate, bookedSet, session) {
  let availableSlots = slots;
  if (bookingDate) {
    const today = getClinicDateStr();
    const dateStr = bookingDate instanceof Date ? bookingDate.toLocaleDateString('en-CA', { timeZone: CLINIC.timeZone }) : String(bookingDate);
    if (dateStr === today) {
      const nowMinutes = getClinicMinutes();
      availableSlots = slots.filter(s => {
        const [h, m] = s.split(':').map(Number);
        return h * 60 + m > nowMinutes;
      });
    }
  }
  if (bookedSet) {
    availableSlots = availableSlots.filter(s => !bookedSet.has(s));
  }
  const picked = [];
  if (availableSlots.length > 0) picked.push(availableSlots[0]);
  if (availableSlots.length > 2) picked.push(availableSlots[Math.floor(availableSlots.length / 2)]);
  if (availableSlots.length > 1 && !picked.includes(availableSlots[availableSlots.length - 1])) picked.push(availableSlots[availableSlots.length - 1]);
  const unique = [...new Set(picked)].slice(0, 3);

  return [{
    title: session ? tr(session, 'quick_pick') : 'Quick Pick',
    rows: [
      ...unique.map(t => ({
        id: `time_${t.replace(':', '')}`,
        title: t,
      })),
      { id: 'time_other', title: tr(session, 'type_time') },
    ],
  }];
}

function timeQuickPickSectionsWithBack(slots, bookingDate, bookedSet, session) {
  const sections = timeQuickPickSections(slots, bookingDate, bookedSet, session);
  sections.push({
    title: session ? tr(session, 'navigation') : 'Navigation',
    rows: [
      { id: 'back', title: tr(session, 'back') },
      { id: 'cancel', title: tr(session, 'cancel') },
    ],
  });
  return sections;
}

async function getTimeListReply(session) {
  const dateStr = session.context?.booking?.date;
  const isSunday = dateStr ? new Date(dateStr).getDay() === 0 : false;
  const dayType = isSunday ? 'sunday' : 'weekday';
  const slots = CLINIC.slots[dayType];
  const progress = session.context?.booking?.date ? buildProgressSummary(session.context.booking, getLang(session)) : '';
  const sundayWarn = isSunday ? `\n${tr(session, 'sunday_warning')}` : '';
  const bookedTimes = dateStr ? await findBookedTimesForDate(dateStr) : [];
  const bookedSet = new Set(bookedTimes);
  const availableCount = slots ? slots.filter(s => !bookedSet.has(s)).length : 0;
  const availNote = availableCount < (slots?.length || 0)
    ? `\n${tr(session, 'slots_remaining', { booked: String(bookedTimes.length), avail: String(availableCount) })}`
    : '';
  const body = progress
    ? `${progress}${sundayWarn}${availNote}\n\n${tr(session, 'time_slots_available')}`
    : `${tr(session, 'time_slots_available')}${sundayWarn}${availNote}`;
  return {
    body,
    buttonLabel: tr(session, 'select_time'),
    sections: timeQuickPickSectionsWithBack(slots, session.context?.booking?.date, bookedSet, session),
  };
}

// ───────────────────────────────────────────────
// Date list sections
// ───────────────────────────────────────────────
function getDateQuickPickSections(session) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmt(d) {
    return `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`;
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const nextMon = new Date(today);
  nextMon.setDate(nextMon.getDate() + 1);
  while (nextMon.getDay() !== 1) nextMon.setDate(nextMon.getDate() + 1);

  return [{
    title: session ? tr(session, 'quick_pick') : 'Quick Picks',
    rows: [
      { id: 'date_today', title: `${tr(session, 'today')} (${fmt(today)})` },
      { id: 'date_tomorrow', title: `${tr(session, 'tomorrow_prefix')} (${fmt(tomorrow)})` },
      { id: 'date_next_mon', title: `${tr(session, 'next_monday_prefix')} (${fmt(nextMon)})` },
      { id: 'date_more', title: tr(session, 'more_dates_btn') },
    ],
  }];
}

function getDateMoreSections(session) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmt(d) {
    return `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`;
  }

  function toId(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `date_${y}-${m}-${day}`;
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const nextMon = new Date(today);
  nextMon.setDate(nextMon.getDate() + 1);
  while (nextMon.getDay() !== 1) nextMon.setDate(nextMon.getDate() + 1);

  const quickPickDates = [today, tomorrow, nextMon];
  function isQuickPick(d) {
    return quickPickDates.some(qd => qd.getTime() === d.getTime());
  }

  const sections = [];

  // Upcoming Dates (capped at 4 for WhatsApp 10-row limit)
  const upcomingRows = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 0) continue;
    if (isQuickPick(d)) continue;
    upcomingRows.push({ id: toId(d), title: fmt(d) });
    if (upcomingRows.length >= 4) break;
  }

  if (upcomingRows.length > 0) {
    sections.push({ title: session ? tr(session, 'upcoming_dates') : 'Upcoming Dates', rows: upcomingRows });
  }

  sections.push({
    title: session ? tr(session, 'type_date') : 'Custom',
    rows: [
      { id: 'date_other', title: tr(session, 'type_date') },
    ],
  });

  sections.push({
    title: session ? tr(session, 'navigation') : 'Navigation',
    rows: [
      { id: 'back', title: tr(session, 'back') },
      { id: 'cancel', title: tr(session, 'cancel') },
    ],
  });

  return sections;
}

function getDateListReply(body, session) {
  return {
    body,
    buttonLabel: session ? tr(session, 'select_date') : 'Select date',
    sections: getDateQuickPickSections(session),
  };
}

// ── Old handler block removed — functionality consolidated into handleBookingCollection above

function treatmentSections(session) {
  return [{
    title: session ? tr(session, 'treatments_title') : 'Available Treatments',
    rows: [
      ...CLINIC.treatments.map((t, i) => ({
        id: t.id,
        title: `${i + 1}. ${t.name}`,
        description: t.hinglish || t.symptom,
      })),
      { id: 'treatment_help', title: session ? tr(session, 'not_sure') : "I'm not sure — help me choose", description: session ? tr(session, 'describe_symptoms') : 'Describe your symptoms' },
    ],
  }];
}

function treatmentSectionsWithBack(session) {
  return [...treatmentSections(session), {
    title: session ? tr(session, 'navigation') : 'Navigation',
    rows: [
      { id: 'back', title: tr(session, 'back') },
    ],
  }];
}

function symptomSections(session) {
  return [{
    title: session ? tr(session, 'symptoms_title') : 'What brings you in?',
    rows: [
      ...CLINIC.treatments.map(t => ({
        id: t.id,
        title: t.symptom,
        description: t.hinglish || '',
      })),
      { id: 'treatment_help', title: session ? tr(session, 'tell_more') : "Something else — tell me more", description: session ? tr(session, 'treatment_help_desc') : "Describe what you're feeling" },
    ],
  }];
}

function symptomSectionsWithBack(session) {
  return [...symptomSections(session), {
    title: session ? tr(session, 'navigation') : 'Navigation',
    rows: [
      { id: 'back', title: tr(session, 'back') },
    ],
  }];
}

// ───────────────────────────────────────────────
// BOOKING_CONFIRMATION
// ───────────────────────────────────────────────
async function handleBookingConfirmation(session, intent, entities) {
  if (intent === 'confirm') {
    const booking = session.context.booking;
    let appointment;
    let isReschedule = false;

    // Blocked date check
    if (booking.date && await isDateBlocked(booking.date)) {
      return {
        session,
        reply: tr(session, 'date_unavailable'),
        replyType: 'text',
      };
    }

    // Overbooking check — limit 1 patient per time slot
    if (booking.date && booking.time) {
      const slotCount = await countAppointmentsBySlot(booking.date, booking.time);
      if (slotCount >= 1) {
        const dayType = new Date(booking.date).getDay() === 0 ? 'sunday' : 'weekday';
        const allSlots = CLINIC.slots[dayType] || CLINIC.slots.weekday;

        const nextSlots = await findNextAvailableSlots(booking.date, booking.time, allSlots, 3);

        if (nextSlots.length > 0) {
          const suggestions = nextSlots.map(t => `• ${t}`).join('\n');
          return {
            session,
            reply: tr(session, 'slot_booked', { time: booking.time, suggestions }),
            replyType: 'text',
          };
        }

        // No slots left today — suggest next available date
        const nextDate = new Date(booking.date);
        nextDate.setDate(nextDate.getDate() + 1);
        const maxLookAhead = 14;
        let suggestionDate = null;
        let suggestionSlots = [];
        for (let i = 0; i < maxLookAhead; i++) {
          const candidate = nextDate.toISOString().slice(0, 10);
          const cd = new Date(candidate);
          const cDayType = cd.getDay() === 0 ? 'sunday' : 'weekday';
          const cSlots = CLINIC.slots[cDayType] || CLINIC.slots.weekday;
          const cAvailable = await findNextAvailableSlots(candidate, '00:00', cSlots, 3);
          if (cAvailable.length > 0) {
            suggestionDate = candidate;
            suggestionSlots = cAvailable.slice(0, 2);
            break;
          }
          nextDate.setDate(nextDate.getDate() + 1);
        }

        if (suggestionDate && suggestionSlots.length > 0) {
          const dateParts = suggestionDate.split('-');
          const dateObj = new Date(+dateParts[0], +dateParts[1] - 1, +dateParts[2]);
          const lang = getLang(session);
          const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
          const dayName = dateObj.toLocaleDateString(locale, { weekday: 'long' });
          const dateLabel = dateObj.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
          const suggestions = suggestionSlots.map(t => `• ${t}`).join('\n');
          return {
            session,
            reply: tr(session, 'no_slots_today', { day: dayName, date: dateLabel, suggestions }),
            replyType: 'text',
          };
        }

        return {
          session,
          reply: tr(session, 'no_slots_later', { time: booking.time }),
          replyType: 'text',
        };
      }
    }

    // Check if this is a reschedule — supersede the existing appointment chain
    if (session.context.reschedulingLogicalId) {
      appointment = await supersedeAppointment(session.context.reschedulingLogicalId, {
        date: booking.date,
        time: booking.time,
        treatment: booking.treatment,
      });
      if (appointment) {
        isReschedule = true;
        logger.info('APPOINTMENT_RESCHEDULED', {
          waId: session.waId,
          logicalId: appointment.logical_id,
          appointmentId: appointment.id,
          version: appointment.version,
          date: booking.date,
          time: booking.time,
          treatment: booking.treatment,
        });
        session.context.logicalId = appointment.logical_id;
        session.context.appointmentId = appointment.id;
      }
      delete session.context.reschedulingLogicalId;
    } else {
      // New appointment — find or create patient record for dashboard
      let patientId = null;
      let patientPhone = '';
      try {
        const existingPatients = await findPatientsByWaId(session.waId);
        if (existingPatients.length > 0) {
          // Respect family-account selection if set
          const selectedId = session.context?.selectedPatientId;
          const match = selectedId
            ? existingPatients.find(p => p.id === selectedId)
            : null;
          patientId = match ? match.id : existingPatients[0].id;
          patientPhone = match ? match.phone : existingPatients[0].phone;

          // Save any demographics collected during booking to the patient record
          const pp = session.context?.patientProfile;
          if (pp && (pp.age || pp.sex || pp.location)) {
            const updateFields = {};
            if (pp.age) updateFields.age = pp.age;
            if (pp.sex) updateFields.sex = pp.sex;
            if (pp.location) updateFields.location = pp.location;
            await updatePatient(patientId, updateFields).catch(e =>
              logger.warn('PATIENT_DEMOGRAPHICS_UPDATE_FAILED', { patientId, error: e.message })
            );
          }
        } else {
          const pp = session.context?.patientProfile || {};
          const newPatient = await createPatient({
            name: booking.patientName || session.profileName || 'Patient',
            waId: session.waId,
            phone: session.waId,
            age: pp.age || null,
            sex: pp.sex || null,
            location: pp.location || null,
          });
          if (newPatient) {
            patientId = newPatient.id;
            patientPhone = newPatient.phone;
          }
        }
      } catch (e) {
        // Non-critical — don't block appointment creation
        logger.warn('PATIENT_LOOKUP_FAILED', { waId: session.waId, error: e.message });
      }

      appointment = await createAppointment({
        sessionId: session.id,
        waId: session.waId,
        patientName: booking.patientName || session.profileName,
        patientId,
        patientPhone,
        date: booking.date,
        time: booking.time,
        treatment: booking.treatment,
      });
      if (appointment) {
        logger.info('APPOINTMENT_CREATED', {
          waId: session.waId,
          logicalId: appointment.logical_id,
          appointmentId: appointment.id,
          version: appointment.version,
          date: booking.date,
          time: booking.time,
          treatment: booking.treatment,
        });
        session.context.logicalId = appointment.logical_id;
        session.context.appointmentId = appointment.id;
      }
    }

    if (!appointment) {
      session.metrics = { ...session.metrics, failedAttempts: session.metrics.failedAttempts + 1, messagesInState: 0 };
      return {
        session,
        reply: tr(session, 'booking_failed'),
        replyType: 'text',
      };
    }

    session = {
      ...session,
      state: 'BOOKED',
      previousState: session.state,
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };

    // Fire-and-forget doctor notification
    if (isReschedule) {
      const oldBooking = session.context.previousBooking || {};
      notifyDoctorReschedule(appointment, oldBooking.date, oldBooking.time);
      delete session.context.previousBooking;
    } else {
      notifyDoctorNewBooking(appointment);
    }

    const doctorSuffix = CLINIC.doctor?.name ? ` with Dr. ${CLINIC.doctor.name}` : '';
    const key = isReschedule ? 'rescheduled' : 'confirmed';
    const body = tr(session, key, {
      date: formatDateDisplay(booking.date, getLang(session)),
      time: formatTime(booking.time),
      treatment: booking.treatment,
      doctor: doctorSuffix,
      clinic: CLINIC.name,
    });

    return {
      session,
      reply: {
        body,
        buttonLabel: tr(session, 'select_option'),
        sections: [{
          title: tr(session, 'menu_section'),
          rows: [
            { id: 'book_another', title: tr(session, 'book_another'), description: tr(session, 'book_another_desc') },
            { id: 'resched', title: tr(session, 'reschedule_action'), description: tr(session, 'reschedule_action_desc') },
            { id: 'cancel_appt', title: tr(session, 'cancel_action'), description: tr(session, 'cancel_action_desc') },
            { id: 'main_menu', title: tr(session, 'main_menu_action'), description: tr(session, 'main_menu_action_desc') },
          ],
        }],
      },
      replyType: 'list',
    };
  }

  if (intent === 'edit_date') {
    session = {
      ...session,
      state: 'BOOKING_COLLECTION',
      context: {
        ...session.context,
        booking: { ...session.context.booking, date: null },
        receivedEntities: { ...session.context.receivedEntities, dates: [] },
      },
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: getDateListReply(tr(session, 'ask_date_again')),
      replyType: 'list',
    };
  }

  if (intent === 'edit_time') {
    session = {
      ...session,
      state: 'BOOKING_COLLECTION',
      context: {
        ...session.context,
        booking: { ...session.context.booking, time: null },
      },
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return { session, reply: tr(session, 'ask_time_again'), replyType: 'text' };
  }

  if (intent === 'edit_treatment') {
    session = {
      ...session,
      state: 'BOOKING_COLLECTION',
      context: {
        ...session.context,
        booking: { ...session.context.booking, treatment: null },
      },
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: {
        body: tr(session, 'change_treatment_q'),
        buttonLabel: tr(session, 'select_option'),
        sections: treatmentSections(session),
      },
      replyType: 'list',
    };
  }

  if (intent === 'change_booking') {
    return {
      session,
      reply: {
        body: tr(session, 'what_to_change'),
        buttonLabel: tr(session, 'select_option'),
        sections: changeOptionsSections(session),
      },
      replyType: 'list',
    };
  }

  if (intent === 'cancel' || intent === 'cancel_appointment') {
    session = {
      ...session,
      state: 'MAIN_MENU',
      context: resetBookingContext(session.context),
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: { body: tr(session, 'what_next_instead'), buttonLabel: tr(session, 'menu_section'), sections: mainMenuSections(session) },
      replyType: 'list',
    };
  }

  // Fallthrough — re-prompt the confirmation instead of cancelling
  return {
    session,
    reply: {
      body: buildConfirmationBody(session.context.booking, session),
      buttons: confirmationButtons(session),
    },
    replyType: 'buttons',
  };
}

// ───────────────────────────────────────────────
// BOOKED
// ───────────────────────────────────────────────
function handleBooked(session, intent) {
  if (intent === 'cancel_appointment') {
    return handleCancelAppointment(session);
  }

  if (intent === 'reschedule') {
    // Capture current booking summary BEFORE resetting context (for doctor notification)
    const currentSummary = buildProgressSummary(session.context.booking, getLang(session));
    session = {
      ...session,
      state: 'BOOKING_COLLECTION',
      previousState: session.state,
      context: {
        ...session.context,
        reschedulingLogicalId: session.context.logicalId,
        previousBooking: { date: session.context.booking?.date, time: session.context.booking?.time },
        booking: { date: null, time: null, treatment: null },
        receivedEntities: { dates: [], times: [], treatments: [] },
      },
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: getDateListReply(`${tr(session, 'ask_date_reschedule')}\n\n${currentSummary}`, session),
      replyType: 'list',
    };
  }

  if (intent === 'appointment') {
    session = {
      ...session,
      state: 'BOOKING_COLLECTION',
      previousState: session.state,
      context: resetBookingContext(session.context),
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: getDateListReply(tr(session, 'ask_date_quick'), session),
      replyType: 'list',
    };
  }

  return handleMainMenu(session);
}

// ───────────────────────────────────────────────
// Back navigation
// ───────────────────────────────────────────────
function handleBack(session) {
  const targetState = getNextState(session.state, 'back') || 'MAIN_MENU';
  session = { ...session, state: targetState, previousState: session.state };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };

  if (targetState === 'MAIN_MENU') {
    return {
      session,
      reply: { body: tr(session, 'what_next'), buttonLabel: tr(session, 'menu_section'), sections: mainMenuSections(session) },
      replyType: 'list',
    };
  }
  if (targetState === 'BOOKING_COLLECTION') {
    // When going back from confirmation, clear treatment so user has something
    // meaningful to re-enter instead of having all 3 fields filled and bouncing
    // right back to confirmation on any input.
    if (session.previousState === 'BOOKING_CONFIRMATION' || session.previousState === 'BOOKED') {
      session.context = {
        ...session.context,
        booking: { ...session.context.booking, treatment: null },
        receivedEntities: { ...session.context.receivedEntities, treatments: [] },
      };
    }
    return {
      session,
      reply: {
        body: 'Okay, going back. Where were we?',
        buttonLabel: 'Select',
        sections: getDateQuickPickSections(session),
      },
      replyType: 'list',
    };
  }
  // Fallback — show main menu
  return {
    session,
    reply: { body: tr(session, 'what_next'), buttonLabel: tr(session, 'menu_section'), sections: mainMenuSections(session) },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Affirm handler — user said "ok", "sure", "great" etc.
// Don't count as failure — just re-prompt the current state.
// ───────────────────────────────────────────────
async function handleAffirm(session) {
  const pending = computePendingFields(session.context, session.context.receivedEntities || {});
  const currentField = pending[0];

  session = { ...session };
  session.metrics = { ...session.metrics, messagesInState: 0 }; // Keep state, don't increment failures

  // If all fields are filled and we're in collection, bump to confirmation prompt
  if (!currentField && session.state === 'BOOKING_COLLECTION') {
    session = { ...session, state: 'BOOKING_CONFIRMATION', previousState: 'BOOKING_COLLECTION' };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0, currentField: null };
    return {
      session,
      reply: {
        body: buildConfirmationBody(session.context.booking, session),
        buttons: confirmationButtons(session),
      },
      replyType: 'buttons',
    };
  }

  // In CONFIRMATION, route "ok"/"yes"/"sure" to actually confirm the appointment
  if (session.state === 'BOOKING_CONFIRMATION') {
    // Delegate to the confirm handler — "affirm" keywords like "yes" and "ok"
    // should confirm the appointment, not just re-prompt
    return handleBookingConfirmation(session, 'confirm', {});
  }

  // For BOOKING_COLLECTION, re-prompt the current field without failure penalty
  if (session.state === 'BOOKING_COLLECTION' && currentField) {
    // Handle "ok"/"yes" to accept default name for patientName field
    if (currentField === 'patientName') {
      const defaultName = session.profileName || '';
      if (defaultName) {
        const booking = { ...session.context.booking, patientName: defaultName };
        session = {
          ...session,
          context: { ...session.context, booking },
        };
        const newPending = computePendingFields(session.context, session.context.receivedEntities || {});
        if (newPending.length === 0) {
          session = { ...session, state: 'BOOKING_CONFIRMATION', previousState: session.state };
          session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0, currentField: null };
          return {
            session,
            reply: {
              body: buildConfirmationBody(session.context.booking, session),
              buttons: confirmationButtons(session),
            },
            replyType: 'buttons',
          };
        }
        const fp7 = await buildFieldPrompt(newPending[0], session.context.booking, undefined, undefined, session);
        return {
          session: { ...session, metrics: { ...session.metrics, failedAttempts: 0 } },
          ...fp7,
        };
      }
    }
    const fp8 = await buildFieldPrompt(currentField, session.context.booking, undefined, undefined, session);
    return {
      session: { ...session, metrics: { ...session.metrics, failedAttempts: 0 } },
      ...fp8,
    };
  }

  // Reminder reply: "confirm" from IDLE/MAIN_MENU — acknowledge upcoming appointment
  if (session.state === 'IDLE' || session.state === 'MAIN_MENU' || session.state === 'DONE') {
    try {
      const appointments = await findUpcomingByWaId(session.waId);
      if (appointments && appointments.length > 0) {
        const apt = appointments[0];
        const lang = getLang(session);
        const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
        const d = new Date(apt.date + 'T' + apt.time);
        const dateStr = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
        const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
        return {
          session,
          reply: tr(session, 'confirmed_short', { date: dateStr, time: timeStr }),
          replyType: 'text',
        };
      }
    } catch {
      // DB error — fall through to default
    }
  }

  // Default: just repeat current prompt
  return { session, reply: tr(session, 'state_hint_default'), replyType: 'text' };
}

// ───────────────────────────────────────────────
// Info section options (shared by Services / Location / Timings)
// ───────────────────────────────────────────────
function infoOptionsSections(session) {
  const rows = [];
  if (session.state === 'MAIN_MENU') {
    rows.push({ id: 'apt', title: tr(session, 'book_from_info'), description: tr(session, 'book_from_info_desc') });
  }
  rows.push({ id: 'main_menu', title: tr(session, 'main_menu_action'), description: tr(session, 'main_menu_action_desc') });
  return [{ title: tr(session, 'menu_section'), rows }];
}

// ───────────────────────────────────────────────
// SERVICES — stays in current state, shows info as list
// ───────────────────────────────────────────────
function handleServices(session) {
  const servicesBullets = CLINIC.treatments.map(t => `\u2022 ${t.name}`).join('\n');
  return {
    session,
    reply: {
      body: tr(session, 'our_services', { services: servicesBullets }),
      buttonLabel: tr(session, 'select_option'),
      sections: infoOptionsSections(session),
    },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// LOCATION — stays in current state, shows info as list
// ───────────────────────────────────────────────
function handleLocation(session) {
  return {
    session,
    reply: {
      body: tr(session, 'our_location', { clinic: CLINIC.name, address: CLINIC.address, phone: CLINIC.phone, maps: CLINIC.mapsLink }),
      buttonLabel: tr(session, 'select_option'),
      sections: infoOptionsSections(session),
    },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// TIMINGS — stays in current state, shows info as list
// ───────────────────────────────────────────────
function handleTimings(session) {
  return {
    session,
    reply: {
      body: tr(session, 'clinic_hours', { weekdays: CLINIC.hours.weekday.label, sunday: CLINIC.hours.sunday.label }),
      buttonLabel: tr(session, 'select_option'),
      sections: infoOptionsSections(session),
    },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// EMERGENCY
// ───────────────────────────────────────────────
function handleEmergency(session) {
  session = {
    ...session,
    state: 'MAIN_MENU',
    previousState: session.state,
    isEscalated: true,
    context: { ...session.context, escalationReason: 'EMERGENCY' },
  };

  return {
    session,
    reply: {
      body: tr(session, 'emergency', { phone: CLINIC.phone, address: CLINIC.address }),
      buttonLabel: tr(session, 'select_option'),
      sections: mainMenuSections(session),
    },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// FEEDBACK — rating from post-visit survey
// ───────────────────────────────────────────────
async function handleFeedbackRating(session, intent, normalized) {
  const rating = intent === 'feedback_great' ? 'great' :
                 intent === 'feedback_okay' ? 'okay' : 'poor';

  const appt = await fetchLatestCompletedByWaId(session.waId);
  if (appt) {
    await insertFeedback({
      appointmentId: appt.id,
      waId: session.waId,
      rating,
    });
  }

  if (rating === 'poor') {
    return {
      session,
      reply: {
        body: tr(session, 'feedback_poor'),
        buttons: [
          { id: 'feedback_callback', title: tr(session, 'feedback_yes_call') },
          { id: 'main_menu', title: tr(session, 'feedback_no_thanks') },
        ],
      },
      replyType: 'buttons',
    };
  }

  return {
    session,
    reply: tr(session, 'feedback_thanks'),
    replyType: 'text',
  };
}

async function handleFeedbackCallback(session) {
  const appt = await fetchLatestCompletedByWaId(session.waId);
  if (appt) {
    await insertFeedback({
      appointmentId: appt.id,
      waId: session.waId,
      rating: 'poor',
      callback: true,
    });
  }
  session = { ...session, state: 'HUMAN_ESCALATION', previousState: session.state, isEscalated: true };
  return {
    session,
    reply: tr(session, 'callback_requested', { clinic: CLINIC.name }),
    replyType: 'text',
  };
}

// ───────────────────────────────────────────────
// HUMAN_ESCALATION
// ───────────────────────────────────────────────
function handleHumanEscalation(session) {
  session = {
    ...session,
    state: 'HUMAN_ESCALATION',
    previousState: session.state,
    isEscalated: true,
    context: { ...session.context, escalationReason: session.context.escalationReason || 'User requested human handoff' },
  };

  return {
    session,
    reply: tr(session, 'human_escalation', { phone: CLINIC.phone }),
    replyType: 'text',
  };
}

// ───────────────────────────────────────────────
// CALLBACK_REQUESTED
// ───────────────────────────────────────────────
function handleCallbackRequested(session, entities) {
  if (entities.phone) {
    const result = validatePhone(entities.phone);
    if (result.valid && result.parsed) {
      session = {
        ...session,
        state: 'MAIN_MENU',
        previousState: session.state,
      };
      session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };

      return {
        session,
        reply: { body: tr(session, 'callback_success', { phone: formatPhone(result.parsed) }), buttonLabel: tr(session, 'menu_section'), sections: mainMenuSections(session) },
        replyType: 'list',
      };
    }
  }

  session = { ...session };
  session.metrics = { ...session.metrics, failedAttempts: session.metrics.failedAttempts + 1, totalFailedAttempts: session.metrics.totalFailedAttempts + 1 };
  return { session, reply: tr(session, 'ask_phone_hi'), replyType: 'text' };
}

// ───────────────────────────────────────────────
// Unknown / Fallback
// ───────────────────────────────────────────────
function handleUnknown(session, normalized) {
  const textLower = (normalized && normalized.textLower) || '';
  const frustration = calculateFrustration(session, textLower);

  session = { ...session };
  session.metrics = {
    ...session.metrics,
    failedAttempts: session.metrics.failedAttempts + 1,
    totalFailedAttempts: session.metrics.totalFailedAttempts + 1,
    frustrationScore: frustration,
  };

  // Offer escalation if frustration >= 4
  if (frustration >= 4) {
    return {
      session,
      reply: tr(session, 'escalate', { phone: CLINIC.phone }),
      replyType: 'text',
    };
  }

  // Context-aware reprompt
  const hints = {
    BOOKING_COLLECTION:   tr(session, 'state_hint_collecting'),
    BOOKING_CONFIRMATION: tr(session, 'state_hint_confirming'),
    MAIN_MENU:            tr(session, 'state_hint_options'),
    CANCEL_CONFIRM:       tr(session, 'state_hint_cancelling'),
  };

  const hint = hints[session.state] || tr(session, 'state_hint_default');
  return { session, reply: tr(session, 'fallback', { hint }), replyType: 'text' };
}

function buildResumePrompt(booking, pendingFields, lang) {
  const progress = booking ? buildProgressSummary(booking, lang) : '';
  const nextField = pendingFields && pendingFields[0];

  if (!nextField) {
    return progress ? `${progress}\n\nAll set! Ready to confirm?` : 'Ready to confirm your appointment?';
  }

  const fieldHints = {
    date: lang === 'hi' ? 'Kaunsi date chahiye?' : 'What date works for you?',
    time: lang === 'hi' ? 'Kaunsa samay chahiye?' : 'What time works for you?',
    treatment: lang === 'hi' ? 'Kya problem hai?' : 'What seems to be the problem?',
  };

  const hint = fieldHints[nextField] || (lang === 'hi' ? 'Kahan the hum?' : 'Where were we?');

  if (progress && progress !== '📋 ') {
    return `${progress}\n\n${hint}`;
  }

    return `${lang === 'hi' ? 'Hum aapka appointment book kar rahe the.' : 'We were booking your appointment.'} ${hint}`;
}

// ───────────────────────────────────────────────
// Greeting (handles greeting intent globally)
// ───────────────────────────────────────────────
function handleGreeting(session) {
  // If currently in EMERGENCY, treat greeting as wanting to exit to main menu
  if (session.state === 'EMERGENCY' || session.state === 'HUMAN_ESCALATION') {
    return handleMainMenu(session);
  }

  // ABANDONED — check for partial booking to resume
  if (session.state === 'ABANDONED') {
    const hasPartialBooking = session.context?.booking?.date || session.context?.booking?.time || session.context?.booking?.treatment;
    if (hasPartialBooking && session.previousState) {
      session = { ...session, state: session.previousState, previousState: 'ABANDONED' };
      session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
      return handleGreeting(session);
    }
    // No partial booking — fall through to isNew below
  }

  const isNew = session.state === 'IDLE' || session.state === 'DONE';

  if (isNew) {
    session = { ...session, state: 'MAIN_MENU', previousState: session.state };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: {
        body: tr(session, 'welcome', { clinic: CLINIC.name }),
        buttonLabel: tr(session, 'select_option'),
        sections: mainMenuSections(session),
      },
      replyType: 'list',
    };
  }

  // Returning user — show interactive list for field collection
  if (session.state === 'BOOKING_COLLECTION') {
    const pending = computePendingFields(session.context, session.context.receivedEntities || {});
    if (pending.length === 0) {
      return {
        session,
        reply: {
          body: buildConfirmationBody(session.context.booking, session),
          buttons: confirmationButtons(session),
        },
        replyType: 'buttons',
      };
    }
    return {
      session,
      reply: {
        body: tr(session, 'welcome_back') + ' ' + buildResumePrompt(session.context.booking, pending, getLang(session)),
        buttonLabel: tr(session, 'select_option'),
        sections:           pending[0] === 'date' ? getDateQuickPickSections(session) :
          pending[0] === 'time' ? timeQuickPickSectionsWithBack(CLINIC.slots.weekday, session.context?.booking?.date, undefined, session) :
          symptomSectionsWithBack(session),
      },
      replyType: 'list',
    };
  }

  const greeting = STATE_GREETING[session.state] || tr(session, 'welcome_back_short');

  if (session.state === 'BOOKING_CONFIRMATION') {
    return {
      session,
      reply: {
        body: buildConfirmationBody(session.context.booking, session),
        buttons: confirmationButtons(session),
      },
      replyType: 'buttons',
    };
  }

  if (session.state === 'BOOKED') {
    return {
      session,
      reply: {
        body: greeting,
        buttonLabel: tr(session, 'select_option'),
        sections: [{
          title: tr(session, 'menu_section'),
          rows: [
            { id: 'book_another', title: tr(session, 'book_another'), description: tr(session, 'book_another_desc') },
            { id: 'resched', title: tr(session, 'reschedule_action'), description: tr(session, 'reschedule_action_desc') },
            { id: 'cancel_appt', title: tr(session, 'cancel_action'), description: tr(session, 'cancel_action_desc') },
            { id: 'main_menu', title: tr(session, 'main_menu_action'), description: tr(session, 'main_menu_action_desc') },
          ],
        }],
      },
      replyType: 'list',
    };
  }

  if (session.state === 'MAIN_MENU') {
    return {
      session,
      reply: { body: greeting, buttonLabel: tr(session, 'select_option'), sections: mainMenuSections(session) },
      replyType: 'list',
    };
  }

  return {
    session,
    reply: `${greeting}`,
    replyType: 'text',
  };
}

// ───────────────────────────────────────────────
// Cancel Appointment (from BOOKED or when user wants to cancel an existing booking)
// ───────────────────────────────────────────────
function handleCancelAppointment(session) {
  session = {
    ...session,
    state: 'CANCEL_CONFIRM',
    previousState: session.state,
  };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
  return {
    session,
    reply: {
      body: tr(session, 'confirm_cancel'),
      buttonLabel: tr(session, 'select_option'),
      sections: [{
        title: tr(session, 'cancel_section'),
        rows: [
          { id: 'confirm_cancel_yes', title: tr(session, 'yes_cancel') },
          { id: 'confirm_cancel_no', title: tr(session, 'no_keep') },
        ],
      }],
    },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Confirm Cancel
// ───────────────────────────────────────────────
async function handleCancelConfirm(session, intent) {
  if (intent === 'confirm_cancel') {
    // Cancel in DB (await result for audit accuracy)
    const appointmentId = session.context.appointmentId;
    let cancelled = false;
    if (appointmentId) {
      const result = await cancelAppointment(appointmentId, 'Cancelled by patient').catch(() => null);
      if (result) {
        cancelled = true;
        logger.info('APPOINTMENT_CANCELLED', { waId: session.waId, appointmentId, reason: 'Cancelled by patient' });
      }
    }

    session = {
      ...session,
      state: 'MAIN_MENU',
      context: resetBookingContext(session.context),
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };

    if (cancelled) {
      // Fire-and-forget doctor notification
      if (appointmentId) {
        const appt = session.context.booking || {};
        notifyDoctorCancellation({ ...appt, id: appointmentId, patient_name: session.profileName, patient_phone: session.waId });
      }

      // Fire-and-forget the main menu after a short delay so the empathetic
      // cancellation message lands first and breathes before options appear
      setTimeout(() => {
        sendList(session.waId, tr(session, 'what_next'), tr(session, 'menu_section'), mainMenuSections(session)).catch(() => {});
      }, 1500);

      return {
        session,
        reply: tr(session, 'cancelled'),
        replyType: 'text',
      };
    }

    return {
      session,
      reply: tr(session, 'cancel_failed', { phone: CLINIC.phone }),
      replyType: 'text',
    };
  }

  // If back / no — go back to BOOKED
  if (session.previousState === 'BOOKED') {
    return showBookedSummary(session);
  }

  // Fallback: go to main menu (preserve context — don't use resetBookingContext)
  session = { ...session, state: 'MAIN_MENU', previousState: session.state };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
  return {
    session,
    reply: { body: tr(session, 'what_next_instead'), buttonLabel: tr(session, 'menu_section'), sections: mainMenuSections(session) },
    replyType: 'list',
  };
}

function showBookedSummary(session) {
  const booking = session.context.booking;
  session = { ...session, state: 'BOOKED', previousState: session.state };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
  const doctorSuffix = CLINIC.doctor?.name ? ` with Dr. ${CLINIC.doctor.name}` : '';
  return {
    session,
    reply: {
      body: tr(session, 'your_appt', {
        date: formatDateDisplay(booking.date, getLang(session)),
        time: formatTime(booking.time),
        treatment: `${booking.treatment}${doctorSuffix}`,
      }),
      buttonLabel: tr(session, 'select_option'),
      sections: [{
        title: tr(session, 'menu_section'),
        rows: [
          { id: 'book_another', title: tr(session, 'book_another'), description: tr(session, 'book_another_desc') },
          { id: 'resched', title: tr(session, 'reschedule_action'), description: tr(session, 'reschedule_action_desc') },
          { id: 'cancel_appt', title: tr(session, 'cancel_action'), description: tr(session, 'cancel_action_desc') },
          { id: 'main_menu', title: tr(session, 'main_menu_action'), description: tr(session, 'main_menu_action_desc') },
        ],
      }],
    },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// My Appointments (async — look up and return the correct reply directly)
// ───────────────────────────────────────────────
async function handleMyAppointments(session) {
  session = { ...session, state: 'MAIN_MENU', previousState: session.state };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };

  try {
    const appointments = await findUpcomingByWaId(session.waId);

    if (!appointments || appointments.length === 0) {
      return {
        session,
        reply: {
          body: tr(session, 'no_appointments'),
          buttonLabel: tr(session, 'menu_section'),
          sections: mainMenuSections(session),
        },
        replyType: 'list',
      };
    }

    const doctorSuffix = CLINIC.doctor?.name ? ` with Dr. ${CLINIC.doctor.name}` : '';
    const lang = getLang(session);
    const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
    let body = '📋 *Your Upcoming Appointments*\n\n';
    appointments.forEach((apt, i) => {
      const d = new Date(apt.date + 'T' + apt.time);
      body += `${i + 1}. ${d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })} at ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true })}\n`;
      body += `   Treatment: ${apt.treatment || 'N/A'}${doctorSuffix}\n`;
      body += `   Status: ${apt.status}\n\n`;
    });
    body += 'Tap "Main Menu" to continue.';

    return {
      session,
      reply: { body, buttonLabel: tr(session, 'menu_section'), sections: mainMenuSections(session) },
      replyType: 'list',
    };
  } catch {
    // DB error fallback — just show the main menu
    return {
      session,
      reply: { body: tr(session, 'welcome', { clinic: CLINIC.name }), buttonLabel: tr(session, 'select_option'), sections: mainMenuSections(session) },
      replyType: 'list',
    };
  }
}

// ───────────────────────────────────────────────
// Global Cancel handler (state-aware)
// ───────────────────────────────────────────────
async function handleCancel(session) {
  // If user has an appointment (either in BOOKED state or session has appointmentId),
  // offer cancellation flow
  if (session.state === 'BOOKED' || session.context.appointmentId) {
    return handleCancelAppointment(session);
  }

  // Reminder reply: "cancel" from IDLE/MAIN_MENU — look up upcoming appointment
  if (!session.context.appointmentId && (session.state === 'IDLE' || session.state === 'MAIN_MENU' || session.state === 'DONE')) {
    try {
      const appointments = await findUpcomingByWaId(session.waId);
      if (appointments && appointments.length > 0) {
        const apt = appointments[0];
        session = {
          ...session,
          state: 'CANCEL_CONFIRM',
          previousState: session.state,
          context: {
            ...session.context,
            appointmentId: apt.id,
            logicalId: apt.logical_id,
            booking: {
              date: apt.date,
              time: apt.time,
              treatment: apt.treatment,
              patientName: apt.patient_name,
            },
          },
        };
        session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
        return {
          session,
          reply: {
            body: tr(session, 'sure_cancel'),
            buttonLabel: tr(session, 'select_option'),
            sections: [{
              title: tr(session, 'cancel_section'),
              rows: [
                { id: 'confirm_cancel_yes', title: tr(session, 'yes_cancel') },
                { id: 'confirm_cancel_no', title: tr(session, 'no_keep') },
              ],
            }],
          },
          replyType: 'list',
        };
      }
    } catch {
      // DB error — fall through to reset
    }
  }

  // Otherwise: reset booking context, go to main menu
  session = {
    ...session,
    state: 'MAIN_MENU',
    context: resetBookingContext(session.context),
  };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0, frustrationScore: 0, currentField: null };
  return {
    session,
    reply: { body: tr(session, 'what_next_instead'), buttonLabel: tr(session, 'menu_section'), sections: mainMenuSections(session) },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────

/**
 * Build a contextual acknowledgment message after successfully collecting a field.
 */
function buildFieldAck(field, value) {
  if (field === 'date') {
    const d = new Date(value);
    const formatted = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const isSunday = d.getDay() === 0;
    const sundayWarn = isSunday ? `\n⚠️ Sunday hours: ${CLINIC.hours.sunday.label}` : '';
    return pick([
       `${formatted} works. 📅${sundayWarn}`,
       `Great, ${formatted}.${sundayWarn}`,
       `Okay, ${formatted}. 📅${sundayWarn}`,
    ]);
  }
  if (field === 'time') {
    const formatted = new Date(`2000-01-01T${value}`).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return pick([
       `${formatted} works. ⏰`,
       `Okay, ${formatted}.`,
       `Great, ${formatted}. ⏰`,
    ]);
  }
  if (field === 'treatment') {
    const treatment = CLINIC.treatments.find(t => t.name === value);
    const label = treatment ? treatment.symptom : value;
    return pick([
       `${label} noted. 🦷`,
       `Okay, ${label}.`,
    ]);
  }
  if (field === 'patientName') {
    return pick([
      `Thanks, ${value}!`,
      `${value} — noted!`,
    ]);
  }
  return '';
}

/**
 * Build the reply for prompting the next field to collect.
 * Returns { reply, replyType } suitable for spreading into the handler result.
 */
async function buildFieldPrompt(field, booking, ack, suggestion, session) {
  const progress = buildProgressSummary(booking);
  let body = '';

  if (ack) {
    body = ack;
  } else if (progress && field !== 'date') {
    // Show progress summary for non-date fields (date hasn't been set yet at that point)
    body = progress;
  }

  if (field === 'date') {
    const prompt = suggestion || tr(session, 'ask_date');
    const fullBody = body ? `${body}\n\n${prompt}` : prompt;
    return {
      reply: { body: fullBody, buttonLabel: tr(session, 'select_date'), sections: getDateQuickPickSections(session) },
      replyType: 'list',
    };
  }
  if (field === 'time') {
    const dateStr = booking?.date;
    const isSunday = dateStr ? new Date(dateStr).getDay() === 0 : false;
    const dayType = isSunday ? 'sunday' : 'weekday';
    const slots = CLINIC.slots[dayType] || CLINIC.slots.weekday;
    const sundayWarn = isSunday ? `\n${tr(session, 'sunday_warning')}` : '';
    let bookedSet;
    if (dateStr) {
      const bookedTimes = await findBookedTimesForDate(dateStr);
      bookedSet = new Set(bookedTimes);
    }
    const bookedCount = bookedSet ? bookedSet.size : 0;
    const totalSlots = slots ? slots.length : 0;
    const availCount = totalSlots - bookedCount;
    const availNote = bookedCount > 0
      ? `\n${tr(session, 'slots_remaining', { booked: String(bookedCount), avail: String(availCount) })}`
      : '';
    const prompt = suggestion
      ? `${tr(session, 'ask_time')}\n${suggestion}`
      : tr(session, 'time_slots_available');
    const fullBody = body ? `${body}${sundayWarn}${availNote}\n\n${prompt}` : `${prompt}${sundayWarn}${availNote}`;
    return {
        reply: { body: fullBody, buttonLabel: tr(session, 'select_time'), sections: timeQuickPickSectionsWithBack(slots, booking?.date, bookedSet, session) },
      replyType: 'list',
    };
  }
  if (field === 'treatment') {
    const prompt = suggestion || tr(session, 'ask_treatment');
    const fullBody = body ? `${body}\n\n${prompt}` : prompt;
    return {
      reply: { body: fullBody, buttonLabel: tr(session, 'select_option'), sections: symptomSectionsWithBack(session) },
      replyType: 'list',
    };
  }
  if (field === 'patientName') {
    const defaultName = session?.profileName || '';
    const nameHint = defaultName ? `\n\n${tr(session, 'name_default', { name: defaultName })}` : '';
    const prompt = suggestion || `${tr(session, 'ask_name')}${nameHint}`;
    const fullBody = body ? `${body}\n\n${prompt}` : prompt;      return {
      reply: fullBody,
      replyType: 'text',
    };
  }

  // Fallback
  return { reply: body || tr(session, 'what_next'), replyType: 'text' };
}

function resetBookingContext(context) {
  return {
    ...context,
    booking: { date: null, time: null, treatment: null, patientName: null, patientPhone: null, notes: null },
    bookingTimestamps: { date: null, time: null, treatment: null },
    pendingFields: ['date', 'time', 'treatment'],
    receivedEntities: { dates: [], times: [], treatments: [] },
    lastCorrection: { field: null, fromValue: null, toValue: null, timestamp: null },
    reschedulingLogicalId: null,
    escalationReason: null,
    awaitingTreatmentHelp: null,
  };
}

function buildConfirmationBody(booking, session) {
  const doctorSuffix = CLINIC.doctor?.name ? ` with Dr. ${CLINIC.doctor.name}` : '';
  const name = booking?.patientName || (session ? firstName(session) : '');
  return tr(session, 'booking_summary', {
    name,
    date: formatDateDisplay(booking.date, getLang(session)),
    time: formatTime(booking.time),
    treatment: booking.treatment,
    doctor: doctorSuffix,
    clinic: CLINIC.name,
  });
}

function confirmationSections(session) {
  return [{
    title: tr(session, 'confirm_section'),
    rows: [
      { id: 'confirm',    title: tr(session, 'confirm_btn'),      description: tr(session, 'confirm_desc') },
      { id: 'edit_date',  title: tr(session, 'change_date'),      description: tr(session, 'change_date_desc') },
      { id: 'edit_time',  title: tr(session, 'change_time'),      description: tr(session, 'change_time_desc') },
      { id: 'cancel',     title: tr(session, 'cancel_btn'),       description: tr(session, 'cancel_desc') },
    ],
  }];
}

function confirmationSectionsWithBack(session) {
  return [...confirmationSections(session), {
    title: tr(session, 'menu_section'),
    rows: [
      { id: 'back', title: tr(session, 'back') },
    ],
  }];
}

function confirmationButtons(session) {
  return [
    { id: 'confirm', title: tr(session, 'confirm_btn') },
    { id: 'change',  title: tr(session, 'change_btn') },
    { id: 'cancel',  title: tr(session, 'cancel_btn') },
  ];
}

function changeOptionsSections(session) {
  return [{
    title: tr(session, 'what_to_change'),
    rows: [
      { id: 'edit_date', title: tr(session, 'change_date') },
      { id: 'edit_time', title: tr(session, 'change_time') },
      { id: 'edit_treatment', title: tr(session, 'change_treatment_q') },
      { id: 'back',      title: tr(session, 'back') },
    ],
  }];
}

function buildProgressSummary(booking, lang) {
  const parts = [];
  if (booking.date) parts.push(formatDateDisplay(booking.date, lang));
  if (booking.time) parts.push(formatTime(booking.time));
  if (booking.treatment) parts.push(booking.treatment);
  return `📋 ${parts.join(' · ')}`;
}

function recommendTreatment(text) {
  const lower = text.toLowerCase();
  const matches = CLINIC.treatments.map(t => {
    const matched = t.aliases.filter(a => new RegExp('\\b' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(lower)).length;
    return { treatment: t.name, score: matched };
  }).filter(m => m.score > 0);
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.score - a.score);
  return matches[0].treatment;
}

function formatDateDisplay(dateStr, lang) {
  if (!dateStr) return 'TBD';
  const d = new Date(dateStr);
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  return d.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ───────────────────────────────────────────────
// Help handler
// ───────────────────────────────────────────────
function handleHelp(session) {
  const hints = {
    BOOKING_COLLECTION:   tr(session, 'state_hint_collecting'),
    BOOKING_CONFIRMATION: tr(session, 'state_hint_confirming'),
    MAIN_MENU:            tr(session, 'state_hint_options'),
    EMERGENCY:            tr(session, 'state_hint_collecting'),
    HUMAN_ESCALATION:     tr(session, 'state_hint_collecting'),
    CALLBACK_REQUESTED:   tr(session, 'ask_phone'),
  };

  const hint = hints[session.state] || tr(session, 'state_hint_default');
  return {
    session,
    reply: tr(session, 'help_intro', { hint }),
    replyType: 'text',
  };
}

function escalateForFailure(session) {
  session = {
    ...session,
    state: 'HUMAN_ESCALATION',
    previousState: session.state,
    isEscalated: true,
    context: { ...session.context, escalationReason: 'Failed to provide valid input after repeated attempts' },
  };
  return {
    session,
    reply: tr(session, 'escalation_failed', { phone: CLINIC.phone }),
    replyType: 'text',
  };
}

// ───────────────────────────────────────────────
// Notify doctor proactively (fire-and-forget)
// ───────────────────────────────────────────────
async function notifyDoctor(body) {
  if (!CLINIC.doctor?.waId) return;
  try {
    await sendText(CLINIC.doctor.waId, body);
  } catch (error) {
    logger.error('DOCTOR_NOTIFY_ERROR', { error: error.message });
  }
}

// ───────────────────────────────────────────────
// Doctor dispatch
// ───────────────────────────────────────────────
async function handleDoctorDispatch(session, normalized, entities, intent) {
  // Media message handling (images, audio) — intercept before state routing
  if (normalized?.hasMedia && normalized?.mediaId) {
    return handleDoctorMediaMessage(session, normalized, intent);
  }

  // Pending media: doctor sent an image earlier, now replying with patient name
  if (session.context?.pendingMedia && session.state !== 'DOCTOR_SEARCH_PATIENT') {
    const text = (normalized?.textClean || '').trim();
    if (text && text.length >= 2) {
      session = {
        ...session,
        state: 'DOCTOR_SEARCH_PATIENT',
        context: { ...session.context, pendingMediaQuery: text },
      };
      return handleDoctorMediaPatientLookup(session, text);
    }
  }

  // Transcription flow: accept/edit/re-record transcribed audio
  if (session.context?.pendingTranscription) {
    const pt = session.context.pendingTranscription;
    if (intent === 'transcription_accept') {
      session = await applyTranscribedNotes(session, pt);
      return handleLogNotes(session, normalized, 'provide_notes');
    }
    if (intent === 'transcription_edit') {
      session = {
        ...session,
        context: { ...session.context, pendingTranscription: undefined, visitLog: { ...(session.context.visitLog || {}), notes: pt } },
      };
      return { session, reply: `*Current text:* "${pt}"\n\nEdit or type your notes:`, replyType: 'text' };
    }
    if (intent === 'transcription_rerrecord') {
      session = { ...session, context: { ...session.context, pendingTranscription: undefined } };
      return { session, reply: 'Send the audio note again:', replyType: 'text' };
    }
  }

  // Back navigation handled first
  if (intent === 'back') return handleDoctorBack(session);

  // Evening check-in: mark no-show by time — detect "missed <time>" or "<time> noshow" pattern
  if (intent === 'unknown' && entities?.time) {
    const text = normalized?.textLower || '';
    if (/\b(missed|noshow|no.?show|didn.?t.?come|absent)\b/i.test(text)) {
      return handleDoctorEveningNoshow(session, entities.time);
    }
  }

  switch (session.state) {
    case 'DOCTOR_MAIN_MENU':
      return handleDoctorMainMenu(session, intent);
    case 'DOCTOR_VIEW_DATE':
      return handleDoctorViewDate(session, entities, intent);
    case 'DOCTOR_APPOINTMENT_LIST':
      return handleDoctorAppointmentList(session, entities, intent);
    case 'DOCTOR_APPOINTMENT_DETAIL':
      return handleDoctorAppointmentDetail(session, entities, intent);
    case 'DOCTOR_MANAGE_SCHEDULE':
      return handleDoctorManageSchedule(session, intent, entities);
    case 'DOCTOR_STATS':
      return handleDoctorStats(session);
    case 'REGISTER_NAME':
      return handleRegisterName(session, normalized, intent);
    case 'REGISTER_AGE':
      return handleRegisterAge(session, normalized, intent);
    case 'REGISTER_SEX':
      return handleRegisterSex(session, normalized, intent);
    case 'REGISTER_PHONE':
      return handleRegisterPhone(session, normalized, intent);
    case 'REGISTER_APPOINTMENT':
      return handleRegisterAppointment(session, intent, entities, normalized);
    case 'LOG_TREATMENT':
      return handleLogTreatment(session, normalized, intent);
    case 'LOG_CONSULTATION_FEE':
      return handleLogConsultationFee(session, normalized, intent);
    case 'LOG_TREATMENT_CHARGES':
      return handleLogTreatmentCharges(session, normalized, intent);
    case 'LOG_MEDICINE_CHARGES':
      return handleLogMedicineCharges(session, normalized, intent);
    case 'LOG_NEXT_VISIT':
      return handleLogNextVisit(session, normalized, intent);
    case 'LOG_NOTES':
      return handleLogNotes(session, normalized, intent);
    case 'LOG_MEDIA':
      return handleLogMedia(session, normalized, intent);
    case 'DOCTOR_SEARCH_PATIENT':
      return handleDoctorSearchPatient(session, normalized, intent, entities);
    case 'DOCTOR_VIEW_CHIT':
      return handleDoctorViewChit(session, normalized, intent, entities);
    case 'DOCTOR_PATIENT_VISITS':
      return handleDoctorPatientVisits(session, normalized, intent, entities);
    case 'DOCTOR_VIEW_QUEUE':
      if (intent === 'doctor_call_patient') return handleDoctorCallPatient(session, entities);
      if (intent === 'doctor_call_next') return handleDoctorCallNext(session);
      if (intent === 'queue_mark_arrived') return handleDoctorMarkArrived(session, entities);
      return handleDoctorViewQueue(session);
    case 'DOCTOR_LOG_VISIT_NAME':
      return handleDoctorLogVisitName(session, normalized, intent, entities);
    case 'DOCTOR_FEEDBACK':
      return handleDoctorFeedback(session);
    case 'DOCTOR_VIEW_MESSAGES': {
      const pId = session.context?.selectedPatient;
      if (!pId) return handleDoctorMainMenu(session);
      return handleDoctorViewMessages(session, pId);
    }
    case 'DOCTOR_EDIT_PATIENT':
      return handleDoctorEditPatient(session, normalized, intent, entities);
    default:
      return handleDoctorGreeting(session);
  }
}

function handleDoctorBack(session) {
  const targetState = getNextState(session.state, 'back') || 'DOCTOR_MAIN_MENU';
  session = { ...session, state: targetState, previousState: session.state };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };

  if (targetState === 'DOCTOR_MAIN_MENU') {
    return handleDoctorMainMenu(session);
  }

  return handleDoctorMainMenu(session);
}

// ───────────────────────────────────────────────
// Doctor media message handling
// ───────────────────────────────────────────────
async function handleDoctorMediaMessage(session, normalized, intent) {
  const mediaId = normalized.mediaId;
  const mimeType = normalized.mimeType;
  const apptId = session.context?.selectedAppointmentId;
  const vl = session.context?.visitLog || {};
  const logApptId = vl.appointmentId;
  const currentApptId = apptId || logApptId;

  // Case 1: Doctor is in LOG_MEDIA flow — save media and proceed to finalize visit
  if (session.state === 'LOG_MEDIA') {
    if (currentApptId) {
      await processAndStoreMedia({
        mediaId,
        mimeType,
        appointmentId: currentApptId,
        waId: normalized.waId,
        patientId: null,
      });
    }
    // Continue to finalize the visit save
    return handleLogMedia(session, normalized, 'skip_media');
  }

  // Case 2: Doctor is in LOG_NOTES — try to transcribe audio into notes
  if (session.state === 'LOG_NOTES' && mimeType?.startsWith('audio/')) {
    const download = await downloadMediaFromMeta(mediaId);
    if (download) {
      await processAndStoreMedia({ mediaId, mimeType, appointmentId: currentApptId, waId: normalized.waId, patientId: null });
      const text = await transcribeAudio(download.buffer, download.mimeType);
      if (text) {
        session = {
          ...session,
          context: {
            ...session.context,
            pendingTranscription: text,
          },
        };
        return {
          session,
          reply: {
            body: `✅ *Transcribed:* "${text}"\n\nAccept, edit, or re-record?`,
            buttons: [
              { id: 'transcription_accept', title: '✅ Accept' },
              { id: 'transcription_edit', title: '✏️ Edit' },
              { id: 'transcription_rerrecord', title: '🔁 Re-record' },
            ],
          },
          replyType: 'buttons',
        };
      }
    }
    // Fallback: ask for typed notes
    return {
      session,
      reply: 'Could not transcribe audio. Please type your notes:',
      replyType: 'text',
    };
  }

  // Case 3: Doctor is viewing an appointment detail — save media directly
  if (session.state === 'DOCTOR_APPOINTMENT_DETAIL' && currentApptId) {
    await processAndStoreMedia({
      mediaId,
      mimeType,
      appointmentId: currentApptId,
      waId: normalized.waId,
      patientId: null,
    });
    return {
      session,
      reply: '*✅ Media saved to this appointment.*',
      replyType: 'text',
    };
  }

  // Case 3: No active context — ask which patient
  const mediaType = mimeType?.startsWith('audio/') ? 'audio' : 'image';
  const mediaIcon = mediaType === 'audio' ? '🎵' : '📷';
  session = {
    ...session,
    context: {
      ...session.context,
      pendingMedia: { mediaId, mimeType },
    },
  };

  return {
    session,
    reply: `${mediaIcon} *Got the ${mediaType}.* Which patient? Type the name or phone number:`,
    replyType: 'text',
  };
}

// ───────────────────────────────────────────────
// Apply transcribed audio as notes to visit log
// ───────────────────────────────────────────────
async function applyTranscribedNotes(session, transcribedText) {
  session = {
    ...session,
    context: {
      ...session.context,
      pendingTranscription: undefined,
      visitLog: {
        ...(session.context.visitLog || {}),
        notes: transcribedText,
      },
    },
  };
  return session;
}

// ───────────────────────────────────────────────
// Doctor greeting — triggered on first message
// ───────────────────────────────────────────────
async function handleDoctorGreeting(session) {
  session = { ...session, state: 'DOCTOR_MAIN_MENU' };
  return handleDoctorMainMenuWithGreeting(session);
}

function formatDatePretty(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(parts[1], 10) - 1;
  return `${parseInt(parts[2], 10)} ${months[monthIdx]}`;
}

function formatDayName(date) {
  if (!date) return '';
  if (typeof date === 'string') {
    const [y, m, d] = date.slice(0, 10).split('-').map(Number);
    date = new Date(y, m - 1, d);
  }
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
}

async function buildDoctorMainMenuBody(session, includeGreeting = false) {
  const doctorName = CLINIC.doctor?.name || 'Doctor';
  let body = '';

  if (includeGreeting) {
    const hour = Math.floor(getClinicMinutes() / 60);
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    body += `${greeting}, ${doctorName}! 👋\n\n`;
  }

  const today = getClinicDateStr();
  const appointments = await fetchAppointmentsByDate(today);
  const count = appointments.length;

  body += `*📅 Today's Summary*\n`;
  body += `Appointments: ${count}\n\n`;

  body += `*Choose an option:*`;

  return body;
}

async function handleDoctorMainMenuWithGreeting(session) {
  const body = await buildDoctorMainMenuBody(session, true);
  return {
    session,
    reply: { body, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
    replyType: 'list',
  };
}

function getDoctorMenuSections() {
  return [
    {
      title: 'Queue',
      rows: [
        { id: 'doc_view_queue', title: '🚶 View Queue' },
        { id: 'doc_call_next', title: '📞 Call Next Patient' },
      ],
    },
    {
      title: 'Quick Actions',
      rows: [
        { id: 'doc_log_visit', title: '📝 Log Visit for Walk-in' },
      ],
    },
    {
      title: 'Appointments',
      rows: [
        { id: 'doc_today', title: '📋 Today\'s Appointments' },
        { id: 'doc_by_date', title: '📅 View by Date' },
      ],
    },
    {
      title: 'Patients',
      rows: [
        { id: 'search_pt', title: '🔍 Search Patient' },
        { id: 'register', title: '➕ Register New Patient' },
      ],
    },
    {
      title: 'Schedule & Reports',
      rows: [
        { id: 'doc_schedule', title: '⚙️ Manage Schedule' },
        { id: 'doc_stats', title: '📊 View Stats' },
        { id: 'doc_feedback', title: '💬 View Feedback' },
      ],
    },
  ];
}

// ───────────────────────────────────────────────
// Doctor main menu handler
// ───────────────────────────────────────────────
async function handleDoctorMainMenu(session, intent) {
  if (intent === 'doctor_view_today') {
    return handleDoctorViewToday(session);
  }
  if (intent === 'doctor_view_by_date') {
    session = { ...session, state: 'DOCTOR_VIEW_DATE' };
    return {
      session,
      reply: {
        body: 'Enter a date (DD-MM-YYYY) or select from the options below:',
        buttonLabel: 'Quick pick',
        sections: getDateQuickPickSections(session),
      },
      replyType: 'list',
    };
  }
  if (intent === 'doctor_manage_schedule') {
    session = { ...session, state: 'DOCTOR_MANAGE_SCHEDULE' };
    return handleDoctorManageSchedule(session);
  }
  if (intent === 'doctor_view_stats') {
    session = { ...session, state: 'DOCTOR_STATS' };
    return handleDoctorStats(session);
  }
  if (intent === 'doctor_register_patient') {
    session = { ...session, state: 'REGISTER_NAME', context: { ...session.context, registration: {} } };
    return {
      session,
      reply: 'Enter patient name:',
      replyType: 'text',
    };
  }
  if (intent === 'doctor_search_patient') {
    session = { ...session, state: 'DOCTOR_SEARCH_PATIENT' };
    return {
      session,
      reply: 'Enter patient name or phone number:',
      replyType: 'text',
    };
  }
  if (intent === 'doctor_view_queue') {
    return handleDoctorViewQueue(session);
  }
  if (intent === 'doctor_call_next') {
    return handleDoctorCallNext(session);
  }
  if (intent === 'doctor_log_visit') {
    session = { ...session, state: 'DOCTOR_LOG_VISIT_NAME', context: { ...session.context, logVisitSearch: undefined } };
    return {
      session,
      reply: 'Enter the walk-in patient name:',
      replyType: 'text',
    };
  }
  if (intent === 'doctor_view_feedback') {
    session = { ...session, state: 'DOCTOR_FEEDBACK' };
    return handleDoctorFeedback(session);
  }

  const body = await buildDoctorMainMenuBody(session, false);
  return {
    session,
    reply: { body, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Walk-in visit shortcut — Log Visit
// ───────────────────────────────────────────────
async function handleDoctorLogVisitName(session, normalized, intent, entities) {
  if (intent === 'back') return handleDoctorBack(session);

  // Patient selected from search results
  if (intent === 'select_patient' && entities?.patientId) {
    const patient = await findPatientById(entities.patientId);
    if (!patient) {
      return { session, reply: 'Patient not found. Try again.', replyType: 'text' };
    }
    return startLogVisitForPatient(session, patient);
  }

  // "Register New" tapped
  if (intent === 'log_visit_register_new') {
    session = {
      ...session,
      state: 'REGISTER_NAME',
      context: { ...session.context, registration: {}, logVisitPending: true, logVisitSearch: undefined },
    };
    return { session, reply: 'Enter new patient name:', replyType: 'text' };
  }

  // Text search input
  const query = (normalized?.textClean || '').trim();
  if (!query || query.length < 2) {
    return { session, reply: 'Enter at least 2 characters to search:', replyType: 'text' };
  }

  const patients = await searchPatients(query);

  if (patients.length === 0) {
    return {
      session: { ...session, state: 'DOCTOR_LOG_VISIT_NAME', context: { ...session.context, logVisitSearch: query } },
      reply: {
        body: `No patients found matching "${query}".`,
        buttonLabel: 'Options',
        sections: [
          { title: 'Options', rows: [
            { id: 'log_visit_register_new', title: '➕ Register New Patient' },
            { id: 'back', title: '🔙 Back' },
          ]},
        ],
      },
      replyType: 'list',
    };
  }

  if (patients.length === 1) {
    const patient = patients[0];
    return {
      session: { ...session, state: 'DOCTOR_LOG_VISIT_NAME', context: { ...session.context, logVisitSearch: undefined } },
      reply: {
        body: `Found: *${patient.name}*${patient.age ? ` (${patient.age})` : ''}${patient.sex ? `/${patient.sex}` : ''}\n📞 ${patient.phone}\n\nStart visit logging for this patient?`,
        buttons: [
          { id: `patient_${patient.id}`, title: '✅ Select This Patient' },
          { id: 'log_visit_register_new', title: '➕ Register New' },
          { id: 'back', title: '🔙 Back' },
        ],
      },
      replyType: 'buttons',
    };
  }

  const rows = patients.map(p => ({
    id: `patient_${p.id}`,
    title: `${p.name}${p.age ? ` (${p.age})` : ''}`,
    description: `📞 ${p.phone.slice(-8)}`,
  }));
  rows.push({ id: 'log_visit_register_new', title: '➕ Register New Patient' });

  return {
    session: { ...session, state: 'DOCTOR_LOG_VISIT_NAME', context: { ...session.context, logVisitSearch: undefined } },
    reply: { body: `Found ${patients.length} patients. Select one:`, buttonLabel: 'Patients', sections: [{ title: 'Matching Patients', rows }] },
    replyType: 'list',
  };
}

async function startLogVisitForPatient(session, patient) {
  const today = new Date().toISOString().slice(0, 10);

  const appt = await createAppointmentForPatient({
    patientName: patient.name,
    patientPhone: patient.phone,
    waId: patient.wa_id || null,
    date: today,
    time: null,
    treatment: 'Walk-in',
  });

  if (!appt) {
    return {
      session: { ...session, state: 'DOCTOR_MAIN_MENU', context: { ...session.context, logVisitSearch: undefined } },
      reply: { body: 'Could not create appointment. Try again.', buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  await updateArrivalStatus(appt.id, 'arrived');

  session = {
    ...session,
    state: 'LOG_TREATMENT',
    context: {
      ...session.context,
      logVisitSearch: undefined,
      selectedAppointmentId: appt.id,
      visitLog: {
        appointmentId: appt.id,
        treatment: null,
        consultationFee: null,
        treatmentCharges: null,
        medicineCharges: null,
        nextVisit: null,
        notes: null,
      },
    },
  };

  return { session, reply: '🦷 *Treatment done?*\n\nWhat treatment was performed? (e.g., RCT Sitting 1, Cleaning, Filling)', replyType: 'text' };
}

// ───────────────────────────────────────────────
// View today's appointments
// ───────────────────────────────────────────────
async function handleDoctorViewToday(session) {
  const today = new Date().toISOString().slice(0, 10);
  const appointments = await fetchAppointmentsByDate(today);

  session = { ...session, state: 'DOCTOR_APPOINTMENT_LIST', context: { ...session.context, doctorDate: today } };

  if (appointments.length === 0) {
    return {
      session,
      reply: { body: `*No appointments today.* 🎉`, buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back to Menu' }]) },
      replyType: 'list',
    };
  }

  const rows = appointments.map((a) => ({
    id: `doc_appt_${a.id}`,
    title: `${a.time} — ${a.patient_name || 'Patient'}`,
    description: a.treatment || '',
  }));

  const dayName = formatDayName(today);
  const datePretty = formatDatePretty(today);
  const body = `*📋 Appointments for ${dayName}, ${datePretty}*\n${appointments.length} total\n\nSelect an appointment:`;

  return {
    session,
    reply: { body, buttonLabel: 'Appointments', sections: [{ title: 'Appointments', rows }] },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// View by date — user picks a date
// ───────────────────────────────────────────────
async function handleDoctorViewDate(session, entities, intent) {
  if (intent === 'date_selected') {
    const dateStr = entities.date;
    if (dateStr) {
      session = { ...session, state: 'DOCTOR_APPOINTMENT_LIST', context: { ...session.context, doctorDate: dateStr } };
      return handleDoctorAppointmentListForDate(session, dateStr);
    }
  }

  if (intent === 'doctor_view_today') {
    return handleDoctorViewToday(session);
  }

  // Free-text date input (unknown/empty intent with date entities)
  if ((!intent || intent === 'unknown') && entities?.date) {
    const dateStr = entities.date;
    session = { ...session, state: 'DOCTOR_APPOINTMENT_LIST', context: { ...session.context, doctorDate: dateStr } };
    return handleDoctorAppointmentListForDate(session, dateStr);
  }

  return {
    session,
    reply: { body: 'Please enter a valid date in DD-MM-YYYY format or select one below:', buttonLabel: 'Quick pick', sections: getDateQuickPickSections(session) },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Appointment list for a specific date
// ───────────────────────────────────────────────
async function handleDoctorAppointmentList(session, entities, intent) {
  // Bulk complete all of today's confirmed appointments
  if (intent === 'doctor_bulk_complete') {
    const dateStr = session.context?.doctorDate || new Date().toISOString().slice(0, 10);
    const count = await bulkCompleteAppointmentsForDate(dateStr);
    return {
      session: { ...session, state: 'DOCTOR_MAIN_MENU' },
      reply: { body: `*✅ ${count} appointment${count !== 1 ? 's' : ''} marked as completed.*`, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  // Appointment detail tap from the list
  if (intent === 'doctor_appt_detail' || (!intent && entities?.appointmentId)) {
    const apptId = entities?.appointmentId;
    if (apptId) {
      // Find the appointment in the list (already fetched for this date)
      const dateStr = session.context?.doctorDate || new Date().toISOString().slice(0, 10);
      const appointments = await fetchAppointmentsByDate(dateStr);
      const appt = appointments.find((a) => a.id === apptId);

      session = {
        ...session,
        state: 'DOCTOR_APPOINTMENT_DETAIL',
        context: {
          ...session.context,
          selectedAppointmentId: apptId,
          selectedAppointment: appt || null,
        },
      };

      return handleDoctorAppointmentDetail(session, entities, intent);
    }
  }

  const dateStr = session.context?.doctorDate || new Date().toISOString().slice(0, 10);
  return handleDoctorAppointmentListForDate(session, dateStr);
}

async function handleDoctorAppointmentListForDate(session, dateStr) {
  const appointments = await fetchAppointmentsByDate(dateStr);

  if (appointments.length === 0) {
    return {
      session: { ...session, state: 'DOCTOR_MAIN_MENU' },
      reply: { body: `*No appointments on ${formatDatePretty(dateStr)}.*`, buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back to Menu' }]) },
      replyType: 'list',
    };
  }

  const rows = appointments.map((a) => ({
    id: `doc_appt_${a.id}`,
    title: `${a.time} — ${a.patient_name || 'Patient'}`,
    description: a.treatment || '',
  }));

  const dayName = formatDayName(dateStr);
  const datePretty = formatDatePretty(dateStr);
  const body = `*📋 Appointments for ${dayName}, ${datePretty}*\n${appointments.length} total\n\nSelect an appointment:`;

  const today = new Date().toISOString().slice(0, 10);
  const menuRows = [...rows];
  if (dateStr === today) {
    menuRows.push({ id: 'bulk_complete', title: '✅ Mark All Completed', description: 'No visit logging' });
  }

  return {
    session,
    reply: { body, buttonLabel: 'Appointments', sections: [{ title: 'Appointments', rows: menuRows }], footer: dateStr === today ? 'Tap "Mark All Completed" to close all without logging.' : undefined },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Appointment detail
// ───────────────────────────────────────────────
function handleDoctorAppointmentDetail(session, entities, intent) {
  const apptId = session.context?.selectedAppointmentId;

  if (intent === 'doctor_mark_completed') {
    if (!apptId) {
      return { session, reply: 'No appointment selected.', replyType: 'text' };
    }
    session = {
      ...session,
      state: 'LOG_TREATMENT',
      context: {
        ...session.context,
        visitLog: { appointmentId: apptId, treatment: null, consultationFee: null, treatmentCharges: null, medicineCharges: null, nextVisit: null, notes: null },
      },
    };
    return {
      session,
      reply: '🦷 *Treatment done?*\n\nWhat treatment was performed? (e.g., RCT Sitting 1, Cleaning, Filling)',
      replyType: 'text',
    };
  }
  if (intent === 'doctor_mark_noshow') {
    return handleMarkAppointment(session, apptId, 'no_show');
  }
  if (intent === 'view_chit') {
    if (!apptId) {
      return { session, reply: 'No appointment selected.', replyType: 'text' };
    }
    session = {
      ...session,
      state: 'DOCTOR_VIEW_CHIT',
      context: { ...session.context, returnToState: 'DOCTOR_APPOINTMENT_DETAIL' },
    };
    return handleDoctorViewChit(session, null, '');
  }
  if (intent === 'add_chit') {
    if (!apptId) {
      return { session, reply: 'No appointment selected.', replyType: 'text' };
    }
    return {
      session,
      reply: '📷 *Send a photo or audio* to attach to this appointment.\n\nTap Back when done.',
      replyType: 'text',
    };
  }
  if (!apptId) {
    return handleDoctorMainMenu(session);
  }

  // If we have the appointment in context, show detail
  const appt = session.context?.selectedAppointment;
  const mediaCount = appt?.chit_media?.length || 0;

  let body = '';
  if (appt) {
    body += `*🧑‍⚕️ Appointment Detail*\n\n`;
    body += `*Patient:* ${appt.patient_name || 'N/A'}\n`;
    body += `*Phone:* ${appt.patient_phone || 'N/A'}\n`;
    body += `*Date:* ${formatDate(appt.date)} ${formatDayName(appt.date)}\n`;
    body += `*Time:* ${appt.time}\n`;
    body += `*Treatment:* ${appt.treatment || 'N/A'}\n`;
    body += `*Status:* ${appt.status}\n`;
    if (mediaCount > 0) {
      body += `*Chit:* ${mediaCount} item(s) 📎\n`;
    }
  } else {
    body += `*Appointment Details*\n`;
  }

  const buttons = [
    { id: 'mark_done', title: '✅ Completed' },
    { id: 'mark_noshow', title: '❌ No Show' },
  ];
  if (mediaCount > 0) {
    buttons.push({ id: 'view_chit', title: '📎 View Chit' });
  }
  buttons.push({ id: 'add_chit', title: '➕ Add Chit' });
  buttons.push({ id: 'back', title: '🔙 Back' });

  return {
    session,
    reply: { body, buttons },
    replyType: 'buttons',
  };
}

async function handleMarkAppointment(session, apptId, status) {
  if (!apptId) {
    return { session, reply: 'No appointment selected.', replyType: 'text' };
  }

  const result = await updateAppointmentStatus(apptId, status);

  if (!result) {
    return {
      session,
      reply: { body: 'Could not update appointment. It may have already been modified.', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  const statusLabel = status === 'completed' ? '✅ Completed' : '❌ No Show';
  const patientName = result.patient_name || 'Patient';

  session = {
    ...session,
    state: 'DOCTOR_MAIN_MENU',
    context: { ...session.context, selectedAppointmentId: undefined, selectedAppointment: undefined, visitLog: undefined },
  };

  return {
    session,
    reply: { body: `*${patientName}* marked as *${statusLabel}*.\n\nAppointment updated successfully.`, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Registration flow handlers
// ───────────────────────────────────────────────
function handleRegisterName(session, normalized, intent) {
  if (intent === 'back') return handleDoctorBack(session);
  const name = (normalized?.textClean || '').trim();
  if (!name || name.length < 2) {
    return { session: { ...session, metrics: { ...session.metrics, failedAttempts: (session.metrics.failedAttempts || 0) + 1 } },
             reply: 'Please enter a valid name (at least 2 characters):', replyType: 'text' };
  }
  session = {
    ...session,
    state: 'REGISTER_AGE',
    context: { ...session.context, registration: { ...(session.context.registration || {}), name } },
  };
  return { session, reply: `Thanks, *${name}*. Now enter age:`, replyType: 'text' };
}

function handleRegisterAge(session, normalized, intent) {
  if (intent === 'back') return handleDoctorBack(session);
  const age = parseInt((normalized?.textClean || '').trim(), 10);
  if (isNaN(age) || age < 0 || age > 150) {
    return { session: { ...session, metrics: { ...session.metrics, failedAttempts: (session.metrics.failedAttempts || 0) + 1 } },
             reply: 'Please enter a valid age (0-150):', replyType: 'text' };
  }
  session = {
    ...session,
    state: 'REGISTER_SEX',
    context: { ...session.context, registration: { ...(session.context.registration || {}), age } },
  };
  return { session, reply: 'Sex? *(M / F / Other)*', replyType: 'text' };
}

function handleRegisterSex(session, normalized, intent) {
  if (intent === 'back') return handleDoctorBack(session);
  const text = (normalized?.textClean || '').trim().toLowerCase();
  const sexMap = { m: 'M', male: 'M', f: 'F', female: 'F', o: 'Other', other: 'Other' };
  const sex = sexMap[text];
  if (!sex) {
    return { session: { ...session, metrics: { ...session.metrics, failedAttempts: (session.metrics.failedAttempts || 0) + 1 } },
             reply: 'Please enter M, F, or Other:', replyType: 'text' };
  }
  session = {
    ...session,
    state: 'REGISTER_PHONE',
    context: { ...session.context, registration: { ...(session.context.registration || {}), sex } },
  };
  return { session, reply: 'WhatsApp number (with country code, e.g., 9198xxxx50):', replyType: 'text' };
}

function handleRegisterPhone(session, normalized, intent) {
  if (intent === 'back') return handleDoctorBack(session);
  const text = (normalized?.textClean || '').trim().replace(/\s+/g, '');
  const phoneResult = validatePhone(text);
  if (!phoneResult.valid) {
    return { session: { ...session, metrics: { ...session.metrics, failedAttempts: (session.metrics.failedAttempts || 0) + 1 } },
             reply: 'Please enter a valid 10-digit Indian mobile number (e.g., 9876543210 or 919876543210):', replyType: 'text' };
  }
  const reg = { ...(session.context.registration || {}), phone: phoneResult.parsed };
  session = {
    ...session,
    state: 'REGISTER_APPOINTMENT',
    context: { ...session.context, registration: reg },
  };

  // Receptionist auto-creates walk-in without asking for time
  if (session.context?.role === 'receptionist') {
    return handleReceptionistCreateWalkIn(session, normalized);
  }

  return { session, reply: { body: 'Does this patient have an appointment time, or walk-in?', buttons: [
    { id: 'walk_in', title: '🚶 Walk-in' },
    { id: 'back', title: '🔙 Back' },
  ]}, replyType: 'buttons' };
}

async function handleRegisterAppointment(session, intent, entities, normalized) {
  if (intent === 'back') return handleDoctorBack(session);
  const reg = session.context.registration || {};
  let date, time;

  if (intent === 'walk_in') {
    const today = new Date().toISOString().slice(0, 10);
    date = today;
    // Don't set a time for walk-in
  } else if (intent === 'provide_appointment_time' || intent === 'unknown') {
    // Try to parse date/time from text
    const text = session.context?.lastMessageText || '';
    const timeResult = validateTime(text);
    if (timeResult.valid) {
      time = timeResult.parsed;
      date = new Date().toISOString().slice(0, 10);
    } else {
      // Try date
      const dateResult = validateDate(text);
      if (dateResult.valid) {
        date = dateResult.parsed;
      }
      // Also try time
      const altTime = validateTime(text);
      if (altTime.valid) {
        time = altTime.parsed;
      }
    }
  }

  // Create patient record
  const patient = await createPatient({
    name: reg.name,
    age: reg.age,
    sex: reg.sex,
    phone: reg.phone,
    waId: normalized?.waId || null,
  });

  // Create appointment for today
  const appt = await createAppointmentForPatient({
    patientName: reg.name,
    patientPhone: reg.phone,
    waId: null,
    date: date || new Date().toISOString().slice(0, 10),
    time: time || null,
    treatment: null,
  });

  // Mark walk-in as arrived immediately
  if (appt && intent === 'walk_in') {
    await updateArrivalStatus(appt.id, 'arrived');
  }

  // Log-visit shortcut: jump directly into visit logging after registration
  if (session.context?.logVisitPending && appt) {
    session = {
      ...session,
      state: 'LOG_TREATMENT',
      context: {
        ...session.context,
        registration: undefined,
        logVisitPending: undefined,
        selectedAppointmentId: appt.id,
        visitLog: {
          appointmentId: appt.id,
          treatment: null,
          consultationFee: null,
          treatmentCharges: null,
          medicineCharges: null,
          nextVisit: null,
          notes: null,
        },
      },
    };
    return { session, reply: '🦷 *Treatment done?*\n\nWhat treatment was performed? (e.g., RCT Sitting 1, Cleaning, Filling)', replyType: 'text' };
  }

  const returnState = session.context?.role === 'receptionist' ? 'RECEPTIONIST_MAIN_MENU' : 'DOCTOR_MAIN_MENU';
  const menuFn = session.context?.role === 'receptionist' ? getReceptionistMenuSections : getDoctorMenuSections;

  session = {
    ...session,
    state: returnState,
    context: { ...session.context, registration: undefined },
  };

  const body = `*✅ Patient Registered*\n\n*Name:* ${reg.name}\n*Age:* ${reg.age}\n*Sex:* ${reg.sex}\n*Phone:* ${reg.phone}\n\nPatient is in the system and ready.`;

  return {
    session,
    reply: { body, buttonLabel: 'Menu', sections: menuFn() },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Visit log flow handlers
// ───────────────────────────────────────────────
function handleLogTreatment(session, normalized, intent) {
  if (intent === 'back') return handleDoctorBack(session);
  const treatment = (normalized?.textClean || '').trim();
  if (!treatment) {
    return { session, reply: 'Please enter the treatment performed (e.g., RCT Sitting 1, Cleaning):', replyType: 'text' };
  }
  session = {
    ...session,
    state: 'LOG_CONSULTATION_FEE',
    context: { ...session.context, visitLog: { ...(session.context.visitLog || {}), treatment } },
  };
  return { session, reply: '💰 *Consultation fee?*\n\nEnter amount in rupees (e.g., 500):', replyType: 'text' };
}

function handleLogConsultationFee(session, normalized, intent) {
  if (intent === 'back') return handleDoctorBack(session);
  const fee = parseInt((normalized?.textClean || '').replace(/[^0-9]/g, ''), 10);
  if (isNaN(fee) || fee < 0) {
    return { session, reply: 'Please enter a valid amount (e.g., 500). Enter 0 if no fee:', replyType: 'text' };
  }
  session = {
    ...session,
    state: 'LOG_TREATMENT_CHARGES',
    context: { ...session.context, visitLog: { ...(session.context.visitLog || {}), consultationFee: fee } },
  };
  return { session, reply: '💰 *Treatment charges?*\n\nEnter amount in rupees (e.g., 3000). Enter 0 if none:', replyType: 'text' };
}

function handleLogTreatmentCharges(session, normalized, intent) {
  if (intent === 'back') return handleDoctorBack(session);
  const charges = parseInt((normalized?.textClean || '').replace(/[^0-9]/g, ''), 10);
  if (isNaN(charges) || charges < 0) {
    return { session, reply: 'Please enter a valid amount (e.g., 3000). Enter 0 if none:', replyType: 'text' };
  }
  session = {
    ...session,
    state: 'LOG_MEDICINE_CHARGES',
    context: { ...session.context, visitLog: { ...(session.context.visitLog || {}), treatmentCharges: charges } },
  };
  return { session, reply: '💊 *Medicine charges?*\n\nEnter amount in rupees (e.g., 200). Enter 0 if none:', replyType: 'text' };
}

function handleLogMedicineCharges(session, normalized, intent) {
  if (intent === 'back') return handleDoctorBack(session);
  const charges = parseInt((normalized?.textClean || '').replace(/[^0-9]/g, ''), 10);
  if (isNaN(charges) || charges < 0) {
    return { session, reply: 'Please enter a valid amount (e.g., 200). Enter 0 if none:', replyType: 'text' };
  }
  session = {
    ...session,
    state: 'LOG_NEXT_VISIT',
    context: { ...session.context, visitLog: { ...(session.context.visitLog || {}), medicineCharges: charges } },
  };
  return { session, reply: '🗓 *Next visit?*\n\nEnter date and time (e.g., 7-Jun 11am) or type "none":', replyType: 'text' };
}

function handleLogNextVisit(session, normalized, intent) {
  if (intent === 'back') return handleDoctorBack(session);
  if (intent === 'no_next_visit' || (normalized?.textLower || '').includes('none')) {
    session = {
      ...session,
      state: 'LOG_NOTES',
      context: { ...session.context, visitLog: { ...(session.context.visitLog || {}), nextVisit: null } },
    };
    return { session, reply: '📝 *Notes for patient?*\n\nAny instructions? Type "none" to skip:', replyType: 'text' };
  }
  const text = normalized?.textClean || '';
  const dateResult = validateDate(text);
  const timeResult = validateTime(text);
  if (!dateResult.valid && !timeResult.valid) {
    // Could be a date with time — try common patterns like "7-Jun 11am"
    const parts = text.split(/[\s,]+/);
    let nextDate = null;
    let nextTime = null;
    for (const p of parts) {
      const dr = validateDate(p);
      if (dr.valid) nextDate = dr.parsed;
      const tr = validateTime(p);
      if (tr.valid) nextTime = tr.parsed;
    }
    if (!nextDate && !nextTime) {
      return { session, reply: 'Please enter a valid date & time (e.g., 7-Jun 11am) or "none":', replyType: 'text' };
    }
    session = {
      ...session,
      state: 'LOG_NOTES',
      context: { ...session.context, visitLog: { ...(session.context.visitLog || {}), nextVisit: { date: nextDate, time: nextTime } } },
    };
  } else {
    session = {
      ...session,
      state: 'LOG_NOTES',
      context: { ...session.context, visitLog: { ...(session.context.visitLog || {}), nextVisit: { date: dateResult.parsed || null, time: timeResult.parsed || null } } },
    };
  }
  return { session, reply: '📝 *Notes for patient?*\n\nAny instructions? Type "none" to skip:', replyType: 'text' };
}

async function handleLogNotes(session, normalized, intent) {
  if (intent === 'back') return handleDoctorBack(session);
  const notes = (intent === 'no_notes' || (normalized?.textLower || '').includes('none'))
    ? ''
    : (normalized?.textClean || '').trim();
  session = {
    ...session,
    state: 'LOG_MEDIA',
    context: { ...session.context, visitLog: { ...(session.context.visitLog || {}), notes } },
  };
  return {
    session,
    reply: { body: '📷 *Send photos / X-rays / prescription?*\n\nSend up to 5 images, or tap Skip.', buttons: [{ id: 'log_skip_media', title: '⏭️ Skip' }, { id: 'back', title: '🔙 Back' }] },
    replyType: 'buttons',
  };
}

async function handleLogMedia(session, normalized, intent) {
  if (intent === 'back') return handleDoctorBack(session);

  // Accept if doctor sends media, taps Skip, or types skip/done
  const textLower = normalized?.textLower || '';
  const proceed = intent === 'skip_media' || normalized?.hasMedia || textLower.includes('skip') || textLower.includes('done');
  if (!proceed) {
    return {
      session,
      reply: { body: 'Send photos/X-rays or tap Skip.', buttons: [{ id: 'log_skip_media', title: '⏭️ Skip' }, { id: 'back', title: '🔙 Back' }] },
      replyType: 'buttons',
    };
  }
  const vl = session.context.visitLog || {};
  const apptId = vl.appointmentId;

  if (!apptId) {
    return {
      session: { ...session, state: 'DOCTOR_MAIN_MENU', context: { ...session.context, visitLog: undefined } },
      reply: { body: 'Error: No appointment selected. Please try again.', buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  // Save all visit data
  const result = await updateVisitLog(apptId, {
    consultationFee: vl.consultationFee || 0,
    treatmentCharges: vl.treatmentCharges || 0,
    medicineCharges: vl.medicineCharges || 0,
    notes: vl.notes || '',
  });

  if (!result) {
    return {
      session: { ...session, state: 'DOCTOR_MAIN_MENU', context: { ...session.context, visitLog: undefined } },
      reply: { body: 'Could not save visit data. Please try again.', buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  const total = (vl.consultationFee || 0) + (vl.treatmentCharges || 0) + (vl.medicineCharges || 0);

  let summary = `*✅ Visit Logged for ${result.patient_name || 'Patient'}*\n\n`;
  summary += `*Treatment:* ${vl.treatment || 'N/A'}\n`;
  summary += `*Fees:* Consult ₹${vl.consultationFee || 0} | Treatment ₹${vl.treatmentCharges || 0} | Medicine ₹${vl.medicineCharges || 0}\n`;
  summary += `*Total:* ₹${total}\n`;
  if (vl.notes) summary += `*Notes:* ${vl.notes}\n`;

  // Send patient summary
  if (result.wa_id) {
    sendPatientSummary(result.wa_id, result.patient_name, vl, result).catch(() => {});
    sendPrescriptionToPatient(result.wa_id, result, vl).catch(() => {});
  }

  session = {
    ...session,
    state: 'DOCTOR_MAIN_MENU',
    context: { ...session.context, selectedAppointmentId: undefined, selectedAppointment: undefined, visitLog: undefined },
  };

  return {
    session,
    reply: { body: summary, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
    replyType: 'list',
  };
}

async function sendPatientSummary(waId, patientName, vl, appt) {
  const total = (vl.consultationFee || 0) + (vl.treatmentCharges || 0) + (vl.medicineCharges || 0);
  const paid = appt?.paid_amount || 0;
  const due = total - paid;
  const dateStr = appt?.date ? formatDate(appt.date) : '';
  const timeStr = appt?.time ? formatTime(appt.time) : '';

  let body = `🏥 *${CLINIC.name}*\n\n`;
  if (dateStr || timeStr) body += `📅 ${dateStr}${timeStr ? ' | ' + timeStr : ''}\n`;
  body += `🦷 *${vl.treatment || 'Visit'}*\n\n`;
  body += `💰 Consultation:    ₹${vl.consultationFee || 0}\n`;
  body += `   Treatment:       ₹${vl.treatmentCharges || 0}\n`;
  body += `   Medicines:       ₹${vl.medicineCharges || 0}\n`;
  body += `   ─────────────────\n`;
  body += `   *Total Bill:      ₹${total}*\n`;
  body += `   *Amount Paid:     ₹${paid}*\n`;
  if (due > 0) {
    body += `   *Outstanding:     ₹${due}*\n`;
  }
  body += `\n`;

  // Don't show "next visit" in patient-facing if not set
  if (vl.nextVisit?.date) {
    body += `🗓 *Next visit:* ${vl.nextVisit.date}${vl.nextVisit?.time ? ' at ' + vl.nextVisit.time : ''}\n`;
  }
  if (vl.notes) {
    body += `📝 *Note:* ${vl.notes}\n`;
  }

  await sendText(waId, body);
}

async function sendPrescriptionToPatient(waId, appt, vl) {
  try {
    const patient = { name: appt.patient_name, phone: appt.patient_phone, age: null, sex: null };
    const { generatePrescription } = await import('@/lib/prescription');
    const result = await generatePrescription({ patient, visit: vl, appointment: appt });
    if (result?.url) {
      await sendDocument(waId, result.url, `Prescription - ${CLINIC.name}`, `prescription_${appt.id}.pdf`);
      logger.info('PRESCRIPTION_SENT', { waId, apptId: appt.id });
      // Persist the R2 key so it shows in chat history / dashboard
      if (result?.key) {
        const sql = getSql();
        if (sql) {
          await sql`UPDATE appointments SET prescription_key = ${result.key}, updated_at = NOW() WHERE id = ${appt.id}`;
        }
      }
    }
  } catch (error) {
    logger.warn('PRESCRIPTION_SEND_FAILED', { waId, apptId: appt?.id, error: error.message });
  }
}

// ───────────────────────────────────────────────
// Search Patient handler
// ───────────────────────────────────────────────
async function handleDoctorSearchPatient(session, normalized, intent, entities) {
  if (intent === 'back') {
    return handleDoctorBack(session);
  }

  // Patient selected from list
  if (intent === 'select_patient' && entities?.patientId) {
    const patient = await findPatientById(entities.patientId);
    if (patient) {
      // If we have pending media, save to this patient's most recent visit
      const pm = session.context?.pendingMedia;
      if (pm) {
        const visits = await getVisitsByPatientPhone(patient.phone);
        if (visits.length > 0) {
          const latestVisit = visits[0];
          await processAndStoreMedia({
            mediaId: pm.mediaId,
            mimeType: pm.mimeType,
            appointmentId: latestVisit.id,
            waId: null,
            patientId: patient.id,
          });
        } else {
          await processAndStoreMedia({
            mediaId: pm.mediaId,
            mimeType: pm.mimeType,
            appointmentId: null,
            waId: null,
            patientId: patient.id,
          });
        }
        session = {
          ...session,
          state: 'DOCTOR_MAIN_MENU',
          context: { ...session.context, pendingMedia: undefined, pendingMediaQuery: undefined, searchResults: undefined },
        };
        const visitCount = patient.phone ? (await getVisitsByPatientPhone(patient.phone)).length : 0;
        return {
          session,
          reply: { body: `*✅ Media saved for ${patient.name}* (${visitCount} visits).`, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
          replyType: 'list',
        };
      }
      return showPatientVisits(session, patient);
    }
    return {
      session,
      reply: { body: 'Patient not found. Try searching again.', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back to Menu' }]) },
      replyType: 'list',
    };
  }

  const query = (normalized?.textClean || '').trim();
  if (!query || query.length < 2) {
    return { session, reply: 'Enter at least 2 characters to search:', replyType: 'text' };
  }

  const patients = await searchPatients(query);

  if (patients.length === 0) {
    session = { ...session, state: 'DOCTOR_MAIN_MENU', context: { ...session.context, searchResults: undefined } };
    return {
      session,
      reply: { body: `No patients found matching "${query}". Try a different name or phone number.`, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  // For single match, show visits directly
  if (patients.length === 1) {
    return showPatientVisits(session, patients[0]);
  }

  // For multiple matches, show list
  const rows = patients.map(p => {
    const phoneDisplay = p.phone ? p.phone.slice(-8) : '';
    return {
      id: `patient_${p.id}`,
      title: `${p.name}${p.age ? ` (${p.age})` : ''}`,
      description: `📞 ${phoneDisplay}`,
    };
  });

  session = {
    ...session,
    state: 'DOCTOR_SEARCH_PATIENT',
    context: { ...session.context, searchResults: patients.map(p => p.id) },
  };

  return {
    session,
    reply: { body: `Found ${patients.length} patients. Select one:`, buttonLabel: 'Patients', sections: [{ title: 'Matching Patients', rows }] },
    replyType: 'list',
  };
}

async function showPatientVisits(session, patient) {
  const visits = await getVisitsByPatientPhone(patient.phone);

  if (visits.length === 0) {
    let body = `*📋 ${patient.name}*`;
    if (patient.age) body += ` (${patient.age}/${patient.sex || ''})`;
    if (patient.phone) body += `\n📞 ${patient.phone}`;
    body += '\n*No past visits found.*';

    session = {
      ...session,
      state: 'DOCTOR_MAIN_MENU',
      context: { ...session.context, searchResults: undefined, selectedPatient: patient.id },
    };
    return {
      session,
      reply: { body, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  const title = `*📋 ${patient.name}*`;
  const subtitle = patient.age ? ` (${patient.age}/${patient.sex || ''})` : '';
  const phoneLine = patient.phone ? `\n📞 ${patient.phone}` : '';
  const header = `${title}${subtitle}${phoneLine}\n*Total visits:* ${visits.length}\n`;

  const rows = visits.map((v) => {
    const statusIcon = v.status === 'completed' ? '✅' : v.status === 'no_show' ? '❌' : '📌';
    const total = (v.consultation_fee || 0) + (v.treatment_charges || 0) + (v.medicine_charges || 0);
    const mediaCount = v.chit_media?.length || 0;
    let desc = v.treatment || 'Visit';
    if (total > 0) desc += ` ₹${total}`;
    if (mediaCount > 0) desc += ` 📎${mediaCount}`;
    return {
      id: `doc_appt_${v.id}`,
      title: `${statusIcon} ${v.date}${v.time ? ' ' + v.time : ''}`,
      description: desc,
    };
  });

  // Add message history, edit, and back options
  rows.push({ id: 'view_messages', title: '💬 View Messages', description: 'WhatsApp conversation' });
  rows.push({ id: 'edit_patient', title: '✏️ Edit Patient Details', description: '' });
  rows.push({ id: 'back', title: '🔙 Back to Menu', description: '' });

  session = {
    ...session,
    state: 'DOCTOR_PATIENT_VISITS',
    context: { ...session.context, searchResults: undefined, selectedPatient: patient.id },
  };

  return {
    session,
    reply: { body: header, buttonLabel: 'Visits', sections: [{ title: 'Visit History', rows }] },
    replyType: 'list',
  };
}

async function handleDoctorPatientVisits(session, normalized, intent, entities) {
  if (intent === 'back') {
    return handleDoctorBack(session);
  }

  // Edit patient detail
  if (intent === 'doctor_edit_patient') {
    const patientId = session.context?.selectedPatient;
    if (!patientId) {
      return { session, reply: '*No patient selected.*', replyType: 'text' };
    }
    const patient = await findPatientById(patientId);
    if (!patient) {
      return { session, reply: '*Patient not found.*', replyType: 'text' };
    }
    const body = `*✏️ Edit Patient: ${patient.name}*\n\nCurrent details:\nName: ${patient.name}\nAge: ${patient.age || '—'}\nSex: ${patient.sex || '—'}\nPhone: ${patient.phone}\n\nWhat would you like to edit?`;
    return {
      session: { ...session, state: 'DOCTOR_EDIT_PATIENT', context: { ...session.context, editField: undefined } },
      reply: {
        body,
        buttonLabel: 'Edit',
        sections: [{
          title: 'Edit Field',
          rows: [
            { id: 'provide_name', title: '✏️ Name' },
            { id: 'provide_age', title: '✏️ Age' },
            { id: 'provide_sex', title: '✏️ Sex' },
            { id: 'back', title: '🔙 Cancel' },
          ],
        }],
      },
      replyType: 'list',
    };
  }

  // View message history
  if (intent === 'doctor_view_messages') {
    const patientId = session.context?.selectedPatient;
    if (!patientId) {
      return { session, reply: '*No patient selected.*', replyType: 'text' };
    }
    session = { ...session, state: 'DOCTOR_VIEW_MESSAGES' };
    return handleDoctorViewMessages(session, patientId);
  }

  // Appointment detail tap — route to DOCTOR_APPOINTMENT_DETAIL
  if (intent === 'doctor_appt_detail' && entities?.appointmentId) {
    const apptId = entities.appointmentId;
    // Fetch this specific appointment from DB rather than from date list
    const sql = getSql();
    const [appt] = await sql`
      SELECT * FROM appointments WHERE id = ${apptId}
    `;
    if (appt) {
      session = {
        ...session,
        state: 'DOCTOR_APPOINTMENT_DETAIL',
        context: {
          ...session.context,
          selectedAppointmentId: apptId,
          selectedAppointment: appt,
        },
      };
      return handleDoctorAppointmentDetail(session, entities, intent);
    }
    return {
      session,
      reply: { body: 'Appointment not found.', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  return { session, reply: 'Tap a visit to see details.', replyType: 'text' };
}

// ───────────────────────────────────────────────
// Message history view on bot
// ───────────────────────────────────────────────
async function handleDoctorViewMessages(session, patientId) {
  const sql = getSql();
  if (!sql) {
    return {
      session: { ...session, state: 'DOCTOR_PATIENT_VISITS' },
      reply: { body: '*Database not available.*', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  const patientRows = await sql`
    SELECT wa_id, phone, name FROM patients WHERE id = ${patientId} LIMIT 1
  `;
  if (!patientRows || patientRows.length === 0) {
    return {
      session: { ...session, state: 'DOCTOR_PATIENT_VISITS' },
      reply: { body: '*Patient not found.*', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  const patient = patientRows[0];
  const searchIds = [patient.wa_id, patient.phone].filter(Boolean);
  if (searchIds.length === 0) {
    return {
      session: { ...session, state: 'DOCTOR_PATIENT_VISITS' },
      reply: { body: `*${patient.name}*\nNo WhatsApp messages found — no contact identifier on record.`, buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  const messages = await sql`
    SELECT m.role, m.content, m.created_at, m.intent
    FROM messages m
    WHERE m.wa_id = ANY(${searchIds})
    ORDER BY m.created_at DESC
    LIMIT 30
  `;

  if (!messages || messages.length === 0) {
    return {
      session: { ...session, state: 'DOCTOR_PATIENT_VISITS' },
      reply: { body: `*${patient.name}*\nNo messages found.`, buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  let body = `*💬 ${patient.name} — Last ${Math.min(messages.length, 30)} Messages*\n\n`;
  for (const msg of messages.reverse()) {
    const sender = msg.role === 'user' ? '👤 Patient' : '🤖 Clinic';
    const time = new Date(msg.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const text = (msg.content || '').slice(0, 200);
    if (text) {
      body += `${sender} (${time}):\n${text}\n\n`;
    }
  }
  body += `_Showing last ${Math.min(messages.length, 30)} messages._`;

  return {
    session: { ...session, state: 'DOCTOR_PATIENT_VISITS' },
    reply: { body, buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back to Patient' }]) },
    replyType: 'list',
  };
}

async function sendFeedbackRequest(waId, patientName) {
  const name = patientName ? patientName.split(' ')[0] : '';
  const body = `Hi ${name}! 👋\n\nWe hope your visit went well! We'd love to hear your feedback.\n\nReply with a rating (1-5) or share your experience.`;
  await sendText(waId, body);
}

// ───────────────────────────────────────────────
// Manage schedule — blocked dates
// ───────────────────────────────────────────────
async function handleDoctorManageSchedule(session, intent, entities) {
  // Handle unblock action when a specific date is returned
  if (intent === 'unblock_date' && entities?.date) {
    const dateStr = entities.date;
    const result = await unblockDate(dateStr);
    return {
      session: {
        ...session,
        context: { ...session.context, doctorDate: undefined },
      },
      reply: { body: result ? `*${formatDatePretty(dateStr)}* has been unblocked. ✅` : `Could not unblock *${formatDatePretty(dateStr)}*.`, buttonLabel: 'Manage', sections: getDoctorScheduleSections() },
      replyType: 'list',
    };
  }

  // Show blocked dates list so doctor can pick one to unblock
  if (intent === 'unblock_date') {
    const blocked = await fetchBlockedDates();
    if (blocked.length === 0) {
      return {
        session,
        reply: { body: '*No blocked dates.* All dates are available.', buttonLabel: 'Back', sections: getDoctorScheduleSections() },
        replyType: 'list',
      };
    }

    const rows = blocked.map((b) => ({
      id: `unblock_${b.date}`,
      title: `${formatDatePretty(b.date)} ${formatDayName(b.date)}`,
      description: b.reason || '',
    }));

    return {
      session,
      reply: { body: '*Select a date to unblock:*', buttonLabel: 'Blocked dates', sections: [{ title: 'Blocked Dates', rows }] },
      replyType: 'list',
    };
  }

  if (intent === 'doctor_block_date') {
    return {
      session: { ...session, state: 'DOCTOR_MANAGE_SCHEDULE', context: { ...session.context, doctorScheduleAction: 'blocking' } },
      reply: { body: 'Enter the date you want to block (DD-MM-YYYY) or tap "Pick a date":', buttonLabel: 'Pick a date', sections: getDateMoreSections(session) },
      replyType: 'list',
    };
  }

  if (intent === 'doctor_view_blocked') {
    const blocked = await fetchBlockedDates();
    if (blocked.length === 0) {
      return {
        session,
        reply: { body: '*No blocked dates.*', buttonLabel: 'Back', sections: getDoctorScheduleSections() },
        replyType: 'list',
      };
    }

    let body = '*📅 Blocked Dates*\n\n';
    blocked.forEach((b) => {
      body += `• ${formatDatePretty(b.date)} ${formatDayName(b.date)}`;
      if (b.reason) body += ` — ${b.reason}`;
      body += '\n';
    });

    return {
      session,
      reply: { body, buttonLabel: 'Manage', sections: getDoctorScheduleSections() },
      replyType: 'list',
    };
  }

  // Handle date selection for blocking
  if (intent === 'date_selected' && session.context?.doctorScheduleAction === 'blocking') {
    const dateStr = session.context?.doctorDate;
    if (dateStr) {
      // Check for existing appointments on this date
      const appointments = await fetchAppointmentsByDate(dateStr);
      const confirmed = appointments.filter(a => a.status === 'confirmed');

      if (confirmed.length > 0) {
        session = {
          ...session,
          context: {
            ...session.context,
            pendingBlockDate: dateStr,
            pendingBlockCount: confirmed.length,
            doctorScheduleAction: undefined,
          },
        };
        return {
          session,
          reply: {
            body: `*⚠️ Warning:* ${confirmed.length} appointment${confirmed.length > 1 ? 's' : ''} confirmed on *${formatDatePretty(dateStr)}*.\n\nBlocking will cancel them. What do you want to do?`,
            buttons: [
              { id: 'block_cancel_all', title: `🚫 Block & Cancel All` },
              { id: 'block_notify_reschedule', title: `📲 Block & Notify to Reschedule` },
              { id: 'back', title: '🔙 Cancel' },
            ],
          },
          replyType: 'buttons',
        };
      }

      const result = await blockDate(dateStr, null);
      return {
        session: {
          ...session,
          state: 'DOCTOR_MANAGE_SCHEDULE',
          context: { ...session.context, doctorScheduleAction: undefined, doctorDate: undefined },
        },
        reply: { body: result ? `*${formatDatePretty(dateStr)}* has been blocked.` : `Could not block *${formatDatePretty(dateStr)}*. It may already be blocked.`, buttonLabel: 'Manage', sections: getDoctorScheduleSections() },
        replyType: 'list',
      };
    }
  }

  // Handle block confirmation choices
  if (intent === 'block_cancel_all' && session.context?.pendingBlockDate) {
    const dateStr = session.context.pendingBlockDate;
    await blockDate(dateStr, null);
    const cancelled = await bulkCancelAppointmentsForDate(dateStr);
    return {
      session: {
        ...session,
        state: 'DOCTOR_MANAGE_SCHEDULE',
        context: { ...session.context, pendingBlockDate: undefined, pendingBlockCount: undefined, doctorDate: undefined },
      },
      reply: { body: `*${formatDatePretty(dateStr)}* blocked. ${cancelled.length} appointment${cancelled.length !== 1 ? 's' : ''} cancelled.`, buttonLabel: 'Manage', sections: getDoctorScheduleSections() },
      replyType: 'list',
    };
  }

  if (intent === 'block_notify_reschedule' && session.context?.pendingBlockDate) {
    const dateStr = session.context.pendingBlockDate;
    await blockDate(dateStr, null);
    const cancelled = await bulkCancelAppointmentsForDate(dateStr);

    // Notify doctor about affected patients
    if (cancelled.length > 0) {
      let notifyBody = `*📋 Appointments cancelled due to block on ${formatDatePretty(dateStr)}:*\n\n`;
      cancelled.forEach(a => {
        notifyBody += `• ${a.patient_name || 'Unknown'} — ${a.time || 'Walk-in'}\n`;
        if (a.wa_id) {
          sendText(a.wa_id, `⚠️ *${CLINIC.name}*\n\nDoctor is unavailable on ${formatDatePretty(dateStr)}. Please pick a new date by booking online.`).catch(() => {});
        }
      });
      notifyDoctor(notifyBody);
    }

    return {
      session: {
        ...session,
        state: 'DOCTOR_MANAGE_SCHEDULE',
        context: { ...session.context, pendingBlockDate: undefined, pendingBlockCount: undefined, doctorDate: undefined },
      },
      reply: { body: `*${formatDatePretty(dateStr)}* blocked. ${cancelled.length} patient${cancelled.length !== 1 ? 's' : ''} notified to reschedule.`, buttonLabel: 'Manage', sections: getDoctorScheduleSections() },
      replyType: 'list',
    };
  }

  return {
    session,
    reply: { body: '*Manage Schedule*\n\nBlock dates when the clinic is closed.', buttonLabel: 'Manage', sections: getDoctorScheduleSections() },
    replyType: 'list',
  };
}

function getDoctorScheduleSections() {
  return [
    { title: 'Schedule', rows: [
      { id: 'block_date', title: '🔒 Block a Date' },
      { id: 'view_blocked', title: '📋 View Blocked Dates' },
      { id: 'unblock_date', title: '🔓 Unblock a Date' },
      { id: 'back', title: '🔙 Back to Menu' },
    ]},
  ];
}

// ───────────────────────────────────────────────
// Aggregated feedback view for doctor
// ───────────────────────────────────────────────
async function handleDoctorFeedback(session) {
  const { getFeedbackSummary } = await import('@/db/repositories/feedbackRepository');
  const summary = await getFeedbackSummary();

  if (!summary) {
    return {
      session: { ...session, state: 'DOCTOR_MAIN_MENU' },
      reply: { body: '*Could not retrieve feedback data.*', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back to Menu' }]) },
      replyType: 'list',
    };
  }

  const { stats, recent, pendingCallbacks } = summary;
  let body = `*📊 Feedback Summary (Last 30 Days)*\n\n`;
  body += `Total Responses: *${stats.total}*\n`;
  body += `Average Rating: *${stats.avg_rating}/5*${stats.total > 0 ? ` ⭐` : ''}\n`;
  if (stats.total > 0) {
    const satisfaction = Math.round((stats.positive / stats.total) * 100);
    body += `Satisfaction: *${satisfaction}%* (${stats.positive} positive, ${stats.negative} negative)\n`;
  }
  body += `Pending Callbacks: *${pendingCallbacks.length}*\n`;

  if (recent.length > 0) {
    body += `\n*Recent Feedback:*\n`;
    recent.forEach(f => {
      const stars = '⭐'.repeat(f.rating) + '☆'.repeat(5 - f.rating);
      body += `\n${stars} — ${f.patient_name || 'Anonymous'}`;
      if (f.comment) body += `\n  "${f.comment.slice(0, 80)}"`;
    });
  }

  if (pendingCallbacks.length > 0) {
    body += `\n\n*📞 Pending Callbacks:*\n`;
    pendingCallbacks.forEach((cb, i) => {
      body += `\n${i + 1}. ${cb.patient_name || 'Unknown'} — ${cb.patient_phone || cb.wa_id || 'N/A'}`;
      if (cb.comment) body += ` (${cb.comment.slice(0, 50)})`;
    });
  }

  return {
    session: { ...session, state: 'DOCTOR_MAIN_MENU' },
    reply: { body, buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back to Menu' }]) },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Patient edit on bot
// ───────────────────────────────────────────────
async function handleDoctorEditPatient(session, normalized, intent, entities) {
  if (intent === 'back') return handleDoctorBack(session);

  const patientId = session.context?.selectedPatient;
  if (!patientId) {
    return {
      session: { ...session, state: 'DOCTOR_MAIN_MENU' },
      reply: { body: '*No patient selected.*', buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  const patient = await findPatientById(patientId);
  if (!patient) {
    return {
      session: { ...session, state: 'DOCTOR_MAIN_MENU' },
      reply: { body: '*Patient not found.*', buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  const editField = session.context?.editField;

  if (!editField) {
    // Show edit options menu
    const body = `*✏️ Edit Patient: ${patient.name}*\n\nCurrent details:\nName: ${patient.name}\nAge: ${patient.age || '—'}\nSex: ${patient.sex || '—'}\nPhone: ${patient.phone}\n\nWhat would you like to edit?`;
    return {
      session: { ...session, state: 'DOCTOR_EDIT_PATIENT' },
      reply: {
        body,
        buttonLabel: 'Edit',
        sections: [{
          title: 'Edit Field',
          rows: [
            { id: 'provide_name', title: '✏️ Name' },
            { id: 'provide_age', title: '✏️ Age' },
            { id: 'provide_sex', title: '✏️ Sex' },
            { id: 'back', title: '🔙 Cancel' },
          ],
        }],
      },
      replyType: 'list',
    };
  }

  // Handle text input for the field being edited
  const text = (normalized?.textClean || '').trim();
  if (!text) {
    return { session, reply: `Enter new ${editField}:`, replyType: 'text' };
  }

  const updateFields = {};
  if (editField === 'name') updateFields.name = text;
  else if (editField === 'age') {
    const age = parseInt(text, 10);
    if (isNaN(age) || age < 0 || age > 150) {
      return { session, reply: 'Please enter a valid age (0-150):', replyType: 'text' };
    }
    updateFields.age = age;
  } else if (editField === 'sex') {
    const sex = text.toLowerCase();
    if (!['male', 'female', 'm', 'f', 'other'].includes(sex)) {
      return { session, reply: 'Please enter Male, Female, or Other:', replyType: 'text' };
    }
    updateFields.sex = sex === 'm' ? 'Male' : sex === 'f' ? 'Female' : sex.charAt(0).toUpperCase() + sex.slice(1);
  }

  const updated = await updatePatient(patientId, updateFields);
  if (!updated) {
    return { session, reply: 'Could not update patient. Try again.', replyType: 'text' };
  }

  return showPatientVisits({ ...session, context: { ...session.context, editField: undefined } }, updated);
}

// ───────────────────────────────────────────────
// Stats view
// ───────────────────────────────────────────────
async function handleDoctorStats(session) {
  const sql = getSql();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStart = weekAgo.toISOString().slice(0, 10);
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const monthStart = monthAgo.toISOString().slice(0, 10);

  const prevWeekStart = new Date(weekAgo);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = new Date(weekAgo);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);

  const [todayCount, weekCount, monthCount, todayRevenue, todayNewPatients, todayStatusBreakdown, todayArrivalBreakdown, weekRevenue, topTreatment, noShowRate, prevWeekCount, sexBreakdown, topAgeGroup] = await Promise.all([
    countAppointmentsByDateRange(today, today),
    countAppointmentsByDateRange(weekStart, today),
    countAppointmentsByDateRange(monthStart, today),
    sql`
      SELECT COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0)::int AS revenue
      FROM appointments a
      WHERE a.date = ${today}
        AND a.status = 'completed'
    `.then(r => r[0]?.revenue || 0),
    sql`
      SELECT COUNT(*)::int AS count
      FROM patients
      WHERE created_at::date = ${today}
    `.then(r => r[0]?.count || 0),
    sql`
      SELECT a.status, COUNT(*)::int AS count
      FROM appointments a
      WHERE a.date = ${today}
        AND a.status IN ('confirmed', 'completed', 'no_show')
      GROUP BY a.status
    `.then(r => {
      const map = { confirmed: 0, completed: 0, no_show: 0 };
      r.forEach(row => { map[row.status] = parseInt(row.count, 10); });
      return map;
    }),
    sql`
      SELECT a.arrival_status, COUNT(*)::int AS count
      FROM appointments a
      WHERE a.date = ${today}
        AND a.status = 'confirmed'
      GROUP BY a.arrival_status
    `.then(r => {
      const map = { scheduled: 0, arrived: 0, called: 0 };
      r.forEach(row => { map[row.arrival_status] = parseInt(row.count, 10); });
      return map;
    }),
    // Week revenue
    sql`
      SELECT COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0)::int AS revenue
      FROM appointments a
      WHERE a.date >= ${weekStart} AND a.date <= ${today}
        AND a.status = 'completed'
    `.then(r => r[0]?.revenue || 0),
    // Top treatment this month
    sql`
      SELECT a.treatment, COUNT(*)::int AS count
      FROM appointments a
      WHERE a.date >= ${monthStart} AND a.date <= ${today}
        AND a.status = 'completed' AND a.treatment IS NOT NULL
      GROUP BY a.treatment
      ORDER BY count DESC
      LIMIT 1
    `.then(r => r[0] || null),
    // No-show rate this week
    sql`
      SELECT
        COUNT(*) FILTER (WHERE a.status = 'no_show') AS no_shows,
        COUNT(*) FILTER (WHERE a.status IN ('completed', 'no_show')) AS total
      FROM appointments a
      WHERE a.date >= ${weekStart} AND a.date <= ${today}
    `.then(r => {
      const row = r[0] || { no_shows: 0, total: 0 };
      return row.total > 0 ? Math.round((Number(row.no_shows) / Number(row.total)) * 100) : 0;
    }),
    // Previous week comparison
    countAppointmentsByDateRange(prevWeekStart.toISOString().slice(0, 10), prevWeekEnd.toISOString().slice(0, 10)),
    // Demographics — sex ratio for month
    sql`
      SELECT p.sex, COUNT(*)::int AS count
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.date >= ${monthStart} AND a.date <= ${today}
        AND a.status = 'completed' AND p.sex IS NOT NULL
      GROUP BY p.sex
    `.then(r => {
      const map = {};
      r.forEach(row => { map[row.sex?.toLowerCase() === 'm' ? 'Male' : 'Female'] = parseInt(row.count, 10); });
      return map;
    }),
    // Demographics — top age group for month
    sql`
      SELECT
        CASE
          WHEN p.age < 18 THEN '0-17'
          WHEN p.age BETWEEN 18 AND 35 THEN '18-35'
          WHEN p.age BETWEEN 36 AND 50 THEN '36-50'
          WHEN p.age BETWEEN 51 AND 65 THEN '51-65'
          ELSE '65+'
        END AS age_group,
        COUNT(*)::int AS count
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.date >= ${monthStart} AND a.date <= ${today}
        AND a.status = 'completed' AND p.age IS NOT NULL
      GROUP BY age_group
      ORDER BY count DESC
      LIMIT 1
    `.then(r => r[0] || null),
  ]);

  const weekTrend = prevWeekCount > 0 ? Math.round(((weekCount - prevWeekCount) / prevWeekCount) * 100) : 0;
  const weekTrendEmoji = weekTrend > 0 ? '📈' : weekTrend < 0 ? '📉' : '➡️';

  let body = `*📊 Clinic Stats*\n\n`;

  body += `*📅 Today (${new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}):*\n`;
  body += `Total: ${todayCount}\n`;
  body += `    ✅ Completed: ${todayStatusBreakdown.completed || 0}\n`;
  body += `    📌 Confirmed: ${todayStatusBreakdown.confirmed || 0}\n`;
  body += `    ❌ No Show: ${todayStatusBreakdown.no_show || 0}\n`;
  body += `    🚶 Waiting: ${todayArrivalBreakdown.arrived || 0}\n`;
  body += `    🏥 In Session: ${todayArrivalBreakdown.called || 0}\n`;
  body += `💰 Revenue: ₹${todayRevenue}\n`;
  body += `🆕 New Patients: ${todayNewPatients}\n\n`;

  body += `*📈 This Week vs Last:*\n`;
  body += `${weekTrendEmoji} ${weekCount} appts (${weekTrend > 0 ? '+' : ''}${weekTrend}%)\n`;
  body += `💰 Week Revenue: ₹${weekRevenue}\n`;
  body += `❌ No-Show Rate: ${noShowRate}%\n\n`;

  body += `*📆 This Month:*\n`;
  body += `${monthCount} appointments\n`;
  if (topTreatment) {
    body += `🏆 Top: ${topTreatment.treatment} (${topTreatment.count}x)\n`;
  }

  const maleCount = sexBreakdown?.Male || 0;
  const femaleCount = sexBreakdown?.Female || 0;
  const demoTotal = maleCount + femaleCount;
  if (demoTotal > 0) {
    body += `👥 M: ${maleCount}  F: ${femaleCount}\n`;
  }
  if (topAgeGroup) {
    body += `🧑 Top age: ${topAgeGroup.age_group} (${topAgeGroup.count})\n`;
  }

  return {
    session: { ...session, state: 'DOCTOR_MAIN_MENU' },
    reply: { body, buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back to Menu' }]) },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Single-row section helper
// ───────────────────────────────────────────────
function singleRowSection(rows) {
  return [{ title: 'Options', rows }];
}

// ───────────────────────────────────────────────
// Evening check-in: mark no-show by time
// ───────────────────────────────────────────────
async function handleDoctorEveningNoshow(session, time) {
  const today = new Date().toISOString().slice(0, 10);
  const appointments = await fetchAppointmentsByDate(today);
  const matching = appointments.find(a => (a.time || '').slice(0, 5) === time);

  if (!matching) {
    const lines = appointments.map(a => `  ${a.time}  ${a.patient_name || 'Patient'}  ${a.treatment || ''}`).join('\n');
    const body = appointments.length > 0
      ? `No appointment at *${time}* today. Available times:\n${lines}`
      : `No appointments at *${time}* today — no appointments were scheduled.`;
    return {
      session,
      reply: { body, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  const result = await updateAppointmentStatus(matching.id, 'no_show');

  if (!result) {
    return {
      session,
      reply: { body: `Could not update *${matching.patient_name || 'Patient'}* at *${time}*. Status may have already been changed.`,
               buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  logger.info('DOCTOR_EVENING_NOSHOW', { apptId: matching.id, time, patient: matching.patient_name });

  return {
    session: { ...session, state: 'DOCTOR_MAIN_MENU', context: { ...session.context, selectedAppointmentId: undefined, selectedAppointment: undefined } },
    reply: { body: `*${matching.patient_name || 'Patient'}* at *${time}* marked as *❌ No Show*.`,
             buttonLabel: 'Menu', sections: getDoctorMenuSections() },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Evening check-in: doctor says "all good" / general doctor affirm
// ───────────────────────────────────────────────
function handleDoctorAffirm(session) {
  return {
    session: { ...session, state: 'DOCTOR_MAIN_MENU' },
    reply: { body: 'Great! How can I help you?',
             buttonLabel: 'Menu', sections: getDoctorMenuSections() },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Receptionist helpers
// ───────────────────────────────────────────────
function getQueueStatusIcon(status) {
  switch (status) {
    case 'arrived': return '🟢';
    case 'waiting': return '🟡';
    case 'called': return '🔵';
    case 'in_session': return '🟣';
    case 'done': return '✅';
    default: return '⚪';
  }
}

function formatQueueTime(appt) {
  if (appt.time) return appt.time.slice(0, 5);
  if (appt.arrived_at) {
    const d = new Date(appt.arrived_at);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return 'Walk-in';
}

function getReceptionistMenuSections() {
  return [
    {
      title: 'Queue',
      rows: [
        { id: 'rec_view_queue', title: '🚶 View Queue' },
        { id: 'rec_register_walkin', title: '➕ Register Walk-in' },
      ],
    },
    {
      title: 'Patients',
      rows: [
        { id: 'rec_search', title: '🔍 Search Patient' },
      ],
    },
  ];
}

async function buildReceptionistMainMenuBody(session, includeGreeting) {
  const name = session.profileName || 'Receptionist';
  let body = '';

  if (includeGreeting) {
    const hour = Math.floor(getClinicMinutes() / 60);
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    body += `${greeting}, ${name}! 👋\n\n`;
  }

  const [arrived, waiting, called] = await Promise.all([
    countTodayByArrivalStatus('arrived'),
    countTodayByArrivalStatus('waiting'),
    countTodayByArrivalStatus('called'),
  ]);

  const total = arrived + waiting + called;
  body += `*📋 Today's Queue*\n`;
  body += `Arrived: ${arrived} | Waiting: ${waiting} | Called: ${called}\n\n`;
  body += `*Choose an option:*`;

  return body;
}

async function handleReceptionistGreeting(session) {
  session = { ...session, state: 'RECEPTIONIST_MAIN_MENU' };
  return handleReceptionistMainMenuWithGreeting(session);
}

async function handleReceptionistMainMenuWithGreeting(session) {
  const body = await buildReceptionistMainMenuBody(session, true);
  return {
    session,
    reply: { body, buttonLabel: 'Menu', sections: getReceptionistMenuSections() },
    replyType: 'list',
  };
}

async function handleReceptionistMainMenu(session, intent) {
  if (intent === 'receptionist_view_queue') {
    return handleReceptionistViewQueue(session);
  }
  if (intent === 'receptionist_register_walkin') {
    session = { ...session, state: 'REGISTER_NAME', context: { ...session.context, registration: {} } };
    return { session, reply: 'Enter patient name:', replyType: 'text' };
  }
  if (intent === 'receptionist_search') {
    session = { ...session, state: 'DOCTOR_SEARCH_PATIENT' };
    return { session, reply: 'Enter patient name or phone number:', replyType: 'text' };
  }

  const body = await buildReceptionistMainMenuBody(session, false);
  return {
    session,
    reply: { body, buttonLabel: 'Menu', sections: getReceptionistMenuSections() },
    replyType: 'list',
  };
}

function handleReceptionistAffirm(session) {
  return {
    session: { ...session, state: 'RECEPTIONIST_MAIN_MENU' },
    reply: { body: 'How can I help you?',
             buttonLabel: 'Menu', sections: getReceptionistMenuSections() },
    replyType: 'list',
  };
}

function handleReceptionistBack(session) {
  if (session.state === 'RECEPTIONIST_QUEUE_DETAIL') {
    return handleReceptionistViewQueue({ ...session, state: 'RECEPTIONIST_VIEW_QUEUE', previousState: session.state, metrics: { ...session.metrics, messagesInState: 0 } });
  }
  const receptionistStates = ['RECEPTIONIST_MAIN_MENU', 'RECEPTIONIST_VIEW_QUEUE'];
  const doctorStates = ['DOCTOR_SEARCH_PATIENT', 'DOCTOR_PATIENT_VISITS', 'DOCTOR_VIEW_CHIT'];
  const registrationStates = ['REGISTER_NAME', 'REGISTER_AGE', 'REGISTER_SEX', 'REGISTER_PHONE', 'REGISTER_APPOINTMENT'];
  const needsMainMenu = [...receptionistStates, ...doctorStates, ...registrationStates].includes(session.state);
  session = { ...session, state: 'RECEPTIONIST_MAIN_MENU', previousState: session.state };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
  return handleReceptionistMainMenu(session);
}

async function handleReceptionistViewQueue(session) {
  const today = new Date().toISOString().slice(0, 10);
  const [queue, todayAppts] = await Promise.all([
    fetchTodayQueue(),
    fetchAppointmentsByDate(today),
  ]);

  const scheduled = todayAppts.filter(a => a.arrival_status === 'scheduled');

  const sections = [];

  if (scheduled.length > 0) {
    sections.push({
      title: `⏳ Pending Arrival (${scheduled.length})`,
      rows: scheduled.map(a => ({
        id: `queue_patient_${a.id}`,
        title: `${formatQueueTime(a)} — ${a.patient_name || 'Patient'}`,
        description: a.treatment || '',
      })),
    });
  }

  if (queue.length > 0) {
    sections.push({
      title: `🚶 In Queue (${queue.length})`,
      rows: queue.map(a => ({
        id: `queue_patient_${a.id}`,
        title: `${a.is_priority ? '⭐ ' : ''}${getQueueStatusIcon(a.arrival_status)} ${formatQueueTime(a)} — ${a.patient_name || 'Patient'}`,
        description: `${a.treatment || ''}${a.is_priority ? ' ⭐ Priority' : ''}${a.arrival_status === 'called' ? ' Called' : ''}`,
      })),
    });
  }

  const [arrived, waiting, called] = await Promise.all([
    countTodayByArrivalStatus('arrived'),
    countTodayByArrivalStatus('waiting'),
    countTodayByArrivalStatus('called'),
  ]);

  if (sections.length === 0) {
    return {
      session: { ...session, state: 'RECEPTIONIST_MAIN_MENU' },
      reply: { body: '*No patients today.*\n\nTap Register Walk-in to add a patient.', buttonLabel: 'Menu', sections: getReceptionistMenuSections() },
      replyType: 'list',
    };
  }

  const body = `*📋 Today's Queue*\nArrived: ${arrived} | Waiting: ${waiting} | Called: ${called}\n\nTap a patient to manage:`;

  session = { ...session, state: 'RECEPTIONIST_VIEW_QUEUE' };

  return {
    session,
    reply: { body, buttonLabel: 'Queue', sections },
    replyType: 'list',
  };
}

async function handleReceptionistCreateWalkIn(session, normalized) {
  const reg = session.context.registration || {};
  const phone = reg.phone;

  if (!phone) {
    return { session, reply: 'Missing phone number. Please start registration again.', replyType: 'text' };
  }

  const patient = await createPatient({
    name: reg.name,
    age: reg.age,
    sex: reg.sex,
    phone: phone,
    waId: null,
  });

  const today = new Date().toISOString().slice(0, 10);

  const appt = await createAppointmentForPatient({
    patientName: reg.name,
    patientPhone: phone,
    waId: null,
    date: today,
    time: null,
    treatment: 'Walk-in',
  });

  if (appt) {
    await updateArrivalStatus(appt.id, 'arrived');
    notifyDoctorNewBooking(appt);
  }

  session = {
    ...session,
    state: 'RECEPTIONIST_MAIN_MENU',
    context: { ...session.context, registration: undefined },
  };

  const body = `*✅ Walk-in Registered*\n\n*Name:* ${reg.name}\n*Age:* ${reg.age || 'N/A'}\n*Sex:* ${reg.sex || 'N/A'}\n*Phone:* ${phone}\n\nPatient has been added to the queue.`;

  return {
    session,
    reply: { body, buttonLabel: 'Menu', sections: getReceptionistMenuSections() },
    replyType: 'list',
  };
}

async function handleReceptionistQueuePatient(session, entities) {
  const apptId = entities?.appointmentId;
  if (!apptId) {
    return handleReceptionistViewQueue(session);
  }

  const appt = await findAppointmentById(apptId);
  if (!appt) {
    return handleReceptionistViewQueue(session);
  }

  const isScheduled = appt.arrival_status === 'scheduled';

  let body = `*${appt.patient_name || 'Patient'}*\n`;
  body += `${formatQueueTime(appt)} | ${appt.arrival_status.toUpperCase()}\n`;
  if (appt.treatment) body += `🦷 ${appt.treatment}\n`;
  if (appt.is_priority) body += `⭐ Priority\n`;
  body += `\nChoose action:`;

  session = {
    ...session,
    state: 'RECEPTIONIST_QUEUE_DETAIL',
    context: { ...session.context, selectedQueueAppointmentId: apptId },
  };

  if (isScheduled) {
    return {
      session,
      reply: {
        body,
        buttons: [
          { id: 'queue_mark_arrived', title: '🟢 Mark Arrived' },
          { id: 'back', title: '🔙 Back' },
        ],
      },
      replyType: 'buttons',
    };
  }

  const priorityLabel = appt.is_priority ? '⭐ Remove Priority' : '⭐ Mark Priority';

  return {
    session,
    reply: {
      body,
      buttons: [
        { id: 'queue_call_now', title: '📞 Call Now' },
        { id: 'queue_toggle_priority', title: priorityLabel },
        { id: 'back', title: '🔙 Back' },
      ],
    },
    replyType: 'buttons',
  };
}

async function handleReceptionistMarkCalled(session) {
  const apptId = session.context?.selectedQueueAppointmentId;
  if (!apptId) {
    return handleReceptionistViewQueue(session);
  }

  const appt = await updateArrivalStatus(apptId, 'called');
  if (!appt) {
    return {
      session,
      reply: { body: 'Could not update patient status. They may have already been called.', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  const body = `*📞 ${appt.patient_name || 'Patient'}* has been called.\n\nThey will be seen shortly.`;

  return {
    session: { ...session, state: 'RECEPTIONIST_MAIN_MENU', context: { ...session.context, selectedQueueAppointmentId: undefined } },
    reply: { body, buttonLabel: 'Menu', sections: getReceptionistMenuSections() },
    replyType: 'list',
  };
}

async function handleReceptionistTogglePriority(session) {
  const apptId = session.context?.selectedQueueAppointmentId;
  if (!apptId) {
    return handleReceptionistViewQueue(session);
  }

  const appt = await toggleAppointmentPriority(apptId);
  if (!appt) {
    return {
      session,
      reply: { body: 'Could not toggle priority. Try again.', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  const label = appt.is_priority ? '⭐ Priority set' : 'Priority removed';
  const body = `*${appt.patient_name || 'Patient'}* — ${label}.\n\nThey will now ${appt.is_priority ? 'appear at the top' : 'return to normal position'} of the queue.`;

  return {
    session: { ...session, state: 'RECEPTIONIST_MAIN_MENU', context: { ...session.context, selectedQueueAppointmentId: undefined } },
    reply: { body, buttonLabel: 'Menu', sections: getReceptionistMenuSections() },
    replyType: 'list',
  };
}

async function handleReceptionistMarkArrived(session) {
  const apptId = session.context?.selectedQueueAppointmentId;
  if (!apptId) {
    return handleReceptionistViewQueue(session);
  }

  const appt = await updateArrivalStatus(apptId, 'arrived');
  if (!appt) {
    return {
      session,
      reply: { body: 'Could not mark patient as arrived. Try again.', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  const body = `*🟢 ${appt.patient_name || 'Patient'}* has arrived.\n\nThey are now in the queue.`;

  return {
    session: { ...session, state: 'RECEPTIONIST_MAIN_MENU', context: { ...session.context, selectedQueueAppointmentId: undefined } },
    reply: { body, buttonLabel: 'Menu', sections: getReceptionistMenuSections() },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Receptionist dispatch
// ───────────────────────────────────────────────
async function handleReceptionistDispatch(session, normalized, entities, intent) {
  if (intent === 'back') return handleReceptionistBack(session);

  switch (session.state) {
    case 'RECEPTIONIST_MAIN_MENU':
      return handleReceptionistMainMenu(session, intent);
    case 'RECEPTIONIST_VIEW_QUEUE':
      if (intent === 'receptionist_queue_patient') return handleReceptionistQueuePatient(session, entities);
      return handleReceptionistViewQueue(session);
    case 'RECEPTIONIST_QUEUE_DETAIL':
      if (intent === 'queue_mark_called') return handleReceptionistMarkCalled(session);
      if (intent === 'queue_toggle_priority') return handleReceptionistTogglePriority(session);
      if (intent === 'queue_mark_arrived') return handleReceptionistMarkArrived(session);
      return handleReceptionistViewQueue(session);
    case 'REGISTER_NAME':
      return handleRegisterName(session, normalized, intent);
    case 'REGISTER_AGE':
      return handleRegisterAge(session, normalized, intent);
    case 'REGISTER_SEX':
      return handleRegisterSex(session, normalized, intent);
    case 'REGISTER_PHONE':
      return handleRegisterPhone(session, normalized, intent);
    case 'REGISTER_APPOINTMENT':
      return handleRegisterAppointment(session, intent, entities, normalized);
    case 'DOCTOR_SEARCH_PATIENT': {
      const result = await handleDoctorSearchPatient(session, normalized, intent, entities);
      if (result.session.state === 'DOCTOR_MAIN_MENU') {
        result.session.state = 'RECEPTIONIST_MAIN_MENU';
        if (result.reply?.sections) {
          result.reply.sections = getReceptionistMenuSections();
        }
      }
      return result;
    }
    case 'DOCTOR_PATIENT_VISITS':
      return handleDoctorPatientVisits(session, normalized, intent, entities);
    case 'DOCTOR_VIEW_CHIT':
      return handleDoctorViewChit(session, normalized, intent, entities);
    default:
      return handleReceptionistGreeting(session);
  }
}

// ───────────────────────────────────────────────
// Doctor queue handlers
// ───────────────────────────────────────────────
async function handleDoctorViewQueue(session) {
  const [queue, scheduled] = await Promise.all([
    fetchTodayQueue(),
    fetchTodayScheduledAppointments(),
  ]);

  const [arrived, waiting, called, inSession] = await Promise.all([
    countTodayByArrivalStatus('arrived'),
    countTodayByArrivalStatus('waiting'),
    countTodayByArrivalStatus('called'),
    countTodayByArrivalStatus('in_session'),
  ]);

  const sections = [];

  // Scheduled patients pending arrival
  if (scheduled.length > 0) {
    sections.push({
      title: `⏳ Pending Arrival (${scheduled.length})`,
      rows: scheduled.map(a => ({
        id: `queue_mark_arrived_appt_${a.id}`,
        title: `${a.time?.slice(0, 5) || 'Walk-in'} — ${a.patient_name || 'Patient'}`,
        description: `📍 Tap to mark arrived`,
      })),
    });
  }

  // Active queue
  if (queue.length > 0) {
    sections.push({
      title: `🚶 In Queue (${queue.length})`,
      rows: queue.map((a) => ({
        id: `call_patient_${a.id}`,
        title: `${a.is_priority ? '⭐ ' : ''}${formatQueueTime(a)} — ${a.patient_name || 'Patient'}`,
        description: `${a.arrival_status === 'called' ? '📞 Called' : '📞 Tap to call'}${a.is_priority ? ' ⭐' : ''}`,
      })),
    });
  }

  if (queue.length === 0 && scheduled.length === 0) {
    return {
      session: { ...session, state: 'DOCTOR_MAIN_MENU' },
      reply: { body: '*No patients in queue or pending arrival.*', buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  let body = `*🚶 Today's Queue*\n`;
  body += `Arrived: ${arrived} | Waiting: ${waiting} | Called: ${called} | In Session: ${inSession}\n\n`;
  body += `📍 Mark pending patients as arrived, 📞 tap to call patients in:`;

  session = { ...session, state: 'DOCTOR_VIEW_QUEUE' };

  return {
    session,
    reply: { body, buttonLabel: 'Queue', sections },
    replyType: 'list',
  };
}

async function handleDoctorCallNext(session) {
  const queue = await fetchTodayQueue();

  // Filter to patients who are arrived or waiting (not yet called)
  const waitingPatients = queue.filter(a => a.arrival_status === 'arrived' || a.arrival_status === 'waiting');

  if (waitingPatients.length === 0) {
    return {
      session: { ...session, state: 'DOCTOR_MAIN_MENU' },
      reply: { body: '*No patients waiting.*\n\nEveryone has been called or the queue is empty.', buttonLabel: 'Menu', sections: getDoctorMenuSections() },
      replyType: 'list',
    };
  }

  const nextPatient = waitingPatients[0];
  const appt = await updateArrivalStatus(nextPatient.id, 'called');

  if (!appt) {
    return {
      session,
      reply: { body: 'Could not call the next patient. They may have already been called.', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  const remaining = waitingPatients.length - 1;
  const body = `*📞 Called: ${appt.patient_name || 'Patient'}*\n\n${remaining} patient(s) still waiting.`;

  return {
    session: { ...session, state: 'DOCTOR_MAIN_MENU' },
    reply: { body, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
    replyType: 'list',
  };
}

async function handleDoctorMarkArrived(session, entities) {
  const apptId = entities?.appointmentId;
  if (!apptId) {
    return handleDoctorViewQueue(session);
  }

  const appt = await updateArrivalStatus(apptId, 'arrived');
  if (!appt) {
    return {
      session,
      reply: { body: 'Could not mark patient as arrived. They may have already been marked.', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  const body = `*📍 ${appt.patient_name || 'Patient'} marked as arrived.*\n\nThey are now in the waiting queue.`;

  return {
    session: { ...session, state: 'DOCTOR_MAIN_MENU' },
    reply: { body, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
    replyType: 'list',
  };
}

async function handleDoctorCallPatient(session, entities) {
  const apptId = entities?.appointmentId;
  if (!apptId) {
    return handleDoctorViewQueue(session);
  }

  const appt = await updateArrivalStatus(apptId, 'called');
  if (!appt) {
    return {
      session,
      reply: { body: 'Could not update patient status. They may have already been called.', buttonLabel: 'Back', sections: singleRowSection([{ id: 'back', title: '🔙 Back' }]) },
      replyType: 'list',
    };
  }

  const body = `*📞 Called: ${appt.patient_name || 'Patient'}*\n\nThey have been notified.`;

  return {
    session: { ...session, state: 'DOCTOR_MAIN_MENU' },
    reply: { body, buttonLabel: 'Menu', sections: getDoctorMenuSections() },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Proactive notification fire points (called from outside)
// ───────────────────────────────────────────────
export async function notifyDoctorNewBooking(appointment) {
  const body = `*🆕 New Appointment Booked*\n\nPatient: ${appointment.patient_name || 'N/A'}\nPhone: ${appointment.wa_id || 'N/A'}\nDate: ${formatDate(appointment.date)} ${formatDayName(appointment.date)}\nTime: ${appointment.time}\nTreatment: ${appointment.treatment || 'N/A'}`;
  await notifyDoctor(body);
}

export async function notifyDoctorCancellation(appointment) {
  const body = `*❌ Appointment Cancelled*\n\nPatient: ${appointment.patient_name || 'N/A'}\nDate: ${formatDate(appointment.date)} ${formatDayName(appointment.date)}\nTime: ${appointment.time}\nTreatment: ${appointment.treatment || 'N/A'}`;
  await notifyDoctor(body);
}

export async function notifyDoctorReschedule(appointment, oldDate, oldTime) {
  const body = `*🔄 Appointment Rescheduled*\n\nPatient: ${appointment.patient_name || 'N/A'}\nOld: ${formatDate(oldDate)} at ${oldTime}\nNew: ${formatDate(appointment.date)} at ${appointment.time}\nTreatment: ${appointment.treatment || 'N/A'}`;
  await notifyDoctor(body);
}
