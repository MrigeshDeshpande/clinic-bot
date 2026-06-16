import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError, sanitizeResponse } from '@/lib/apiAuth';
import { getCached, setCache, invalidateCache } from '@/lib/dataCache';
import { cleanRatings } from '@/lib/constants';

export async function GET(req) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const q = searchParams.get('q') || '';
    const patientId = searchParams.get('patientId') || '';
    const cacheKey = `patient-reviews:${q}:${patientId}:${limit}`;
    const cached = getCached(cacheKey, 60_000);
    if (cached) return NextResponse.json(cached);

    const sql = getSql();

    let rows;
    if (patientId && q) {
      rows = await sql`
        SELECT
          pr.id, pr.patient_id, pr.appointment_id, pr.ratings, pr.notes, pr.created_at, pr.updated_at,
          p.name AS patient_name, p.phone AS patient_phone,
          a.date AS appointment_date, a.treatment
        FROM patient_reviews pr
        JOIN patients p ON pr.patient_id = p.id
        LEFT JOIN appointments a ON pr.appointment_id = a.id
        WHERE pr.patient_id = ${patientId}
          AND (p.name ILIKE ${'%' + q + '%'} OR p.phone ILIKE ${'%' + q + '%'})
        ORDER BY pr.created_at DESC
        LIMIT ${limit}
      `;
    } else if (patientId) {
      rows = await sql`
        SELECT
          pr.id, pr.patient_id, pr.appointment_id, pr.ratings, pr.notes, pr.created_at, pr.updated_at,
          p.name AS patient_name, p.phone AS patient_phone,
          a.date AS appointment_date, a.treatment
        FROM patient_reviews pr
        JOIN patients p ON pr.patient_id = p.id
        LEFT JOIN appointments a ON pr.appointment_id = a.id
        WHERE pr.patient_id = ${patientId}
        ORDER BY pr.created_at DESC
        LIMIT ${limit}
      `;
    } else if (q) {
      rows = await sql`
        SELECT
          pr.id, pr.patient_id, pr.appointment_id, pr.ratings, pr.notes, pr.created_at, pr.updated_at,
          p.name AS patient_name, p.phone AS patient_phone,
          a.date AS appointment_date, a.treatment
        FROM patient_reviews pr
        JOIN patients p ON pr.patient_id = p.id
        LEFT JOIN appointments a ON pr.appointment_id = a.id
        WHERE p.name ILIKE ${'%' + q + '%'} OR p.phone ILIKE ${'%' + q + '%'}
        ORDER BY pr.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        SELECT
          pr.id, pr.patient_id, pr.appointment_id, pr.ratings, pr.notes, pr.created_at, pr.updated_at,
          p.name AS patient_name, p.phone AS patient_phone,
          a.date AS appointment_date, a.treatment
        FROM patient_reviews pr
        JOIN patients p ON pr.patient_id = p.id
        LEFT JOIN appointments a ON pr.appointment_id = a.id
        ORDER BY pr.created_at DESC
        LIMIT ${limit}
      `;
    }

    const response = { reviews: sanitizeResponse(rows || []) };
    setCache(cacheKey, response, 60_000);
    return NextResponse.json(response);
  } catch (error) {
    logger.error('PATIENT_REVIEWS_FETCH_ERROR', { error: error.message });
    return jsonError(error);
  }
}

export async function POST(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const bodyErr = checkBodySize(req);
  if (bodyErr) return bodyErr;

  try {
    const body = await req.json();
    const { patient_id, appointment_id, ratings: rawRatings, notes } = body;

    if (!patient_id || !appointment_id) {
      return NextResponse.json({ error: 'patient_id and appointment_id are required' }, { status: 400 });
    }

    const ratings = cleanRatings(rawRatings);

    const sql = getSql();

    const existing = await sql`
      SELECT id FROM patient_reviews WHERE appointment_id = ${appointment_id}
    `;

    if (existing.length > 0) {
      const result = await sql`
        UPDATE patient_reviews
        SET ratings = ${ratings}, notes = ${notes || ''}, updated_at = NOW()
        WHERE appointment_id = ${appointment_id}
        RETURNING id, patient_id, appointment_id, ratings, notes, created_at, updated_at
      `;
      invalidateCache('patient-reviews:');
      return NextResponse.json({ review: sanitizeResponse(result[0]), created: false });
    }

    const result = await sql`
      INSERT INTO patient_reviews (patient_id, appointment_id, ratings, notes)
      VALUES (${patient_id}, ${appointment_id}, ${ratings}, ${notes || ''})
      RETURNING id, patient_id, appointment_id, ratings, notes, created_at, updated_at
    `;

    invalidateCache('patient-reviews:');
    return NextResponse.json({ review: sanitizeResponse(result[0]), created: true }, { status: 201 });
  } catch (error) {
    logger.error('PATIENT_REVIEW_CREATE_ERROR', { error: error.message });
    return jsonError(error);
  }
}
