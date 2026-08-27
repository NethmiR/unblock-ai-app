export type AuthAudience = "admin" | "portal";

/** Row shape shared by admin_users and portal_users. `faculty` is NULL for admins. */
export interface AuthUserRow {
  id: string;
  username: string;
  email: string;
  full_name: string;
  department: string | null;
  organisation: string | null;
  faculty: string | null;
  password_hash: string;
  is_active: boolean;
  last_login_at: Date | null;
  failed_attempt_count: number;
  last_failed_attempt_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** What a request actually gets back - never includes password_hash. */
export interface AuthUser {
  id: string;
  audience: AuthAudience;
  username: string;
  email: string;
  full_name: string;
  department: string | null;
  organisation: string | null;
  faculty: string | null;
}

/** HMAC-signed stateless session cookie payload (D-3). */
export interface SessionPayload {
  sub: string;
  aud: AuthAudience;
  usr: string;
  exp: number;
}

export interface LoginCredentials {
  audience: AuthAudience;
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
  expires_at: string;
  user: AuthUser;
}

/**
 * Input to `IAuthStore.recordTemplateDeletion` - snake_case and insert-shaped,
 * matching how the rest of this codebase passes storage-shaped objects to a
 * model/store layer (see `AuditLogModel.insert`).
 */
export interface TemplateDeletionInput {
  workflow_id: string;
  template_title: string;
  latest_version: number;
  institution_type: string | null;
  review_status: string | null;
  admin_id: string;
  admin_username: string;
  reason: string | null;
  request_id: string | null;
  snapshot: Record<string, unknown>;
}

/**
 * A row from `template_deletions`. `versions_removed` starts at `0` and is
 * only updated by `markDeletionCompleted` once the Mongo delete has actually
 * landed - see Finding 0.1 / the ordering comment in `WorkflowService.delete`.
 */
export interface TemplateDeletionRecord {
  id: string;
  workflow_id: string;
  template_title: string;
  latest_version: number;
  versions_removed: number;
  institution_type: string | null;
  review_status: string | null;
  deleted_by_admin_id: string;
  deleted_by_username: string;
  reason: string | null;
  request_id: string | null;
  snapshot: Record<string, unknown>;
  deleted_at: Date;
}
