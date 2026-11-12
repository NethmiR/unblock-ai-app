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
│     ├─ 20261111015501_unified-users-permissions-and-sessions.migration.ts
│     ├─ 20261111060534_organisational-structure-and-user-affiliations.migration.ts
│     ├─ 20261111101054_workflow-template-archive-only.migration.ts
│     └─ 20261111110611_department-faculty-membership-rule.migration.ts
└─ mongo/
   ├─ mongo.migration-store.ts            tracking collection, lock document
   ├─ mongo.migration-template.ts
   ├─ mongo.migration-engine.ts
   └─ migrations/
      ├─ 20261111000000_initial-schema.migration.ts
      └─ 20261111101053_workflow-templates.migration.ts

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
npm run migrate:pg:create -- add user phone
```

This creates `src/db/migration/postgres/migrations/<yyyyMMddHHmmss>_add-user-phone.migration.ts`. Fill in `up` and `down`:

```ts
import type { PostgresMigration } from "../../../../lib/types/migration/index.type.js";

const migration: PostgresMigration = {
  async up({ client }) {
    await client.query(`ALTER TABLE users ADD COLUMN phone TEXT`);
  },

  async down({ client }) {
    await client.query(`ALTER TABLE users DROP COLUMN phone`);
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
- **Atlas vector index.** No migration creates it, because every environment currently runs `VECTOR_BACKEND=memory`. When switching to `atlas`, add a Mongo migration that calls `db.collection("workflow_templates").createSearchIndex(...)`, or create it in the Atlas UI. Name it after `ATLAS_VECTOR_INDEX` (default `template_vector_index`) and give it the vector path and the two filter fields that `WorkflowTemplateModel.vectorSearch` uses (`src/models/workflow-template.model.ts`):

  ```json
  {
    "fields": [
      { "type": "vector", "path": "retrieval.embedding", "numDimensions": 1536, "similarity": "cosine" },
      { "type": "filter", "path": "status" },
      { "type": "filter", "path": "retrieval.institution_type" }
    ]
  }
  ```

  `numDimensions` must equal `EMBEDDING_DIMENSIONS`. `archived_at` is not an index field; it is applied by a `$match` after the vector search.

## Postgres schema

| Migration | What it does |
|---|---|
| `20261111000000_initial-schema` | Creates the first user tables and `template_deletions` |
| `20261111015501_unified-users-permissions-and-sessions` | Replaces the first user tables with `permissions`, `users`, `user_permissions` and `user_sessions`, and points `template_deletions` at `users` |
| `20261111060534_organisational-structure-and-user-affiliations` | Adds the `organisation:manage` permission (granted to every existing `user:manage` holder) and the organisational structure tables below |
| `20261111101054_workflow-template-archive-only` | Drops `template_deletions` (templates are archived, never deleted) and rewords the `workflow:manage` permission description. `down` recreates the table empty |
| `20261111110611_department-faculty-membership-rule` | Adds the deferred constraint trigger `enforce_department_member_in_faculty`: a department member must also be a member of that department's faculty |

After these migrations the Postgres schema is:

- `permissions` — the permission catalogue (`workflow:manage`, `task:create`, `task:approve`, `user:manage`, `organisation:manage`), inserted by migrations as reference data.
- `organisational_units` — faculties, departments and divisions in one table, keyed by an immutable unique `code`. A composite foreign key `(parent_id, parent_unit_type)` plus a `CHECK` enforce the hierarchy: departments under a faculty, divisions under a faculty or none, faculties at the top.
- `designations` and `designation_unit_types` — the designation catalogue and the unit types each designation can be held in. A deferred constraint trigger (`enforce_designation_has_unit_type`) keeps at least one unit type per designation.
- `user_organisational_units` — memberships. A deferred constraint trigger (`enforce_department_member_in_faculty`) rejects, at commit, any transaction that leaves a department member outside that department's faculty — on adding a membership, removing a faculty membership, or moving a department to another faculty.
- `user_designations` — designations held within a membership. Composite foreign keys guarantee the user is a member of the unit and the designation applies to its type; a partial unique index allows one holder per unit for `single_holder_per_unit` designations.
- `users` — one row per person who can sign in. `email` is stored lower-cased and is unique; `status` is `active` or `disabled`.
- `user_permissions` — which permissions each user holds. A deferred constraint trigger (`enforce_user_has_permission`) rejects, at commit, any transaction that leaves a user with no permission.
- `user_sessions` — one row per signed-in session. Only the SHA-256 hash of the session token is stored; `revoked_at` and `revocation_reason` record sign-outs.
MongoDB holds no user data; `tasks.created_by` and `workflow_templates.created_by` / `updated_by` store user ids as strings.

## MongoDB schema

| Migration | What it does |
|---|---|
| `20261111000000_initial-schema` | Creates `drafts`, `templates`, `selection_sessions`, `tasks`, `counters` and `audit_logs` with their indexes |
| `20261111101053_workflow-templates` | Drops `templates` and `drafts`, creates `workflow_templates` and `workflow_template_versions`, and replaces the `tasks` index on `workflow_id` with one on `workflow_template_id` |

> **`20261111101053_workflow-templates` does not migrate data.** It drops the `templates` and `drafts` collections outright; nothing is copied into the new collections. Existing tasks and selection sessions keep their old `workflow_id` / `version` / `selected_workflow_id` fields, which the code no longer reads, so they stop resolving. Recreate templates through `/api/workflow-templates` after applying it, and treat old tasks and sessions as unusable. `down` recreates `templates` and `drafts` empty; it does not bring their data back.

After these migrations the collections are:

- `workflow_templates` — one document per template, keyed by a string UUID `_id`: `title`, `description`, `status` (`draft` \| `unpublished` \| `published`), `draft_prompt`, `current_version`, `archived_at`, `created_by`, `updated_by`, timestamps, and `retrieval` — the current version's embedded text, vector, aliases, `retrieval_summary` and `institution_type`. Indexes: `workflow_template_archived_updated` (`archived_at`, `updated_at`) and `workflow_template_retrieval_filter` (`status`, `archived_at`, `retrieval.institution_type`).
- `workflow_template_versions` — one immutable document per generated version: `workflow_template_id`, `version`, `prompt`, `definition`, `generation_attempts`, `created_by`, `created_at`. Unique index `workflow_template_version_unique` on (`workflow_template_id`, `version`).
- `selection_sessions`, `tasks`, `counters` and `audit_logs` — as created by the initial schema; `tasks` is indexed on (`workflow_template_id`, `status`) as `task_workflow_template_status`.
