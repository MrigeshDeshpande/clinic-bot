-- Sessions table
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

CREATE INDEX IF NOT EXISTS idx_sessions_wa_id ON sessions(wa_id);

-- Messages table
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

CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_id);
CREATE INDEX IF NOT EXISTS idx_messages_msg_id ON messages(msg_id);

-- Appointments table
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
    treatments          JSONB DEFAULT '[]',
    status              VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    reminder_sent_at    TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_appt_status CHECK (status IN ('confirmed','cancelled','completed','no_show'))
);

-- Allow NULL time for walk-in visits (no scheduled time slot)
ALTER TABLE appointments ALTER COLUMN time DROP NOT NULL;

-- Clinical documentation columns (added for patient detail view)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS diagnosis TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS medicines JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS follow_up_date DATE,
  ADD COLUMN IF NOT EXISTS follow_up_instructions TEXT DEFAULT '';

-- Compiled document key (visit summary PDF bundling prescription + images)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS compiled_document_key TEXT;
