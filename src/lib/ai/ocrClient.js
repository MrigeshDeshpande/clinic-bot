import { readFileSync } from 'fs';
import { resolve } from 'path';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OCR_MODEL = process.env.OCR_MODEL || 'minicpm-v:latest';
const OCR_TIMEOUT_MS = parseInt(process.env.OCR_TIMEOUT_MS || '120000', 10);

export async function performOcr(imageBuffer) {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    throw new Error('imageBuffer must be a Buffer');
  }

  const imageBase64 = imageBuffer.toString('base64');
  const startTime = Date.now();

  const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OCR_MODEL,
      stream: false,
      options: { temperature: 0 },
      messages: [{
        role: 'user',
        content: 'Read all text from this dental prescription image. Return the text exactly as written, preserving numbers, dates, and medical terms. Do not summarize or interpret.',
        images: [imageBase64],
      }],
    }),
    signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    throw new Error(`OCR API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const processingMs = Date.now() - startTime;

  return {
    rawText: (data?.message?.content || '').trim(),
    model: OCR_MODEL,
    processingMs,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.url.replace('file://', ''))) {
  const [,, imagePath] = process.argv;
  if (!imagePath) {
    console.error('Usage: node src/lib/ai/ocrClient.js <image-path>');
    process.exit(1);
  }
  const buffer = readFileSync(resolve(imagePath));
  performOcr(buffer).then(r => {
    console.log(JSON.stringify({ rawText: r.rawText, model: r.model, processingMs: r.processingMs }, null, 2));
  }).catch(e => {
    console.error('OCR failed:', e.message);
    process.exit(1);
  });
}
