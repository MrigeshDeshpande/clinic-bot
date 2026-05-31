import { NextResponse } from 'next/server';
import { getR2SignedUrl, r2Configured } from '@/lib/r2';
import { logger } from '@/lib/logger';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'key parameter required' }, { status: 400 });
    }

    if (!r2Configured()) {
      return NextResponse.json({ error: 'R2 storage not configured' }, { status: 500 });
    }

    const url = await getR2SignedUrl(key, 3600);
    if (!url) {
      return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 });
    }

    // Redirect directly to the signed URL
    return NextResponse.redirect(url);
  } catch (error) {
    logger.error('SIGNED_URL_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
