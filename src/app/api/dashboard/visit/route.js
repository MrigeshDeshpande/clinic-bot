import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function POST(req) {
  try {
    const sql = getSql();

    const body = await req.json();
    const { appointmentId, treatment, consultationFee, treatmentCharges, medicineCharges, notes, status: newStatus } = body;

    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const sets = [];
    if (treatment !== undefined) sets.push(sql`treatment = ${treatment}`);
    if (consultationFee !== undefined) sets.push(sql`consultation_fee = ${parseInt(consultationFee, 10) || 0}`);
    if (treatmentCharges !== undefined) sets.push(sql`treatment_charges = ${parseInt(treatmentCharges, 10) || 0}`);
    if (medicineCharges !== undefined) sets.push(sql`medicine_charges = ${parseInt(medicineCharges, 10) || 0}`);
    if (notes !== undefined) sets.push(sql`notes = ${notes}`);
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
      SELECT * FROM appointments WHERE id = ${appointmentId}
    `;

    return NextResponse.json({ appointment: updated[0] || null });
  } catch (error) {
    logger.error('DASHBOARD_VISIT_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
