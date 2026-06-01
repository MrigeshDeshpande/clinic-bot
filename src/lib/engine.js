import { isDuplicate } from '@/lib/deduplicate';
import { getOrCreate, save } from '@/lib/session';
import { classifyIntent } from '@/lib/router';
import { extractEntities, accumulateEntities } from '@/lib/entities';
import { handle } from '@/lib/handlers';
import { getNextState } from '@/lib/transitions';
import { detectCorrection } from '@/lib/correction-detector';
import { evaluateOverwrite } from '@/lib/overwrite-policy';
import { sendText, sendButtons, sendList, markAsRead } from '@/lib/whatsapp';
import { createMessage, createMessages } from '@/db/repositories/messageRepository';
import { notifyNewMessage } from '@/lib/messageEvents';
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
  let mediaId = '';
  let mimeType = '';

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
    case 'image':
      mediaId = msg.image?.id || '';
      mimeType = msg.image?.mime_type || 'image/jpeg';
      text = msg.image?.caption ? (msg.image.caption).normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
      break;
    case 'audio':
      mediaId = msg.audio?.id || '';
      mimeType = msg.audio?.mime_type || 'audio/ogg';
      text = '';
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
    hasMedia: ['image', 'audio', 'video', 'document'].includes(type),
    interactiveId,
    mediaId,
    mimeType,
  };
}

// ───────────────────────────────────────────────
// Step 2g: Send reply based on replyType
// ───────────────────────────────────────────────
async function sendReply(waId, reply, replyType) {
  switch (replyType) {
    case 'list': {
      const sent = await sendList(waId, reply.body, reply.buttonLabel, reply.sections);
      if (sent) return sent;
      logger.warn('SEND_LIST_FAILED_FALLING_BACK', { waId });
      const textBody = reply.body + '\n\n' + reply.sections.map(s =>
        s.rows.map((r, i) => `${i + 1}. ${r.title}${r.description ? ` (${r.description})` : ''}`).join('\n')
      ).join('\n');
      return sendText(waId, textBody);
    }
    case 'buttons': {
      const sent = await sendButtons(waId, reply.body, reply.buttons);
      if (sent) return sent;
      logger.warn('SEND_BUTTONS_FAILED_FALLING_BACK', { waId });
      const btnLabels = reply.buttons.map(b => typeof b === 'string' ? b : b.title);
      return sendText(waId, reply.body + '\n\n' + btnLabels.map((b, i) => `${i + 1}. ${b}`).join('\n'));
    }
    case 'text':
    default:
      return sendText(waId, reply);
  }
}

// ───────────────────────────────────────────────
// Rapid message safety — check for stale response conditions
// ───────────────────────────────────────────────
function checkRapidFireSafety(normalized, session) {
  const seq = session.context.messageSequence || 0;

  // If session has no recent replies yet this is safe
  if (session.context.lastMessageIds.length === 0) {
    return { safe: true };
  }

  // Check if this message references the last bot reply (via interactive ID)
  const hasReplyToLastBot = normalized.interactiveId &&
    session.context.lastMessageIds.includes(normalized.interactiveId);

  // Check for rapid-fire: many quick messages without bot responses
  const rapidFireRisk = seq > 2 && session.context.lastMessageIds.length >= 2;

  return {
    safe: true, // Always process; rapid-fire is handled by session state integrity
    hasReplyToLastBot,
    rapidFireRisk,
    sequence: seq,
  };
}

