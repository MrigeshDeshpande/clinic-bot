import PDFDocument from 'pdfkit';
import path from 'path';
import { getSql } from '@/db/pool';
import { uploadToR2, getR2SignedUrl } from '@/lib/r2';
import { CLINIC } from '@/config/clinic';
import { logger } from '@/lib/logger';

const PAGE_WIDTH = 595.28;
const LM = 50;
const RW = PAGE_WIDTH - LM * 2;

const fontDir = path.join(process.cwd(), 'public', 'fonts');
const FONT_REGULAR = path.join(fontDir, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(fontDir, 'DejaVuSans-Bold.ttf');

async function loadSettings() {
  try {
    const sql = getSql();
    const rows = await sql`SELECT key, value FROM settings`;
    const s = {};
    for (const row of rows) s[row.key] = row.value;
    return s;
  } catch {
    return {};
  }
}

function pick(s, section, field, fallback) {
  try {
    const v = s[section]?.[field];
    return v !== undefined && v !== null && v !== '' ? v : fallback;
  } catch {
    return fallback;
  }
}

export async function generatePrescription({ patient, visit, appointment }) {
  const settings = await loadSettings();

  const primaryColor = pick(settings, 'prescription', 'primary_color', '#0d1b2a');
  const accentColor = pick(settings, 'prescription', 'accent_color', '#3a86c8');
  const lightGray = '#f1f5f9';
  const textGray = '#666666';

  const clinicSubtitle = pick(settings, 'clinic', 'subtitle', 'Advanced Dental Care & Implant Center');
  const clinicEmail = pick(settings, 'clinic', 'email', 'shribalajiadc@gmail.com');
  const clinicInstagram = pick(settings, 'clinic', 'instagram', 'shribalaji_adc');
  const timingMonSat = pick(settings, 'clinic', 'timing_mon_sat', '10:00 AM \u2013 8:00 PM');
  const timingSun = pick(settings, 'clinic', 'timing_sun', '10:00 AM \u2013 2:00 PM');

  const docQual = pick(settings, 'doctor', 'qualifications', '');
  const docReg = pick(settings, 'doctor', 'registration', '');
  const docDesignation = pick(settings, 'doctor', 'designation', 'Dental Surgeon | Oral Implantologist');

  const showWatermark = pick(settings, 'prescription', 'show_watermark', true);
  const watermarkText = pick(settings, 'prescription', 'watermark_text', 'Shri Balaji');
  const showRx = pick(settings, 'prescription', 'show_rx', true);
  const genericSubstitution = pick(settings, 'prescription', 'generic_substitution', true);
  const borderEnabled = pick(settings, 'prescription', 'border_enabled', true);
  const fontSize = pick(settings, 'prescription', 'font_size', 10);

  const adviceList = settings.checklists?.advice || [];

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `Prescription - ${patient?.name || ''}`,
      Author: CLINIC.doctor?.name || CLINIC.name,
      Subject: 'Dental Prescription',
    },
  });

  doc.registerFont('Regular', FONT_REGULAR);
  doc.registerFont('Bold', FONT_BOLD);

  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));

  let y = 0;

  const BM = 8;

  // ─── BORDER ───
  if (borderEnabled) {
    doc.rect(BM, BM, PAGE_WIDTH - BM * 2, 842 - BM * 2).strokeColor(primaryColor).lineWidth(0.5).stroke();
    doc.strokeColor('#000000');
  }

  // ─── HEADER ───
  doc.rect(0, y, PAGE_WIDTH, 130).fill(primaryColor);
  doc.fillColor('#ffffff');
  doc.fontSize(28).font('Bold');
  doc.text('Shri Balaji', LM, 22);
  doc.fontSize(8).font('Regular');
  doc.fillColor(accentColor);
  doc.text(clinicSubtitle.toUpperCase(), LM, 58);

  doc.fillColor('#ffffff');
  doc.fontSize(11).font('Bold');
  const doctorLabel = `DR. ${(CLINIC.doctor?.name || '').replace(/^Dr\.\s*/i, '').toUpperCase()}`;
  doc.text(doctorLabel, LM + 280, 18, { width: 250, align: 'right' });

  doc.fontSize(8).font('Regular');
  doc.fillColor(accentColor);
  const qualParts = [docDesignation, docQual].filter(Boolean);
  doc.text(qualParts.join(' | '), LM + 280, 34, { width: 250, align: 'right' });

  doc.fillColor('#cccccc');
  if (docReg) {
    doc.text(docReg, LM + 280, 46, { width: 250, align: 'right' });
  }
  doc.fillColor('#ffffff');
  doc.fontSize(8.5);
  const phoneLine = `Phone: ${CLINIC.phone || ''}` + (clinicInstagram ? `     Instagram: ${clinicInstagram}` : '');
  doc.text(phoneLine, LM + 280, 62, { width: 250, align: 'right' });
  doc.text(`Email: ${clinicEmail}`, LM + 280, 74, { width: 250, align: 'right' });
  const addrShort = CLINIC.address ? CLINIC.address.split(', C')[0] || CLINIC.address : '';
  doc.text(`Address: ${addrShort}`, LM + 280, 86, { width: 250, align: 'right' });

  // ─── TIMING SEPARATOR ───
  const timingY = 108;
  doc.opacity(0.3);
  doc.moveTo(LM, timingY).lineTo(LM + 495, timingY).stroke('#ffffff');
  doc.opacity(1);
  doc.fillColor('#b0c4de');
  doc.fontSize(7.5).font('Regular');
  doc.text(`MON \u2013 SAT : ${timingMonSat}`, LM, timingY + 6);
  doc.text(`SUN : ${timingSun}`, LM + 350, timingY + 6);
  doc.fillColor('#000000');

  // ─── WATERMARK ───
  if (showWatermark && watermarkText) {
    doc.save();
    doc.opacity(0.06);
    doc.fontSize(60).font('Bold');
    doc.fillColor(primaryColor);
    const wmW = doc.widthOfString(watermarkText);
    const wmH = 60;
    doc.text(watermarkText, (PAGE_WIDTH - wmW) / 2, 360 - wmH / 2, { align: 'center' });
    doc.restore();
  }

  y = 150;

  // ─── PATIENT INFO ───
  doc.fontSize(10).font('Bold');
  doc.text('Pt. Name:', LM, y);
  doc.font('Regular');
  doc.text(patient?.name || '__________________', LM + 62, y);
  doc.font('Bold');
  doc.text('Date:', LM + 350, y);
  doc.font('Regular');
  const dateStr = appointment?.date ? new Date(appointment.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
  doc.text(dateStr, LM + 380, y);
  y += 16;
  doc.font('Bold');
  doc.text('Age / Sex:', LM, y);
  doc.font('Regular');
  const ageSex = [patient?.age || '', patient?.sex || ''].filter(Boolean).join(' / ') || '__________';
  doc.text(ageSex, LM + 72, y);
  if (patient?.phone) {
    doc.font('Bold');
    doc.text('Phone:', LM + 200, y - 16);
    doc.font('Regular');
    doc.text(patient.phone, LM + 248, y - 16);
  }
  y += 28;

  // ─── LINE ───
  doc.opacity(0.5);
  doc.moveTo(LM, y).lineTo(LM + RW, y).stroke('#cccccc');
  doc.opacity(1);
  y += 16;

  // ─── TREATMENT ───
  const treatmentText = visit?.treatment || appointment?.treatment || '';
  if (treatmentText) {
    doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
    doc.text('Treatment:', LM, y);
    y += 16;
    doc.fontSize(fontSize).font('Regular');
    doc.text(treatmentText, LM, y);
    y += 22;
  }

  if (visit?.diagnosis) {
    doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
    doc.text('Notes:', LM, y);
    y += 16;
    doc.fontSize(fontSize).font('Regular');
    doc.text(visit.diagnosis, LM, y, { width: RW });
    y += doc.heightOfString(visit.diagnosis, { width: RW }) + 16;
  }

  // ─── Rx + Generic Substitution ───
  if (showRx) {
    doc.fontSize(32).font('Bold');
    doc.fillColor(accentColor);
    doc.text('\u211E', LM, y);
    doc.fontSize(Math.max(8, fontSize - 1)).font('Regular');
    doc.fillColor('#000000');
    doc.text('Prescription', LM + 24, y + 8);

    if (genericSubstitution) {
      doc.fontSize(Math.max(7, fontSize - 2));
      doc.fillColor(textGray);
      doc.text('\u25A1  Generic substitution allowed', LM, y + 24);
      doc.fillColor('#000000');
    }
    y += 34 + (genericSubstitution ? 8 : 0);
  }

  // ─── MEDICINES TABLE ───
  if (visit?.medicines?.length > 0) {
    doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
    doc.text('Prescribed Medicines:', LM, y);
    y += 16;
    const col1 = 180;
    const col2 = 90;
    const col3 = 100;
    const col4 = 80;
    const rowH = 18;
    const medTotalW = col1 + col2 + col3 + col4;
    doc.fontSize(Math.max(7.5, fontSize - 1)).font('Bold');
    doc.text('Medicine', LM, y, { width: col1 });
    doc.text('Dosage', LM + col1, y, { width: col2 });
    doc.text('Frequency', LM + col1 + col2, y, { width: col3 });
    doc.text('Duration', LM + col1 + col2 + col3, y, { width: col4 });
    y += rowH;
    doc.moveTo(LM, y).lineTo(LM + medTotalW, y).stroke('#cccccc');
    y += 4;
    doc.font('Regular');
    for (const med of visit.medicines) {
      if (!med.name) continue;
      doc.text(med.name, LM, y, { width: col1 });
      doc.text(med.dosage || '', LM + col1, y, { width: col2 });
      doc.text(med.frequency || '', LM + col1 + col2, y, { width: col3 });
      doc.text(med.duration || '', LM + col1 + col2 + col3, y, { width: col4 });
      y += rowH;
      if (y > 700) {
        doc.addPage();
        if (borderEnabled) {
          doc.rect(BM, BM, PAGE_WIDTH - BM * 2, 842 - BM * 2).strokeColor(primaryColor).lineWidth(0.5).stroke();
          doc.strokeColor('#000000');
        }
        doc.rect(0, 0, PAGE_WIDTH, 30).fill(primaryColor);
        y = 40;
      }
    }
    y += 10;
  }

  // ─── ADVICE CHECKBOXES ───
  if (adviceList.length > 0) {
    doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
    doc.text('Diet & Advice:', LM, y);
    y += 16;
    doc.fontSize(Math.max(7.5, fontSize - 1)).font('Regular');
    for (const item of adviceList) {
      if (!item) continue;
      doc.text(`\u25A1  ${item}`, LM, y);
      y += doc.currentLineHeight() + 2;
    }
    y += 8;
  }

  // ─── FEES ───
  const feeItems = [
    { label: 'Consultation Fee', amount: visit?.consultationFee || 0 },
    { label: 'Treatment Charges', amount: visit?.treatmentCharges || 0 },
    { label: 'Medicine Charges', amount: visit?.medicineCharges || 0 },
  ];
  const hasFees = feeItems.some(f => f.amount > 0);
  if (hasFees) {
    doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
    doc.text('Fees:', LM, y);
    y += 16;
    doc.fontSize(fontSize).font('Regular');
    for (const item of feeItems) {
      if (item.amount > 0) {
        doc.text(`${item.label}:`, LM, y);
        doc.text(`Rs. ${item.amount}`, LM + 350, y, { align: 'right', width: 100 });
        y += 16;
      }
    }
    const total = (visit?.consultationFee || 0) + (visit?.treatmentCharges || 0) + (visit?.medicineCharges || 0);
    if (total > 0) {
      doc.moveTo(LM, y).lineTo(LM + 450, y).stroke('#cccccc');
      y += 8;
      doc.font('Bold');
      doc.text('Total:', LM, y);
      doc.text(`Rs. ${total}`, LM + 350, y, { align: 'right', width: 100 });
      y += 20;
    }
  }

  // ─── NEXT VISIT ───
  if (visit?.nextVisit?.date) {
    doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
    doc.text('Next Visit:', LM, y);
    y += 16;
    doc.fontSize(fontSize).font('Regular');
    let nextStr = new Date(visit.nextVisit.date).toLocaleDateString('en-IN');
    if (visit.nextVisit.time) nextStr += ` at ${visit.nextVisit.time}`;
    doc.text(nextStr, LM, y);
    y += 20;
  }

  // ─── FOLLOW-UP ───
  if (visit?.followUpInstructions) {
    doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
    doc.text('Follow-up Instructions:', LM, y);
    y += 16;
    doc.fontSize(fontSize).font('Regular');
    doc.text(visit.followUpInstructions, LM, y, { width: RW });
    y += doc.heightOfString(visit.followUpInstructions, { width: RW }) + 16;
  }

  // ─── NOTES ───
  if (visit?.notes) {
    doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
    doc.text('Notes:', LM, y);
    y += 16;
    doc.fontSize(fontSize).font('Regular');
    doc.text(visit.notes, LM, y, { width: RW });
    y += doc.heightOfString(visit.notes, { width: RW }) + 16;
  }

  // ─── NOTE BANNER ───
  const noteY = Math.max(y + 30, 680);
  doc.rect(LM, noteY, RW, 28).fill(primaryColor);
  doc.fillColor('#ffffff');
  doc.fontSize(7.5).font('Bold');
  doc.text('NOTE:', LM + 8, noteY + 4);
  doc.font('Regular');
  doc.text(
    'Please inform the doctor of any medical conditions (BP, Diabetes, Thyroid, Asthma, Allergies, Pregnancy, HIV, etc.) before treatment.',
    LM + 38, noteY + 4, { width: RW - 46 }
  );
  doc.fillColor('#000000');

  // ─── SIGNATURE ───
  const sigY = noteY + 42;
  doc.moveTo(LM + 300, sigY).lineTo(LM + 495, sigY).stroke(textGray);
  doc.fontSize(8.5).font('Regular');
  doc.text(CLINIC.doctor?.name || 'Doctor', LM + 300, sigY + 6, { align: 'right', width: 195 });

  // ─── FOOTER ───
  const footerY = 800;
  doc.fontSize(7).font('Regular');
  doc.fillColor('#999999');
  doc.text('This is a computer-generated prescription.', LM, footerY, { align: 'center', width: RW });
  doc.fillColor('#000000');

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(buffers);
      const key = `prescriptions/${appointment?.id || Date.now()}_${Date.now()}.pdf`;
      const uploaded = await uploadToR2({ key, buffer: pdfBuffer, contentType: 'application/pdf' });
      if (uploaded) {
        const signedUrl = await getR2SignedUrl(key, 604800);
        resolve({ buffer: pdfBuffer, key, url: signedUrl });
      } else {
        resolve({ buffer: pdfBuffer, key: null, url: null });
      }
    });
    doc.on('error', (err) => {
      logger.error('PDF_GENERATION_ERROR', { error: err.message });
      reject(err);
    });
  });
}
