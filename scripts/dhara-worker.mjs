#!/usr/bin/env node

/**
 * DHARA Worker — async job processor
 *
 * Polls media_processing_jobs every 10s, claims via atomic
 * UPDATE ... RETURNING, transitions through:
 *   queued → processing → completed
 *   queued → processing → failed
 *
 * Job types:
 *   ocr        — Runs OCR (MiniCPM-V via Kali), stores raw_text, enqueues extraction
 *   extraction — Runs Qwen extraction via Kali, stores structured_json
 *   fail_test  — Intentionally fails for testing
 *
 * Usage:
 *   node scripts/dhara-worker.mjs
 *
 * systemd:
 *   sudo ln -s /home/mrigesh/Desktop/Khazana/clinic-bot/dhara-worker.service /etc/systemd/system/
 *   sudo systemctl daemon-reload
 *   sudo systemctl enable --now dhara-worker
 */

import { readFileSync, existsSync } from 'fs';
import postgres from 'postgres';
import { randomUUID, createHash } from 'crypto';
import { extractPrescription } from '../src/lib/ai/extractionClient.js';
import { performOcr } from '../src/lib/ai/ocrClient.js';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

// Load .env.local if present (systemd's EnvironmentFile handles it in production).
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Config ──────────────────────────────────────────────────
const POLL_INTERVAL_MS = 10_000;
const CLAIM_LIMIT = 10;
const WORKER_ID = randomUUID();

const EXTRACTION_EXTRACTOR_TYPE = 'prescription_ocr';
const EXTRACTION_EXTRACTOR_VERSION = 'v1';

const EXTRACTION_JOB_VERSION = 'extraction-v1';

// ── Logger ───────────────────────────────────────────────────
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? 1;

function log(level, message, data = {}) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'dhara-worker',
    workerId: WORKER_ID,
    ...data,
  };
  const output = JSON.stringify(entry);
  if (level === 'error') console.error(output);
  else console.log(output);
}

const logger = {
  debug: (msg, d) => log('debug', msg, d),
  info: (msg, d) => log('info', msg, d),
  warn: (msg, d) => log('warn', msg, d),
  error: (msg, d) => log('error', msg, d),
};

// ── DB connection ────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  logger.error('WORKER_CONFIG_MISSING', { reason: 'DATABASE_URL not set' });
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 3,
  idle_timeout: 15,
  connect_timeout: 15,
  max_lifetime: 300,
});

// ── Helpers ──────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const extractionIdempotencyKey = (mediaAssetId, extractorVersion) =>
  createHash('sha256').update(`${mediaAssetId}:${extractorVersion}`).digest('hex');

function createR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY,
    },
  });
}

async function downloadFromR2(key) {
  logger.info('R2_DOWNLOAD_START', { key });
  const response = await createR2Client().send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET || 'clinic-bot',
    Key: key,
  }));
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  logger.info('R2_DOWNLOAD_COMPLETE', { key, sizeBytes: buffer.length });
  return buffer;
}

// ── Job handlers ─────────────────────────────────────────────

async function handleOcrJob(job) {
  const extIdKey = extractionIdempotencyKey(job.media_asset_id, EXTRACTION_EXTRACTOR_VERSION);

  // 1. Query media_asset for R2 key and mime type.
  const [asset] = await sql`
    SELECT r2_key, mime_type FROM media_assets WHERE id = ${job.media_asset_id}
  `;

  if (!asset || !asset.r2_key) {
    throw new Error(`media_asset ${job.media_asset_id} not found or missing r2_key`);
  }

  logger.info('OCR_ASSET_FOUND', {
    jobId: job.id,
    mediaAssetId: job.media_asset_id,
    r2Key: asset.r2_key,
    mimeType: asset.mime_type,
  });

  // 2. Download image from R2.
  const imageBuffer = await downloadFromR2(asset.r2_key);

  // 3. Run OCR via MiniCPM-V.
  const { rawText, model, processingMs } = await performOcr(imageBuffer);

  logger.info('OCR_RESULT', {
    jobId: job.id,
    mediaAssetId: job.media_asset_id,
    ocrModel: model,
    ocrProcessingMs: processingMs,
    rawTextLength: rawText.length,
  });

  // 4. Store raw_text in prescription_extractions.
  const [extraction] = await sql`
    INSERT INTO prescription_extractions (
      media_asset_id,
      extractor_type,
      extractor_version,
      status,
      raw_text,
      idempotency_key,
      interpreted_at,
      extraction_status
    ) VALUES (
      ${job.media_asset_id},
      ${EXTRACTION_EXTRACTOR_TYPE},
      ${EXTRACTION_EXTRACTOR_VERSION},
      'completed',
      ${rawText},
      ${extIdKey},
      NOW(),
      'ocr_completed'
    )
    ON CONFLICT (idempotency_key) DO UPDATE
      SET
        raw_text = COALESCE(prescription_extractions.raw_text, ${rawText}),
        extraction_status = CASE
          WHEN prescription_extractions.extraction_status = 'pending' THEN 'ocr_completed'
          ELSE prescription_extractions.extraction_status
        END
    RETURNING id
  `;

  logger.info('EXTRACTION_CREATED', {
    jobId: job.id,
    mediaAssetId: job.media_asset_id,
    extractionId: extraction.id,
    ocrModel: model,
    ocrProcessingMs: processingMs,
  });

  // 5. Enqueue extraction job (deferred — worker will pick it up next poll).
  const extJobIdempotencyKey = extractionIdempotencyKey(job.media_asset_id, EXTRACTION_JOB_VERSION);

  await sql`
    INSERT INTO media_processing_jobs (
      media_asset_id,
      job_type,
      status,
      payload,
      idempotency_key
    ) VALUES (
      ${job.media_asset_id},
      'extraction',
      'queued',
      ${sql.json({ extraction_id: extraction.id })},
      ${extJobIdempotencyKey}
    )
    ON CONFLICT (idempotency_key) DO NOTHING
  `;

  logger.info('EXTRACTION_JOB_ENQUEUED', {
    jobId: job.id,
    mediaAssetId: job.media_asset_id,
    extractionId: extraction.id,
  });

  // 6. Mark OCR job as completed.
  await sql`
    UPDATE media_processing_jobs
    SET status = 'completed', completed_at = NOW()
    WHERE id = ${job.id}
  `;

  logger.info('JOB_COMPLETED', {
    jobId: job.id,
    jobType: job.job_type,
    mediaAssetId: job.media_asset_id,
    ocrModel: model,
    ocrProcessingMs: processingMs,
    rawTextLength: rawText.length,
  });
}

