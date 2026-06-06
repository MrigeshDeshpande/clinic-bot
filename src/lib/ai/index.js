import { classifyIntent } from '@/lib/router';
import { classify as geminiClassify } from '@/lib/ai/gemini';
import { classify as mockClassify } from '@/lib/ai/mock';
import { logger } from '@/lib/logger';
import { insertShadowLog } from '@/db/repositories/shadowLogRepository';
import {
  AI_TIMEOUT_MS,
  AI_CONFIDENCE_THRESHOLD_HIGH,
  AI_CONFIDENCE_THRESHOLD_MED,
  AI_CONFIDENCE_THRESHOLD_LOW,
  VALID_INTENTS,
  HIGH_RISK_INTENTS,
  MEDIUM_RISK_INTENTS,
} from '@/lib/ai/provider';

const USE_AI = process.env.GEMINI_API_KEY && process.env.NODE_ENV !== 'test';
const REPLAY_MODE = process.env.REPLAY_MODE === 'true';
const SHADOW_MODE = process.env.SHADOW_MODE === 'true';

// Sample 5% of messages in shadow mode to stay within free tier quota (20 RPD)
// Override via SHADOW_SAMPLE_RATE env var for batch data collection
const SHADOW_SAMPLE_RATE = parseFloat(process.env.SHADOW_SAMPLE_RATE) || 0.05;

let classifier;

if (REPLAY_MODE) {
  classifier = mockClassify;
} else if (USE_AI) {
  classifier = geminiClassify;
}

function getRiskLevel(intent) {
  if (HIGH_RISK_INTENTS.includes(intent)) return 'high';
  if (MEDIUM_RISK_INTENTS.includes(intent)) return 'medium';
  return 'low';
}

function getThreshold(riskLevel) {
  switch (riskLevel) {
    case 'high': return AI_CONFIDENCE_THRESHOLD_HIGH;
    case 'medium': return AI_CONFIDENCE_THRESHOLD_MED;
    default: return AI_CONFIDENCE_THRESHOLD_LOW;
  }
}

export async function classifyWithFallback(normalized, session) {
  const startTime = Date.now();

  // Priority 0: Interactive button/list replies — deterministic, always wins
  if (normalized.interactiveId) {
    const ruleResult = classifyIntent(normalized, session);
    if (ruleResult.confidence === 1.0) {
      logger.info('INTENT_CLASSIFICATION', {
        provider: 'rule_interactive',
        intent: ruleResult.intent,
        confidence: 1.0,
        fallback: false,
        processingMs: Date.now() - startTime,
        state: session.state,
        text: normalized.textClean,
      });
      return ruleResult;
    }
  }

  // Priority 1: AI classification (if configured)
  // In shadow mode, sample a fraction of messages to conserve quota
  const shouldSampleAI = !SHADOW_MODE || Math.random() < SHADOW_SAMPLE_RATE;
  if (classifier && shouldSampleAI) {
    try {
      const aiResult = await Promise.race([
        classifier({
          text: normalized.textClean,
          state: session.state,
          booking: session.context?.booking || {},
          waId: normalized.waId,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_TIMEOUT_MS)
        ),
      ]);

      const validIntent = VALID_INTENTS.includes(aiResult.intent);
      const riskLevel = getRiskLevel(aiResult.intent);
      const threshold = getThreshold(riskLevel);
      const aboveThreshold = aiResult.confidence >= threshold;

      // Always get the rule result for comparison
      const ruleResult = classifyIntent(normalized, session);

      if (SHADOW_MODE) {
        logger.info('INTENT_CLASSIFICATION_SHADOW', {
          provider: 'shadow',
          ai_intent: aiResult.intent,
          ai_confidence: aiResult.confidence,
          ai_valid: validIntent,
          ai_entities: aiResult.entities,
          rule_intent: ruleResult.intent,
          rule_confidence: ruleResult.confidence,
          riskLevel,
          threshold,
          accepted: false,
          processingMs: Date.now() - startTime,
          state: session.state,
          text: normalized.textClean,
        });

        insertShadowLog({
          waId: normalized.waId,
          sessionState: session.state,
          messageText: normalized.textClean,
          ruleIntent: ruleResult.intent,
          aiIntent: aiResult.intent,
          aiConfidence: aiResult.confidence,
          matched: ruleResult.intent === aiResult.intent,
          provider: aiResult.source || 'gemini',
          processingTimeMs: Date.now() - startTime,
          ruleUsed: true,
        }).catch(err => logger.warn('SHADOW_LOG_INSERT_FAILED', { error: err.message }));

        ruleResult.source = 'rule_fallback';
        return ruleResult;
      }

      if (validIntent && aboveThreshold) {
        logger.info('INTENT_CLASSIFICATION', {
          provider: aiResult.source,
          intent: aiResult.intent,
          confidence: aiResult.confidence,
          fallback: false,
          riskLevel,
          threshold,
          processingMs: Date.now() - startTime,
          state: session.state,
          text: normalized.textClean,
        });
        return aiResult;
      }

      const rejectReason = !validIntent
        ? 'invalid_intent'
        : 'below_threshold';

      logger.warn('INTENT_CLASSIFICATION_REJECTED', {
        provider: aiResult.source,
        intent: aiResult.intent,
        confidence: aiResult.confidence,
        reason: rejectReason,
        riskLevel,
        threshold,
        rule_intent: ruleResult.intent,
        processingMs: Date.now() - startTime,
        state: session.state,
        text: normalized.textClean,
      });
    } catch (error) {
      logger.warn('INTENT_CLASSIFICATION_FAILED', {
        provider: 'ai',
        error: error.message,
        fallback: true,
        processingMs: Date.now() - startTime,
        state: session.state,
        text: normalized.textClean,
      });
    }
  }

  // Priority 2: Rule-based fallback
  const ruleResult = classifyIntent(normalized, session);
  ruleResult.source = 'rule_fallback';

  logger.info('INTENT_CLASSIFICATION', {
    provider: 'rule_fallback',
    intent: ruleResult.intent,
    confidence: ruleResult.confidence,
    fallback: true,
    processingMs: Date.now() - startTime,
    state: session.state,
    text: normalized.textClean,
  });

  return ruleResult;
}
