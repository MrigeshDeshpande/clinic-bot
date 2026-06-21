# OCR → Qwen Extraction Pipeline Architecture

## Overview

Two-stage AI pipeline that transforms prescription images into structured clinical data:

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
│  Image   │ →  │  MiniCPM-V   │ →  │ Qwen2.5-Coder│ →  │  Review  │
│ (PNG)    │    │  (OCR)       │    │  (Extraction)│    │  UI      │
└──────────┘    └──────────────┘    └──────────────┘    └──────────┘
                     Stage 1              Stage 2
```

## Current State (Gaps)

| Component | Status | Notes |
|---|---|---|
| `POST /extract` on Kali | ✅ Exists | Calls Qwen2.5-Coder via Ollama |
| `POST /ocr` on Kali | ❌ Missing | Need to add |
| `ocrClient.js` | ❌ Missing | Need to create |
| `extractionClient.js` | ✅ Exists | Calls `KALI_AI_URL/extract` |
| Worker `handleOcrJob()` | ❌ Stub | Hardcoded fake data |
| Worker `handleExtractionJob()` | ✅ Real | Calls `extractPrescription()` |
| OCR job enqueue on upload | ❌ Missing | Media upload doesn't enqueue |
| KALI_AI_URL in `.env.local` | ❌ Missing | Not configured |
| Kali AI gateway process | ❌ Not running | Needs `node ai-gateway/server.js` |

## Ollama Models Available

```
http://localhost:11434

minicpm-v:latest    ← Vision model for OCR (Stage 1)
qwen2.5-coder:latest ← Text model for extraction (Stage 2)
llava:7b            ← Alternative vision model (fallback for OCR)
```

## Target Architecture

### Stage 1: OCR (MiniCPM-V)

```
Image (PNG) ──► Kali POST /ocr ──► Ollama minicpm-v ──► Raw text
                 │                                       │
             { imageBase64,                           { rawText,
               mimeType }                              model,
                                                       processingMs }
```

### Stage 2: Extraction (Qwen2.5-Coder)

```
Raw text ──► Kali POST /extract ──► Ollama qwen2.5-coder ──► Structured JSON
               │                                               │
           { rawText }                                     { structuredJson,
                                                             model,
                                                             processingMs }
```

### Full Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DASHBOARD / WHATSAPP                          │
│  Upload prescription image → POST /api/dashboard/media               │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Media Upload Route                                                  │
│  1. Store image in R2 (Cloudflare)                                   │
│  2. INSERT into media_assets (r2_key, appointment_id, patient_id)    │
│  3. ENQUEUE 'ocr' job in media_processing_jobs  ← NEW               │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  dhara-worker.mjs (polls every 10s)                                  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ handleOcrJob(job)                           ← REWRITE       │     │
│  │  1. Get media_asset_id from job                               │     │
│  │  2. Query media_assets for r2_key                             │     │
│  │  3. Download image from R2 via getR2Object(r2_key)            │     │
│  │  4. Convert image buffer to base64                            │     │
│  │  5. POST /ocr — sends { imageBase64, mimeType }               │     │
│  │  6. Store raw_text in prescription_extractions                │     │
│  │  7. Set extraction_status = 'ocr_completed'                   │     │
│  │  8. Enqueue 'extraction' job                                  │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                           │                                          │
│                           ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ handleExtractionJob(job)                   ← EXISTS (real)  │     │
│  │  1. Get extraction_id from job payload                        │     │
│  │  2. Query prescription_extractions for raw_text              │     │
│  │  3. Call extractPrescription(raw_text)                       │     │
│  │     → POST KALI_AI_URL/extract                               │     │
│  │     → Qwen parses text → structured JSON                     │     │
│  │  4. Store structured_json                                    │     │
│  │  5. Set extraction_status = 'extraction_completed'           │     │
│  └─────────────────────────────────────────────────────────────┘     │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Review UI (/dashboard/extractions)                                  │
│                                                                      │
│  ┌─────────────────────────┐  ┌─────────────────────────────────┐   │
│  │  Raw OCR Text           │  │  Extracted Data (Qwen JSON)     │   │
│  │  (MiniCPM-V output)     │  │                                 │   │
│  │                         │  │  ┌─ Patient ─────────────────┐  │   │
│  │  "RCT advised for       │  │  │ Name, Age, Sex, Phone    │  │   │
│  │   tooth 46. Caries      │  │  └──────────────────────────┘  │   │
│  │   detected. Estimate    │  │  ┌─ Diagnoses ──────────────┐  │   │
│  │   3000/-."              │  │  │ Caries → tooth 46        │  │   │
│  │                         │  │  └──────────────────────────┘  │   │
│  │  [Show] [Hide]          │  │  ┌─ Treatment Recs ─────────┐  │   │
│  └─────────────────────────┘  │  │ RCT → tooth 46          │  │   │
│                                │  └──────────────────────────┘  │   │
│  ┌── Review Actions ────────┐ │  ┌─ Financial Estimates ────┐  │   │
│  │ [Approve]  [Reject]      │ │  │ RCT: 3000 INR            │  │   │
│  └──────────────────────────┘ │  └──────────────────────────┘  │   │
│                               └─────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

## Data Structures

### prescription_extractions (pipeline status)

```
status (OCR job):    pending → completed / failed
extraction_status (pipeline):
  pending → ocr_completed → extraction_completed → review_pending → approved
                                                                  → rejected
