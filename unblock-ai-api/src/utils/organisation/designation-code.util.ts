import { DESIGNATION_CODE_PATTERN, DESIGNATION_FIELD_LIMIT } from "../../data/constants/designation.constant.js";

export function normalizeDesignationCode(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidDesignationCode(normalized: string): boolean {
  return normalized.length <= DESIGNATION_FIELD_LIMIT.CODE_MAX_LENGTH && DESIGNATION_CODE_PATTERN.test(normalized);
}
