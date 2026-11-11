import { MIGRATION_FILE } from "../../data/constants/migration.constant.js";
import { MigrationError } from "../../errors/migration.error.js";
import type { ParsedMigrationFileName } from "../../lib/types/migration/migration.type.js";

export function toMigrationSlug(input: string): string {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toMigrationTimestamp(date: Date): string {
  return date.toISOString().replace(/\D/g, "").slice(0, 14);
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