```

### media_processing_jobs (async queue)

```
job_type: 'ocr' | 'extraction'
status:   queued → processing → completed / failed
payload:  { extraction_id: uuid }   (only for extraction jobs)
```

### OCR Request/Response (Kali gateway)

```
POST /ocr
Request:  { imageBase64: string, mimeType: string }
Response: { rawText: string, model: string, processingMs: number }
Errors:   400 (missing fields), 504 (timeout), 502 (Ollama error)
```

### Extraction Request/Response (Kali gateway — EXISTS)

```
POST /extract
Request:  { rawText: string }
Response: { structuredJson: object, model: string, processingMs: number }
Errors:   400 (missing rawText), 504 (timeout), 502 (Qwen error)
```

## DB Schema

### media_assets (immutable image store)

| Column | Type | Purpose |
|---|---|---|
| id | UUID PK | |
| appointment_id | UUID FK | Link to appointment |
| patient_id | UUID FK | Link to patient |
| r2_key | TEXT UNIQUE | Path in R2 bucket |
| mime_type | VARCHAR(100) | image/png, image/jpeg |
| media_type | VARCHAR(50) | 'photo' for prescriptions |

### prescription_extractions (interpretation results)

| Column | Type | Purpose |
|---|---|---|
| id | UUID PK | |
| media_asset_id | UUID FK | CASCADE on delete |
| raw_text | TEXT | MiniCPM-V OCR output |
| structured_json | JSONB | Qwen structured extraction |
| extraction_status | VARCHAR(20) | Pipeline state machine |
| extraction_model | VARCHAR(50) | Model used for extraction |
| idempotency_key | TEXT UNIQUE | Prevents duplicate processing |

### media_processing_jobs (async job queue)

| Column | Type | Purpose |
|---|---|---|
| id | UUID PK | |
| media_asset_id | UUID FK | |
| job_type | VARCHAR(50) | 'ocr' or 'extraction' |
| status | VARCHAR(20) | queued/processing/completed/failed |
| payload | JSONB | Job-specific data |
| idempotency_key | TEXT UNIQUE | Prevents duplicate enqueue |

## Implementation Plan

### Step 1: OCR Provider in Kali Gateway

**Files:**
- `ai-gateway/providers/ocr.js` — NEW
- `ai-gateway/server.js` — MODIFY (add `/ocr` route)

**`providers/ocr.js`:**
```js
const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const OCR_MODEL = process.env.OCR_MODEL || 'minicpm-v:latest';
const OCR_TIMEOUT_MS = parseInt(process.env.OCR_TIMEOUT_MS || '120000', 10);

