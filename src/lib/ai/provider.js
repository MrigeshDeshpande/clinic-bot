/**
 * @typedef {Object} AIRequest
 * @property {string} text - Cleaned user message text
 * @property {string} state - Current session state
 * @property {Object} booking - Current booking context { date, time, treatment, patientName, patientPhone }
 * @property {string} waId - WhatsApp ID of the user
 */

/**
 * @typedef {Object} AIResponse
 * @property {string} intent - Classified intent (must match existing intent names)
 * @property {number} confidence - 0.0 to 1.0
 * @property {Object} entities - Extracted entities { date?, time?, treatment?, phone?, name? }
 * @property {boolean} isCorrection - Whether this is a correction of a previous input
 * @property {string|null} correctionField - If isCorrection: 'date', 'time', 'treatment', or null
 * @property {string} reasoning - Brief explanation for debugging and audit
 * @property {string} source - 'gemini', 'openai', 'claude', 'mock', 'rule_fallback'
 */

/**
 * @typedef {Function} AIProvider
 * @param {AIRequest} request
 * @returns {Promise<AIResponse>}
 */

export const AI_TIMEOUT_MS = 3000;

export const AI_CONFIDENCE_THRESHOLD_HIGH = 0.90;
export const AI_CONFIDENCE_THRESHOLD_MED = 0.75;
export const AI_CONFIDENCE_THRESHOLD_LOW = 0.50;

export const VALID_INTENTS = [
  'appointment',
  'provide_date',
  'provide_time',
  'provide_treatment',
  'cancel_appointment',
  'reschedule',
  'my_appointments',
  'location',
  'timings',
  'services',
  'emergency',
  'escalate',
  'main_menu',
  'back',
  'confirm',
  'confirm_cancel',
  'correction_date',
  'correction_time',
  'correction_treatment',
  'greeting',
  'thanks',
  'help',
  'affirm',
  'arrival',
  'callback',
  'language_en',
  'language_hi',
  'cancel',
  'edit_date',
  'edit_time',
  'edit_treatment',
  'unknown',
];

export const HIGH_RISK_INTENTS = ['confirm', 'confirm_cancel', 'emergency'];

export const MEDIUM_RISK_INTENTS = [
  'provide_date',
  'provide_time',
  'cancel_appointment',
  'reschedule',
  'edit_date',
  'edit_time',
  'edit_treatment',
  'correction_date',
  'correction_time',
  'correction_treatment',
];
