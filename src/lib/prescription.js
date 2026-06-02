import PDFDocument from 'pdfkit';
import { uploadToR2, getR2SignedUrl } from '@/lib/r2';
import { CLINIC } from '@/config/clinic';
import { logger } from '@/lib/logger';

export async function generatePrescription({ patient, visit, appointment }) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: `Prescription - ${patient.name}`,
      Author: CLINIC.doctor?.name || CLINIC.name,
      Subject: 'Dental Prescription',
    },
  });

  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));
  doc.on('end', () => {});

  const leftMargin = 50;
  let y = 50;

  // Clinic header
  doc.fontSize(18).font('Helvetica-Bold');
  doc.text(CLINIC.name, leftMargin, y);
  y += 22;
  doc.fontSize(9).font('Helvetica');
  doc.text(CLINIC.address, leftMargin, y, { width: 350 });
  y += 14;
  doc.text(`Phone: ${CLINIC.phone}`, leftMargin, y);
  y += 14;

  if (CLINIC.doctor?.name) {
    doc.text(`Doctor: ${CLINIC.doctor.name}`, leftMargin, y);
    y += 14;
  }

  // Horizontal line
  y += 6;
  doc.moveTo(leftMargin, y).lineTo(545, y).stroke('#cccccc');
  y += 20;

  // Prescription title
  doc.fontSize(14).font('Helvetica-Bold');
  doc.text('PRESCRIPTION', leftMargin, y);
  y += 24;

  // Patient info box
  const boxX = leftMargin;
  const boxY = y;
  const boxW = 495;
  const boxH = 65;
  doc.rect(boxX, boxY, boxW, boxH).stroke('#dddddd');
  y += 10;

  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Patient:', leftMargin + 10, y);
  doc.font('Helvetica');
  doc.text(patient.name || 'N/A', leftMargin + 65, y);
  y += 16;

  doc.font('Helvetica-Bold');
  doc.text('Age/Sex:', leftMargin + 10, y);
  doc.font('Helvetica');
  const ageSex = [patient.age || '', patient.sex || ''].filter(Boolean).join(' / ') || 'N/A';
  doc.text(ageSex, leftMargin + 65, y);
  y += 16;

  doc.font('Helvetica-Bold');
  doc.text('Phone:', leftMargin + 10, y);
  doc.font('Helvetica');
  doc.text(patient.phone || 'N/A', leftMargin + 65, y);
  y += 16;

  doc.font('Helvetica-Bold');
  doc.text('Date:', leftMargin + 10, y);
  doc.font('Helvetica');
  doc.text(appointment?.date || new Date().toISOString().slice(0, 10), leftMargin + 65, y);
  y += 5;

  y = boxY + boxH + 20;

  // Treatment
  doc.fontSize(11).font('Helvetica-Bold');
  doc.text('Treatment:', leftMargin, y);
  y += 16;
  doc.fontSize(10).font('Helvetica');
  const treatmentText = visit?.treatment || appointment?.treatment || 'N/A';
  doc.text(treatmentText, leftMargin + 10, y);
  y += 20;

  // Fees
  doc.fontSize(11).font('Helvetica-Bold');
  doc.text('Fees:', leftMargin, y);
  y += 16;

  const feeItems = [
    { label: 'Consultation Fee', amount: visit?.consultationFee || 0 },
    { label: 'Treatment Charges', amount: visit?.treatmentCharges || 0 },
    { label: 'Medicine Charges', amount: visit?.medicineCharges || 0 },
  ];

  doc.fontSize(10).font('Helvetica');
  for (const item of feeItems) {
    if (item.amount > 0) {
      doc.text(`${item.label}:`, leftMargin + 10, y);
      doc.text(`Rs. ${item.amount}`, leftMargin + 350, y, { align: 'right', width: 100 });
      y += 16;
    }
  }

  const total = (visit?.consultationFee || 0) + (visit?.treatmentCharges || 0) + (visit?.medicineCharges || 0);
  if (total > 0) {
    doc.moveTo(leftMargin + 10, y).lineTo(495, y).stroke('#cccccc');
    y += 8;
    doc.font('Helvetica-Bold');
    doc.text('Total:', leftMargin + 10, y);
    doc.text(`Rs. ${total}`, leftMargin + 350, y, { align: 'right', width: 100 });
    y += 20;
  }

  // Next visit
  if (visit?.nextVisit?.date) {
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('Next Visit:', leftMargin, y);
    y += 16;
    doc.fontSize(10).font('Helvetica');
    let nextStr = visit.nextVisit.date;
    if (visit.nextVisit.time) nextStr += ` at ${visit.nextVisit.time}`;
    doc.text(nextStr, leftMargin + 10, y);
    y += 20;
  }

  // Notes / Instructions
  if (visit?.notes) {
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('Notes / Instructions:', leftMargin, y);
    y += 16;
    doc.fontSize(10).font('Helvetica');
    doc.text(visit.notes, leftMargin + 10, y, { width: 450, align: 'left' });
    y += 20;
  }

  // Doctor signature
  y = Math.max(y + 30, 620);
  doc.moveTo(leftMargin + 300, y).lineTo(495, y).stroke('#cccccc');
  y += 12;
  doc.fontSize(9).font('Helvetica');
  doc.text(CLINIC.doctor?.name || 'Doctor', leftMargin + 300, y, { align: 'right', width: 195 });

  // Footer
  y = 780;
  doc.fontSize(7).font('Helvetica');
  doc.fillColor('#999999');
  doc.text('This is a computer-generated prescription.', leftMargin, y, { align: 'center', width: 495 });
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
