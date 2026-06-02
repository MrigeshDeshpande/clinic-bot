import { neon } from '@neondatabase/serverless';
import { logger } from '@/lib/logger';

const DATABASE_URL = process.env.DATABASE_URL;
const MAX_QUERY_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 3000;

let rawSql;
let sql;
let migrationsPromise;

const circuitBreaker = {
  failures: 0,
  lastFailureTime: 0,
  threshold: 3,
  cooldownMs: 60_000,
  open: false,
};

function isCircuitOpen() {
  if (!circuitBreaker.open) return false;
  const elapsed = Date.now() - circuitBreaker.lastFailureTime;
  if (elapsed >= circuitBreaker.cooldownMs) {
    circuitBreaker.open = false;
    circuitBreaker.failures = 0;
    return false;
  }
  return true;
}

function recordFailure() {
  circuitBreaker.failures++;
  circuitBreaker.lastFailureTime = Date.now();
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.open = true;
  }
}

function recordSuccess() {
  circuitBreaker.failures = 0;
  circuitBreaker.open = false;
}

function isNetworkError(error) {
  return error?.sourceError || error?.message?.includes('fetch failed') || error?.message?.includes('Error connecting to database');
}

function wrapWithRetry(fn) {
  const retryWrapper = async (...args) => {
    if (isCircuitOpen()) {
      throw new Error('Database circuit breaker open — connection unavailable');
    }
    for (let attempt = 1; attempt <= MAX_QUERY_RETRIES; attempt++) {
      try {
        const result = await fn(...args);
        recordSuccess();
        return result;
      } catch (error) {
        if (attempt === MAX_QUERY_RETRIES || !isNetworkError(error)) {
          recordFailure();
          throw error;
        }
        logger.warn('DB_QUERY_RETRY', { attempt, maxRetries: MAX_QUERY_RETRIES, error: error.message });
        await sleep(RETRY_BASE_DELAY_MS * attempt);
      }
    }
  };
  return retryWrapper;
}

export function getSql() {
  if (sql) return sql;

  if (!DATABASE_URL) {
    logger.warn('DATABASE_URL not set \u2014 running without persistence');
    sql = null;
    return sql;
  }

  rawSql = neon(DATABASE_URL);
  const retried = wrapWithRetry(rawSql);
  retried.query = wrapWithRetry(rawSql.query.bind(rawSql));
  retried.unsafe = wrapWithRetry(rawSql.unsafe.bind(rawSql));
  retried.transaction = (...args) => wrapWithRetry(rawSql.transaction.bind(rawSql))(...args);
  sql = retried;
  return sql;
}

