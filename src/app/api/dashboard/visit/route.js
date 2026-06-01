import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { findPatientByPhone, createPatient } from '@/db/repositories/patientRepository';

export async function POST(req) {
  try {
    const sql = getSql();
    const body = await req.json();
    const { appointmentId, treatment, diagnosis, medicines, consultationFee, treatmentCharges, medicineCharges, notes, followUpDate, followUpInstructions, status: newStatus } = body;

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
      if (newStatus !== undefined) {
        setClauses.push(`status = $${p++}`);
        params.push(newStatus);
      }

      if (setClauses.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

      setClauses.push(`updated_at = NOW()`);
      params.push(appointmentId);

      await sql.query(`UPDATE appointments SET ${setClauses.join(', ')} WHERE id = $${p}`, params);

      const updated = await sql`
        SELECT id, logical_id, wa_id, patient_name, patient_id, date, time, treatment,
               diagnosis, medicines, consultation_fee, treatment_charges, medicine_charges,
               notes, follow_up_date, follow_up_instructions,
               status, arrival_status, created_at, updated_at
        FROM appointments WHERE id = ${appointmentId}
      `;
      return NextResponse.json({ appointment: updated[0] || null });
    }

    // ── Standalone walk-in visit creation ──
    const { patient_name, patient_phone } = body;
    if (!patient_name) return NextResponse.json({ error: 'patient_name required' }, { status: 400 });

    const today = new Date().toISOString().slice(0, 10);
    const consFee = Number(consultationFee) || 0;
    const treatFee = Number(treatmentCharges) || 0;
    const medFee = Number(medicineCharges) || 0;

    // Find or create patient record so walk-ins appear in the Patients list
    let patientId = null;
    if (patient_phone) {
      const existing = await findPatientByPhone(patient_phone);
      if (existing) {
        patientId = existing.id;
      } else {
        const created = await createPatient({
          name: patient_name,
          phone: patient_phone,
          waId: patient_phone,
        });
        if (created) patientId = created.id;
      }
    }

    const rows = await sql`
      INSERT INTO appointments (
        logical_id, version, wa_id, patient_name, patient_phone, patient_id,
        date, time, treatment, status,
        consultation_fee, treatment_charges, medicine_charges,
        diagnosis, medicines, notes, follow_up_date, follow_up_instructions,
        arrival_status
      ) VALUES (
        gen_random_uuid(), 1, ${patient_phone || null}, ${patient_name}, ${patient_phone || null}, ${patientId},
        ${today}, NULL, ${treatment || 'Walk-in'}, 'completed',
        ${consFee}, ${treatFee}, ${medFee},
        ${diagnosis || ''}, ${JSON.stringify(medicines || [])}, ${notes || ''},
        ${followUpDate || null}, ${followUpInstructions || ''},
        'arrived'
      )
      RETURNING *
    `;

    return NextResponse.json({ appointment: rows[0], patient_name, treatment: treatment || 'Walk-in', fees: consFee + treatFee + medFee });
  } catch (error) {
    logger.error('DASHBOARD_VISIT_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
