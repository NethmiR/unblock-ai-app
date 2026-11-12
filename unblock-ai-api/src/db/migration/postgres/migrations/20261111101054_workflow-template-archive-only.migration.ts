import type { PostgresMigration } from "../../../../lib/types/migration/index.type.js";

const migration: PostgresMigration = {
  async up({ client }) {
    await client.query(`
      DROP TABLE template_deletions;

      UPDATE permissions
         SET description = 'Create, generate, publish and archive workflow templates'
       WHERE code = 'workflow:manage';
    `);
  },

  async down({ client }) {
    await client.query(`
      UPDATE permissions
         SET description = 'Create, edit, review and delete workflow templates and drafts'
       WHERE code = 'workflow:manage';

      CREATE TABLE template_deletions (
        id                 BIGSERIAL   PRIMARY KEY,
        workflow_id        TEXT        NOT NULL,
        template_title     TEXT        NOT NULL,
        latest_version     INTEGER     NOT NULL,
        versions_removed   INTEGER     NOT NULL DEFAULT 0,
        institution_type   TEXT,
        review_status      TEXT,
        deleted_by_user_id UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        deleted_by_email   TEXT        NOT NULL,
        reason             TEXT,
        request_id         TEXT,
        snapshot           JSONB       NOT NULL DEFAULT '{}'::jsonb,
        deleted_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX template_deletions_deleted_at_idx ON template_deletions (deleted_at DESC);
      CREATE INDEX template_deletions_user_idx       ON template_deletions (deleted_by_user_id, deleted_at DESC);
      CREATE INDEX template_deletions_workflow_idx   ON template_deletions (workflow_id);
    `);
  },
};

export default migration;
