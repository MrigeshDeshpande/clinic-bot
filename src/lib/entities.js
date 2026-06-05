import { validateDate, validateTime, validateTreatment, validatePhone } from '@/lib/validators';

function preprocessText(raw) {
  let text = raw.toLowerCase().trim();

  // Remove conversational request prefixes
  text = text.replace(/^(i want to|i would like to|i need to|i wanna|i need|can i|can you|could i|could you|do you|would you|please|i'd like to|i'd like|i am looking to|i'm looking to|i am trying to|i'm trying to|i was hoping to|i was wondering)\s+/i, '');

  // Remove polite suffixes
  text = text.replace(/\s+(please|thanks|thank you|thankyou|thx|pls|plz|kindly)$/i, '');

  // Remove question prefixes
  text = text.replace(/^(can you tell me|do you have|is there|what about|how about|tell me about)\s+/i, '');

  return text.trim();
}

export function extractEntities(text) {
  if (!text) return {};

  const cleaned = preprocessText(text);

  const dateResult = validateDate(cleaned);
  const timeResult = validateTime(cleaned);
  const treatmentResult = validateTreatment(cleaned);
  const phoneResult = validatePhone(cleaned);

  const entities = {};

  // Include parsed date even if invalid (past date, beyond horizon) —
  // validation belongs in the handler, not the extractor
  if (dateResult.parsed) {
    entities.date = dateResult.parsed;
  }

  // Include parsed time even if validation failed (e.g., "9pm" parses to "21:00"
  // but is after closing hours). The handler will show the suggestion.
  if (timeResult.parsed) {
    entities.time = timeResult.parsed;
  }

  // validateTreatment only sets parsed when valid, so this is safe
  if (treatmentResult.valid && treatmentResult.parsed) {
    entities.treatment = treatmentResult.parsed;
  }

  if (phoneResult.valid && phoneResult.parsed) {
    entities.phone = phoneResult.parsed;
  }

  return entities;
}

/**
 * Merge newly extracted entities into a session's received entities accumulation.
 * This supports progressive slot filling across fragmented messages.
 */
export function accumulateEntities(sessionContext, newEntities) {
  const acc = { ...sessionContext.receivedEntities };
  if (!acc.dates) acc.dates = [];
  if (!acc.times) acc.times = [];
  if (!acc.treatments) acc.treatments = [];

  if (newEntities.date) {
    const dateStr = newEntities.date instanceof Date
      ? newEntities.date.toISOString()
      : String(newEntities.date);
    if (!acc.dates.find(d => d === dateStr)) {
      acc.dates.push(dateStr);
    }
  }

  if (newEntities.time) {
    if (!acc.times.find(t => t === newEntities.time)) {
      acc.times.push(newEntities.time);
    }
  }

  if (newEntities.treatment) {
    if (!acc.treatments.find(t => t === newEntities.treatment)) {
      acc.treatments.push(newEntities.treatment);
    }
  }

  return {
    receivedEntities: acc,
    pendingFields: computePendingFields(sessionContext, acc),
  };
}

/**
 * Determine which fields are still pending based on accumulated entities
 * and what's already set in the booking context.
 */
export function computePendingFields(context, accumulated) {
  const booking = context.booking || {};
  const pending = [];

  if (!booking.treatment && (!accumulated.treatments || accumulated.treatments.length === 0)) {
    pending.push('treatment');
  }
  if (!booking.date && (!accumulated.dates || accumulated.dates.length === 0)) {
    pending.push('date');
  }
  if (!booking.time && (!accumulated.times || accumulated.times.length === 0)) {
    pending.push('time');
  }
  if (booking.treatment && booking.date && booking.time && !booking.patientName) {
    pending.push('patientName');
  }

  return pending;
}
