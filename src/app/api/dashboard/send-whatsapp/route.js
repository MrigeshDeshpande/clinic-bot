import { NextResponse } from 'next/server';
import { sendText, sendTemplate } from '@/lib/whatsapp';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError } from '@/lib/apiAuth';

export async function POST(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const sizeErr = checkBodySize(req);
  if (sizeErr) return sizeErr;
  try {
    const { to, message, template, params } = await req.json();
    if (!to) {
      return NextResponse.json({ error: 'to is required' }, { status: 400 });
    }
    let msgId;
    if (template) {
      msgId = await sendTemplate(to, template, params || []);
    } else {
      if (!message) {
        return NextResponse.json({ error: 'message is required when not using a template' }, { status: 400 });
      }
      msgId = await sendText(to, message.trim());
    }
    if (!msgId) {
      return NextResponse.json({ error: 'Failed to send WhatsApp message' }, { status: 500 });
    }
    logger.info('SEND_WHATSAPP_SUCCESS', { to, msgId, template: !!template });
    return NextResponse.json({ success: true, msgId });
  } catch (error) {
    logger.error('SEND_WHATSAPP_ERROR', { error: error.message });
    return jsonError(error);
  }
}
