import { logger } from '@/lib/logger';

// ───────────────────────────────────────────────
// Overwrite Policy Engine
//
// Defines explicit rules for when and how booking
// fields can be mutated during conversation.
//
// Design principles:
//   - Latest valid entity wins (within allowed states)
//   - Correction phrases override previous values
//   - Confirmed bookings require explicit edit flow
//   - Completed appointments cannot silently mutate
// ───────────────────────────────────────────────

// State groups for policy application
const BOOKING_COLLECTION_STATES = ['BOOKING_DATE', 'BOOKING_TIME', 'BOOKING_TREATMENT'];
const BOOKING_REVIEW_STATES = ['BOOKING_CONFIRMATION'];
const BOOKED_STATES = ['BOOKED'];

/**
 * Check whether a field can be overwritten given the current state context.
 *
 * @param {Object} params
 * @param {string} params.state        - Current session state
 * @param {string} params.field        - Field to overwrite ('date', 'time', 'treatment')
 * @param {boolean} params.isCorrection - Whether this is an explicit correction
 * @param {Object} params.booking      - Current booking context
 * @returns {{ allowed: boolean, action: string, reason: string }}
 *
 * action values:
 *   'overwrite'     — Safe to overwrite in-place
 *   'redirect'      — Redirect to appropriate booking state for this field
 *   'require_edit'  — Must go through explicit edit flow
 *   'block'         — Cannot be mutated
 */
export function evaluateOverwrite({ state, field, isCorrection, booking }) {
  // ── Guard: Completed/cancelled appointments ──
  // (Caller must check appointment status before calling this)

  // ── Rule 1: Booking collection states ──
  // In BOOKING_DATE/TIME/TREATMENT: latest valid entity always wins.
  // This supports both corrections and rapid-fire fragmented messages.
  if (BOOKING_COLLECTION_STATES.includes(state)) {
    return {
      allowed: true,
      action: 'overwrite',
      reason: 'In-progress booking: latest valid entity wins.',
    };
  }

  // ── Rule 2: Booking review/confirmation state ──
  // Can overwrite only if user is making an explicit correction or
  // if the field hasn't been confirmed yet.
  if (BOOKING_REVIEW_STATES.includes(state)) {
    if (isCorrection) {
      return {
        allowed: true,
        action: 'overwrite',
        reason: 'Explicit correction during review: field updated.',
      };
    }
    return {
      allowed: false,
      action: 'require_edit',
      reason: 'Field confirmed. Use explicit edit (Change Date/Time) to modify.',
    };
  }

  // ── Rule 3: BOOKED state ──
  // Silent mutation not allowed. Must use edit flow.
  if (BOOKED_STATES.includes(state)) {
    if (isCorrection) {
      return {
        allowed: false,
        action: 'require_edit',
        reason: 'Appointment already booked. Use reschedule or edit flow to modify.',
      };
    }
    return {
      allowed: false,
      action: 'require_edit',
      reason: 'Appointment already confirmed. Cannot silently mutate.',
    };
  }

  // ── Rule 4: Default (conservative) ──
  // For any other state, allow overwrite only if isCorrection
  if (isCorrection) {
    return {
      allowed: true,
      action: 'overwrite',
      reason: 'Explicit correction in non-booking state.',
    };
  }

  return {
    allowed: false,
    action: 'block',
    reason: `Cannot overwrite booking field in current state (${state}).`,
  };
}

/**
 * Determine the correct target state for a field overwrite.
 *
 * @param {string} field - 'date', 'time', or 'treatment'
 * @returns {string} Target state name
 */
export function getTargetState(field) {
  switch (field) {
    case 'date': return 'BOOKING_DATE';
    case 'time': return 'BOOKING_TIME';
    case 'treatment': return 'BOOKING_TREATMENT';
    default: return 'MAIN_MENU';
  }
}

/**
 * Apply an overwrite to booking context with audit tracking.
 *
 * @param {Object} booking - Current booking context
 * @param {Object} bookingTimestamps - Current timestamps object
 * @param {string} field - Field to set
 * @param {*} value - New value
 * @returns {{ booking: Object, bookingTimestamps: Object, changed: boolean }}
 */
export function applyFieldOverwrite(booking, bookingTimestamps, field, value) {
  const now = new Date().toISOString();
  const changed = booking[field] !== value;

  if (changed) {
    logger.debug('FIELD_OVERWRITTEN', {
      field,
      from: booking[field],
      to: value,
      timestamp: now,
    });
  }

  return {
    booking: { ...booking, [field]: value },
    bookingTimestamps: { ...bookingTimestamps, [field]: now },
    changed,
  };
}
