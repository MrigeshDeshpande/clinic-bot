import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function insertAiClassification({
  sessionState,
  message,
  availableIntents,
  intent,
  entities,
  language,
  provider,
  processingMs,
  rawModelResponse,
  ruleIntent,
  matched,
}) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      INSERT INTO ai_classifications (
        session_state, message, available_intents,
        intent, entities, language,
        provider, processing_ms, raw_model_response,
        rule_intent, matched
      ) VALUES (
        ${sessionState}, ${message}, ${availableIntents},
        ${intent}, ${entities}, ${language},
        ${provider || 'kali'}, ${processingMs || 0}, ${rawModelResponse},
        ${ruleIntent}, ${matched}
      )
      RETURNING id
    `;
    return rows[0] || null;
  } catch (error) {
    logger.warn('AI_CLASSIFICATION_INSERT_ERROR', {
      sessionState,
      intent,
      ruleIntent,
      error: error.message,
    });
    return null;
  }
}
