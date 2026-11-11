import { createHash, randomBytes } from "node:crypto";
import { USER_SESSION_TOKEN } from "../../data/constants/user-session.constant.js";

export function generateUserSessionToken(): string {
  return randomBytes(USER_SESSION_TOKEN.BYTE_LENGTH).toString(USER_SESSION_TOKEN.ENCODING);
}

export function hashUserSessionToken(token: string): string {
  return createHash(USER_SESSION_TOKEN.HASH_ALGORITHM).update(token, "utf8").digest(USER_SESSION_TOKEN.HASH_ENCODING);
}
