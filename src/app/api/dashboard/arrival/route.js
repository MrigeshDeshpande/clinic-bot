import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, jsonError } from '@/lib/apiAuth';

export async function PATCH(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
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

    // Build SET clause manually — @neondatabase/serverless does not support sql.join
    const setClauses = [];
    const params = [];
    let p = 1;

    if (arrivalStatus) {
      setClauses.push(`arrival_status = $${p++}`);
      params.push(arrivalStatus);
    }
    if (arrivalStatus === 'arrived') {
      setClauses.push('arrived_at = NOW()');
    }
    if (arrivalStatus === 'called') {
      setClauses.push('called_at = NOW()');
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push('updated_at = NOW()');
    params.push(appointmentId);

    await sql.query(`UPDATE appointments SET ${setClauses.join(', ')} WHERE id = $${p}`, params);

    const updated = await sql`
      SELECT id, status, arrival_status, arrived_at, called_at
      FROM appointments WHERE id = ${appointmentId}
    `;

    return NextResponse.json({ appointment: updated[0] || null });
  } catch (error) {
    logger.error('ARRIVAL_UPDATE_ERROR', { error: error.message });
    return jsonError(error);
  }
}
