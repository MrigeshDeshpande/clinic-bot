import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { CLINIC } from '@/config/clinic';
import { checkRateLimit, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function GET(req) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
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

    const sql = getSql();

    // 1. Get all confirmed appointments for the month (with time)
    const [apptRows, blockedRows] = await Promise.all([
      sql`
        SELECT date::text, time, patient_name
        FROM appointments
        WHERE date >= ${startDate}::date AND date < ${endDate}::date
          AND status IN ('confirmed', 'completed')
        ORDER BY date, time
      `,
      // 2. Get blocked dates for the month
      sql`
        SELECT date::text, reason
        FROM blocked_dates
        WHERE date >= ${startDate}::date AND date < ${endDate}::date
        ORDER BY date
      `,
    ]);

    // Build blocked date lookup
    const blockedSet = new Set();
    const blockedReasons = {};
    for (const r of blockedRows) {
      blockedSet.add(r.date);
      blockedReasons[r.date] = r.reason;
    }

    // Build per-date booked slots lookup
    const bookedByDate = {};
    for (const r of apptRows) {
      if (!bookedByDate[r.date]) bookedByDate[r.date] = [];
      bookedByDate[r.date].push({ time: r.time, patientName: r.patient_name });
    }

    // Enrich each day of the month with slot/blocked info
    const dates = {};
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const cursor = new Date(sy, sm - 1, sd);
    const endCursor = new Date(ey, em - 1, ed);

    while (cursor < endCursor) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const dayOfWeek = cursor.getDay();
      const isSunday = dayOfWeek === 0;

      if (blockedSet.has(dateStr)) {
        // Date is blocked — no slots available
        dates[dateStr] = {
          count: 0,
          totalSlots: 0,
          isBlocked: true,
          blockedReason: blockedReasons[dateStr] || null,
          bookedSlots: [],
          availableCount: 0,
        };
      } else {
        const totalSlots = isSunday ? CLINIC.slots.sunday.length : CLINIC.slots.weekday.length;
        const booked = bookedByDate[dateStr] || [];
        dates[dateStr] = {
          count: booked.length,
          totalSlots,
          isBlocked: false,
          blockedReason: null,
          bookedSlots: booked,
          availableCount: totalSlots - booked.length,
        };
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return NextResponse.json({
      dates: sanitizeResponse(dates),
      blockedDates: blockedRows.map(r => r.date),
      slotDefinitions: {
        weekday: CLINIC.slots.weekday,
        sunday: CLINIC.slots.sunday,
      },
    });
  } catch (error) {
    logger.error('CALENDAR_ERROR', { error: error.message });
    return jsonError(error);
  }
}
