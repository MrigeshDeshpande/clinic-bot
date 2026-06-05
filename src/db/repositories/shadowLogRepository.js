import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function insertShadowLog({
  waId,
  sessionState,
  messageText,
  ruleIntent,
  aiIntent,
  aiConfidence,
  matched,
  provider = 'gemini',
  processingTimeMs = 0,
  ruleUsed = false,
}) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      INSERT INTO shadow_logs (
        wa_id, session_state, message_text,
        rule_intent, ai_intent, ai_confidence,
        matched, provider, processing_time_ms, rule_used
      ) VALUES (
        ${waId}, ${sessionState}, ${messageText},
        ${ruleIntent}, ${aiIntent}, ${aiConfidence},
        ${matched}, ${provider || 'gemini'}, ${processingTimeMs}, ${ruleUsed}
      )
      RETURNING id
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('SHADOW_LOG_INSERT_ERROR', { waId, ruleIntent, aiIntent, error: error.message });
    return null;
  }
}

export async function getStats(startDate, endDate) {
  const sql = getSql();
  if (!sql) return null;

  try {
    let query = sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE matched = TRUE)::int AS matches,
        COUNT(*) FILTER (WHERE matched = FALSE)::int AS disagreements,
        ROUND((COUNT(*) FILTER (WHERE matched = TRUE)::numeric / NULLIF(COUNT(*), 0) * 100), 1) AS agreement_rate
      FROM shadow_logs
    `;

    if (startDate && endDate) {
      query = sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE matched = TRUE)::int AS matches,
          COUNT(*) FILTER (WHERE matched = FALSE)::int AS disagreements,
          ROUND((COUNT(*) FILTER (WHERE matched = TRUE)::numeric / NULLIF(COUNT(*), 0) * 100), 1) AS agreement_rate
        FROM shadow_logs
        WHERE created_at >= ${startDate} AND created_at <= ${endDate}
      `;
    }

    const rows = await query;
    return rows[0] || { total: 0, matches: 0, disagreements: 0, agreement_rate: 0 };
  } catch (error) {
    logger.error('SHADOW_LOG_STATS_ERROR', { error: error.message });
    return null;
  }
}

export async function getDisagreements({ limit = 100, risk = null } = {}) {
  const sql = getSql();
  if (!sql) return [];

  try {
    let query;
    if (risk === 'high') {
      query = sql`
        SELECT id, created_at, wa_id, session_state, message_text, rule_intent, ai_intent, ai_confidence
        FROM shadow_logs
        WHERE matched = FALSE
          AND (
            (rule_intent IN ('confirm','cancel','emergency'))
            OR (ai_intent IN ('confirm','cancel','emergency'))
          )
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      query = sql`
        SELECT id, created_at, wa_id, session_state, message_text, rule_intent, ai_intent, ai_confidence
        FROM shadow_logs
        WHERE matched = FALSE
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }

    return await query;
  } catch (error) {
    logger.error('SHADOW_LOG_DISAGREEMENTS_ERROR', { error: error.message });
    return [];
  }
}

export async function getIntentBreakdown(startDate, endDate) {
  const sql = getSql();
  if (!sql) return [];

  try {
    let query;
    if (startDate && endDate) {
      query = sql`
        SELECT
          rule_intent,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE matched = TRUE)::int AS matches,
          COUNT(*) FILTER (WHERE matched = FALSE)::int AS disagreements,
          ROUND((COUNT(*) FILTER (WHERE matched = TRUE)::numeric / NULLIF(COUNT(*), 0) * 100), 1) AS accuracy
        FROM shadow_logs
        WHERE created_at >= ${startDate} AND created_at <= ${endDate}
        GROUP BY rule_intent
        ORDER BY total DESC
      `;
    } else {
      query = sql`
        SELECT
          rule_intent,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE matched = TRUE)::int AS matches,
          COUNT(*) FILTER (WHERE matched = FALSE)::int AS disagreements,
          ROUND((COUNT(*) FILTER (WHERE matched = TRUE)::numeric / NULLIF(COUNT(*), 0) * 100), 1) AS accuracy
        FROM shadow_logs
        GROUP BY rule_intent
        ORDER BY total DESC
      `;
    }

    return await query;
  } catch (error) {
    logger.error('SHADOW_LOG_INTENT_BREAKDOWN_ERROR', { error: error.message });
    return [];
  }
}

export async function getDisagreementPatterns({ minCount = 2, limit = 10 } = {}) {
  const sql = getSql();
  if (!sql) return [];

  try {
    return await sql`
      SELECT
        rule_intent,
        ai_intent,
        COUNT(*)::int AS count,
        MAX(ai_confidence)::real AS max_confidence
      FROM shadow_logs
      WHERE matched = FALSE
      GROUP BY rule_intent, ai_intent
      HAVING COUNT(*) >= ${minCount}
      ORDER BY count DESC
      LIMIT ${limit}
    `;
  } catch (error) {
    logger.error('SHADOW_LOG_PATTERNS_ERROR', { error: error.message });
    return [];
  }
}
