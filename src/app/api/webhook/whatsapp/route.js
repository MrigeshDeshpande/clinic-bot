import { processEvent } from '@/lib/engine';
import { runMigrations } from '@/db/pool';
import { logger } from '@/lib/logger';
import { WEBHOOK_LIMITER } from '@/lib/rateLimit';

export async function GET(req) {
  const rateCheck = WEBHOOK_LIMITER(req);
  if (rateCheck.blocked) {
    return new Response('Too many requests', { status: 429 });
  }
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
}

export async function POST(req) {
    const rateCheck = WEBHOOK_LIMITER(req);
    if (rateCheck.blocked) {
      return Response.json({ error: 'Too many requests' }, { status: 429 });
    }
    const rawBody = await req.text();

    // JSON.parse happens EXACTLY ONCE — right here — never again downstream
    let payload;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        logger.warn('Invalid JSON in webhook body');
        return Response.json({ received: true }, { status: 200 });
    }

    // Return 200 immediately — process async
    // Ensure migrations complete before processing events (critical on cold start)
    runMigrations()
      .then(() => processEvent(payload))
      .catch(err => logger.error('Unhandled engine error', { error: err.message }));

    return Response.json({ received: true }, { status: 200 });
}
