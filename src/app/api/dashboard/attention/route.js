import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { getAttentionSummary } from '@/services/attentionEngine';

// TODO: If dashboard is ever migrated to server components,
// remove this route and call attentionEngine directly from the page.
// The route exists only because dashboard/page.js is a 'use client'
// component that fetches data via fetchCached() — no server-side sql access.

export async function GET() {
  try {
    const sql = getSql();
    const attention = await getAttentionSummary(sql);
    return NextResponse.json(attention);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
