import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { getReason } from '@/services/dharaReason';

export async function GET(req, { params }) {
  try {
    const sql = getSql();
    if (!sql) return NextResponse.json({ error: 'Database not ready' }, { status: 503 });

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const planId = searchParams.get('planId') || undefined;

    const result = await getReason(sql, id, { planId });
    return NextResponse.json(result);
  } catch (e) {
    const httpStatus = e.status || 500;
    return NextResponse.json({ error: e.message }, { status: httpStatus });
  }
}
