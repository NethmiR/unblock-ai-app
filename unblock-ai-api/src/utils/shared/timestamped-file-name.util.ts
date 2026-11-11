export function toFileSlug(input: string): string {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toFileTimestamp(date: Date): string {
  return date.toISOString().replace(/\D/g, "").slice(0, 14);
}
