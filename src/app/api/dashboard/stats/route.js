import { NextResponse } from 'next/server';
import { getSql, runMigrations } from '@/db/pool';
import { logger } from '@/lib/logger';
import { checkRateLimit, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function GET(req) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    await runMigrations();
    const sql = getSql();

    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'week';
    const now = new Date();
    const startDate = new Date(now);
    const periodDays = period === 'month' ? 29 : period === 'quarter' ? 89 : 6;
    startDate.setDate(startDate.getDate() - periodDays);

    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = now.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    // Previous period for comparison
    const prevStart = new Date(startDate);
    prevStart.setDate(prevStart.getDate() - periodDays - 1);
    const prevStartStr = prevStart.toISOString().slice(0, 10);
    const prevEndStr = new Date(startDate.getTime() - 86400000).toISOString().slice(0, 10);

    const [
      dailyStats,
      treatmentStats,
      summaryRaw,
      todayStats,
      patientStats,
      newPatientCount,
      totalApptsInPeriod,
      peakHours,
      retentionRaw,
      prevPeriodRaw,
      dayOfWeekStats,
      demographicsSex,
      demographicsAge,
      feeBreakdown,
      topPatients,
    ] = await Promise.all([
      // Daily stats for the period
      sql`
        SELECT a.date,
               COUNT(*) FILTER (WHERE a.status = 'completed') AS completed,
               COUNT(*) FILTER (WHERE a.status IN ('confirmed','completed')) AS total,
               COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges) FILTER (WHERE a.status = 'completed'), 0) AS revenue
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
        GROUP BY a.date
        ORDER BY a.date ASC
      `,
      // Treatment breakdown for the period
      sql`
        SELECT a.treatment, COUNT(*) AS count,
               COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0) AS revenue
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
          COUNT(*) FILTER (WHERE a.status = 'cancelled') AS total_cancelled,
          ROUND(
            COUNT(*) FILTER (WHERE a.status = 'no_show')::numeric /
            NULLIF(COUNT(*) FILTER (WHERE a.status IN ('completed','no_show')), 0) * 100, 1
          ) AS no_show_pct
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
      // Total appointments in period
      sql`
        SELECT COUNT(*) AS count
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
          AND a.status IN ('confirmed', 'completed', 'no_show')
      `,
      // Peak hours — time slots with most completed appointments
      sql`
        SELECT a.time, COUNT(*) AS count,
               COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0) AS revenue
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
          AND a.status = 'completed'
        GROUP BY a.time
        ORDER BY count DESC
        LIMIT 10
      `,
      // Patient retention — returning patients in period
      sql`
        SELECT
          COUNT(DISTINCT a.patient_id) AS returning_patients,
          COUNT(DISTINCT a.wa_id) AS total_patients
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
          AND a.status = 'completed'
          AND a.patient_id IS NOT NULL
      `,
      // Previous period comparison
      sql`
        SELECT
          COUNT(*) FILTER (WHERE a.status = 'completed') AS total_visits,
          COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0) AS total_revenue
        FROM appointments a
        WHERE a.date >= ${prevStartStr} AND a.date <= ${prevEndStr}
      `,
      // Day of week distribution
      sql`
        SELECT
          EXTRACT(DOW FROM a.date) AS dow,
          COUNT(*) AS count,
          COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0) AS revenue
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
          AND a.status = 'completed'
        GROUP BY EXTRACT(DOW FROM a.date)
        ORDER BY dow
      `,
      // Demographics — sex distribution for completed visits
      sql`
        SELECT p.sex, COUNT(*)::int AS count
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
          AND a.status = 'completed' AND p.sex IS NOT NULL
        GROUP BY p.sex
        ORDER BY count DESC
      `,
      // Demographics — age group distribution
      sql`
        SELECT
          CASE
            WHEN p.age < 18 THEN '0-17'
            WHEN p.age BETWEEN 18 AND 35 THEN '18-35'
            WHEN p.age BETWEEN 36 AND 50 THEN '36-50'
            WHEN p.age BETWEEN 51 AND 65 THEN '51-65'
            ELSE '65+'
          END AS age_group,
          COUNT(*)::int AS count
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
          AND a.status = 'completed' AND p.age IS NOT NULL
        GROUP BY age_group
        ORDER BY age_group
      `,
      // Revenue breakdown by fee type
      sql`
        SELECT
          COALESCE(SUM(a.consultation_fee), 0) AS consultation,
          COALESCE(SUM(a.treatment_charges), 0) AS treatment,
          COALESCE(SUM(a.medicine_charges), 0) AS medicine
        FROM appointments a
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
          AND a.status = 'completed'
      `,
      // Top patients by revenue
      sql`
        SELECT
          COALESCE(p.name, a.patient_name) AS patient_name,
          a.patient_id,
          COUNT(*) AS visit_count,
          COALESCE(SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges), 0) AS total_revenue
        FROM appointments a
        LEFT JOIN patients p ON p.id = a.patient_id
        WHERE a.date >= ${startStr} AND a.date <= ${endStr}
          AND a.status = 'completed'
          AND a.patient_id IS NOT NULL
        GROUP BY a.patient_id, p.name, a.patient_name
        ORDER BY total_revenue DESC
        LIMIT 5
      `,
    ]);

    const today = todayStats[0] || { today_appointments: 0, today_revenue: 0 };
    const summary = summaryRaw[0] || {};
    const totalAppts = totalApptsInPeriod[0]?.count || 0;
    const retention = retentionRaw[0] || { returning_patients: 0, total_patients: 0 };
    const prevPeriod = prevPeriodRaw[0] || { total_visits: 0, total_revenue: 0 };
    const currentVisits = summary.total_visits || 0;
    const currentRevenue = summary.total_revenue || 0;

    const revenueChange = prevPeriod.total_revenue > 0
      ? Math.round(((currentRevenue - Number(prevPeriod.total_revenue)) / Number(prevPeriod.total_revenue)) * 100)
      : 0;
    const visitsChange = prevPeriod.total_visits > 0
      ? Math.round(((currentVisits - Number(prevPeriod.total_visits)) / Number(prevPeriod.total_visits)) * 100)
      : 0;

    const avgRevenuePerVisit = currentVisits > 0 ? Math.round(currentRevenue / currentVisits) : 0;

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOfWeek = (dayOfWeekStats || []).map(d => ({
      day: dayNames[Number(d.dow)] || d.dow,
      count: Number(d.count),
      revenue: Number(d.revenue),
    }));

    const peakHourData = (peakHours || []).map(p => ({
      time: p.time,
      count: Number(p.count),
      revenue: Number(p.revenue),
    }));

    return NextResponse.json({
      todayAppointments: Number(today.today_appointments),
      todayRevenue: Number(today.today_revenue),
      totalAppointments: totalAppts,
      totalRevenue: currentRevenue,
      newPatientsThisMonth: Number(newPatientCount[0]?.count || 0),
      totalPatients: Number(patientStats[0]?.count || 0),
      totalVisits: currentVisits,
      totalNoShows: Number(summary.total_no_shows || 0),
      totalCancelled: Number(summary.total_cancelled || 0),
      noShowPct: summary.no_show_pct,
      avgRevenuePerVisit,
      revenueChange,
      visitsChange,
      retentionRate: retention.total_patients > 0
        ? Math.round((Number(retention.returning_patients) / Number(retention.total_patients)) * 100)
        : 0,
      returningPatients: Number(retention.returning_patients),
      treatmentBreakdown: sanitizeResponse((treatmentStats || []).map(t => ({
        treatment: t.treatment,
        count: Number(t.count),
        revenue: Number(t.revenue),
      }))),
      peakHours: peakHourData,
      dayOfWeek,
      demographics: {
        bySex: (demographicsSex || []).map(d => ({ sex: d.sex, count: Number(d.count) })),
        byAgeGroup: (demographicsAge || []).map(d => ({ ageGroup: d.age_group, count: Number(d.count) })),
      },
      daily: dailyStats || [],
      feeBreakdown: feeBreakdown[0] || { consultation: 0, treatment: 0, medicine: 0 },
      topPatients: sanitizeResponse((topPatients || []).map(p => ({
        patientName: p.patient_name,
        patientId: p.patient_id,
        visitCount: Number(p.visit_count),
        totalRevenue: Number(p.total_revenue),
      }))),
      period,
      startDate: startStr,
      endDate: endStr,
    });
  } catch (error) {
    logger.error('DASHBOARD_STATS_ERROR', { error: error.message });
    return jsonError(error);
  }
}
