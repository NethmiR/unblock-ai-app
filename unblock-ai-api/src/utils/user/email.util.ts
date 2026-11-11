import { EMAIL_PATTERN, USER_FIELD_LIMIT } from "../../data/constants/user.constant.js";

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(normalized: string): boolean {
  return normalized.length <= USER_FIELD_LIMIT.EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(normalized);
}
