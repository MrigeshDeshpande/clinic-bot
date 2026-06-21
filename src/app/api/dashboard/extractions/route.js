import { NextResponse } from 'next/server';
import { getSql, runMigrations } from '@/db/pool';
import { getPendingExtractions } from '@/services/prescriptionExtractionService';

export async function GET() {
  try {
    await runMigrations();
    const sql = getSql();
    if (!sql) return NextResponse.json({ error: 'Database not ready' }, { status: 503 });

    const extractions = await getPendingExtractions(sql);
    return NextResponse.json({ extractions });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
