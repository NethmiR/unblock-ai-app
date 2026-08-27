-- ============================== admin_users ==============================
CREATE TABLE IF NOT EXISTS admin_users (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username               TEXT        NOT NULL,
    email                  TEXT        NOT NULL,
    full_name              TEXT        NOT NULL,
    department             TEXT,
    organisation           TEXT,
    password_hash          TEXT        NOT NULL,
    is_active              BOOLEAN     NOT NULL DEFAULT TRUE,

    -- when this user last logged in successfully
    last_login_at          TIMESTAMPTZ,

    -- how many times we received THIS username with the WRONG password,
    -- and when the most recent such attempt happened
    failed_attempt_count   INTEGER     NOT NULL DEFAULT 0,
    last_failed_attempt_at TIMESTAMPTZ,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness without requiring the citext extension.
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_key ON admin_users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_key    ON admin_users (lower(email));

-- ============================== portal_users =============================
CREATE TABLE IF NOT EXISTS portal_users (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username               TEXT        NOT NULL,
    email                  TEXT        NOT NULL,
    full_name              TEXT        NOT NULL,
    department             TEXT,
    organisation           TEXT,
    faculty                TEXT,          -- feeds getRequesterContext(); see Finding 0.4
    password_hash          TEXT        NOT NULL,
    is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at          TIMESTAMPTZ,
    failed_attempt_count   INTEGER     NOT NULL DEFAULT 0,
    last_failed_attempt_at TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_users_username_key ON portal_users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS portal_users_email_key    ON portal_users (lower(email));

-- =========================== template_deletions ==========================
CREATE TABLE IF NOT EXISTS template_deletions (
    id                  BIGSERIAL   PRIMARY KEY,
    workflow_id         TEXT        NOT NULL,
    template_title      TEXT        NOT NULL,
    latest_version      INTEGER     NOT NULL,
    versions_removed    INTEGER     NOT NULL DEFAULT 0,
    institution_type    TEXT,
    review_status       TEXT,

    -- RESTRICT, not CASCADE: an audit row must never be orphaned or erased by
    -- removing the admin who created it.
    deleted_by_admin_id UUID        NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
    -- Denormalised on purpose: the log stays readable if the admin is renamed.
    deleted_by_username TEXT        NOT NULL,

    reason              TEXT,
    request_id          TEXT,
    snapshot            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    deleted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_deletions_deleted_at_idx ON template_deletions (deleted_at DESC);
CREATE INDEX IF NOT EXISTS template_deletions_admin_idx      ON template_deletions (deleted_by_admin_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS template_deletions_workflow_idx   ON template_deletions (workflow_id);
