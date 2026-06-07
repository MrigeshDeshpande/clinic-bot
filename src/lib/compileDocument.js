import PDFDocument from 'pdfkit';
import path from 'path';
import { getSql } from '@/db/pool';
import { uploadToR2, getR2Object, getR2SignedUrl } from '@/lib/r2';
import { CLINIC } from '@/config/clinic';
import { logger } from '@/lib/logger';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 842;
const LM = 50;
const RW = PAGE_WIDTH - LM * 2;

const fontDir = path.join(process.cwd(), 'public', 'fonts');
const FONT_REGULAR = path.join(fontDir, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(fontDir, 'DejaVuSans-Bold.ttf');

function getMediaType(key) {
  if (!key) return 'file';
  if (key.includes('_photo.')) return 'photo';
  if (key.includes('_audio.')) return 'audio';
  return 'file';
}

function getMediaLabel(key) {
  const parts = key?.split('/') || [];
  return parts[parts.length - 1] || key || 'Unknown';
}

/**
 * Compile all visit documents (prescription summary + images) into a single PDF.
 *
 * Flow:
 *  1. Fetch appointment + patient data from DB
 *  2. Classify chit_media entries; download images from R2
 *  3. Build PDF: cover/summary page → one page per image
 *  4. Upload compiled PDF to R2, store key on appointment
 *  5. Return { key, url, buffer }
 *
 * NOTE: Existing PDFs and audio files are NOT merged — they are listed
 *       on the summary page with a note. Only raster images are embedded.
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
           a.chit_media, a.prescription_key,
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
  const patientName = a.p_name || a.patient_name || 'Patient';

  const dateStr = a.date
    ? new Date(a.date).toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN');

  const treatments = Array.isArray(a.treatments) && a.treatments.length > 0
    ? a.treatments
    : a.treatment
      ? [a.treatment]
      : [];

  // ─────────────────────────────────────────────
  // 2. Classify & download media
  // ─────────────────────────────────────────────
  const mediaKeys = Array.isArray(a.chit_media) ? a.chit_media : [];
  const images = [];
  const otherFiles = [];

  for (const key of mediaKeys) {
    const type = getMediaType(key);
    if (type === 'photo') {
      const buffer = await getR2Object(key);
      if (buffer) {
        images.push({ key, buffer });
      } else {
        logger.warn('COMPILE_MEDIA_DOWNLOAD_FAILED', { key });
        otherFiles.push({ key, label: getMediaLabel(key), note: '(download failed)' });
      }
    } else {
      otherFiles.push({ key, label: getMediaLabel(key), type });
    }
  }

  // ─────────────────────────────────────────────
  // 3. Build PDF
  // ─────────────────────────────────────────────
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `Visit Summary - ${patientName}`,
      Author: CLINIC.doctor?.name || CLINIC.name,
      Subject: 'Compiled Visit Document',
    },
  });

  doc.registerFont('Regular', FONT_REGULAR);
  doc.registerFont('Bold', FONT_BOLD);

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const PRIMARY = '#0d1b2a';
  const ACCENT = '#3a86c8';
  let y = 0;
  let pageNum = 1;

  // ── COVER / SUMMARY PAGE ──

  // Banner header
  const bannerH = 120;
  doc.rect(0, 0, PAGE_WIDTH, bannerH).fill(PRIMARY);

  const logoPath = path.join(process.cwd(), 'public', 'logo1.png');
  try {
    doc.image(logoPath, LM, 20, { fit: [60, 80], align: 'center', valign: 'center' });
  } catch {
    // skip logo if missing
  }

  doc.fillColor('#ffffff').font('Bold').fontSize(28);
  doc.text('Shri Balaji', LM + 72, 28, { lineBreak: false });

  doc.fillColor(ACCENT).font('Regular').fontSize(10);
  doc.text('DENTAL CLINIC & IMPLANT CENTER', LM + 72, 60, { lineBreak: false });

  // Visit summary heading
  y = bannerH + 28;
  doc.fillColor(PRIMARY).font('Bold').fontSize(16);
  doc.text('Visit Summary', LM, y);
  y += 28;

  // Patient info
  doc.font('Bold').fontSize(10).fillColor('#000000');
  doc.text('Patient:', LM, y);
  doc.font('Regular');
  doc.text(patientName, LM + 56, y);
  doc.font('Bold');
  doc.text('Date:', LM + 300, y);
  doc.font('Regular');
  doc.text(dateStr, LM + 336, y);
  y += 18;

  if (a.p_age || a.p_sex) {
    doc.font('Bold');
    doc.text('Age/Sex:', LM, y);
    doc.font('Regular');
    doc.text([a.p_age, a.p_sex].filter(Boolean).join(' / '), LM + 56, y);
    y += 18;
  }
  if (a.patient_phone) {
    doc.font('Bold');
    doc.text('Phone:', LM, y);
    doc.font('Regular');
    doc.text(a.patient_phone, LM + 56, y);
    y += 18;
  }

  // Separator
  y += 8;
  doc.moveTo(LM, y).lineTo(LM + RW, y).stroke('#cccccc');
  y += 16;

  // Treatments
  if (treatments.length > 0) {
    doc.font('Bold').fontSize(10);
    doc.text('Treatment:', LM, y);
    y += 16;
    doc.font('Regular');
    treatments.forEach((t, i) => {
      doc.text(`${i + 1}. ${t}`, LM + 12, y);
      y += 16;
    });
    y += 8;
  }

  // Diagnosis
  if (a.diagnosis) {
    doc.font('Bold');
    doc.text('Diagnosis:', LM, y);
    y += 14;
    doc.font('Regular');
    const diagH = doc.heightOfString(a.diagnosis, { width: RW - 12 });
    doc.text(a.diagnosis, LM + 12, y, { width: RW - 12 });
    y += diagH + 12;
  }

  // Fees
  const consFee = Number(a.consultation_fee) || 0;
  const treatFee = Number(a.treatment_charges) || 0;
  const medFee = Number(a.medicine_charges) || 0;
  const totalFee = consFee + treatFee + medFee;

  if (totalFee > 0) {
    doc.font('Bold');
    doc.text('Fees:', LM, y);
    y += 14;
    doc.font('Regular');
    if (consFee > 0) { doc.text(`Consultation Fee:    Rs. ${consFee}`, LM + 12, y); y += 14; }
    if (treatFee > 0) { doc.text(`Treatment Charges:  Rs. ${treatFee}`, LM + 12, y); y += 14; }
    if (medFee > 0) { doc.text(`Medicine Charges:   Rs. ${medFee}`, LM + 12, y); y += 14; }
    doc.moveTo(LM + 12, y).lineTo(LM + 200, y).stroke('#cccccc');
    y += 8;
    doc.font('Bold');
    doc.text(`Total: Rs. ${totalFee}`, LM + 12, y);
    y += 24;
  }

  // Attachments index
  if (images.length > 0 || otherFiles.length > 0) {
    if (y > 640) { doc.addPage(); y = 40; pageNum++; }

    doc.moveTo(LM, y).lineTo(LM + RW, y).stroke('#cccccc');
    y += 12;
    doc.font('Bold').fontSize(10);
    doc.text('Attachments in this document:', LM, y);
    y += 18;

    if (images.length > 0) {
      doc.fontSize(9).font('Regular');
      images.forEach((img, i) => {
        const label = getMediaLabel(img.key);
        doc.text(`\uD83D\uDDBC\uFE0F  Image ${i + 1}: ${label}`, LM + 12, y, { width: RW - 12, ellipsis: true });
        y += 14;
      });
    }

    if (otherFiles.length > 0) {
      y += 6;
      doc.fontSize(9).font('Regular').fillColor('#666666');
      otherFiles.forEach((f) => {
        const icon = f.type === 'audio' ? '\uD83C\uDFB5' : '\uD83D\uDCCE';
        doc.text(`${icon}  ${f.label} ${f.note || '(not included in compilation)'}`, LM + 12, y, { width: RW - 12, ellipsis: true });
        y += 14;
      });
      doc.fillColor('#000000');
    }
  }

  // Doctor signature area
  if (y < 700) y = Math.max(y + 40, 720);
  doc.font('Bold').fontSize(9);
  doc.text('Dr. ' + (CLINIC.doctor?.name || ''), PAGE_WIDTH - LM - 150, y, { width: 150, align: 'right' });
  doc.fontSize(8).font('Regular').fillColor('#666666');
  doc.text('(Digital Copy)', PAGE_WIDTH - LM - 150, y + 14, { width: 150, align: 'right' });
  doc.fillColor('#000000');

  // ── IMAGE PAGES ──
  for (const img of images) {
    doc.addPage();
    pageNum++;

    // Header bar
    doc.rect(0, 0, PAGE_WIDTH, 28).fill(PRIMARY);
    doc.fillColor('#ffffff').font('Regular').fontSize(7.5);
    doc.text(`Shri Balaji Dental Clinic — ${patientName} — ${dateStr}`, LM, 8, { width: RW, align: 'center' });

    // Embed image fitted to page
    const imgMargin = 18;
    const imgMaxW = PAGE_WIDTH - imgMargin * 2;
    const imgMaxH = PAGE_HEIGHT - 28 - imgMargin * 2 - 18; // header(28) + margin + footer space

    try {
      doc.image(img.buffer, imgMargin, 28 + imgMargin, {
        fit: [imgMaxW, imgMaxH],
        align: 'center',
        valign: 'center',
      });
    } catch (err) {
      logger.error('COMPILE_IMAGE_EMBED_ERROR', { key: img.key, error: err.message });
      doc.fillColor('#ff0000').fontSize(12).font('Regular');
      doc.text('Failed to load this image.', imgMargin, 300, { width: imgMaxW, align: 'center' });
    }

    // Footer
    doc.fillColor('#999999').fontSize(7).font('Regular');
    doc.text(`Page ${pageNum}`, LM, PAGE_HEIGHT - 18, { width: RW, align: 'center' });
  }

  // ── FINALIZE ──
  return new Promise((resolve, reject) => {
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const key = `compiled/${appointmentId}_${Date.now()}.pdf`;
      const uploaded = await uploadToR2({ key, buffer: pdfBuffer, contentType: 'application/pdf' });
      if (!uploaded) {
        reject(new Error('Failed to upload compiled PDF to R2'));
        return;
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
      resolve({ key, url: signedUrl, buffer: pdfBuffer });
    });
    doc.on('error', reject);
    doc.end();
  });
    } catch (err) {
      logger.error('COMPILE_UNEXPECTED_ERROR', { appointmentId, error: err.message, stack: err.stack });
      throw new Error(`Compilation failed: ${err.message}`);
    }
}
