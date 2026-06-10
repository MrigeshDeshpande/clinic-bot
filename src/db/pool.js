import { neon } from '@neondatabase/serverless';
import { logger } from '@/lib/logger';

const DATABASE_URL = process.env.DATABASE_URL;
const MAX_QUERY_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;

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
        CONSTRAINT valid_appt_status CHECK (status IN ('confirmed','cancelled','completed','no_show','superseded'))
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
    // Migration: Allow 'superseded' status for reschedule versioning
    await db`
      ALTER TABLE appointments DROP CONSTRAINT IF EXISTS valid_appt_status;
    `;
    await db`
      ALTER TABLE appointments ADD CONSTRAINT valid_appt_status
        CHECK (status IN ('confirmed','cancelled','completed','no_show','superseded'));
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

    // Treatments array column (plural, supports multiple treatments per appointment)
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS treatments JSONB DEFAULT '[]';
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

    // Trigram indexes for fast ILIKE '%search%' on name/phone
    try {
      await db`CREATE EXTENSION IF NOT EXISTS pg_trgm;`;
      await db`CREATE INDEX IF NOT EXISTS idx_patients_name_trgm ON patients USING gin (name gin_trgm_ops);`;
      await db`CREATE INDEX IF NOT EXISTS idx_patients_phone_trgm ON patients USING gin (phone gin_trgm_ops);`;
    } catch (_) {
      logger.warn('pg_trgm not available — ILIKE searches will be slower');
    }

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

    // Payment tracking columns
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20),
        ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS paid_amount INTEGER DEFAULT 0;
    `;

    // Payments ledger — independent financial tracking (source of truth for money)
    await db`
      CREATE TABLE IF NOT EXISTS payments (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id  UUID REFERENCES appointments(id) ON DELETE CASCADE,
        patient_id      UUID REFERENCES patients(id) ON DELETE CASCADE,
        amount          INTEGER NOT NULL CHECK (amount > 0),
        direction       VARCHAR(10) NOT NULL CHECK (direction IN ('credit', 'debit')),
        kind            VARCHAR(20) NOT NULL DEFAULT 'payment'
                        CHECK (kind IN ('payment','refund','adjustment','migration','waiver','advance')),
        method          VARCHAR(20) CHECK (method IN ('cash','upi','card','bank','other')),
        idempotency_key VARCHAR(100) UNIQUE,
        notes           TEXT,
        recorded_by     VARCHAR(20) NOT NULL DEFAULT 'reception',
        recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_payments_appointment ON payments(appointment_id);
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id);
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_payments_recorded ON payments(recorded_at);
    `;

    // Backfill: migrate existing paid_amount > 0 into payments ledger with explicit migration marker
    // Only runs once — INSERT ON CONFLICT (idempotency_key) ensures no duplicates
    await db`
      INSERT INTO payments (appointment_id, patient_id, amount, direction, kind, notes, recorded_by)
      SELECT a.id, a.patient_id, a.paid_amount, 'credit', 'migration',
             'Migrated from legacy paid_amount=' || a.paid_amount, 'system'
      FROM appointments a
      WHERE a.paid_amount > 0
        AND a.id NOT IN (
          SELECT appointment_id FROM payments WHERE kind = 'migration'
        )
    `;

    // post_visit_sent_at — tracks whether post-visit summary has been sent
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS post_visit_sent_at TIMESTAMPTZ;
    `;

    // due_reminder_sent_at — tracks whether payment due reminder was sent
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS due_reminder_sent_at TIMESTAMPTZ;
    `;

    // follow_up_reminder_sent_at — tracks whether follow-up reminder was sent
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS follow_up_reminder_sent_at TIMESTAMPTZ;
    `;

    // tooth_diagnoses — per-tooth diagnosis data (JSONB array of { tooth, diagnoses[], surface? })
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS tooth_diagnoses JSONB DEFAULT '[]';
    `;

    // treatment_fees — per-treatment fee map (JSONB object keyed by treatment id)
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS treatment_fees JSONB DEFAULT '{}';
    `;

    // due_reminder_log — history of due reminder triggers (manual + cron)
    await db`
      CREATE TABLE IF NOT EXISTS due_reminder_log (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        triggered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        triggered_by        VARCHAR(20) NOT NULL DEFAULT 'manual',
        total_appointments  INTEGER NOT NULL DEFAULT 0,
        sent_count          INTEGER NOT NULL DEFAULT 0,
        template_sent_count INTEGER NOT NULL DEFAULT 0,
        details             JSONB,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // Shadow logs — AI evaluation data (stored separately from production tables)
    await db`
      CREATE TABLE IF NOT EXISTS shadow_logs (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        wa_id             VARCHAR(50) NOT NULL,
        session_state     VARCHAR(50) NOT NULL DEFAULT '',
        message_text      TEXT NOT NULL DEFAULT '',
        rule_intent       VARCHAR(50) NOT NULL DEFAULT '',
        ai_intent         VARCHAR(50) NOT NULL DEFAULT '',
        ai_confidence     REAL NOT NULL DEFAULT 0,
        matched           BOOLEAN NOT NULL DEFAULT FALSE,
        provider          VARCHAR(20) NOT NULL DEFAULT 'gemini',
        processing_time_ms INTEGER NOT NULL DEFAULT 0,
        rule_used         BOOLEAN NOT NULL DEFAULT FALSE
      );
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_shadow_logs_created ON shadow_logs(created_at);
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_shadow_logs_matched ON shadow_logs(matched);
    `;

    // Patient relationships table (explicit family links)
    await db`
      CREATE TABLE IF NOT EXISTS patient_relationships (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        related_patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        relationship_type   VARCHAR(20) NOT NULL DEFAULT 'other',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_relationship UNIQUE (patient_id, related_patient_id),
        CONSTRAINT no_self_relationship CHECK (patient_id != related_patient_id)
      );
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_patient_relationships_patient ON patient_relationships(patient_id);
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_patient_relationships_related ON patient_relationships(related_patient_id);
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
                  'RECEPTIONIST_MAIN_MENU','RECEPTIONIST_VIEW_QUEUE','RECEPTIONIST_QUEUE_DETAIL',
                  'WALKIN_NAME','WALKIN_AGE','WALKIN_SEX','WALKIN_TREATMENT',
                  'BOOKING_PATIENT_AGE','BOOKING_PATIENT_SEX','BOOKING_PATIENT_LOCATION')
      );
    `;

    // Location column for appointments
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS location VARCHAR(100) DEFAULT '';
    `;

    // Advice selected per patient
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS advice_selected TEXT[] DEFAULT '{}';
    `;

    // Diagnosis selected per patient
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS diagnosis_selected TEXT[] DEFAULT '{}';
    `;

    // Compiled document key (visit summary PDF bundling prescription + images)
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS compiled_document_key TEXT;
    `;

    // Location column on patients (city/area the patient is from)
    await db`
      ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS location VARCHAR(100) DEFAULT '';
    `;

    // Medical history columns on patients
    await db`
      ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS allergies TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS chronic_conditions TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS blood_group VARCHAR(10) DEFAULT '',
        ADD COLUMN IF NOT EXISTS bp VARCHAR(20) DEFAULT '',
        ADD COLUMN IF NOT EXISTS weight VARCHAR(20) DEFAULT '',
        ADD COLUMN IF NOT EXISTS medications TEXT DEFAULT '';
    `;

    // Patient ratings — doctor's rating of the patient across categories
    await db`
      ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS patient_ratings JSONB DEFAULT '{}';
    `;

    // Dental habit / risk-factor tracking
    await db`
      ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS habits JSONB DEFAULT '{}';
    `;

    // OPD slip fields on patients
    await db`
      ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS occupation VARCHAR(100) DEFAULT '',
        ADD COLUMN IF NOT EXISTS dental_history TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS family_history TEXT DEFAULT '';
    `;

    // OPD slip fields on appointments
    await db`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS chief_complaint TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS general_examination TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS extra_oral_examination TEXT DEFAULT '';
    `;

    // Settings table — key-value store for admin dashboard customization
    await db`
      CREATE TABLE IF NOT EXISTS settings (
        key         TEXT PRIMARY KEY,
        value       JSONB NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    await db`
      INSERT INTO settings (key, value) VALUES
        ('clinic', '{"subtitle":"Advanced Dental Care & Implant Center","email":"shribalajiadc@gmail.com","instagram":"shribalaji_adc","timing_mon_sat":"10:00 AM – 8:00 PM","timing_sun":"10:00 AM – 2:00 PM"}'),
        ('doctor', '{"qualifications":"BDS, MOI","registration":"CGDC/G/24/4198","designation":"Dental Surgeon | Oral Implantologist"}'),
        ('prescription', '{"primary_color":"#0d1b2a","accent_color":"#3a86c8","watermark_text":"Shri Balaji","show_watermark":true,"font_size":10,"show_rx":true,"show_hindi":false,"generic_substitution":true,"border_enabled":true}'),
        ('checklists', '{"diagnosis":["Gingivitis","Halitosis","Caries","Deep caries","Periapical Abscess","Grossly Decayed","Missing","Pocket","Periodontitis","Mobility","Lesion","Pericoronitis","Impacted","Fractured Tooth / Cusp","Abrasion / Attrition / Erosion","Irregular Teeth","Calculus","Stains"],"advice":["Avoid hot/cold foods for 24 hours","Take prescribed medicines on time","Maintain oral hygiene","Use soft-bristled toothbrush","Rinse with warm salt water","Avoid hard/sticky foods"]}'),
        ('google_maps', '{"review_url":""}')
      ON CONFLICT (key) DO NOTHING;
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
