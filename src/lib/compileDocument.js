import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { getSql } from '@/db/pool';
import { uploadToR2, getR2Object, getR2SignedUrl } from '@/lib/r2';
import { generatePrescription, generateDentalChart } from '@/lib/prescription';
import { CLINIC } from '@/config/clinic';
import { logger } from '@/lib/logger';

const A4_W = 595.28;
const A4_H = 842;
const IMG_MARGIN = 18;

function parseToothDiagnoses(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') try { return JSON.parse(raw); } catch { return []; }
  return [];
}

/**
 * Compile all visit documents (prescription + dental chart + images) into a single PDF.
 *
 * Flow:
 *  1. Fetch appointment + patient data from DB
 *  2. Download photos from R2
 *  3. Obtain prescription PDF (from cache or generate via generatePrescription)
 *  4. Generate dental chart PDF via generateDentalChart
 *  5. Merge prescription pages + chart pages + image pages using pdf-lib
 *  6. Upload compiled PDF to R2, store key on appointment
 *  7. Return { key, url, buffer }
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
      tooth_diagnoses: parseToothDiagnoses(a.tooth_diagnoses),
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
  // 4. Generate dental chart PDF
  // ─────────────────────────────────────────────
  let chartBuffer = null;
  try {
    const chartResult = await generateDentalChart({
      patient: { name: a.p_name || a.patient_name, phone: a.patient_phone, age: a.p_age, sex: a.p_sex },
      visit: { tooth_diagnoses: parseToothDiagnoses(a.tooth_diagnoses) },
      appointment: { id: a.id, date: a.date, treatment: a.treatment, treatments: Array.isArray(a.treatments) ? a.treatments : [] },
    });
    if (chartResult?.buffer) chartBuffer = chartResult.buffer;
  } catch (chartErr) {
    logger.warn('COMPILE_CHART_FAILED', { appointmentId, error: chartErr.message });
  }

  // ─────────────────────────────────────────────
  // 5. Merge prescription PDF + chart + image pages
  // ─────────────────────────────────────────────
  const presDoc = await PDFDocument.load(presBuffer);
  const mergedDoc = await PDFDocument.create();

  // Copy all prescription pages into merged document
  const presPages = await mergedDoc.copyPages(presDoc, presDoc.getPageIndices());
  for (const page of presPages) {
    mergedDoc.addPage(page);
  }

  // Add dental chart pages
  if (chartBuffer) {
    try {
      const chartDoc = await PDFDocument.load(chartBuffer);
      const chartPages = await mergedDoc.copyPages(chartDoc, chartDoc.getPageIndices());
      for (const page of chartPages) {
        mergedDoc.addPage(page);
      }
    } catch (chartMergeErr) {
      logger.warn('COMPILE_CHART_MERGE_FAILED', { appointmentId, error: chartMergeErr.message });
    }
  }

  // Add one page per photo with branded overlay
  const headerH = 36;
  const footerH = 22;
  const font = await mergedDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await mergedDoc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 0; i < images.length; i++) {
    try {
      const page = mergedDoc.addPage([A4_W, A4_H]);

      // Header bar
      page.drawRectangle({
        x: 0, y: A4_H - headerH, width: A4_W, height: headerH,
        color: rgb(0.05, 0.11, 0.16),
      });
      page.drawText('Shri Balaji', {
        x: IMG_MARGIN, y: A4_H - headerH + 10, size: 14, font: fontBold,
        color: rgb(1, 1, 1),
      });
      page.drawText(`Photo ${i + 1} of ${images.length}`, {
        x: A4_W - IMG_MARGIN - 120, y: A4_H - headerH + 11, size: 10, font,
        color: rgb(0.69, 0.75, 0.87),
      });

      // Centered watermark
      const wmText = 'Shri Balaji';
      const wmSize = 36;
      const wmW = fontBold.widthOfTextAtSize(wmText, wmSize);
      page.drawText(wmText, {
        x: (A4_W - wmW) / 2,
        y: A4_H / 2 - 12,
        size: wmSize,
        font: fontBold,
        color: rgb(0.05, 0.11, 0.16),
        opacity: 0.06,
        rotate: degrees(-20),
      });

      // Footer bar
      page.drawRectangle({
        x: 0, y: 0, width: A4_W, height: footerH,
        color: rgb(0.05, 0.11, 0.16),
      });
      const phoneDigits = String(CLINIC.phone || '+91 91833 74850')
        .replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');
      const doctorLabel = (CLINIC.doctor?.name || 'Dr. M. Vishnu Vardhan').toUpperCase();
      page.drawText(`${doctorLabel}  |  +91-${phoneDigits}`, {
        x: IMG_MARGIN, y: 6, size: 8, font,
        color: rgb(0.9, 0.93, 0.97),
      });

      // Embed image (centered between header and footer)
      const buf = images[i].buffer;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50;
      const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
      let image;
      if (isPng) {
        image = await mergedDoc.embedPng(buf);
      } else if (isJpeg) {
        image = await mergedDoc.embedJpg(buf);
      } else {
        throw new Error('Unsupported image format (only PNG/JPEG supported)');
      }
      const contentH = A4_H - headerH - footerH;
      const maxW = A4_W - IMG_MARGIN * 2;
      const maxH = contentH - IMG_MARGIN * 2;
      const scale = Math.min(maxW / image.width, maxH / image.height, 1);
      const dw = image.width * scale;
      const dh = image.height * scale;
      page.drawImage(image, {
        x: (A4_W - dw) / 2,
        y: footerH + (contentH - dh) / 2,
        width: dw,
        height: dh,
      });
    } catch (imgErr) {
      logger.warn('COMPILE_IMAGE_EMBED_SKIPPED', { key: images[i].key, error: imgErr.message });
    }
  }

  const pdfBuffer = Buffer.from(await mergedDoc.save());

  // ─────────────────────────────────────────────
  // 6. Upload to R2
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
