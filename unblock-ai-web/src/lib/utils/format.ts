/**
 * Presentation-only helpers. Pure functions of their inputs - no locale
 * detection, no Date.now() captured at module scope (which would freeze on the
 * server and drift from the client).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "2 days ago", "3 weeks ago" - matches the mockup's `updated` column. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(iso).getTime();

  if (elapsed < HOUR) return "just now";
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), "hour");
  const days = Math.floor(elapsed / DAY);
  if (days < 7) return plural(days, "day");
  if (days < 30) return plural(Math.floor(days / 7), "week");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

function plural(n: number, unit: string) {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/** Word count for the editor header. Collapses all whitespace runs. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * "4 Aug 2026, 09:12".
 *
 * `timeZone` is REQUIRED rather than defaulted to the ambient zone. The
 * ambient zone is UTC on the server and the viewer's zone in the browser, so
 * letting it default silently made the output differ between the two render
 * passes and broke hydration. Callers should use `<DateTime>`, which supplies
 * a zone that is stable across hydration.
 */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone,
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
