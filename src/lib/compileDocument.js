import { PDFDocument } from 'pdf-lib';
import { getSql } from '@/db/pool';
import { uploadToR2, getR2Object, getR2SignedUrl } from '@/lib/r2';
import { generatePrescription } from '@/lib/prescription';
import { logger } from '@/lib/logger';

const A4_W = 595.28;
const A4_H = 842;
const IMG_MARGIN = 18;

async function embedImageOnPage(page, buffer, pdfDoc) {
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
  let image;
  if (isPng) {
    image = await pdfDoc.embedPng(buffer);
  } else if (isJpeg) {
    image = await pdfDoc.embedJpg(buffer);
  } else {
    throw new Error('Unsupported image format (only PNG/JPEG supported)');
  }
  const maxW = A4_W - IMG_MARGIN * 2;
  const maxH = A4_H - IMG_MARGIN * 2;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const dw = image.width * scale;
  const dh = image.height * scale;
  page.drawImage(image, {
    x: (A4_W - dw) / 2,
    y: (A4_H - dh) / 2,
    width: dw,
    height: dh,
  });
}

/**
 * Compile all visit documents (prescription + images) into a single PDF.
 *
 * Flow:
 *  1. Fetch appointment + patient data from DB
 *  2. Download photos from R2
 *  3. Obtain prescription PDF (from cache or generate via generatePrescription)
 *  4. Merge prescription pages + image pages using pdf-lib
 *  5. Upload compiled PDF to R2, store key on appointment
 *  6. Return { key, url, buffer }
 */
export async function compileVisitDocument(appointmentId) {
  try {
  const sql = getSql();
  if (!sql) throw new Error('Database not available');

  // ─────────────────────────────────────────────
  // 1. Fetch appointment with patient data
  // ─────────────────────────────────────────────
  const rows = await sql`
    SELECT a.id, a.wa_id, a.patient_name, a.patient_phone,
           a.patient_id, a.date, a.treatment, a.treatments,
           a.consultation_fee, a.treatment_charges, a.medicine_charges,
           a.diagnosis, a.medicines, a.notes,
           a.advice_selected, a.diagnosis_selected,
           a.follow_up_date, a.follow_up_instructions,
           a.chit_media, a.prescription_key, a.tooth_diagnoses,
           p.name AS p_name, p.age AS p_age, p.sex AS p_sex
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id
    WHERE a.id = ${appointmentId}
    LIMIT 1
  `;

  if (!rows || rows.length === 0) {
    throw new Error('Appointment not found');
  }

  const a = rows[0];

  // ─────────────────────────────────────────────
  // 2. Download photos from R2
  // ─────────────────────────────────────────────
  const mediaKeys = Array.isArray(a.chit_media) ? a.chit_media : [];
  const images = [];

  for (const key of mediaKeys) {
    if (key.includes('_photo.')) {
      const buffer = await getR2Object(key);
      if (buffer) {
        images.push({ key, buffer });
      } else {
        logger.warn('COMPILE_MEDIA_DOWNLOAD_FAILED', { key });
      }
    }
  }

  // ─────────────────────────────────────────────
  // 3. Obtain prescription PDF
  // ─────────────────────────────────────────────
  let presBuffer = null;

  if (a.prescription_key) {
    presBuffer = await getR2Object(a.prescription_key);
  }

  if (!presBuffer) {
    logger.info('COMPILE_GENERATING_PRESCRIPTION', { appointmentId });
    const patient = {
      name: a.p_name || a.patient_name,
      phone: a.patient_phone,
      age: a.p_age,
      sex: a.p_sex,
    };
    const visit = {
      treatment: a.treatment,
      treatments: Array.isArray(a.treatments) ? a.treatments : [],
      tooth_diagnoses: Array.isArray(a.tooth_diagnoses) ? a.tooth_diagnoses : [],
      diagnosis: a.diagnosis,
      medicines: Array.isArray(a.medicines) ? a.medicines : [],
      advice_selected: Array.isArray(a.advice_selected) ? a.advice_selected : [],
      diagnosis_selected: Array.isArray(a.diagnosis_selected) ? a.diagnosis_selected : [],
      consultationFee: a.consultation_fee || 0,
      treatmentCharges: a.treatment_charges || 0,
      medicineCharges: a.medicine_charges || 0,
      nextVisit: a.follow_up_date ? { date: a.follow_up_date, time: null } : null,
      followUpInstructions: a.follow_up_instructions,
      notes: a.notes,
    };
    const appointment = {
      id: a.id,
      date: a.date,
      treatment: a.treatment,
      treatments: Array.isArray(a.treatments) ? a.treatments : [],
    };
    const result = await generatePrescription({ patient, visit, appointment });
    if (result?.buffer) presBuffer = result.buffer;
  }

  if (!presBuffer) {
    throw new Error('Failed to obtain prescription PDF');
  }

  // ─────────────────────────────────────────────
  // 4. Merge prescription PDF + image pages
  // ─────────────────────────────────────────────
  const presDoc = await PDFDocument.load(presBuffer);
  const mergedDoc = await PDFDocument.create();

  // Copy all prescription pages into merged document
  const presPages = await mergedDoc.copyPages(presDoc, presDoc.getPageIndices());
  for (const page of presPages) {
    mergedDoc.addPage(page);
  }

  // Add one page per photo
  for (const img of images) {
    try {
      const page = mergedDoc.addPage([A4_W, A4_H]);
      await embedImageOnPage(page, img.buffer, mergedDoc);
    } catch (imgErr) {
      logger.warn('COMPILE_IMAGE_EMBED_SKIPPED', { key: img.key, error: imgErr.message });
    }
  }

  const pdfBuffer = Buffer.from(await mergedDoc.save());

  // ─────────────────────────────────────────────
  // 5. Upload to R2
  // ─────────────────────────────────────────────
  const key = `compiled/${appointmentId}_${Date.now()}.pdf`;
  const uploaded = await uploadToR2({ key, buffer: pdfBuffer, contentType: 'application/pdf' });
  if (!uploaded) {
    throw new Error('Failed to upload compiled PDF to R2');
  }

  // Persist key on the appointment record for caching
  try {
    await sql`
      UPDATE appointments
      SET compiled_document_key = ${key}, updated_at = NOW()
      WHERE id = ${appointmentId}
    `;
  } catch (dbErr) {
    logger.warn('COMPILE_STORE_KEY_FAILED', { appointmentId, key, error: dbErr.message });
  }

  const signedUrl = await getR2SignedUrl(key, 604800);
  return { key, url: signedUrl, buffer: pdfBuffer };
  } catch (err) {
    logger.error('COMPILE_UNEXPECTED_ERROR', { appointmentId, error: err.message, stack: err.stack });
    throw new Error(`Compilation failed: ${err.message}`);
  }
}
