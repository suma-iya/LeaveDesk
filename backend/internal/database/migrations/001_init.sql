-- Idempotent schema: safe to run on every startup.

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT        NOT NULL,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT,                       -- NULL for Google-only accounts
    google_id     TEXT UNIQUE,                -- Google "sub" claim, NULL until linked
    role          TEXT        NOT NULL CHECK (role IN ('EMPLOYEE', 'MANAGER')),
    department    TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leaves (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leave_type      TEXT        NOT NULL CHECK (leave_type IN ('ANNUAL', 'SICK', 'CASUAL', 'UNPAID')),
    start_date      DATE        NOT NULL,
    end_date        DATE        NOT NULL,
    reason          TEXT        NOT NULL DEFAULT '',
    status          TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    manager_comment TEXT        NOT NULL DEFAULT '',
    reviewed_by     BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT leaves_dates_ordered CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leaves_user_id    ON leaves (user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status     ON leaves (status);
CREATE INDEX IF NOT EXISTS idx_leaves_created_at ON leaves (created_at);
