import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError, sanitizeResponse } from '@/lib/apiAuth';
import { completeVisit } from '@/services/completeVisit';
import { createWalkIn } from '@/services/createWalkIn';

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

    if (body.appointmentId) {
      const appointment = await completeVisit(sql, body);
      return NextResponse.json({ appointment: sanitizeResponse(appointment) });
    }

    const result = await createWalkIn(sql, body);
    return NextResponse.json({
      appointment: sanitizeResponse(result.appointment),
      patient_name: result.patient_name,
      treatment: result.treatment,
      fees: result.fees,
    });
  } catch (error) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error('DASHBOARD_VISIT_ERROR', { error: error.message });
    return jsonError(error);
  }
}
