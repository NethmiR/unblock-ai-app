import type { UserSessionRevocationReason } from "../../data/constants/user-session.constant.js";
import type {
  CreateUserSessionRecordInput,
  UserSessionRecord,
} from "../../lib/types/user-session/user-session.type.js";

export interface IUserSessionRepository {
  create(input: CreateUserSessionRecordInput): Promise<UserSessionRecord>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<UserSessionRecord | null>;
  listActiveByUserId(userId: string, now: Date): Promise<UserSessionRecord[]>;
  touch(id: string, at: Date): Promise<void>;
  revoke(id: string, userId: string, reason: UserSessionRevocationReason, at: Date): Promise<boolean>;
  revokeAllExcept(
    userId: string,
    keepSessionId: string,
    reason: UserSessionRevocationReason,
    at: Date,
  ): Promise<number>;
  deleteExpiredByUserId(userId: string, now: Date): Promise<number>;
}
