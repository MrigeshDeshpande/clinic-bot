import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError, sanitizeResponse } from '@/lib/apiAuth';
import { invalidateCache } from '@/lib/dataCache';
import { cleanRatings } from '@/lib/constants';

export async function PATCH(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const bodyErr = checkBodySize(req);
  if (bodyErr) return bodyErr;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Review ID required' }, { status: 400 });
    }

    const body = await req.json();
    const { ratings: rawRatings, notes } = body;
    const ratings = cleanRatings(rawRatings);

    if (!ratings && notes === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const sql = getSql();

    const result = await sql`
      UPDATE patient_reviews
      SET
        ratings = COALESCE(${ratings}, ratings),
        notes = COALESCE(${notes}, notes),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, patient_id, appointment_id, ratings, notes, created_at, updated_at
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    invalidateCache('patient-reviews:');
    return NextResponse.json({ review: sanitizeResponse(result[0]) });
  } catch (error) {
    logger.error('PATIENT_REVIEW_UPDATE_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}

export async function DELETE(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Review ID required' }, { status: 400 });
    }

    const sql = getSql();
    const result = await sql`
      DELETE FROM patient_reviews WHERE id = ${id}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    invalidateCache('patient-reviews:');
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('PATIENT_REVIEW_DELETE_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}
