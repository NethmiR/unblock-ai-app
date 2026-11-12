import type { PostgresMigration } from "../../../../lib/types/migration/index.type.js";

const migration: PostgresMigration = {
  async up({ client }) {
    await client.query(`
      INSERT INTO permissions (code, description) VALUES
        ('organisation:manage', 'Configure faculties, departments, divisions and designations');

      INSERT INTO user_permissions (user_id, permission_code, granted_by_user_id)
      SELECT user_id, 'organisation:manage', NULL
        FROM user_permissions
       WHERE permission_code = 'user:manage'
      ON CONFLICT DO NOTHING;
    `);

    await client.query(`
      CREATE TABLE organisational_units (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        code               TEXT        NOT NULL,
        name               TEXT        NOT NULL,
        unit_type          TEXT        NOT NULL,
        parent_id          UUID,
        parent_unit_type   TEXT,
        description        TEXT,
        archived_at        TIMESTAMPTZ,
        created_by_user_id UUID,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT organisational_units_code_key          UNIQUE (code),
        CONSTRAINT organisational_units_id_unit_type_key  UNIQUE (id, unit_type),
        CONSTRAINT organisational_units_unit_type_check   CHECK (unit_type IN ('faculty', 'department', 'division')),
        CONSTRAINT organisational_units_code_format_check CHECK (code ~ '^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$' AND char_length(code) <= 24),
        CONSTRAINT organisational_units_name_check        CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 200),
        CONSTRAINT organisational_units_description_check CHECK (description IS NULL OR char_length(description) <= 1000),
        CONSTRAINT organisational_units_parent_pair_check CHECK ((parent_id IS NULL) = (parent_unit_type IS NULL)),
        CONSTRAINT organisational_units_hierarchy_check   CHECK (
          (unit_type = 'faculty'    AND parent_unit_type IS NULL) OR
          (unit_type = 'department' AND parent_unit_type IS NOT DISTINCT FROM 'faculty') OR
          (unit_type = 'division'   AND (parent_unit_type IS NULL OR parent_unit_type = 'faculty'))
        ),
        CONSTRAINT organisational_units_parent_fkey             FOREIGN KEY (parent_id, parent_unit_type) REFERENCES organisational_units (id, unit_type) ON DELETE RESTRICT,
        CONSTRAINT organisational_units_created_by_user_id_fkey FOREIGN KEY (created_by_user_id)          REFERENCES users (id)                         ON DELETE SET NULL
      );

      CREATE UNIQUE INDEX organisational_units_root_name_key  ON organisational_units (unit_type, lower(name))            WHERE parent_id IS NULL;
      CREATE UNIQUE INDEX organisational_units_child_name_key ON organisational_units (parent_id, unit_type, lower(name)) WHERE parent_id IS NOT NULL;
      CREATE INDEX        organisational_units_parent_id_idx  ON organisational_units (parent_id);
    `);

    await client.query(`
      CREATE TABLE designations (
        id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        code                   TEXT        NOT NULL,
        title                  TEXT        NOT NULL,
        category               TEXT        NOT NULL,
        single_holder_per_unit BOOLEAN     NOT NULL DEFAULT FALSE,
        display_order          INTEGER     NOT NULL DEFAULT 0,
        archived_at            TIMESTAMPTZ,
        created_by_user_id     UUID,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT designations_code_key                UNIQUE (code),
        CONSTRAINT designations_id_single_holder_key    UNIQUE (id, single_holder_per_unit),
        CONSTRAINT designations_code_format_check       CHECK (code ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$' AND char_length(code) <= 64),
        CONSTRAINT designations_title_check             CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 120),
        CONSTRAINT designations_category_check          CHECK (category IN ('leadership', 'academic', 'academic_support', 'administrative', 'non_academic', 'student')),
        CONSTRAINT designations_display_order_check     CHECK (display_order BETWEEN 0 AND 9999),
        CONSTRAINT designations_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
      );

      CREATE UNIQUE INDEX designations_title_key ON designations (lower(title));

      CREATE TABLE designation_unit_types (
        designation_id UUID NOT NULL,
        unit_type      TEXT NOT NULL,
        CONSTRAINT designation_unit_types_pkey                PRIMARY KEY (designation_id, unit_type),
        CONSTRAINT designation_unit_types_unit_type_check     CHECK (unit_type IN ('faculty', 'department', 'division')),
        CONSTRAINT designation_unit_types_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES designations (id) ON DELETE CASCADE
      );
    `);

    await client.query(`
      CREATE TABLE user_organisational_units (
        user_id                UUID        NOT NULL,
        organisational_unit_id UUID        NOT NULL,
        assigned_by_user_id    UUID,
        assigned_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT user_organisational_units_pkey                        PRIMARY KEY (user_id, organisational_unit_id),
        CONSTRAINT user_organisational_units_user_id_fkey                FOREIGN KEY (user_id)                REFERENCES users (id)                ON DELETE CASCADE,
        CONSTRAINT user_organisational_units_organisational_unit_id_fkey FOREIGN KEY (organisational_unit_id) REFERENCES organisational_units (id) ON DELETE RESTRICT,
        CONSTRAINT user_organisational_units_assigned_by_user_id_fkey    FOREIGN KEY (assigned_by_user_id)    REFERENCES users (id)                ON DELETE SET NULL
      );

      CREATE INDEX user_organisational_units_organisational_unit_id_idx ON user_organisational_units (organisational_unit_id);

      CREATE TABLE user_designations (
        user_id                UUID        NOT NULL,
        designation_id         UUID        NOT NULL,
        organisational_unit_id UUID        NOT NULL,
        unit_type              TEXT        NOT NULL,
        single_holder_per_unit BOOLEAN     NOT NULL,
        assigned_by_user_id    UUID,
        assigned_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT user_designations_pkey                       PRIMARY KEY (user_id, designation_id, organisational_unit_id),
        CONSTRAINT user_designations_membership_fkey            FOREIGN KEY (user_id, organisational_unit_id)        REFERENCES user_organisational_units (user_id, organisational_unit_id) ON DELETE CASCADE,
        CONSTRAINT user_designations_unit_type_fkey             FOREIGN KEY (organisational_unit_id, unit_type)      REFERENCES organisational_units (id, unit_type)                        ON DELETE RESTRICT,
        CONSTRAINT user_designations_designation_unit_type_fkey FOREIGN KEY (designation_id, unit_type)              REFERENCES designation_unit_types (designation_id, unit_type)          ON DELETE RESTRICT,
        CONSTRAINT user_designations_single_holder_fkey         FOREIGN KEY (designation_id, single_holder_per_unit) REFERENCES designations (id, single_holder_per_unit)                   ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT user_designations_assigned_by_user_id_fkey   FOREIGN KEY (assigned_by_user_id)                    REFERENCES users (id)                                                  ON DELETE SET NULL
      );

      CREATE UNIQUE INDEX user_designations_single_holder_key          ON user_designations (designation_id, organisational_unit_id) WHERE single_holder_per_unit;
      CREATE INDEX        user_designations_organisational_unit_id_idx ON user_designations (organisational_unit_id);
    `);

    await client.query(`
      CREATE FUNCTION enforce_designation_has_unit_type() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        target_designation_id UUID;
      BEGIN
        IF TG_OP = 'INSERT' THEN
          target_designation_id := NEW.id;
        ELSE
          target_designation_id := OLD.designation_id;
        END IF;

        IF EXISTS (SELECT 1 FROM designations WHERE id = target_designation_id)
           AND NOT EXISTS (SELECT 1 FROM designation_unit_types WHERE designation_id = target_designation_id) THEN
          RAISE EXCEPTION 'designation % must apply to at least one unit type', target_designation_id
            USING ERRCODE = 'check_violation';
        END IF;

        RETURN NULL;
      END;
      $$;

      CREATE CONSTRAINT TRIGGER designations_require_unit_type
        AFTER INSERT ON designations
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_designation_has_unit_type();

      CREATE CONSTRAINT TRIGGER designation_unit_types_require_remaining_unit_type
        AFTER DELETE ON designation_unit_types
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_designation_has_unit_type();
    `);
  },

  async down({ client }) {
    await client.query(`
      DROP TRIGGER designation_unit_types_require_remaining_unit_type ON designation_unit_types;
      DROP TRIGGER designations_require_unit_type ON designations;
      DROP FUNCTION enforce_designation_has_unit_type();
    `);

    await client.query(`
      DROP TABLE user_designations;
      DROP TABLE user_organisational_units;
      DROP TABLE designation_unit_types;
      DROP TABLE designations;
      DROP TABLE organisational_units;
    `);

    await client.query(`
      DELETE FROM user_permissions WHERE permission_code = 'organisation:manage';
      DELETE FROM permissions WHERE code = 'organisation:manage';
    `);
  },
};

export default migration;
