import { CLINIC } from '@/config/clinic';
import { logger } from '@/lib/logger';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const INTENT_CATALOG = [
  'appointment', 'provide_date', 'provide_time', 'provide_treatment',
  'cancel_appointment', 'reschedule', 'my_appointments',
  'location', 'timings', 'services',
  'emergency', 'escalate',
  'main_menu', 'back', 'confirm',
  'correction_date', 'correction_time', 'correction_treatment',
  'unknown',
];

const TREATMENT_LIST = CLINIC.treatments.map(t =>
  `${t.name} (aliases: ${t.aliases.join(', ')}, symptoms: ${t.symptom})`
).join('\n');

const SYSTEM_PROMPT = `You are the AI intent classifier for a dental clinic's WhatsApp receptionist.

Your job is to classify the patient's intent and extract entities from their message.

Available treatments:
${TREATMENT_LIST}

Return ONLY valid JSON with this exact structure:
{
  "intent": "one of: ${INTENT_CATALOG.join(', ')}",
  "confidence": 0.0-1.0,
  "entities": {
    "date": "YYYY-MM-DD or null",
    "time": "HH:MM or null",
    "treatment": "treatment name or null",
    "phone": "phone number or null",
    "name": "patient name or null"
  },
  "isCorrection": false,
  "correctionField": null,
  "reasoning": "brief explanation"
}

Rules:
- Map symptom descriptions to the closest treatment
- "date" must be in YYYY-MM-DD format. Use tomorrow/next week etc relative to today.
- "time" must be in 24h HH:MM format
- If the patient is correcting a previously provided value, set isCorrection=true and correctionField to the field being corrected
- If unsure, return intent "unknown" with low confidence
- NEVER make up treatments not in the available list
- NEVER return medical advice`;

function buildRequest(text, state, booking) {
  const parts = [{ text: SYSTEM_PROMPT }];

  if (state) {
    parts.push({ text: `Current session state: ${state}` });
  }

  const bookingFields = [];
  if (booking?.date) bookingFields.push(`date: ${booking.date}`);
  if (booking?.time) bookingFields.push(`time: ${booking.time}`);
  if (booking?.treatment) bookingFields.push(`treatment: ${booking.treatment}`);

  if (bookingFields.length > 0) {
    parts.push({ text: `Already collected booking info: ${bookingFields.join(', ')}` });
  }

  parts.push({ text: `Patient message: "${text}"` });
  parts.push({ text: 'Return only the JSON response.' });

  return {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
    },
  };
}

function parseResponse(data) {
  if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
    return null;
  }

  let text = data.candidates[0].content.parts[0].text;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      intent: INTENT_CATALOG.includes(parsed.intent) ? parsed.intent : 'unknown',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      entities: {
        date: parsed.entities?.date || null,
        time: parsed.entities?.time || null,
        treatment: parsed.entities?.treatment || null,
        phone: parsed.entities?.phone || null,
        name: parsed.entities?.name || null,
      },
      isCorrection: parsed.isCorrection === true,
      correctionField: parsed.correctionField || null,
      reasoning: parsed.reasoning || '',
      source: 'gemini',
    };
  } catch {
    return null;
  }
}

export async function classify(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('GEMINI_API_KEY_MISSING');
    throw new Error('GEMINI_API_KEY not configured');
  }

  const url = `${GEMINI_API}?key=${apiKey}`;
  const body = buildRequest(request.text, request.state, request.booking);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  logger.info('GEMINI_REQUEST', { model: GEMINI_MODEL, text: request.text, state: request.state });

  if (!res.ok) {
    const err = await res.text();
    logger.error('GEMINI_API_ERROR', { model: GEMINI_MODEL, status: res.status, error: err });
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  const result = parseResponse(data);

  if (!result) {
    logger.warn('GEMINI_PARSE_FAILED', { model: GEMINI_MODEL, text: request.text });
    throw new Error('Failed to parse Gemini response');
  }

  logger.info('GEMINI_RESPONSE', {
    model: GEMINI_MODEL,
    intent: result.intent,
    confidence: result.confidence,
  });

  return result;
}
