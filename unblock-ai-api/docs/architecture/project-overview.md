# UNBLOCK-AI — Project Overview

> Generated from a read-through of the codebase after the TypeScript restructure. For the original design rationale and full requirements analysis, see [../plans/original-implementation-plan.md](../plans/original-implementation-plan.md).

## 1. What this project does

UNBLOCK-AI turns a **plain-English description of an institutional approval workflow** (e.g. "students who want to travel overseas must get approval from their advisor, then the Head of Department...") into a **strict, machine-readable JSON workflow definition** — a reusable template that a (future) execution engine could run: resolving approvers from a directory, evaluating conditions, tracking step completion, sending notifications, etc.

```
Admin pastes plain text
        │
        ▼
  LLM Extraction (LLM adapter)   ──►  Schema + Graph Validation
        │                                     │
        │  (on failure, feed errors back)     │ pass
        ▼                                     ▼
   Repair loop (up to N attempts)      MongoDB (versioned templates + embeddings)
                                               │
                                               ▼
                                     Retrieval + Selector Agent
                                     (maps a user's plain-language
                                      request to a confirmed template)
```

Actually **executing** a workflow (sending real emails, collecting real approvals, walking the graph at runtime) is out of scope — the schema is simply designed so a future execution engine could consume it without redesign.

## 2. Tech stack

