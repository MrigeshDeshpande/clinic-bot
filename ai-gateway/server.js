import { createServer } from 'node:http';
import { classify, extract } from './providers/qwen.js';

const PORT = parseInt(process.env.PORT || '3002', 10);
const TIMEOUT_MS = parseInt(process.env.GATEWAY_TIMEOUT_MS || '20000', 10);
const EXTRACTION_TIMEOUT_MS = parseInt(process.env.EXTRACTION_GATEWAY_TIMEOUT_MS || '60000', 10);

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    let ollamaOk = false;
    try {
      const ollamaRes = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
      ollamaOk = ollamaRes.ok;
    } catch { /* ollama unreachable */ }
    jsonResponse(res, 200, { status: 'ok', provider: 'qwen', ollama: ollamaOk });
    return;
  }

  if (req.method !== 'POST') {
    jsonResponse(res, 404, { error: 'Not found' });
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch {
    jsonResponse(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (url.pathname === '/understand') {
    const { message, audioUrl, type, role, currentState, availableIntents } = body;

    if (!message && !audioUrl) {
      jsonResponse(res, 400, { error: '"message" or "audioUrl" required' });
      return;
    }

    if (!Array.isArray(availableIntents) || availableIntents.length === 0) {
      jsonResponse(res, 400, { error: '"availableIntents" must be a non-empty array' });
      return;
    }

    try {
      const result = await Promise.race([
        classify({
          message: audioUrl ? `[Audio message] ${message || ''}` : message,
          type,
          role,
          currentState: currentState || 'UNKNOWN',
          availableIntents,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('GATEWAY_TIMEOUT')), TIMEOUT_MS)
        ),
      ]);

      jsonResponse(res, 200, result);
    } catch (error) {
      const message = error.message;
      if (message === 'GATEWAY_TIMEOUT') {
        jsonResponse(res, 504, {
          intent: 'unknown',
          entities: {},
          language: 'unknown',
          provider: 'qwen',
          processingMs: TIMEOUT_MS,
          error: 'timeout',
        });
      } else {
        jsonResponse(res, 502, {
          intent: 'unknown',
          entities: {},
          language: 'unknown',
          provider: 'qwen',
          processingMs: 0,
          error: message,
        });
      }
    }
    return;
  }

  if (url.pathname === '/extract') {
    const { rawText } = body;

    if (!rawText || typeof rawText !== 'string') {
      jsonResponse(res, 400, { error: '"rawText" must be a non-empty string' });
      return;
    }

    try {
      const result = await Promise.race([
        extract(rawText),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('EXTRACTION_GATEWAY_TIMEOUT')), EXTRACTION_TIMEOUT_MS)
        ),
      ]);

      jsonResponse(res, 200, result);
    } catch (error) {
      const message = error.message;
      if (message === 'EXTRACTION_GATEWAY_TIMEOUT') {
        jsonResponse(res, 504, {
          structuredJson: null,
          model: 'qwen',
          processingMs: EXTRACTION_TIMEOUT_MS,
          error: 'timeout',
        });
      } else {
        jsonResponse(res, 502, {
          structuredJson: null,
          model: 'qwen',
          processingMs: 0,
          error: message,
        });
      }
    }
    return;
  }

  jsonResponse(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`AI Gateway running on port ${PORT}`);
  console.log(`POST /understand - intent classification`);
  console.log(`POST /extract    - prescription extraction`);
  console.log(`GET  /health     - health check`);
});
