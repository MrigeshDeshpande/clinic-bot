import { logger } from '@/lib/logger';

// ───────────────────────────────────────────────
// Correction markers — phrases that signal a user
// is correcting a previously provided value.
// Ordered by specificity (longest first) to avoid
// false matches on short generic terms like "no".
// ───────────────────────────────────────────────
const CORRECTION_MARKERS = [
  // Explicit corrections
  { pattern: /^(actually|correction|scratch that|strike that|ignore that)/i, weight: 1.0 },
  { pattern: /\b(no\s+(not|i mean|i said|make it|change it|set it))\b/i, weight: 1.0 },
  { pattern: /\b(not\s+\w+,\s+\w+)\b/i, weight: 1.0 },
  { pattern: /\b(change\s+(it|that|this)\s+to)\b/i, weight: 1.0 },
  { pattern: /\b(make\s+(it|that)\s+)\b/i, weight: 0.9 },
  { pattern: /\b(i\s+mean)\b/i, weight: 0.9 },
  { pattern: /\b(instead\s+of\s+)\b/i, weight: 0.9 },
  { pattern: /^(no|nope)\s+/i, weight: 0.8 },
  { pattern: /\b(different\s+)\w+/i, weight: 0.8 },
  { pattern: /\b(i\s+said)\b/i, weight: 0.7 },
  { pattern: /^(wait|hold on)/i, weight: 0.7 },
  { pattern: /\b(not\s+that)\b/i, weight: 0.7 },
  { pattern: /\b\w+\s+instead\b/i, weight: 0.7 },

  // Correction via negation of list item ("Not root canal, cleaning")
  { pattern: /\bnot\s+the\s+\w+/i, weight: 0.8 },
];

// ───────────────────────────────────────────────
// Correction phrase extractors — extract field
// context from common correction patterns.
// ───────────────────────────────────────────────
function extractCorrectionTarget(text, entities) {
  const lower = text.toLowerCase();

  // Pattern: "Not X, Y" — treatment correction
  const notXCommaY = lower.match(/\bnot\s+((?:\w+\s*)+?),\s*((?:\w+\s*)+?)$/i);
  if (notXCommaY) {
    return { field: 'treatment', oldValue: notXCommaY[1].trim(), newHint: notXCommaY[2].trim() };
  }

  // Pattern: "Change it to..."
  const changeTo = lower.match(/\b(?:change|make|set|switch|update)\s+(?:it|that|this|the\s+\w+)?\s*to\s+(.+)/i);
  if (changeTo) {
    const target = changeTo[1].trim();
    // Determine field from entity type
    if (entities.date) return { field: 'date', newHint: target };
    if (entities.time) return { field: 'time', newHint: target };
    if (entities.treatment) return { field: 'treatment', newHint: target };
    return { field: 'unknown', newHint: target };
  }

  // Pattern: "No [preposition]..." — correction with time-of-day word (e.g., "No evening" = time correction)
  // Must be checked BEFORE generic "No [entity]" to avoid misclassifying time-of-day words as unknown.
  if (lower.startsWith('no ')) {
    const remainder = lower.slice(3).trim();
    if (/^(morning|afternoon|evening|night|am|pm)/.test(remainder) || entities.time) {
      return { field: 'time' };
    }
    if (entities.date) return { field: 'date' };
    if (entities.treatment) return { field: 'treatment' };
  }

  // Pattern: "Actually [entity]" / "No [entity]" / "[entity] instead"
  const actuallyNo = lower.match(/^(?:actually|no|nope|no,|nope,)\s+(.+)/i);
  if (actuallyNo) {
    const target = actuallyNo[1].trim();
    if (entities.date) return { field: 'date', newValue: entities.date };
    if (entities.time) return { field: 'time', newValue: entities.time };
    if (entities.treatment) return { field: 'treatment', newValue: entities.treatment };
    return { field: 'unknown', newHint: target };
  }

  // Pattern: "[entity] instead"
  const instead = lower.match(/^(.+?)\s+instead\b/i);
  if (instead) {
    const target = instead[1].trim();
    if (entities.date) return { field: 'date', newValue: entities.date };
    if (entities.time) return { field: 'time', newValue: entities.time };
    if (entities.treatment) return { field: 'treatment', newValue: entities.treatment };
    return { field: 'unknown', newHint: target };
  }

  // Pattern: "Different [field]"
  const different = lower.match(/\bdifferent\s+(date|day|time|treatment|one)\b/i);
  if (different) {
    const word = different[1].toLowerCase();
    if (word === 'date' || word === 'day') return { field: 'date' };
    if (word === 'time') return { field: 'time' };
    if (word === 'treatment' || word === 'one') return { field: 'treatment' };
  }

  // No explicit correction pattern matched — this is not a correction.
  // Entity-only inference is handled by detectCorrection() only
  // when a correction marker was already matched.
  return null;
}

// ───────────────────────────────────────────────
// Main: detect correction from user message
// Returns:
//   null — no correction detected
//   { isCorrection: true, field, newValue, confidence, marker, entityLabel }
// ───────────────────────────────────────────────
export function detectCorrection(normalized, session) {
  if (!normalized || !normalized.textClean) return null;

  const text = normalized.textClean;
  const textLower = normalized.textLower;
  const entities = normalized._entities || {};
  const booking = session.context?.booking || {};

  // Check if at least one booking field is already set (otherwise can't correct)
  const hasExistingValue = booking.date || booking.time || booking.treatment;
  if (!hasExistingValue) return null;

  // Step 1: Check for correction markers in text
  let matchedMarker = null;
  let maxWeight = 0;

  for (const marker of CORRECTION_MARKERS) {
    if (marker.pattern.test(text)) {
      if (marker.weight > maxWeight) {
        matchedMarker = marker;
        maxWeight = marker.weight;
      }
    }
  }

  // Step 2: If marker found, extract the correction target
  const target = extractCorrectionTarget(text, entities);

  if (!matchedMarker && !target) return null;

  // Step 3: If we have a marker but no clear field target, try entity inference
  let field = target?.field || null;
  let newValue = target?.newValue || null;

  if (!field && matchedMarker) {
    // Infer field from entity that's present
    if (entities.date) { field = 'date'; newValue = entities.date; }
    else if (entities.time) { field = 'time'; newValue = entities.time; }
    else if (entities.treatment) { field = 'treatment'; newValue = entities.treatment; }
  }

  if (!field) return null;

  // Step 4: Determine what the old value was (for audit/logging)
  const oldValue = booking[field] || null;

  // Prevent correction if no existing value for that field
  if (!oldValue && newValue) {
    // They're providing the first value, not correcting — not a correction
    return null;
  }

  // Step 5: Guard — if in BOOKED state, corrections require explicit edit flow
  if (session.state === 'BOOKED' || session.state === 'BOOKING_CONFIRMATION') {
    return {
      isCorrection: true,
      field,
      newValue,
      oldValue,
      confidence: maxWeight || 0.7,
      marker: matchedMarker?.pattern?.source || 'inferred',
      requiresEditFlow: true,
    };
  }

  logger.debug('CORRECTION_DETECTED', {
    waId: session.waId,
    field,
    oldValue,
    newValue: newValue || target?.newHint || text,
    confidence: maxWeight,
  });

  return {
    isCorrection: true,
    field,
    newValue,
    oldValue,
    confidence: maxWeight || 0.7,
    marker: matchedMarker?.pattern?.source || 'inferred',
    requiresEditFlow: false,
  };
}
