import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { checkRateLimit, jsonError, sanitizeResponse } from '@/lib/apiAuth';
import { getCached, setCache } from '@/lib/dataCache';

export async function GET(req, { params }) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const cacheKey = `patient_messages:${id}:${limit}:${offset}`;
    const cached = getCached(cacheKey, 30_000);
    if (cached) return NextResponse.json(cached);

    // Get patient's wa_id first
    const patientRows = await sql`
      SELECT wa_id, phone FROM patients WHERE id = ${id} LIMIT 1
    `;

    if (!patientRows || patientRows.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    const waId = patientRows[0].wa_id;
    const phone = patientRows[0].phone;

    // Search by wa_id or phone
    const searchIds = [waId, phone].filter(Boolean);
    if (searchIds.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    const messages = await sql`
      SELECT m.id, m.msg_id, m.role, m.content, m.intent, m.created_at,
             s.state, s.profile_name
      FROM messages m
      LEFT JOIN sessions s ON m.session_id = s.id
      WHERE m.wa_id = ANY(${searchIds})
      ORDER BY m.created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const responseData = { messages: sanitizeResponse(messages || []) };
    setCache(cacheKey, responseData, 30_000);
    return NextResponse.json(responseData);
  } catch (error) {
    logger.error('PATIENT_MESSAGES_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}
