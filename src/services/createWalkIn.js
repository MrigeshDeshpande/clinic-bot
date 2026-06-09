import { findPatientByPhone, createPatient, updatePatient } from '@/db/repositories/patientRepository';
import { recordPayment } from './recordPayment';

export async function createWalkIn(sql, body) {
  const {
    patient_name, patient_phone, patient_age, patient_sex, patient_location,
    treatment, treatments, diagnosis, medicines,
    consultationFee, treatmentCharges, medicineCharges, notes,
    followUpDate, followUpInstructions, advice_selected, diagnosis_selected,
    tooth_diagnoses, paymentStatus, paymentMethod, paidAmount,
    chiefComplaint, generalExamination, extraOralExamination,
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

  let patientId = null;
  if (patient_phone) {
    const existing = await findPatientByPhone(patient_phone);
    if (existing) {
      patientId = existing.id;
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
        phone: patient_phone,
        waId: patient_phone,
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
      diagnosis, medicines, notes, follow_up_date, follow_up_instructions, advice_selected, diagnosis_selected,
      tooth_diagnoses,
      arrival_status,
      payment_status, payment_method, paid_at, paid_amount,
      chief_complaint, general_examination, extra_oral_examination
    ) VALUES (
      gen_random_uuid(), 1, ${patient_phone || null}, ${patient_name}, ${patient_phone || null}, ${patientId},
      ${today}, NULL, ${treatment || 'Walk-in'}, ${JSON.stringify(treatments || [])}, 'completed',
      ${consFee}, ${treatFee}, ${medFee},
      ${diagnosis || ''}, ${JSON.stringify(medicines || [])}, ${notes || ''},
      ${followUpDate || null}, ${followUpInstructions || ''},
      ${advice_selected || []}, ${diagnosis_selected || []},
      ${JSON.stringify(tooth_diagnoses || [])},
      'arrived',
      ${pStatus}, ${pMethod}, ${paidAt}, ${paidAmt},
      ${chiefComplaint || ''}, ${generalExamination || ''}, ${extraOralExamination || ''}
    )
    RETURNING *
  `;

  if (paidAmt > 0) {
    await recordPayment(sql, {
      appointmentId: appointment.id,
      paidAmount: paidAmt,
      method: pMethod,
    });
  }

  return { appointment, patient_name, treatment: treatment || 'Walk-in', fees: consFee + treatFee + medFee };
}
