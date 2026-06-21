import { NextResponse } from 'next/server';
import { getSql, runMigrations } from '@/db/pool';
import { getExtractionsByStatus } from '@/services/prescriptionExtractionService';

export async function GET(req) {
  try {
    await runMigrations();
    const sql = getSql();
    if (!sql) return NextResponse.json({ error: 'Database not ready' }, { status: 503 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending';

    const extractions = await getExtractionsByStatus(sql, status);
    return NextResponse.json({ extractions, status });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
