# UNBLOCK-AI — Project Overview

> Generated from a read-through of the codebase after the TypeScript restructure. For the original design rationale and full requirements analysis, see [../plans/original-implementation-plan.md](../plans/original-implementation-plan.md).

## 1. What this project does

UNBLOCK-AI turns a **plain-English description of an institutional approval workflow** (e.g. "students who want to travel overseas must get approval from their advisor, then the Head of Department...") into a **strict, machine-readable JSON workflow definition**, then runs it for requesters: an assistant picks the right published template from the requester's request and profile, a task plan is compiled with approvers resolved from the directory and details prefilled, the requester fills step forms, approvers decide in their in-app approvals inbox or through emailed links, and a transcript PDF closes the request.

```
Admin writes a title + prompt
        │
        ▼
  Workflow template generation   ──►  Schema + Graph Validation
  (LLM adapter)                               │
        │  (on failure, feed errors back)     │ pass
        ▼                                     ▼
   Repair loop (up to N attempts)      MongoDB (workflow template + immutable
                                               version + retrieval embedding)
                                               │ admin publishes
                                               ▼
                                     Selection (profile + retrieval +
                                     eligibility + one selector call)
                                               │ requester starts the task
                                               ▼
                                     Task plan compiler (no AI): steps,
                                     forms, directory-resolved approvers
                                               │
                                               ▼
                                     Task engine (pure) + effect executor:
                                     forms → approvals (inbox or emailed
                                     link) → decisions
                                     (approve / reject / more information)
                                               │ completed
                                               ▼
                                     Transcript PDF (rendered on demand)
```

Only two operations call an LLM: workflow template generation (per admin generate) and workflow selection (per requester message). Everything after a task starts is deterministic.

## 2. Tech stack

- **Runtime**: Node.js 20+, ES modules (`"type": "module"` in [package.json](../../package.json)), compiled with TypeScript (`strict: true`)
- **Web framework**: Express 5 ([src/app.ts](../../src/app.ts), [src/server.ts](../../src/server.ts))
- **LLM and embedding providers**: pluggable via the adapter pattern. Services depend only on `ILlmAdapter` ([src/services/llm-adapter/](../../src/services/llm-adapter/)) and `IEmbeddingAdapter` ([src/services/embedding-adapter/](../../src/services/embedding-adapter/)); `LLM_PROVIDER` and `EMBEDDING_PROVIDER` independently select Azure OpenAI (official `openai` SDK) or Google AI Studio Gemini (official `@google/genai` SDK); `EMBEDDING_PROVIDER` can also select Voyage AI (REST API via native `fetch`, embedding-only)
- **Schema validation**: AJV (2020-12 dialect) + `ajv-formats` ([src/utils/workflow/schema-validator.util.ts](../../src/utils/workflow/schema-validator.util.ts))
- **Persistence**: MongoDB via the official `mongodb` driver ([src/db/mongo.client.ts](../../src/db/mongo.client.ts), [src/models/](../../src/models/)) for workflow templates, template versions, selection sessions and tasks, **plus PostgreSQL** via `pg` ([src/db/postgres.client.ts](../../src/db/postgres.client.ts)) for users, permissions, sessions and the organisational structure — see §8.1
- **Auth**: email + password login, opaque server-side session tokens (SHA-256 hash stored in Postgres) and permission-based route guards (`node:crypto` scrypt for password hashing, no `bcrypt`/`argon2` dependency) — see §8.1
- **Testing**: Node's built-in `node:test` runner, executed via `tsx` — split into `tests/unit/`, `tests/integration/`, and `tests/live/` (calls the configured live AI provider)
- **Config**: `dotenv`, loaded and validated once at startup ([src/config/env.config.ts](../../src/config/env.config.ts))

## 3. Directory structure

See [folder-structure.md](./folder-structure.md) for the complete target tree and per-folder responsibilities. Summary:

