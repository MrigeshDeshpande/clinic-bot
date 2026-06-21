import { classifyIntent } from '@/lib/router';
import { logger } from '@/lib/logger';
import { understand as kaliUnderstand } from '@/lib/ai/kali';
import { insertAiClassification } from '@/db/repositories/aiClassificationRepository';
import { GLOBAL_INTENTS, CORRECTION_INTENTS } from '@/config/intents';
import { TRANSITIONS } from '@/config/states';

const USE_KALI = process.env.KALI_AI_URL && process.env.NODE_ENV !== 'test';
const SHADOW_MODE = process.env.SHADOW_MODE === 'true';
const SHADOW_SAMPLE_RATE = parseFloat(process.env.SHADOW_SAMPLE_RATE) || 0.05;

function getAvailableIntents(state) {
  const stateIntents = TRANSITIONS[state] || [];
  const globalIntents = Object.keys(GLOBAL_INTENTS);
  const bookingStates = ['BOOKING_COLLECTION', 'BOOKING_CONFIRMATION', 'BOOKED'];
  const correctionIntents = bookingStates.includes(state) ? CORRECTION_INTENTS : [];
  return [...new Set([...stateIntents, ...globalIntents, ...correctionIntents, 'unknown'])];
}

export async function understand({ normalized, session }) {
  const startTime = Date.now();

  // Priority 0: Interactive button/list replies — deterministic, always wins
  if (normalized.interactiveId) {
    const ruleResult = classifyIntent(normalized, session);
    if (ruleResult.confidence === 1.0) {
      logger.info('INTENT_CLASSIFICATION', {
        provider: 'rule_interactive',
        intent: ruleResult.intent,
        processingMs: Date.now() - startTime,
        state: session.state,
        text: normalized.textClean,
      });
      return ruleResult;
    }
  }

  // Priority 1: AI via Kali gateway
  const shouldSampleAI = !SHADOW_MODE || Math.random() < SHADOW_SAMPLE_RATE;

  if (USE_KALI && shouldSampleAI) {
    try {
      const aiResult = await kaliUnderstand({
        message: normalized.textClean,
        type: normalized.type,
        role: session.context?.role || 'patient',
        currentState: session.state,
        availableIntents: getAvailableIntents(session.state),
      });

      // Always get rule result for comparison
      const ruleResult = classifyIntent(normalized, session);

      if (SHADOW_MODE) {
        // Shadow mode: log AI result but return rule result
        logger.info('INTENT_CLASSIFICATION_SHADOW', {
          provider: 'kali_shadow',
          ai_intent: aiResult.intent,
          ai_language: aiResult.language,
          rule_intent: ruleResult.intent,
          processingMs: aiResult.processingMs,
          state: session.state,
          text: normalized.textClean,
        });

        insertAiClassification({
          sessionState: session.state,
          message: normalized.textClean,
          availableIntents: getAvailableIntents(session.state),
          intent: aiResult.intent,
          entities: aiResult.entities,
          language: aiResult.language,
          provider: aiResult.provider,
          processingMs: aiResult.processingMs,
          rawModelResponse: null,
          ruleIntent: ruleResult.intent,
          matched: ruleResult.intent === aiResult.intent,
        }).catch(err => logger.warn('AI_CLASSIFICATION_LOG_FAILED', { error: err.message }));

        ruleResult.source = 'rule_fallback';
        return ruleResult;
      }

      // Production: use AI result with rule fallback
      logger.info('INTENT_CLASSIFICATION', {
        provider: aiResult.provider,
        intent: aiResult.intent,
        language: aiResult.language,
        processingMs: aiResult.processingMs,
        state: session.state,
        text: normalized.textClean,
      });

      return {
        intent: aiResult.intent,
        entities: aiResult.entities,
        source: aiResult.provider,
        confidence: 1.0,
      };
    } catch (error) {
      logger.warn('INTENT_CLASSIFICATION_FAILED', {
        provider: 'kali',
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
    processingMs: Date.now() - startTime,
    state: session.state,
    text: normalized.textClean,
  });

  return ruleResult;
}
