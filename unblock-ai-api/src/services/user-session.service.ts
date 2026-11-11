import { NotFoundError } from "../errors/not-found.error.js";
import { AuthErrorCode } from "../data/constants/auth.constant.js";
import { MILLISECONDS_PER_HOUR } from "../data/constants/time.constant.js";
import {
  USER_SESSION_ACTIVITY_TOUCH_INTERVAL_MS,
  UserSessionRevocationReason,
} from "../data/constants/user-session.constant.js";
import { generateUserSessionToken, hashUserSessionToken } from "../utils/auth/user-session-token.util.js";
import { serializeUserSession } from "../utils/http/auth-serializer.util.js";
import { logger } from "../utils/shared/logger.util.js";
import type { IUserSessionRepository } from "../repositories/user-session-repository/user-session-repository.interface.js";
import type { AuthConfig } from "../lib/types/config/config.type.js";
import type {
  IssuedUserSession,
  UserSessionClientMetadata,
  UserSessionDto,
  UserSessionRecord,
} from "../lib/types/user-session/user-session.type.js";

export interface UserSessionServiceOptions {
  userSessionRepository: IUserSessionRepository;
  authConfig: AuthConfig;
}

export class UserSessionService {
  private readonly userSessionRepository: IUserSessionRepository;
  private readonly authConfig: AuthConfig;

  constructor({ userSessionRepository, authConfig }: UserSessionServiceOptions) {
    this.userSessionRepository = userSessionRepository;
    this.authConfig = authConfig;
  }

  async issue(userId: string, client: UserSessionClientMetadata): Promise<IssuedUserSession> {
    const now = new Date();
    await this.userSessionRepository.deleteExpiredByUserId(userId, now);

    const token = generateUserSessionToken();
    const session = await this.userSessionRepository.create({
      userId,
      tokenHash: hashUserSessionToken(token),
      userAgent: client.userAgent,
      expiresAt: new Date(now.getTime() + this.authConfig.sessionTtlHours * MILLISECONDS_PER_HOUR),
    });

    return { token, session };
  }

  async resolve(token: string): Promise<UserSessionRecord | null> {
    const now = new Date();
    const session = await this.userSessionRepository.findActiveByTokenHash(hashUserSessionToken(token), now);
    if (!session) return null;

    if (now.getTime() - session.lastSeenAt.getTime() >= USER_SESSION_ACTIVITY_TOUCH_INTERVAL_MS) {
      try {
        await this.userSessionRepository.touch(session.id, now);
      } catch (err) {
        logger.warn("user session touch failed", {
          sessionId: session.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return session;
  }

  async listActive(userId: string, currentSessionId: string): Promise<UserSessionDto[]> {
    const sessions = await this.userSessionRepository.listActiveByUserId(userId, new Date());
    return sessions.map((session) => serializeUserSession(session, currentSessionId));
  }

  async revoke(userId: string, sessionId: string, reason: UserSessionRevocationReason): Promise<void> {
    const revoked = await this.userSessionRepository.revoke(sessionId, userId, reason, new Date());
    if (!revoked) {
      throw new NotFoundError(`User session '${sessionId}' not found`, {
        code: AuthErrorCode.USER_SESSION_NOT_FOUND,
      });
    }
  }

  revokeOthers(userId: string, currentSessionId: string): Promise<number> {
    return this.userSessionRepository.revokeAllExcept(
      userId,
      currentSessionId,
      UserSessionRevocationReason.REVOKED_BY_USER,
      new Date(),
    );
  }
}
