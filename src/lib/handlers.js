import { CLINIC } from '@/config/clinic';
import { validateDate, validateTime, validateTreatment, validatePhone } from '@/lib/validators';
import { formatDate, formatTime, formatPhone } from '@/utils/formatters';
import { createAppointment, findUpcomingByWaId, supersedeAppointment, cancelAppointment } from '@/db/repositories/appointmentRepository';
import { sendList } from '@/lib/whatsapp';
import { logger } from '@/lib/logger';
import { evaluateOverwrite, applyFieldOverwrite, getTargetState } from '@/lib/overwrite-policy';
import { accumulateEntities, computePendingFields } from '@/lib/entities';
import { getNextState } from '@/lib/transitions';

// ───────────────────────────────────────────────
// State-aware greeting for returning users
// ───────────────────────────────────────────────
const STATE_GREETING = {
  BOOKING_COLLECTION:   'Hi! We were setting up your appointment. What works for you?',
  BOOKING_CONFIRMATION: 'Hello! Your appointment details are ready to confirm.',
  BOOKED:               'Hi! You have an appointment booked.',
  CANCEL_CONFIRM:       'Hi! Were you looking to cancel an appointment?',
};

// ───────────────────────────────────────────────
// Frustration score
// ───────────────────────────────────────────────
function calculateFrustration(session, textLower) {
  let score = 0;
  if (/no|stop|wrong|ugh|stupid|bad/.test(textLower)) score += 2;
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
function progressiveFieldFill(session, justSetField, entities) {
  const booking = session.context.booking;
  const accumulated = session.context.receivedEntities || {};

  // Step 1: After setting date, check if we have a valid time in entities or accumulated
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
        return progressiveFieldFill(session, 'time', entities);
      }
    }
  }

  // Step 2: After setting time, check if we have a valid treatment
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
  if (intent === 'emergency') return handleEmergency(session);
  if (intent === 'escalate') return handleHumanEscalation(session);
  if (intent === 'cancel') return handleCancel(session);
  if (intent === 'main_menu') return handleMainMenu(session);
  if (intent === 'greeting') return handleGreeting(session);
  if (intent === 'thanks') return { session, reply: "You're welcome! Let me know if you need anything else.", replyType: 'text' };
  if (intent === 'help') return handleHelp(session);
  if (intent === 'affirm') return handleAffirm(session);
  if (intent === 'location') return handleLocation(session);
  if (intent === 'timings') return handleTimings(session);
  if (intent === 'services') return handleServices(session);
  if (intent === 'my_appointments') return handleMyAppointments(session);
  if (intent === 'back') return handleBack(session);

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
      reply: "No problem! Tell me a bit about what you're experiencing:\n\n• Tooth pain or sensitivity?\n• Need a routine checkup?\n• Looking for cosmetic treatment (whitening, braces)?\n• Something else?\n\nJust describe your symptoms and I'll recommend the right treatment.",
      replyType: 'text',
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
      reply: getDateListReply('Sure! What date would you like instead?'),
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
    return { session, reply: 'Sure! What time works better?', replyType: 'text' };
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
        body: 'Sure! Which treatment would you like instead?',
        buttonLabel: 'Select treatment',
        sections: treatmentSections(),
      },
      replyType: 'list',
    };
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

    case 'CANCEL_CONFIRM':
      return handleCancelConfirm(session, intent);

    case 'EMERGENCY':
      // Safety net — handleEmergency now transitions to MAIN_MENU directly,
      // so this case should rarely be hit. If it is, guide the user out.
      session = { ...session, state: 'MAIN_MENU' };
      return {
        session,
        reply: { body: 'How can I help you today?', buttonLabel: 'Select option', sections: mainMenuSections() },
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
// IDLE / ABANDONED
// ───────────────────────────────────────────────
function handleIdle(session) {
  session = { ...session, state: 'MAIN_MENU', previousState: session.state, context: resetBookingContext(session.context) };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0, frustrationScore: 0 };
  return {
    session,
    reply: { body: `Welcome to ${CLINIC.name} 🦷\nHow can I help you today?`, buttonLabel: 'Select option', sections: mainMenuSections() },
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
        body: 'What date works for you?',
        buttonLabel: 'Select date',
        sections: getDateListSections(),
      },
      replyType: 'list',
    };
  }

  session = { ...session, state: 'MAIN_MENU', previousState: session.state };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0, frustrationScore: 0 };
  return {
    session,
    reply: { body: `Welcome to ${CLINIC.name} 🦷\nHow can I help you today?`, buttonLabel: 'Select option', sections: mainMenuSections() },
    replyType: 'list',
  };
}

