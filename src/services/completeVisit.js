import { toPgTextArray } from '@/lib/pgArray';
import { VISIT_MODES } from '@/lib/visitModes';
import { logger } from '@/lib/logger';
import { completeVisitSteps } from './treatmentPlanService';
import { recordVisitCompleted, recordFollowupCreated, recordFollowupCancelled, recordPaymentReceived } from './timelineService';
import { ACTOR_TYPES } from '@/lib/timelineEvents';

export async function completeVisit(sql, body) {
  const {
    appointmentId, treatment, treatments, treatmentFees, tooth_diagnoses, diagnosis, medicines,
    consultationFee, treatmentCharges, medicineCharges, notes,
    followUpDate, followUpInstructions, advice_selected, diagnosis_selected,
    status: newStatus, paymentStatus, paymentMethod, transactionId, paidAmount,
    chiefComplaint, generalExamination, extraOralExamination,
    mode,
    stepIds,
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
  if (treatmentFees !== undefined) {
    setClauses.push(`treatment_fees = $${p++}`);
    params.push(JSON.stringify(treatmentFees));
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
    if (followUpDate) {
      // Timeline Event Candidate: Follow-up Created
      setClauses.push(`follow_up_status = $${p++}`);
      params.push('pending');
    } else {
      // Timeline Event Candidate: Follow-up Cancelled
      setClauses.push(`follow_up_status = $${p++}`);
      params.push('cancelled');
    }
  }
  if (followUpInstructions !== undefined) {
    setClauses.push(`follow_up_instructions = $${p++}`);
    params.push(followUpInstructions);
  }
  if (body.followupReason !== undefined) {
    setClauses.push(`follow_up_reason = $${p++}`);
    params.push(body.followupReason);
  }
  if (body.followupCreatedBy !== undefined) {
    setClauses.push(`follow_up_created_by = $${p++}`);
    params.push(body.followupCreatedBy);
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

  const isCompletion = mode === VISIT_MODES.COMPLETE_APPOINTMENT;
  const isEdit = mode === VISIT_MODES.EDIT_COMPLETED_VISIT;
  const whereClause = isCompletion
    ? `WHERE id = $${p} AND status = 'confirmed'`
    : isEdit
      ? `WHERE id = $${p} AND status NOT IN ('cancelled', 'no_show', 'superseded')`
      : `WHERE id = $${p} AND status NOT IN ('cancelled', 'no_show', 'superseded')`;

  let appointment;

  await sql.begin(async (tx) => {
    let updateResult;

    if (isCompletion && paidAmount !== undefined && (parseInt(paidAmount, 10) || 0) > 0) {
      const paidAmt = parseInt(paidAmount, 10) || 0;
      const paymentMethodParam = paymentMethod || null;

      const amtIndex = p + 1;
      const methodIndex = p + 2;
      params.push(paidAmt, paymentMethodParam);

      const combinedQuery = `
        WITH upd AS (
          UPDATE appointments SET ${setClauses.join(', ')} ${whereClause}
          RETURNING id, patient_id, consultation_fee, treatment_charges, medicine_charges, paid_amount, payment_status, paid_at, payment_method
        ),
        inserted AS (
          INSERT INTO payments (appointment_id, patient_id, amount, direction, kind, method, notes, recorded_by)
          SELECT upd.id, upd.patient_id, $${amtIndex}, 'credit', 'payment', $${methodIndex}, NULL, 'reception'
          FROM upd
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING *
        ),
        net AS (
          SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0) AS amount
          FROM payments WHERE appointment_id = $${p}
        ),
        sync AS (
          UPDATE appointments a SET
            paid_amount = net.amount,
            payment_status = CASE
              WHEN net.amount >= a.consultation_fee + a.treatment_charges + a.medicine_charges THEN 'paid'
              WHEN net.amount > 0 THEN 'partial' ELSE 'pending'
            END,
            paid_at = CASE WHEN net.amount > 0 THEN COALESCE(a.paid_at, NOW()) ELSE NULL END,
            payment_method = $${methodIndex}
          FROM net
          WHERE a.id = $${p}
          RETURNING a.id
        )
        SELECT (SELECT row_to_json(inserted.*) FROM inserted) AS payment, (SELECT row_to_json(upd.*) FROM upd) AS upd
      `;

      const result = await tx.unsafe(combinedQuery, params);
      updateResult = result;
    } else {
      const query = `UPDATE appointments SET ${setClauses.join(', ')} ${whereClause} RETURNING id, patient_id`;
      updateResult = await tx.unsafe(query, params);
    }

    if (updateResult.count === 0) {
      const errorMsg = isCompletion
        ? 'Appointment not found or already completed. Only confirmed appointments can be completed.'
        : isEdit
          ? 'Appointment not found or cannot be edited. Cancelled, no-show, and superseded appointments cannot be edited.'
          : 'Appointment not found or cannot be updated.';
      throw Object.assign(new Error(errorMsg), { status: 400 });
    }

    const [appt] = await tx`
      SELECT id, logical_id, wa_id, patient_name, patient_id, date, time, treatment,
             treatments, diagnosis, medicines, consultation_fee, treatment_charges, medicine_charges,
             notes, follow_up_date, follow_up_instructions, advice_selected, diagnosis_selected, tooth_diagnoses, prescription_key,
             chief_complaint, general_examination, extra_oral_examination,
             status, arrival_status, arrived_at, payment_status, payment_method, transaction_id, paid_amount, paid_at,
             created_at, updated_at
      FROM appointments WHERE id = ${appointmentId}
    `;

    const events = [];

    if (isCompletion) {
      events.push(recordVisitCompleted(tx, {
        patient_id: appt.patient_id,
        actor_type: body.followupCreatedBy || ACTOR_TYPES.DOCTOR,
        source_type: 'appointment',
        source_id: appointmentId,
        treatment: appt.treatment,
        mode,
      }));
    }

    if (followUpDate !== undefined) {
      if (followUpDate) {
        events.push(recordFollowupCreated(tx, {
          patient_id: appt.patient_id,
          actor_type: body.followupCreatedBy || ACTOR_TYPES.DOCTOR,
          source_type: 'appointment',
          source_id: appointmentId,
          follow_up_date: followUpDate,
          reason: body.followupReason || null,
          created_by: body.followupCreatedBy || ACTOR_TYPES.DOCTOR,
        }));
      } else {
        events.push(recordFollowupCancelled(tx, {
          patient_id: appt.patient_id,
          actor_type: body.followupCreatedBy || ACTOR_TYPES.DOCTOR,
          source_type: 'appointment',
          source_id: appointmentId,
        }));
      }
    }

    if (isCompletion && paidAmount !== undefined && (parseInt(paidAmount, 10) || 0) > 0) {
      const totalFees = (parseInt(appt.consultation_fee, 10) || 0) + (parseInt(appt.treatment_charges, 10) || 0) + (parseInt(appt.medicine_charges, 10) || 0);
      const newPaid = (parseInt(appt.paid_amount, 10) || 0);
      events.push(recordPaymentReceived(tx, {
        patient_id: appt.patient_id,
        actor_type: ACTOR_TYPES.DOCTOR,
        source_type: 'appointment',
        source_id: appointmentId,
        amount: parseInt(paidAmount, 10),
        method: paymentMethod || null,
        outstanding_after: Math.max(0, totalFees - newPaid),
      }));
    }

    await Promise.all(events);
    appointment = appt;
  });

  if (stepIds?.length) {
    try {
      await completeVisitSteps({ appointmentId, stepIds }, sql);
    } catch (stepErr) {
      logger.warn('STEP_ADVANCE_FAILED', {
        appointmentId,
        stepIds,
        error: stepErr.message,
        stack: stepErr.stack,
      });
    }
  }

  return appointment;
}
