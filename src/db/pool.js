import { neon } from '@neondatabase/serverless';
import { logger } from '@/lib/logger';

const DATABASE_URL = process.env.DATABASE_URL;

let sql;

export function getSql() {
  if (sql) return sql;

  if (!DATABASE_URL) {
    logger.warn('DATABASE_URL not set \u2014 running without persistence');
    sql = null;
    return sql;
  }

  sql = neon(DATABASE_URL);
  return sql;
}

export async function runMigrations() {
  const db = getSql();
  if (!db) {
    logger.warn('DB_MIGRATIONS_SKIPPED', { reason: 'DATABASE_URL not configured' });
    return;
  }

  try {
    await db`
      CREATE TABLE IF NOT EXISTS sessions (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_id            VARCHAR(20) NOT NULL UNIQUE,
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
        wa_id        VARCHAR(20) NOT NULL,
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
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id    UUID REFERENCES sessions(id),
        wa_id         VARCHAR(20) NOT NULL,
        patient_name  VARCHAR(100),
        date          DATE NOT NULL,
        time          TIME NOT NULL,
        treatment     VARCHAR(100),
        status        VARCHAR(20) NOT NULL DEFAULT 'confirmed',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT valid_appt_status CHECK (status IN ('confirmed','cancelled','completed','no_show'))
      );
    `;

    await db`
      CREATE INDEX IF NOT EXISTS idx_appointments_wa_id ON appointments(wa_id);
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
    `;

    logger.info('DB_MIGRATIONS_COMPLETE');
  } catch (error) {
    logger.error('DB_MIGRATIONS_FAILED', { error: error.message });
  }
}
