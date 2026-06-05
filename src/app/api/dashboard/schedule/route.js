import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function GET() {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT date::text, reason, created_at
      FROM blocked_dates
      ORDER BY date ASC
    `;
    return NextResponse.json({ blockedDates: sanitizeResponse(rows || []) });
  } catch (error) {
    logger.error('SCHEDULE_FETCH_ERROR', { error: error.message });
    return jsonError(error);
  }
}

export async function POST(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const sizeErr = checkBodySize(req);
  if (sizeErr) return sizeErr;
  try {
    const sql = getSql();
    const { date, reason } = await req.json();

    if (!date) {
      return NextResponse.json({ error: 'Date required' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO blocked_dates (date, reason)
      VALUES (${date}, ${reason || null})
      ON CONFLICT (date) DO UPDATE SET reason = ${reason || null}
      RETURNING *
    `;

    return NextResponse.json({ blocked: rows[0] || null });
  } catch (error) {
    logger.error('SCHEDULE_BLOCK_ERROR', { error: error.message });
    return jsonError(error);
  }
}

export async function DELETE(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'Date required' }, { status: 400 });
    }

    await sql`DELETE FROM blocked_dates WHERE date = ${date}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('SCHEDULE_UNBLOCK_ERROR', { error: error.message });
    return jsonError(error);
  }
}
