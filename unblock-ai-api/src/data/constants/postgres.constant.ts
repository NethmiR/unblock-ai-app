export enum PostgresErrorCode {
  UNIQUE_VIOLATION = "23505",
  FOREIGN_KEY_VIOLATION = "23503",
  CHECK_VIOLATION = "23514",
}

export enum PostgresConstraint {
  USERS_EMAIL_KEY = "users_email_key",
}
