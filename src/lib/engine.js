import { isDuplicate } from '@/lib/deduplicate';
import { getOrCreate, save } from '@/lib/session';
import { classifyIntent } from '@/lib/router';
import { extractEntities } from '@/lib/entities';
import { handle } from '@/lib/handlers';
import { getNextState } from '@/lib/transitions';
import { sendText, sendButtons, sendList, markAsRead } from '@/lib/whatsapp';
import { createMessage } from '@/db/repositories/messageRepository';
import { logger } from '@/lib/logger';

export const PIPELINE_HALT = Symbol('PIPELINE_HALT');

// ───────────────────────────────────────────────
// Step 1: Classify the event from the webhook payload
// ───────────────────────────────────────────────
function classifyEvent(payload) {
  if (!payload || payload.object !== 'whatsapp_business_account') {
    logger.info('WEBHOOK_SKIPPED', { reason: payload ? 'Not a WhatsApp business account event' : 'Empty payload' });
    return PIPELINE_HALT;
  }

  for (const entry of (payload.entry || [])) {
    for (const change of (entry.changes || [])) {
      const value = change.value;
      if (!value) continue;

      // Status updates — skip
      if (value.statuses) return PIPELINE_HALT;

      // Messages
      if (value.messages && value.messages.length > 0) {
        // Filter out messages from the clinic itself
        const filtered = value.messages.filter(m => m.from !== process.env.WHATSAPP_PHONE_NUMBER_ID);
        if (filtered.length === 0) return PIPELINE_HALT;

        return {
          messages: filtered.sort((a, b) => (parseInt(a.timestamp, 10) || 0) - (parseInt(b.timestamp, 10) || 0)),
          contacts: value.contacts || [],
          metadata: value.metadata || {},
        };
      }

      // Errors
      if (value.errors) {
        logger.warn('WEBHOOK_ERRORS', { errors: value.errors });
        return PIPELINE_HALT;
      }
    }
  }

  return PIPELINE_HALT;
}

// ───────────────────────────────────────────────
// Step 2b: Normalize a single message
// ───────────────────────────────────────────────
function normalizeMessage(msg, context) {
  if (!msg || !msg.id || !msg.from) return null;

  let text = '';
  let type = msg.type || 'unknown';
  let interactiveId = '';

  switch (type) {
    case 'text':
      text = (msg.text?.body || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
      break;
    case 'interactive': {
      const buttonReply = msg.interactive?.button_reply;
      const listReply = msg.interactive?.list_reply;
      text = (
        buttonReply?.title ||
        listReply?.title ||
        ''
      ).normalize('NFKC').replace(/\s+/g, ' ').trim();
      interactiveId = buttonReply?.id || listReply?.id || '';
      break;
    }
    case 'button':
      text = (msg.button?.text || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
      break;
    default:
      text = '';
  }

  const textClean = text.replace(/[\u{1F600}-\u{1F6FF}]/gu, '').trim();

  return {
    msgId: msg.id,
    waId: msg.from,
    profileName: context.contacts?.[0]?.profile?.name || '',
    type,
    text,
    textClean,
    textLower: textClean.toLowerCase(),
    textTrimmed: textClean.trim(),
    timestamp: parseInt(msg.timestamp, 10) * 1000,
    phoneNumberId: context.metadata?.phone_number_id,
    hasMedia: msg.type !== 'text' && msg.type !== 'interactive',
    interactiveId,
  };
}

// ───────────────────────────────────────────────
// Step 2g: Send reply based on replyType
// ───────────────────────────────────────────────
async function sendReply(waId, reply, replyType) {
  switch (replyType) {
    case 'buttons':
      return sendButtons(waId, reply.body, reply.buttons);
    case 'list':
      return sendList(waId, reply.body, reply.buttonLabel, reply.sections);
    case 'text':
    default:
      return sendText(waId, reply);
  }
}

// ───────────────────────────────────────────────
// Main pipeline
// ───────────────────────────────────────────────
export async function processEvent(payload) {
  // payload is already a parsed object — never JSON.parse inside here

  // Step 1: classifyEvent
  const event = classifyEvent(payload);
  if (event === PIPELINE_HALT) return null;

  // Process each message in order
  for (const msg of event.messages) {
    try {
      // Step 2a: deduplicate
      if (await isDuplicate(msg.id)) {
        logger.debug('DUPLICATE_SKIPPED', { msgId: msg.id });
        continue;
      }

      // Step 2b: normalizeMessage
      const normalized = normalizeMessage(msg, event);
      if (!normalized) continue;

      // Step 2c: markAsRead (fire and forget)
      markAsRead(normalized.msgId).catch(() => {});

      // Step 2d: loadSession
      const session = await getOrCreate(normalized.waId, normalized.phoneNumberId, normalized.profileName);

      // Step 2e: classifyIntent
      const intentResult = classifyIntent(normalized, session);

      // Step 2f: extractEntities (router may provide entities for interactive IDs)
      const entities = intentResult.entities || extractEntities(normalized.textClean);

      // Determine next state
      const nextState = getNextState(session.state, intentResult.intent, entities);

      // Step 2g: handle
      const handlerResult = await handle(session.state, {
        session,
        normalized,
        entities,
        intent: intentResult.intent,
      });

      // Apply state transition if handler didn't already change it
      if (nextState && handlerResult.session.state === session.state) {
        handlerResult.session.state = nextState;
      }

      // Step 2h: sendReply
      const sentMsgId = await sendReply(normalized.waId, handlerResult.reply, handlerResult.replyType);

      // Step 2i: saveMessages
      await createMessage({
        msgId: normalized.msgId,
        sessionId: handlerResult.session.id,
        waId: normalized.waId,
        role: 'user',
        content: normalized.textClean || normalized.text,
        intent: intentResult.intent,
        metadata: { stateBefore: session.state, stateAfter: handlerResult.session.state },
      });

      if (sentMsgId) {
        await createMessage({
          msgId: sentMsgId,
          sessionId: handlerResult.session.id,
          waId: normalized.waId,
          role: 'bot',
          content: typeof handlerResult.reply === 'string' ? handlerResult.reply : handlerResult.reply.body,
          intent: intentResult.intent,
          metadata: { replyType: handlerResult.replyType },
        });
      }

      // Step 2j: saveSession
      await save(handlerResult.session);

      // Step 2k: log completion
      logger.info('MESSAGE_PROCESSED', {
        waId: normalized.waId,
        stateBefore: session.state,
        stateAfter: handlerResult.session.state,
        intent: intentResult.intent,
        source: intentResult.source,
        text: normalized.textClean,
        msgType: normalized.type,
      });
    } catch (error) {
      logger.error('MESSAGE_PROCESSING_ERROR', {
        msgId: msg.id,
        error: error.message,
        stack: error.stack,
      });
    }
  }

  return true;
}
