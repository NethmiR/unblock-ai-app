# Authentication & Template-Deletion Tracking — Phase Plan

Adds real login to both surfaces (admin portal and requester portal), backed by
**PostgreSQL**, plus an auditable **template deletion log** attributed to the admin who
performed it.

Scope for this round is deliberately small: **one seeded admin, two seeded common users, no
self-registration, no password reset.** Everything below is built so that adding those
later is additive, not a rewrite.

Each phase is independently shippable and independently verifiable. **Stop after each
phase, run its verification block, then move on.**

---

## 0. Findings that shape this plan

All confirmed by reading source, not assumed. Three of these change the obvious approach —
read them before starting Phase 1.

### Finding 0.1 — The app is on MongoDB. This introduces a **second** database.

`unblock-ai-api` uses MongoDB 7 via the official driver with no ODM
([mongo.client.ts](../unblock-ai-api/src/db/mongo.client.ts)). Workflows, drafts, tasks,
selection sessions and the existing audit log all live there.

Putting auth in Postgres therefore makes this a **polyglot-persistence** service. That is a
legitimate choice — auth data is relational, has hard uniqueness constraints, and benefits
from FK integrity — but it has consequences this plan handles explicitly:

- **No cross-database transaction exists.** A template deletion touches Postgres (log row)
  and Mongo (template documents). Write ordering is the only atomicity available. See Phase 6.
- **Two connection lifecycles.** `closeDb()` in [server.ts](../unblock-ai-api/src/server.ts)
  closes Mongo only. Phase 1 extends shutdown.
- **Startup must not hard-fail when Postgres is down**, or the whole app becomes
  unrunnable in dev over an auth dependency. Phase 1 makes the pool lazy, matching how
  `getDb()` already behaves.

### Finding 0.2 — There is already a deletion audit trail, and it is in Mongo

[`AuditService`](../unblock-ai-api/src/services/audit.service.ts) +
[`AuditLogModel`](../unblock-ai-api/src/models/audit-log.model.ts) already write an
append-only `audit_logs` entry for `resource: "template" | "task"`, with a **snapshot
written before the delete** so a failed delete still leaves a trail.
`WorkflowService.delete()` already calls it.

So the deletion-tracking requirement is **not** "build an audit trail from nothing" — it is
"give the existing one a trustworthy actor, and move the template half into Postgres so it
can join to `admin_users`."

> **Decision (D-2, §0.6):** template deletions move to Postgres as the system of record.
> Task deletions stay in the Mongo `audit_logs` collection. No dual write.

### Finding 0.3 — The actor is currently spoofable, and the code says so

[`actorFromRequest`](../unblock-ai-api/src/utils/http/actor.util.ts) reads `x-actor-id` /
`x-actor-email` / `x-actor-role` request headers, with this comment in the file:

```
These headers are NOT a security boundary - never authorise anything on them.
```

Worse: [`client.ts`](../unblock-ai-web/src/lib/api/client.ts) **never sends those headers at
all**. So today every audit entry records `{ id: null, email: null, role: null }` — the
deletion log physically cannot answer "who deleted this".

That function is the designed seam. Phase 4 replaces its body with a read of `req.user` and
**every existing caller keeps working unchanged**.

### Finding 0.4 — Frontend auth is a single-file mock seam

[`session.ts`](../unblock-ai-web/src/lib/auth/session.ts) returns hardcoded sessions and is
marked *"REPLACE BEFORE ANY DEPLOYMENT"*. It has exactly **three** consumers:

