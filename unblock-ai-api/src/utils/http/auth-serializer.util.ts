import type {
  AuthContext,
  AuthenticatedUser,
  AuthenticatedUserDto,
  CurrentUserResponseDto,
  LoginResponseDto,
  LoginResult,
} from "../../lib/types/auth/auth.type.js";
import type { UserSessionDto, UserSessionRecord } from "../../lib/types/user-session/user-session.type.js";

export function serializeAuthenticatedUser(user: AuthenticatedUser): AuthenticatedUserDto {
  return {
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    permissions: [...user.permissions],
  };
}

export function serializeLoginResult(result: LoginResult): LoginResponseDto {
  return {
    token: result.token,
    expires_at: result.expiresAt.toISOString(),
    user: serializeAuthenticatedUser(result.user),
  };
}

export function serializeCurrentUser(context: AuthContext): CurrentUserResponseDto {
  return {
    user: serializeAuthenticatedUser(context.user),
    session: { id: context.session.id, expires_at: context.session.expiresAt.toISOString() },
  };
}

export function serializeUserSession(record: UserSessionRecord, currentSessionId: string): UserSessionDto {
  return {
    id: record.id,
    user_agent: record.userAgent,
    created_at: record.createdAt.toISOString(),
    last_seen_at: record.lastSeenAt.toISOString(),
    expires_at: record.expiresAt.toISOString(),
    is_current: record.id === currentSessionId,
  };
}
