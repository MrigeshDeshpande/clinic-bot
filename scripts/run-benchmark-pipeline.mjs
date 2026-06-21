import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';


const __dirname = dirname(fileURLToPath(import.meta.url));

// Manually load .env.local (Next.js does this automatically, but we're running standalone)
import { readFileSync } from 'fs';
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

async function getSql() {
  const { default: postgres } = await import('postgres');
  return postgres(process.env.DATABASE_URL);
}

const { performOcr } = await import(resolve(__dirname, '../src/lib/ai/ocrClient.js'));

const CASES = [
  {
    id: 'case-002',
    dir: 'case-002',
    patientName: 'Raynush Jaiswal',
    patientPhone: '9222222222',
  },
];

async function run() {
  const sql = await getSql();

  for (const c of CASES) {
    console.log(`\n=== Processing ${c.id} ===`);

    // Create patient
    const [patient] = await sql`
      INSERT INTO patients (name, phone) VALUES (${c.patientName}, ${c.patientPhone})
      ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;
    console.log(`  Patient: ${patient.id}`);

    // Create appointment
    const [appointment] = await sql`
      INSERT INTO appointments (patient_id, patient_phone, wa_id, date, status)
      VALUES (${patient.id}, ${c.patientPhone}, ${c.patientPhone}, CURRENT_DATE, 'completed')
      RETURNING id
    `;
    console.log(`  Appointment: ${appointment.id}`);

    const frontPath = resolve(__dirname, `../benchmarks/prescriptions/${c.dir}/front.png`);
    const backPath = resolve(__dirname, `../benchmarks/prescriptions/${c.dir}/back.png`);

    // Step 1: OCR front
    console.log(`  OCR front...`);
    const frontBuf = await readFile(frontPath);
    const frontResult = await performOcr(frontBuf);
    console.log(`  Front OCR: ${frontResult.rawText.length} chars`);

    // Step 2: OCR back
    console.log(`  OCR back...`);
    const backBuf = await readFile(backPath);
    const backResult = await performOcr(backBuf);
    console.log(`  Back OCR: ${backResult.rawText.length} chars`);

    // Step 3: Combine texts
    const combinedText = `=== FRONT ===\n${frontResult.rawText}\n\n=== BACK ===\n${backResult.rawText}`;
    console.log(`  Combined: ${combinedText.length} chars`);

    // Step 4: Create media_asset
    const r2Key = `prescriptions/${c.id}/${Date.now()}_front.png`;
    const [mediaAsset] = await sql`
      INSERT INTO media_assets (patient_id, appointment_id, r2_key, mime_type, media_type, uploaded_by_type)
      VALUES (${patient.id}, ${appointment.id}, ${r2Key}, 'image/png', 'prescription', 'dhara')
      RETURNING id
    `;
    console.log(`  Media asset: ${mediaAsset.id}`);

    // Step 5: Create extraction record with combined text
    const idempotencyKey = `benchmark-${c.id}-${Date.now()}`;
    const [extraction] = await sql`
      INSERT INTO prescription_extractions (media_asset_id, raw_text, extraction_status, extractor_type, extractor_version, idempotency_key)
      VALUES (${mediaAsset.id}, ${combinedText}, 'extraction_completed', 'qwen', 'benchmark-v1', ${idempotencyKey})
      RETURNING id
    `;
    console.log(`  Extraction record: ${extraction.id}`);

    // Step 6: Call Qwen extraction (direct Ollama, bypass Kali for reliable timeout control)
    const startTime = Date.now();
    console.log(`  Calling Qwen extraction (direct Ollama, 180s timeout)...`);
    const extractionPrompt = `You are a dental prescription OCR extractor. Extract all information from the prescription text and return ONLY valid JSON. No markdown, no code fences, no prose.

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

${combinedText}`;

    const ollamaBody = {
      model: 'qwen2.5-coder:latest',
      stream: false,
      options: { temperature: 0.1, top_p: 0.9 },
      messages: [
        { role: 'system', content: 'You are a dental prescription OCR extractor. Return ONLY valid JSON.' },
        { role: 'user', content: extractionPrompt },
      ],
    };

    const ollamaRes = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaBody),
      signal: AbortSignal.timeout(300000),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text().catch(() => 'unknown');
      console.error(`  Qwen error ${ollamaRes.status}: ${errText}`);
      await sql`
        UPDATE prescription_extractions
        SET error_message = ${`Qwen failed: ${ollamaRes.status} ${errText}`},
            extraction_status = 'pending'
        WHERE id = ${extraction.id}
      `;
      continue;
    }

    const ollamaData = await ollamaRes.json();
    const content = ollamaData?.message?.content || '';
    const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '');
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error(`  No JSON found in Qwen response: ${content.slice(0, 200)}`);
      await sql`
        UPDATE prescription_extractions
        SET error_message = 'No JSON found in Qwen response',
            extraction_status = 'pending'
        WHERE id = ${extraction.id}
      `;
      continue;
    }

    let structuredJson;
    try {
      structuredJson = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error(`  Failed to parse Qwen JSON: ${e.message}`);
      await sql`
        UPDATE prescription_extractions
        SET error_message = ${`JSON parse error: ${e.message}`},
            extraction_status = 'pending'
        WHERE id = ${extraction.id}
      `;
      continue;
    }

    const processingMs = Date.now() - startTime;

    // Step 7: Update with structured_json
    await sql`
      UPDATE prescription_extractions
      SET
        structured_json = ${sql.json(structuredJson)},
        extraction_model = 'qwen2.5-coder:latest',
        extraction_version = 'qwen-benchmark-v1',
        extraction_completed_at = NOW()
      WHERE id = ${extraction.id}
    `;

    console.log(`  DONE (${processingMs}ms) — ${structuredJson.patient?.name || 'unknown'}`);
  }

  // Verify
  const rows = await sql`
    SELECT pe.id, pe.extraction_status,
           p.name AS patient_name, pe.structured_json->'patient'->>'name' AS extracted_name
    FROM prescription_extractions pe
    LEFT JOIN media_assets ma ON ma.id = pe.media_asset_id
    LEFT JOIN patients p ON p.id = ma.patient_id
    WHERE pe.extraction_status = 'extraction_completed'
  `;
  console.log(`\n=== Review UI will show ${rows.length} extractions ===`);
  for (const r of rows) {
    console.log(`  ${r.id} | patient: ${r.patient_name} | extracted: ${r.extracted_name}`);
  }

  await sql.end();
  console.log('\nDone!');
}

run().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
