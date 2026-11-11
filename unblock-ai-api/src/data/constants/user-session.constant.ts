import { MILLISECONDS_PER_MINUTE } from "./time.constant.js";

export enum UserSessionRevocationReason {
  SIGNED_OUT = "signed_out",
  REVOKED_BY_USER = "revoked_by_user",
}

export const USER_SESSION_TOKEN = {
  BYTE_LENGTH: 32,
  ENCODING: "base64url",
  HASH_ALGORITHM: "sha256",
  HASH_ENCODING: "hex",
} as const;

export const USER_SESSION_ACTIVITY_TOUCH_INTERVAL_MS = 5 * MILLISECONDS_PER_MINUTE;
