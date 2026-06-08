import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { checkRateLimit, jsonError, sanitizeResponse } from '@/lib/apiAuth';
import { getCached, setCache } from '@/lib/dataCache';

export async function GET(req) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);
    const waId = searchParams.get('waId') || null;
    const cacheKey = `feedback:${waId || 'all'}:${limit}`;
    const cached = getCached(cacheKey, 120_000);
    if (cached) return NextResponse.json(cached);

    const sql = getSql();

    const recent = waId
      ? await sql`
          SELECT f.id, f.wa_id, f.rating, f.comment, f.callback, f.callback_contacted_at, f.created_at,
                 a.id AS appointment_id, a.patient_name, a.date, a.treatment
          FROM feedback f
          LEFT JOIN appointments a ON f.appointment_id = a.id
          WHERE f.wa_id = ${waId}
          ORDER BY f.created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT f.id, f.wa_id, f.rating, f.comment, f.callback, f.callback_contacted_at, f.created_at,
                 a.id AS appointment_id, a.patient_name, a.date, a.treatment
          FROM feedback f
          LEFT JOIN appointments a ON f.appointment_id = a.id
          ORDER BY f.created_at DESC
          LIMIT ${limit}
        `;

    const ratingBreakdown = waId
      ? await sql`
          SELECT rating, COUNT(*) AS count
          FROM feedback
          WHERE wa_id = ${waId}
          GROUP BY rating
        `
      : await sql`
          SELECT rating, COUNT(*) AS count
          FROM feedback
          GROUP BY rating
        `;

    const callbacksPending = waId
      ? await sql`
          SELECT COUNT(*) AS count
          FROM feedback
          WHERE callback = TRUE AND callback_contacted_at IS NULL AND wa_id = ${waId}
        `
      : await sql`
          SELECT COUNT(*) AS count
          FROM feedback
          WHERE callback = TRUE AND callback_contacted_at IS NULL
        `;

    const summary = ratingBreakdown.reduce((acc, r) => {
      acc[r.rating] = Number(r.count);
      return acc;
    }, { great: 0, okay: 0, poor: 0 });

    const total = Object.values(summary).reduce((a, b) => Number(a) + Number(b), 0);
    const satisfaction = total > 0
      ? Math.round(((summary.great + summary.okay) / total) * 100)
      : 0;

    const response = {
      entries: sanitizeResponse(recent || []),
      summary,
      satisfaction,
      totalFeedback: total,
      callbacksPending: Number(callbacksPending[0]?.count || 0),
    };
    setCache(cacheKey, response, 120_000);
    return NextResponse.json(response);
  } catch (error) {
    logger.error('FEEDBACK_FETCH_ERROR', { error: error.message });
    return jsonError(error);
  }
}
