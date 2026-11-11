# User Access & Session Management — Phase Plan

This plan replaces the two-audience login with:

- one `users` table
- server-side sessions in a `user_sessions` table, with any number of concurrent sessions per user
- permission-based access control
- a reusable Postgres seed pack

The frontend gets a single new login and an account page. The old dashboards stay where they are until they are redesigned.

Each phase can be built independently by an agent that reads **§1 Ground rules**, **§2 Decisions**, **§3 Contracts**, and then its own phase section. Every phase must leave `npm run typecheck && npm test` green in the app(s) it touches. **Stop after each phase, run its verification block, then move on.**

---

## Table of contents

1. [Ground rules for every phase](#1-ground-rules-for-every-phase)
2. [Decisions](#2-decisions)
3. [Contracts](#3-contracts)
4. [Phase map](#4-phase-map)
5. [Phase 1 — Foundations](#phase-1--foundations-enums-types-config-utilities)
6. [Phase 2 — Postgres schema and repositories](#phase-2--postgres-schema-and-repositories)
7. [Phase 3 — Authentication, sessions and permission guards](#phase-3--authentication-sessions-and-permission-guards)
8. [Phase 4 — User management API](#phase-4--user-management-api)
9. [Phase 5 — Postgres seed pack](#phase-5--postgres-seed-pack)
10. [Phase 6 — Task ownership enforcement](#phase-6--task-ownership-enforcement)
11. [Phase 7 — Frontend login and account page](#phase-7--frontend-login-and-account-page)
12. [Phase 8 — Documentation, Postman and cleanup](#phase-8--documentation-postman-and-cleanup)
13. [Out of scope and follow-ups](#13-out-of-scope-and-follow-ups)

---

## 1. Ground rules for every phase

These rules come straight from the change request. They are not optional.

### 1.1 Code standards

| Rule | What it means here |
|---|---|
| **Enums, not string literals** | Every fixed value is a TypeScript `enum` in `src/data/constants/*.constant.ts`, written in the same style as `MigrationCommand` in `migration.constant.ts`. That covers permissions, user status, revocation reasons, error codes, repository backends and seed commands. Never compare against a raw string such as `"user:manage"` or `"active"`. Older `as const` objects such as `TASK_STATUS` stay as they are. Do not convert them in this work. |
| **Strict types** | No `any`. No unchecked casts from request bodies. Request input goes through validators that return typed values. Every public method has explicit parameter and return types. |
| **Interfaces for contracts** | A repository contract is an interface prefixed with `I`, following `IVectorStore` and `IMailer`. Each one has a Postgres implementation, an in-memory implementation and a factory in `index.<folder>.ts`. |
| **Naming** | Use the file pattern `<name>.<kind>.ts`, as the codebase already does (`user.service.ts`, `user.route.ts`, `user.constant.ts`, `user.type.ts`). Pick names that cannot be misread. An authentication session is always a **user session**: `user_sessions`, `UserSession*`, `user-session.*`. That keeps it distinct from the Mongo `selection_sessions` / `SelectionSession*` that already exist. |
| **No unnecessary comments** | New code carries no comments, except a one-line *why* where the reason is not obvious. Do **not** strip existing comments from files you only touch lightly. Comments in code you delete or rewrite go with it. |
| **Modular and reusable** | Each piece of logic lives in exactly one place: bearer-token parsing, email normalisation, permission checks, Postgres error mapping, timestamped file names. If you are about to copy logic, extract a util instead. |
| **Narrow dependencies** | New services take only the config slice they need (`AuthConfig`, `UserConfig`), not the whole `AppConfig`. This lets the seed script build a `UserService` without loading LLM or mail config. |
| **Migrations are frozen** | Migration files use literal SQL and literal values and never import app enums. A migration records history: if an enum is renamed later, an already-applied migration must not change. This is the only sanctioned exception to "no hardcoded strings". |
| **JSON shape** | HTTP request and response bodies use `snake_case`, matching the existing API (`full_name`, `expires_at`). TypeScript internals use `camelCase`. Serializers convert between them. |

### 1.2 Process rules

- API commands run from `unblock-ai-api/` and web commands from `unblock-ai-web/`.
- The web app runs **Next.js 16**. Before writing any web code, read `unblock-ai-web/AGENTS.md` and the relevant guides in `unblock-ai-web/node_modules/next/dist/docs/`. `proxy.ts` replaces `middleware.ts`.
- Do not commit unless asked. Do not edit the two existing `20261111000000_initial-schema.migration.ts` files.
- The web types in `unblock-ai-web/src/types/*.ts` mirror the API by hand. When an API contract changes, change the mirror in the same phase that ships the API change, or in Phase 7 for auth.

---

## 2. Decisions

These are settled. Do not reopen them while implementing.

| # | Decision |
|---|---|
| D-1 | **"Function" is called a *permission*.** The four permissions are `workflow:manage`, `task:create`, `task:approve` and `user:manage`, in `resource:action` form. |
| D-2 | **A single `users` table.** It holds identity and credential fields only: email, full name, password hash, status, login bookkeeping and creator. `username`, `department`, `faculty` and `organisation` are **dropped**. Profile data will get its own tables later. |
| D-3 | **Users sign in with email.** Email is stored normalised (trimmed and lower-cased) and is unique on `lower(email)`. |
| D-4 | **Permissions are relational.** A `permissions` catalogue table holds the four codes, inserted by the migration as reference data. A `user_permissions` join table links users to codes, with FKs on both sides. |
| D-5 | **Every user must hold at least one permission.** This is enforced twice. `UserService` validates the input, and a `DEFERRABLE INITIALLY DEFERRED` constraint trigger rejects at `COMMIT` any transaction that leaves a user with no permissions. |
| D-6 | **Sessions are opaque and stored server-side.** The login endpoint returns a random 256-bit token encoded as base64url. Only its SHA-256 hex hash is stored, in `user_sessions.token_hash`. Logout and revocation take effect immediately. The HMAC session token, `SESSION_TOKEN_SECRET` and the web-side token verifier are **deleted**. |
| D-7 | **Session expiry is absolute.** A session expires `SESSION_TTL_HOURS` after login, with no sliding renewal. `last_seen_at` is refreshed at most once every 5 minutes per session. A user's expired sessions are deleted each time that user logs in. There is no limit on concurrent sessions. |
| D-8 | **Sessions record `user_agent` only.** No IP address is stored; see §13. The web login route forwards the browser's `User-Agent` to the API. |
| D-9 | **Account lockout.** When `AUTH_MAX_FAILED_ATTEMPTS > 0`, an account is locked while `failed_login_count >= max` and the last failure happened within `AUTH_LOCKOUT_DURATION_MINUTES`. A locked account is rejected **even with the correct password**; the current code lets a correct password through. The failure counter restarts at 1 once the window has passed. A successful login resets it to 0. |
| D-10 | **New users get the default password** from `USER_DEFAULT_PASSWORD` (`12345` in `.example.env`). The value is required, has no code fallback and is never logged. There is no password change, reset or forgotten-password flow in this round. |
| D-11 | **User management API: create, list and get-by-id only.** There are no update, deactivate or delete endpoints yet. A `user:manage` holder may grant any permission, including `user:manage`. |
| D-12 | **`task:approve` is defined, seeded and grantable, but gates nothing yet.** Approval links (`/api/approvals/:token`) stay public and token-based, exactly as they are today. Requiring approvers to log in is a later revamp. |
| D-13 | **Postgres migrations.** Add **one new** Postgres migration. Keep the existing initial-schema migrations untouched. There is **no** Mongo migration, because nothing in Mongo changes structurally. `tasks.created_by` is still a string user id. |
| D-14 | **`template_deletions` points at `users`.** `deleted_by_admin_id` becomes `deleted_by_user_id` (FK to `users`), and `deleted_by_username` becomes `deleted_by_email`. |
| D-15 | **Audit actor.** `AuditActor` loses `role`, which was the audience and no longer exists. It becomes `{ id, email }`. Existing Mongo audit documents that still carry `role` stay readable. |
| D-16 | **The data-access layer is split by responsibility.** `services/auth-store/` (`IAuthStore`) currently mixes credentials with template-deletion logging. It is replaced by three repositories under `src/repositories/`: user, user session and template deletion. |
| D-17 | **`AUTH_STORE_BACKEND` becomes `POSTGRES_REPOSITORY_BACKEND`** (`postgres` or `memory`). It selects the implementation for all three repositories. |
| D-18 | **The seed pack mirrors the migration pack.** It has a core runner, loader, generator, engine and CLI, plus timestamped `*.seeder.ts` files. Seeders are **idempotent and untracked**: every run re-checks and skips what already exists. Seeders go through services such as `UserService`, not raw SQL, so business rules apply. The only seeder is the bootstrap administrator, who holds all four permissions. |
| D-19 | **Tasks are owner-only.** Every `/tasks` route is limited to the task's creator. `GET /tasks` always filters by the caller. A task that exists but belongs to someone else returns **404**, not 403, so its existence is not revealed. |
| D-20 | **Frontend.** There is one `/login` page (email and password). After login, users land on a new `/account` page showing their profile, permissions and active sessions, with revoke-one, revoke-others and sign-out actions. `/portal/login` is deleted. `/admin` and `/portal` stay reachable by URL with the fixes needed to compile, but nothing links to them or redirects there. The API's permission guards are the real boundary. |

---

## 3. Contracts

Every phase builds against these definitions. Where a phase needs one, it references this section instead of restating it.

### 3.1 Enums (API: `unblock-ai-api/src/data/constants/`)

```ts
// permission.constant.ts
export enum Permission {
  WORKFLOW_MANAGE = "workflow:manage",
  TASK_CREATE = "task:create",
  TASK_APPROVE = "task:approve",
  USER_MANAGE = "user:manage",
}
export const PERMISSIONS: readonly Permission[] = Object.values(Permission);

// user.constant.ts
export enum UserStatus {
  ACTIVE = "active",
  DISABLED = "disabled",
}
export const USER_FIELD_LIMIT = {
  EMAIL_MAX_LENGTH: 254,
  FULL_NAME_MAX_LENGTH: 200,
} as const;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// user-session.constant.ts
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
export const USER_SESSION_ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

// auth.constant.ts
export enum AuthErrorCode {
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
  ACCOUNT_DISABLED = "ACCOUNT_DISABLED",
  AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  USER_SESSION_NOT_FOUND = "USER_SESSION_NOT_FOUND",
}
export const AUTHORIZATION_SCHEME = "Bearer";

// user-error.constant.ts
export enum UserErrorCode {
  EMAIL_ALREADY_REGISTERED = "EMAIL_ALREADY_REGISTERED",
  USER_NOT_FOUND = "USER_NOT_FOUND",
}

// repository.constant.ts
export enum RepositoryBackend {
  POSTGRES = "postgres",
  MEMORY = "memory",
}
export const REPOSITORY_BACKENDS: readonly RepositoryBackend[] = Object.values(RepositoryBackend);

// postgres.constant.ts
export enum PostgresErrorCode {
  UNIQUE_VIOLATION = "23505",
  FOREIGN_KEY_VIOLATION = "23503",
  CHECK_VIOLATION = "23514",
}
export enum PostgresConstraint {
  USERS_EMAIL_KEY = "users_email_key",
}

// seed.constant.ts  (Phase 5)
export enum SeedCommand {
  RUN = "run",
  LIST = "list",
  CREATE = "create",
}
export enum SeedOutcomeStatus {
  CREATED = "created",
  SKIPPED = "skipped",
}
export enum SeedEntity {
  USER = "user",
}
export const SEED_FILE = {
  PATTERN: /^(\d{14})_([a-z0-9]+(?:-[a-z0-9]+)*)\.seeder\.(ts|js)$/,
  SUFFIX: ".seeder",
  SOURCE_EXTENSION: "ts",
} as const;
```

### 3.2 Environment variables (API)

| Variable | Status | Default | Purpose |
|---|---|---|---|
| `USER_DEFAULT_PASSWORD` | **new, required** | none (`12345` in `.example.env`) | Initial password for every created user (D-10) |
| `POSTGRES_REPOSITORY_BACKEND` | **new** (replaces `AUTH_STORE_BACKEND`) | `postgres` | Implementation used by the user, user-session and template-deletion repositories |
| `AUTH_LOCKOUT_DURATION_MINUTES` | **new** | `15` | Lockout window (D-9) |
| `SESSION_TTL_HOURS` | kept | `12` | Absolute session lifetime |
| `AUTH_MAX_FAILED_ATTEMPTS` | kept | `0` (disabled) | Failed attempts before lockout |
| `SEED_ADMINISTRATOR_EMAIL` | **new**, seed-only | none | Bootstrap administrator email (Phase 5) |
| `SEED_ADMINISTRATOR_FULL_NAME` | **new**, seed-only | none | Bootstrap administrator name (Phase 5) |
| `SESSION_TOKEN_SECRET` | **removed** | — | No longer used (D-6) |
| `AUTH_STORE_BACKEND` | **removed** | — | Renamed (D-17) |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `SEED_USER1_*`, `SEED_USER2_*` | **removed** | — | Old seed script deleted |

Web: `SESSION_TOKEN_SECRET` is **removed** from the web app's env.

### 3.3 Config types (`src/lib/types/config/config.type.ts`)

```ts
export interface AuthConfig {
  sessionTtlHours: number;
  maxFailedAttempts: number;
  lockoutDurationMinutes: number;
}

export interface UserConfig {
  defaultPassword: string;
}

export interface PostgresConfig {
  url: string;
  poolMax: number;
  connectionTimeoutMs: number;
  repositoryBackend: RepositoryBackend;
}

export interface SeedConfig {
  administratorEmail: string;
  administratorFullName: string;
}
```

`AppConfig` gains `user: UserConfig`. `SeedConfig` is **not** part of `AppConfig`. It is built lazily by `src/config/seed.config.ts`, so the server never requires seed variables.

### 3.4 Database schema (Postgres, after the new migration)

```sql
CREATE TABLE permissions (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE users (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT        NOT NULL,
  full_name            TEXT        NOT NULL,
  password_hash        TEXT        NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'active',
  failed_login_count   INTEGER     NOT NULL DEFAULT 0,
  last_failed_login_at TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ,
  created_by_user_id   UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_status_check             CHECK (status IN ('active', 'disabled')),
  CONSTRAINT users_failed_login_count_check CHECK (failed_login_count >= 0),
  CONSTRAINT users_email_normalised_check   CHECK (email = lower(btrim(email))),
  CONSTRAINT users_created_by_user_id_fkey  FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE user_permissions (
  user_id            UUID        NOT NULL,
  permission_code    TEXT        NOT NULL,
  granted_by_user_id UUID,
  granted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_permissions_pkey                    PRIMARY KEY (user_id, permission_code),
  CONSTRAINT user_permissions_user_id_fkey            FOREIGN KEY (user_id)            REFERENCES users (id)         ON DELETE CASCADE,
  CONSTRAINT user_permissions_permission_code_fkey    FOREIGN KEY (permission_code)    REFERENCES permissions (code) ON DELETE RESTRICT,
  CONSTRAINT user_permissions_granted_by_user_id_fkey FOREIGN KEY (granted_by_user_id) REFERENCES users (id)         ON DELETE SET NULL
);
CREATE INDEX user_permissions_permission_code_idx ON user_permissions (permission_code);

CREATE TABLE user_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL,
  token_hash        TEXT        NOT NULL,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  revocation_reason TEXT,
  CONSTRAINT user_sessions_user_id_fkey      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_sessions_token_hash_key    UNIQUE (token_hash),
  CONSTRAINT user_sessions_expiry_check      CHECK (expires_at > created_at),
  CONSTRAINT user_sessions_revocation_check  CHECK (
    (revoked_at IS NULL AND revocation_reason IS NULL) OR
    (revoked_at IS NOT NULL AND revocation_reason IN ('signed_out', 'revoked_by_user'))
  )
);
CREATE INDEX user_sessions_user_id_active_idx ON user_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX user_sessions_expires_at_idx     ON user_sessions (expires_at);
```

The permission invariant (D-5):

```sql
CREATE FUNCTION enforce_user_has_permission() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_user_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_user_id := NEW.id;
  ELSE
    target_user_id := OLD.user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE id = target_user_id)
     AND NOT EXISTS (SELECT 1 FROM user_permissions WHERE user_id = target_user_id) THEN
    RAISE EXCEPTION 'user % must hold at least one permission', target_user_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER users_require_permission
  AFTER INSERT ON users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_user_has_permission();

CREATE CONSTRAINT TRIGGER user_permissions_require_remaining_permission
  AFTER DELETE ON user_permissions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_user_has_permission();
```

Deleting a user cascades to `user_permissions`. The trigger then finds that the user no longer exists and passes, so user deletion is not blocked.

The `permissions` reference rows are inserted by the migration:

| code | description |
|---|---|
| `workflow:manage` | Create, edit, review and delete workflow templates and drafts |
| `task:create` | Find a workflow and create, complete and manage own task requests |
| `task:approve` | Act on approval steps of tasks |
| `user:manage` | Create and view system users and their permissions |

After the migration, `template_deletions` has this shape. Only the changed parts are shown:

```sql
deleted_by_user_id UUID NOT NULL,
deleted_by_email   TEXT NOT NULL,
CONSTRAINT template_deletions_deleted_by_user_id_fkey
  FOREIGN KEY (deleted_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
-- index template_deletions_admin_idx renamed to template_deletions_user_idx
```

`admin_users` and `portal_users` are dropped.

### 3.5 Domain types (API: `src/lib/types/`)

```ts
// user/user.type.ts
export interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  permissions: Permission[];
  failedLoginCount: number;
  lastFailedLoginAt: Date | null;
  lastLoginAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface UserCredentialRecord extends UserRecord {
  passwordHash: string;
}
export interface CreateUserRecordInput {
  email: string;
  fullName: string;
  passwordHash: string;
  permissions: Permission[];
  createdByUserId: string | null;
}
export interface CreateUserInput {
  email: string;
  fullName: string;
  permissions: readonly string[];
}
export interface UserDto {
  id: string;
  email: string;
  full_name: string;
  status: UserStatus;
  permissions: Permission[];
  last_login_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// user-session/user-session.type.ts
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

// auth/auth.type.ts  (replaces the current file entirely)
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  permissions: Permission[];
}
export interface AuthContext {
  user: AuthenticatedUser;
  session: { id: string; expiresAt: Date };
}
export interface LoginCredentials {
  email: string;
  password: string;
}
export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}
export interface AuthenticatedUserDto {
  id: string;
  email: string;
  full_name: string;
  permissions: Permission[];
}
export interface LoginResponseDto {
  token: string;
  expires_at: string;
  user: AuthenticatedUserDto;
}
export interface CurrentUserResponseDto {
  user: AuthenticatedUserDto;
  session: { id: string; expires_at: string };
}

// template-deletion/template-deletion.type.ts  (moved out of auth.type.ts)
export interface TemplateDeletionInput {
  workflowId: string;
  templateTitle: string;
  latestVersion: number;
  institutionType: string | null;
  reviewStatus: string | null;
  deletedByUserId: string;
  deletedByEmail: string;
  reason: string | null;
  requestId: string | null;
  snapshot: Record<string, unknown>;
}
export interface TemplateDeletionRecord {
  id: string;
  workflow_id: string;
  template_title: string;
  latest_version: number;
  versions_removed: number;
  institution_type: string | null;
  review_status: string | null;
  deleted_by_user_id: string;
  deleted_by_email: string;
  reason: string | null;
  request_id: string | null;
  snapshot: Record<string, unknown>;
  deleted_at: Date;
}
```

`TemplateDeletionRecord` keeps its `snake_case` keys. It is returned as-is by `GET /workflows/deletions` today, and the web type `TemplateDeletion` in `unblock-ai-web/src/types/workflow.ts` mirrors it.

Express augmentation (`src/lib/types/http/http.type.ts`): `req.user?: AuthUser` is **replaced** by `req.auth?: AuthContext`.

### 3.6 Repository interfaces

```ts
// src/repositories/user-repository/user-repository.interface.ts
export interface IUserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findCredentialByEmail(email: string): Promise<UserCredentialRecord | null>;
  existsByEmail(email: string): Promise<boolean>;
  list(): Promise<UserRecord[]>;
  create(input: CreateUserRecordInput): Promise<UserRecord>;
  recordSuccessfulLogin(id: string, at: Date): Promise<void>;
  recordFailedLogin(id: string, at: Date, failureWindowStart: Date): Promise<number>;
}

// src/repositories/user-session-repository/user-session-repository.interface.ts
export interface IUserSessionRepository {
  create(input: CreateUserSessionRecordInput): Promise<UserSessionRecord>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<UserSessionRecord | null>;
  listActiveByUserId(userId: string, now: Date): Promise<UserSessionRecord[]>;
  touch(id: string, at: Date): Promise<void>;
  revoke(id: string, userId: string, reason: UserSessionRevocationReason, at: Date): Promise<boolean>;
  revokeAllExcept(userId: string, keepSessionId: string, reason: UserSessionRevocationReason, at: Date): Promise<number>;
  deleteExpiredByUserId(userId: string, now: Date): Promise<number>;
}

// src/repositories/template-deletion-repository/template-deletion-repository.interface.ts
export interface ITemplateDeletionRepository {
  record(input: TemplateDeletionInput): Promise<TemplateDeletionRecord>;
  markCompleted(id: string, versionsRemoved: number): Promise<void>;
  list(limit: number, workflowId?: string): Promise<TemplateDeletionRecord[]>;
}
```

Repository semantics:

- **`create` (user)** inserts the user and all permission rows in **one** `withTransaction`, with `granted_by_user_id = createdByUserId`. If the error's cause is `PostgresErrorCode.UNIQUE_VIOLATION` on constraint `PostgresConstraint.USERS_EMAIL_KEY`, it throws `ConflictError` with code `UserErrorCode.EMAIL_ALREADY_REGISTERED`. It returns the created record, permissions included.
- **Every user read** aggregates permissions in one query: `COALESCE(array_agg(up.permission_code ORDER BY up.permission_code) FILTER (WHERE up.permission_code IS NOT NULL), '{}')`, grouped by `users.id`. Rows are mapped to `camelCase` records by a single private `toUserRecord` mapper.
- **`list`** orders by `lower(full_name), id`.
- **`recordFailedLogin`** runs the following in one statement and returns the new count:

  ```sql
  failed_login_count = CASE WHEN last_failed_login_at IS NULL OR last_failed_login_at < $3 THEN 1 ELSE failed_login_count + 1 END,
  last_failed_login_at = $2, updated_at = $2
  ```

- **`recordSuccessfulLogin`** sets `last_login_at = $2, failed_login_count = 0, last_failed_login_at = NULL, updated_at = $2`.
- **`findActiveByTokenHash`** matches `revoked_at IS NULL AND expires_at > $now`.
- **`revoke`** updates only `WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, and returns `true` if a row changed. The `user_id` filter is what stops one user revoking another user's session.
- **`deleteExpiredByUserId`** deletes `WHERE user_id = $1 AND expires_at <= $2`.
- **The in-memory implementations** replicate all of this, including the email conflict and the at-least-one-permission check, by throwing the same errors. Tests that use them then behave like Postgres.

### 3.7 HTTP endpoints

Every error body has the existing shape: `{ "error": string, "code": string, "details": unknown }`.

#### Authentication — `src/routes/auth.route.ts`

| Method & path | Guard | Request | Success | Errors |
|---|---|---|---|---|
| `POST /api/auth/login` | public | `{ "email": string, "password": string }`; header `User-Agent` is recorded | `200 LoginResponseDto` | `400 VALIDATION_ERROR`; `401 INVALID_CREDENTIALS`; `403 ACCOUNT_LOCKED`; `403 ACCOUNT_DISABLED` |
| `GET /api/auth/me` | `requireAuthentication()` | — | `200 CurrentUserResponseDto` | `401 AUTHENTICATION_REQUIRED` |
| `POST /api/auth/logout` | `requireAuthentication()` | — | `204`; current session revoked with `SIGNED_OUT` | `401 AUTHENTICATION_REQUIRED` |

#### User sessions — `src/routes/user-session.route.ts`

| Method & path | Guard | Request | Success | Errors |
|---|---|---|---|---|
| `GET /api/auth/sessions` | `requireAuthentication()` | — | `200 { "sessions": UserSessionDto[] }`, newest `created_at` first, current session flagged `is_current: true` | `401` |
| `DELETE /api/auth/sessions/others` | `requireAuthentication()` | — | `200 { "revoked_count": number }` | `401` |
| `DELETE /api/auth/sessions/:sessionId` | `requireAuthentication()` | `sessionId` must be a UUID | `204`, reason `REVOKED_BY_USER`. Revoking the current session is allowed and behaves like logout. | `400 VALIDATION_ERROR`; `401`; `404 USER_SESSION_NOT_FOUND` when the session does not exist, is not the caller's, or is already inactive |

Register `/auth/sessions/others` **before** `/auth/sessions/:sessionId`.

#### Users — `src/routes/user.route.ts`

| Method & path | Guard | Request | Success | Errors |
|---|---|---|---|---|
| `POST /api/users` | `requireAnyPermission(Permission.USER_MANAGE)` | `{ "email": string, "full_name": string, "permissions": Permission[] }` | `201 { "user": UserDto }` | `400 VALIDATION_ERROR`; `401`; `403 PERMISSION_DENIED`; `409 EMAIL_ALREADY_REGISTERED` |
| `GET /api/users` | `requireAnyPermission(Permission.USER_MANAGE)` | — | `200 { "users": UserDto[] }` | `401`; `403` |
| `GET /api/users/:userId` | `requireAnyPermission(Permission.USER_MANAGE)` | `userId` must be a UUID | `200 { "user": UserDto }` | `400`; `401`; `403`; `404 USER_NOT_FOUND` |

`POST /api/users` validation, all done in `UserService`:

- `email` is trimmed and lower-cased. It must match `EMAIL_PATTERN` and be at most `EMAIL_MAX_LENGTH` characters.
- `full_name` is trimmed. It must contain 1 to `FULL_NAME_MAX_LENGTH` characters.
- `permissions` must be a non-empty array, every element a `Permission` value, with **no duplicates**. Each violation is a `ValidationError` naming the field.
- The password is `hashPassword(userConfig.defaultPassword)`. The plaintext is never returned or logged.

#### Route → permission map for existing routes (Phase 3)

| Router | Route | Guard |
|---|---|---|
| workflow | `POST /workflows/extract`, `POST /workflows`, `GET /workflows/deletions`, `PUT /workflows/:id`, `POST /workflows/:id/validate`, `PATCH /workflows/:id/review`, `PATCH /workflows/:id/title`, `DELETE /workflows/:id` | `WORKFLOW_MANAGE` |
| workflow | `GET /workflows`, `GET /workflows/:id`, `GET /workflows/:id/record` | `WORKFLOW_MANAGE` or `TASK_CREATE` |
| draft | every route | `WORKFLOW_MANAGE` |
| selection | every route | `TASK_CREATE` |
| task | every route | `TASK_CREATE`, plus the ownership guard on `/tasks/:id*` from Phase 6 |
| approval | `GET /approvals/:token`, `POST /approvals/:token/decision` | public, unchanged (D-12) |
| health, debug | unchanged | public, unchanged |

Guard semantics:

- `requireAuthentication()` → `401 AUTHENTICATION_REQUIRED` when `req.auth` is absent.
- `requireAnyPermission(...permissions)` → `401 AUTHENTICATION_REQUIRED` when unauthenticated, and `403 PERMISSION_DENIED` when the user holds none of the listed permissions.

### 3.8 Authentication flow (behavioural contract)

`AuthenticationService.login(credentials, client)`:

1. Normalise the email with `normalizeEmail`.
2. Call `userRepository.findCredentialByEmail`. If no user is found: `await burnHashTime()` (from `password.util.ts`), then throw `UnauthorizedError` with code `INVALID_CREDENTIALS` and message `"Invalid email or password"`.
3. `const passwordMatches = await verifyPassword(...)`.
4. If lockout is enabled, `failedLoginCount >= maxFailedAttempts` and `lastFailedLoginAt > now - lockoutDuration`: throw `ForbiddenError(ACCOUNT_LOCKED)`. This happens whether or not the password matched, and the password is verified **before** this check so timing does not reveal account state.
5. If the password does not match: `count = recordFailedLogin(id, now, now - lockoutDuration)` and log a warning with the user id and count, never the email or password. If lockout is enabled and `count >= max`, throw `ACCOUNT_LOCKED`; otherwise throw `INVALID_CREDENTIALS`.
6. If `status === UserStatus.DISABLED`, throw `ForbiddenError(ACCOUNT_DISABLED)`.
7. Call `recordSuccessfulLogin`, then `userSessionService.issue(user.id, client)`. `issue` deletes the user's expired sessions first, then creates the new session.
8. Return `LoginResult`.

`AuthenticationService.authenticate(token)` never throws. It returns `AuthContext | null`:

1. Hash the token, then `userSessionRepository.findActiveByTokenHash(hash, now)`. If nothing is found, return `null`.
2. `userRepository.findById(session.userId)`. If the user is missing or not `ACTIVE`, return `null`.
3. If `now - lastSeenAt >= USER_SESSION_ACTIVITY_TOUCH_INTERVAL_MS`, await `touch`. If it fails, log the error and continue. A failed touch must never fail the request.
4. Return `{ user: toAuthenticatedUser(user), session: { id, expiresAt } }`.

`AuthenticationService.logout(context)` revokes `context.session.id` with reason `SIGNED_OUT`.

---

## 4. Phase map

```
Phase 1  Foundations ───────────────► Phase 2  Schema + repositories
                                          │
                                          ▼
                                     Phase 3  Authentication, sessions, guards ───► Phase 6  Task ownership
                                          │
                                          ├──► Phase 4  User management API ───► Phase 5  Seed pack
                                          │
                                          └──► Phase 7  Frontend (needs Phase 5 for a manual login)
                                                              │
All phases ──────────────────────────────────────────────────► Phase 8  Docs + cleanup
```

> **Ship Phases 2 and 3 together.** Phase 2 adds a migration that drops `admin_users` and `portal_users`, and the app keeps reading those tables until Phase 3 lands. Build and verify Phase 2 against a **local** database only. Apply the migration to any shared environment only once Phase 3 is merged.

---

## Phase 1 — Foundations (enums, types, config, utilities)

**Goal:** add all new shared building blocks. This phase is additive. The running app behaves exactly as before.

**Depends on:** nothing.

### Create (API)

| File | Contents |
|---|---|
| `src/data/constants/permission.constant.ts` | `Permission`, `PERMISSIONS` (§3.1) |
| `src/data/constants/user.constant.ts` | `UserStatus`, `USER_FIELD_LIMIT`, `EMAIL_PATTERN` |
| `src/data/constants/user-session.constant.ts` | `UserSessionRevocationReason`, `USER_SESSION_TOKEN`, `USER_SESSION_ACTIVITY_TOUCH_INTERVAL_MS` |
| `src/data/constants/auth.constant.ts` | `AuthErrorCode`, `AUTHORIZATION_SCHEME` |
| `src/data/constants/user-error.constant.ts` | `UserErrorCode` |
| `src/data/constants/repository.constant.ts` | `RepositoryBackend`, `REPOSITORY_BACKENDS` |
| `src/data/constants/postgres.constant.ts` | `PostgresErrorCode`, `PostgresConstraint` |
| `src/lib/types/user/user.type.ts`, `src/lib/types/user/index.type.ts` | §3.5 user types |
| `src/lib/types/user-session/user-session.type.ts`, `src/lib/types/user-session/index.type.ts` | §3.5 user-session types |
| `src/config/user.config.ts` | `export const user: UserConfig = Object.freeze({ defaultPassword: requireString("USER_DEFAULT_PASSWORD", rawEnv.USER_DEFAULT_PASSWORD) })` |
| `src/utils/user/email.util.ts` | `normalizeEmail(raw: string): string` (trim, then lower-case) and `isValidEmail(normalized: string): boolean` (pattern and length) |
| `src/utils/auth/permission.util.ts` | `isPermission(value: unknown): value is Permission` and `hasAnyPermission(granted: readonly Permission[], required: readonly Permission[]): boolean` |
| `src/utils/auth/user-session-token.util.ts` | `generateUserSessionToken(): string` (`randomBytes(BYTE_LENGTH).toString(ENCODING)`) and `hashUserSessionToken(token: string): string` (SHA-256 hex, **without** the trim/CRLF normalisation in `hash.util.ts#sha256`, so a hash always reflects the exact token) |
| `src/utils/http/bearer-token.util.ts` | `readBearerToken(req: Request): string \| null`. This becomes the single implementation; the two copies in `authenticate.middleware.ts` and `auth.controller.ts` are removed in Phase 3. |
| `src/utils/database/postgres-error.util.ts` | `isPostgresError(err: unknown, code: PostgresErrorCode, constraint?: PostgresConstraint): boolean`. It walks `err` and then `err.cause`, because `query` and `withTransaction` wrap driver errors in `DatabaseError`. |
| `tests/unit/utils/email.util.test.ts`, `permission.util.test.ts`, `user-session-token.util.test.ts`, `bearer-token.util.test.ts`, `postgres-error.util.test.ts` | Unit tests for each util |

### Modify (API)

| File | Change |
|---|---|
| `src/lib/types/config/config.type.ts` | Add `UserConfig`, and add `user: UserConfig` to `AppConfig`. Do **not** touch `AuthConfig` yet. `tsconfig.json` type-checks `tests/`, and three test files build `AuthConfig` literals, so its reshaping happens in Phase 3. |
| `src/config/index.config.ts` | Add `user` |
| `src/lib/types/index.type.ts` | Re-export the new `user` and `user-session` type folders |
| `src/utils/http/request-validator.util.ts` | Add `requireStringArray(body, field): string[]`, which checks **shape only**: an array whose elements are all strings. Also add `requireUuid(value: unknown, field: string): string`. Permission semantics (non-empty, known values, no duplicates) belong to `UserService` (Phase 4), because the seed pack calls the service without going through a controller. |
| `tests/unit/utils/request-validator.util.test.ts` | Cover both new validators |
| `.example.env` | Add `USER_DEFAULT_PASSWORD=12345` with a one-line comment in the file's existing style |

Every developer must add `USER_DEFAULT_PASSWORD` to their local `.env`. The config throws at load time without it.

### Acceptance criteria

- No existing behaviour changes. All new code is unused except by its tests.
- No string literal for a permission, status, reason or code appears outside its enum.

### Verification

```bash
cd unblock-ai-api
npm run typecheck && npm test
```

---

## Phase 2 — Postgres schema and repositories

**Goal:** add the new Postgres structure and three repositories, each with a Postgres and an in-memory implementation. They are not wired into the app yet.

**Depends on:** Phase 1.

### Create

1. **The migration**, scaffolded with the generator so the timestamp is correct:

   ```bash
   npm run migrate:pg:create -- unified-users-permissions-and-sessions
   ```

   Fill in the generated `src/db/migration/postgres/migrations/<timestamp>_unified-users-permissions-and-sessions.migration.ts`.

   **`up`**, as a single `client.query` per step, in this order:
   1. Create `permissions` and insert the four reference rows (§3.4).
   2. Create `users`, the `users_email_key` index, `user_permissions` with its index, and `user_sessions` with its indexes.
   3. Create the `enforce_user_has_permission()` function and both constraint triggers.
   4. Alter `template_deletions`:
      - `DROP CONSTRAINT template_deletions_deleted_by_admin_id_fkey`
      - `RENAME COLUMN deleted_by_admin_id TO deleted_by_user_id`
      - `RENAME COLUMN deleted_by_username TO deleted_by_email`
      - `ADD CONSTRAINT template_deletions_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES users (id) ON DELETE RESTRICT`
      - `ALTER INDEX template_deletions_admin_idx RENAME TO template_deletions_user_idx`
   5. `DROP TABLE portal_users; DROP TABLE admin_users;`

   **`down`** reverses every step exactly:
   1. Recreate `admin_users` and `portal_users` with the **same** DDL and index names as `20261111000000_initial-schema.migration.ts`.
   2. Repoint `template_deletions` back to `admin_users`: reverse the renames, the FK and the index.
   3. Drop both triggers, the function, then `user_sessions`, `user_permissions`, `users` and `permissions`.

   `down` is a structural rollback. It does not carry user data back into the old tables, and it fails loudly if `template_deletions` holds rows. That is acceptable, because no data exists yet.

   Before writing, confirm the existing FK constraint name with `\d template_deletions`. The default Postgres name is `template_deletions_deleted_by_admin_id_fkey`.

2. **Repositories.** Folder and file naming mirrors `services/vector-store/`:

   ```
   src/repositories/
   ├─ user-repository/
   │  ├─ user-repository.interface.ts           IUserRepository (§3.6)
   │  ├─ postgres.user-repository.ts            PostgresUserRepository
   │  ├─ in-memory.user-repository.ts           InMemoryUserRepository
   │  └─ index.user-repository.ts               createUserRepository(backend: RepositoryBackend)
   ├─ user-session-repository/
   │  ├─ user-session-repository.interface.ts   IUserSessionRepository
   │  ├─ postgres.user-session-repository.ts
   │  ├─ in-memory.user-session-repository.ts
   │  └─ index.user-session-repository.ts       createUserSessionRepository(backend)
   └─ template-deletion-repository/
      ├─ template-deletion-repository.interface.ts
      ├─ postgres.template-deletion-repository.ts   SQL moved from postgres.auth-store.ts, with renamed columns
      ├─ in-memory.template-deletion-repository.ts  logic moved from in-memory.auth-store.ts
      └─ index.template-deletion-repository.ts
   ```

   Repository rules:

   - SQL column lists are module-level constants, as `DELETION_COLUMNS` is today. Each repository has one row-to-record mapper.
   - Postgres repositories only use `query` and `withTransaction` from `src/db/postgres.client.ts`.
   - Each factory throws `ConfigurationError` for an unknown backend.
   - In-memory constructors take optional seed rows, for example `new InMemoryUserRepository({ users: UserCredentialRecord[] })`, so tests can preload state.
   - The in-memory `create` throws the same `ConflictError(EMAIL_ALREADY_REGISTERED)` on a duplicate normalised email, and a `ValidationError` on an empty permission list. This mirrors the database trigger.

3. **Template-deletion types**: create `src/lib/types/template-deletion/template-deletion.type.ts` and `index.type.ts` with the §3.5 types. The old types of the same names stay in `auth.type.ts` until Phase 3. Import the new ones by their folder path to avoid clashes, and do **not** re-export the folder from `src/lib/types/index.type.ts` until Phase 3.

4. **Tests**: `tests/unit/repositories/in-memory.user-repository.test.ts`, `in-memory.user-session-repository.test.ts` and `in-memory.template-deletion-repository.test.ts`. They cover:
   - create, read and list, including permission aggregation and ordering
   - the duplicate-email conflict
   - the failed-login window reset (`recordFailedLogin` returns 1 again once `failureWindowStart` has passed)
   - session activity filters: expired and revoked sessions are excluded
   - `revoke` returns `false` for another user's session
   - `revokeAllExcept` keeps the named session
   - `deleteExpiredByUserId`

### Do not

- Wire anything into `server.ts`, and do not remove `services/auth-store/`. Both happen in Phase 3.
- Apply the migration to any shared environment (see §4).

### Verification

Against a **local, disposable** Postgres:

```bash
cd unblock-ai-api
npm run typecheck && npm test
npm run migrate:pg:up && npm run migrate:pg:status
npm run migrate:pg:down && npm run migrate:pg:status     # back to the initial schema only
npm run migrate:pg:up                                     # re-apply cleanly
```

Then, in `psql`, prove the invariant and the constraints:

```sql
BEGIN;
INSERT INTO users (email, full_name, password_hash) VALUES ('a@x.io', 'A', 'h');
COMMIT;                                   -- must FAIL: user must hold at least one permission

BEGIN;
INSERT INTO users (id, email, full_name, password_hash) VALUES ('00000000-0000-0000-0000-0000000000a1', 'a@x.io', 'A', 'h');
INSERT INTO user_permissions (user_id, permission_code) VALUES ('00000000-0000-0000-0000-0000000000a1', 'task:create');
COMMIT;                                   -- succeeds

INSERT INTO users (email, full_name, password_hash) VALUES ('A@X.IO', 'B', 'h');   -- fails users_email_normalised_check
INSERT INTO user_permissions (user_id, permission_code) VALUES ('00000000-0000-0000-0000-0000000000a1', 'nope'); -- fails FK
DELETE FROM user_permissions WHERE user_id = '00000000-0000-0000-0000-0000000000a1';  -- fails at commit (autocommit)
DELETE FROM users WHERE id = '00000000-0000-0000-0000-0000000000a1';                  -- succeeds (cascade)
```

---

## Phase 3 — Authentication, sessions and permission guards

**Goal:** switch the API from two audiences and stateless tokens to unified users, server-side sessions and permission guards. After this phase the old model is gone from the API.

**Depends on:** Phase 2. **Ship it together with Phase 2.**

### Create

| File | Contents |
|---|---|
| `src/services/user-session.service.ts` | `UserSessionService` with `{ userSessionRepository, authConfig }`. Methods: `issue(userId, client): Promise<IssuedUserSession>` (deletes the user's expired sessions, then generates the token, hashes it and creates the row with `expiresAt = now + sessionTtlHours`); `resolve(token): Promise<UserSessionRecord \| null>` (hash, find, touch per D-7); `listActive(userId, currentSessionId): Promise<UserSessionDto[]>`; `revoke(userId, sessionId, reason): Promise<void>` (throws `NotFoundError(USER_SESSION_NOT_FOUND)` when `repository.revoke` returns `false`); `revokeOthers(userId, currentSessionId): Promise<number>`. |
| `src/services/authentication.service.ts` | `AuthenticationService` with `{ userRepository, userSessionService, authConfig }`. Methods `login`, `authenticate` and `logout`, exactly as in §3.8. |
| `src/services/template-deletion-log.service.ts` | `TemplateDeletionLogService` with `{ templateDeletionRepository }`, replacing `DeletionLogService`. Same methods (`record`, `markCompleted`, `list`); `record` takes `TemplateDeletionInput`. |
| `src/utils/auth/authenticated-user.util.ts` | `toAuthenticatedUser(record: UserRecord): AuthenticatedUser` |
| `src/utils/http/auth-serializer.util.ts` | `serializeAuthenticatedUser`, `serializeLoginResult`, `serializeCurrentUser(context)` and `serializeUserSession(record, currentSessionId)`, producing the §3.5 DTOs with ISO date strings |
| `src/middlewares/require-authentication.middleware.ts` | `requireAuthentication(): RequestHandler` (§3.7 guard semantics) |
| `src/middlewares/require-permission.middleware.ts` | `requireAnyPermission(...permissions: Permission[]): RequestHandler`, which uses `hasAnyPermission` |
| `src/controllers/user-session.controller.ts` | `UserSessionController`: `list`, `revoke` and `revokeOthers` |
| `src/routes/user-session.route.ts` | `createUserSessionRouter(controller)` (§3.7 table, route order noted) |
| `tests/unit/services/authentication.service.test.ts` | Covers every branch of §3.8: unknown email (timing burn called), wrong password, lockout reached, locked account with the correct password, lockout window expired, disabled account, success (counters reset, expired sessions purged, session created), `authenticate` with an unknown, expired, revoked or disabled-user token, and the touch interval |
| `tests/unit/services/user-session.service.test.ts` | issue, list with `is_current`, revoke own, revoke someone else's (404), revoke others |
| `tests/unit/middlewares/require-permission.middleware.test.ts` | 401 when unauthenticated, 403 without the permission, pass-through with any one of the listed permissions |
| `tests/integration/user-session.route.test.ts` | End to end over the in-memory repositories: login twice → two sessions listed → revoke the other one → its token now gets 401 → `DELETE /auth/sessions/others` → logout → the token gets 401 |

### Modify

| File | Change |
|---|---|
| `src/lib/types/auth/auth.type.ts` | Replace the whole file with the §3.5 auth types. Delete `AuthAudience`, `AuthUserRow`, `AuthUser`, `SessionPayload` and the old template-deletion types. |
| `src/lib/types/template-deletion/` | Already created in Phase 2; `auth.type.ts` no longer re-declares these types |
| `src/lib/types/http/http.type.ts` | `user?: AuthUser` becomes `auth?: AuthContext` |
| `src/lib/types/config/config.type.ts` | `AuthConfig` becomes exactly §3.3: remove `sessionTokenSecret` and `storeBackend`, and add `lockoutDurationMinutes`. Add `PostgresConfig.repositoryBackend: RepositoryBackend`. |
| `src/config/auth.config.ts` | Remove the session-secret logic, the `APPROVAL_TOKEN_SECRET` comparison and `storeBackend`. Add `lockoutDurationMinutes: parseNumber("AUTH_LOCKOUT_DURATION_MINUTES", rawEnv.AUTH_LOCKOUT_DURATION_MINUTES, 15)`. |
| `src/lib/types/index.type.ts` | Re-export `template-deletion/index.type.js` |
| `src/utils/http/auth-context.util.ts` (**create**) | `requireAuthContext(req: Request): AuthContext` returns `req.auth` or throws `UnauthorizedError(AUTHENTICATION_REQUIRED)`. Controllers use this instead of `req.auth!` non-null assertions. |
| `src/config/postgres.config.ts` | Read `POSTGRES_REPOSITORY_BACKEND` with `parseEnum(…, REPOSITORY_BACKENDS, RepositoryBackend.POSTGRES)`. `url` is required only when the backend is `POSTGRES`. Expose `repositoryBackend`. |
| `src/lib/types/audit/audit.type.ts` | Remove `role` from `AuditActor` (D-15) |
| `src/utils/http/actor.util.ts` | Build the actor from `req.auth?.user`: `{ id, email }` |
| `src/middlewares/authenticate.middleware.ts` | Takes `{ authenticationService }`. Uses `readBearerToken`, calls `authenticate` and sets `req.auth`. It still only populates `req.auth` and never rejects. |
| `src/middlewares/index.middleware.ts` | Export `requireAuthentication` and `requireAnyPermission`. Remove `requireAuth` and `requireRole`. |
| `src/controllers/auth.controller.ts` | `AuthController({ authenticationService })`. `login` validates `email` and `password` with `requireNonEmptyString`, reads `req.get("user-agent") ?? null`, and responds with `serializeLoginResult`. `me` responds with `serializeCurrentUser(requireAuthContext(req))`. `logout` calls `authenticationService.logout(requireAuthContext(req))` and responds `204`. Remove the local `bearerToken` function. |
| `src/routes/auth.route.ts` | Guard `me` and `logout` with `requireAuthentication()` |
| `src/routes/index.route.ts` | Add `userSessionController` to `ApiControllers` and register `createUserSessionRouter` |
| `src/routes/workflow.route.ts`, `draft.route.ts`, `selection.route.ts`, `task.route.ts` | Apply the §3.7 route → permission map. Build each guard once at the top of the router factory, for example `const manageWorkflows = requireAnyPermission(Permission.WORKFLOW_MANAGE)`. |
| `src/controllers/task.controller.ts` | Use `requireAuthContext(req)` throughout. `listTasks` **always** sets `filters.created_by` to the caller's id; delete the audience branch and its comment. `createTask` uses the caller's id. |
| `src/controllers/workflow.controller.ts` | Pass `requireAuthContext(req).user` to `workflowService.delete` |
| `src/services/workflow.service.ts` | `delete(workflowId, actor: AuthenticatedUser, requestId)` records `deletedByUserId: actor.id, deletedByEmail: actor.email`. Depend on `TemplateDeletionLogService`. |
| `src/app.ts` | `AppDependencies` becomes `{ authenticationService: AuthenticationService }` |
| `src/server.ts` | Build the three repositories from `config.postgres.repositoryBackend`, then `UserSessionService`, `AuthenticationService` and `TemplateDeletionLogService`, then `UserSessionController`. Remove `createAuthStore`, `AuthService` and `DeletionLogService`. |
| `scripts/maintenance/backfill-summaries.script.ts`, `tests/smoke/smoke-test-document.script.ts` | Update any reference to the auth store or deletion log so they compile |
| `tests/helpers/test-server.helper.ts` | Rewrite the auth part, as described below |
| `tests/integration/auth.route.test.ts` | Rewrite for email login, `/auth/me` with a session, logout revoking the session, lockout, and a disabled account |
| `tests/integration/workflow.route.test.ts`, `draft.route.test.ts`, `selection.route.test.ts`, `task.route.test.ts`, `error-handler.test.ts` | Switch to `authHeaderFor(TestIdentity.…)`. Every former "portal user gets 403 on an admin route" case becomes "a user without the permission gets `403 PERMISSION_DENIED`". Add `401` cases for missing tokens where absent. |
| `tests/unit/services/workflow.service.test.ts` | Use the new actor and deletion types |
| `.example.env` | Remove `SESSION_TOKEN_SECRET` and `AUTH_STORE_BACKEND`. Add `POSTGRES_REPOSITORY_BACKEND=postgres` and `AUTH_LOCKOUT_DURATION_MINUTES=15`. |

### Delete

- `src/services/auth.service.ts`
- `src/services/auth-store/` (whole folder)
- `src/services/deletion-log.service.ts`
- `src/middlewares/require-auth.middleware.ts`
- `src/utils/auth/session-token.util.ts`
- `tests/unit/utils/session-token.util.test.ts`
- `tests/unit/services/auth.service.test.ts`, replaced by `authentication.service.test.ts`

### Test helper design (`tests/helpers/test-server.helper.ts`)

```ts
export enum TestIdentity {
  WORKFLOW_MANAGER = "workflow-manager",
  TASK_CREATOR = "task-creator",
  USER_MANAGER = "user-manager",
  ADMINISTRATOR = "administrator",
}
```

- `TEST_USERS: Record<TestIdentity, UserCredentialRecord>`, each with fixed UUIDs and emails. `ADMINISTRATOR` holds all permissions; each of the others holds only the permission its name implies.
- `TEST_SESSION_TOKENS: Record<TestIdentity, string>` holds fixed token strings. The default in-memory user-session repository is preloaded with one active session per identity, keyed by `hashUserSessionToken(token)` and expiring far in the future.
- `authHeaderFor(identity: TestIdentity): Record<string, string>` returns `{ Authorization: \`${AUTHORIZATION_SCHEME} ${TEST_SESSION_TOKENS[identity]}\` }`. It is pure, so tests can call it at module level just like today's `adminAuthHeader()`.
- `startTestServer(controllers, deps?: { authenticationService?: AuthenticationService })` keeps its current signature shape.
- Remove `adminAuthHeader`, `portalAuthHeader`, `TEST_ADMIN_ROW`, `TEST_PORTAL_ROW` and `rowToAuthUser`.

### Acceptance criteria

- `grep -rn "audience\|AuthAudience\|admin_users\|portal_users\|requireRole\|SESSION_TOKEN_SECRET\|AuthStore\|issueSessionToken" src tests scripts` returns nothing, except the untouched `20261111000000_initial-schema` migration.
- A logged-out or revoked token is rejected on its very next request.
- Every route matches the §3.7 map, and each guard is covered by at least one integration assertion.
- Approval routes still work without any `Authorization` header.

### Verification

```bash
cd unblock-ai-api
npm run typecheck && npm test
```

Manual curl checks of login become possible only after Phase 5 seeds a user. Until then, the integration tests are the verification.

---

## Phase 4 — User management API

**Goal:** let `user:manage` holders create, list and view users.

**Depends on:** Phase 3.

### Create

| File | Contents |
|---|---|
| `src/services/user.service.ts` | `UserService` with `{ userRepository, userConfig }` and the methods below |
| `src/utils/http/user-serializer.util.ts` | `serializeUser(record: UserRecord): UserDto` |
| `src/controllers/user.controller.ts` | `UserController`: `create`, `list` and `getById` |
| `src/routes/user.route.ts` | `createUserRouter(controller)`, all routes guarded by `requireAnyPermission(Permission.USER_MANAGE)` |
| `tests/unit/services/user.service.test.ts` | Normalisation, invalid email, overlong name, empty, unknown or duplicate permissions, duplicate email (409), default password is hashed and verifiable with `verifyPassword`, `createdByUserId` recorded, `getById` not found |
| `tests/integration/user.route.test.ts` | 401 without a token. 403 for `TASK_CREATOR`. `USER_MANAGER` creates a user → 201 with permissions → the list contains it → get by id → a second create with the same email in different case returns 409. The created user can log in with `USER_DEFAULT_PASSWORD` and their `/auth/me` permissions match. |

`UserService` methods:

```ts
createUser(input: CreateUserInput, createdByUserId: string | null): Promise<UserRecord>
listUsers(): Promise<UserRecord[]>
getUserById(id: string): Promise<UserRecord>          // NotFoundError(USER_NOT_FOUND)
existsByEmail(email: string): Promise<boolean>        // normalises first; used by the seed pack
```

`createdByUserId` is `null` only for system-created users from the seed pack. The controller always passes `requireAuthContext(req).user.id`.

Validation split: the controller checks **shape** only, using `requireNonEmptyString` for `email` and `full_name` and `requireStringArray` for `permissions`. `createUser` owns every **semantic** rule from §3.7: email format and length, name length, a non-empty permission list, known values (narrowed with `isPermission`) and no duplicates. Its input type takes `permissions: readonly string[]`, so the seed pack and the API share one implementation. `CreateUserInput.permissions` in §3.5 is typed accordingly.

### Modify

| File | Change |
|---|---|
| `src/routes/index.route.ts` | Add `userController` and register `createUserRouter` |
| `src/server.ts` | Build `UserService` and `UserController` |
| `tests/helpers/test-server.helper.ts` | Expose the default in-memory repositories if the integration test needs to inspect them |

### Acceptance criteria

- No user can be created without at least one valid permission, whether through the API or the database.
- The response never includes a password or hash.
- `POST /users` is the only way the API creates users.

### Verification

```bash
cd unblock-ai-api
npm run typecheck && npm test
```

---

## Phase 5 — Postgres seed pack

**Goal:** replace `scripts/db/seed-auth.script.ts` with a seed pack structured like the migration pack. It ships with one seeder, the bootstrap administrator.

**Depends on:** Phase 4.

### Design

- **Seeders are discovered from a directory.** File names follow `<yyyyMMddHHmmss>_<slug>.seeder.ts` and run in file-name order.
- Each seeder **default-exports** a `Seeder<TContext>`:

  ```ts
  // src/lib/types/seed/seed.type.ts
  export interface Seeder<TContext> {
    run(context: TContext): Promise<SeedOutcome[]>;
  }
  export interface SeedOutcome {
    entity: SeedEntity;
    key: string;
    status: SeedOutcomeStatus;
  }
  export interface SeederDefinition<TContext> {
    name: string;
    seeder: Seeder<TContext>;
  }
  export interface SeedRunOptions {
    only?: string;
  }
  ```

  `PostgresSeedContext { userService: UserService; seedConfig: SeedConfig }` is declared in `src/db/seed/postgres/postgres.seed-context.ts`, not in `src/lib/types/`. A shared types folder must not import a service class.
- Seeders are **idempotent and untracked**. Each one checks whether its data exists, through a service, and reports `SKIPPED` if so. Re-running is always safe.
- A seeder never writes SQL directly. It calls services so that every business rule applies. A future seeder that needs a missing operation adds it to the service or repository first.
- **The CLI:**
  - `run [--only <name>]` runs every seeder in order, or just the one whose name matches.
  - `list` shows the discovered seeders.
  - `create <name>` scaffolds a seeder from the template.
  - A failing seeder stops the run with a non-zero exit code. The error is reported with its cause chain, as `migration.cli.ts#describeError` does today. Reuse that function by moving it to `src/utils/shared/error-description.util.ts`, imported by both CLIs.

### Create

```
src/db/seed/
├─ core/
│  ├─ seed.loader.ts        SeedLoader<TContext>: reads the directory, filters by runtime extension, sorts, imports, validates the default export has run()
│  ├─ seed.runner.ts        SeedRunner<TContext>: list(), run(options) → SeedRunReport { seeder: string; outcomes: SeedOutcome[] }[]
│  ├─ seed.generator.ts     SeedGenerator: create(name, date) using the shared timestamped file-name util
│  ├─ seed.engine.ts        createSeedEngine({ label, directory, template, createContext, close })
│  └─ seed.cli.ts           runSeedCli(engine, argv): parses SeedCommand, prints outcomes as "[postgres] <seeder> <entity> <key> -> <status>"
└─ postgres/
   ├─ postgres.seed-context.ts    PostgresSeedContext interface
   ├─ postgres.seed-engine.ts     createPostgresSeedEngine(): builds PostgresSeedContext from PostgresUserRepository + UserService(user config) + loadSeedConfig()
   ├─ postgres.seed-template.ts   POSTGRES_SEED_TEMPLATE (default-exported Seeder<PostgresSeedContext> skeleton)
   └─ seeders/
      └─ <timestamp>_administrator-user.seeder.ts
src/config/seed.config.ts         loadSeedConfig(): SeedConfig (requireString for both SEED_ADMINISTRATOR_* variables, read lazily, not part of AppConfig)
src/data/constants/seed.constant.ts   SeedCommand, SeedOutcomeStatus, SeedEntity, SEED_FILE (§3.1)
src/lib/types/seed/seed.type.ts, index.type.ts
src/utils/seed/seed-file.util.ts       buildSeedFileName / parseSeedFileName
src/utils/shared/timestamped-file-name.util.ts   toFileSlug, toFileTimestamp (extracted from migration-file.util.ts)
src/utils/shared/error-description.util.ts       describeError (moved from migration.cli.ts)
src/errors/seed.error.ts               SeedError, mirroring MigrationError
scripts/db/seed-postgres.script.ts     await runSeedCli(createPostgresSeedEngine(), process.argv.slice(2));
tests/unit/db/seed.runner.test.ts      fake seeders: ordering, --only, unknown --only name, failure stops the run
tests/unit/utils/seed-file.util.test.ts
```

Generate the administrator seeder file with the new `create` command once it works (`npm run seed:pg:create -- administrator-user`). Its logic:

```
email = normalizeEmail(seedConfig.administratorEmail)
if await userService.existsByEmail(email)  → [{ entity: SeedEntity.USER, key: email, status: SKIPPED }]
else await userService.createUser({ email, fullName: seedConfig.administratorFullName, permissions: [...PERMISSIONS] }, null)
     → [{ entity: SeedEntity.USER, key: email, status: CREATED }]
```

### Modify

| File | Change |
|---|---|
| `src/utils/migration/migration-file.util.ts` | Delegate to `timestamped-file-name.util.ts`. Keep its exported function names so `migration-file.util.test.ts` stays unchanged and green. |
| `src/db/migration/core/migration.cli.ts` | Import `describeError` from the shared util |
| `package.json` | Remove `seed:auth`. Add `"seed:pg:run": "tsx scripts/db/seed-postgres.script.ts run"`, `"seed:pg:list": "… list"` and `"seed:pg:create": "… create"`. |
| `.example.env` | Remove `SEED_ADMIN_*` and `SEED_USER1_*`/`SEED_USER2_*`, and the comment block above them. Add `SEED_ADMINISTRATOR_EMAIL=` and `SEED_ADMINISTRATOR_FULL_NAME=` with a comment saying they are read only by `npm run seed:pg:run`. |

### Delete

- `scripts/db/seed-auth.script.ts`

### Verification

```bash
cd unblock-ai-api
npm run typecheck && npm test
npm run migrate:pg:up
npm run seed:pg:list
npm run seed:pg:run            # [postgres] …_administrator-user user <email> -> created
npm run seed:pg:run            # same line -> skipped
npm run dev
```

Then exercise the whole API end to end. Replace `$EMAIL` with your `SEED_ADMINISTRATOR_EMAIL`:

```bash
curl -s -X POST localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"'$EMAIL'","password":"12345"}'                       # 200, keep .token as $T

curl -s localhost:3000/api/auth/me -H "authorization: Bearer $T"      # user + all four permissions

curl -s -X POST localhost:3000/api/users -H "authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"email":"Creator@Example.com","full_name":"Task Creator","permissions":["task:create"]}'   # 201, email lower-cased

curl -s -X POST localhost:3000/api/users -H "authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"email":"x@example.com","full_name":"X","permissions":[]}'     # 400

# log in as creator@example.com / 12345 → token $C
curl -s localhost:3000/api/users -H "authorization: Bearer $C"        # 403 PERMISSION_DENIED
curl -s localhost:3000/api/drafts -H "authorization: Bearer $C"       # 403 PERMISSION_DENIED
curl -s localhost:3000/api/auth/sessions -H "authorization: Bearer $T"
curl -s -X POST localhost:3000/api/auth/logout -H "authorization: Bearer $T"   # 204
curl -s localhost:3000/api/auth/me -H "authorization: Bearer $T"      # 401
```

---

## Phase 6 — Task ownership enforcement

**Goal:** a `task:create` holder can only see and act on tasks they created (D-19).

**Depends on:** Phase 3.

### Create

| File | Contents |
|---|---|
| `src/middlewares/require-task-ownership.middleware.ts` | `createRequireTaskOwnership({ taskService }): RequestHandler`. It reads `req.params.id` and calls `taskService.isOwnedBy(taskId, requireAuthContext(req).user.id)`. If that returns `false`, it throws the **same** `NotFoundError` that `TaskService.get` throws for a missing task, so a missing task and someone else's task look identical. It must run after `requireAnyPermission`. |
| `tests/integration/task-ownership.route.test.ts` | For every `/tasks/:id*` route, a second task creator gets 404 on the first creator's task. The owner keeps working. `GET /tasks` returns only the caller's tasks. |

### Modify

| File | Change |
|---|---|
| `src/services/task.service.ts` | Add `isOwnedBy(taskId: string, userId: string): Promise<boolean>`, implemented with a projection-only lookup in `TaskModel` (for example `findCreatorById(id): Promise<string \| null>`). **Do not** change existing method signatures: `ApprovalService` calls them internally and must not be affected by ownership. |
| `src/models/task.model.ts` | Add the projection-only lookup |
| `src/routes/task.route.ts` | Apply the ownership guard to every `/tasks/:id` route |
| `src/routes/index.route.ts` | `createApiRouter(controllers: ApiControllers, guards: ApiRouteGuards)`, where `export interface ApiRouteGuards { requireTaskOwnership: RequestHandler }`. Pass `guards.requireTaskOwnership` to `createTaskRouter(controller, guards.requireTaskOwnership)`. `ApiControllers` stays controller-only. |
| `src/app.ts` | `AppDependencies` gains `routeGuards: ApiRouteGuards` and forwards it to `createApiRouter` |
| `src/server.ts` | Build `createRequireTaskOwnership({ taskService })` and pass it as `routeGuards` |
| `tests/helpers/test-server.helper.ts` | Default `routeGuards` to a guard built from a fake `isOwnedBy`, or accept one via `deps` |

### Out of scope

Selection sessions (`/selection/sessions/:id`) do not record an owner yet; see §13.

### Verification

```bash
cd unblock-ai-api
npm run typecheck && npm test
```

---

## Phase 7 — Frontend login and account page

**Goal:**

- a single email/password login
- a post-login `/account` page showing the user's profile, permissions and active sessions, with revoke-one, revoke-others and sign-out actions
- removal of the shared-secret token verification

The existing dashboards are only adjusted enough to compile (D-20).

**Depends on:** Phase 3. Phase 5 is needed to log in manually. **Read `unblock-ai-web/AGENTS.md` and the Next 16 docs it points to first.**

### Create (web)

| File | Contents |
|---|---|
| `src/types/permission.ts` | `enum Permission` mirroring the API values (§3.1) |
| `src/types/auth.ts` (rewrite) | `AuthenticatedUser { id; email; full_name; permissions: Permission[] }`, `LoginRequest { email; password }`, `LoginResponse`, `CurrentUserResponse { user; session: { id; expires_at } }`, `UserSession` (mirrors `UserSessionDto`), `UserSessionListResponse { sessions }`, `RevokeOtherUserSessionsResponse { revoked_count }`, and `enum AuthErrorCode` mirroring the API |
| `src/lib/auth/permission-label.ts` | `PERMISSION_LABELS: Record<Permission, string>` ("Workflow management", "Task creation", "Task approval", "User management") |
| `src/lib/auth/auth-error-message.ts` | `messageForAuthError(code: string \| undefined): string`, which maps each `AuthErrorCode` to user-facing text and falls back to a generic message |
| `src/lib/routing/route-path.ts` | `enum RoutePath { LOGIN = "/login", ACCOUNT = "/account", HOME = "/" }` plus `const NEXT_QUERY_PARAMETER = "next"`. Use it everywhere a path is redirected to. |
| `src/lib/api/user-sessions.ts` | `userSessionsApi.list()`, `.revoke(sessionId)` and `.revokeOthers()` over `apiRequest` (the browser goes through `/api/proxy`) |
| `src/app/account/layout.tsx` | Minimal shell: brand mark and `SignOutButton` |
| `src/app/account/page.tsx` | Server Component. Calls `getSession()`, redirecting to `RoutePath.LOGIN` if there is none, then renders `AccountProfileCard`, `PermissionBadgeList` and `ActiveSessionList` |
| `src/components/account/AccountProfileCard.tsx` | Name, email and initials avatar |
| `src/components/account/PermissionBadgeList.tsx` | One `Badge` per permission, using `PERMISSION_LABELS` |
| `src/components/account/ActiveSessionList.tsx` | Client component. SWR on `/auth/sessions`, rendering `ActiveSessionRow`s plus a "Sign out of other sessions" action (hidden when only the current session exists). Revalidates after each action. Uses `ConfirmDialog` from `components/ui`. |
| `src/components/account/ActiveSessionRow.tsx` | User agent (or "Unknown device"), signed-in time, last-active time (via the existing `DateTime` component), a "This device" badge when `is_current`, and a revoke button otherwise |

### Modify (web)

| File | Change |
|---|---|
| `src/lib/api/auth.ts` | `login(request: LoginRequest, userAgent: string \| null)` forwards `User-Agent`. `me(token)` returns `CurrentUserResponse`. `logout(token)`. |
| `src/app/api/auth/login/route.ts` | Validate `email` and `password` as non-empty strings. Call `authApi.login` with `request.headers.get("user-agent")`. Set the httpOnly cookie with `expires` from `expires_at`, as today. Return `{ user }`. On `ApiError`, return `{ error, code }` with the upstream status. |
| `src/app/api/auth/logout/route.ts` | If a cookie is present, call `authApi.logout(token)` to revoke the session server-side, ignoring API failures. Always delete the cookie and return 204. |
| `src/lib/auth/session.ts` | `Session = { user: AuthenticatedUser; sessionId: string; initials: string }`. `getRequesterContext()` returns only `{ actor_type: "staff" }`, because faculty and department no longer exist (D-2). Keep its call site compiling; the selector will ask for faculty when it needs it. |
| `src/lib/auth/session-cookie.ts` | Unchanged (`SESSION_COOKIE_NAME`) |
| `src/proxy.ts` | Matcher becomes `["/account/:path*", "/admin/:path*", "/portal/:path*"]`. With no cookie, redirect to `/login?next=<path>`; with a cookie, continue. There is no token verification here any more. Pages call `getSession()`, and the API rejects invalid sessions. |
| `src/app/page.tsx` | `getSession()` → `RoutePath.ACCOUNT` or `RoutePath.LOGIN` |
| `src/app/login/page.tsx` | Neutral copy ("Sign in to Unblock AI"). If `getSession()` returns a session, redirect to `RoutePath.ACCOUNT`. Render `LoginForm` and remove the link to the requester login. |
| `src/components/auth/LoginForm.tsx` | Email (`type="email"`, `autoComplete="email"`) and password fields with no audience. On success, go to a safe `next` (it must start with `/` and not `//`) or `RoutePath.ACCOUNT`. Show `messageForAuthError(payload.code)` on failure. |
| `src/components/auth/SignOutButton.tsx` | Drop the `redirectTo` prop. Always land on `RoutePath.LOGIN`. |
| `src/components/admin/TopBar.tsx`, `src/components/portal/TopBar.tsx` | Compile fixes only: drop `organisation`/`department` and the `redirectTo` prop |
| `src/types/workflow.ts`, `src/app/admin/deletions/page.tsx` | `deleted_by_username` → `deleted_by_email` (D-14) |
| `.env` / any env docs in `unblock-ai-web` | Remove `SESSION_TOKEN_SECRET` |

### Delete (web)

- `src/app/portal/login/page.tsx`
- `src/lib/auth/token.ts`
- `src/lib/auth/token.test.ts`

### Acceptance criteria

- `grep -rn "audience\|AuthAudience\|SESSION_TOKEN_SECRET\|verifySessionToken\|portal/login\|username" src` returns nothing auth-related.
- Logging in from two browsers shows two sessions on `/account`. Revoking one signs that browser out on its next request. Sign-out revokes the session server-side: reusing the old cookie value gives 401 from the API.
- A wrong password, a locked account and a disabled account each show their own message.
- `/admin` and `/portal` still render for users who hold the matching permissions. Nothing links or redirects to them.

### Verification

```bash
cd unblock-ai-web
npm run typecheck && npm run lint && npm test
npm run dev   # with the API running, Phase 5 seeded
```

Then work through the acceptance criteria manually in a browser.

---

## Phase 8 — Documentation, Postman and cleanup

**Goal:** no document or tool still describes the old model.

**Depends on:** all earlier phases.

### Modify or create

| File | Change |
|---|---|
| `unblock-ai-api/docs/guides/database-migrations.md` | Add the new migration to the layout tree. Note that there is no Mongo counterpart (D-13). |
| `unblock-ai-api/docs/guides/database-seeding.md` (**new**) | Layout, commands, idempotency contract, how to write a seeder, the `SEED_*` variables. Same structure as the migrations guide. |
| `unblock-ai-api/docs/guides/configuration.md` | Apply the §3.2 variable changes |
| `unblock-ai-api/docs/guides/running-the-app.md` | First-run steps: `migrate:up`, then `seed:pg:run`, then `dev` |
| `unblock-ai-api/docs/api/api-documentation.md` | Auth, user-session and user endpoints (§3.7), the permission map, and error codes |
| `unblock-ai-api/docs/architecture/folder-structure.md`, `project-overview.md` | `src/repositories/`, `src/db/seed/`, the permission model |
| `unblock-ai-api/docs/postman/*.json`, `README.md` | Email login, `me`, sessions, users. Store the token in a collection variable from the login test script. |
| `README.md`, `PROJECT_DOCUMENTATION.md`, `docs/overview.md`, `docs/demo-script.md` | Replace references to admin and portal users, `seed:auth`, `SESSION_TOKEN_SECRET` and the two login pages |
| `unblock-ai-web/README.md` | Env changes and the new login and account routes |

### Acceptance criteria

`grep -rn "admin_users\|portal_users\|seed:auth\|SESSION_TOKEN_SECRET\|AUTH_STORE_BACKEND\|SEED_ADMIN_" --include=*.md --include=*.json --include=.example.env .` returns only historical phase-plan documents under `docs/`, such as `auth-and-deletion-tracking-phase-plan.md`. Leave those unchanged, because they are history.

### Verification

```bash
cd unblock-ai-api && npm run typecheck && npm test
cd ../unblock-ai-web && npm run typecheck && npm run lint && npm test
```

---

## 13. Out of scope and follow-ups

Excluded on purpose. Do not build these in this round:

- Password change, reset and forgotten-password flows, and any auth-related email.
- User update, deactivate or delete endpoints, and changing a user's permissions after creation. When added, they must keep the "at least one permission" rule (already enforced by the trigger) and should revoke all of a user's sessions on deactivation.
- Requiring login for approval links and gating them with `task:approve` (D-12).
- Owner tracking and enforcement for selection sessions. `selection_sessions` documents have no creator field yet.
- Recording the client IP on sessions. This needs a deliberate `trust proxy` setting in Express and IP forwarding from the web app.
- Profile data (department, faculty, organisation) in its own tables. Until then, the selector cannot skip the "which faculty?" question.
- Redesigning `/admin` and `/portal` around permissions.
- A scheduled purge of expired sessions across all users. Expired sessions are currently cleared per user at login.
- Pagination on `GET /users`.
