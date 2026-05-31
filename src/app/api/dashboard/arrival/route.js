import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function PATCH(req) {
  try {
    const sql = getSql();
    const body = await req.json();
    const { appointmentId, arrivalStatus } = body;

    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const validStatuses = ['scheduled', 'arrived', 'called', 'completed'];
    if (arrivalStatus && !validStatuses.includes(arrivalStatus)) {
      return NextResponse.json({ error: 'Invalid arrival status' }, { status: 400 });
    }

    const sets = [];
    if (arrivalStatus) sets.push(sql`arrival_status = ${arrivalStatus}`);
    if (arrivalStatus === 'arrived') sets.push(sql`arrived_at = NOW()`);
    if (arrivalStatus === 'called') sets.push(sql`called_at = NOW()`);

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await sql`
      UPDATE appointments
      SET ${sql.join(sets, sql`, `)}, updated_at = NOW()
      WHERE id = ${appointmentId}
    `;

    const updated = await sql`
      SELECT id, status, arrival_status, arrived_at, called_at
      FROM appointments WHERE id = ${appointmentId}
    `;

    return NextResponse.json({ appointment: updated[0] || null });
  } catch (error) {
    logger.error('ARRIVAL_UPDATE_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
