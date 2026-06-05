import { logger } from '@/lib/logger';
import { getSql } from '@/db/pool';
import { onNewMessage } from '@/lib/messageEvents';
import { checkRateLimit } from '@/lib/apiAuth';

export async function GET(req, { params }) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const { id } = await params;

  const sql = getSql();
  const patientRows = await sql`
    SELECT wa_id, phone FROM patients WHERE id = ${id} LIMIT 1
  `;

  if (!patientRows || patientRows.length === 0) {
    return new Response('Patient not found', { status: 404 });
  }

  const waId = patientRows[0].wa_id || patientRows[0].phone;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial keepalive
      controller.enqueue('data: connected\n\n');

      const unsub = onNewMessage((msgWaId) => {
        if (msgWaId === waId) {
          controller.enqueue('data: new_message\n\n');
        }
      });

      // Keepalive every 15s
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
