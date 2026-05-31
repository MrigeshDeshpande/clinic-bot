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
    const todayStr = now.toISOString().slice(0, 10);
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [dailyStats, treatmentStats, summaryRaw, todayStats, patientStats, newPatientCount, totalApptsInPeriod] = await Promise.all([
      // Daily stats for the period
      sql`
        SELECT a.date,
               COUNT(*) FILTER (WHERE a.status = 'completed') AS completed,
               COUNT(*) FILTER (WHERE a.status IN ('confirmed','completed')) AS total
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
        GROUP BY a.date
        ORDER BY a.date ASC
      `,
      // Treatment breakdown for the period
      sql`
        SELECT a.treatment, COUNT(*) AS count
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
          AND a.status = 'completed' AND a.treatment IS NOT NULL
        GROUP BY a.treatment
        ORDER BY count DESC
        LIMIT 10
      `,
      // Period summary
      sql`
        SELECT
          COUNT(*) FILTER (WHERE a.status = 'completed') AS total_visits,
          COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0) AS total_revenue,
          COUNT(*) FILTER (WHERE a.status = 'no_show') AS total_no_shows,
          COUNT(*) FILTER (WHERE a.status = 'cancelled') AS total_cancelled
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
      `,
      // Today's stats
      sql`
        SELECT
          COUNT(*) AS today_appointments,
          COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0) AS today_revenue
        FROM appointments a
        WHERE a.date = ${todayStr}
          AND a.status IN ('confirmed', 'completed')
      `,
      // New patients this month
      sql`
        SELECT COUNT(*) AS count
        FROM patients p
        WHERE p.created_at >= ${monthStart}::date
      `,
      // Total patients
      sql`
        SELECT COUNT(*) AS count
        FROM patients
      `,
      // Total appointments in period (for the chip)
      sql`
        SELECT COUNT(*) AS count
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
          AND a.status IN ('confirmed', 'completed', 'no_show')
      `,
    ]);

    const today = todayStats[0] || { today_appointments: 0, today_revenue: 0 };

    return NextResponse.json({
      todayAppointments: Number(today.today_appointments),
      todayRevenue: Number(today.today_revenue),
      totalAppointments: Number(totalApptsInPeriod[0]?.count || 0),
      totalRevenue: Number(summaryRaw[0]?.total_revenue || 0),
      newPatientsThisMonth: Number(newPatientCount[0]?.count || 0),
      totalPatients: Number(patientStats[0]?.count || 0),
      treatmentBreakdown: (treatmentStats || []).map(t => ({ treatment: t.treatment, count: Number(t.count) })),
      // Keep existing fields for backward compatibility
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
