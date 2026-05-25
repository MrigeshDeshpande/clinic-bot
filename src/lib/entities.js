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

  if (timeResult.valid && timeResult.parsed) {
    entities.time = timeResult.parsed;
  }

  if (treatmentResult.valid && treatmentResult.parsed) {
    entities.treatment = treatmentResult.parsed;
  }

  if (phoneResult.valid && phoneResult.parsed) {
    entities.phone = phoneResult.parsed;
  }

  return entities;
}
