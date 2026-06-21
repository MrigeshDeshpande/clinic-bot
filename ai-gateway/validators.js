export function validateResponse(raw, availableIntents) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Response must be a JSON object');
  }

  if (typeof raw.intent !== 'string' || raw.intent.length === 0) {
    throw new Error('Missing or invalid "intent" field');
  }

  if (!availableIntents.includes(raw.intent) && raw.intent !== 'unknown') {
    throw new Error(
      `Intent "${raw.intent}" not in allowed list [${availableIntents.join(', ')}]`
    );
  }

  if (raw.entities && (typeof raw.entities !== 'object' || Array.isArray(raw.entities))) {
    throw new Error('"entities" must be a JSON object');
  }

  if (raw.language && !['hindi', 'hinglish', 'english', 'unknown'].includes(raw.language)) {
    throw new Error(`Invalid language "${raw.language}"`);
  }

  return {
    intent: raw.intent,
    entities: raw.entities && typeof raw.entities === 'object' ? raw.entities : {},
    language: raw.language || 'unknown',
  };
}

const REQUIRED_EXTRACTION_FIELDS = [
  'patient',
  'observations',
  'diagnoses',
  'treatment_recommendations',
  'completed_treatments',
  'medications',
  'financial_estimates',
  'followups',
  'unclassified_notes',
];

const ARRAY_FIELDS = new Set([
  'observations',
  'diagnoses',
  'treatment_recommendations',
  'completed_treatments',
  'medications',
  'financial_estimates',
  'followups',
  'unclassified_notes',
]);

export function validateExtractionResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Extraction response must be a JSON object');
  }

  for (const field of REQUIRED_EXTRACTION_FIELDS) {
    if (!(field in raw)) {
      throw new Error(`Missing required field "${field}" in extraction response`);
    }

    if (ARRAY_FIELDS.has(field)) {
      if (!Array.isArray(raw[field])) {
        throw new Error(`Field "${field}" must be an array, got ${typeof raw[field]}`);
      }
    } else if (field === 'patient') {
      if (typeof raw[field] !== 'object' || raw[field] === null || Array.isArray(raw[field])) {
        throw new Error(`Field "patient" must be an object`);
      }
    }
  }

  return raw;
}