export async function ensureConnection() {
  const db = getSql();
  if (!db) return false;
  try {
    await db`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runMigrations() {
  if (migrationsPromise) return migrationsPromise;

  migrationsPromise = (async () => {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const db = getSql();
    if (!db) {
      logger.warn('DB_MIGRATIONS_SKIPPED', { reason: 'DATABASE_URL not configured' });
      return;
    }

    try {
    await db`
      CREATE TABLE IF NOT EXISTS sessions (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_id            VARCHAR(50) NOT NULL UNIQUE,
        phone_number_id  VARCHAR(20),
        profile_name     VARCHAR(100),
        state            VARCHAR(50) NOT NULL DEFAULT 'IDLE',
        previous_state   VARCHAR(50),
        context          JSONB NOT NULL DEFAULT '{}',
        metrics          JSONB NOT NULL DEFAULT '{}',
        is_escalated     BOOLEAN NOT NULL DEFAULT FALSE,
        version          INTEGER NOT NULL DEFAULT 1,
        last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
      );
    `;

    await db`
      CREATE INDEX IF NOT EXISTS idx_sessions_wa_id ON sessions(wa_id);
    `;

    await db`
      CREATE TABLE IF NOT EXISTS messages (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        msg_id       VARCHAR(100) UNIQUE,
        session_id   UUID REFERENCES sessions(id) ON DELETE CASCADE,
        wa_id        VARCHAR(50) NOT NULL,
        role         VARCHAR(10) NOT NULL CHECK (role IN ('user','bot')),
        content      TEXT,
        intent       VARCHAR(50),
        metadata     JSONB DEFAULT '{}',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    await db`
      CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_id);
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_messages_msg_id ON messages(msg_id);
    `;

    await db`
      CREATE TABLE IF NOT EXISTS appointments (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        logical_id          UUID NOT NULL DEFAULT gen_random_uuid(),
        version             INTEGER NOT NULL DEFAULT 1,
        replaces_version    INTEGER,
        superseded_at       TIMESTAMPTZ,
        session_id          UUID REFERENCES sessions(id),
        wa_id               VARCHAR(20) NOT NULL,
        patient_name        VARCHAR(100),
        date                DATE NOT NULL,
        time                TIME,
        treatment           VARCHAR(100),
        status              VARCHAR(20) NOT NULL DEFAULT 'confirmed',
        reminder_sent_at    TIMESTAMPTZ,
        cancelled_at        TIMESTAMPTZ,
        cancellation_reason VARCHAR(255),
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT valid_appt_status CHECK (status IN ('confirmed','cancelled','completed','no_show'))
      );
    `;

    await db`
      CREATE INDEX IF NOT EXISTS idx_appointments_wa_id ON appointments(wa_id);
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_appointments_date_status ON appointments(date, status);
    `;

    // Add new columns if the table already exists (for existing installations)
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(255);
    `;

    // Migration: Add versioned identity columns for appointments (supersession model)
    // logical_id — stable identity across versions (same value across reschedules)
    // version — monotonically increasing, starts at 1
    // replaces_version — previous version this supersedes
    // superseded_at — when this version was superseded
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS logical_id UUID DEFAULT gen_random_uuid(),
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS replaces_version INTEGER,
        ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
    `;
    // Backfill existing rows: set logical_id = id (each existing row becomes its own chain)
    await db`
      UPDATE appointments SET logical_id = id WHERE logical_id IS NULL;
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_appointments_logical_id ON appointments(logical_id);
    `;
    // Unique constraint on (logical_id, version) prevents duplicate versions
    // in concurrent reschedule attempts
    await db`
      ALTER TABLE appointments DROP CONSTRAINT IF EXISTS unique_appointment_version;
    `;
    await db`
      ALTER TABLE appointments ADD CONSTRAINT unique_appointment_version UNIQUE (logical_id, version);
    `;
    // Prevent double-booking: only one confirmed appointment per time slot
    await db`
      DROP INDEX IF EXISTS idx_appointments_unique_slot;
    `;
    await db`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_slot
      ON appointments (date, time) WHERE status = 'confirmed';
    `;

    // Ensure appointments CREATE TABLE includes new columns for fresh installations
    // (table is created with IF NOT EXISTS, so new installs get the base columns first)
    // The ALTER TABLE above adds them for existing installations.
    // For fresh installs, update the CREATE TABLE statement.
    // For existing, the ALTER TABLE handles it.

    // Widen wa_id columns for existing installations (support replay test IDs)
    await db`
      ALTER TABLE sessions ALTER COLUMN wa_id TYPE VARCHAR(50);
    `;
    await db`
      ALTER TABLE appointments ALTER COLUMN wa_id TYPE VARCHAR(50);
    `;
    await db`
      ALTER TABLE messages ALTER COLUMN wa_id TYPE VARCHAR(50);
    `;

    // Reminder tracking — prevents duplicate 24h reminder sends
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
    `;

    // Blocked dates table for doctor schedule management
    await db`
      CREATE TABLE IF NOT EXISTS blocked_dates (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date       DATE NOT NULL UNIQUE,
        reason     VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // Patients table — persistent patient records independent of appointments
    await db`
      CREATE TABLE IF NOT EXISTS patients (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_id      VARCHAR(50),
        name       VARCHAR(100) NOT NULL,
        age        INTEGER,
        sex        VARCHAR(10),
        phone      VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    await db`
      CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_patients_wa_id ON patients(wa_id);
    `;

    await db`
      ALTER TABLE patients DROP CONSTRAINT IF EXISTS unique_patient_phone;
    `;
    await db`
      ALTER TABLE patients ADD CONSTRAINT unique_patient_phone UNIQUE (phone);
    `;

    // Visit logging columns on appointments
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS consultation_fee INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS treatment_charges INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS medicine_charges INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS chit_media TEXT[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS patient_phone VARCHAR(20) DEFAULT '',
        ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id);
    `;

    // Queue management columns on appointments
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS arrival_status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT FALSE;
    `;

    // Clinical documentation columns
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS diagnosis TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS medicines JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS follow_up_date DATE,
        ADD COLUMN IF NOT EXISTS follow_up_instructions TEXT DEFAULT '';
    `;

    // Feedback table
    await db`
      CREATE TABLE IF NOT EXISTS feedback (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id  UUID REFERENCES appointments(id),
        wa_id           VARCHAR(50) NOT NULL,
        rating          VARCHAR(10) NOT NULL,
        comment         TEXT DEFAULT '',
        callback        BOOLEAN NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // feedback_sent_at on appointments
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS feedback_sent_at TIMESTAMPTZ;
    `;

    // prescription_key on appointments — R2 object key for generated PDF
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS prescription_key TEXT;
    `;

    // Callback contacted tracking
    await db`
      ALTER TABLE feedback
        ADD COLUMN IF NOT EXISTS callback_contacted_at TIMESTAMPTZ;
    `;

    // Ensure the valid_state constraint covers ALL states (patient + doctor)
    // Drop first to allow constraint redefinition across deploys
    await db`
      ALTER TABLE sessions DROP CONSTRAINT IF EXISTS valid_state;
    `;
    await db`
      ALTER TABLE sessions ADD CONSTRAINT valid_state CHECK (
        state IN ('IDLE','MAIN_MENU','BOOKING_COLLECTION','BOOKING_DATE','BOOKING_TIME','BOOKING_TREATMENT',
                  'BOOKING_CONFIRMATION','BOOKED','SERVICES','LOCATION','TIMINGS',
                  'EMERGENCY','HUMAN_ESCALATION','CALLBACK_REQUESTED','CANCEL_CONFIRM',
                  'DONE','ABANDONED',
                  'DOCTOR_MAIN_MENU','DOCTOR_VIEW_DATE','DOCTOR_APPOINTMENT_LIST',
                  'DOCTOR_APPOINTMENT_DETAIL','DOCTOR_MANAGE_SCHEDULE','DOCTOR_STATS',
                  'DOCTOR_VIEW_QUEUE',
                  'REGISTER_NAME','REGISTER_AGE','REGISTER_SEX','REGISTER_PHONE','REGISTER_APPOINTMENT',
                  'LOG_TREATMENT','LOG_CONSULTATION_FEE','LOG_TREATMENT_CHARGES','LOG_MEDICINE_CHARGES',
                  'LOG_NEXT_VISIT','LOG_NOTES','LOG_MEDIA','DOCTOR_SEARCH_PATIENT','DOCTOR_VIEW_CHIT','DOCTOR_PATIENT_VISITS','DOCTOR_VIEW_MESSAGES',
                  'RECEPTIONIST_MAIN_MENU','RECEPTIONIST_VIEW_QUEUE','RECEPTIONIST_QUEUE_DETAIL')
      );
    `;

      logger.info('DB_MIGRATIONS_COMPLETE');
      return;
    } catch (error) {
      logger.error('DB_MIGRATIONS_FAILED', { attempt, maxRetries: MAX_RETRIES, error: error.message });
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * attempt;
        logger.info('DB_MIGRATIONS_RETRY', { attempt, nextAttempt: attempt + 1, delayMs: delay });
        await sleep(delay);
      } else {
        migrationsPromise = null;
        throw error;
      }
    }
  }
  })();

  return migrationsPromise;
}
