import { SEED_FILE } from "../../data/constants/seed.constant.js";
import { SeedError } from "../../errors/seed.error.js";
import { toFileSlug, toFileTimestamp } from "../shared/timestamped-file-name.util.js";
import type { ParsedSeedFileName } from "../../lib/types/seed/seed.type.js";

export function buildSeedFileName(input: string, date: Date): string {
  const slug = toFileSlug(input);
  if (!slug) {
    throw new SeedError("A seeder name with at least one letter or digit is required");
  }
  return `${toFileTimestamp(date)}_${slug}${SEED_FILE.SUFFIX}.${SEED_FILE.SOURCE_EXTENSION}`;
}

export function parseSeedFileName(fileName: string): ParsedSeedFileName | null {
  const match = SEED_FILE.PATTERN.exec(fileName);
  if (!match) return null;

  const [, timestamp, slug, extension] = match as unknown as [string, string, string, string];
  return { name: `${timestamp}_${slug}`, timestamp, slug, extension };
}
