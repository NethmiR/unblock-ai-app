# UNBLOCK-AI — Project Overview

> Generated from a read-through of the codebase after the TypeScript restructure. For the original design rationale and full requirements analysis, see [../plans/original-implementation-plan.md](../plans/original-implementation-plan.md).

## 1. What this project does

UNBLOCK-AI turns a **plain-English description of an institutional approval workflow** (e.g. "students who want to travel overseas must get approval from their advisor, then the Head of Department...") into a **strict, machine-readable JSON workflow definition** — a reusable template that a (future) execution engine could run: resolving approvers from a directory, evaluating conditions, tracking step completion, sending notifications, etc.

```
Admin pastes plain text
        │
        ▼
  LLM Extraction (Azure OpenAI)  ──►  Schema + Graph Validation
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

- **Runtime**: Node.js 18+, ES modules (`"type": "module"` in [package.json](../../package.json)), compiled with TypeScript (`strict: true`)
- **Web framework**: Express 5 ([src/app.ts](../../src/app.ts), [src/server.ts](../../src/server.ts))
- **LLM provider**: Azure OpenAI, via the official `openai` SDK's `AzureOpenAI` client ([src/services/azure-openai.client.ts](../../src/services/azure-openai.client.ts))
- **Schema validation**: AJV (2020-12 dialect) + `ajv-formats` ([src/utils/workflow/schema-validator.util.ts](../../src/utils/workflow/schema-validator.util.ts))
- **Persistence**: MongoDB via the official `mongodb` driver ([src/db/mongo.client.ts](../../src/db/mongo.client.ts), [src/models/](../../src/models/)) for workflows/drafts/tasks, **plus PostgreSQL** via `pg` ([src/db/postgres.client.ts](../../src/db/postgres.client.ts)) for auth and the template deletion log — see §8.1
- **Auth**: HMAC-signed stateless session tokens (`node:crypto` scrypt for password hashing, no `bcrypt`/`argon2` dependency) — see §8.1
- **Testing**: Node's built-in `node:test` runner, executed via `tsx` — split into `tests/unit/`, `tests/integration/`, and `tests/live/` (calls the real Azure endpoint)
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
│  ├─ services/               # all business logic, DB access via models, external calls
│  ├─ models/                 # one model per MongoDB collection
│  ├─ config/                 # typed config modules; only place that reads process.env
│  ├─ middlewares/            # cors, json-body, request-id, logging, error handling, auth
│  ├─ utils/                  # pure helpers (shared, workflow, retrieval, http, auth)
│  ├─ data/                   # prompts, JSON Schemas, vocabulary, constants, samples
│  ├─ lib/types/              # central TypeScript type directory
│  ├─ errors/                 # BaseError + one subclass per error category
│  └─ db/                     # Mongo client + index definitions, Postgres client + migrations
├─ scripts/                   # CLI scripts (init-db, backfill, evaluate, smoke tests)
├─ tests/                      # unit/, integration/, live/, helpers/
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
2. **Structured-output call**: calls the Azure deployment with `response_format: { type: "json_schema", json_schema: { schema: strictWorkflowSchema, strict: true } }`, forcing the model to emit schema-conformant JSON. `temperature: 0` is set unless the deployment is a reasoning model (`o*`/`gpt-5*`, detected by regex), which don't support temperature control.
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
4. **Self-repair loop**: if validation fails and attempts remain, the invalid candidate plus a formatted list of errors is appended to the conversation as assistant/user turns, and the model is asked to return corrected JSON fixing *only* those problems. Default `maxAttempts` comes from `config.azureOpenAI.maxExtractionAttempts` (3). If still invalid after the last attempt, throws `ExtractionError`.
5. **Non-workflow guard**: even a schema-valid result is rejected (`ExtractionError`) if `metadata.review_status === "rejected"` — i.e., the model itself flagged the input as not describing a workflow.

## 7. Validation as a standalone capability

Schema + graph validation is exposed independently of extraction via [src/services/validation.service.ts](../../src/services/validation.service.ts), so any workflow JSON — LLM-generated or hand-authored/edited by an admin — can be re-validated before being saved or updated. This is exercised by the `POST /api/workflows/:id/validate` endpoint and the `PUT /api/workflows/:id` endpoint.

## 8. Persistence layer (MongoDB)

- **`src/models/draft.model.ts`** — the `drafts` collection: raw admin-submitted prose, deduplicated by SHA-256 of the normalised text.
- **`src/models/template.model.ts`** — the `templates` collection: versioned workflow documents with their retrieval embeddings; `is_latest` marks the current version per `workflow_id`.
- **`src/models/selection-session.model.ts`** — the `selection_sessions` collection: multi-round clarifying-question conversations.
- Models own the collection name, the document interface, and thin typed CRUD operations. Versioning policy (bumping the version number, demoting the previous `is_latest`) and the embedding call live in [src/services/workflow.service.ts](../../src/services/workflow.service.ts) and [src/services/embedding.service.ts](../../src/services/embedding.service.ts), not in the model.

### 8.1 A second database: PostgreSQL for auth + deletion tracking

Auth (`admin_users`, `portal_users`) and the template deletion log
(`template_deletions`) live in **PostgreSQL**, not Mongo — deliberately making
this a **polyglot-persistence** service rather than pushing everything into
one store. The reasoning, and the consequences it forces:

- **Why a second database at all.** Auth data is relational, has hard
  uniqueness constraints (`lower(username)`, `lower(email)`), and
  `template_deletions.deleted_by_admin_id` benefits from a real foreign key
  (`ON DELETE RESTRICT` — an audit row can never be silently orphaned or
  erased by removing the admin who created it). None of that is natural to
  express against a schemaless Mongo collection.
- **No cross-database transaction exists.** A template deletion touches
  Postgres (the log row) and Mongo (the template documents) with no shared
  transaction coordinator between them. `WorkflowService.delete()` writes the
  deletion-log row **before** deleting from Mongo, with `versions_removed`
  starting at `0` and only updated once the Mongo delete confirms — so a row
  still reading `versions_removed: 0` means the log landed but the delete
  didn't, which is a recoverable, visible failure state rather than a silent
  gap. Write ordering is the only atomicity available; see
  [../../../docs/auth-and-deletion-tracking-phase-plan.md](../../../docs/auth-and-deletion-tracking-phase-plan.md)
  for the full rationale.
- **Two connection lifecycles.** [src/db/postgres.client.ts](../../src/db/postgres.client.ts)
  mirrors [src/db/mongo.client.ts](../../src/db/mongo.client.ts): a lazily-created pool
  (the process starts even if Postgres is down) with its own `closePool()`,
  invoked alongside `closeDb()` in `server.ts`'s shutdown handler.
- **Migrations are plain `.sql` files**, not a framework — [src/db/migrate.ts](../../src/db/migrate.ts)
  applies them in filename order inside a transaction each, tracked in a
  `schema_migrations` table. `npm run migrate:pg` runs them; `npm run
  seed:auth` seeds the (small, fixed) set of admin/portal users from `.env`
  credentials, idempotently (`ON CONFLICT DO NOTHING`, or `DO UPDATE` with
  `--force`).
- **Data access is behind `IAuthStore`** ([src/services/auth-store/](../../src/services/auth-store/)),
  with `postgres` and `memory` implementations — the same pattern already used
  for `IVectorStore` and `IMailer`. The `memory` backend
  (`AUTH_STORE_BACKEND=memory`) is what lets `npm test` run with no live
  Postgres at all, the way `mongodb-memory-server` already does for Mongo.
- **Passwords are hashed with `node:crypto`'s scrypt** ([src/utils/shared/password.util.ts](../../src/utils/shared/password.util.ts)),
  not `bcrypt`/`argon2` — both need a native build toolchain (painful on
  Windows), while scrypt is a memory-hard KDF already in the stdlib.
- **Sessions are stateless HMAC-signed bearer tokens**
  ([src/utils/auth/session-token.util.ts](../../src/utils/auth/session-token.util.ts)),
  mirroring the existing approval-token pattern in
  [src/utils/approval/token.util.ts](../../src/utils/approval/token.util.ts) — no
  `sessions` table, no server-side revocation, which is an acceptable
  trade-off for three seeded users and gets revisited if real user management
  ships.

## 9. HTTP API

All routes are mounted under `/api` (see [src/routes/index.route.ts](../../src/routes/index.route.ts) and [src/app.ts](../../src/app.ts)). See [../api/api-documentation.md](../api/api-documentation.md) for the full endpoint reference, request/response bodies, and error shapes.

**Auth**: [src/middlewares/authenticate.middleware.ts](../../src/middlewares/authenticate.middleware.ts)
parses a bearer token and populates `req.user` on every request but never
rejects by itself; [src/middlewares/require-auth.middleware.ts](../../src/middlewares/require-auth.middleware.ts)'s
`requireAuth()` / `requireRole("admin")` do the actual gating, applied
per-route. The split matters because `/api/approvals/*` is authenticated by a
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
  ([scripts/smoke-test-document.script.ts](../../scripts/smoke-test-document.script.ts)) renders
  a real task's record to a local file for eyeballing, independent of the completion path.

## 11. Supporting pieces

- **Logger** ([src/utils/shared/logger.util.ts](../../src/utils/shared/logger.util.ts)): structured JSON logger (`debug`/`info`/`warn`/`error`) writing single-line JSON to stdout/stderr with timestamps.
- **Smoke test scripts** ([scripts/smoke-test-azure.script.ts](../../scripts/smoke-test-azure.script.ts), [scripts/smoke-test-embeddings.script.ts](../../scripts/smoke-test-embeddings.script.ts), [scripts/smoke-test-document.script.ts](../../scripts/smoke-test-document.script.ts)): sanity-check Azure OpenAI chat/embeddings connectivity and completion-document rendering, each independent of the paths that normally trigger them.

## 12. Test suite

Three tiers, matching the test scripts in [package.json](../../package.json):

- **`npm test`** → `tests/unit/**/*.test.ts` + `tests/integration/**/*.test.ts` (fast, no live network):
  - `tests/unit/utils/` — schema validation, graph validation (fixtures pass; mutation tests confirm each failure mode is caught), alias boost, render-summary, request-validator, serializer, vector-math.
  - `tests/unit/services/` — draft, workflow, retrieval, selection, selector, vector-store services against fakes.
  - `tests/unit/errors/` — `BaseError` contract.
  - `tests/integration/` — full HTTP-level coverage of draft, workflow, and selection routes, and the error handler, using an in-process Express server.
- **`npm run test:live`** → `tests/live/**/*.test.ts` (slow, calls real Azure OpenAI, run manually/CI-gated):
  - `extraction-accuracy.live.test.ts` — asserts the model correctly extracts *specific* structural details from the two worked examples (right step IDs, correct `depends_on` chains, correct condition operator/operands, correct loop-back/termination outcomes, correct `context_from_steps` bindings).
  - `generalisation.live.test.ts`, `consistency.live.test.ts`, `robustness.live.test.ts`, `selection-quality.live.test.ts` — extraction on an unseen fixture, repeatability across repeated calls, behavior on messy/edge-case/non-workflow input, and selector agent quality, respectively.

## 13. Sample data (used as both few-shot examples and test gold data)

| File | Institution scenario |
|---|---|
| `it_faculty_overseas_leave` | Student overseas-travel leave request: sequential advisor → HoD → (conditional) Dean approval chain, loop-back for "more info," computed trip-duration-based conditional step, terminal rejection |
| `departmental_event_workshop` | Event organization: parallel hall-booking + speaker-clearance branches, a refreshments step that starts `blocked` pending hall booking's outcome and consumes its `confirmed_capacity` response field via `context_from_steps` |
| `lab_equipment_purchase_request` | Input-only fixture (no expected/gold JSON) — used in `tests/live/` as an unseen example for generalisation/robustness testing |

These live under [src/data/samples/](../../src/data/samples/) (`input/`, `expected/`, `selection/`, `demo-drafts/`). The same two fully-worked fixtures (`it_faculty_overseas_leave`, `departmental_event_workshop`) serve **three roles at once**: few-shot prompt examples, schema/graph validation test fixtures, and live extraction-accuracy assertions — meaning any change to the schema or prompt must keep these three consistent.

## 14. What is explicitly out of scope / not yet built

- **No workflow execution engine** — nothing runs a saved workflow instance, resolves actors against a real directory, evaluates conditions against real data, or sends real notifications. The schema is designed to support this later, but none of it exists yet.
- **No self-registration, password reset, or password change.** Three seeded users (one admin, two portal), changed by re-running `npm run seed:auth --force`.
- **No session revocation** ("log out everywhere") — a consequence of stateless bearer tokens (§8.1). Would need a `sessions` table.
- **No rate limiting by IP** — only per-account failed-attempt counting (§8.1), and lockout enforcement itself is off by default (`AUTH_MAX_FAILED_ATTEMPTS=0`).
- **No directory/identity service integration** (needed to actually resolve `dynamic`/`static` actors to real people/offices) — this is unrelated to and not fixed by the auth work in §8.1, which authenticates *who is calling the API*, not who a workflow's actors resolve to.

## 15. Quick reference — how to run it

See [../guides/running-the-app.md](../guides/running-the-app.md) for the full setup guide. Quick version:

```bash
npm install
cp .example.env .env   # then fill in Azure OpenAI + MongoDB + PostgreSQL credentials
npm run init-db               # create Mongo collections/indexes
npm run migrate:pg            # create the Postgres auth + deletion-log tables
npm run seed:auth             # seed the admin + two portal users from .env credentials
npm run dev                   # tsx watch, or: npm run build && npm start
npm test                      # fast unit + integration tests (AUTH_STORE_BACKEND=memory needs no Postgres)
npm run test:live             # slow tests that call Azure OpenAI (needs valid .env)
```