```
unblock-ai-api/
├─ src/
│  ├─ app.ts                # builds and returns the Express app; no listen()
│  ├─ server.ts             # entry point: config load, DI wiring, listen, shutdown
│  ├─ routes/                # one file per route group; no business logic
│  ├─ controllers/           # parses/validates HTTP, calls services, maps to responses
│  ├─ services/               # all business logic, DB access via models/repositories, external calls
│  ├─ repositories/           # Postgres data access: users, sessions, organisation (postgres + in-memory)
│  ├─ models/                 # one model per MongoDB collection
│  ├─ config/                 # typed config modules; only place that reads process.env
│  ├─ middlewares/            # cors, json-body, request-id, logging, error handling, auth
│  ├─ utils/                  # pure helpers (shared, workflow, workflow-template, retrieval, http, auth, ...)
│  ├─ data/                   # prompts, JSON Schemas, vocabulary, constants, samples
│  ├─ lib/types/              # central TypeScript type directory
│  ├─ errors/                 # BaseError + one subclass per error category
│  └─ db/                     # Mongo + Postgres clients, migration engine + per-database migrations, Postgres seed pack
├─ scripts/                   # CLI scripts: db/ (migrate-postgres, migrate-mongo, seed-postgres), copy-assets
├─ tests/                      # unit/, integration/, live/, helpers/, smoke/, evaluation/, perf/
├─ docs/                        # api/, architecture/, guides/, plans/, postman/
├─ dist/                        # build output, git-ignored
├─ .env / .example.env           # server configuration
├─ tsconfig.json
└─ package.json
```

## 4. Configuration ([src/config/](../../src/config/))

See [../guides/configuration.md](../guides/configuration.md) for the full table of every environment variable, its default, whether it is required, and which config module owns it.

## 5. The workflow schema — the core design artifact

[src/data/schemas/workflow.schema.json](../../src/data/schemas/workflow.schema.json) is a strict JSON Schema (draft 2020-12, `additionalProperties: false` everywhere) that models a workflow as a **dependency graph**, not a linear list. Top-level shape:

```
schema_version, title, description, retrieval_summary,
scope, requester, inputs, computed, steps, completion, metadata
```

Key modeling decisions (also encoded as instructions in the workflow template generation system prompt):

- **`steps` is a graph.** Each step has `depends_on: [{ step_id, required_outcome }]`. Sequencing, parallelism, and dependency-gating all fall out of this one mechanism rather than being separate concepts.
- **Actors are never named people.** Every `assignee` / `collected_from` / notification target is an "actor" object with one of four `resolution` modes: `dynamic` (directory lookup relative to another actor, e.g. "the student's advisor"), `static` (a fixed office), `requester` (whoever started the workflow), or `system` (automated). Roles are normalized to `snake_case`; a suggested vocabulary lives in [src/data/vocabulary/role.vocabulary.ts](../../src/data/vocabulary/role.vocabulary.ts) (academic, administrative, financial, facilities, security, IT, generic), but the model can coin new roles, which get flagged in `metadata.unmapped_roles` for admin review rather than treated as an error.
- **Conditions are structured, not prose.** `condition.operator` (`equals`, `greater_than`, `and`/`or`/`not` with `clauses`, etc.) over `left`/`right`, which are dotted namespace paths — never a free-text expression.
- **Computed values use a fixed operation set**: `date_diff_days`, `sum`, `difference`, `multiply`, `count`, `lookup`, `constant` — again, no free-text formulas.
- **A flat data namespace** is shared across a workflow run: `inputs.<id>`, `computed.<id>`, `steps.<id>.outcome`, `steps.<id>.response.<field>`, `requester.<attr>`, `system.today`.
- **Loop-backs stay acyclic.** "Request more info" is modeled as an *outcome* on the same step, not a new step pointing backward — keeping the dependency graph a DAG. At runtime the task engine inserts an information request step and a repeat approval into the task's own step list.
- **Terminal rejection** is an outcome effect (`action: "terminate_workflow"`) rather than a special workflow-level field.
- **Every outcome-bearing step has exactly three fixed outcome keys**: `approved`, `rejected`, `request_more_info` (nullable when not applicable).
- **Non-workflow input is a first-class outcome**, not an error: if the source text describes no institutional process at all, the prompt instructs the model to emit the smallest valid document (one `review` step, `system`-resolved, `metadata.is_workflow: false`) rather than hallucinating a workflow.
- **Strict-mode discipline**: every schema property must be present in the output; unused scalars are `null` (never omitted), unused arrays are `[]` (never `null`/omitted). This is required because the generation call uses OpenAI's `strict: true` structured-output mode, which needs a fully-closed schema.
- **`metadata`** carries the model's self-assessment: `confidence` (`high`/`medium`/`low`), `ambiguities` (plain-English notes on assumptions the model had to make), `unmapped_roles`, and `is_workflow` (`false` when the prompt describes no process). Provenance (who generated it, when, how many attempts, from which prompt) lives on the stored template version, not in the definition.
- **`retrieval_summary`** (one-liner, aliases, keywords, requester types, ...) is generated in the same call as the rest of the definition and is the text that gets embedded for retrieval.
- **No id or title inside a stored definition.** The template's UUID and its title live on the `workflow_templates` document; each stored version's `definition` omits `title`, and the title is merged back in when a definition is served to the runtime.

