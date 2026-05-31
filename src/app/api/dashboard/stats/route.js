import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function GET(req) {
  try {
    const sql = getSql();

    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'week';
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (period === 'month' ? 29 : 6));

    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = now.toISOString().slice(0, 10);

    const [dailyStats, treatmentStats, summaryRaw] = await Promise.all([
      sql`
        SELECT a.date,
               COUNT(*) FILTER (WHERE a.status = 'completed') AS completed,
               COUNT(*) FILTER (WHERE a.status IN ('confirmed','completed')) AS total
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
        GROUP BY a.date
        ORDER BY a.date ASC
      `,
      sql`
        SELECT a.treatment, COUNT(*) AS count
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
          AND a.status = 'completed' AND a.treatment IS NOT NULL
        GROUP BY a.treatment
        ORDER BY count DESC
        LIMIT 10
      `,
      sql`
        SELECT
          COUNT(*) FILTER (WHERE a.status = 'completed') AS total_visits,
          COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0) AS total_revenue,
          COUNT(*) FILTER (WHERE a.status = 'no_show') AS total_no_shows,
          COUNT(*) FILTER (WHERE a.status = 'cancelled') AS total_cancelled
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
      `,
    ]);

    return NextResponse.json({
      daily: dailyStats || [],
      treatments: treatmentStats || [],
      summary: summaryRaw[0] || {},
      period,
      startDate: startStr,
      endDate: endStr,
    });
  } catch (error) {
    logger.error('DASHBOARD_STATS_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
