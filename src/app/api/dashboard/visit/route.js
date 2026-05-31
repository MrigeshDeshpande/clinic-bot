import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function POST(req) {
  try {
    const sql = getSql();

    const body = await req.json();
    const { appointmentId, treatment, diagnosis, medicines, consultationFee, treatmentCharges, medicineCharges, notes, followUpDate, followUpInstructions, status: newStatus } = body;

    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });
    }

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

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await sql`
      UPDATE appointments
      SET ${sql.join(sets, sql`, `)}, updated_at = NOW()
      WHERE id = ${appointmentId}
    `;

    const updated = await sql`
      SELECT id, logical_id, wa_id, patient_name, patient_id, date, time, treatment,
             diagnosis, medicines, consultation_fee, treatment_charges, medicine_charges,
             notes, follow_up_date, follow_up_instructions,
             status, arrival_status, created_at, updated_at
      FROM appointments WHERE id = ${appointmentId}
    `;

    return NextResponse.json({ appointment: updated[0] || null });
  } catch (error) {
    logger.error('DASHBOARD_VISIT_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
