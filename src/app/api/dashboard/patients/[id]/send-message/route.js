import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { sendText } from '@/lib/whatsapp';
import { createMessage } from '@/db/repositories/messageRepository';

export async function POST(req, { params }) {
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

    const recipient = waId || phone;

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

    logger.info('DASHBOARD_SEND_MESSAGE', { patientId: id, waId: recipient, msgId });
    return NextResponse.json({ success: true, msgId });
  } catch (error) {
    logger.error('DASHBOARD_SEND_MESSAGE_ERROR', { params, error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
