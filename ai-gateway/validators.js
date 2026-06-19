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
