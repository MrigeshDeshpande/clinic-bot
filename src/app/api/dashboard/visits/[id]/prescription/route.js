import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { getR2SignedUrl } from '@/lib/r2';
import { generatePrescription } from '@/lib/prescription';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, jsonError } from '@/lib/apiAuth';

export async function POST(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();
    const { id } = await params;

    // Fetch appointment with patient data
    const rows = await sql`
      SELECT a.id, a.logical_id, a.wa_id, a.patient_name, a.patient_phone,
             a.patient_id, a.date, a.treatment, a.treatments,
             a.consultation_fee, a.treatment_charges, a.medicine_charges,
             a.diagnosis, a.medicines, a.notes, a.advice_selected, a.diagnosis_selected,
             a.follow_up_date, a.follow_up_instructions,
             a.prescription_key,
             p.name AS p_name, p.age AS p_age, p.sex AS p_sex
      FROM appointments a
      LEFT JOIN patients p ON p.id = a.patient_id
      WHERE a.id = ${id}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    const a = rows[0];

    logger.info('PRESCRIPTION_DEBUG', { id, treatment: a.treatment, prescription_key: a.prescription_key, patient_name: a.patient_name });

    // Return cached prescription if it exists
    if (a.prescription_key) {
      const cachedUrl = await getR2SignedUrl(a.prescription_key, 604800);
      if (cachedUrl) {
        return NextResponse.json({ key: a.prescription_key, url: cachedUrl, existing: true });
      }
    }

    const patient = {
      name: a.p_name || a.patient_name,
      phone: a.patient_phone,
      age: a.p_age,
      sex: a.p_sex,
    };

    const visit = {
      treatment: a.treatment,
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
    };

    const result = await generatePrescription({ patient, visit, appointment });

    if (!result || !result.key) {
      return NextResponse.json({ error: 'Failed to generate prescription' }, { status: 500 });
    }

    // Persist the key
    await sql`
      UPDATE appointments SET prescription_key = ${result.key}, updated_at = NOW()
      WHERE id = ${id}
    `;

    logger.info('PRESCRIPTION_GENERATED_DASHBOARD', { appointmentId: id, key: result.key });
    return NextResponse.json({ key: result.key, url: result.url, existing: false });
  } catch (error) {
    logger.error('PRESCRIPTION_GENERATE_DASHBOARD_ERROR', {
      error: error.message,
      stack: error.stack,
      name: error.name,
    });
    return NextResponse.json(
      { error: error.message || 'Prescription generation failed' },
      { status: 500 },
    );
  }
}
