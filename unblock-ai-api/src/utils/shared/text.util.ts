export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function normalizeOptionalText(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

export function titleCaseIdentifier(identifier: string): string {
  return identifier.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