async function handleExtractionJob(job, payload) {
  const extractionId = payload?.extraction_id;

  if (!extractionId) {
    throw new Error('Extraction job payload missing extraction_id');
  }

  logger.info('EXTRACTION_JOB_STARTED', {
    jobId: job.id,
    extractionId,
    mediaAssetId: job.media_asset_id,
  });

  const [extraction] = await sql`
    SELECT id, raw_text, extraction_status
    FROM prescription_extractions
    WHERE id = ${extractionId}
  `;

  if (!extraction) {
    throw new Error(`Extraction record ${extractionId} not found`);
  }

  if (extraction.extraction_status === 'extraction_completed') {
    logger.warn('EXTRACTION_ALREADY_COMPLETED', { extractionId });
    await sql`
      UPDATE media_processing_jobs
      SET status = 'completed', completed_at = NOW()
      WHERE id = ${job.id}
    `;
    return;
  }

  if (!extraction.raw_text) {
    throw new Error(`No raw_text available for extraction ${extractionId}`);
  }

  const result = await extractPrescription(extraction.raw_text);

  logger.info('EXTRACTION_RESULT_RECEIVED', {
    extractionId,
    model: result.model,
    processingMs: result.processingMs,
  });

  await sql`
    UPDATE prescription_extractions
    SET
      structured_json = ${sql.json(result.structuredJson)},
      extraction_status = 'extraction_completed',
      extraction_model = ${result.model},
      extraction_version = 'qwen-extraction-v1',
      extraction_completed_at = NOW()
    WHERE id = ${extractionId}
  `;

  await sql`
    UPDATE media_processing_jobs
    SET status = 'completed', completed_at = NOW()
    WHERE id = ${job.id}
  `;

  logger.info('JOB_COMPLETED', {
    jobId: job.id,
    jobType: job.job_type,
    mediaAssetId: job.media_asset_id,
    extractionCompleted: true,
  });
}

// ── Worker lifecycle ─────────────────────────────────────────
let running = true;

async function doWork() {
  try {
    const claimed = await sql`
      WITH claimed AS (
        SELECT id
        FROM media_processing_jobs
        WHERE status = 'queued'
        ORDER BY created_at
        LIMIT ${CLAIM_LIMIT}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE media_processing_jobs j
      SET
        status = 'processing',
        started_at = NOW(),
        attempt_count = attempt_count + 1
      FROM claimed
      WHERE j.id = claimed.id
      RETURNING
        j.id,
        j.media_asset_id,
        j.job_type,
        j.attempt_count,
        j.payload
    `;

    if (claimed.length === 0) return;

    for (const job of claimed) {
      logger.info('JOB_CLAIMED', {
        jobId: job.id,
        jobType: job.job_type,
        attemptCount: job.attempt_count,
        mediaAssetId: job.media_asset_id,
      });

      try {
        if (job.job_type === 'fail_test') {
          throw new Error('Intentional failure');
        }

        if (job.job_type === 'ocr') {
          await handleOcrJob(job);
        } else if (job.job_type === 'extraction') {
          await handleExtractionJob(job, job.payload);
        } else {
          // Unknown job types: fake work and complete directly.
          await sleep(500 + Math.random() * 1000);

          await sql`
            UPDATE media_processing_jobs
            SET status = 'completed', completed_at = NOW()
            WHERE id = ${job.id}
          `;

          logger.info('JOB_COMPLETED', {
            jobId: job.id,
            jobType: job.job_type,
            mediaAssetId: job.media_asset_id,
          });
        }
      } catch (err) {
        await sql`
          UPDATE media_processing_jobs
          SET
            status = 'failed',
            error_message = ${err.message},
            completed_at = NOW()
          WHERE id = ${job.id}
        `;

        logger.warn('JOB_FAILED', {
          jobId: job.id,
          jobType: job.job_type,
          mediaAssetId: job.media_asset_id,
          error: err.message,
        });
      }
    }
  } catch (err) {
    logger.error('WORKER_POLL_FAILED', { error: err.message });
  }
}

async function shutdown(signal) {
  logger.info('WORKER_STOPPED', { reason: signal, pid: process.pid });
  running = false;
  try {
    await sql.end({ timeout: 5 });
  } catch {
    // Force exit even if pool drain hangs.
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

(async () => {
  logger.info('WORKER_STARTED', {
    pid: process.pid,
    pollInterval: POLL_INTERVAL_MS,
    claimLimit: CLAIM_LIMIT,
    nodeVersion: process.version,
  });

  while (running) {
    await doWork();
    if (running) await sleep(POLL_INTERVAL_MS);
  }
})();
