import { MIGRATION_FILE } from "../../data/constants/migration.constant.js";
import { MigrationError } from "../../errors/migration.error.js";
import { toFileSlug, toFileTimestamp } from "../shared/timestamped-file-name.util.js";
import type { ParsedMigrationFileName } from "../../lib/types/migration/migration.type.js";

export function toMigrationSlug(input: string): string {
  return toFileSlug(input);
}

export function toMigrationTimestamp(date: Date): string {
  return toFileTimestamp(date);
}

export function buildMigrationFileName(input: string, date: Date): string {
  const slug = toMigrationSlug(input);
  if (!slug) {
    throw new MigrationError("A migration name with at least one letter or digit is required");
  }
  return `${toMigrationTimestamp(date)}_${slug}${MIGRATION_FILE.SUFFIX}.${MIGRATION_FILE.SOURCE_EXTENSION}`;
}

export function parseMigrationFileName(fileName: string): ParsedMigrationFileName | null {
  const match = MIGRATION_FILE.PATTERN.exec(fileName);
  if (!match) return null;

  const [, timestamp, slug, extension] = match as unknown as [string, string, string, string];
  return { name: `${timestamp}_${slug}`, timestamp, slug, extension };
}
