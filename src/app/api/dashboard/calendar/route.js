import { NextResponse } from 'next/server';
import { getSql, runMigrations } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year'), 10);
    const month = parseInt(searchParams.get('month'), 10);

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 });
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endYear = month === 12 ? year + 1 : year;
    const endMonth = month === 12 ? 1 : month + 1;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    await runMigrations();
    const sql = getSql();

    const rows = await sql`
      SELECT date::text, COUNT(*)::int AS count
      FROM appointments
      WHERE date >= ${startDate}::date AND date < ${endDate}::date
        AND status IN ('confirmed', 'completed', 'no_show')
      GROUP BY date
      ORDER BY date
    `;

    const dates = {};
    for (const r of rows) {
      dates[r.date] = r.count;
    }

    return NextResponse.json({ dates });
  } catch (error) {
    logger.error('CALENDAR_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
