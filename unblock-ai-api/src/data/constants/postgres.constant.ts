export enum PostgresErrorCode {
  UNIQUE_VIOLATION = "23505",
  FOREIGN_KEY_VIOLATION = "23503",
  CHECK_VIOLATION = "23514",
}

export enum PostgresConstraint {
  USERS_EMAIL_KEY = "users_email_key",
  ORGANISATIONAL_UNITS_CODE_KEY = "organisational_units_code_key",
  ORGANISATIONAL_UNITS_ROOT_NAME_KEY = "organisational_units_root_name_key",
  ORGANISATIONAL_UNITS_CHILD_NAME_KEY = "organisational_units_child_name_key",
  ORGANISATIONAL_UNITS_PARENT_FKEY = "organisational_units_parent_fkey",
  USER_ORGANISATIONAL_UNITS_UNIT_FKEY = "user_organisational_units_organisational_unit_id_fkey",
  USER_ORGANISATIONAL_UNITS_DEPARTMENT_FACULTY_CHECK = "user_organisational_units_department_faculty_check",
  DESIGNATIONS_CODE_KEY = "designations_code_key",
  DESIGNATIONS_TITLE_KEY = "designations_title_key",
  USER_DESIGNATIONS_DESIGNATION_UNIT_TYPE_FKEY = "user_designations_designation_unit_type_fkey",
  USER_DESIGNATIONS_SINGLE_HOLDER_FKEY = "user_designations_single_holder_fkey",
  USER_DESIGNATIONS_SINGLE_HOLDER_KEY = "user_designations_single_holder_key",
}
