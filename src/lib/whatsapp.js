import { logger } from '@/lib/logger';

const API_VERSION = 'v19.0';

// When REPLAY_MODE is active, return mock message IDs without network calls
function isReplayMode() {
  return process.env.REPLAY_MODE === 'true';
}

function mockMsgId() {
  return `replay_mock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function getCredentials() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    logger.warn('WHATSAPP_CREDENTIALS_MISSING');
    return null;
  }
  return { token, phoneNumberId };
}

async function apiPost(to, payload) {
  if (isReplayMode()) {
    return mockMsgId();
  }

  const creds = getCredentials();
  if (!creds) return null;

  const url = `https://graph.facebook.com/${API_VERSION}/${creds.phoneNumberId}/messages`;
  const body = JSON.stringify({ messaging_product: 'whatsapp', to, ...payload });

  const MAX_RETRIES = 2;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.token}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        // Only retry on 5xx (server errors) or 429 (rate limit); never retry 4xx validation errors
        if (response.status >= 500 || response.status === 429) {
          if (attempt < MAX_RETRIES) {
            const delay = attempt * 500;
            logger.warn('WHATSAPP_RETRY', { attempt, maxRetries: MAX_RETRIES, status: response.status, delay });
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        logger.error('WHATSAPP_SEND_FAILED', { status: response.status, error: errorBody });
        return null;
      }

      const data = await response.json();
      return data.messages?.[0]?.id || null;
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 500;
        logger.warn('WHATSAPP_NETWORK_RETRY', { attempt, maxRetries: MAX_RETRIES, delay });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      logger.error('WHATSAPP_NETWORK_ERROR', { to, error: error.message });
      return null;
    }
  }

  return null;
}

export async function sendText(to, text) {
  return apiPost(to, { type: 'text', text: { preview_url: false, body: text } });
}

export async function sendButtons(to, bodyText, buttons) {
  // WhatsApp allows max 3 buttons, each title max 20 chars
  const btns = buttons.slice(0, 3).map((label, i) => ({
    type: 'reply',
    reply: { id: `btn_${i}`, title: label.length > 20 ? label.slice(0, 20) : label },
  }));

  return apiPost(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons: btns },
    },
  });
}

export async function sendList(to, bodyText, buttonLabel, sections) {
  return apiPost(to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonLabel || 'Select',
        sections: sections.map(s => ({
          title: s.title.length > 24 ? s.title.slice(0, 24) : s.title,
          rows: s.rows.map(r => ({
            id: r.id,
            title: r.title.length > 24 ? r.title.slice(0, 24) : r.title,
            ...(r.description ? { description: r.description } : {}),
          })),
        })),
      },
    },
  });
}

export async function markAsRead(messageId) {
  if (isReplayMode()) return;

  const creds = getCredentials();
  if (!creds) return;

  try {
    await fetch(`https://graph.facebook.com/${API_VERSION}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch (error) {
    logger.warn('WHATSAPP_READ_FAILED', { msgId: messageId, error: error.message });
  }
}