| File | Use |
| --- | --- |
| [TopBar.tsx:4](../unblock-ai-web/src/components/admin/TopBar.tsx#L4) | `getSession("admin")` — display only |
| [useSelectionSession.ts:111](../unblock-ai-web/src/lib/hooks/useSelectionSession.ts#L111) | `getRequesterContext(getSession("requester"))` — feeds the selector agent |
| `session.ts` | the definition |

Swapping the mock for a real session is therefore a genuinely small blast radius. The
`getRequesterContext` shape (`faculty`, `department`, `actor_type`) must be **preserved
exactly** — the selector agent uses it to skip clarifying questions, and changing the keys
silently degrades retrieval quality rather than producing an error.

### Finding 0.5 — There is no `middleware.ts` and no `/login` route

`unblock-ai-web/src` contains `app/`, `components/`, `lib/`, `types/` only. Route
protection must be created, not modified. Also note `app/page.tsx` currently hard-redirects
`/` → `/admin`; that becomes a session-aware redirect in Phase 5.

### Finding 0.6 — Decisions taken (change these here, not mid-implementation)

| # | Decision | Rationale | Alternative rejected |
| --- | --- | --- | --- |
| **D-1** | Password hashing via **`node:crypto` scrypt**, no new dependency | `bcrypt`/`argon2` need node-gyp (painful on Windows). scrypt is a memory-hard KDF in the stdlib, and this codebase already uses `node:crypto` for HMAC tokens. | `bcryptjs` (pure JS but slow), native `bcrypt`/`argon2` (build toolchain) |
| **D-2** | Template deletions logged in **Postgres**; task deletions stay in **Mongo** | The requirement is a table joinable to `admin_users`. Dual-writing both stores doubles the failure modes for no gain. | Dual write; migrating all audit to Postgres (bigger, out of scope) |
| **D-3** | Session = **HMAC-signed stateless cookie**, not a `sessions` table | Mirrors the existing, tested approval-token pattern in [token.util.ts](../unblock-ai-api/src/utils/approval/token.util.ts). No revocation, acceptable for three seeded users. | Server-side session table (a write per request; revisit with real user management) |
| **D-4** | The cookie is set by **Next Route Handlers on the web origin**, not by the API | Lets Server Components and `middleware.ts` read the session directly, and survives the API moving to another domain. | API-set cookie + `credentials: "include"` — works only because both servers are on `localhost` today, and breaks as a *silent logout* on a domain split |
| **D-5** | Auth data access behind an **`IAuthStore` interface** with `postgres` and `memory` implementations | The codebase already does exactly this for `IVectorStore` and `IMailer`. It also makes `node:test` runnable with **no live Postgres** — `mongodb-memory-server` gives Mongo that for free, Postgres has no equivalent. | Direct `pg` calls inside the service (untestable offline) |
| **D-6** | Two separate tables (`admin_users`, `portal_users`) — **not** one table with a `role` column | Explicit requirement, and defensible: the populations have different columns (`faculty` matters only to requesters) and different privilege domains. | Single `users` table |
| **D-7** | Failed attempts are **tracked but lockout is not enforced** by default | The requirement is to *record* repeated wrong-password attempts. A surprise lockout mid-demo is worse than no lockout. Enforcement ships behind `AUTH_MAX_FAILED_ATTEMPTS` (default `0` = off). | Hard lockout at 5 attempts |

### Finding 0.7 — Gate commands (verified in `package.json`)

| Workspace | typecheck | test |
| --- | --- | --- |
| `unblock-ai-api` | `npm run typecheck` | `npm test` (node:test via tsx) |
| `unblock-ai-web` | `npm run typecheck` | `npm test` (vitest) |

Integration tests live in `unblock-ai-api/tests/integration/*.route.test.ts`, built on
[`test-server.helper.ts`](../unblock-ai-api/tests/helpers/test-server.helper.ts) +
`mongodb-memory-server`. Phase 7 extends those, and the `memory` auth store (D-5) is what
lets them keep running without a database container.

---

## Data model (built in Phase 2, referenced throughout)

Three tables. `gen_random_uuid()` is built into PostgreSQL 13+ — no `pgcrypto` extension
needed.

```sql
-- ============================== admin_users ==============================
CREATE TABLE IF NOT EXISTS admin_users (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username               TEXT        NOT NULL,
    email                  TEXT        NOT NULL,
    full_name              TEXT        NOT NULL,
    department             TEXT,
    organisation           TEXT,
    password_hash          TEXT        NOT NULL,
    is_active              BOOLEAN     NOT NULL DEFAULT TRUE,

    -- when this user last logged in successfully
    last_login_at          TIMESTAMPTZ,

    -- how many times we received THIS username with the WRONG password,
    -- and when the most recent such attempt happened
    failed_attempt_count   INTEGER     NOT NULL DEFAULT 0,
    last_failed_attempt_at TIMESTAMPTZ,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness without requiring the citext extension.
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_key ON admin_users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_key    ON admin_users (lower(email));

-- ============================== portal_users =============================
CREATE TABLE IF NOT EXISTS portal_users (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username               TEXT        NOT NULL,
    email                  TEXT        NOT NULL,
    full_name              TEXT        NOT NULL,
    department             TEXT,
    organisation           TEXT,
    faculty                TEXT,          -- feeds getRequesterContext(); see Finding 0.4
    password_hash          TEXT        NOT NULL,
    is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at          TIMESTAMPTZ,
    failed_attempt_count   INTEGER     NOT NULL DEFAULT 0,
    last_failed_attempt_at TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_users_username_key ON portal_users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS portal_users_email_key    ON portal_users (lower(email));

-- =========================== template_deletions ==========================
CREATE TABLE IF NOT EXISTS template_deletions (
    id                  BIGSERIAL   PRIMARY KEY,
    workflow_id         TEXT        NOT NULL,
    template_title      TEXT        NOT NULL,
    latest_version      INTEGER     NOT NULL,
    versions_removed    INTEGER     NOT NULL DEFAULT 0,
    institution_type    TEXT,
    review_status       TEXT,

    -- RESTRICT, not CASCADE: an audit row must never be orphaned or erased by
    -- removing the admin who created it.
    deleted_by_admin_id UUID        NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
    -- Denormalised on purpose: the log stays readable if the admin is renamed.
    deleted_by_username TEXT        NOT NULL,

    reason              TEXT,
    request_id          TEXT,
    snapshot            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    deleted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_deletions_deleted_at_idx ON template_deletions (deleted_at DESC);
CREATE INDEX IF NOT EXISTS template_deletions_admin_idx      ON template_deletions (deleted_by_admin_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS template_deletions_workflow_idx   ON template_deletions (workflow_id);
```

**`versions_removed` is written after the Mongo delete returns.** It starts at `0` and is
updated on success (Phase 6). A row still reading `versions_removed = 0` therefore means
*"the log landed but the delete did not"* — which is exactly the recoverable failure state
the write-before-delete ordering exists to create.

**Password hash format** (D-1), stored as one self-describing string so the parameters can
change without a migration:

```
scrypt$<N>$<r>$<p>$<salt-base64>$<hash-base64>

scrypt$16384$8$1$k9Xm...$7Qf2...
```

---

## Phase 1 — PostgreSQL infrastructure

**Goal:** the API can connect to Postgres, health-check it, and shut it down cleanly. No
tables, no auth, no behaviour change anywhere else.

**Why first:** it is the only phase with a new external dependency. Getting it green in
isolation means every later failure is your code, not your connection string.

### 1.1 Dependency

```bash
cd unblock-ai-api
npm install pg
npm install -D @types/pg
```

`pg` (node-postgres) only — **no ORM**, matching the existing "official driver, no ODM"
discipline used for Mongo.

### 1.2 Files

| File | Action |
| --- | --- |
| `src/config/postgres.config.ts` | **new** — mirrors `db.config.ts` |
| `src/config/index.config.ts` | add `postgres` to the frozen config object |
| `src/lib/types/config/config.type.ts` | add `PostgresConfig`; add the field to `AppConfig` |
| `src/db/postgres.client.ts` | **new** — lazy pool, `query()`, `withTransaction()`, `closePool()` |
| `src/server.ts` | close the pool in the SIGINT/SIGTERM handler |
| `src/controllers/health.controller.ts` | report Postgres reachability |
| `.example.env` | document the new variables |

No new error classes — reuse `DatabaseError` and `ConfigurationError`.

### 1.3 New environment variables

```bash
# PostgreSQL connection string for auth + deletion tracking
POSTGRES_URL=postgresql://unblock_app:<password>@localhost:5432/unblock_ai_auth
# Max pooled connections
POSTGRES_POOL_MAX=10
# Connection acquisition timeout, ms
POSTGRES_CONNECTION_TIMEOUT_MS=5000
```

`POSTGRES_URL` is `requireString` **only when** the auth store backend is `postgres`;
otherwise `optionalString` with an empty default, so `AUTH_STORE_BACKEND=memory` (tests)
never needs a database. Follow the conditional-requirement precedent already in
`mail.config.ts`.

### 1.4 Client sketch

```ts
// src/db/postgres.client.ts
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "../config/index.config.js";
import { logger } from "../utils/shared/logger.util.js";
import { DatabaseError } from "../errors/database.error.js";

let pool: Pool | null = null;

/** Lazy, like getDb(): the process starts even if Postgres is not up yet. */
export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: config.postgres.url,
    max: config.postgres.poolMax,
    connectionTimeoutMillis: config.postgres.connectionTimeoutMs,
  });
  // node-postgres emits 'error' on IDLE clients. With no listener, Node treats it
  // as an unhandled 'error' event and terminates the process.
  pool.on("error", (err) => logger.error("postgres pool error", { message: err.message }));
  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const result = await getPool().query<T>(text, params);
    return result.rows;
  } catch (err) {
    throw new DatabaseError("Postgres query failed", { cause: err });
  }
}

/** For the few places needing BEGIN/COMMIT (migrations, the login write). */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw new DatabaseError("Postgres transaction failed", { cause: err });
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
```

### 1.5 Verification

```bash
# PostgreSQL 17 is already installed as a Windows service, and the
# unblock_ai_auth database + unblock_app role already exist (see Appendix A).
# Confirm the service is up before starting:
Get-Service postgresql-x64-17

cd unblock-ai-api
npm run typecheck
npm run dev
curl -s http://localhost:3000/api/health
```

**Done when:** `/api/health` reports `postgres: "ok"`; stopping the service
(`Stop-Service postgresql-x64-17`, elevated) flips it to `"unavailable"` **without crashing
the server**; `Ctrl-C` shuts down with no open-handle warning. Start it again afterwards.

---

## Phase 2 — Schema, migrations, hashing, and seed data

**Goal:** the three tables exist, one admin and two common users are seeded with real
scrypt hashes, and re-running the seed is idempotent.

### 2.1 Files

| File | Action |
| --- | --- |
| `src/db/migrations/001_auth_tables.sql` | **new** — the DDL above, verbatim |
| `src/db/migrate.ts` | **new** — applies `.sql` files in filename order, tracked in `schema_migrations` |
| `src/utils/shared/password.util.ts` | **new** — `hashPassword`, `verifyPassword`, `burnHashTime` |
| `scripts/migrate-postgres.script.ts` | **new** — `npm run migrate:pg` |
| `scripts/seed-auth.script.ts` | **new** — `npm run seed:auth` |
| `package.json` | register both scripts |

Migrations are plain `.sql` files with a ~40-line runner — **not** a migration framework.
The project already has one-script-per-job (`init-db`, `backfill:summaries`); this matches
that convention.

```
src/db/migrate.ts, conceptually:
  CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now());
  for each .sql file in sorted order, if its name is not in schema_migrations:
      BEGIN; <file contents>; INSERT INTO schema_migrations(filename) VALUES ($1); COMMIT;
```

Each file runs inside a transaction, so a half-applied migration is impossible.

### 2.2 Password utility

```ts
// src/utils/shared/password.util.ts
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, k: number, o: object) => Promise<Buffer>;

const N = 16384, r = 8, p = 1, KEYLEN = 64;
// Node's default maxmem is 32MB; N=16384,r=8 needs ~16MB plus overhead and throws
// ERR_CRYPTO_INVALID_SCRYPT_PARAMS intermittently without an explicit raise.
const OPTS = { N, r, p, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(plain.normalize("NFKC"), salt, KEYLEN, OPTS);
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Never throws - a malformed stored hash is a `false`, not a 500. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const [scheme, sN, sR, sP, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = await scrypt(plain.normalize("NFKC"), salt, expected.length, {
      N: Number(sN), r: Number(sR), p: Number(sP), maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Burns roughly one hash's worth of time so a login POST for an UNKNOWN username
 * costs the same as one for a known username. Without this, response latency
 * leaks which usernames exist.
 */
export async function burnHashTime(): Promise<void> {
  await scrypt("x", Buffer.alloc(16), KEYLEN, OPTS).catch(() => {});
}
```

> **The `maxmem` option is not optional.** Set it explicitly on **both** code paths, or
> hashing fails intermittently under load.

### 2.3 Seed data

Credentials come from `.env`, **not** from the script body, so real passwords never enter
git:

```bash
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=Admin@12345
SEED_USER1_USERNAME=chathura
SEED_USER1_PASSWORD=User@12345
SEED_USER2_USERNAME=dilani
SEED_USER2_PASSWORD=User@12345
```

Seeded rows — the names deliberately match the current mock in `session.ts`, so screenshots
and the running app keep agreeing (Finding 0.4):

| Table | username | full_name | department | faculty |
| --- | --- | --- | --- | --- |
| `admin_users` | `admin` | Nadeesha Perera | Registrar's Office | — |
| `portal_users` | `chathura` | Chathura Silva | Department of Information Technology | Information Technology |
| `portal_users` | `dilani` | Dilani Fernando | Department of Computer Science | Computer Science |

The seed uses `INSERT ... ON CONFLICT DO NOTHING` against the `lower(username)` index, so
re-running never duplicates a row **and never silently resets a changed password**. Add a
`--force` flag that switches to `DO UPDATE SET password_hash = ...` for a deliberate reset.

### 2.4 Verification

```bash
cd unblock-ai-api
npm run migrate:pg
npm run seed:auth
npm run seed:auth        # second run must be a no-op

psql "$env:POSTGRES_URL" \
  -c "SELECT username, full_name, last_login_at, failed_attempt_count FROM admin_users;" \
  -c "SELECT username, faculty FROM portal_users;" \
  -c "\d template_deletions"
```

**Done when:** three tables exist with their indexes; three seeded rows; the second seed run
inserts nothing; no plaintext password appears in `git diff`.

---

## Phase 3 — Auth service and login endpoints

**Goal:** `POST /api/auth/login` works for both audiences, stamps `last_login_at` on
success, and bumps the failed-attempt counters on a wrong password. Still no route
protection, still no UI.

### 3.1 Files

| File | Action |
| --- | --- |
| `src/lib/types/auth/auth.type.ts` + `index.type.ts` | **new** — `AuthUser`, `AuthAudience`, `AuthUserRow`, `SessionPayload` |
| `src/services/auth-store/auth-store.interface.ts` | **new** — `IAuthStore` (D-5) |
| `src/services/auth-store/postgres.auth-store.ts` | **new** |
| `src/services/auth-store/in-memory.auth-store.ts` | **new** — seeded from the same fixture the seed script uses |
| `src/services/auth-store/index.auth-store.ts` | **new** — `createAuthStore(backend, deps)` factory |
| `src/services/auth.service.ts` | **new** — login orchestration |
| `src/utils/auth/session-token.util.ts` | **new** — HMAC issue/verify, modelled on `approval/token.util.ts` |
| `src/controllers/auth.controller.ts` | **new** |
| `src/routes/auth.route.ts`, `index.route.ts` | **new** / wire in |
| `src/errors/unauthorized.error.ts`, `forbidden.error.ts`, `index.error.ts` | **new** — 401 / 403 subclasses of `BaseError` |
| `src/config/auth.config.ts`, `index.config.ts`, `config.type.ts` | **new** / extend |
| `src/server.ts` | construct and inject `authStore`, `authService`, `authController` |

### 3.2 The store interface

```ts
// src/services/auth-store/auth-store.interface.ts
export interface IAuthStore {
  findByUsername(audience: AuthAudience, username: string): Promise<AuthUserRow | null>;
  findById(audience: AuthAudience, id: string): Promise<AuthUserRow | null>;

  /** Success path: stamp last_login_at and RESET the failure counter. */
  recordSuccessfulLogin(audience: AuthAudience, id: string, at: Date): Promise<void>;

  /** Failure path: increment failed_attempt_count, stamp last_failed_attempt_at. */
  recordFailedAttempt(audience: AuthAudience, id: string, at: Date): Promise<number>;

  /** Phase 6 lives here too - same store, same pool. */
  recordTemplateDeletion(input: TemplateDeletionInput): Promise<TemplateDeletionRecord>;
  markDeletionCompleted(id: string, versionsRemoved: number): Promise<void>;
  listTemplateDeletions(limit: number, workflowId?: string): Promise<TemplateDeletionRecord[]>;
}
```

`audience` is `"admin" | "portal"` and maps to a table name through a **frozen lookup
object, never string interpolation of caller input**:

```ts
const TABLE = { admin: "admin_users", portal: "portal_users" } as const;
// SQL then interpolates only that validated identifier; every VALUE uses $1-style params.
```

### 3.3 Login semantics — the part worth getting exactly right

```ts
// AuthService.login({ audience, username, password })
const user = await store.findByUsername(audience, username);

if (!user) {
  await burnHashTime();                       // equalise timing; see §2.2
  throw new UnauthorizedError("Invalid username or password");
}

const ok = await verifyPassword(password, user.password_hash);

if (!ok) {
  const count = await store.recordFailedAttempt(audience, user.id, new Date());
  logger.warn("failed login", { audience, username: user.username, count });
  //  ^^ THE REQUIREMENT: same username, wrong password - counted and timestamped.
  if (config.auth.maxFailedAttempts > 0 && count >= config.auth.maxFailedAttempts) {
    throw new ForbiddenError("Account locked after too many failed attempts");
  }
  throw new UnauthorizedError("Invalid username or password");
}

if (!user.is_active) throw new ForbiddenError("Account is disabled");

await store.recordSuccessfulLogin(audience, user.id, new Date());   // resets the counter
return { token: issueSessionToken(user, audience), user: toAuthUser(user) };
```

Four points that are easy to get wrong:

1. **Identical 401 status and message for "no such user" and "wrong password."** The
   counters exist for the operator, not for the caller.
2. **A wrong password for a *nonexistent* username increments nothing** — there is no row
   to increment. This is a real limitation of the requested design: it counts attacks
   against *known* accounts only. Counting attempts against unknown usernames needs a
   separate append-only `login_attempts` table (out of scope; see §8).
3. **Success resets the counter**, so `failed_attempt_count` reads as *"consecutive
   failures since the last good login"*, not a lifetime total. `last_failed_attempt_at` is
   deliberately **not** cleared on success — the timestamp of the last bad attempt stays
   visible even on a healthy account, which is what makes it useful.
4. **`recordFailedAttempt` must be atomic** — a single
   `UPDATE ... SET failed_attempt_count = failed_attempt_count + 1 ... RETURNING
   failed_attempt_count`, never a read-modify-write.

### 3.4 Session token

Reuse the `payload.signature` shape from `approval/token.util.ts`, with an expiry carried
inside the payload since there is no server-side session row to expire (D-3):

```
{ sub: "<uuid>", aud: "admin" | "portal", usr: "<username>", exp: <epoch-ms> }
```

`verifySessionToken` checks the HMAC with `timingSafeEqual` **and then** `exp`, returning
`null` on any failure — non-throwing, exactly like the existing `verifyToken`.

New environment variables:

```bash
# HMAC secret for session cookies. MUST differ from APPROVAL_TOKEN_SECRET.
SESSION_TOKEN_SECRET=
# Session lifetime, hours
SESSION_TTL_HOURS=12
# Consecutive failed attempts before locking. 0 disables enforcement (tracking still happens).
AUTH_MAX_FAILED_ATTEMPTS=0
# Auth store backend: postgres | memory
AUTH_STORE_BACKEND=postgres
```

`SESSION_TOKEN_SECRET` is `requireString` when `NODE_ENV=production`, and
optional-with-a-random-value in development — a dev restart invalidating sessions is a fair
trade for never shipping a default secret.

### 3.5 Endpoints

| Method | Path | Body / Auth | Returns |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | `{ audience, username, password }` | `{ token, expires_at, user }` |
| `GET` | `/api/auth/me` | `Authorization: Bearer <token>` | `{ user }` |
| `POST` | `/api/auth/logout` | Bearer | `204` — stateless; the client discards the cookie |

The API returns the token in the **response body**, not a `Set-Cookie` header. The Next
Route Handler is what turns it into an httpOnly cookie (D-4).

### 3.6 Verification

```bash
cd unblock-ai-api && npm run dev

# success
curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"audience":"admin","username":"admin","password":"Admin@12345"}'

# wrong password, three times
for i in 1 2 3; do curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"audience":"admin","username":"admin","password":"nope"}'; done

psql "$env:POSTGRES_URL" -c \
  "SELECT username, last_login_at, failed_attempt_count, last_failed_attempt_at FROM admin_users;"
```

**Done when:** the good login returns a token and stamps `last_login_at`; three bad ones
return `401` and leave `failed_attempt_count = 3` with a fresh `last_failed_attempt_at`; a
following good login resets the count to `0`; an unknown username returns `401` in visibly
the same time as a wrong password.

---

## Phase 4 — Server-side route protection and a trustworthy actor

**Goal:** the API knows who is calling, `req.user` is populated, admin-only routes reject
non-admins, and `actorFromRequest` stops trusting headers.

**This is the phase that turns Phase 3 from a login form into security.**

### 4.1 Files

| File | Action |
| --- | --- |
| `src/middlewares/authenticate.middleware.ts` | **new** — parses the token, sets `req.user`, never rejects |
| `src/middlewares/require-auth.middleware.ts` | **new** — `requireAuth()`, `requireRole("admin")` |
| `src/middlewares/index.middleware.ts` | export both |
| `src/lib/types/http/http.type.ts` | extend the `Express.Request` global with `user?: AuthUser` |
| `src/utils/http/actor.util.ts` | **rewrite the body** — read `req.user` |
| `src/app.ts` | insert `authenticate` into the chain |
| `src/routes/workflow.route.ts`, `draft.route.ts`, `task.route.ts`, `selection.route.ts` | attach guards |

### 4.2 The middleware split is deliberate

`authenticate` **populates and never rejects**; `requireAuth` / `requireRole` **reject**.
Two reasons: routes that only want to *attribute* an action (not gate it) get identity for
free, and `/api/approvals/*` — token-authenticated by a **different** mechanism — must keep
working for unauthenticated approvers clicking an email link.

```ts
// app.ts
app.use(requestId);
app.use(requestLogger);
app.use(cors);
app.use(jsonBody);
app.use(authenticate);            // <-- new: populates req.user when a valid token is present
app.use("/api", createApiRouter(controllers));
app.use(notFound);
app.use(errorHandler);
```

### 4.3 The actor seam closes

```ts
// utils/http/actor.util.ts - the entire function, after
export function actorFromRequest(req: Request): AuditActor {
  const user = req.user;
  if (!user) return { id: null, email: null, role: null };
  return { id: user.id, email: user.email, role: user.role };
}
```

**Every existing caller is unchanged.** That is the payoff of Finding 0.3.

### 4.4 Route protection matrix

| Routes | Guard | Note |
| --- | --- | --- |
| `POST /auth/login` | none | obviously |
| `GET /health` | none | monitoring |
| `GET /approvals/:token`, `POST /approvals/:token/decision` | **none** | approval tokens are their own auth mechanism — adding a session guard here breaks every emailed approval link |
| `POST/PUT/PATCH/DELETE /workflows*`, all `/drafts*` | `requireRole("admin")` | the authoring surface |
| `GET /workflows`, `GET /workflows/:id` | `requireAuth()` | requesters need to read templates |
| all `/selection*`, all `/tasks*` | `requireAuth()` | either audience |
| `DELETE /workflows/:id` | `requireRole("admin")` | feeds Phase 6 |

> **`DELETE /tasks/:id` is a judgement call.** Today any caller can delete any task. The
> minimum correct guard is `requireAuth()`. Ownership enforcement ("a requester may delete
> only their own request") needs `submitted_by` to actually be populated, which is listed
> in §8 as the natural follow-on. Do the `requireAuth()` half now and leave the TODO.

### 4.5 Verification

```bash
# no token -> 401
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE localhost:3000/api/workflows/anything

# portal token on an admin route -> 403
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"audience":"portal","username":"chathura","password":"User@12345"}' | jq -r .token)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" localhost:3000/api/drafts

# approval links still work unauthenticated
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/approvals/some-token
```

**Done when:** `401` without a token, `403` for the wrong role, approval endpoints
unaffected, and `npm test` passes. The existing integration tests **will** break here for
lack of a token — that is expected; fix them with the helper described in §7.1 rather than
skipping the suite.

---

## Phase 5 — Login UI and session on the web

**Goal:** two working login pages, an httpOnly session cookie, `middleware.ts` guarding
`/admin` and `/portal`, and `session.ts` returning the **real** user.

### 5.1 Files

| File | Action |
| --- | --- |
| `src/app/login/page.tsx` | **new** — admin login |
| `src/app/portal/login/page.tsx` | **new** — requester login |
| `src/components/auth/LoginForm.tsx` | **new** — shared, takes an `audience` prop |
| `src/app/api/auth/login/route.ts` | **new** — Route Handler: calls the API, sets the cookie |
| `src/app/api/auth/logout/route.ts` | **new** — clears the cookie |
| `src/middleware.ts` | **new** — guards `/admin*` and `/portal*` |
| `src/lib/auth/session.ts` | **rewrite** — reads the cookie; keeps `getRequesterContext` shape |
| `src/lib/auth/token.ts` | **new** — Edge-safe HMAC verify for the middleware |
| `src/lib/api/auth.ts` | **new** — login/logout/me client module built on `apiRequest` |
| `src/lib/api/client.ts` | forward the session token on server-side calls |
| `src/components/admin/TopBar.tsx` | `await getSession()`, add a sign-out control |
| `src/app/page.tsx` | session-aware redirect instead of a hard `/admin` |
| `src/types/auth.ts` | **new** — hand-mirrored `AuthUser`, matching the `src/types/` convention |

### 5.2 The cookie flow (D-4)

```
Browser  --POST /api/auth/login (same origin, :3001)-->  Next Route Handler
                                                              |
                                             POST :3000/api/auth/login
                                                              |
                                                   { token, expires_at, user }
                                                              |
Browser  <-- 200 + Set-Cookie: ua_session=...; HttpOnly; SameSite=Lax; Path=/ --+
```

Cookie attributes: `httpOnly: true`, `sameSite: "lax"`, `path: "/"`,
`secure: process.env.NODE_ENV === "production"`, `maxAge` derived from `expires_at`.

> **Why not let the API set the cookie:** it would work today only because both servers are
> on `localhost` and cookies are not port-scoped. The moment the API moves to another host
> that cookie stops being sent — and it fails as a *silent logout*, not an error. D-4 costs
> two small Route Handlers and removes the entire class of problem.

### 5.3 `middleware.ts` — verify, don't just check presence

```ts
// src/middleware.ts
export const config = { matcher: ["/admin/:path*", "/portal/:path*"] };
```

The middleware runs on the **Edge runtime**, where `node:crypto` is unavailable. Use
`crypto.subtle` (Web Crypto) for the HMAC check in `lib/auth/token.ts` — it is present on
Edge. Verify the signature **and** `exp`; a bare `cookies.has()` check is forged by setting
any junk cookie value.

Redirect rules:

| Situation | Result |
| --- | --- |
| No/invalid cookie on `/admin*` | `302 -> /login?next=<path>` |
| No/invalid cookie on `/portal*` | `302 -> /portal/login?next=<path>` |
| Valid `portal` cookie on `/admin*` | `302 -> /portal` — a wrong-surface redirect reads better than an error page |
| Valid `admin` cookie on `/portal*` | allowed — an admin previewing the requester surface is useful |

**The middleware is UX, not security.** The Phase 4 API guards are the real boundary. Never
let an authorisation decision live in the middleware alone.

### 5.4 `session.ts` after the rewrite

Preserve the exported shape so the three consumers from Finding 0.4 keep compiling:

```ts
// src/lib/auth/session.ts  (Server Component / Route Handler only - it reads cookies())
export async function getSession(): Promise<Session | null> { ... }

/** UNCHANGED SHAPE - the selector agent depends on these exact keys. */
export function getRequesterContext(session: Session) {
  return { faculty: session.faculty, department: session.department, actor_type: "staff" };
}
```

`getSession` becomes **async**, which is a breaking change for its callers:

- `TopBar.tsx` is a Server Component → `const session = await getSession()`.
- `useSelectionSession.ts` is a **client** hook and cannot call it. Pass the requester
  context down as a prop from the portal Server Component, or expose it through a
  `SessionProvider`. **Prop-drilling from the page is the smaller change** —
  `useSelectionSession` already takes arguments.

`initials` is no longer stored; derive it from `full_name` in a small helper.

### 5.5 Verification

```bash
cd unblock-ai-web && npm run typecheck && npm run dev
```

Then, manually: `/admin` while logged out lands on `/login?next=/admin`; logging in as
`admin` returns you to `/admin` with your real name in the TopBar; `chathura` logging in at
`/portal/login` reaches `/portal`; a `portal` session hitting `/admin` bounces to
`/portal`; sign-out clears the cookie and re-guards; the cookie is **not** visible to
`document.cookie` in the browser console (proving `httpOnly`).

---

## Phase 6 — Template deletion tracking

**Goal:** every admin template deletion writes a `template_deletions` row naming **who**,
**which template**, and **when** — and the admin portal can read that log.

Everything this needs now exists: an authenticated admin (Phase 5), a trustworthy
`req.user` (Phase 4), and the table (Phase 2).

### 6.1 Files

| File | Action |
| --- | --- |
| `src/services/auth-store/postgres.auth-store.ts` | implement the three deletion methods from §3.2 |
| `src/services/deletion-log.service.ts` | **new** — thin service over the store |
| `src/services/workflow.service.ts` | `delete()` writes Postgres instead of the Mongo template audit (D-2) |
| `src/controllers/workflow.controller.ts` | pass the full `AuthUser`, not just an `AuditActor` |
| `src/routes/workflow.route.ts` | add `GET /workflows/deletions` (admin-only) |
| `src/lib/types/audit/audit.type.ts` | narrow `AuditResource` to `"task"` — see §6.3 |
| `unblock-ai-web/src/app/admin/deletions/page.tsx` | **new** — the deletion log view |
| `unblock-ai-web/src/lib/api/workflows.ts` | add `listDeletions()` |

### 6.2 Ordering — the only atomicity available (Finding 0.1)

```ts
// WorkflowService.delete(), after
async delete(workflowId: string, actor: AuthUser, requestId?: string | null): Promise<void> {
  const record = await this.getRecord(workflowId);

  // 1. Active-request guard - UNCHANGED, and it must stay FIRST so a rejected
  //    delete never writes a log row.
  const activeTasks = await this.taskModel.countByWorkflow(workflowId, LIVE_STATUSES);
  if (activeTasks > 0) throw new ConflictError(...);

  // 2. Log BEFORE deleting. versions_removed starts at 0.
  const entry = await this.deletionLog.record({
    workflowId,
    templateTitle: record.title,
    latestVersion: record.version,
    institutionType: record.institution_type,
    reviewStatus: record.review_status,
    adminId: actor.id,
    adminUsername: actor.username,
    requestId,
    snapshot: { title: record.title, description: record.description, created_at: record.created_at },
  });

  // 3. Delete from Mongo.
  const removed = await this.templateModel.deleteAllVersions(workflowId);
  if (removed === 0) throw NotFoundError.of("Workflow", workflowId);

  // 4. Confirm. A row still at versions_removed = 0 means step 3 never completed -
  //    which is the recoverable state the pre-write ordering is FOR.
  await this.deletionLog.markCompleted(entry.id, removed);
}
```

> **Do not "fix" this by deleting first and logging after.** The current code already
> logs-then-deletes, and its comment explains why: *"a failed delete leaves a visible trail
> rather than a silent gap."* Keep that property.

### 6.3 Retiring the Mongo template audit (D-2)

`AuditResource` narrows from `"task" | "template"` to `"task"`. Historical Mongo entries
with `resource: "template"` **remain readable** — Mongo is schemaless and `findByResource`
takes a string. Add a one-line note to
[audit.type.ts](../unblock-ai-api/src/lib/types/audit/audit.type.ts) recording that
template deletions moved to Postgres as of this change, so the next reader is not confused
by a collection holding a value the type no longer permits.

If pre-existing template audit entries matter, write a one-off
`scripts/backfill-deletion-log.script.ts` that copies them across with
`deleted_by_admin_id` set to the seeded admin and a `snapshot.migrated_from = "mongo"`
marker. **Only do this if there is real history worth keeping** — for a system where the
actor was always `null`, there probably is not.

### 6.4 The admin view

`GET /api/workflows/deletions?limit=50`, newest first:

| Column | Source |
| --- | --- |
| Template | `template_title`, with `workflow_id` as sub-text |
| Deleted by | `deleted_by_username` |
| When | `deleted_at`, rendered through the existing [DateTime](../unblock-ai-web/src/components/ui/DateTime.tsx) component |
| Versions removed | `versions_removed` |
| Status | `versions_removed = 0` → an "incomplete" badge |

Use the existing `Card` / `Badge` / `EmptyState` primitives in
[components/ui/](../unblock-ai-web/src/components/ui/) — this is a table, not a new design
system.

### 6.5 Verification

```bash
# As admin, delete a throwaway template through the UI, then:
psql "$env:POSTGRES_URL" -c \
  "SELECT template_title, deleted_by_username, deleted_at, versions_removed
     FROM template_deletions ORDER BY deleted_at DESC LIMIT 5;"
```

**Done when:** the row names the logged-in admin (not `null`); `versions_removed` matches
the number of versions that existed; deleting a template that still has live requests
writes **no** row and returns `409`; `/admin/deletions` renders the entry.

---

## Phase 7 — Tests, docs, and the security pass

**Goal:** both suites green and covering the new behaviour, and the docs stop describing a
system without authentication.

### 7.1 Backend tests

| File | Covers |
| --- | --- |
| `tests/unit/utils/password.util.test.ts` | hash→verify round-trip; wrong password `false`; malformed stored hash `false` and never throws; two hashes of the same password differ (salting) |
| `tests/unit/utils/session-token.util.test.ts` | issue→verify; tampered payload `null`; wrong secret `null`; expired `null` |
| `tests/unit/services/auth.service.test.ts` | **the counter semantics** — a bad password increments; three bad = 3; a good login resets to 0 and stamps `last_login_at`; an unknown user throws without touching any row; an inactive user gets `403` |
| `tests/integration/auth.route.test.ts` | login `200` / `401`; `/auth/me` with and without a token |
| `tests/integration/workflow.route.test.ts` | **extend** — delete with no token `401`; with a portal token `403`; with an admin token `204` plus a deletion row |

Unit tests use `createAuthStore("memory", ...)` (D-5) and need no database. Only the
integration deletion assertion needs real Postgres — gate that one test on `POSTGRES_URL`
so `npm test` stays runnable offline:

```ts
test("records the deleting admin", { skip: !process.env.POSTGRES_URL && "no POSTGRES_URL" }, ...);
```

Existing integration tests need an auth header. Add **one** helper to
[test-server.helper.ts](../unblock-ai-api/tests/helpers/test-server.helper.ts) —
`adminAuthHeader()` — rather than editing dozens of call sites individually.

### 7.2 Frontend tests

`src/lib/auth/token.test.ts` (vitest) — the Edge-safe verifier accepts a good token and
rejects a tampered one. The login form itself is not worth a test at this stage.

### 7.3 Documentation

| Doc | Edit |
| --- | --- |
| [overview.md](overview.md) | §1 gains an auth area; §2 gains PostgreSQL + `pg` in the backend table; **"Not built yet"** loses the *"No authentication on any route"* bullet and gains the honest remainder (no self-registration, no password reset, no session revocation, no directory integration) |
| `unblock-ai-api/docs/api/api-documentation.md` | three new endpoints plus `GET /workflows/deletions`; a note on which routes now require which role |
| `unblock-ai-api/docs/postman/` | a login request that captures `token` into a collection variable, plus collection-level bearer auth |
| `unblock-ai-api/.example.env` | every new variable, commented in the existing style |
| `unblock-ai-api/docs/architecture/project-overview.md` | the polyglot-persistence decision and *why* (Finding 0.1) |

### 7.4 Security pass

Work through this before calling the feature done:

- [ ] No plaintext password in any log line — grep for `password` inside `logger.*` calls
- [ ] `SESSION_TOKEN_SECRET` differs from `APPROVAL_TOKEN_SECRET`; neither is committed
- [ ] `.env` is gitignored (it is) and no seed password reached git
- [ ] Login response time is indistinguishable for unknown-user vs wrong-password
- [ ] Cookie is `httpOnly` + `sameSite=lax`, and `secure` in production
- [ ] `Access-Control-Allow-Origin` is the explicit frontend origin, never `*`
- [ ] `GET /workflows/deletions` is admin-only
- [ ] No SQL string interpolation of user input anywhere — `$1` placeholders throughout
- [ ] `/api/approvals/*` still works with no session

---

## 8. Deliberately out of scope

Named here so nobody assumes they were forgotten:

- **Self-registration, password reset, password change.** Three seeded users, changed by
  re-running the seed with `--force`.
- **Session revocation / "log out everywhere."** A consequence of D-3. Add a `sessions`
  table when real user management ships.
- **Counting failed attempts against usernames that do not exist.** Needs an append-only
  `login_attempts` table; see §3.3 point 2.
- **Populating `task.submitted_by` and enforcing request ownership.** The most valuable
  immediate follow-on: Phase 4 gives `/tasks` a real `req.user`, so wiring `submitted_by`
  and filtering the portal job list by owner becomes small and contained. Until then the
  portal shows every task to every user.
- **Directory/identity integration.** Approver emails stay requester-supplied and
  unverified (see [requester-contact-gap.md](requester-contact-gap.md)). Logging in as a
  requester does **not** make the approver addresses they type trustworthy.
- **Rate limiting by IP.** Per-account attempt counting is not the same thing.
- **Migrating the rest of the app off MongoDB.** Not proposed, not implied.

---

## 9. Phase summary

| Phase | Delivers | Depends on | Rough size |
| --- | --- | --- | --- |
| 1 | Postgres connection + health | — | S |
| 2 | Tables, migrations, hashing, seed | 1 | M |
| 3 | Login endpoints + attempt tracking | 2 | L |
| 4 | Route guards + trustworthy actor | 3 | M |
| 5 | Login UI, cookie, route protection | 3 | L |
| 6 | Template deletion tracking | 4, 5 | M |
| 7 | Tests, docs, security pass | all | M |

Phases 4 and 5 can run in parallel once Phase 3 is green — 4 is backend-only, 5 is
frontend-only, and they meet at the token format defined in §3.4. Everything else is
strictly sequential.

---

## Appendix A — Environment as provisioned

Set up on 2026-08-28. Phase 1 does **not** need to repeat any of this — it only needs to
connect.

| Item | Value |
| --- | --- |
| Server | PostgreSQL **17.11**, native Windows install (EDB installer) |
| Install path | `C:\Program Files\PostgreSQL\17` |
| Service | `postgresql-x64-17`, **Automatic** start |
| Port | `5432` |
| Components | server + command-line tools. Stack Builder was not installed |
| pgAdmin | **4 v9.17**, installed separately via `winget install PostgreSQL.pgAdmin`. Per-user install at `%LOCALAPPDATA%\Programs\pgAdmin 4`; Start Menu shortcut "pgAdmin 4" |
| `psql` | on the user `PATH` — open a *new* terminal to pick it up |
| Database | `unblock_ai_auth`, UTF8, owned by `unblock_app` |
| App role | `unblock_app` — LOGIN, owns the database, so it already has the DDL rights the Phase 2 migrations need |
| Superuser | `postgres` — **not** used by the application |
| Config | `POSTGRES_URL` plus the auth and seed variables are already appended to `unblock-ai-api/.env` (gitignored) |

**Verified at setup time:** the `unblock_app` role can `CREATE TABLE` / `INSERT` /
`DROP TABLE` in `unblock_ai_auth`, and `gen_random_uuid()` resolves natively — confirming
the Data Model section's claim that no `pgcrypto` extension is required.

### Things worth knowing

- **The app connects as `unblock_app`, never as `postgres`.** If a migration ever fails on
  permissions, the fix is a `GRANT` to `unblock_app` — not switching the connection string
  to the superuser.
- **EDB blocks hotlinked downloads.** `winget install PostgreSQL.PostgreSQL.17` fails with
  `403 Forbidden` because winget's downloader sends no `Referer` header. If you ever need to
  reinstall, download the installer through a browser, or fetch it with an explicit
  `Referer: https://www.enterprisedb.com/`. This is not a fault on your network.
  **pgAdmin is unaffected** — it ships from `ftp.postgresql.org`, not EDB, so
  `winget install PostgreSQL.pgAdmin` works normally.
- **The superuser password is not stored in the repo.** It was shown once in the terminal at
  setup. If lost, reset it as a Windows administrator via a local trust connection — the
  application never needs it.
- **Uninstall**, if ever required:
  `C:\Program Files\PostgreSQL\17\uninstall-postgresql.exe`. That removes the data
  directory as well.
