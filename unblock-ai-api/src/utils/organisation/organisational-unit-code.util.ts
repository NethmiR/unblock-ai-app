import {
  ORGANISATIONAL_UNIT_CODE_PATTERN,
  ORGANISATIONAL_UNIT_FIELD_LIMIT,
} from "../../data/constants/organisational-unit.constant.js";

export function normalizeOrganisationalUnitCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidOrganisationalUnitCode(normalized: string): boolean {
  return (
    normalized.length <= ORGANISATIONAL_UNIT_FIELD_LIMIT.CODE_MAX_LENGTH &&
    ORGANISATIONAL_UNIT_CODE_PATTERN.test(normalized)
  );
}
