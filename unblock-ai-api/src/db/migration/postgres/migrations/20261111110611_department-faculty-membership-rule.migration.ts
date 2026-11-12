import type { PostgresMigration } from "../../../../lib/types/migration/index.type.js";

const migration: PostgresMigration = {
  async up({ client }) {
    await client.query(`
      CREATE FUNCTION enforce_department_member_in_faculty() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        violating_user_id UUID;
      BEGIN
        IF TG_TABLE_NAME = 'organisational_units' THEN
          IF NEW.unit_type <> 'department' THEN
            RETURN NULL;
          END IF;
          SELECT member.user_id INTO violating_user_id
            FROM user_organisational_units member
           WHERE member.organisational_unit_id = NEW.id
             AND NOT EXISTS (
               SELECT 1 FROM user_organisational_units faculty_member
                WHERE faculty_member.user_id = member.user_id
                  AND faculty_member.organisational_unit_id = NEW.parent_id
             )
           LIMIT 1;
        ELSIF TG_OP = 'INSERT' THEN
          SELECT NEW.user_id INTO violating_user_id
            FROM organisational_units department
           WHERE department.id = NEW.organisational_unit_id
             AND department.unit_type = 'department'
             AND EXISTS (
               SELECT 1 FROM user_organisational_units still_member
                WHERE still_member.user_id = NEW.user_id
                  AND still_member.organisational_unit_id = NEW.organisational_unit_id
             )
             AND NOT EXISTS (
               SELECT 1 FROM user_organisational_units faculty_member
                WHERE faculty_member.user_id = NEW.user_id
                  AND faculty_member.organisational_unit_id = department.parent_id
             );
        ELSE
          SELECT department_member.user_id INTO violating_user_id
            FROM user_organisational_units department_member
            JOIN organisational_units department ON department.id = department_member.organisational_unit_id
           WHERE department_member.user_id = OLD.user_id
             AND department.unit_type = 'department'
             AND department.parent_id = OLD.organisational_unit_id
             AND NOT EXISTS (
               SELECT 1 FROM user_organisational_units faculty_member
                WHERE faculty_member.user_id = OLD.user_id
                  AND faculty_member.organisational_unit_id = OLD.organisational_unit_id
             )
           LIMIT 1;
        END IF;

        IF violating_user_id IS NOT NULL THEN
          RAISE EXCEPTION 'user % belongs to a department without belonging to its faculty', violating_user_id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'user_organisational_units_department_faculty_check';
        END IF;

        RETURN NULL;
      END;
      $$;

      CREATE CONSTRAINT TRIGGER user_organisational_units_require_department_faculty
        AFTER INSERT ON user_organisational_units
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_department_member_in_faculty();

      CREATE CONSTRAINT TRIGGER user_organisational_units_keep_department_faculty
        AFTER DELETE ON user_organisational_units
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_department_member_in_faculty();

      CREATE CONSTRAINT TRIGGER organisational_units_keep_department_members_in_faculty
        AFTER UPDATE OF parent_id ON organisational_units
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_department_member_in_faculty();
    `);
  },

  async down({ client }) {
    await client.query(`
      DROP TRIGGER organisational_units_keep_department_members_in_faculty ON organisational_units;
      DROP TRIGGER user_organisational_units_keep_department_faculty ON user_organisational_units;
      DROP TRIGGER user_organisational_units_require_department_faculty ON user_organisational_units;
      DROP FUNCTION enforce_department_member_in_faculty();
    `);
  },
};

export default migration;
