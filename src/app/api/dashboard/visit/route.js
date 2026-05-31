import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function POST(req) {
  try {
    const sql = getSql();
    const body = await req.json();
    const { appointmentId, treatment, diagnosis, medicines, consultationFee, treatmentCharges, medicineCharges, notes, followUpDate, followUpInstructions, status: newStatus } = body;

    // ── Update existing appointment ──
    if (appointmentId) {
      const sets = [];
      if (treatment !== undefined) sets.push(sql`treatment = ${treatment}`);
      if (diagnosis !== undefined) sets.push(sql`diagnosis = ${diagnosis}`);
      if (medicines !== undefined) sets.push(sql`medicines = ${JSON.stringify(medicines)}`);
      if (consultationFee !== undefined) sets.push(sql`consultation_fee = ${parseInt(consultationFee, 10) || 0}`);
      if (treatmentCharges !== undefined) sets.push(sql`treatment_charges = ${parseInt(treatmentCharges, 10) || 0}`);
      if (medicineCharges !== undefined) sets.push(sql`medicine_charges = ${parseInt(medicineCharges, 10) || 0}`);
      if (notes !== undefined) sets.push(sql`notes = ${notes}`);
      if (followUpDate !== undefined) sets.push(sql`follow_up_date = ${followUpDate || null}`);
      if (followUpInstructions !== undefined) sets.push(sql`follow_up_instructions = ${followUpInstructions}`);
      if (newStatus !== undefined) sets.push(sql`status = ${newStatus}`);

      if (sets.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

      await sql`UPDATE appointments SET ${sql.join(sets, sql`, `)}, updated_at = NOW() WHERE id = ${appointmentId}`;

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
    const { patient_name, patient_phone, fees } = body;
    if (!patient_name) return NextResponse.json({ error: 'patient_name required' }, { status: 400 });

    const today = new Date().toISOString().slice(0, 10);
    const totalFees = Number(fees) || 0;

    const rows = await sql`
      INSERT INTO appointments (
        logical_id, version, wa_id, patient_name, patient_phone,
        date, time, treatment, status,
        consultation_fee, treatment_charges, medicine_charges,
        diagnosis, medicines, notes, follow_up_date, follow_up_instructions,
        arrival_status
      ) VALUES (
        gen_random_uuid(), 1, ${patient_phone || null}, ${patient_name}, ${patient_phone || null},
        ${today}, NULL, ${treatment || 'Walk-in'}, 'completed',
        ${totalFees}, 0, 0,
        ${diagnosis || ''}, ${JSON.stringify(medicines || [])}, ${notes || ''},
        ${followUpDate || null}, ${followUpInstructions || ''},
        'arrived'
      )
      RETURNING *
    `;

    return NextResponse.json({ appointment: rows[0], patient_name, treatment: treatment || 'Walk-in', fees: totalFees });
  } catch (error) {
    logger.error('DASHBOARD_VISIT_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
