export enum MigrationCommand {
  UP = "up",
  DOWN = "down",
  RESET = "reset",
  STATUS = "status",
  CREATE = "create",
  UNLOCK = "unlock",
}

export enum MigrationState {
  APPLIED = "applied",
  PENDING = "pending",
  MISSING = "missing",
}

export const MIGRATION_TRACKING = {
  STORE: "migrations",
  LOCK: "migrations_lock",
  LOCK_KEY: 1,
} as const;

export const MIGRATION_FILE = {
  PATTERN: /^(\d{14})_([a-z0-9]+(?:-[a-z0-9]+)*)\.migration\.(ts|js)$/,
  SUFFIX: ".migration",
  SOURCE_EXTENSION: "ts",
} as const;
