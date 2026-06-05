import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, jsonError } from '@/lib/apiAuth';
import { markCallbackContacted } from '@/db/repositories/feedbackRepository';

export async function PATCH(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Feedback ID required' }, { status: 400 });
    }

    const result = await markCallbackContacted(id);
    if (!result) {
      return NextResponse.json({ error: 'Callback not found or already contacted' }, { status: 404 });
    }

    logger.info('CALLBACK_CONTACTED', { feedbackId: id });
    return NextResponse.json({ ok: true, contactedAt: result.callback_contacted_at });
  } catch (error) {
    logger.error('CALLBACK_CONTACT_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}
