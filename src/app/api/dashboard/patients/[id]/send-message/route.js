import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { sendText } from '@/lib/whatsapp';
import { createMessage } from '@/db/repositories/messageRepository';
import { notifyNewMessage } from '@/lib/messageEvents';
import { getOrCreate, save } from '@/lib/session';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError } from '@/lib/apiAuth';

export async function POST(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const sizeErr = checkBodySize(req);
  if (sizeErr) return sizeErr;
  try {
    const sql = getSql();
    const { id } = await params;
    const { message } = await req.json();

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get patient info
    const patientRows = await sql`
      SELECT id, wa_id, phone, name FROM patients WHERE id = ${id} LIMIT 1
    `;

    if (!patientRows || patientRows.length === 0) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const patient = patientRows[0];
    const waId = patient.wa_id;
    const phone = patient.phone;

    if (!waId && !phone) {
      return NextResponse.json({ error: 'Patient has no WhatsApp ID or phone number' }, { status: 400 });
    }

    // Prefer phone (manually entered/confirmed) over wa_id — wa_id can be
    // unreliable when patients are created via the dashboard without a
    // proper WhatsApp interaction
    const recipient = phone || waId;

    // Send the WhatsApp message
    const msgId = await sendText(recipient, message.trim());

    if (!msgId) {
      return NextResponse.json({ error: 'Failed to send WhatsApp message' }, { status: 500 });
    }

    // Log the outgoing message
    await createMessage({
      msgId,
      sessionId: null,
      waId: recipient,
      role: 'bot',
      content: message.trim(),
      intent: 'dashboard_send_message',
      metadata: { sentFrom: 'dashboard', patientId: id, patientName: patient.name },
    });
    notifyNewMessage(recipient);

    // Activate manual mode on patient's session so bot doesn't auto-reply
    try {
      const session = await getOrCreate(recipient, null, patient.name || 'Patient');
      if (session) {
        session.context.manualMode = true;
        session.context.manualModeStartedAt = new Date().toISOString();
        save(session).catch(() => {});
      }
    } catch (sessionErr) {
      logger.warn('MANUAL_MODE_ACTIVATE_FAILED', { waId: recipient, error: sessionErr.message });
    }

    logger.info('DASHBOARD_SEND_MESSAGE', { patientId: id, waId: recipient, msgId });
    return NextResponse.json({ success: true, msgId });
  } catch (error) {
    logger.error('DASHBOARD_SEND_MESSAGE_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}
