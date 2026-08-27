import { verifyPassword, burnHashTime } from "../utils/shared/password.util.js";
import { issueSessionToken, verifySessionToken } from "../utils/auth/session-token.util.js";
import { UnauthorizedError } from "../errors/unauthorized.error.js";
import { ForbiddenError } from "../errors/forbidden.error.js";
import { logger } from "../utils/shared/logger.util.js";
import type { IAuthStore } from "./auth-store/auth-store.interface.js";
import type { AppConfig } from "../lib/types/config/config.type.js";
import type { AuthAudience, AuthUser, AuthUserRow, LoginResult } from "../lib/types/auth/auth.type.js";

export interface AuthServiceOptions {
  authStore: IAuthStore;
  config: AppConfig;
}

export class AuthService {
  private readonly authStore: IAuthStore;
  private readonly config: AppConfig;

  constructor({ authStore, config }: AuthServiceOptions) {
    this.authStore = authStore;
    this.config = config;
  }

  async login(audience: AuthAudience, username: string, password: string): Promise<LoginResult> {
    const user = await this.authStore.findByUsername(audience, username);

    if (!user) {
      await burnHashTime(); // equalise timing with the wrong-password path below
      throw new UnauthorizedError("Invalid username or password");
    }

    const ok = await verifyPassword(password, user.password_hash);

    if (!ok) {
      const count = await this.authStore.recordFailedAttempt(audience, user.id, new Date());
      logger.warn("failed login", { audience, username: user.username, count });

      const max = this.config.auth.maxFailedAttempts;
      if (max > 0 && count >= max) {
        throw new ForbiddenError("Account locked after too many failed attempts");
      }
      throw new UnauthorizedError("Invalid username or password");
    }

    if (!user.is_active) throw new ForbiddenError("Account is disabled");

    await this.authStore.recordSuccessfulLogin(audience, user.id, new Date());

    const authUser = toAuthUser(user, audience);
    const { token, expiresAt } = issueSessionToken(
      authUser,
      this.config.auth.sessionTokenSecret,
      this.config.auth.sessionTtlHours,
    );

    return { token, expires_at: expiresAt.toISOString(), user: authUser };
  }

  async getUserFromToken(token: string): Promise<AuthUser | null> {
    const payload = verifySessionToken(token, this.config.auth.sessionTokenSecret);
    if (!payload) return null;

    const row = await this.authStore.findById(payload.aud, payload.sub);
    if (!row || !row.is_active) return null;

    return toAuthUser(row, payload.aud);
  }
}

function toAuthUser(row: AuthUserRow, audience: AuthAudience): AuthUser {
  return {
    id: row.id,
    audience,
    username: row.username,
    email: row.email,
    full_name: row.full_name,
    department: row.department,
    organisation: row.organisation,
    faculty: row.faculty,
  };
}
