import { NextResponse } from 'next/server';
import { getSql, runMigrations } from '@/db/pool';

export async function GET() {
  try {
    await runMigrations();
    const sql = getSql();
    const result = await sql`SELECT COUNT(*) AS cnt FROM appointments`;
    return NextResponse.json({ ok: true, count: result[0]?.cnt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
