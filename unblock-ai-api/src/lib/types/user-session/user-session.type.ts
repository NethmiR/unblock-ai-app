import type { UserSessionRevocationReason } from "../../../data/constants/user-session.constant.js";

export interface UserSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revocationReason: UserSessionRevocationReason | null;
}

export interface CreateUserSessionRecordInput {
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  expiresAt: Date;
}

export interface UserSessionClientMetadata {
  userAgent: string | null;
}

export interface IssuedUserSession {
  token: string;
  session: UserSessionRecord;
}

export interface UserSessionDto {
  id: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
}