- **Runtime**: Node.js 20+, ES modules (`"type": "module"` in [package.json](../../package.json)), compiled with TypeScript (`strict: true`)
- **Web framework**: Express 5 ([src/app.ts](../../src/app.ts), [src/server.ts](../../src/server.ts))
- **LLM and embedding providers**: pluggable via the adapter pattern. Services depend only on `ILlmAdapter` ([src/services/llm-adapter/](../../src/services/llm-adapter/)) and `IEmbeddingAdapter` ([src/services/embedding-adapter/](../../src/services/embedding-adapter/)); `LLM_PROVIDER` and `EMBEDDING_PROVIDER` independently select Azure OpenAI (official `openai` SDK) or Google AI Studio Gemini (official `@google/genai` SDK)
- **Schema validation**: AJV (2020-12 dialect) + `ajv-formats` ([src/utils/workflow/schema-validator.util.ts](../../src/utils/workflow/schema-validator.util.ts))
- **Persistence**: MongoDB via the official `mongodb` driver ([src/db/mongo.client.ts](../../src/db/mongo.client.ts), [src/models/](../../src/models/)) for workflows/drafts/tasks, **plus PostgreSQL** via `pg` ([src/db/postgres.client.ts](../../src/db/postgres.client.ts)) for users, permissions, sessions and the template deletion log — see §8.1
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
│  ├─ repositories/           # Postgres data access: user, user-session, template-deletion (postgres + in-memory)
│  ├─ models/                 # one model per MongoDB collection
│  ├─ config/                 # typed config modules; only place that reads process.env
│  ├─ middlewares/            # cors, json-body, request-id, logging, error handling, auth
│  ├─ utils/                  # pure helpers (shared, workflow, retrieval, http, auth)
│  ├─ data/                   # prompts, JSON Schemas, vocabulary, constants, samples
│  ├─ lib/types/              # central TypeScript type directory
│  ├─ errors/                 # BaseError + one subclass per error category
│  └─ db/                     # Mongo + Postgres clients, migration engine + per-database migrations, Postgres seed pack
├─ scripts/                   # CLI scripts: db/ (migrate-postgres, migrate-mongo, seed-postgres), maintenance/ (backfill), copy-assets
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
schema_version, workflow_id, title, description,
scope, requester, inputs, computed, steps, completion, metadata
```

Key modeling decisions (also encoded as instructions in the extraction system prompt):

- **`steps` is a graph.** Each step has `depends_on: [{ step_id, required_outcome }]`. Sequencing, parallelism, and dependency-gating all fall out of this one mechanism rather than being separate concepts.
- **Actors are never named people.** Every `assignee` / `collected_from` / notification target is an "actor" object with one of four `resolution` modes: `dynamic` (directory lookup relative to another actor, e.g. "the student's advisor"), `static` (a fixed office), `requester` (whoever started the workflow), or `system` (automated). Roles are normalized to `snake_case`; a suggested vocabulary lives in [src/data/vocabulary/role.vocabulary.ts](../../src/data/vocabulary/role.vocabulary.ts) (academic, administrative, financial, facilities, security, IT, generic), but the model can coin new roles, which get flagged in `metadata.unmapped_roles` for admin review rather than treated as an error.
- **Conditions are structured, not prose.** `condition.operator` (`equals`, `greater_than`, `and`/`or`/`not` with `clauses`, etc.) over `left`/`right`, which are dotted namespace paths — never a free-text expression.
- **Computed values use a fixed operation set**: `date_diff_days`, `sum`, `difference`, `multiply`, `count`, `lookup`, `constant` — again, no free-text formulas.
- **A flat data namespace** is shared across a workflow run: `inputs.<id>`, `computed.<id>`, `steps.<id>.outcome`, `steps.<id>.response.<field>`, `requester.<attr>`, `system.today`.
- **Loop-backs stay acyclic.** "Request more info" is modeled as an *outcome* on the same step (`action: "reopen_input"`, `return_to_step: "self"`), not a new step pointing backward — keeping the dependency graph a DAG.
- **Terminal rejection** is an outcome effect (`action: "terminate_workflow"`) rather than a special workflow-level field.
- **Every outcome-bearing step has exactly three fixed outcome keys**: `approved`, `rejected`, `request_more_info` (nullable when not applicable).
- **Non-workflow input is a first-class outcome**, not an error: if the source text describes no institutional process at all, the prompt instructs the model to emit the smallest valid document (one `review` step, `system`-resolved, `metadata.review_status: "rejected"`) rather than hallucinating a workflow.
- **Strict-mode discipline**: every schema property must be present in the output; unused scalars are `null` (never omitted), unused arrays are `[]` (never `null`/omitted). This is required because the extraction call uses OpenAI's `strict: true` structured-output mode, which needs a fully-closed schema.
- **`metadata`** carries provenance and self-assessment: `source_text_hash`, `extraction_model`, `confidence` (`high`/`medium`/`low`), `ambiguities` (plain-English notes on assumptions the model had to make), `unmapped_roles`, and `review_status` (`pending_admin_review` / `confirmed` / `rejected`).

## 6. LLM extraction pipeline ([src/services/extraction.service.ts](../../src/services/extraction.service.ts))

1. **Prompt assembly** ([src/data/prompts/extraction.prompt.ts](../../src/data/prompts/extraction.prompt.ts)): a detailed system prompt encodes all the schema semantics above (graph vs. list, actor resolution, namespace paths, ambiguity handling, rejection-of-non-workflow-input rules), followed by two **few-shot examples** loaded from [src/data/samples/input/](../../src/data/samples/input/) + [src/data/samples/expected/](../../src/data/samples/expected/) ([src/data/prompts/extraction-few-shot.prompt.ts](../../src/data/prompts/extraction-few-shot.prompt.ts)), followed by the actual user-supplied plain text.
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
4. **Self-repair loop**: if validation fails and attempts remain, the invalid candidate plus a formatted list of errors is appended to the conversation as assistant/user turns, and the model is asked to return corrected JSON fixing *only* those problems. Default `maxAttempts` comes from `config.extraction.maxAttempts` (3). If still invalid after the last attempt, throws `ExtractionError`.
5. **Non-workflow guard**: even a schema-valid result is rejected (`ExtractionError`) if `metadata.review_status === "rejected"` — i.e., the model itself flagged the input as not describing a workflow.

## 7. Validation as a standalone capability

Schema + graph validation is exposed independently of extraction via [src/services/validation.service.ts](../../src/services/validation.service.ts), so any workflow JSON — LLM-generated or hand-authored/edited by an admin — can be re-validated before being saved or updated. This is exercised by the `POST /api/workflows/:id/validate` endpoint and the `PUT /api/workflows/:id` endpoint.

## 8. Persistence layer (MongoDB)

- **`src/models/draft.model.ts`** — the `drafts` collection: raw admin-submitted prose, deduplicated by SHA-256 of the normalised text.
- **`src/models/template.model.ts`** — the `templates` collection: versioned workflow documents with their retrieval embeddings; `is_latest` marks the current version per `workflow_id`.
- **`src/models/selection-session.model.ts`** — the `selection_sessions` collection: multi-round clarifying-question conversations.
- Models own the collection name, the document interface, and thin typed CRUD operations. Versioning policy (bumping the version number, demoting the previous `is_latest`) and the embedding call live in [src/services/workflow.service.ts](../../src/services/workflow.service.ts) and [src/services/embedding.service.ts](../../src/services/embedding.service.ts), not in the model.

### 8.1 A second database: PostgreSQL for users, sessions + deletion tracking

Users and their permissions (`users`, `permissions`, `user_permissions`),
server-side sessions (`user_sessions`) and the template deletion log
(`template_deletions`) live in **PostgreSQL**, not Mongo — deliberately making
this a **polyglot-persistence** service rather than pushing everything into
one store. The reasoning, and the consequences it forces:

- **Why a second database at all.** User data is relational: a hard
  uniqueness constraint (`lower(email)`), a permission catalogue joined to
  users by foreign keys, a deferred constraint trigger that rejects any
  transaction leaving a user with no permissions, and
  `template_deletions.deleted_by_user_id` benefits from a real foreign key
  (`ON DELETE RESTRICT` — an audit row can never be silently orphaned or
  erased by removing the user who created it). None of that is natural to
  express against a schemaless Mongo collection.
- **No cross-database transaction exists.** A template deletion touches
  Postgres (the log row) and Mongo (the template documents) with no shared
  transaction coordinator between them. `WorkflowService.delete()` writes the
  deletion-log row **before** deleting from Mongo, with `versions_removed`
  starting at `0` and only updated once the Mongo delete confirms — so a row
  still reading `versions_removed: 0` means the log landed but the delete
  didn't, which is a recoverable, visible failure state rather than a silent
  gap. Write ordering is the only atomicity available.
- **Two connection lifecycles.** [src/db/postgres.client.ts](../../src/db/postgres.client.ts)
  mirrors [src/db/mongo.client.ts](../../src/db/mongo.client.ts): a lazily-created pool
  (the process starts even if Postgres is down) with its own `closePool()`,
  invoked alongside `closeDb()` in `server.ts`'s shutdown handler.
- **Both databases are versioned by migrations** — [src/db/migration/](../../src/db/migration/)
  holds one shared engine plus independent Postgres and MongoDB migration sets,
  each tracked in its own `migrations` table/collection with up/down support
  (see [../guides/database-migrations.md](../guides/database-migrations.md)).
  `npm run migrate:up` applies them. The Postgres set is
  `20261111000000_initial-schema` followed by
  `20261111015501_unified-users-permissions-and-sessions`.
- **A seed pack mirrors the migration pack** — [src/db/seed/](../../src/db/seed/)
  holds a core runner/loader/generator/CLI plus timestamped Postgres seeders in
  [src/db/seed/postgres/seeders/](../../src/db/seed/postgres/seeders/). Seeders are
  idempotent and untracked (every run re-checks and skips what exists) and go
  through services such as `UserService`, so business rules apply. The only seeder
  creates the bootstrap administrator (`SEED_ADMINISTRATOR_EMAIL`,
  `SEED_ADMINISTRATOR_FULL_NAME`, password `USER_DEFAULT_PASSWORD`, all four
  permissions). `npm run seed:pg:run` runs them, `seed:pg:list` lists them and
  `seed:pg:create -- <name>` scaffolds a new one (see
  [../guides/database-seeding.md](../guides/database-seeding.md)).
- **Data access is behind three repositories** in [src/repositories/](../../src/repositories/) —
  `user-repository/`, `user-session-repository/` and `template-deletion-repository/`,
  each with an interface, a `postgres` and an `in-memory` implementation and an
  `index` factory — the same pattern already used for `IVectorStore` and `IMailer`.
  `POSTGRES_REPOSITORY_BACKEND` selects the backend for all three; `memory` is what
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
  `task:approve` is grantable but gates nothing yet.

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
`workflow:manage` for workflow writes, the deletion log and `/drafts`;
`workflow:manage` or `task:create` for reading workflows; `task:create` for
`/selection` and `/tasks`; `user:manage` for `/users`.
[src/middlewares/require-task-ownership.middleware.ts](../../src/middlewares/require-task-ownership.middleware.ts)
limits `/tasks/:id*` to the task's creator and answers `404` for anyone else's task. The split matters because `/api/approvals/*` is authenticated by a
*different* mechanism (a per-step approval token) and must keep working for
an approver with no session at all — so authentication and authorization are
deliberately two separate middleware layers, not one.

**Error handling**: a single error-handling middleware ([src/middlewares/error-handler.middleware.ts](../../src/middlewares/error-handler.middleware.ts)) reads `statusCode` and `toJSON()` off any `BaseError` subclass and responds accordingly; anything else is logged with its stack and answered with a generic `500`. See [error-handling.md](./error-handling.md) for the full hierarchy. All route handlers are wrapped in [src/middlewares/async-handler.middleware.ts](../../src/middlewares/async-handler.middleware.ts) so rejected promises reach this middleware instead of crashing the process.

## 10. Completion documents (PDF record on approval)

When a task's last required approval step is decided, `ApprovalService.sendDecisionNotifications`
generates a durable record of the whole request and emails it alongside the existing
completion notice. See [../../../docs/completion-document-email-phase-plan.md](../../../docs/completion-document-email-phase-plan.md)
for the full design rationale; summary of what exists in code:

- **Pure builder** ([src/utils/document/completion-document.util.ts](../../src/utils/document/completion-document.util.ts)) —
  `buildCompletionDocument()` assembles a `CompletionDocument` (header, request-detail
  fields in `workflow.inputs` declaration order, calculated values, follow-up answers
  from the request-more-info loop, and one `ApprovalRow` per approval step in workflow
  order) with no I/O at all, mirroring `ExecutionService`/`PlannerService`.
- **Computed-value evaluator** ([src/utils/workflow/computed-evaluator.util.ts](../../src/utils/workflow/computed-evaluator.util.ts)) —
  evaluates `workflow.computed` (`date_diff_days`, `sum`, `difference`, `multiply`,
  `count`, `lookup`, `constant`) against the task's collected values; never throws,
  resolving anything malformed or forward-referenced to `null` and omitting it.
- **Renderer, pluggable** ([src/services/document/](../../src/services/document/)) — `IDocumentRenderer`
  behind `createDocumentRenderer(format)`, mirroring `services/mailer/`: `PdfDocumentRenderer`
  (`pdfkit`, Standard-14 fonts, no headless browser) for real output, `TextDocumentRenderer`
  for tests and console runs. The PDF's `CreationDate` is stamped from the task's
  `completion_document.generated_at`, not `new Date()`, so re-rendering the same document
  is byte-for-byte deterministic — verified by comparing `sha256` hashes.
- **`CompletionDocumentService`** ([src/services/completion-document.service.ts](../../src/services/completion-document.service.ts)) —
  composes the builder, evaluator, and renderer behind one `generate()` call that never
  throws (`config.document.enabled === false` or any internal failure both return `null`),
  the same failure-isolation discipline as `NotificationService.dispatch()`. `ApprovalService`
  calls it once, on the `result.completed === true` branch, before sending the completion
  email; a successful render is attached to that email (when `DOCUMENT_ATTACH_TO_EMAIL` is
  on and under `DOCUMENT_MAX_ATTACHMENT_BYTES`) and its metadata — not its bytes —
  persisted onto the task as `completion_document` (`filename`, `byte_size`, `sha256`,
  `emailed_to`, `emailed_at`).
- **No bytes are stored.** A completed task is immutable and its workflow is
  version-pinned, so `GET /api/tasks/:id/document` ([../api/api-documentation.md](../api/api-documentation.md) §7.10)
  regenerates the PDF on every call from the persisted `generated_at` instead of reading
  a blob store; a hash mismatch against the stored `sha256` is logged as drift, not raised.
- **Config**: `document.config.ts` owns five `DOCUMENT_*` variables (`DOCUMENT_ENABLED`,
  `DOCUMENT_ATTACH_TO_EMAIL`, `DOCUMENT_FORMAT`, `DOCUMENT_INSTITUTION_NAME`,
  `DOCUMENT_MAX_ATTACHMENT_BYTES`) — see [../guides/configuration.md](../guides/configuration.md).
- **Smoke test**: `npm run smoke-test:document -- <task-id> [out.pdf]`
  ([tests/smoke/smoke-test-document.script.ts](../../tests/smoke/smoke-test-document.script.ts)) renders
  a real task's record to a local file for eyeballing, independent of the completion path.

## 11. Supporting pieces

- **Logger** ([src/utils/shared/logger.util.ts](../../src/utils/shared/logger.util.ts)): structured JSON logger (`debug`/`info`/`warn`/`error`) writing single-line JSON to stdout/stderr with timestamps.
- **Smoke test scripts** ([tests/smoke/smoke-test-llm.script.ts](../../tests/smoke/smoke-test-llm.script.ts), [tests/smoke/smoke-test-embeddings.script.ts](../../tests/smoke/smoke-test-embeddings.script.ts), [tests/smoke/smoke-test-document.script.ts](../../tests/smoke/smoke-test-document.script.ts), [tests/smoke/smoke-test-mail.script.ts](../../tests/smoke/smoke-test-mail.script.ts)): sanity-check connectivity of the configured LLM and embedding providers, completion-document rendering, and SMTP delivery, each independent of the paths that normally trigger them.

## 12. Test suite

Three tiers, matching the test scripts in [package.json](../../package.json):

- **`npm test`** → `tests/unit/**/*.test.ts` + `tests/integration/**/*.test.ts` (fast, no live network):
  - `tests/unit/utils/` — schema validation, graph validation (fixtures pass; mutation tests confirm each failure mode is caught), alias boost, render-summary, request-validator, serializer, vector-math.
  - `tests/unit/services/` — draft, workflow, retrieval, selection, selector, vector-store services against fakes.
  - `tests/unit/errors/` — `BaseError` contract.
  - `tests/integration/` — full HTTP-level coverage of draft, workflow, and selection routes, and the error handler, using an in-process Express server.
- **`npm run test:live`** → `tests/live/**/*.test.ts` (slow, calls the configured live AI provider, run manually/CI-gated):
  - `extraction-accuracy.live.test.ts` — asserts the model correctly extracts *specific* structural details from the two worked examples (right step IDs, correct `depends_on` chains, correct condition operator/operands, correct loop-back/termination outcomes, correct `context_from_steps` bindings).
  - `generalisation.live.test.ts`, `consistency.live.test.ts`, `robustness.live.test.ts`, `selection-quality.live.test.ts` — extraction on an unseen fixture, repeatability across repeated calls, behavior on messy/edge-case/non-workflow input, and selector agent quality, respectively.
- Two more manual, non-`node:test` tiers live alongside these: **`npm run evaluate:selection`** (`tests/evaluation/`) prints a recall@5 + decision-accuracy report for the selector agent against `src/data/samples/selection/queries.json`; **`npm run perf-test`** (`tests/perf/`) measures latency/token/cost for a chosen AI operation across configured models, writing timestamped JSON/CSV under its own git-ignored `results/`.

## 13. Sample data (used as both few-shot examples and test gold data)

| File | Institution scenario |
|---|---|
| `it_faculty_overseas_leave` | Student overseas-travel leave request: sequential advisor → HoD → (conditional) Dean approval chain, loop-back for "more info," computed trip-duration-based conditional step, terminal rejection |
| `departmental_event_workshop` | Event organization: parallel hall-booking + speaker-clearance branches, a refreshments step that starts `blocked` pending hall booking's outcome and consumes its `confirmed_capacity` response field via `context_from_steps` |
| `lab_equipment_purchase_request` | Input-only fixture (no expected/gold JSON) — used in `tests/live/` as an unseen example for generalisation/robustness testing |

These live under [src/data/samples/](../../src/data/samples/) (`input/`, `expected/`, `selection/`, `demo-drafts/`). The same two fully-worked fixtures (`it_faculty_overseas_leave`, `departmental_event_workshop`) serve **three roles at once**: few-shot prompt examples, schema/graph validation test fixtures, and live extraction-accuracy assertions — meaning any change to the schema or prompt must keep these three consistent.

## 14. What is explicitly out of scope / not yet built

- **No workflow execution engine** — nothing runs a saved workflow instance, resolves actors against a real directory, evaluates conditions against real data, or sends real notifications. The schema is designed to support this later, but none of it exists yet.
- **No self-registration, password reset, or password change.** Every user starts with `USER_DEFAULT_PASSWORD` and keeps it. The user API covers create, list and get-by-id only — no update, deactivate or delete yet.
- **`task:approve` gates nothing yet** — approval links stay public and token-based; requiring approvers to sign in is a later revamp.
- **No rate limiting by IP** — only per-account failed-attempt lockout (§8.1), and that enforcement is off by default (`AUTH_MAX_FAILED_ATTEMPTS=0`).
- **No directory/identity service integration** (needed to actually resolve `dynamic`/`static` actors to real people/offices) — this is unrelated to and not fixed by the auth work in §8.1, which authenticates *who is calling the API*, not who a workflow's actors resolve to.

## 15. Quick reference — how to run it

See [../guides/running-the-app.md](../guides/running-the-app.md) for the full setup guide. Quick version:

```bash
npm install
cp .example.env .env   # then fill in AI provider + MongoDB + PostgreSQL credentials
npm run migrate:up            # apply Postgres + Mongo migrations (tables, collections, indexes)
npm run seed:pg:run           # create the bootstrap administrator (SEED_ADMINISTRATOR_EMAIL, password USER_DEFAULT_PASSWORD)
npm run dev                   # tsx watch, or: npm run build && npm start
npm test                      # fast unit + integration tests (in-memory repositories, no Postgres needed)
npm run test:live             # slow tests that call the configured AI provider (needs valid .env)
```
