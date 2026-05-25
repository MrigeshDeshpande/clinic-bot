import { CLINIC } from '@/config/clinic';
import { validateDate, validateTime, validateTreatment, validatePhone } from '@/lib/validators';
import { formatDate, formatTime, formatPhone } from '@/utils/formatters';
import { createAppointment } from '@/db/repositories/appointmentRepository';
import { logger } from '@/lib/logger';

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
// Main dispatch
// ───────────────────────────────────────────────
export async function handle(state, { session, normalized, entities, intent }) {
  // Increment messagesInState
  session = { ...session };
  session.metrics = { ...session.metrics, messagesInState: session.metrics.messagesInState + 1 };

  // Global intent handling (before state-specific routing)
  if (intent === 'emergency') return handleEmergency(session);
  if (intent === 'escalate') return handleEscalation(session);
  if (intent === 'cancel') return handleCancel(session);
  if (intent === 'main_menu') return handleMainMenu(session);
  if (intent === 'greeting') return handleGreeting(session);
  if (intent === 'thanks') return { session, reply: "You're welcome! Let me know if you need anything else.", replyType: 'text' };
  if (intent === 'help') return handleHelp(session);
  if (intent === 'location') return handleLocation(session);
  if (intent === 'timings') return handleTimings(session);
  if (intent === 'services') return handleServices(session, intent);

  // State-specific routing
  switch (state) {
    case 'IDLE':
    case 'ABANDONED':
      return handleIdle(session);

    case 'MAIN_MENU':
      return handleMainMenu(session);

    case 'BOOKING_DATE':
      return handleBookingDate(session, entities, normalized);

    case 'BOOKING_TIME':
      return handleBookingTime(session, entities, normalized, intent);

    case 'BOOKING_TREATMENT':
      return handleBookingTreatment(session, entities, normalized);

    case 'BOOKING_CONFIRMATION':
      return handleBookingConfirmation(session, intent, entities);

    case 'BOOKED':
      return handleBooked(session, intent);

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
function handleMainMenu(session) {
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
function handleBookingDate(session, entities, normalized) {
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

    session = {
      ...session,
      state: 'BOOKING_TIME',
      previousState: session.state,
      context: {
        ...session.context,
        booking: { ...session.context.booking, date: isoDate },
      },
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0, currentField: 'time' };

    return {
      session,
      reply: {
        body: 'What time works for you?\nSlots available every 30 minutes.',
        buttonLabel: 'Select time',
        sections: timeQuickPickSections(slots),
      },
      replyType: 'list',
    };
  }

  // Invalid date — send reason-specific message
  session = { ...session };
  session.metrics = { ...session.metrics, failedAttempts: session.metrics.failedAttempts + 1, totalFailedAttempts: session.metrics.totalFailedAttempts + 1 };

  if (session.metrics.failedAttempts >= 3) {
    return escalateForFailure(session);
  }

  const REASON_MESSAGES = {
    PAST_DATE:           'That date has already passed. Please pick a future date.\n\nExamples: "tomorrow", "next Monday", "28 May"',
    BEYOND_HORIZON:      `We only book up to ${CLINIC.bookingHorizonDays} days ahead. Please pick a closer date.`,
    PARSE_FAILED:        'I didn\'t catch that date.\n\nTry: "tomorrow", "next Friday", "28 May"',
  };

  const reply = REASON_MESSAGES[result.reason] || REASON_MESSAGES.PARSE_FAILED;
  return { session, reply, replyType: 'text' };
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
      const formattedTime = formatTime(result.parsed);
      session = {
        ...session,
        state: 'BOOKING_TREATMENT',
        previousState: session.state,
        context: {
          ...session.context,
          booking: { ...session.context.booking, time: result.parsed },
        },
      };
      session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0, currentField: 'treatment' };

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
function handleBookingTreatment(session, entities, normalized) {
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
      session = {
        ...session,
        state: 'BOOKING_CONFIRMATION',
        previousState: session.state,
        context: {
          ...session.context,
          booking: { ...session.context.booking, treatment: result.parsed },
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

    // Persist appointment to DB
    const appointment = await createAppointment({
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

    session = {
      ...session,
      state: 'BOOKED',
      previousState: session.state,
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };

    return {
      session,
      reply: {
        body: `✅ Confirmed!\n\nDate: ${formatDateDisplay(booking.date)}\nTime: ${formatTime(booking.time)}\nTreatment: ${booking.treatment}\n\nWe look forward to seeing you!`,
        buttons: ['Book Another', 'Main Menu'],
      },
      replyType: 'buttons',
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
    return { session, reply: 'What date would you like instead?', replyType: 'text' };
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
  if (intent === 'appointment') {
    session = {
      ...session,
      state: 'BOOKING_DATE',
      previousState: session.state,
      context: resetBookingContext(session.context),
    };
    session.metrics = { ...session.metrics, failedAttempts: 0, messagesInState: 0 };
    return { session, reply: 'Sure! What date works for you?', replyType: 'text' };
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
    return { session, reply: 'What date works for you?', replyType: 'text' };
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

  // Returning user
  const greeting = STATE_GREETING[session.state] || 'Welcome back!';
  const repromptHints = {
    BOOKING_DATE:         'What date works?',
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
// Cancel handler
// ───────────────────────────────────────────────
function handleCancel(session) {
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
function resetBookingContext(context) {
  return {
    ...context,
    booking: { date: null, time: null, treatment: null, patientName: null, patientPhone: null, notes: null },
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
