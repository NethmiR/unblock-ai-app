import type { PostgresMigration } from "../../../../lib/types/migration/index.type.js";

const migration: PostgresMigration = {
  async up({ client }) {
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

      CREATE TABLE template_deletions (
        id                  BIGSERIAL   PRIMARY KEY,
        workflow_id         TEXT        NOT NULL,
        template_title      TEXT        NOT NULL,
        latest_version      INTEGER     NOT NULL,
        versions_removed    INTEGER     NOT NULL DEFAULT 0,
        institution_type    TEXT,
        review_status       TEXT,
        deleted_by_admin_id UUID        NOT NULL REFERENCES admin_users (id) ON DELETE RESTRICT,
        deleted_by_username TEXT        NOT NULL,
        reason              TEXT,
        request_id          TEXT,
        snapshot            JSONB       NOT NULL DEFAULT '{}'::jsonb,
        deleted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX template_deletions_deleted_at_idx ON template_deletions (deleted_at DESC);
      CREATE INDEX template_deletions_admin_idx      ON template_deletions (deleted_by_admin_id, deleted_at DESC);
      CREATE INDEX template_deletions_workflow_idx   ON template_deletions (workflow_id);
    `);
  },

  async down({ client }) {
    await client.query(`
      DROP TABLE template_deletions;
      DROP TABLE portal_users;
      DROP TABLE admin_users;
    `);
  },
};

export default migration;
