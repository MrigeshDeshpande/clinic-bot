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
