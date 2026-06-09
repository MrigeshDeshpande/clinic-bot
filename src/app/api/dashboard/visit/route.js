import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { findPatientByPhone, createPatient, updatePatient } from '@/db/repositories/patientRepository';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError, sanitizeResponse } from '@/lib/apiAuth';

/** Convert a JS array to a PostgreSQL text[] array literal. */
function toPgTextArray(arr) {
  if (!Array.isArray(arr)) return arr || null;
  const items = arr.map(a => {
    const s = String(a);
    // Escape backslashes and double-quotes inside each element
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  });
  return `{${items.join(',')}}`;
}

export async function POST(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const sizeErr = checkBodySize(req);
  if (sizeErr) return sizeErr;
  try {
    const sql = getSql();
    const body = await req.json();
    const { appointmentId, treatment, treatments, tooth_diagnoses, diagnosis, medicines, consultationFee, treatmentCharges, medicineCharges, notes, followUpDate, followUpInstructions, advice_selected, diagnosis_selected, status: newStatus, paymentStatus, paymentMethod, transactionId, paidAmount, patient_age, patient_sex, patient_location, chiefComplaint, generalExamination, extraOralExamination } = body;

    // ── Update existing appointment ──
    if (appointmentId) {
      // Build SET clause manually — @neondatabase/serverless does not support sql.join
      const setClauses = [];
      const params = [];
      let p = 1;

      if (treatment !== undefined) {
        setClauses.push(`treatment = $${p++}`);
        params.push(treatment);
      }
      if (treatments !== undefined) {
        setClauses.push(`treatments = $${p++}`);
        params.push(JSON.stringify(treatments));
      }
      if (diagnosis !== undefined) {
        setClauses.push(`diagnosis = $${p++}`);
        params.push(diagnosis);
      }
      if (medicines !== undefined) {
        setClauses.push(`medicines = $${p++}`);
        params.push(JSON.stringify(medicines));
      }
      if (consultationFee !== undefined) {
        setClauses.push(`consultation_fee = $${p++}`);
        params.push(parseInt(consultationFee, 10) || 0);
      }
      if (treatmentCharges !== undefined) {
        setClauses.push(`treatment_charges = $${p++}`);
        params.push(parseInt(treatmentCharges, 10) || 0);
      }
      if (medicineCharges !== undefined) {
        setClauses.push(`medicine_charges = $${p++}`);
        params.push(parseInt(medicineCharges, 10) || 0);
      }
      if (notes !== undefined) {
        setClauses.push(`notes = $${p++}`);
        params.push(notes);
      }
      if (followUpDate !== undefined) {
        setClauses.push(`follow_up_date = $${p++}`);
        params.push(followUpDate || null);
      }
      if (followUpInstructions !== undefined) {
        setClauses.push(`follow_up_instructions = $${p++}`);
        params.push(followUpInstructions);
      }
      if (advice_selected !== undefined) {
        setClauses.push(`advice_selected = $${p++}`);
        params.push(toPgTextArray(advice_selected));
      }
      if (diagnosis_selected !== undefined) {
        setClauses.push(`diagnosis_selected = $${p++}`);
        params.push(toPgTextArray(diagnosis_selected));
      }
      if (chiefComplaint !== undefined) {
        setClauses.push(`chief_complaint = $${p++}`);
        params.push(chiefComplaint);
      }
      if (generalExamination !== undefined) {
        setClauses.push(`general_examination = $${p++}`);
        params.push(generalExamination);
      }
      if (extraOralExamination !== undefined) {
        setClauses.push(`extra_oral_examination = $${p++}`);
        params.push(extraOralExamination);
      }
      if (tooth_diagnoses !== undefined) {
        setClauses.push(`tooth_diagnoses = $${p++}`);
        params.push(JSON.stringify(tooth_diagnoses));
      }
      if (newStatus !== undefined) {
        setClauses.push(`status = $${p++}`);
        params.push(newStatus);
      }
      if (paidAmount !== undefined) {
        setClauses.push(`paid_amount = $${p++}`);
        params.push(parseInt(paidAmount, 10) || 0);
      }
      if (paymentStatus !== undefined) {
        const cons = parseInt(consultationFee, 10) || 0;
        const treat = parseInt(treatmentCharges, 10) || 0;
        const med = parseInt(medicineCharges, 10) || 0;
        const total = cons + treat + med;
        const amt = paidAmount !== undefined ? (parseInt(paidAmount, 10) || 0) : 0;
        let status = paymentStatus;
        if (amt > 0 && amt < total) status = 'partial';
        else if (amt >= total) status = 'paid';
        setClauses.push(`payment_status = $${p++}`);
        params.push(status);
        if (status === 'paid' || status === 'partial') {
          setClauses.push(`paid_at = COALESCE(paid_at, NOW())`);
        }
      }
      if (paymentMethod !== undefined) {
        setClauses.push(`payment_method = $${p++}`);
        params.push(paymentMethod);
      }
      if (transactionId !== undefined) {
        setClauses.push(`transaction_id = $${p++}`);
        params.push(transactionId);
      }

      if (setClauses.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

      setClauses.push(`prescription_key = NULL`, `compiled_document_key = NULL`, `updated_at = NOW()`);
      params.push(appointmentId);

      const result = await sql.query(`UPDATE appointments SET ${setClauses.join(', ')} WHERE id = $${p} AND status NOT IN ('cancelled', 'no_show', 'superseded') RETURNING id`, params);
      if (result.rowCount === 0) {
        return NextResponse.json({ error: 'Appointment not found or cannot be edited' }, { status: 400 });
      }

      const updated = await sql`
         SELECT id, logical_id, wa_id, patient_name, patient_id, date, time, treatment,
                treatments, diagnosis, medicines, consultation_fee, treatment_charges, medicine_charges,
                notes, follow_up_date, follow_up_instructions, advice_selected, diagnosis_selected, tooth_diagnoses, prescription_key,
                chief_complaint, general_examination, extra_oral_examination,
               status, arrival_status, arrived_at, payment_status, payment_method, transaction_id, paid_amount, paid_at,
               created_at, updated_at
        FROM appointments WHERE id = ${appointmentId}
      `;
      return NextResponse.json({ appointment: sanitizeResponse(updated[0] || null) });
    }

    // ── Standalone walk-in visit creation ──
    const { patient_name, patient_phone } = body;
    if (!patient_name) return NextResponse.json({ error: 'patient_name required' }, { status: 400 });

    const today = new Date().toISOString().slice(0, 10);
    const consFee = Number(consultationFee) || 0;
    const treatFee = Number(treatmentCharges) || 0;
    const medFee = Number(medicineCharges) || 0;

    // Normalize sex value
    const normalizedSex = (() => {
      if (!patient_sex) return patient_sex;
      const s = patient_sex.toLowerCase();
      if (s === 'm' || s === 'male') return 'Male';
      if (s === 'f' || s === 'female') return 'Female';
      if (s === 'o' || s === 'other') return 'Other';
      return patient_sex.charAt(0).toUpperCase() + patient_sex.slice(1);
    })();

    // Find or create patient record so walk-ins appear in the Patients list
    let patientId = null;
    if (patient_phone) {
      const existing = await findPatientByPhone(patient_phone);
      if (existing) {
        patientId = existing.id;
        // Update age/sex if provided and different
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
    const txnId = transactionId || null;
    const paidAt = pStatus === 'paid' || pStatus === 'partial' ? new Date() : null;

    const rows = await sql`
      INSERT INTO appointments (
        logical_id, version, wa_id, patient_name, patient_phone, patient_id,
        date, time, treatment, treatments, status,
        consultation_fee, treatment_charges, medicine_charges,
        diagnosis, medicines, notes, follow_up_date, follow_up_instructions, advice_selected, diagnosis_selected,
        tooth_diagnoses,
        arrival_status,
        payment_status, payment_method, transaction_id, paid_at, paid_amount,
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
        ${pStatus}, ${pMethod}, ${txnId}, ${paidAt}, ${paidAmt},
        ${chiefComplaint || ''}, ${generalExamination || ''}, ${extraOralExamination || ''}
      )
      RETURNING *
    `;

    return NextResponse.json({ appointment: sanitizeResponse(rows[0]), patient_name, treatment: treatment || 'Walk-in', fees: consFee + treatFee + medFee });
  } catch (error) {
    logger.error('DASHBOARD_VISIT_ERROR', { error: error.message });
    return jsonError(error);
  }
}