export async function ocr(imageBase64, mimeType) {
  const body = {
    model: OCR_MODEL,
    stream: false,
    options: { temperature: 0 },
    messages: [{
      role: 'user',
      content: 'Read all text from this prescription image. Return the text exactly as written, preserving numbers, dates, and medical terms. Do not summarize or interpret.',
      images: [imageBase64],
    }],
  };

  const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return { rawText: data.message.content.trim() };
}
```

**`server.js` addition:**
```js
import { ocr } from './providers/ocr.js';

if (url.pathname === '/ocr') {
  const { imageBase64, mimeType } = body;
  if (!imageBase64 || !mimeType) {
    jsonResponse(res, 400, { error: '"imageBase64" and "mimeType" required' });
    return;
  }
  const result = await ocr(imageBase64, mimeType);
  jsonResponse(res, 200, result);
}
```

### Step 2: OCR Client (`src/lib/ai/ocrClient.js`)

Mirrors `extractionClient.js`:
```js
export async function ocrPrescription(imageBuffer, mimeType) {
  const KALI_AI_URL = process.env.KALI_AI_URL;
  const OCR_TIMEOUT_MS = parseInt(process.env.OCR_TIMEOUT_MS || '120000', 10);

  const imageBase64 = imageBuffer.toString('base64');
  const response = await fetch(`${KALI_AI_URL}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType }),
    signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
  });

  const data = await response.json();
  return { rawText: data.rawText, model: data.model, processingMs: data.processingMs };
}
```

### Step 3: Rewrite Worker's `handleOcrJob`

Replace the stub in `scripts/dhara-worker.mjs`:
1. Get media_asset_id from job
2. Query `media_assets` for `r2_key`, `mime_type`
3. Download from R2: `getR2Object(r2_key)` → buffer
4. If front+back images exist (check both assets), OCR both and combine
5. Call `ocrClient.ocrPrescription(buffer, mimeType)`
6. Store `raw_text` in `prescription_extractions`, set `extraction_status = 'ocr_completed'`
7. Enqueue `extraction` job

### Step 4: Wire Media Upload → OCR Job

In `src/app/api/dashboard/media/route.js` and/or `src/lib/media.js`:
- After successful `media_assets` INSERT, enqueue `ocr` job:
```sql
INSERT INTO media_processing_jobs (media_asset_id, job_type, status, idempotency_key)
VALUES (${mediaAssetId}, 'ocr', 'queued', ${idempotencyKey})
ON CONFLICT (idempotency_key) DO NOTHING
```

### Step 5: One-Shot Population Script

`scripts/populate-extractions.mjs` — processes all 3 cases:
1. For each `benchmarks/prescriptions/case-00{N}/`:
   - Read `front.png` → OCR → text_front
   - Read `back.png` → OCR → text_back
   - Combine: `=== FRONT ===\n${text_front}\n=== BACK ===\n${text_back}`
   - Call `performExtraction()` or directly enqueue extraction
2. Sets all extractions to `extraction_completed` for review UI visibility

### Step 6: Config

Add to `.env.local`:
```
KALI_AI_URL=http://localhost:3002
OCR_TIMEOUT_MS=120000
```

## Key Design Decisions

1. **Kali gateway is the single entry point** — All model calls go through `KALI_AI_URL`, not direct to Ollama. The worker, the client, and the dashboard all use this same pattern.

2. **OCR and extraction are separate jobs** — Independent retryability. If OCR fails, re-run only OCR. If Qwen fails, re-run only extraction. No wasted compute.

3. **Front + back images processed independently** — Each image gets its own OCR call. Text is combined with `=== FRONT ===` / `=== BACK ===` delimiters so Qwen knows which side is which.

4. **raw_text is the contract between stages** — Stage 1 writes it, Stage 2 reads it. No shared state. Clean separation.

5. **Worker already handles the extraction flow correctly** — Only the OCR stub needs replacing. `handleExtractionJob` (lines 197-265) is production-ready.

6. **Idempotency keys prevent duplicates** — Both `prescription_extractions.idempotency_key` and `media_processing_jobs.idempotency_key` are `UNIQUE` with `ON CONFLICT DO NOTHING`.
