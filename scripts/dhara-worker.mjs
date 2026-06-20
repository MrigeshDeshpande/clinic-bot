#!/usr/bin/env node

/**
 * DHARA Worker — async job processor
 *
 * Polls media_processing_jobs every 10s, claims via atomic
 * UPDATE ... RETURNING, transitions through:
 *   queued → processing → completed
 *   queued → processing → failed
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

// ── Worker lifecycle ─────────────────────────────────────────
let running = true;

async function doWork() {
  try {
    // Claim up to CLAIM_LIMIT jobs atomically.
    // Locks rows (SKIP LOCKED), transitions to processing,
    // increments attempt_count, returns only needed columns.
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
          // Simulate OCR work (staggered).
          await sleep(500 + Math.random() * 1000);

          // Build idempotency key: sha256(media_asset_id:extractor_version)
          const extIdKey = extractionIdempotencyKey(job.media_asset_id, EXTRACTION_EXTRACTOR_VERSION);

          // Hardcoded extraction data — no AI yet. Will be replaced by Gemini in PR-7D.
          const rawText = 'RCT advised for tooth 46. Caries detected.';
          const structuredJson = {
            procedure: 'rct',
            tooth: '46',
            diagnosis: 'caries',
            findings: [
              { tooth: '46', procedure: 'RCT', surface: 'O', severity: 'moderate' },
            ],
          };
          const confidence = 0.95;

          await sql`
            INSERT INTO prescription_extractions (
              media_asset_id,
              extractor_type,
              extractor_version,
              status,
              raw_text,
              structured_json,
              confidence,
              idempotency_key,
              interpreted_at
            ) VALUES (
              ${job.media_asset_id},
              ${EXTRACTION_EXTRACTOR_TYPE},
              ${EXTRACTION_EXTRACTOR_VERSION},
              'completed',
              ${rawText},
              ${sql.json(structuredJson)},
              ${confidence},
              ${extIdKey},
              NOW()
            )
            ON CONFLICT (idempotency_key) DO NOTHING
          `;

          logger.info('EXTRACTION_CREATED', {
            jobId: job.id,
            mediaAssetId: job.media_asset_id,
            extractorType: EXTRACTION_EXTRACTOR_TYPE,
            extractorVersion: EXTRACTION_EXTRACTOR_VERSION,
          });

          await sql`
            UPDATE media_processing_jobs
            SET status = 'completed', completed_at = NOW()
            WHERE id = ${job.id}
          `;

          logger.info('JOB_COMPLETED', {
            jobId: job.id,
            jobType: job.job_type,
            mediaAssetId: job.media_asset_id,
            extractionCreated: true,
          });
        } else {
          // Non-OCR job types: fake work and complete directly.
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
    // DB-level error during claim or update loop — log and retry next poll.
    logger.error('WORKER_POLL_FAILED', { error: err.message });
  }
}

// Future PR:
// Recover stale processing jobs where
// status='processing'
// and started_at older than threshold.

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

// ── Main loop ────────────────────────────────────────────────
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