function mainMenuSections() {
  return [{
    title: 'Menu',
    rows: [
      { id: 'apt',  title: 'Book Appointment', description: 'Schedule a visit' },
      { id: 'svc',  title: 'Dental Services',  description: 'What we offer' },
      { id: 'loc',  title: 'Clinic Location',  description: 'Address & directions' },
      { id: 'tim',  title: 'Clinic Timings',   description: 'Opening hours' },
    ],
  }];
}

// ───────────────────────────────────────────────
// BOOKING_COLLECTION — unified field collection
// Collects date, time, and treatment in sequence based on
// computePendingFields(). Replaces BOOKING_DATE, BOOKING_TIME,
// and BOOKING_TREATMENT as a single state.
// ───────────────────────────────────────────────
function handleBookingCollection(session, entities, normalized, intent) {
  // ── Non-field intents ──
  if (intent === 'date_custom') {
    return {
      session,
      reply: 'Please type the date you\'d like.\n\nExamples: "tomorrow", "next Monday", "28 May"',
      replyType: 'text',
    };
  }
  if (intent === 'time_custom') {
    return {
      session,
      reply: 'Please type the time you\'d like.\n\nExamples: "10am", "2:30pm"\nSlots available every 30 minutes.',
      replyType: 'text',
    };
  }

  // Treatment help flow — user already set awaitingTreatmentHelp via global intent
  // ── Non-field intents — just re-prompt without penalty ──
  // If the intent is unknown or not field-specific, don't treat the text
  // as a field value. This prevents "Banana" from counting as a failed date
  // attempt (fixture 9) and "O'clock" from counting as a failed time attempt.
  if (!['provide_date', 'provide_time', 'provide_treatment',
        'correction_date', 'correction_time', 'correction_treatment',
        'date_custom', 'time_custom', 'treatment_help'].includes(intent)) {
    const noFieldPending = computePendingFields(session.context, session.context.receivedEntities || {});
    const noFieldCurrent = noFieldPending[0];
    if (!noFieldCurrent) {
      const filledSession = { ...session };
      filledSession.state = 'BOOKING_CONFIRMATION';
      filledSession.metrics = { ...filledSession.metrics, failedAttempts: 0, messagesInState: 0, currentField: null };
      return {
        session: filledSession,
        reply: {
          body: buildConfirmationBody(filledSession.context.booking),
          buttons: confirmationButtons(),
        },
        replyType: 'buttons',
      };
    }
    session.metrics = { ...session.metrics };
    return { session, ...buildFieldPrompt(noFieldCurrent, session.context.booking) };
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
          sections: symptomSectionsWithBack(),
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
        body: buildConfirmationBody(filledSession.context.booking),
        buttons: confirmationButtons(),
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
    }

    if (validation?.valid && validation?.parsed) {
      // ── Field value is valid — set it ──
      let setValue;
      if (currentField === 'date') {
        setValue = validation.parsed.toLocaleDateString('en-CA');
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
      const filledSession = progressiveFieldFill(session, currentField, entities);
      const newPending = computePendingFields(filledSession.context, filledSession.context.receivedEntities || {});

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
            body: buildConfirmationBody(filledSession.context.booking),
            buttons: confirmationButtons(),
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

      return {
        session: filledSession,
        ...buildFieldPrompt(nextField, filledSession.context.booking, ack),
      };
    }

    // ── Invalid value — show suggestion and re-prompt ──
    session.metrics = { ...session.metrics };
    session.metrics.failedAttempts++;
    session.metrics.totalFailedAttempts = (session.metrics.totalFailedAttempts || 0) + 1;
    if (session.metrics.failedAttempts >= 3) {
      return escalateForFailure(session);
    }
    return {
      session,
      ...buildFieldPrompt(currentField, session.context.booking, null, validation?.suggestion || ''),
    };
  }

  // ── No recognizable value — re-prompt ──
  session.metrics = { ...session.metrics };
  session.metrics.failedAttempts++;
  session.metrics.totalFailedAttempts = (session.metrics.totalFailedAttempts || 0) + 1;
  if (session.metrics.failedAttempts >= 3) {
    return escalateForFailure(session);
  }
  return {
    session,
    ...buildFieldPrompt(currentField, session.context.booking),
  };
}

