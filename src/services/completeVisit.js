import { toPgTextArray } from '@/lib/pgArray';

export async function completeVisit(sql, body) {
  const {
    appointmentId, treatment, treatments, tooth_diagnoses, diagnosis, medicines,
    consultationFee, treatmentCharges, medicineCharges, notes,
    followUpDate, followUpInstructions, advice_selected, diagnosis_selected,
    status: newStatus, paymentStatus, paymentMethod, transactionId, paidAmount,
    chiefComplaint, generalExamination, extraOralExamination,
  } = body;

  if (!appointmentId) throw new Error('appointmentId required');

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

  if (setClauses.length === 0) {
    throw Object.assign(new Error('No fields to update'), { status: 400 });
  }

  setClauses.push('prescription_key = NULL', 'compiled_document_key = NULL', 'updated_at = NOW()');
  params.push(appointmentId);

  const isCompletion = newStatus === 'completed';
  const whereClause = isCompletion
    ? `WHERE id = $${p} AND status = 'confirmed'`
    : `WHERE id = $${p} AND status NOT IN ('cancelled', 'no_show', 'superseded')`;

  const txQueries = [];
  txQueries.push(sql.query(
    `UPDATE appointments SET ${setClauses.join(', ')} ${whereClause} RETURNING id, patient_id`,
    params
  ));

  if (isCompletion) {
    const paidAmt = paidAmount !== undefined ? (parseInt(paidAmount, 10) || 0) : 0;
    if (paidAmt > 0) {
      txQueries.push(sql`
        WITH inserted AS (
          INSERT INTO payments (appointment_id, patient_id, amount, direction, kind, method, notes, recorded_by)
          SELECT ${appointmentId}, a.patient_id, ${paidAmt}, 'credit', 'payment', ${paymentMethod || null}, NULL, 'reception'
          FROM appointments a
          WHERE a.id = ${appointmentId} AND a.status = 'completed'
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING *
        ),
        net AS (
          SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0) AS amount
          FROM payments WHERE appointment_id = ${appointmentId}
        ),
        sync AS (
          UPDATE appointments a SET
            paid_amount = net.amount,
            payment_status = CASE
              WHEN net.amount >= a.consultation_fee + a.treatment_charges + a.medicine_charges THEN 'paid'
              WHEN net.amount > 0 THEN 'partial' ELSE 'pending'
            END,
            paid_at = CASE WHEN net.amount > 0 THEN COALESCE(a.paid_at, NOW()) ELSE NULL END,
            payment_method = ${paymentMethod || null}
          FROM net
          WHERE a.id = ${appointmentId}
          RETURNING a.id
        )
        SELECT (SELECT row_to_json(inserted.*) FROM inserted) AS payment
      `);
    }
  }

  const results = await sql.transaction(txQueries);
  const updateResult = results[0];

  if (updateResult.rowCount === 0) {
    const errorMsg = isCompletion
      ? 'Appointment already completed or not found'
      : 'Appointment not found or cannot be edited';
    throw Object.assign(new Error(errorMsg), { status: 400 });
  }

  const [appointment] = await sql`
    SELECT id, logical_id, wa_id, patient_name, patient_id, date, time, treatment,
           treatments, diagnosis, medicines, consultation_fee, treatment_charges, medicine_charges,
           notes, follow_up_date, follow_up_instructions, advice_selected, diagnosis_selected, tooth_diagnoses, prescription_key,
           chief_complaint, general_examination, extra_oral_examination,
           status, arrival_status, arrived_at, payment_status, payment_method, transaction_id, paid_amount, paid_at,
           created_at, updated_at
    FROM appointments WHERE id = ${appointmentId}
  `;
  return appointment;
}
