export enum ListQueryParam {
  SEARCH = "search",
  STATUS = "status",
  UNIT = "unit",
  DECISION = "decision",
  OFFSET = "offset",
}

export function parseOffset(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