// ───────────────────────────────────────────────
// Time quick pick sections
// ───────────────────────────────────────────────
function timeQuickPickSections(slots) {
  const picked = [];
  if (slots.length > 0) picked.push(slots[0]);
  if (slots.length > 2) picked.push(slots[Math.floor(slots.length / 2)]);
  if (slots.length > 1 && !picked.includes(slots[slots.length - 1])) picked.push(slots[slots.length - 1]);
  const unique = [...new Set(picked)].slice(0, 3);

  return [{
    title: 'Quick Pick',
    rows: [
      ...unique.map(t => ({
        id: `time_${t.replace(':', '')}`,
        title: t,
      })),
      { id: 'time_other', title: 'Type a different time' },
    ],
  }];
}

function timeQuickPickSectionsWithBack(slots) {
  const sections = timeQuickPickSections(slots);
  sections.push({
    title: 'Navigation',
    rows: [
      { id: 'back', title: '← Back' },
      { id: 'cancel', title: 'Cancel' },
    ],
  });
  return sections;
}

function getTimeListReply(session) {
  const dateStr = session.context?.booking?.date;
  const dayType = dateStr ? (new Date(dateStr).getDay() === 0 ? 'sunday' : 'weekday') : 'weekday';
  const slots = CLINIC.slots[dayType];
  const progress = session.context?.booking?.date ? buildProgressSummary(session.context.booking) : '';
  const body = progress
    ? `${progress}\n\nWhat time works for you?\nSlots available every 30 minutes.`
    : 'What time works for you?\nSlots available every 30 minutes.';
  return {
    body,
    buttonLabel: 'Select time',
    sections: timeQuickPickSectionsWithBack(slots),
  };
}

// ───────────────────────────────────────────────
// Date list sections
// ───────────────────────────────────────────────
function getDateListSections() {
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

  // Quick pick dates for deduplication
  const quickPickDates = [today, tomorrow, nextMon];
  function isQuickPick(d) {
    return quickPickDates.some(qd => qd.getTime() === d.getTime());
  }

  const sections = [];

  // Section 1: Quick Picks
  sections.push({
    title: 'Quick Picks',
    rows: [
      { id: 'date_today', title: `Today (${fmt(today)})` },
      { id: 'date_tomorrow', title: `Tomorrow (${fmt(tomorrow)})` },
      { id: 'date_next_mon', title: `Next Monday (${fmt(nextMon)})` },
    ],
  });

  // Section 2: Upcoming Dates (capped at 4 for WhatsApp 10-row limit)
  const upcomingRows = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // Skip weekends
    if (isQuickPick(d)) continue;
    upcomingRows.push({ id: toId(d), title: fmt(d) });
    if (upcomingRows.length >= 4) break;
  }

  if (upcomingRows.length > 0) {
    sections.push({ title: 'Upcoming Dates', rows: upcomingRows });
  }

  // Section 3: Custom
  sections.push({
    title: 'Custom',
    rows: [
      { id: 'date_other', title: 'Type a different date' },
    ],
  });

  // Section 4: Navigation
  sections.push({
    title: 'Navigation',
    rows: [
      { id: 'back', title: '← Back' },
      { id: 'cancel', title: 'Cancel' },
    ],
  });

  return sections;
}

