CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email

CREATE TABLE departments (
    id         serial PRIMARY KEY,
    name       text UNIQUE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email          citext UNIQUE NOT NULL,
    password_hash  text NULL,                 -- NULL for Google-only accounts
    google_sub     text UNIQUE NULL,
    first_name     text NOT NULL,
    last_name      text NOT NULL,
    date_of_birth  date NOT NULL,             -- age is always computed, never stored
    role           text NOT NULL DEFAULT 'employee' CHECK (role IN ('hr', 'employee')),
    status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
    department_id  int NULL REFERENCES departments,
    joined_on      date NULL,                 -- set when HR approves the account
    avatar_file_id uuid NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE files (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      uuid REFERENCES users ON DELETE CASCADE,
    kind          text CHECK (kind IN ('avatar', 'attachment')),
    mime          text,
    size_bytes    int,
    original_name text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD CONSTRAINT users_avatar_fk
    FOREIGN KEY (avatar_file_id) REFERENCES files ON DELETE SET NULL;

-- Per-employee overrides; without a row the policy default applies.
CREATE TABLE leave_limits (
    user_id uuid REFERENCES users ON DELETE CASCADE,
    year    int,
    type    text CHECK (type IN ('annual', 'casual', 'sick')),
    days    int NOT NULL CHECK (days >= 0),
    PRIMARY KEY (user_id, year, type)
);

CREATE TABLE leave_requests (
    id                 bigserial PRIMARY KEY,
    user_id            uuid NOT NULL REFERENCES users ON DELETE CASCADE,
    type               text NOT NULL CHECK (type IN ('annual', 'casual', 'sick')),
    start_date         date NOT NULL,
    end_date           date NOT NULL,
    working_days       int NOT NULL CHECK (working_days >= 1),
    reason             text,
    attachment_file_id uuid NULL REFERENCES files ON DELETE SET NULL,
    status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    submitted_at       timestamptz NOT NULL DEFAULT now(),
    decided_at         timestamptz NULL,
    decided_by         uuid NULL REFERENCES users ON DELETE SET NULL,
    decision_note      text NULL,
    CONSTRAINT leave_requests_dates CHECK (end_date >= start_date)
);
-- Shown as LV-<id>; numbering starts at LV-1000.
ALTER SEQUENCE leave_requests_id_seq START WITH 1000 RESTART;

CREATE INDEX leave_requests_user_status ON leave_requests (user_id, status);
CREATE INDEX leave_requests_dates_idx   ON leave_requests (start_date, end_date);

-- Monthly salary in whole taka. Never updated in place: each change is a new row.
CREATE TABLE salaries (
    id             bigserial PRIMARY KEY,
    user_id        uuid REFERENCES users ON DELETE CASCADE,
    monthly_bdt    bigint NOT NULL CHECK (monthly_bdt > 0),
    effective_from date NOT NULL,
    created_by     uuid REFERENCES users ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX salaries_user ON salaries (user_id, effective_from DESC);

-- Every HR change to someone else's record.
CREATE TABLE audit_log (
    id             bigserial PRIMARY KEY,
    actor_id       uuid,
    target_user_id uuid,
    field          text,
    old_value      text,
    new_value      text,
    created_at     timestamptz NOT NULL DEFAULT now()
);