## 6. Workflow template generation pipeline ([src/services/workflow-template-generation.service.ts](../../src/services/workflow-template-generation.service.ts))

1. **Prompt assembly** ([src/data/prompts/workflow-template-generation.prompt.ts](../../src/data/prompts/workflow-template-generation.prompt.ts), built by [src/utils/workflow/build-workflow-template-generation-messages.util.ts](../../src/utils/workflow/build-workflow-template-generation-messages.util.ts)): a detailed system prompt encodes all the schema semantics above (graph vs. list, actor resolution, namespace paths, ambiguity handling, rejection-of-non-workflow-input rules), followed by two **few-shot examples** loaded from [src/data/samples/input/](../../src/data/samples/input/) + [src/data/samples/expected/](../../src/data/samples/expected/) ([src/data/prompts/workflow-template-generation-few-shot.prompt.ts](../../src/data/prompts/workflow-template-generation-few-shot.prompt.ts)), followed by the admin's prompt.
2. **Structured-output call**: calls the configured `ILlmAdapter` with `workflowResponseSchema`, forcing the model to emit schema-conformant JSON. Each adapter maps this onto its provider's native structured output (Azure OpenAI strict `json_schema`; Gemini `responseJsonSchema`) and applies its own sampling rules: the Azure adapter pins `temperature: 0` unless the deployment is a reasoning model (`o*`/`gpt-5*`); the Gemini adapter keeps the provider default, as Google recommends for Gemini 3.x.
3. **Two-layer validation** on every candidate (schema validation + graph validation via [src/services/validation.service.ts](../../src/services/validation.service.ts)):
   - **Schema validation** ([src/utils/workflow/schema-validator.util.ts](../../src/utils/workflow/schema-validator.util.ts)): AJV structural check against `workflow.schema.json`.
   - **Graph validation** ([src/utils/workflow/graph-validator.util.ts](../../src/utils/workflow/graph-validator.util.ts)): semantic checks the JSON Schema can't express —
     - `checkDependencyReferences` — `depends_on` points at a real step
     - `checkRequiredOutcomes` — the referenced outcome actually exists on the target step
     - `checkNoCycles` — DAG check (white/gray/black DFS)
     - `checkEntryStepExists` — at least one step has empty `depends_on`
     - `checkReachability` — every step is reachable from an entry step (BFS)
     - `checkApprovalOutcomes` — every `approval`-type step defines both `approved` and `rejected`
     - `checkCompletionRequiredSteps` — `completion.required_steps` references real steps
     - `checkNamespacePaths` — every `inputs.*` / `computed.*` / `steps.*` / `requester.*` / `system.*` reference used in conditions, computed arguments, and `context_from_steps` bindings actually resolves to something declared elsewhere in the document