function getDateListReply(body) {
  return {
    body,
    buttonLabel: 'Select date',
    sections: getDateListSections(),
  };
}

// ── Old handler block removed — functionality consolidated into handleBookingCollection above

function treatmentSections() {
  return [{
    title: 'Available Treatments',
    rows: [
      ...CLINIC.treatments.map((t, i) => ({
        id: t.id,
        title: `${i + 1}. ${t.name}`,
      })),
      { id: 'treatment_help', title: "I'm not sure — help me choose", description: 'Describe your symptoms' },
    ],
  }];
}

function treatmentSectionsWithBack() {
  return [...treatmentSections(), {
    title: 'Navigation',
    rows: [
      { id: 'back', title: '← Back' },
    ],
  }];
}

function symptomSections() {
  return [{
    title: 'What brings you in?',
    rows: [
      ...CLINIC.treatments.map(t => ({
        id: t.id,
        title: t.symptom,
        description: t.name,
      })),
      { id: 'treatment_help', title: "Something else — tell me more", description: "Describe what you're feeling" },
    ],
  }];
}

function symptomSectionsWithBack() {
  return [...symptomSections(), {
    title: 'Navigation',
    rows: [
      { id: 'back', title: '← Back' },
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
      // New appointment
      appointment = await createAppointment({
        sessionId: session.id,
        waId: session.waId,
        patientName: session.profileName,
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

    session = {
      ...session,
      state: 'BOOKED',
      previousState: session.state,
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };

    const header = isReschedule ? '✅ Rescheduled!' : '✅ Confirmed!';

    return {
      session,
      reply: {
        body: `${header}\n\nDate: ${formatDateDisplay(booking.date)}\nTime: ${formatTime(booking.time)}\nTreatment: ${booking.treatment}\n\nWe look forward to seeing you!`,
        buttonLabel: 'Options',
        sections: [{
          title: 'Manage Booking',
          rows: [
            { id: 'book_another', title: 'Book Another', description: 'Schedule a new appointment' },
            { id: 'resched', title: 'Reschedule', description: 'Change date, time, or treatment' },
            { id: 'cancel_appt', title: 'Cancel', description: 'Cancel this appointment' },
            { id: 'main_menu', title: 'Main Menu', description: 'Back to home' },
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
      reply: getDateListReply('What date would you like instead?'),
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
    return { session, reply: 'What time works better?', replyType: 'text' };
  }

  if (intent === 'change_booking') {
    return {
      session,
      reply: {
        body: 'What would you like to change?',
        buttonLabel: 'Select option',
        sections: changeOptionsSections(),
      },
      replyType: 'list',
    };
  }

  // Cancel
  session = {
    ...session,
    state: 'MAIN_MENU',
    context: resetBookingContext(session.context),
  };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
  return {
    session,
    reply: { body: 'No problem. What would you like to do instead?', buttonLabel: 'Menu', sections: mainMenuSections() },
    replyType: 'list',
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
    // Capture current booking summary BEFORE resetting context
    const currentSummary = buildProgressSummary(session.context.booking);
    session = {
      ...session,
      state: 'BOOKING_COLLECTION',
      previousState: session.state,
      context: {
        ...session.context,
        reschedulingLogicalId: session.context.logicalId,
        booking: { date: null, time: null, treatment: null },
        receivedEntities: { dates: [], times: [], treatments: [] },
      },
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: getDateListReply(`Sure! Let's reschedule your current appointment:\n${currentSummary}\n\nWhat date would you like instead?`),
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
      reply: getDateListReply('Sure! What date works for you?'),
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
      reply: { body: 'What would you like to do?', buttonLabel: 'Menu', sections: mainMenuSections() },
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
        sections: getDateListSections(),
      },
      replyType: 'list',
    };
  }
  // Fallback — show main menu
  return {
    session,
    reply: { body: 'What would you like to do?', buttonLabel: 'Menu', sections: mainMenuSections() },
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// Affirm handler — user said "ok", "sure", "great" etc.
// Don't count as failure — just re-prompt the current state.
// ───────────────────────────────────────────────
function handleAffirm(session) {
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
        body: buildConfirmationBody(session.context.booking),
        buttons: confirmationButtons(),
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
    return {
      session: { ...session, metrics: { ...session.metrics, failedAttempts: 0 } },
      ...buildFieldPrompt(currentField, session.context.booking),
    };
  }

  // Default: just repeat current prompt
  return { session, reply: 'Got it! How can I help?', replyType: 'text' };
}

// ───────────────────────────────────────────────
// Info section options (shared by Services / Location / Timings)
// ───────────────────────────────────────────────
function infoOptionsSections(currentState) {
  const rows = [];
  if (currentState === 'MAIN_MENU') {
    rows.push({ id: 'apt', title: 'Book Appointment', description: 'Schedule a visit' });
  }
  rows.push({ id: 'main_menu', title: 'Main Menu', description: 'Back to home' });
  return [{ title: 'Options', rows }];
}

// ───────────────────────────────────────────────
// SERVICES — stays in current state, shows info as list
// ───────────────────────────────────────────────
function handleServices(session) {
  const servicesBullets = CLINIC.treatments.map(t => `\u2022 ${t.name}`).join('\n');
  return {
    session,
    reply: {
      body: `\uD83E\uDDB7 Our Services:\n\n${servicesBullets}`,
      buttonLabel: 'Select option',
      sections: infoOptionsSections(session.state),
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
      body: `\uD83D\uDCCD ${CLINIC.name}\n${CLINIC.address}\n\nPhone: ${CLINIC.phone}\n\uD83D\uDCCD Maps: ${CLINIC.mapsLink}`,
      buttonLabel: 'Select option',
      sections: infoOptionsSections(session.state),
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
      body: `\uD83D\uDD50 Clinic Hours\n\n${CLINIC.hours.weekday.label}\n${CLINIC.hours.sunday.label}`,
      buttonLabel: 'Select option',
      sections: infoOptionsSections(session.state),
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
      body: `⚠️ *DENTAL EMERGENCY*\n\nIf this is a dental emergency, please call *${CLINIC.phone}* immediately or visit the nearest hospital.\n\nFor any urgent dental concern, call us anytime and we will guide you on the next steps.\n\nHow can I help you today?`,
      buttonLabel: 'Select option',
      sections: mainMenuSections(),
    },
    replyType: 'list',
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
    reply: `Let me connect you to our team. Please call *${CLINIC.phone}* or expect a call back shortly.`,
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
        reply: { body: `Thanks! We will call you back at ${formatPhone(result.parsed)} during clinic hours.\n\nIs there anything else I can help with?`, buttonLabel: 'Menu', sections: mainMenuSections() },
        replyType: 'list',
      };
    }
  }

  session = { ...session };
  session.metrics = { ...session.metrics, failedAttempts: session.metrics.failedAttempts + 1, totalFailedAttempts: session.metrics.totalFailedAttempts + 1 };
  return { session, reply: 'Please share your 10-digit phone number for the callback.', replyType: 'text' };
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
      reply: `I'm sorry you're having trouble. Would you like me to connect you with our team? Call *${CLINIC.phone}* or type "agent" to speak with someone.`,
      replyType: 'text',
    };
  }

  // Context-aware reprompt
  const hints = {
    BOOKING_COLLECTION:   'Try a date, time, or treatment name.',
    BOOKING_CONFIRMATION: 'Reply "confirm" to book, "date" or "time" to change, or "cancel" to start over.',
    MAIN_MENU:            'Tap an option or type what you need (e.g., "book", "services").',
    CANCEL_CONFIRM:       'Tap "Yes, Cancel It" to cancel or "No, Keep It" to keep your appointment.',
  };

  const hint = hints[session.state] || 'Type "0" for the menu or tell me what you need.';
  return { session, reply: `Sorry, I didn't catch that. ${hint}`, replyType: 'text' };
}

// ───────────────────────────────────────────────
// Greeting (handles greeting intent globally)
// ───────────────────────────────────────────────
function handleGreeting(session) {
  const isNew = session.state === 'IDLE' || session.state === 'DONE' || session.state === 'ABANDONED';

  // If currently in EMERGENCY, treat greeting as wanting to exit to main menu
  if (session.state === 'EMERGENCY' || session.state === 'HUMAN_ESCALATION') {
    return handleMainMenu(session);
  }

  if (isNew) {
    session = { ...session, state: 'MAIN_MENU', previousState: session.state };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: { body: `Welcome to ${CLINIC.name} 🦷\nHow can I help you today?`, buttonLabel: 'Select option', sections: mainMenuSections() },
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
          body: buildConfirmationBody(session.context.booking),
          buttons: confirmationButtons(),
        },
        replyType: 'buttons',
      };
    }
    return {
      session,
      reply: {
        body: STATE_GREETING.BOOKING_COLLECTION,
        buttonLabel: 'Select',
        sections: pending[0] === 'date' ? getDateListSections() :
          pending[0] === 'time' ? timeQuickPickSectionsWithBack(CLINIC.slots.weekday) :
          symptomSectionsWithBack(),
      },
      replyType: 'list',
    };
  }

  const greeting = STATE_GREETING[session.state] || 'Welcome back!';

  if (session.state === 'BOOKING_CONFIRMATION') {
    return {
      session,
      reply: {
        body: `${greeting}\n\n${buildConfirmationBody(session.context.booking)}`,
        buttons: confirmationButtons(),
      },
      replyType: 'buttons',
    };
  }

  if (session.state === 'BOOKED') {
    return {
      session,
      reply: {
        body: greeting,
        buttonLabel: 'Options',
        sections: [{
          title: 'Manage Booking',
          rows: [
            { id: 'book_another', title: 'Book Another', description: 'Schedule a new appointment' },
            { id: 'resched', title: 'Reschedule', description: 'Change date, time, or treatment' },
            { id: 'cancel_appt', title: 'Cancel', description: 'Cancel this appointment' },
            { id: 'main_menu', title: 'Main Menu', description: 'Back to home' },
          ],
        }],
      },
      replyType: 'list',
    };
  }

  if (session.state === 'MAIN_MENU') {
    return {
      session,
      reply: { body: greeting, buttonLabel: 'Select option', sections: mainMenuSections() },
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
      body: 'Are you sure you want to cancel this appointment?',
      buttonLabel: 'Select option',
      sections: [{
        title: 'Cancel Appointment',
        rows: [
          { id: 'confirm_cancel_yes', title: 'Yes, Cancel It' },
          { id: 'confirm_cancel_no', title: 'No, Keep It' },
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
      // Fire-and-forget the main menu after a short delay so the empathetic
      // cancellation message lands first and breathes before options appear
      setTimeout(() => {
        sendList(session.waId, 'What would you like to do next?', 'Menu', mainMenuSections()).catch(() => {});
      }, 1500);

      return {
        session,
        reply: '✅ Your appointment has been cancelled.\n\nWe understand plans change. If there\'s anything we can help with, we\'re here for you.',
        replyType: 'text',
      };
    }

    return {
      session,
      reply: 'There was an issue cancelling your appointment. Please call us at ' + CLINIC.phone + ' or try again later.',
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
    reply: { body: 'No problem. What would you like to do instead?', buttonLabel: 'Menu', sections: mainMenuSections() },
    replyType: 'list',
  };
}

function showBookedSummary(session) {
  const booking = session.context.booking;
  session = { ...session, state: 'BOOKED', previousState: session.state };
  session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
  return {
    session,
    reply: {
      body: `📋 Your Appointment\n\nDate: ${formatDateDisplay(booking.date)}\nTime: ${formatTime(booking.time)}\nTreatment: ${booking.treatment}`,
      buttonLabel: 'Options',
      sections: [{
        title: 'Manage Booking',
        rows: [
          { id: 'book_another', title: 'Book Another', description: 'Schedule a new appointment' },
          { id: 'resched', title: 'Reschedule', description: 'Change date, time, or treatment' },
          { id: 'cancel_appt', title: 'Cancel', description: 'Cancel this appointment' },
          { id: 'main_menu', title: 'Main Menu', description: 'Back to home' },
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
          body: 'You don\'t have any upcoming appointments.\n\nWould you like to book one?',
          buttonLabel: 'Menu',
          sections: mainMenuSections(),
        },
        replyType: 'list',
      };
    }

    let body = '📋 *Your Upcoming Appointments*\n\n';
    appointments.forEach((apt, i) => {
      const d = new Date(apt.date + 'T' + apt.time);
      body += `${i + 1}. ${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} at ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}\n`;
      body += `   Treatment: ${apt.treatment || 'N/A'}\n`;
      body += `   Status: ${apt.status}\n\n`;
    });
    body += 'Tap "Main Menu" to continue.';

    return {
      session,
      reply: { body, buttonLabel: 'Menu', sections: mainMenuSections() },
      replyType: 'list',
    };
  } catch {
    // DB error fallback — just show the main menu
    return {
      session,
      reply: { body: `Welcome to ${CLINIC.name} 🦷\nHow can I help you today?`, buttonLabel: 'Select option', sections: mainMenuSections() },
      replyType: 'list',
    };
  }
}

// ───────────────────────────────────────────────
// Global Cancel handler (state-aware)
// ───────────────────────────────────────────────
function handleCancel(session) {
  // If user has an appointment (either in BOOKED state or session has appointmentId),
  // offer cancellation flow
  if (session.state === 'BOOKED' || session.context.appointmentId) {
    return handleCancelAppointment(session);
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
    reply: { body: 'No problem. What would you like to do instead?', buttonLabel: 'Menu', sections: mainMenuSections() },
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
    const formatted = d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return `Great, ${formatted}! 🎉`;
  }
  if (field === 'time') {
    const formatted = new Date(`2000-01-01T${value}`).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `Got it, ${formatted}! 🎉`;
  }
  return '';
}

/**
 * Build the reply for prompting the next field to collect.
 * Returns { reply, replyType } suitable for spreading into the handler result.
 */
function buildFieldPrompt(field, booking, ack, suggestion) {
  const progress = buildProgressSummary(booking);
  let body = '';

  if (ack) {
    body = ack;
  } else if (progress && field !== 'date') {
    // Show progress summary for non-date fields (date hasn't been set yet at that point)
    body = progress;
  }

  if (field === 'date') {
    const prompt = suggestion || 'What date works for you?';
    const fullBody = body ? `${body}\n\n${prompt}` : prompt;
    return {
      reply: { body: fullBody, buttonLabel: 'Select date', sections: getDateListSections() },
      replyType: 'list',
    };
  }
  if (field === 'time') {
    const dateStr = booking?.date;
    const dayType = dateStr ? (new Date(dateStr).getDay() === 0 ? 'sunday' : 'weekday') : 'weekday';
    const slots = CLINIC.slots[dayType] || CLINIC.slots.weekday;
    const prompt = suggestion ? `What time works for you?\n${suggestion}` : 'What time works for you?\nSlots available every 30 minutes.';
    const fullBody = body ? `${body}\n\n${prompt}` : prompt;
    return {
      reply: { body: fullBody, buttonLabel: 'Select time', sections: timeQuickPickSectionsWithBack(slots) },
      replyType: 'list',
    };
  }
  if (field === 'treatment') {
    const prompt = suggestion || 'What seems to be the problem? Pick the symptom that fits best.';
    const fullBody = body ? `${body}\n\n${prompt}` : prompt;
    return {
      reply: { body: fullBody, buttonLabel: 'Select symptom', sections: symptomSectionsWithBack() },
      replyType: 'list',
    };
  }

  // Fallback
  return { reply: body || 'What would you like to do?', replyType: 'text' };
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

function buildConfirmationBody(booking) {
  let body = '📋 Appointment Summary\n';
  body += '━━━━━━━━━━━━━━━━\n';
  body += `Date: ${formatDateDisplay(booking.date)}\n`;
  body += `Time: ${formatTime(booking.time)}\n`;
  body += `Treatment: ${booking.treatment}`;
  return body;
}

function confirmationSections() {
  return [{
    title: 'Options',
    rows: [
      { id: 'confirm',    title: 'Confirm',      description: 'Book this appointment' },
      { id: 'edit_date',  title: 'Change Date',  description: 'Pick a different date' },
      { id: 'edit_time',  title: 'Change Time',  description: 'Pick a different time' },
      { id: 'cancel',     title: 'Cancel',       description: 'Start over' },
    ],
  }];
}

function confirmationSectionsWithBack() {
  return [...confirmationSections(), {
    title: 'Navigation',
    rows: [
      { id: 'back', title: '← Back' },
    ],
  }];
}

function confirmationButtons() {
  return [
    { id: 'confirm', title: 'Confirm ✓' },
    { id: 'change',  title: 'Change' },
    { id: 'cancel',  title: 'Cancel' },
  ];
}

function changeOptionsSections() {
  return [{
    title: 'What would you like to change?',
    rows: [
      { id: 'edit_date', title: 'Change Date' },
      { id: 'edit_time', title: 'Change Time' },
      { id: 'back',      title: '← Back' },
    ],
  }];
}

function buildProgressSummary(booking) {
  const parts = [];
  if (booking.date) parts.push(formatDateDisplay(booking.date));
  if (booking.time) parts.push(formatTime(booking.time));
  if (booking.treatment) parts.push(booking.treatment);
  return `📋 ${parts.join(' · ')}`;
}

function recommendTreatment(text) {
  const lower = text.toLowerCase();
  const matches = CLINIC.treatments.map(t => {
    const matched = t.aliases.filter(a => lower.includes(a.toLowerCase())).length;
    return { treatment: t.name, score: matched };
  }).filter(m => m.score > 0);
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.score - a.score);
  return matches[0].treatment;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return 'TBD';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ───────────────────────────────────────────────
// Help handler
// ───────────────────────────────────────────────
function handleHelp(session) {
  const hints = {
    BOOKING_COLLECTION:   'You can tell me a date, time, or treatment name depending on what\'s needed.',
    BOOKING_CONFIRMATION: 'Reply "confirm" to book, or "cancel" to start over.',
    MAIN_MENU:            'Tap an option or type "book", "services", "location", or "timings".',
    EMERGENCY:            'If this is an emergency, please call us immediately.',
    HUMAN_ESCALATION:     'Our team will be with you shortly.',
    CALLBACK_REQUESTED:   'Please share your 10-digit phone number.',
  };

  const hint = hints[session.state] || 'Type "0" for the menu or tell me what you need.';
  return { session, reply: `I can help you with appointments, services, and more! ${hint}`, replyType: 'text' };
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
    reply: `I'm having trouble understanding. Let me connect you to our team at *${CLINIC.phone}*.`,
    replyType: 'text',
  };
}
