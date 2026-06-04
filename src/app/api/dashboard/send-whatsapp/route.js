import { NextResponse } from 'next/server';
import { sendText } from '@/lib/whatsapp';
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
    const { to, message } = await req.json();
    if (!to || !message) {
      return NextResponse.json({ error: 'to and message are required' }, { status: 400 });
    }
    const msgId = await sendText(to, message.trim());
    if (!msgId) {
      return NextResponse.json({ error: 'Failed to send WhatsApp message' }, { status: 500 });
    }
    logger.info('SEND_WHATSAPP_SUCCESS', { to, msgId });
    return NextResponse.json({ success: true, msgId });
  } catch (error) {
    logger.error('SEND_WHATSAPP_ERROR', { error: error.message });
    return jsonError(error);
  }
}
