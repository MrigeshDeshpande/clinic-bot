import { classifyIntent } from '@/lib/router';
import { logger } from '@/lib/logger';
import { understand as kaliUnderstand } from '@/lib/ai/kali';
import { GLOBAL_INTENTS, CORRECTION_INTENTS } from '@/config/intents';
import { TRANSITIONS } from '@/config/states';

const USE_KALI = process.env.KALI_AI_URL && process.env.NODE_ENV !== 'test';

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
  if (USE_KALI) {
    try {
      const aiResult = await kaliUnderstand({
        message: normalized.textClean,
        type: normalized.type,
        role: session.context?.role || 'patient',
        currentState: session.state,
        availableIntents: getAvailableIntents(session.state),
      });

      // Use AI result
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
