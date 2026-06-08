import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { getR2SignedUrl } from '@/lib/r2';
import { compileVisitDocument } from '@/lib/compileDocument';
import { sendDocument } from '@/lib/whatsapp';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, jsonError } from '@/lib/apiAuth';

/**
 * POST /api/dashboard/visits/[id]/compile/send
 *
 * Compile the visit documents + images into a single PDF and send it
 * to the patient via WhatsApp as a document message.
 *
 * Body (optional):
 *   { caption: "Your visit summary from Shri Balaji Dental Clinic" }
 */
export async function POST(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const caption = body.caption || 'Your visit summary from Shri Balaji Dental Clinic';

    // Fetch patient phone number
    const sql = getSql();
    const rows = await sql`
      SELECT a.patient_phone, a.patient_name, a.compiled_document_key
      FROM appointments a
      WHERE a.id = ${id}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    const a = rows[0];
    let phone = a.patient_phone;
    if (!phone) {
      return NextResponse.json({ error: 'No patient phone number on record' }, { status: 400 });
    }

    // Normalize phone: remove + prefix if present, WhatsApp API expects without +
    if (phone.startsWith('+')) phone = phone.slice(1);

    // Compile or use cached
    let pdfUrl = null;
    if (a.compiled_document_key) {
      pdfUrl = await getR2SignedUrl(a.compiled_document_key, 604800);
    }

    if (!pdfUrl) {
      logger.info('COMPILE_SEND_COMPILING', { appointmentId: id });
      const result = await compileVisitDocument(id);
      if (!result || !result.url) {
        return NextResponse.json({ error: 'Failed to compile document' }, { status: 500 });
      }
      pdfUrl = result.url;
    } else {
      logger.info('COMPILE_SEND_CACHED', { appointmentId: id });
    }

    // Send via WhatsApp
    const filename = `Visit_Summary_${id}.pdf`;
    const msgId = await sendDocument(phone, pdfUrl, caption, filename);

    if (!msgId) {
      // Return the URL even when sending fails so the doctor can download it manually
      return NextResponse.json({
        error: 'Failed to send document via WhatsApp',
        url: pdfUrl,
        sent: false,
      }, { status: 500 });
    }

    logger.info('COMPILE_SEND_SUCCESS', { appointmentId: id, to: phone, msgId });
    return NextResponse.json({
      success: true,
      messageId: msgId,
      url: pdfUrl,
    });
  } catch (error) {
    logger.error('COMPILE_SEND_ERROR', { error: error.message, stack: error.stack });
    return jsonError(error);
  }
}
