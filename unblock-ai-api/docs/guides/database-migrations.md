# Database Migrations

Both databases are versioned by migrations. Postgres and MongoDB are migrated **independently**. Each has its own migration files, its own tracking table or collection, its own lock, and its own npm commands. Both run on one shared engine.

The server never changes the schema at boot. Run migrations as a separate step before you start or deploy the app.

## Layout

```
src/db/migration/
├─ core/                                  shared engine, database-agnostic
│  ├─ migration.runner.ts                 up / down / reset / status / unlock
│  ├─ migration.loader.ts                 discovers and imports migration files
│  ├─ migration.generator.ts              scaffolds new migration files
│  ├─ migration.engine.ts                 wires a store + directory + template into an engine
│  └─ migration.cli.ts                    argument parsing and console output
├─ postgres/
│  ├─ postgres.migration-store.ts         tracking table, lock row, transactional apply/revert
│  ├─ postgres.migration-template.ts
│  ├─ postgres.migration-engine.ts
│  └─ migrations/
│     ├─ 20261111000000_initial-schema.migration.ts
│     └─ 20261111015501_unified-users-permissions-and-sessions.migration.ts
└─ mongo/
   ├─ mongo.migration-store.ts            tracking collection, lock document
   ├─ mongo.migration-template.ts
   ├─ mongo.migration-engine.ts
   └─ migrations/
      └─ 20261111000000_initial-schema.migration.ts

scripts/db/
├─ migrate-postgres.script.ts             CLI entry point for Postgres
└─ migrate-mongo.script.ts                CLI entry point for MongoDB
```

Supporting pieces:

- Types live in `src/lib/types/migration/`.
- Constants live in `src/data/constants/migration.constant.ts`.
- Filename helpers live in `src/utils/migration/migration-file.util.ts`, built on the shared `src/utils/shared/timestamped-file-name.util.ts`.
- `MigrationError` lives in `src/errors/migration.error.ts`.

## Commands

| Postgres | MongoDB | What it does |
|---|---|---|
| `npm run migrate:pg:up` | `npm run migrate:mongo:up` | Apply every pending migration as one batch |
| `npm run migrate:pg:down` | `npm run migrate:mongo:down` | Revert the last batch |
| `npm run migrate:pg:reset` | `npm run migrate:mongo:reset` | Revert every applied migration |
| `npm run migrate:pg:status` | `npm run migrate:mongo:status` | List applied, pending and missing migrations |
| `npm run migrate:pg:create -- <name>` | `npm run migrate:mongo:create -- <name>` | Scaffold a new migration file |
| `npm run migrate:pg:unlock` | `npm run migrate:mongo:unlock` | Release a lock left behind by an interrupted run |

Two convenience commands cover both databases: `npm run migrate:up` and `npm run migrate:status`.

`up` and `down` both accept `--step <n>`:

```bash
npm run migrate:pg:up -- --step 1
```

```bash
npm run migrate:mongo:down -- --step 2
```

- `up --step n` applies only the next *n* pending migrations.
- `down --step n` reverts the last *n* applied migrations, even across batches.

## Fresh database setup

```bash
npm run migrate:up
```

```bash
npm run seed:pg:run
```

Seeding is a separate pack with its own commands; see [database-seeding.md](./database-seeding.md).

## Writing a migration

```bash
npm run migrate:pg:create -- add task priority
```

This creates `src/db/migration/postgres/migrations/<yyyyMMddHHmmss>_add-task-priority.migration.ts`. Fill in `up` and `down`:

```ts
import type { PostgresMigration } from "../../../../lib/types/migration/index.type.js";

const migration: PostgresMigration = {
  async up({ client }) {
    await client.query(`ALTER TABLE template_deletions ADD COLUMN priority INTEGER`);
  },

  async down({ client }) {
    await client.query(`ALTER TABLE template_deletions DROP COLUMN priority`);
  },
};

export default migration;
```

A Mongo migration receives `{ db }`, which is the connected `Db`:

```ts
import type { MongoMigration } from "../../../../lib/types/migration/index.type.js";

const migration: MongoMigration = {
  async up({ db }) {
    await db.collection("tasks").createIndex({ priority: 1 }, { name: "task_priority" });
  },

  async down({ db }) {
    await db.collection("tasks").dropIndex("task_priority");
  },
};

export default migration;
```

Rules:

- **Never edit a migration that has been applied anywhere shared.** Add a new one instead.
- Keep migrations self-contained. Use literal table, collection and index names, not app constants, so history stays reproducible after the code moves on.
- Every `up` needs a `down` that exactly reverses it.

## How it behaves

- **Tracking.** Postgres records each applied migration in the `migrations` table, and Mongo in the `migrations` collection. Each record holds the name, the batch number and the time it was applied. One `up` run is one batch, and `down` reverts the most recent batch.
- **Atomicity.** Each Postgres migration and its tracking row run in a single transaction, so a failure rolls back both. Mongo index and collection operations cannot be transactional. If a Mongo migration fails partway, it is not recorded, so its `up` should tolerate a re-run, or you should fix the database by hand.
- **Locking.** A run holds a lock: the single `migrations_lock` row in Postgres, or the `migrations_lock` document in Mongo. A second concurrent run is refused. The Postgres lock is a row rather than an advisory lock, so it works through Supabase's transaction pooler. If a run is killed, clear the leftover lock with the `unlock` command.
- **Missing files.** `status` flags applied migrations whose file no longer exists as `missing`. `down` refuses to revert them.
- **Build output.** Migrations are TypeScript and compile into `dist/` with the rest of the code. The loader picks `.ts` or `.js` to match whatever runtime it is running under.
- **Atlas vector index.** It is not part of the initial migration, because every environment currently runs `VECTOR_BACKEND=memory`. When switching to `atlas`, add a Mongo migration that calls `db.collection("templates").createSearchIndex(...)` on `retrieval.embedding`.

## Postgres schema

| Migration | What it does |
|---|---|
| `20261111000000_initial-schema` | Creates the first user tables and `template_deletions` |
| `20261111015501_unified-users-permissions-and-sessions` | Replaces the first user tables with `permissions`, `users`, `user_permissions` and `user_sessions`, and points `template_deletions` at `users` |

After both migrations the Postgres schema is:

- `permissions` — the permission catalogue (`workflow:manage`, `task:create`, `task:approve`, `user:manage`), inserted by the migration as reference data.
- `users` — one row per person who can sign in. `email` is stored lower-cased and is unique; `status` is `active` or `disabled`.
- `user_permissions` — which permissions each user holds. A deferred constraint trigger (`enforce_user_has_permission`) rejects, at commit, any transaction that leaves a user with no permission.
- `user_sessions` — one row per signed-in session. Only the SHA-256 hash of the session token is stored; `revoked_at` and `revocation_reason` record sign-outs.
- `template_deletions` — the template deletion log, attributed through `deleted_by_user_id` and `deleted_by_email`.

MongoDB holds no user data; `tasks.created_by` stores the creating user's id as a string.
