import { onManualMessage } from '@/lib/messageEvents';
import { checkRateLimit } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue('data: connected\n\n');

      const unsub = onManualMessage((data) => {
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      });

      const keepalive = setInterval(() => {
        controller.enqueue(': keepalive\n\n');
      }, 15000);

      req.signal.addEventListener('abort', () => {
        unsub();
        clearInterval(keepalive);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
