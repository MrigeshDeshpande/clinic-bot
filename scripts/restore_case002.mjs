import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually
try {
  const envFile = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

const EXTRACTION_ID = 'cd8ba585-6303-4009-aa82-7bae5ddc2190';
const { default: postgres } = await import('postgres');
const sql = postgres(process.env.DATABASE_URL);

const [row] = await sql`SELECT raw_text FROM prescription_extractions WHERE id = ${EXTRACTION_ID}`;
if (!row || !row.raw_text) {
  console.error('No raw_text found');
  process.exit(1);
}

console.log(`Raw text: ${row.raw_text.length} chars`);

const prompt = `You are a dental prescription OCR extractor. Extract all information from the prescription text and return ONLY valid JSON. No markdown, no code fences, no prose.

Return this exact JSON structure:
{
  "patient": { "name": "string or null", "age": "number or null", "sex": "string or null", "phone": "string or null", "date": "date string or null" },
  "observations": [{ "finding": "string", "tooth_numbers": ["string"], "severity": "string or null" }],
  "diagnoses": [{ "diagnosis": "string", "tooth_numbers": ["string"], "surface": "string or null", "notes": "string or null" }],
  "treatment_recommendations": [{ "procedure": "string", "tooth_numbers": ["string"], "cost_estimate": "number or null", "notes": "string or null" }],
  "completed_treatments": [{ "procedure": "string", "tooth_numbers": ["string"], "notes": "string or null" }],
  "medications": [{ "name": "string", "dosage": "string or null", "duration": "string or null", "notes": "string or null" }],
  "financial_estimates": [{ "item": "string", "amount": "number or null", "notes": "string or null" }],
  "followups": [{ "date": "string or null", "instructions": "string or null" }],
  "unclassified_notes": ["string"]
}

Prescription OCR text:

${row.raw_text}`;

const body = {
  model: 'qwen2.5-coder:latest',
  stream: false,
  options: { temperature: 0.1, top_p: 0.9 },
  messages: [
    { role: 'system', content: 'You are a dental prescription OCR extractor. Return ONLY valid JSON.' },
    { role: 'user', content: prompt },
  ],
};

console.log('Calling Qwen...');
const start = Date.now();
const res = await fetch('http://localhost:11434/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(300000),
});

if (!res.ok) throw new Error(`Qwen error ${res.status}: ${await res.text()}`);
const data = await res.json();
const content = data?.message?.content || '';
const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '');
const match = cleaned.match(/\{[\s\S]*\}/);
if (!match) throw new Error(`No JSON found: ${content.slice(0, 200)}`);

const structuredJson = JSON.parse(match[0]);
console.log(`Done in ${Date.now() - start}ms`);
console.log(`Patient: ${structuredJson.patient?.name}`);
console.log(`Diagnoses: ${structuredJson.diagnoses?.length}`);
console.log(`Treatments: ${structuredJson.treatment_recommendations?.length}`);

await sql`
  UPDATE prescription_extractions
  SET structured_json = ${sql.json(structuredJson)},
      extraction_model = 'qwen2.5-coder:latest',
      extraction_version = 'qwen-benchmark-v1',
      extraction_completed_at = NOW()
  WHERE id = ${EXTRACTION_ID}
`;

console.log('Updated!');
await sql.end();
