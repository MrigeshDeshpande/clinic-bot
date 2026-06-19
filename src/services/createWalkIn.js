import { findPatientByPhone, findPatientById, createPatient, updatePatient } from '@/db/repositories/patientRepository';
import { recordPayment } from './recordPayment';
import { logger } from '@/lib/logger';
import { createPlanWithSteps } from './treatmentPlanService';

export async function createWalkIn(sql, body) {
  const {
    patient_id,
    patient_name, patient_phone, patient_age, patient_sex, patient_location,
    treatment, treatments, treatmentFees, diagnosis, medicines,
    consultationFee, treatmentCharges, medicineCharges, notes,
    followUpDate, followUpInstructions, advice_selected, diagnosis_selected,
    tooth_diagnoses, paymentStatus, paymentMethod, paidAmount,
    chiefComplaint, generalExamination, extraOralExamination,
    date, time,
    procedureCodeId, toothNumber,
  } = body;

  if (!patient_name) {
    throw Object.assign(new Error('patient_name required'), { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const consFee = Number(consultationFee) || 0;
  const treatFee = Number(treatmentCharges) || 0;
  const medFee = Number(medicineCharges) || 0;

  const normalizedSex = (() => {
    if (!patient_sex) return patient_sex;
    const s = patient_sex.toLowerCase();
    if (s === 'm' || s === 'male') return 'Male';
    if (s === 'f' || s === 'female') return 'Female';
    if (s === 'o' || s === 'other') return 'Other';
    return patient_sex.charAt(0).toUpperCase() + patient_sex.slice(1);
  })();

  let normalizedPhone = patient_phone?.replace(/\D/g, '') || null;

  let patientId = null;
  let resolvedPhone = normalizedPhone;
  if (patient_id) {
    patientId = patient_id;
    const patient = await findPatientById(patient_id);
    if (patient?.wa_id) {
      resolvedPhone = patient.wa_id.replace(/\D/g, '');
    }
  } else if (normalizedPhone) {
    const existing = await findPatientByPhone(normalizedPhone);
    if (existing) {
      patientId = existing.id;
      resolvedPhone = existing.wa_id?.replace(/\D/g, '') || normalizedPhone;
      const updateFields = {};
      if (patient_age && (!existing.age || existing.age !== patient_age)) updateFields.age = patient_age;
      if (normalizedSex && (!existing.sex || existing.sex !== normalizedSex)) updateFields.sex = normalizedSex;
      if (patient_location && existing.location !== patient_location) updateFields.location = patient_location;
      if (Object.keys(updateFields).length > 0) {
        await updatePatient(patientId, updateFields);
      }
    } else {
      const created = await createPatient({
        name: patient_name,
        age: patient_age,
        sex: normalizedSex,
        phone: normalizedPhone,
        waId: normalizedPhone,
        location: patient_location,
      });
      if (created) patientId = created.id;
    }
  }

  const paidAmt = paidAmount !== undefined ? (parseInt(paidAmount, 10) || 0) : 0;
  const totalFees = consFee + treatFee + medFee;
  let pStatus = paymentStatus || 'pending';
  if (paidAmt > 0 && paidAmt < totalFees) pStatus = 'partial';
  else if (paidAmt >= totalFees) pStatus = 'paid';
  const pMethod = pStatus === 'paid' || pStatus === 'partial' ? (paymentMethod || 'cash') : null;
  const paidAt = pStatus === 'paid' || pStatus === 'partial' ? new Date() : null;

  const [appointment] = await sql`
    INSERT INTO appointments (
      logical_id, version, wa_id, patient_name, patient_phone, patient_id,
      date, time, treatment, treatments, status,
      consultation_fee, treatment_charges, medicine_charges,
      treatment_fees,
      diagnosis, medicines, notes, follow_up_date, follow_up_instructions, advice_selected, diagnosis_selected,
      tooth_diagnoses,
      arrival_status,
      payment_status, payment_method, paid_at, paid_amount,
      chief_complaint, general_examination, extra_oral_examination
    ) VALUES (
      gen_random_uuid(), 1, ${resolvedPhone}, ${patient_name}, ${resolvedPhone}, ${patientId},
      ${date || today}, ${time || null}, ${treatment || 'Walk-in'}, ${treatments || []}, 'completed',
      ${consFee}, ${treatFee}, ${medFee},
      ${treatmentFees || {}},
      ${diagnosis || ''}, ${medicines || []}, ${notes || ''},
      ${followUpDate || null}, ${followUpInstructions || ''},
      ${advice_selected || []}, ${diagnosis_selected || []},
      ${tooth_diagnoses || []},
      'arrived',
      ${pStatus}, ${pMethod}, ${paidAt}, ${paidAmt},
      ${chiefComplaint || ''}, ${generalExamination || ''}, ${extraOralExamination || ''}
    )
    RETURNING *
  `;

  if (procedureCodeId && appointment.patient_id) {
    try {
      // Timeline Event Candidate: Plan Created (walk-in)
      await createPlanWithSteps({
        patientId: appointment.patient_id,
        procedureCodeId,
        toothNumber,
        source: 'reception',
      }, sql);
    } catch (planErr) {
      logger.warn('PLAN_CREATE_FAILED', {
        patientId: appointment.patient_id,
        procedureCodeId,
        error: planErr.message,
        stack: planErr.stack,
      });
    }
  }

  if (paidAmt > 0) {
    await recordPayment(sql, {
      appointmentId: appointment.id,
      paidAmount: paidAmt,
      method: pMethod,
    });
  }

  return { appointment, patient_name, treatment: treatment || 'Walk-in', fees: consFee + treatFee + medFee };
}
