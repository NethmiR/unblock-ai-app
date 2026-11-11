export enum SeedCommand {
  RUN = "run",
  LIST = "list",
  CREATE = "create",
}

export enum SeedOutcomeStatus {
  CREATED = "created",
  SKIPPED = "skipped",
}

export enum SeedEntity {
  USER = "user",
}

export const SEED_FILE = {
  PATTERN: /^(\d{14})_([a-z0-9]+(?:-[a-z0-9]+)*)\.seeder\.(ts|js)$/,
  SUFFIX: ".seeder",
  SOURCE_EXTENSION: "ts",
} as const;
