import { randomUUID } from "node:crypto";
import type { UserSessionRevocationReason } from "../../data/constants/user-session.constant.js";
import type { IUserSessionRepository } from "./user-session-repository.interface.js";
import type {
  CreateUserSessionRecordInput,
  UserSessionRecord,
} from "../../lib/types/user-session/user-session.type.js";

export interface InMemoryUserSessionRepositoryOptions {
  sessions?: UserSessionRecord[];
}

function isActive(session: UserSessionRecord, now: Date): boolean {
  return session.revokedAt === null && session.expiresAt > now;
}

export class InMemoryUserSessionRepository implements IUserSessionRepository {
  private readonly sessions = new Map<string, UserSessionRecord>();

  constructor({ sessions = [] }: InMemoryUserSessionRepositoryOptions = {}) {
    for (const session of sessions) this.sessions.set(session.id, { ...session });
  }

  async create(input: CreateUserSessionRecordInput): Promise<UserSessionRecord> {
    const now = new Date();
    const session: UserSessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      userAgent: input.userAgent,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: input.expiresAt,
      revokedAt: null,
      revocationReason: null,
    };
    this.sessions.set(session.id, session);
    return { ...session };
  }

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<UserSessionRecord | null> {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.tokenHash === tokenHash && isActive(candidate, now),
    );
    return session ? { ...session } : null;
  }

  async listActiveByUserId(userId: string, now: Date): Promise<UserSessionRecord[]> {
    return [...this.sessions.values()]
      .filter((session) => session.userId === userId && isActive(session, now))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
      .map((session) => ({ ...session }));
  }

  async touch(id: string, at: Date): Promise<void> {
    const session = this.sessions.get(id);
    if (session) session.lastSeenAt = at;
  }

  async revoke(id: string, userId: string, reason: UserSessionRevocationReason, at: Date): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session || session.userId !== userId || !isActive(session, at)) return false;
    session.revokedAt = at;
    session.revocationReason = reason;
    return true;
  }

  async revokeAllExcept(
    userId: string,
    keepSessionId: string,
    reason: UserSessionRevocationReason,
    at: Date,
  ): Promise<number> {
    let revoked = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.id !== keepSessionId && isActive(session, at)) {
        session.revokedAt = at;
        session.revocationReason = reason;
        revoked += 1;
      }
    }
    return revoked;
  }

  async deleteExpiredByUserId(userId: string, now: Date): Promise<number> {
    let deleted = 0;
    for (const session of [...this.sessions.values()]) {
      if (session.userId === userId && session.expiresAt <= now) {
        this.sessions.delete(session.id);
        deleted += 1;
      }
    }
    return deleted;
  }
}
