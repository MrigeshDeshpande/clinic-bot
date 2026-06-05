import { NextResponse } from 'next/server';
import { searchPatients } from '@/db/repositories/patientRepository';
import { logger } from '@/lib/logger';
import { checkRateLimit, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function GET(req) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';

    if (!q.trim() || q.trim().length < 2) {
      return NextResponse.json({ patients: [] });
    }

    const patients = await searchPatients(q.trim());
    return NextResponse.json({ patients: sanitizeResponse(patients || []) });
  } catch (error) {
    logger.error('PATIENT_SEARCH_API_ERROR', { error: error.message });
    return jsonError(error);
  }
}
