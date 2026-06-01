import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const action = searchParams.get('action');

    if (!date || !action) {
      return NextResponse.json({ error: 'date and action parameters are required' }, { status: 400 });
    }

    if (!['complete_all', 'cancel_all'].includes(action)) {
      return NextResponse.json({ error: 'action must be complete_all or cancel_all' }, { status: 400 });
    }

    const sql = getSql();
    const newStatus = action === 'complete_all' ? 'completed' : 'cancelled';

    const rows = await sql`
      UPDATE appointments
      SET status = ${newStatus},
          updated_at = NOW()
      WHERE date = ${date}::date
        AND status = 'confirmed'
      RETURNING id, patient_name
    `;

    logger.info('BULK_ACTION', { date, action, count: rows.length });

    return NextResponse.json({
      success: true,
      count: rows.length,
      action,
      appointments: rows,
    });
  } catch (error) {
    logger.error('BULK_ACTION_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
