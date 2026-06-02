import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { checkRateLimit } from '@/lib/apiAuth';

export async function GET() {
  try {
    const sql = getSql();
    const result = await sql`SELECT COUNT(*) AS cnt FROM appointments`;
    return NextResponse.json({ ok: true, count: result[0]?.cnt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
