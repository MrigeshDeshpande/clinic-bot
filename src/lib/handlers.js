import { CLINIC } from '@/config/clinic';
import { validateDate, validateTime, validateTreatment, validatePhone } from '@/lib/validators';
import { formatDate, formatTime, formatPhone } from '@/utils/formatters';
import { createAppointment, findUpcomingByWaId, updateAppointment, cancelAppointment } from '@/db/repositories/appointmentRepository';
import { sendList } from '@/lib/whatsapp';
import { logger } from '@/lib/logger';
import { evaluateOverwrite, applyFieldOverwrite, getTargetState } from '@/lib/overwrite-policy';
import { accumulateEntities } from '@/lib/entities';

// ───────────────────────────────────────────────
// State-aware greeting for returning users
// ───────────────────────────────────────────────
const STATE_GREETING = {
  BOOKING_DATE:         'Hi! We were picking a date for your appointment. What date works?',
  BOOKING_TIME:         'Hello! We were choosing a time. What time works for you?',
  BOOKING_TREATMENT:    'Hi! We were selecting a treatment. Which treatment do you need?',
  BOOKING_CONFIRMATION: 'Hello! Your appointment details are ready to confirm.',
  SERVICES:             'Hi! You were looking at our services.',
  LOCATION:             'Hi! You were checking our location.',
  TIMINGS:              'Hi! You were checking our hours.',
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
  if (intent === 'location') return handleLocation(session);
  if (intent === 'timings') return handleTimings(session);
  if (intent === 'services') return handleServices(session, intent);
  if (intent === 'my_appointments') return handleMyAppointments(session);

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
      return handleBookingDate(session, entities, normalized, intent);
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
      return handleBookingTime(session, entities, normalized, intent);
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
      return handleBookingTreatment(session, entities, normalized, intent);
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

    case 'BOOKING_DATE':
      return handleBookingDate(session, entities, normalized, intent);

    case 'BOOKING_TIME':
      return handleBookingTime(session, entities, normalized, intent);

    case 'BOOKING_TREATMENT':
      return handleBookingTreatment(session, entities, normalized, intent);

    case 'BOOKING_CONFIRMATION':
      return handleBookingConfirmation(session, intent, entities);

    case 'BOOKED':
      return handleBooked(session, intent);

    case 'CANCEL_CONFIRM':
      return handleCancelConfirm(session, intent);

    case 'SERVICES':
      return handleServices(session, intent);

    case 'LOCATION':
      return handleLocation(session);

    case 'TIMINGS':
      return handleTimings(session);

    case 'EMERGENCY':
      return handleEmergency(session);

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
    session = { ...session, state: 'BOOKING_DATE', previousState: session.state, context: resetBookingContext(session.context) };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: getDateListReply('What date works for you?'),
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
// BOOKING_DATE
// ───────────────────────────────────────────────
function handleBookingDate(session, entities, normalized, intent) {
  // If user tapped "Type a different date" — send text prompt, no failure penalty
  if (intent === 'date_custom') {
    return {
      session,
      reply: 'Please type the date you\'d like.\n\nExamples: "tomorrow", "next Monday", "28 May"',
      replyType: 'text',
    };
  }

  // Check if user provided a date
  const text = normalized ? normalized.textTrimmed : '';
  const dateToValidate = entities.date || text;

  // If entities already parsed a Date object, format as YYYY-MM-DD in local timezone
  const dateStr = dateToValidate instanceof Date
    ? dateToValidate.toLocaleDateString('en-CA')
    : dateToValidate;
  const result = validateDate(dateStr);

  if (result.valid && result.parsed) {
    const dateObj = result.parsed;
    const dayType = dateObj.getDay() === 0 ? 'sunday' : 'weekday';
    const slots = CLINIC.slots[dayType];

    // Store as YYYY-MM-DD string (local timezone) for proper parsing downstream
    const isoDate = dateObj.toLocaleDateString('en-CA');

    // Apply field overwrite with audit tracking
    const { booking, bookingTimestamps } = applyFieldOverwrite(
      session.context.booking,
      session.context.bookingTimestamps,
      'date',
      isoDate
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

    // Try progressive fill: check if we also have time (and treatment) entities
    const filledSession = progressiveFieldFill(session, 'date', entities);

    // Determine next state based on available fields
    const nowHasTime = filledSession.context.booking.time;
    const nowHasTreatment = filledSession.context.booking.treatment;

    let nextState, replyObj;
    if (nowHasTime && nowHasTreatment) {
      // All fields filled — go straight to confirmation
      nextState = 'BOOKING_CONFIRMATION';
      replyObj = {
        reply: {
          body: buildConfirmationBody(filledSession.context.booking),
          buttonLabel: 'Choose',
          sections: confirmationSections(),
        },
        replyType: 'list',
      };
    } else if (nowHasTime) {
      // Time set but still need treatment
      nextState = 'BOOKING_TREATMENT';
      replyObj = {
        reply: {
          body: 'Which treatment do you need?',
          buttonLabel: 'Select treatment',
          sections: treatmentSections(),
        },
        replyType: 'list',
      };
    } else {
      // Only date — ask for time
      nextState = 'BOOKING_TIME';
      replyObj = {
        reply: {
          body: 'What time works for you?\nSlots available every 30 minutes.',
          buttonLabel: 'Select time',
          sections: timeQuickPickSections(slots),
        },
        replyType: 'list',
      };
    }

    filledSession.state = nextState;
    filledSession.metrics = {
      ...filledSession.metrics,
      failedAttempts: 0,
      messagesInState: 0,
      currentField: getFieldForState(nextState),
    };

    return { session: filledSession, ...replyObj };
  }

  // Invalid date — show list with reason-specific body
  session = { ...session };
  session.metrics = { ...session.metrics, failedAttempts: session.metrics.failedAttempts + 1, totalFailedAttempts: session.metrics.totalFailedAttempts + 1 };

  if (session.metrics.failedAttempts >= 3) {
    return escalateForFailure(session);
  }

  const REASON_MESSAGES = {
    PAST_DATE:           'That date has already passed. Please pick a future date from the list below.',
    BEYOND_HORIZON:      `We only book up to ${CLINIC.bookingHorizonDays} days ahead. Please pick a closer date from the list below.`,
    PARSE_FAILED:        'I didn\'t catch that date. Try tapping a date below or type one yourself.',
  };

  const reasonBody = REASON_MESSAGES[result.reason] || REASON_MESSAGES.PARSE_FAILED;
  return {
    session,
    reply: getDateListReply(reasonBody),
    replyType: 'list',
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

function getTimeListReply(session) {
  const dateStr = session.context?.booking?.date;
  const dayType = dateStr ? (new Date(dateStr).getDay() === 0 ? 'sunday' : 'weekday') : 'weekday';
  const slots = CLINIC.slots[dayType];
  return {
    body: 'What time works for you?\nSlots available every 30 minutes.',
    buttonLabel: 'Select time',
    sections: timeQuickPickSections(slots),
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

  // Section 2: Upcoming Dates (remaining weekdays, capped at 6 for WhatsApp 10-row limit)
  const upcomingRows = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // Skip weekends
    if (isQuickPick(d)) continue;
    upcomingRows.push({ id: toId(d), title: fmt(d) });
    if (upcomingRows.length >= 6) break;
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

  return sections;
}

function getDateListReply(body) {
  return {
    body,
    buttonLabel: 'Select date',
    sections: getDateListSections(),
  };
}

// ───────────────────────────────────────────────
// BOOKING_TIME
// ───────────────────────────────────────────────
function handleBookingTime(session, entities, normalized, intent) {
  // If user tapped "Type a different time" — send text prompt, no failure penalty
  if (intent === 'time_custom') {
    return {
      session,
      reply: 'Please type the time you\'d like.\n\nExamples: "10am", "2:30pm"\nSlots available every 30 minutes.',
      replyType: 'text',
    };
  }
  if (entities.time) {
    const bookingDate = session.context.booking.date ? new Date(session.context.booking.date) : new Date();
    const result = validateTime(entities.time, bookingDate);

    if (result.valid && result.parsed) {
      // Apply field overwrite with audit tracking
      const { booking, bookingTimestamps } = applyFieldOverwrite(
        session.context.booking,
        session.context.bookingTimestamps,
        'time',
        result.parsed
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

      // Try progressive fill: check if we also have treatment entity
      const filledSession = progressiveFieldFill(session, 'time', entities);
      const nowHasTreatment = filledSession.context.booking.treatment;

      let nextState, replyObj;
      if (nowHasTreatment) {
        nextState = 'BOOKING_CONFIRMATION';
        replyObj = {
          reply: {
            body: buildConfirmationBody(filledSession.context.booking),
            buttonLabel: 'Choose',
            sections: confirmationSections(),
          },
          replyType: 'list',
        };
      } else {
        nextState = 'BOOKING_TREATMENT';
        replyObj = {
          reply: {
            body: 'Which treatment do you need?',
            buttonLabel: 'Select treatment',
            sections: treatmentSections(),
          },
          replyType: 'list',
        };
      }

      filledSession.state = nextState;
      filledSession.metrics = {
        ...filledSession.metrics,
        failedAttempts: 0,
        messagesInState: 0,
        currentField: getFieldForState(nextState),
      };

      return { session: filledSession, ...replyObj };
    }

    session = { ...session };
    session.metrics = { ...session.metrics, failedAttempts: session.metrics.failedAttempts + 1, totalFailedAttempts: session.metrics.totalFailedAttempts + 1 };

    if (session.metrics.failedAttempts >= 3) {
      return escalateForFailure(session);
    }

    // Show suggestion + time list
    const hint = result.suggestion || '';
    const body = hint ? `${hint}\n\nWhat time works for you?\nSlots available every 30 minutes.` : 'What time works for you?\nSlots available every 30 minutes.';
    const bookingDateStr = session.context.booking?.date;
    const dayType = bookingDateStr ? (new Date(bookingDateStr).getDay() === 0 ? 'sunday' : 'weekday') : 'weekday';
    return {
      session,
      reply: {
        body,
        buttonLabel: 'Select time',
        sections: timeQuickPickSections(CLINIC.slots[dayType]),
      },
      replyType: 'list',
    };
  }

  session = { ...session };
  session.metrics = { ...session.metrics, failedAttempts: session.metrics.failedAttempts + 1, totalFailedAttempts: session.metrics.totalFailedAttempts + 1 };

  if (session.metrics.failedAttempts >= 3) {
    return escalateForFailure(session);
  }

  return {
    session,
    reply: getTimeListReply(session),
    replyType: 'list',
  };
}

// ───────────────────────────────────────────────
// BOOKING_TREATMENT
// ───────────────────────────────────────────────
function handleBookingTreatment(session, entities, normalized, intent) {
  let treatmentName = entities.treatment || null;

  // Check number input
  if (!treatmentName && normalized) {
    const num = normalized.textTrimmed.match(/^(\d+)$/);
    if (num) {
      const idx = parseInt(num[1], 10) - 1;
      if (CLINIC.treatments[idx]) {
        treatmentName = CLINIC.treatments[idx].name;
      }
    }
  }

  if (treatmentName) {
    const result = validateTreatment(treatmentName);
    if (result.valid && result.parsed) {
      // Apply field overwrite with audit tracking
      const { booking, bookingTimestamps } = applyFieldOverwrite(
        session.context.booking,
        session.context.bookingTimestamps,
        'treatment',
        result.parsed
      );

      session = {
        ...session,
        state: 'BOOKING_CONFIRMATION',
        previousState: session.state,
        context: {
          ...session.context,
          booking,
          bookingTimestamps,
        },
      };
      session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0, currentField: null };

      return {
        session,
        reply: {
          body: buildConfirmationBody(session.context.booking),
          buttonLabel: 'Choose',
          sections: confirmationSections(),
        },
        replyType: 'list',
      };
    }

    session = { ...session };
    session.metrics = { ...session.metrics, failedAttempts: session.metrics.failedAttempts + 1, totalFailedAttempts: session.metrics.totalFailedAttempts + 1 };

    if (session.metrics.failedAttempts >= 3) {
      return escalateForFailure(session);
    }

    const hint = result.suggestion || 'Please pick from the list.';
    return { session, reply: hint, replyType: 'text' };
  }

  session = { ...session };
  session.metrics = { ...session.metrics, failedAttempts: session.metrics.failedAttempts + 1, totalFailedAttempts: session.metrics.totalFailedAttempts + 1 };

  if (session.metrics.failedAttempts >= 3) {
    return escalateForFailure(session);
  }

  return {
    session,
    reply: {
      body: 'Which treatment do you need?',
      buttonLabel: 'Select treatment',
      sections: treatmentSections(),
    },
    replyType: 'list',
  };
}

function treatmentSections() {
  return [{
    title: 'Available Treatments',
    rows: CLINIC.treatments.map(t => ({
      id: t.id,
      title: t.name,
    })),
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

    // Check if this is a reschedule — update existing appointment
    if (session.context.reschedulingAppointmentId) {
      appointment = await updateAppointment(session.context.reschedulingAppointmentId, {
        date: booking.date,
        time: booking.time,
        treatment: booking.treatment,
      });
      if (appointment) {
        isReschedule = true;
        logger.info('APPOINTMENT_RESCHEDULED', {
          waId: session.waId,
          appointmentId: appointment.id,
          date: booking.date,
          time: booking.time,
          treatment: booking.treatment,
        });
        session.context.appointmentId = appointment.id;
      }
      delete session.context.reschedulingAppointmentId;
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
          appointmentId: appointment.id,
          date: booking.date,
          time: booking.time,
          treatment: booking.treatment,
        });
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
      state: 'BOOKING_DATE',
      context: {
        ...session.context,
        booking: { ...session.context.booking, date: null, time: null },
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
      state: 'BOOKING_TIME',
      context: {
        ...session.context,
        booking: { ...session.context.booking, time: null },
      },
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return { session, reply: 'What time works better?', replyType: 'text' };
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
    session = {
      ...session,
      state: 'BOOKING_DATE',
      previousState: session.state,
      context: {
        ...session.context,
        reschedulingAppointmentId: session.context.appointmentId,
        booking: { date: null, time: null, treatment: null },
      },
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: getDateListReply('Sure! Let\'s reschedule. What date works for you?'),
      replyType: 'list',
    };
  }

  if (intent === 'appointment') {
    session = {
      ...session,
      state: 'BOOKING_DATE',
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
// SERVICES
// ───────────────────────────────────────────────
function handleServices(session, intent) {
  session = { ...session, state: 'SERVICES', previousState: session.state };

  if (intent === 'appointment') {
    session = { ...session, state: 'BOOKING_DATE', previousState: session.state };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: getDateListReply('What date works for you?'),
      replyType: 'list',
    };
  }

  const servicesBullets = CLINIC.treatments.map(t => `• ${t.name}`).join('\n');
  return {
    session,
    reply: { body: `🦷 Our Services:\n\n${servicesBullets}`, buttons: ['Book Appointment', 'Main Menu'] },
    replyType: 'buttons',
  };
}

// ───────────────────────────────────────────────
// LOCATION
// ───────────────────────────────────────────────
function handleLocation(session) {
  session = { ...session, state: 'LOCATION', previousState: session.state };

  const address = CLINIC.address;
  const mapsLink = CLINIC.mapsLink;
  const mapText = mapsLink && !mapsLink.startsWith('[TO BE FILLED') ? `\n📍 ${mapsLink}` : '';

  return {
    session,
    reply: { body: `📍 ${CLINIC.name}\n${address}\n\nPhone: ${CLINIC.phone}\nMaps: ${CLINIC.mapsLink}`, buttons: ['Main Menu'] },
    replyType: 'buttons',
  };
}

// ───────────────────────────────────────────────
// TIMINGS
// ───────────────────────────────────────────────
function handleTimings(session) {
  session = { ...session, state: 'TIMINGS', previousState: session.state };

  return {
    session,
    reply: { body: `🕐 Clinic Hours\n\n${CLINIC.hours.weekday.label}\n${CLINIC.hours.sunday.label}`, buttons: ['Main Menu'] },
    replyType: 'buttons',
  };
}

// ───────────────────────────────────────────────
// EMERGENCY
// ───────────────────────────────────────────────
function handleEmergency(session) {
  session = {
    ...session,
    state: 'EMERGENCY',
    previousState: session.state,
    isEscalated: true,
    context: { ...session.context, escalationReason: 'EMERGENCY' },
  };

  return {
    session,
    reply: `⚠️ *MEDICAL EMERGENCY*\n\nIf this is a medical emergency, please call *${CLINIC.phone}* immediately or visit the nearest hospital.\n\nFor urgent dental issues during clinic hours, call us and we will accommodate you as soon as possible.`,
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
    BOOKING_DATE:         'Try "tomorrow", "next Monday", or "25 May". What date works?',
    BOOKING_TIME:         'Try "10am", "2:30pm", or "14:00". What time works?',
    BOOKING_TREATMENT:    'Please tap or type a treatment from the list above.',
    BOOKING_CONFIRMATION: 'Reply "confirm" to book, "date" or "time" to change, or "cancel" to start over.',
    MAIN_MENU:            'Tap an option or type what you need (e.g., "book", "services").',
    SERVICES:             'Tap "Book Appointment" or "Main Menu".',
    LOCATION:             'Tap "Main Menu" to go back.',
    TIMINGS:              'Tap "Main Menu" to go back.',
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

  if (isNew) {
    session = { ...session, state: 'MAIN_MENU', previousState: session.state };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return {
      session,
      reply: { body: `Welcome to ${CLINIC.name} 🦷\nHow can I help you today?`, buttonLabel: 'Select option', sections: mainMenuSections() },
      replyType: 'list',
    };
  }

  // Returning user — show interactive list for date selection
  if (session.state === 'BOOKING_DATE') {
    return {
      session,
      reply: getDateListReply(STATE_GREETING.BOOKING_DATE),
      replyType: 'list',
    };
  }

  const greeting = STATE_GREETING[session.state] || 'Welcome back!';
  const repromptHints = {
    BOOKING_TIME:         'What time works for you?',
    BOOKING_TREATMENT:    'Which treatment do you need?',
    BOOKING_CONFIRMATION: 'Your appointment details are ready.',
    MAIN_MENU:            'How can I help you today?',
  };

  return {
    session,
    reply: `${greeting}\n\n${repromptHints[session.state] || ''}`,
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
      buttonLabel: 'Choose',
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
function getFieldForState(state) {
  switch (state) {
    case 'BOOKING_DATE': return 'date';
    case 'BOOKING_TIME': return 'time';
    case 'BOOKING_TREATMENT': return 'treatment';
    default: return null;
  }
}

function resetBookingContext(context) {
  return {
    ...context,
    booking: { date: null, time: null, treatment: null, patientName: null, patientPhone: null, notes: null },
    bookingTimestamps: { date: null, time: null, treatment: null },
    pendingFields: ['date', 'time', 'treatment'],
    receivedEntities: { dates: [], times: [], treatments: [] },
    lastCorrection: { field: null, fromValue: null, toValue: null, timestamp: null },
    escalationReason: null,
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
    BOOKING_DATE:         'You can tell me a date like "tomorrow", "next Monday", or "25 May".',
    BOOKING_TIME:         'You can tell me a time like "10am", "2:30pm", or "14:00".',
    BOOKING_TREATMENT:    'Tap or type a treatment name from the list.',
    BOOKING_CONFIRMATION: 'Reply "confirm" to book, or "cancel" to start over.',
    MAIN_MENU:            'Tap an option or type "book", "services", "location", or "timings".',
    SERVICES:             'Tap "Book Appointment" to book or "Main Menu" to go back.',
    LOCATION:             'Tap "Main Menu" to go back.',
    TIMINGS:              'Tap "Main Menu" to go back.',
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