4. **Self-repair loop**: if validation fails and attempts remain, the invalid candidate plus a formatted list of errors is appended to the conversation as assistant/user turns, and the model is asked to return corrected JSON fixing *only* those problems. Default `maxAttempts` comes from `config.workflowTemplateGeneration.maxAttempts` (`WORKFLOW_TEMPLATE_GENERATION_MAX_ATTEMPTS`, default 3). If still invalid after the last attempt, throws `WorkflowTemplateGenerationError` (`422`, code `WORKFLOW_TEMPLATE_GENERATION_FAILED`, `details` = the last validation errors).
5. **Non-workflow guard**: even a schema-valid result is rejected (`422`, code `WORKFLOW_TEMPLATE_PROMPT_REJECTED`, `details` = `metadata.ambiguities`) if `metadata.is_workflow` is `false` — i.e., the model itself flagged the prompt as not describing a workflow.
6. **Result**: the definition minus `title`, plus the model's title and the attempt count. `WorkflowTemplateService` stores it as a new immutable version (see §8).

## 7. Validation as a standalone capability

Schema + graph validation lives in its own service ([src/services/validation.service.ts](../../src/services/validation.service.ts)), separate from generation. There is no endpoint for saving or validating hand-edited workflow JSON: a definition only changes by generating a new version from a prompt, and every generated version passes validation before it is stored.

## 8. Persistence layer (MongoDB)

