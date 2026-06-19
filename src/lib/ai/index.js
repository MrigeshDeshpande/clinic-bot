import { logger } from '@/lib/logger';
import { classifyIntent } from '@/lib/router';
import { understand as gatewayUnderstand } from '@/lib/ai/gateway';

export async function classifyWithFallback(normalized, session) {
  const startTime = Date.now();

  // Interactive ID — deterministic, bypass AI
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

  // Use the gateway (handles shadow mode, AI call, and rule fallback internally)
  return gatewayUnderstand({ normalized, session });
}
