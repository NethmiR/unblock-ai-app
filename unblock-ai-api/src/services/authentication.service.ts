import { burnHashTime, verifyPassword } from "../utils/shared/password.util.js";
import { normalizeEmail } from "../utils/user/email.util.js";
import { toAuthenticatedUser } from "../utils/auth/authenticated-user.util.js";
import { logger } from "../utils/shared/logger.util.js";
import { UnauthorizedError } from "../errors/unauthorized.error.js";
import { ForbiddenError } from "../errors/forbidden.error.js";
import { AuthErrorCode } from "../data/constants/auth.constant.js";
import { UserStatus } from "../data/constants/user.constant.js";
import { MILLISECONDS_PER_MINUTE } from "../data/constants/time.constant.js";
import { UserSessionRevocationReason } from "../data/constants/user-session.constant.js";
import type { UserSessionService } from "./user-session.service.js";
import type { IUserRepository } from "../repositories/user-repository/user-repository.interface.js";
import type { AuthConfig } from "../lib/types/config/config.type.js";
import type { AuthContext, LoginCredentials, LoginResult } from "../lib/types/auth/auth.type.js";
import type { UserCredentialRecord } from "../lib/types/user/user.type.js";
import type { UserSessionClientMetadata } from "../lib/types/user-session/user-session.type.js";

export interface AuthenticationServiceOptions {
  userRepository: IUserRepository;
  userSessionService: UserSessionService;
  authConfig: AuthConfig;
}

export class AuthenticationService {
  private readonly userRepository: IUserRepository;
  private readonly userSessionService: UserSessionService;
  private readonly authConfig: AuthConfig;

  constructor({ userRepository, userSessionService, authConfig }: AuthenticationServiceOptions) {
    this.userRepository = userRepository;
    this.userSessionService = userSessionService;
    this.authConfig = authConfig;
  }

  async login(credentials: LoginCredentials, client: UserSessionClientMetadata): Promise<LoginResult> {
    const user = await this.userRepository.findCredentialByEmail(normalizeEmail(credentials.email));

    if (!user) {
      await burnHashTime();
      throw invalidCredentials();
    }

    const now = new Date();
    const failureWindowStart = new Date(now.getTime() - this.authConfig.lockoutDurationMinutes * MILLISECONDS_PER_MINUTE);
    const passwordMatches = await verifyPassword(credentials.password, user.passwordHash);

    if (this.isLocked(user, failureWindowStart)) throw accountLocked();

    if (!passwordMatches) {
      const count = await this.userRepository.recordFailedLogin(user.id, now, failureWindowStart);
      logger.warn("failed login", { userId: user.id, count });
      if (this.lockoutEnabled() && count >= this.authConfig.maxFailedAttempts) throw accountLocked();
      throw invalidCredentials();
    }

    if (user.status === UserStatus.DISABLED) {
      throw new ForbiddenError("Account is disabled", { code: AuthErrorCode.ACCOUNT_DISABLED });
    }

    await this.userRepository.recordSuccessfulLogin(user.id, now);
    const { token, session } = await this.userSessionService.issue(user.id, client);

    return { token, expiresAt: session.expiresAt, user: toAuthenticatedUser(user) };
  }

  async authenticate(token: string): Promise<AuthContext | null> {
    const session = await this.userSessionService.resolve(token);
    if (!session) return null;

    const user = await this.userRepository.findById(session.userId);
    if (!user || user.status !== UserStatus.ACTIVE) return null;

    return {
      user: toAuthenticatedUser(user),
      session: { id: session.id, expiresAt: session.expiresAt },
    };
  }

  logout(context: AuthContext): Promise<void> {
    return this.userSessionService.revoke(
      context.user.id,
      context.session.id,
      UserSessionRevocationReason.SIGNED_OUT,
    );
  }

  private lockoutEnabled(): boolean {
    return this.authConfig.maxFailedAttempts > 0;
  }

  private isLocked(user: UserCredentialRecord, failureWindowStart: Date): boolean {
    return (
      this.lockoutEnabled() &&
      user.failedLoginCount >= this.authConfig.maxFailedAttempts &&
      user.lastFailedLoginAt !== null &&
      user.lastFailedLoginAt > failureWindowStart
    );
  }
}

function invalidCredentials(): UnauthorizedError {
  return new UnauthorizedError("Invalid email or password", { code: AuthErrorCode.INVALID_CREDENTIALS });
}

function accountLocked(): ForbiddenError {
  return new ForbiddenError("Account locked after too many failed attempts", { code: AuthErrorCode.ACCOUNT_LOCKED });
}