// ───────────────────────────────────────────────
// Main pipeline
// ───────────────────────────────────────────────
export async function processEvent(payload) {
  // payload is already a parsed object — never JSON.parse inside here

  // Step 1: classifyEvent
  const event = classifyEvent(payload);
  if (event === PIPELINE_HALT) return null;

  const isReplay = process.env.REPLAY_MODE === 'true';
  const steps = isReplay ? [] : null;

  // Process each message in order
  for (const msg of event.messages) {
    try {
      // Step 2a: deduplicate
      if (isDuplicate(msg.id)) {
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

      // Step 2d-i: Manual mode — doctor is chatting with patient, skip bot pipeline
      if (session.context.manualMode) {
        logger.info('MANUAL_MODE_ACTIVE', { waId: normalized.waId, text: normalized.textClean });
        // Save the patient's reply to DB
        createMessage({
          msgId: normalized.msgId,
          sessionId: session.id,
          waId: normalized.waId,
          role: 'user',
          content: normalized.textClean || normalized.text,
          intent: 'manual_chat',
          metadata: {},
        }).catch(err => logger.error('MANUAL_CHAT_SAVE_FAILED', { msgId: normalized.msgId, error: err.message }));
        notifyNewMessage(normalized.waId);
        // Send acknowledgment to patient
        sendText(normalized.waId, 'Your message has been forwarded to the clinic. Dr. will respond shortly.')
          .catch(() => {});
        continue;
      }

      // Step 2d-ii: Rapid fire safety check
      const safety = checkRapidFireSafety(normalized, session);
      if (safety.rapidFireRisk) {
        logger.debug('RAPID_FIRE_RISK', {
          waId: normalized.waId,
          sequence: safety.sequence,
          msgId: normalized.msgId,
        });
      }

      // Track last message IDs for continuity
      session.context.lastMessageIds = [...(session.context.lastMessageIds || []).slice(-4), normalized.msgId];

      // Step 2e: classifyIntent (also checks for corrections internally)
      const intentResult = classifyIntent(normalized, session);

      // Step 2e-ii: Explicit correction detection (for non-booking states where router may miss it)
      // Only needed if classifyIntent didn't already catch it as correction_* intent
      if (!intentResult.intent.startsWith('correction_') && intentResult.intent === 'unknown') {
        const bookingStates = ['BOOKING_COLLECTION', 'BOOKING_CONFIRMATION', 'BOOKED'];
        if (bookingStates.includes(session.state)) {
          const entitiesForCorrection = extractEntities(normalized.textClean);
          const correction = detectCorrection({ ...normalized, _entities: entitiesForCorrection }, session);
          if (correction && correction.isCorrection) {
            logger.info('CORRECTION_DETECTED_IN_PIPELINE', {
              waId: normalized.waId,
              field: correction.field,
              from: correction.oldValue,
              to: correction.newValue,
              state: session.state,
            });
            // Override intent with correction intent
            intentResult.intent = `correction_${correction.field}`;
            intentResult.source = 'correction_pipeline';
            intentResult.entities = entitiesForCorrection;
          }
        }
      }

      // Step 2f: extractEntities
      const entities = intentResult.entities || extractEntities(normalized.textClean);

      // Step 2f-ii: Accumulate entities into session context for progressive filling
      if (entities && Object.keys(entities).length > 0) {
        const { receivedEntities } = accumulateEntities(session.context, entities);
        session.context.receivedEntities = receivedEntities;
      }

      // Step 2g(i): Save user message IMMEDIATELY (before handle/sendReply)
      // so it's never lost even if processing throws.
      createMessage({
        msgId: normalized.msgId,
        sessionId: session.id,
        waId: normalized.waId,
        role: 'user',
        content: normalized.textClean || normalized.text,
        intent: intentResult.intent,
        metadata: { stateBefore: session.state },
      }).catch(err => logger.error('USER_MSG_SAVE_FAILED', { msgId: normalized.msgId, error: err.message }));

      // Determine next state
      const nextState = getNextState(session.state, intentResult.intent, entities);

      // Step 2h: handle
      const handlerResult = await handle(session.state, {
        session,
        normalized,
        entities,
        intent: intentResult.intent,
      });

      // Apply state transition if handler didn't already change it.
      // Correction intents are excluded — the handler already manages state
      // transitions correctly via handleBookingDate/Time/Treatment, and applying
      // the transition table's nextState would override the handler's decision.
      if (nextState && handlerResult.session.state === session.state && !intentResult.intent.startsWith('correction_')) {
        handlerResult.session.state = nextState;
      }

      // Step 2i: sendReply
      const sentMsgId = await sendReply(normalized.waId, handlerResult.reply, handlerResult.replyType);

      // Track sent message IDs for future continuity checks
      if (sentMsgId && handlerResult.session.context) {
        handlerResult.session.context.lastMessageIds = [
          ...(handlerResult.session.context.lastMessageIds || []).slice(-4),
          sentMsgId,
        ];
      }

      // Step 2j: saveSession — cache is updated synchronously inside save();
      // DB write is fire-and-forget. Subsequent reads hit the in-memory cache
      // (getOrCreate checks sessionCache first), so eventual consistency is fine.
      save(handlerResult.session).catch(() => {});

      // Step 2k: Save bot message after reply sent successfully
      const botMsgId = sentMsgId || `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      createMessage({
        msgId: botMsgId,
        sessionId: handlerResult.session.id,
        waId: normalized.waId,
        role: 'bot',
        content: typeof handlerResult.reply === 'string' ? handlerResult.reply : handlerResult.reply.body,
        intent: intentResult.intent,
        metadata: { replyType: handlerResult.replyType, stateAfter: handlerResult.session.state },
      }).catch(err => logger.error('BOT_MSG_SAVE_FAILED', { msgId: botMsgId, error: err.message }));
      notifyNewMessage(normalized.waId);

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

      // Record step in replay mode
      if (isReplay && steps) {
        steps.push({
          text: normalized.textClean || normalized.text,
          intent: intentResult.intent,
          intentSource: intentResult.source,
          state: handlerResult.session.state,
          previousState: session.state,
          nextState,
          entities: entities ? { ...entities } : {},
        });
      }
    } catch (error) {
      logger.error('MESSAGE_PROCESSING_ERROR', {
        msgId: msg.id,
        error: error.message,
        stack: error.stack,
      });

      if (isReplay && steps) {
        steps.push({
          text: msg.text?.body || '',
          error: error.message,
        });
      }
    }
  }

  if (isReplay && steps) {
    return { success: true, steps };
  }

  return { success: true };
}