- **`src/models/workflow-template.model.ts`** — the `workflow_templates` collection, one document per template (string UUID `_id`): `title`, `description`, `status` (`draft` → `unpublished` → `published`), `current_version`, `draft_prompt` (a saved but not yet generated prompt), `retrieval` (the current version's embedding text, `embedding`, `aliases_lower`, `retrieval_summary`, `institution_type`, embedding `model`/`dim`/`embedded_at`), `archived_at`, `created_by`/`updated_by` (Postgres user ids) and timestamps. It also runs the retrieval queries (published, non-archived only) and the Atlas `$vectorSearch`.
- **`src/models/workflow-template-version.model.ts`** — the `workflow_template_versions` collection: one immutable document per generated version (`workflow_template_id`, `version`, `prompt`, `definition`, `generation_attempts`, `created_by`, `created_at`). Tasks pin `workflow_template_id` + `workflow_template_version`, so older versions stay readable after a regenerate.
- **`src/models/selection-session.model.ts`** — the `selection_sessions` collection: ephemeral assistant conversations, owned by `created_by` and removed by a TTL index on `expires_at` (`SELECTION_SESSION_TTL_HOURS`). The candidate set is frozen on the first retrieval. Starting a task copies the messages into the task and deletes the session.
- **`src/models/task.model.ts`** — the `tasks` collection: one document per task with the requester snapshot, conversation, ordered `steps` (including inserted information requests and repeat approvals), stored `forms`, a `values` map keyed by field id, and an `audit` trail. Every write is `findOneAndReplace({ _id, revision })`, so a lost race is `409 TASK_REVISION_CONFLICT`. Approval tokens are stored only as `steps.approval.token_hash`. Pre-revamp tasks live in `legacy_tasks` and are never read.
- Models own the collection name, the document interface, and thin typed CRUD operations. Lifecycle policy (version numbering, status transitions, archive/restore) and the embedding call live in [src/services/workflow-template.service.ts](../../src/services/workflow-template.service.ts) and [src/services/embedding.service.ts](../../src/services/embedding.service.ts), not in the model. The retrieval embedding is rebuilt whenever a version is generated and whenever the title changes; a title change never creates a version.

### 8.1 A second database: PostgreSQL for users, sessions and the organisation

Users and their permissions (`users`, `permissions`, `user_permissions`),
server-side sessions (`user_sessions`) and the organisational structure
(organisational units, designations, user affiliations) live in **PostgreSQL**, not Mongo — deliberately making
this a **polyglot-persistence** service rather than pushing everything into
one store. The reasoning, and the consequences it forces:

- **Why a second database at all.** User data is relational: a hard
  uniqueness constraint (`lower(email)`), a permission catalogue joined to
  users by foreign keys, a deferred constraint trigger that rejects any
  transaction leaving a user with no permissions. None of that is natural to
  express against a schemaless Mongo collection.
- **No cross-database references are enforced.** Mongo documents store
  Postgres user ids as plain strings (`workflow_templates.created_by` /
  `updated_by`, `workflow_template_versions.created_by`); the API resolves
  them to names at read time and returns `null` for an id it cannot find.
  Workflow templates are archived, never deleted, so no write spans both stores.
- **Two connection lifecycles.** [src/db/postgres.client.ts](../../src/db/postgres.client.ts)
  mirrors [src/db/mongo.client.ts](../../src/db/mongo.client.ts): a lazily-created pool
  (the process starts even if Postgres is down) with its own `closePool()`,
  invoked alongside `closeDb()` in `server.ts`'s shutdown handler.
- **Both databases are versioned by migrations** — [src/db/migration/](../../src/db/migration/)
  holds one shared engine plus independent Postgres and MongoDB migration sets,
  each tracked in its own `migrations` table/collection with up/down support
  (see [../guides/database-migrations.md](../guides/database-migrations.md)).
  `npm run migrate:up` applies them. The Postgres set is
  `20261111000000_initial-schema`,
  `20261111015501_unified-users-permissions-and-sessions`,
  `20261111060534_organisational-structure-and-user-affiliations`,
  `20261111101054_workflow-template-archive-only` (drops `template_deletions`) and
  `20261111110611_department-faculty-membership-rule`.
  The Mongo set is `20261111000000_initial-schema`,
  `20261111101053_workflow-templates`,
  `20261113084701_ephemeral-selection-sessions` (recreates `selection_sessions` with
  TTL and owner indexes) and `20261113090856_task-request-revamp` (renames `tasks` to
  `legacy_tasks` and creates a fresh `tasks` collection).
- **A seed pack mirrors the migration pack** — [src/db/seed/](../../src/db/seed/)
  holds a core runner/loader/generator/CLI plus timestamped Postgres seeders in
  [src/db/seed/postgres/seeders/](../../src/db/seed/postgres/seeders/). Seeders are
  idempotent and untracked (every run re-checks and skips what exists) and go
  through services such as `UserService`, so business rules apply. They create the
  bootstrap administrator (`SEED_ADMINISTRATOR_EMAIL`, `SEED_ADMINISTRATOR_FULL_NAME`,
  password `USER_DEFAULT_PASSWORD`, every permission), the University of Moratuwa
  organisational units and designations, and, with `SEED_SAMPLE_USERS=true`, sample users
  with affiliations (including the task request demo users). `npm run seed:pg:run` runs them, `seed:pg:list` lists them and
  `seed:pg:create -- <name>` scaffolds a new one (see
  [../guides/database-seeding.md](../guides/database-seeding.md)).
- **Data access is behind repositories** in [src/repositories/](../../src/repositories/) —
  `user-repository/`, `user-session-repository/`, `organisational-unit-repository/`,
  `designation-repository/` and `user-affiliation-repository/`,
  each with an interface, a `postgres` and an `in-memory` implementation and an
  `index` factory — the same pattern already used for `IVectorStore` and `IMailer`.
  `POSTGRES_REPOSITORY_BACKEND` selects the backend for all of them; `memory` is what
  lets `npm test` run with no live Postgres at all, the way `mongodb-memory-server`
  already does for Mongo.
- **Passwords are hashed with `node:crypto`'s scrypt** ([src/utils/shared/password.util.ts](../../src/utils/shared/password.util.ts)),
  not `bcrypt`/`argon2` — both need a native build toolchain (painful on
  Windows), while scrypt is a memory-hard KDF already in the stdlib.
- **Sessions are opaque and stored server-side** in `user_sessions`
  ([src/services/user-session.service.ts](../../src/services/user-session.service.ts),
  [src/utils/auth/user-session-token.util.ts](../../src/utils/auth/user-session-token.util.ts)).
  Login returns a random 256-bit token (base64url); only its SHA-256 hash is
  stored. Expiry is absolute (`SESSION_TTL_HOURS`, no sliding renewal), a user can
  hold any number of concurrent sessions, logout revokes the current session
  immediately, and a user can list their own sessions and revoke one or all others.
  Only the `User-Agent` is recorded, no IP address.
- **Login is by email** ([src/services/authentication.service.ts](../../src/services/authentication.service.ts)).
  Failed attempts are counted per account; when `AUTH_MAX_FAILED_ATTEMPTS > 0` an
  account is locked for `AUTH_LOCKOUT_DURATION_MINUTES` and rejected even with the
  correct password. Users are created by `user:manage` holders through
  `POST /api/users` ([src/services/user.service.ts](../../src/services/user.service.ts))
  with the initial password `USER_DEFAULT_PASSWORD`.
- **Permissions, not roles.** Each user holds one or more of `workflow:manage`,
  `task:create`, `task:approve` and `user:manage`
  ([src/data/constants/permission.constant.ts](../../src/data/constants/permission.constant.ts)).
  `task:approve` gates the signed-in approver routes (`/api/approver/*`). Emailed approval
  links stay token-based and need no session.

## 9. HTTP API

All routes are mounted under `/api` (see [src/routes/index.route.ts](../../src/routes/index.route.ts) and [src/app.ts](../../src/app.ts)). See [../api/api-documentation.md](../api/api-documentation.md) for the full endpoint reference, request/response bodies, and error shapes.

**Auth**: [src/middlewares/authenticate.middleware.ts](../../src/middlewares/authenticate.middleware.ts)
reads the Bearer session token, resolves it through `AuthenticationService` and
populates `req.auth` on every request but never rejects by itself.
[src/middlewares/require-authentication.middleware.ts](../../src/middlewares/require-authentication.middleware.ts)
(`requireAuthentication()`, `401`) and
[src/middlewares/require-permission.middleware.ts](../../src/middlewares/require-permission.middleware.ts)
(`requireAnyPermission(...)`, `403` when the user holds none of the listed
permissions) do the actual gating, applied per-route:
`workflow:manage` for creating, generating, editing, publishing, archiving and
restoring workflow templates; `workflow:manage` or `task:create` for reading
workflow templates and their versions; `task:create` for
`/selection` and `/tasks` (selection sessions are also owner-checked inside
`SelectionService`); `task:approve` for `/approver/*` (assignment is checked inside
`ApprovalService`); `user:manage` for `/users`.
[src/middlewares/require-task-ownership.middleware.ts](../../src/middlewares/require-task-ownership.middleware.ts)
limits `/tasks/:id*` to the task's creator and answers `404` for anyone else's task. The split matters because `/api/approvals/*` is authenticated by a
*different* mechanism (a per-step approval token) and must keep working for
an approver with no session at all — so authentication and authorization are
deliberately two separate middleware layers, not one.

**Error handling**: a single error-handling middleware ([src/middlewares/error-handler.middleware.ts](../../src/middlewares/error-handler.middleware.ts)) reads `statusCode` and `toJSON()` off any `BaseError` subclass and responds accordingly; anything else is logged with its stack and answered with a generic `500`. See [error-handling.md](./error-handling.md) for the full hierarchy. All route handlers are wrapped in [src/middlewares/async-handler.middleware.ts](../../src/middlewares/async-handler.middleware.ts) so rejected promises reach this middleware instead of crashing the process.

## 10. Task requests: plan, engine, approvals and transcript

See [../../../docs/task-request-revamp-phase-plan.md](../../../docs/task-request-revamp-phase-plan.md) for the
full design. Summary of what exists in code:

- **Requester profile** ([src/services/requester-profile.service.ts](../../src/services/requester-profile.service.ts)) —
  memberships, designations, effective faculties, derived actor types and numbered profile
  facts, read from the Postgres repositories. No AI.
- **Selection** ([src/services/selection.service.ts](../../src/services/selection.service.ts),
  [src/utils/selection/candidate-eligibility.util.ts](../../src/utils/selection/candidate-eligibility.util.ts)) —
  retrieval once, deterministic audience and requester-type eligibility, then one selector call
  that sees the profile facts. `GET /selection/catalogue` lists eligible templates with no AI.
- **Plan compiler** ([src/utils/task/task-plan-compiler.util.ts](../../src/utils/task/task-plan-compiler.util.ts), pure) —
  steps in display order, one form per form step plus a synthesised entry form, locked
  prefilled requester details, approver details when the directory cannot supply them.
  Assignees come from the resolver registry in [src/services/assignee-resolution/](../../src/services/assignee-resolution/).
- **Engine** ([src/services/task-engine.service.ts](../../src/services/task-engine.service.ts), pure) —
  activation by step kind, condition evaluation, approvals, information request insertion
  ([src/utils/task/information-request-insertion.util.ts](../../src/utils/task/information-request-insertion.util.ts)),
  termination and completion; returns `TaskEffect[]`. The
  [effect executor](../../src/services/task-effect-executor.service.ts) issues hashed approval
  tokens and sends notifications after a successful write, and never throws into the caller.
- **Approvals** ([src/services/approval.service.ts](../../src/services/approval.service.ts)) —
  two channels over one shared core. `resolveToken` (emailed link: invalid 404, expired 410,
  decided 409) and `resolveAssignment` (signed-in approver: not assigned or own task 404,
  link state ignored) each build an `ApprovalContext`. One private `buildView` and one
  private `applyDecision` hold the comment rules, the allowed-decisions check and the commit,
  so both channels behave the same. Each decision records an `ApprovalActor`
  (`decided_via: email_link | app`, `decided_by_user_id`).
- **Approver inbox** ([src/services/approver-assignment.service.ts](../../src/services/approver-assignment.service.ts),
  [src/utils/approval/approver-identity.util.ts](../../src/utils/approval/approver-identity.util.ts)) —
  lists the caller's pending and decided approval steps and counts the pending ones. A step
  belongs to the caller when `assignee.user_id` matches their id or `assignee.email` matches
  their normalised account email. The rule lives only in `approver-identity.util.ts`, which
  also builds the Mongo `$elemMatch` clause. `TaskModel.findApprovalAssignmentPage` runs one
  aggregation (`$match` → `$unwind: "$steps"` → `$match` → `$sort` → `$facet`) that returns
  one row per (task, approval step), with the caller's own tasks excluded.
- **Transcript** ([src/services/task-transcript.service.ts](../../src/services/task-transcript.service.ts),
  [src/utils/document/task-transcript.util.ts](../../src/utils/document/task-transcript.util.ts)) —
  built from the task and its pinned definition and rendered by the pluggable
  [document renderer](../../src/services/document/) (`pdfkit`, or text for tests). Never stored:
  `GET /api/tasks/:id/transcript` renders it on demand and the completion email attaches the same
  render (`DOCUMENT_ATTACH_TO_EMAIL`, under `DOCUMENT_MAX_ATTACHMENT_BYTES`). The audit trail records
  `transcript_emailed`.
- **LLM usage logging** — every adapter is wrapped in `UsageLoggingLlmAdapter`, which logs one
  `llm completion usage` line per call with its `LlmOperation`.
- **Smoke test**: `npm run smoke-test:document` renders a transcript to a local file.

## 11. Supporting pieces

- **Logger** ([src/utils/shared/logger.util.ts](../../src/utils/shared/logger.util.ts)): structured JSON logger (`debug`/`info`/`warn`/`error`) writing single-line JSON to stdout/stderr with timestamps.
- **Smoke test scripts** ([tests/smoke/smoke-test-llm.script.ts](../../tests/smoke/smoke-test-llm.script.ts), [tests/smoke/smoke-test-embeddings.script.ts](../../tests/smoke/smoke-test-embeddings.script.ts), [tests/smoke/smoke-test-document.script.ts](../../tests/smoke/smoke-test-document.script.ts), [tests/smoke/smoke-test-mail.script.ts](../../tests/smoke/smoke-test-mail.script.ts)): sanity-check connectivity of the configured LLM and embedding providers, transcript rendering, and mail delivery, each independent of the paths that normally trigger them.

## 12. Test suite

Three tiers, matching the test scripts in [package.json](../../package.json):

- **`npm test`** → `tests/unit/**/*.test.ts` + `tests/integration/**/*.test.ts` (fast, no live network):
  - `tests/unit/utils/` — schema validation, graph validation (fixtures pass; mutation tests confirm each failure mode is caught), alias boost, render-summary, request-validator, workflow-template serializer, vector-math.
  - `tests/unit/services/` — workflow-template, retrieval, selection, selector, vector-store services against fakes.
  - `tests/unit/errors/` — `BaseError` contract.
  - `tests/integration/` — full HTTP-level coverage of workflow-template, selection, task and approval routes, and the error handler, using an in-process Express server.
- **`npm run test:live`** → `tests/live/**/*.test.ts` (slow, calls the configured live AI provider, run manually/CI-gated):
  - `workflow-template-generation-accuracy.live.test.ts` — asserts the model correctly generates *specific* structural details from the two worked examples (right step IDs, correct `depends_on` chains, correct condition operator/operands, correct loop-back/termination outcomes, correct `context_from_steps` bindings).
  - `generalisation.live.test.ts`, `consistency.live.test.ts`, `robustness.live.test.ts`, `selection-quality.live.test.ts` — generation on an unseen fixture, repeatability across repeated calls, behavior on messy/edge-case/non-workflow input, and selector agent quality, respectively.
- Two more manual, non-`node:test` tiers live alongside these: **`npm run evaluate:selection`** (`tests/evaluation/`) prints a recall@5 + decision-accuracy report for the selector agent against `src/data/samples/selection/queries.json`; **`npm run perf-test`** (`tests/perf/`) measures latency/token/cost for a chosen AI operation across configured models, writing timestamped JSON/CSV under its own git-ignored `results/`.

## 13. Sample data (used as both few-shot examples and test gold data)

| File | Institution scenario |
|---|---|
| `it_faculty_overseas_leave` | Student overseas-travel leave request: sequential advisor → HoD → (conditional) Dean approval chain, loop-back for "more info," computed trip-duration-based conditional step, terminal rejection |
| `departmental_event_workshop` | Event organization: parallel hall-booking + speaker-clearance branches, a refreshments step that starts `blocked` pending hall booking's outcome and consumes its `confirmed_capacity` response field via `context_from_steps` |
| `lab_equipment_purchase_request` | Input-only fixture (no expected/gold JSON) — used in `tests/live/` as an unseen example for generalisation/robustness testing |

These live under [src/data/samples/](../../src/data/samples/) (`input/`, `expected/`, `selection/`, `demo-drafts/`). The same two fully-worked fixtures (`it_faculty_overseas_leave`, `departmental_event_workshop`) serve **three roles at once**: few-shot prompt examples, schema/graph validation test fixtures, and live generation-accuracy assertions — meaning any change to the schema or prompt must keep these three consistent.

## 14. What is explicitly out of scope / not yet built

- **No academic advisor directory, file uploads, reminders, SLA escalation or re-issue of expired approval links.** Roles the directory does not model are named by the requester. See §20 of the task request revamp plan.
- **No self-registration, password reset, or password change.** Every user starts with `USER_DEFAULT_PASSWORD` and keeps it. The user API covers create, list and get-by-id only — no update, deactivate or delete yet.
- **Self-approval through the emailed link is not blocked** — the in-app inbox excludes the caller's own tasks, but a requester who names themselves as approver can still decide by link. See §12 of [approver-inbox-phase-plan.md](../../../docs/approver-inbox-phase-plan.md).
- **No rate limiting by IP** — only per-account failed-attempt lockout (§8.1), and that enforcement is off by default (`AUTH_MAX_FAILED_ATTEMPTS=0`).
- **No push updates or delegation for approvers** — the inbox polls every 30 seconds; delegation, out-of-office and bulk decisions are not built.

## 15. Quick reference — how to run it

See [../guides/running-the-app.md](../guides/running-the-app.md) for the full setup guide. Quick version:

```bash
npm install
cp .example.env .env   # then fill in AI provider + MongoDB + PostgreSQL credentials
npm run migrate:up            # apply Postgres + Mongo migrations (tables, collections, indexes)
npm run seed:pg:run           # administrator, organisation, and sample users when SEED_SAMPLE_USERS=true
npm run dev                   # tsx watch, or: npm run build && npm start
npm test                      # fast unit + integration tests (in-memory repositories, no Postgres needed)
npm run test:live             # slow tests that call the configured AI provider (needs valid .env)
```
