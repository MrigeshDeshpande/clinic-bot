import PDFDocument from 'pdfkit';
import path from 'path';
import { getSql } from '@/db/pool';
import { uploadToR2, getR2SignedUrl } from '@/lib/r2';
import { CLINIC } from '@/config/clinic';
import { logger } from '@/lib/logger';
import { getTreatmentName } from '@/lib/treatments';

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

  // ─── HEADER ───
  const PM = 30;
  const bannerH = 158;
  const leftX = PM;
  const dividerX = 300;
  const rightX = dividerX + 16;            // 316
  const rightW = PAGE_WIDTH - PM - rightX; // ~249
  const logoW = 64;
  const brandX = leftX + logoW + 12;       // 88

  doc.rect(0, 0, PAGE_WIDTH, bannerH).fill(primaryColor);

  // Logo — fit-box scales any source dimensions without overflowing
  const logoPath = path.join(process.cwd(), 'public', 'logo1.png');
  try {
    doc.image(logoPath, leftX, 24, { fit: [logoW, 116], align: 'center', valign: 'top' });
  } catch {
    doc.roundedRect(leftX, 24, logoW, logoW, 8).fill('#ffffff');
    doc.fillColor(primaryColor).fontSize(14).font('Bold').text('SB', leftX, 40, { width: logoW, align: 'center' });
  }

  // Brand wordmark — lineBreak:false so it can never bleed past the divider
  doc.fillColor('#ffffff').font('Bold').fontSize(32);
  doc.text('Shri Balaji', brandX, 30, { lineBreak: false });

  // Subtitle — split on "&"; line 2 gets a thin accent line on each side
  const subFont = 8;
  const subCS = 1.2;
  doc.fillColor(accentColor).font('Regular').fontSize(subFont);
  const subRaw = (clinicSubtitle || 'Advanced Dental Care & Implant Center').toUpperCase();
  const ampIdx = subRaw.indexOf('&');
  const subLine1 = ampIdx > 0 ? subRaw.slice(0, ampIdx).trim() : subRaw;
  const subLine2 = ampIdx > 0 ? subRaw.slice(ampIdx).trim() : '';
  const subW = dividerX - brandX - 6;

  doc.text(subLine1, brandX, 66, { width: subW, characterSpacing: subCS, lineBreak: false });

  if (subLine2) {
    const l2y = 78;
    const tW = doc.widthOfString(subLine2) + subLine2.length * subCS;
    const tX = brandX + (subW - tW) / 2;
    doc.text(subLine2, tX, l2y, { characterSpacing: subCS, lineBreak: false });
    const lineY = l2y + subFont / 2;
    const gap = 6;
    doc.save();
    doc.strokeColor(accentColor).lineWidth(0.8).opacity(0.6);
    doc.moveTo(brandX, lineY).lineTo(tX - gap, lineY).stroke();
    doc.moveTo(tX + tW + gap, lineY).lineTo(brandX + subW, lineY).stroke();
    doc.restore();
    doc.opacity(1);
  }

  // Vertical divider
  doc.save();
  doc.strokeColor(accentColor).lineWidth(1.5);
  doc.moveTo(dividerX, 24).lineTo(dividerX, 118).stroke();
  doc.restore();

  // ── RIGHT: Doctor details ──
  let ry = 22;
  doc.fillColor('#ffffff').font('Bold').fontSize(12);
  const doctorLabel = `DR. ${(CLINIC.doctor?.name || 'M. VISHNU VARDHAN').replace(/^Dr\.\s*/i, '').toUpperCase()}, BDS, MOI`;
  doc.text(doctorLabel, rightX, ry, { width: rightW, lineBreak: false, ellipsis: true });

  ry += 18;
  doc.fillColor(accentColor).font('Regular').fontSize(8.5);
  doc.text(`${docDesignation} (Hyderabad)`, rightX, ry, { width: rightW, lineBreak: false, ellipsis: true });

  ry += 14;
  doc.fillColor('#a0c0e0').fontSize(8.5);
  doc.text(`Reg. No. - ${docReg || 'CGDC/G/24/4198'}`, rightX, ry, { width: rightW, lineBreak: false });

  // Contacts
  const dotR = 1.8;
  const textX = rightX + 12;
  // Normalize phone: keep digits only, drop a leading 91 if the result would be 12 digits → no double +91
  const phoneDigits = String(CLINIC.phone || '9111594782').replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');
  const instaHandle = (clinicInstagram || 'shribalaji_adc').replace(/^@/, '');

  ry += 20;
  doc.font('Regular').fontSize(9.5);
  doc.save(); doc.fillColor(accentColor).circle(rightX + dotR, ry + 5, dotR).fill(); doc.restore();
  doc.fillColor('#e6eef7').text(`+91-${phoneDigits}`, textX, ry, { lineBreak: false });
  const phoneW = doc.widthOfString(`+91-${phoneDigits}`);
  doc.link(textX, ry, phoneW, 12, `tel:+91${phoneDigits}`);
  const igDotX = textX + phoneW + 16;
  doc.save(); doc.fillColor(accentColor).circle(igDotX + dotR, ry + 5, dotR).fill(); doc.restore();
  doc.fillColor('#e6eef7').text(instaHandle, igDotX + 10, ry, { lineBreak: false });
  doc.link(igDotX + 10, ry, doc.widthOfString(instaHandle), 12, `https://instagram.com/${instaHandle}`);

  ry += 16;
  doc.save(); doc.fillColor(accentColor).circle(rightX + dotR, ry + 5, dotR).fill(); doc.restore();
  doc.fillColor('#e6eef7').text(clinicEmail, textX, ry, { lineBreak: false });
  doc.link(textX, ry, doc.widthOfString(clinicEmail), 12, `mailto:${clinicEmail}`);

  ry += 16;
  doc.save(); doc.fillColor(accentColor).circle(rightX + dotR, ry + 5, dotR).fill(); doc.restore();
  doc.fillColor('#e6eef7').text('MIG-1/321, Amdi Nagar, Hudco, Bhilai', textX, ry, { width: rightW - 12, lineBreak: false, ellipsis: true });

  // ── Timing bar (bottom, full width) ──
  const stripY = 132;
  doc.save();
  doc.opacity(0.22); doc.strokeColor('#ffffff').lineWidth(1);
  doc.moveTo(PM, stripY).lineTo(PAGE_WIDTH - PM, stripY).stroke();
  doc.restore();
  doc.fillColor('#b0c4de').font('Regular').fontSize(9);
  doc.text(`MON \u2013 SUN : ${timingMonSat}`, PM, stripY + 12, { lineBreak: false });
  doc.text('SAT : Closed', PAGE_WIDTH - PM - 90, stripY + 12, { width: 90, align: 'right' });
  doc.fillColor('#000000');


  // ─── WATERMARK ───
  if (showWatermark && watermarkText) {
    doc.save();
    doc.opacity(0.06);
    const wmLogoPath = path.join(process.cwd(), 'public', 'logo1.png');
    try {
      doc.image(wmLogoPath, (PAGE_WIDTH - 200) / 2, 260, { width: 200 });
      const wmText = watermarkText || 'Shri Balaji';
      doc.fontSize(28).font('Bold').fillColor(primaryColor);
      const wmTW = doc.widthOfString(wmText);
      doc.text(wmText, 0, 540, { width: PAGE_WIDTH, align: 'center' });
    } catch {
      doc.fontSize(60).font('Bold');
      doc.fillColor(primaryColor);
      const wmW = doc.widthOfString(watermarkText);
      doc.text(watermarkText, (PAGE_WIDTH - wmW) / 2, 360 - 30, { align: 'center' });
    }
    doc.restore();
  }

  y = bannerH + 22;

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

  // ─── TOOTH DIAGNOSIS TABLE ───
  const toothDiagnoses = visit?.tooth_diagnoses || [];
  if (toothDiagnoses.length > 0) {
    doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
    doc.text('Tooth-wise Diagnosis:', LM, y);
    y += 14;

    const colX = [LM, LM + 36, LM + 66, LM + RW - 40];
    const colW = [30, 28, RW - 108, 40];
    const tableW = RW;
    const rh = 16;
    const headerBg = '#1e3a5f';
    const altBg = '#f3f4f6';

    // Table header
    doc.roundedRect(LM, y, tableW, rh, 3).fill(headerBg);
    doc.fillColor('#ffffff').fontSize(Math.max(7.5, fontSize - 1)).font('Bold');
    doc.text('Tooth', colX[0] + 4, y + 4, { width: colW[0] - 4 });
    doc.text('Surf.', colX[1] + 4, y + 4, { width: colW[1] - 4 });
    doc.text('Diagnosis', colX[2] + 4, y + 4, { width: colW[2] - 4 });
    doc.text('Plan', colX[3] + 4, y + 4, { width: colW[3] - 4 });
    y += rh;
    doc.fillColor('#000000').fontSize(fontSize).font('Regular');

    // Data rows
    for (let i = 0; i < toothDiagnoses.length; i++) {
      const td = toothDiagnoses[i];
      const surface = td.surface || '\u2014';
      const treatment = getTreatmentName(td.treatment) || '\u2014';
      const diagText = td.diagnoses.join(', ');
      const rowH = Math.max(rh, doc.heightOfString(diagText, { width: colW[2] - 4 }) + 6);

      // Row background
      if (i % 2 === 1) {
        doc.rect(LM, y, tableW, rowH).fill(altBg);
      }

      // Row separator
      doc.moveTo(LM, y).lineTo(LM + tableW, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

      // Vertical separators
      for (let c = 1; c < 4; c++) {
        doc.moveTo(colX[c], y).lineTo(colX[c], y + rowH).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      }

      // Cell text
      doc.fillColor('#000000');
      doc.font('Bold').fontSize(Math.max(8, fontSize - 0.5));
      doc.text(`#${td.tooth}`, colX[0] + 4, y + 4, { width: colW[0] - 4 });
      doc.font('Regular').fontSize(Math.max(8, fontSize - 0.5));
      doc.text(surface, colX[1] + 4, y + 4, { width: colW[1] - 4 });
      doc.text(diagText, colX[2] + 4, y + 4, { width: colW[2] - 4 });
      doc.font('Regular').fontSize(fontSize);
      doc.text(treatment, colX[3] + 4, y + 4, { width: colW[3] - 4 });

      y += rowH;
    }
    y += 10;
  } else {
    // Fallback: plain diagnosis_selected list
    const selectedDiagnoses = visit?.diagnosis_selected || [];
    if (selectedDiagnoses.length > 0) {
      doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
      doc.text('Diagnosis:', LM, y);
      y += 16;
      doc.fontSize(fontSize).font('Regular');
      for (const item of selectedDiagnoses) {
        const line = `\u2713  ${item}`;
        doc.text(line, LM, y);
        y += doc.heightOfString(line, { width: RW }) + 4;
      }
      y += 8;
    }
  }

  // ─── TREATMENT ───
  // Normalize treatments: support both JSONB arrays and comma-separated strings
  const rawTreatments = visit?.treatments?.length
    ? visit.treatments
    : (visit?.treatment ? visit.treatment : []);
  const treatments = Array.isArray(rawTreatments)
    ? rawTreatments
    : String(rawTreatments).split(',').map(t => t.trim()).filter(Boolean);
  if (treatments.length > 0) {
    doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
    doc.text('Treatment:', LM, y);
    y += 16;
    doc.fontSize(fontSize).font('Regular');
    treatments.forEach((t, i) => {
      doc.text(`${i + 1}. ${t}`, LM, y);
      y += 16;
    });
    y += 6;
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
    const col1 = 145;
    const col2 = 75;
    const col3 = 85;
    const col4 = 55;
    const col5 = 45;
    const col6 = 45;
    const rowH = 18;
    const medTotalW = col1 + col2 + col3 + col4 + col5 + col6;
    doc.fontSize(Math.max(7.5, fontSize - 1)).font('Bold');
    doc.text('Medicine', LM, y, { width: col1 });
    doc.text('Dosage', LM + col1, y, { width: col2 });
    doc.text('Frequency', LM + col1 + col2, y, { width: col3 });
    doc.text('Duration', LM + col1 + col2 + col3, y, { width: col4 });
    doc.text('Timing', LM + col1 + col2 + col3 + col4, y, { width: col5 });
    doc.text('Rate', LM + col1 + col2 + col3 + col4 + col5, y, { width: col6 });
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
      doc.text(med.timing === 'before' ? 'Before meal' : 'After meal', LM + col1 + col2 + col3 + col4, y, { width: col5 });
      doc.text(`Rs. ${med.rate || 0}`, LM + col1 + col2 + col3 + col4 + col5, y, { width: col6 });
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

  // ─── ADVICE (only selected items) ───
  const selectedAdvice = visit?.advice_selected || [];
  if (selectedAdvice.length > 0) {
    doc.fontSize(Math.max(9, fontSize + 1)).font('Bold');
    doc.text('Diet & Advice:', LM, y);
    y += 16;
    doc.fontSize(Math.max(7.5, fontSize - 1)).font('Regular');
    for (const item of selectedAdvice) {
      if (!item) continue;
      doc.text(`\u2713  ${item}`, LM, y);
      y += doc.currentLineHeight() + 2;
    }
    y += 8;
  }

  // ─── FEES ───
  const tf = visit?.treatmentFees || {};
  const getAmount = (v) => typeof v === 'number' ? v : (v?.amount ?? 0);
  const getLabel = (v, fallback) => typeof v === 'object' && v ? (v.label || v.treatment || fallback) : fallback;
  const feeItems = [
    { label: 'Consultation Fee', amount: Number(visit?.consultationFee) || 0 },
    ...Object.entries(tf).map(([key, entry]) => ({
      label: getLabel(entry, key),
      amount: getAmount(entry),
    })),
    { label: 'Medicine Charges', amount: Number(visit?.medicineCharges) || 0 },
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
    const total = feeItems.reduce((s, f) => s + f.amount, 0);
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

  // ─── SIGNATURE ───
  const sigY = Math.max(y + 30, 770);
  const signPath = path.join(process.cwd(), 'public', 'sign.png');
  try { doc.image(signPath, LM + 350, sigY - 65, { fit: [130, 60], align: 'center', valign: 'bottom' }); } catch (e) { logger.error('SIGN_LOAD_ERROR', { error: e.message }); }
  doc.fontSize(8.5).font('Regular');
  doc.text(CLINIC.doctor?.name || 'Doctor', LM + 300, sigY + 6, { align: 'right', width: 195 });

  // ─── NOTE BANNER (sticky bottom) ───
  const noteY = 842 - 28 - 10;
  doc.rect(BM, noteY, PAGE_WIDTH - BM * 2, 28).fill(primaryColor);
  doc.fillColor('#ffffff');
  doc.fontSize(7.5).font('Bold');
  doc.text('NOTE:', BM + 10, noteY + 4);
  doc.font('Regular');
  doc.text(
    'Please inform the doctor of any medical conditions (BP, Diabetes, Thyroid, Asthma, Allergies, Pregnancy, HIV, etc.) before treatment.',
    BM + 48, noteY + 4, { width: PAGE_WIDTH - BM * 2 - 58 }
  );
  doc.fillColor('#000000');

  // Border on top of everything
  if (borderEnabled) {
    doc.rect(BM, BM, PAGE_WIDTH - BM * 2, 842 - BM * 2).strokeColor(primaryColor).lineWidth(0.5).stroke();
    doc.strokeColor('#000000');
  }

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

// ─── DENTAL CHART PDF ───
export async function generateDentalChart({ patient, visit, appointment }) {
  const settings = await loadSettings();
  const primaryColor = pick(settings, 'prescription', 'primary_color', '#0d1b2a');
  const accentColor = pick(settings, 'prescription', 'accent_color', '#3a86c8');

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `Dental Chart - ${patient?.name || ''}`,
      Author: CLINIC.doctor?.name || CLINIC.name,
      Subject: 'Dental Chart',
    },
  });

  doc.registerFont('Regular', FONT_REGULAR);
  doc.registerFont('Bold', FONT_BOLD);

  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));

  const PW = 841.89;
  const PH = 595.28;
  const LM = 40;
  const RW = PW - LM * 2;

  // Header
  const logoPath = path.join(process.cwd(), 'public', 'logo1.png');
  doc.rect(0, 0, PW, 52).fill(primaryColor);

  // Left: Logo + clinic name
  try {
    doc.image(logoPath, LM, 8, { fit: [32, 36], align: 'center', valign: 'center' });
  } catch {
    doc.roundedRect(LM, 10, 30, 30, 6).fill('#ffffff');
    doc.fillColor(primaryColor).fontSize(11).font('Bold').text('SB', LM, 18, { width: 30, align: 'center' });
  }

  const brandX = LM + 40;
  doc.fillColor('#ffffff').font('Bold').fontSize(20);
  doc.text('Shri Balaji', brandX, 6, { lineBreak: false });
  doc.fillColor(accentColor).font('Regular').fontSize(7);
  const clinicSubtitle = pick(settings, 'clinic', 'subtitle', 'Advanced Dental Care & Implant Center');
  doc.text(clinicSubtitle.toUpperCase(), brandX, 28, { lineBreak: false, ellipsis: true });

  // Right: Dental Chart title + patient info
  const rightX = LM + RW - 210;
  doc.fillColor('#ffffff').font('Bold').fontSize(13);
  doc.text('Dental Chart', rightX, 7, { width: 210, align: 'right', lineBreak: false });
  doc.fillColor(accentColor).font('Regular').fontSize(9);
  const dateStr = appointment?.date ? new Date(appointment.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
  doc.text(`${patient?.name || 'Patient'} | ${patient?.age || ''}${patient?.age && patient?.sex ? '/' : ''}${patient?.sex || ''} | ${dateStr}`, rightX, 24, { width: 210, align: 'right', lineBreak: false });

  // Contact bar
  const barY = 52;
  doc.opacity(0.75);
  doc.rect(0, barY, PW, 14).fill(primaryColor);
  doc.opacity(1);
  doc.fillColor('#e6eef7').font('Regular').fontSize(7);
  const phoneDigits = String(CLINIC.phone || '9111594782').replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');
  const doctorLabel = `DR. ${(CLINIC.doctor?.name || 'M. VISHNU VARDHAN').replace(/^Dr\.\s*/i, '').toUpperCase()}`;
  const clinicEmail = pick(settings, 'clinic', 'email', 'shribalajiadc@gmail.com');
  doc.text(`${doctorLabel}  |  +91-${phoneDigits}  |  ${clinicEmail}`, LM, barY + 4, { lineBreak: false });

  // Watermark
  const showWatermark = pick(settings, 'prescription', 'show_watermark', true);
  const watermarkText = pick(settings, 'prescription', 'watermark_text', 'Shri Balaji');
  if (showWatermark && watermarkText) {
    doc.save();
    doc.opacity(0.06);
    try {
      doc.image(logoPath, (PW - 200) / 2, 180, { width: 200 });
    } catch {
      // logo not available, skip image watermark
    }
    doc.fontSize(28).font('Bold').fillColor(primaryColor);
    doc.text(watermarkText, 0, 460, { width: PW, align: 'center' });
    doc.restore();
  }

  function parseToothDiagnoses(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') try { return JSON.parse(raw); } catch { return []; }
    return [];
  }

  // Tooth data map
  const toothMap = {};
  const toothDiagnoses = parseToothDiagnoses(visit?.tooth_diagnoses);
  for (const td of toothDiagnoses) {
    toothMap[td.tooth] = td;
  }

  const DIAG_COLORS = {
    'Caries': '#f59e0b',
    'Deep caries': '#ef4444',
    'Pocket': '#8b5cf6',
    'Periodontitis': '#7c3aed',
    'Periapical Abscess': '#dc2626',
    'Grossly Decayed': '#991b1b',
    'Missing': '#6b7280',
    'Mobility': '#f97316',
    'Lesion': '#ec4899',
    'Impacted': '#14b8a6',
    'Fractured Tooth / Cusp': '#f43f5e',
    'Gingivitis': '#22c55e',
    'Calculus': '#94a3b8',
    'Stains': '#d4d4d8',
    'Abrasion / Attrition / Erosion': '#a855f7',
    'Irregular Teeth': '#0ea5e9',
  };

  function toothColor(diagnoses) {
    if (!diagnoses?.length) return null;
    return DIAG_COLORS[diagnoses[0]] || '#3b82f6';
  }

  const UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
  const LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

  // Draw teeth
  const startY = 80;
  const cellW = (RW) / 16;
  const cellH = 42;
  const gap = 1;

  const MOLAR_PATH = `M6 5c1.5-1.5 3-1.5 4.5 0 1-1 2-1 3 0 1.5-1.5 3-1.5 4.5 0 1.5 1.5 2 3 2 4.5v2.5c0 3-1.5 4.5-2.5 6l-1.5 4a1 1 0 0 1-1.9.2L12 16.5l-2.1 5.7a1 1 0 0 1-1.9-.2l-1.5-4C5.5 16.5 4 15 4 12V9.5C4 8 4.5 6.5 6 5Z`;
  const PREMOLAR_PATH = `M7.5 4c2-1 3.5-1 4.5 1 1-2 2.5-2 4.5-1 1.5.8 2 2 2 3.5v3.5c0 3.5-1 5-2 7l-1.5 3.5a1 1 0 0 1-1.8 0L12 18l-1.2 3.5a1 1 0 0 1-1.8 0L7.5 18C6.5 16 5.5 14.5 5.5 11V7.5c0-1.5.5-2.7 2-3.5Z`;
  const CANINE_PATH = `M12 2l4 4.5v3.5c0 3.5-1.5 6-3 8l-2.5 3.5a1 1 0 0 1-1.6 0L6.5 18C5 16 3.5 13.5 3.5 10V6.5L12 2Z`;
  const INCISOR_PATH = `M7 4h10c1.1 0 2 .9 2 2v4c0 3.5-1.5 6-3 8l-2.5 3.5a1 1 0 0 1-1.6 0L9.5 18C8 16 6.5 13.5 6.5 10V6c0-1.1.9-2 2-2Z`;

  function toothPath(num) {
    const pos = num % 10;
    const t = (pos >= 6 || pos === 0) ? 'molar' : (pos === 4 || pos === 5) ? 'premolar' : (pos === 3) ? 'canine' : 'incisor';
    if (t === 'molar') return MOLAR_PATH;
    if (t === 'premolar') return PREMOLAR_PATH;
    if (t === 'canine') return CANINE_PATH;
    return INCISOR_PATH;
  }

  function drawRow(teeth, y, label) {
    doc.fontSize(7).font('Bold').fillColor(primaryColor);
    doc.text(label, LM - 14, y + 6, { lineBreak: false });

    for (let i = 0; i < teeth.length; i++) {
      const num = teeth[i];
      const entry = toothMap[num];
      const diagnoses = entry?.diagnoses || [];
      const isMissing = diagnoses.includes('Missing');
      const color = toothColor(diagnoses);
      const path = toothPath(num);
      const x = LM + i * cellW;

      // Cell background
      if (color && !isMissing) {
        doc.opacity(0.12);
        doc.rect(x, y, cellW - gap, cellH).fill(color);
        doc.opacity(1);
      }
      if (entry?.severity === 'severe' && color && !isMissing) {
        doc.opacity(0.2);
        doc.rect(x, y, cellW - gap, cellH).fill(color);
        doc.opacity(1);
      }

      // Tooth outline
      const svgW = cellW - gap - 6;
      const svgH = cellH - 10;
      const scale = Math.min(svgW / 24, svgH / 24);
      const ox = x + (cellW - gap - 24 * scale) / 2;
      const oy = y + 2;

      doc.save();
      doc.translate(ox, oy);
      doc.scale(scale);

      // Fill
      if (!isMissing) {
        doc.path(path).fill('#f9fafb', 1);
      }

      // Stroke
      const strokeColor = color || '#9ca3af';
      doc.path(path).lineWidth(isMissing ? 0.6 : 0.4).strokeColor(strokeColor).stroke();

      // Cross for missing
      if (isMissing) {
        doc.lineWidth(0.6).strokeColor('#ef4444');
        doc.moveTo(5, 4).lineTo(19, 22).stroke();
        doc.moveTo(19, 4).lineTo(5, 22).stroke();
      }

      doc.restore();

      // Tooth number
      doc.fontSize(5).font('Bold').fillColor(isMissing ? '#ef4444' : '#374151');
      doc.text(String(num), x + (cellW - gap) / 2, y + cellH - 7, { width: cellW - gap, align: 'center' });

      // Treatment label
      if (entry?.treatment && !isMissing) {
        doc.fontSize(4.5).fillColor('#059669');
        doc.text(getTreatmentName(entry.treatment), x + (cellW - gap) / 2, y - 7, { width: cellW - gap, align: 'center' });
      }
    }
  }

  // Upper jaw label
  doc.fontSize(8).font('Bold').fillColor('#9ca3af');
  doc.text('UPPER', LM, startY - 12, { lineBreak: false });
  doc.text('UR', LM + 30, startY - 12, { lineBreak: false });
  doc.text('UL', LM + RW - 30, startY - 12, { lineBreak: false });

  drawRow(UPPER, startY, 'UR');

  // Separator
  const sepY = startY + cellH + 14;
  doc.opacity(0.3);
  doc.moveTo(LM, sepY).lineTo(LM + RW, sepY).stroke('#cccccc').opacity(1);

  // Lower jaw label
  doc.fillColor('#9ca3af').fontSize(8).font('Bold');
  doc.text('LOWER', LM, sepY + 8, { lineBreak: false });
  doc.text('LR', LM + 30, sepY + 8, { lineBreak: false });
  doc.text('LL', LM + RW - 30, sepY + 8, { lineBreak: false });

  drawRow(LOWER, sepY + 18, 'LR');

  // ─── Legend ───
  const legendY = Math.max(sepY + cellH + 40, 350);
  doc.opacity(0.5);
  doc.moveTo(LM, legendY).lineTo(LM + RW, legendY).stroke('#cccccc').opacity(1);

  doc.fontSize(8).font('Bold').fillColor(primaryColor);
  doc.text('Legend:', LM, legendY + 8, { lineBreak: false });

  const legendColors = Object.entries(DIAG_COLORS);
  let lx = LM;
  let ly = legendY + 20;
  for (const [name, hex] of legendColors) {
    const label = `${name}`;
    doc.opacity(0.6);
    doc.rect(lx, ly, 6, 6).fill(hex);
    doc.opacity(1);
    doc.fontSize(6).font('Regular').fillColor('#374151');
    doc.text(label, lx + 9, ly, { lineBreak: false });
    const w = doc.widthOfString(label) + 20;
    lx += w;
    if (lx + 80 > LM + RW) {
      lx = LM;
      ly += 12;
    }
  }

  // Treatment and status legend
  const statusY = ly + 16;
  doc.fontSize(7).font('Regular').fillColor('#059669');
  doc.text('Treatment shown above tooth', LM, statusY, { lineBreak: false });
  doc.fillColor('#ef4444').fontSize(6);
  doc.text('X = Missing', LM + 110, statusY, { lineBreak: false });

  // Border
  doc.rect(8, 8, PW - 16, PH - 16).strokeColor(primaryColor).lineWidth(0.5).stroke().strokeColor('#000000');

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(buffers);
      const key = `charts/${appointment?.id || Date.now()}_${Date.now()}.pdf`;
      const uploaded = await uploadToR2({ key, buffer: pdfBuffer, contentType: 'application/pdf' });
      if (uploaded) {
        const signedUrl = await getR2SignedUrl(key, 604800);
        resolve({ buffer: pdfBuffer, key, url: signedUrl });
      } else {
        resolve({ buffer: pdfBuffer, key: null, url: null });
      }
    });
    doc.on('error', (err) => {
      logger.error('CHART_GENERATION_ERROR', { error: err.message });
      reject(err);
    });
  });
}
