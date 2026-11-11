import type { PostgresMigration } from "../../../../lib/types/migration/index.type.js";

const migration: PostgresMigration = {
  async up({ client }) {
    await client.query(`
      CREATE TABLE permissions (
        code        TEXT PRIMARY KEY,
        description TEXT NOT NULL
      );

      INSERT INTO permissions (code, description) VALUES
        ('workflow:manage', 'Create, edit, review and delete workflow templates and drafts'),
        ('task:create',     'Find a workflow and create, complete and manage own task requests'),
        ('task:approve',    'Act on approval steps of tasks'),
        ('user:manage',     'Create and view system users and their permissions');
    `);

    await client.query(`
      CREATE TABLE users (
        id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        email                TEXT        NOT NULL,
        full_name            TEXT        NOT NULL,
        password_hash        TEXT        NOT NULL,
        status               TEXT        NOT NULL DEFAULT 'active',
        failed_login_count   INTEGER     NOT NULL DEFAULT 0,
        last_failed_login_at TIMESTAMPTZ,
        last_login_at        TIMESTAMPTZ,
        created_by_user_id   UUID,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT users_status_check             CHECK (status IN ('active', 'disabled')),
        CONSTRAINT users_failed_login_count_check CHECK (failed_login_count >= 0),
        CONSTRAINT users_email_normalised_check   CHECK (email = lower(btrim(email))),
        CONSTRAINT users_created_by_user_id_fkey  FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
      );

      CREATE UNIQUE INDEX users_email_key ON users (lower(email));

      CREATE TABLE user_permissions (
        user_id            UUID        NOT NULL,
        permission_code    TEXT        NOT NULL,
        granted_by_user_id UUID,
        granted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT user_permissions_pkey                    PRIMARY KEY (user_id, permission_code),
        CONSTRAINT user_permissions_user_id_fkey            FOREIGN KEY (user_id)            REFERENCES users (id)         ON DELETE CASCADE,
        CONSTRAINT user_permissions_permission_code_fkey    FOREIGN KEY (permission_code)    REFERENCES permissions (code) ON DELETE RESTRICT,
        CONSTRAINT user_permissions_granted_by_user_id_fkey FOREIGN KEY (granted_by_user_id) REFERENCES users (id)         ON DELETE SET NULL
      );

      CREATE INDEX user_permissions_permission_code_idx ON user_permissions (permission_code);

      CREATE TABLE user_sessions (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id           UUID        NOT NULL,
        token_hash        TEXT        NOT NULL,
        user_agent        TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at        TIMESTAMPTZ NOT NULL,
        revoked_at        TIMESTAMPTZ,
        revocation_reason TEXT,
        CONSTRAINT user_sessions_user_id_fkey     FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT user_sessions_token_hash_key   UNIQUE (token_hash),
        CONSTRAINT user_sessions_expiry_check     CHECK (expires_at > created_at),
        CONSTRAINT user_sessions_revocation_check CHECK (
          (revoked_at IS NULL AND revocation_reason IS NULL) OR
          (revoked_at IS NOT NULL AND revocation_reason IN ('signed_out', 'revoked_by_user'))
        )
      );

      CREATE INDEX user_sessions_user_id_active_idx ON user_sessions (user_id) WHERE revoked_at IS NULL;
      CREATE INDEX user_sessions_expires_at_idx     ON user_sessions (expires_at);
    `);

    await client.query(`
      CREATE FUNCTION enforce_user_has_permission() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        target_user_id UUID;
      BEGIN
        IF TG_OP = 'INSERT' THEN
          target_user_id := NEW.id;
        ELSE
          target_user_id := OLD.user_id;
        END IF;

        IF EXISTS (SELECT 1 FROM users WHERE id = target_user_id)
           AND NOT EXISTS (SELECT 1 FROM user_permissions WHERE user_id = target_user_id) THEN
          RAISE EXCEPTION 'user % must hold at least one permission', target_user_id
            USING ERRCODE = 'check_violation';
        END IF;

        RETURN NULL;
      END;
      $$;

      CREATE CONSTRAINT TRIGGER users_require_permission
        AFTER INSERT ON users
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_user_has_permission();

      CREATE CONSTRAINT TRIGGER user_permissions_require_remaining_permission
        AFTER DELETE ON user_permissions
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_user_has_permission();
    `);

    await client.query(`
      ALTER TABLE template_deletions DROP CONSTRAINT template_deletions_deleted_by_admin_id_fkey;
      ALTER TABLE template_deletions RENAME COLUMN deleted_by_admin_id TO deleted_by_user_id;
      ALTER TABLE template_deletions RENAME COLUMN deleted_by_username TO deleted_by_email;
      ALTER TABLE template_deletions
        ADD CONSTRAINT template_deletions_deleted_by_user_id_fkey
        FOREIGN KEY (deleted_by_user_id) REFERENCES users (id) ON DELETE RESTRICT;
      ALTER INDEX template_deletions_admin_idx RENAME TO template_deletions_user_idx;
    `);

    await client.query(`
      DROP TABLE portal_users;
      DROP TABLE admin_users;
    `);
  },

  async down({ client }) {
    await client.query(`
      CREATE TABLE admin_users (
        id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        username               TEXT        NOT NULL,
        email                  TEXT        NOT NULL,
        full_name              TEXT        NOT NULL,
        department             TEXT,
        organisation           TEXT,
        password_hash          TEXT        NOT NULL,
        is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
        last_login_at          TIMESTAMPTZ,
        failed_attempt_count   INTEGER     NOT NULL DEFAULT 0,
        last_failed_attempt_at TIMESTAMPTZ,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX admin_users_username_key ON admin_users (lower(username));
      CREATE UNIQUE INDEX admin_users_email_key    ON admin_users (lower(email));

      CREATE TABLE portal_users (
        id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        username               TEXT        NOT NULL,
        email                  TEXT        NOT NULL,
        full_name              TEXT        NOT NULL,
        department             TEXT,
        organisation           TEXT,
        faculty                TEXT,
        password_hash          TEXT        NOT NULL,
        is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
        last_login_at          TIMESTAMPTZ,
        failed_attempt_count   INTEGER     NOT NULL DEFAULT 0,
        last_failed_attempt_at TIMESTAMPTZ,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX portal_users_username_key ON portal_users (lower(username));
      CREATE UNIQUE INDEX portal_users_email_key    ON portal_users (lower(email));
    `);

    await client.query(`
      ALTER INDEX template_deletions_user_idx RENAME TO template_deletions_admin_idx;
      ALTER TABLE template_deletions DROP CONSTRAINT template_deletions_deleted_by_user_id_fkey;
      ALTER TABLE template_deletions RENAME COLUMN deleted_by_email TO deleted_by_username;
      ALTER TABLE template_deletions RENAME COLUMN deleted_by_user_id TO deleted_by_admin_id;
      ALTER TABLE template_deletions
        ADD CONSTRAINT template_deletions_deleted_by_admin_id_fkey
        FOREIGN KEY (deleted_by_admin_id) REFERENCES admin_users (id) ON DELETE RESTRICT;
    `);

    await client.query(`
      DROP TRIGGER user_permissions_require_remaining_permission ON user_permissions;
      DROP TRIGGER users_require_permission ON users;
      DROP FUNCTION enforce_user_has_permission();
      DROP TABLE user_sessions;
      DROP TABLE user_permissions;
      DROP TABLE users;
      DROP TABLE permissions;
    `);
  },
};

export default migration;
