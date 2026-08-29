# UNBLOCK-AI — Project Reference

A monorepo-style pair of projects:

| Project | Role | Port |
|---|---|---|
| [unblock-ai-api/](../unblock-ai-api/) | Express + TypeScript backend | 3000 |
| [unblock-ai-web/](../unblock-ai-web/) | Next.js frontend | 3001 |

**Core idea:** turn a plain-English description of an institutional approval workflow ("students travelling overseas need advisor → HoD approval…") into a **strict, machine-readable JSON workflow graph**, then let end users find the right one by chatting in plain language.

This document exists so future implementation work can quickly understand what already exists before adding to it.

---

## 1. Main functions we handle

There are **eight** functional areas. Two write paths (admin), three end-user paths
(selection, task planning, approval execution), plus auth and supporting infrastructure.

### A. Authentication & template-deletion tracking
`src/services/auth.service.ts` · `src/services/auth-store/` · `src/middlewares/authenticate.middleware.ts`

- Real login for both surfaces, backed by **PostgreSQL** — `admin_users` and `portal_users`
  are separate tables (different privilege domains, different columns), not one table with
  a `role` column. One seeded admin, two seeded portal users; no self-registration.
- Sessions are **stateless HMAC-signed bearer tokens** (`src/utils/auth/session-token.util.ts`),
  mirroring the existing approval-token pattern — no `sessions` table, no revocation.
  `authenticate` middleware populates `req.user` on every request but never rejects by
  itself; `requireAuth()` / `requireRole("admin")` do the actual gating per-route, which is
  what lets `/api/approvals/*` (a *different*, token-based auth mechanism) keep working
  for an approver with no session.
- Passwords are hashed with **`node:crypto` scrypt** (D-1 in the phase plan) — no
  `bcrypt`/`argon2` native-build dependency. Repeated wrong-password attempts against a
  known username are counted and timestamped (`failed_attempt_count`,
  `last_failed_attempt_at`); lockout enforcement is off by default
  (`AUTH_MAX_FAILED_ATTEMPTS=0`) and opt-in.
- **Template deletions** write an auditable `template_deletions` row (Postgres) naming
  which admin deleted which template and when, via `DELETE /api/workflows/:id`
  (`GET /api/workflows/:id/deletions` — see `unblock-ai-api/docs/api/api-documentation.md`
  §4.7–§4.8 — reads it back). The row is written **before** the Mongo delete runs, so a
  failed delete still leaves a visible trail rather than a silent gap. Task deletions stay
  on the pre-existing Mongo `audit_logs` collection — no dual write.
- Full design and phase-by-phase build log: [auth-and-deletion-tracking-phase-plan.md](auth-and-deletion-tracking-phase-plan.md).

### B. Draft management (admin write path, step 1)
`src/services/draft.service.ts` · `src/models/draft.model.ts`

- Stores raw admin prose in the `drafts` collection.
- **Idempotent by SHA-256** of the normalised text — resubmitting identical text returns the original draft instead of creating a duplicate (`hash.util.ts`).
- Tracks lifecycle status: `pending` → `extracted` / `failed` / `rejected`.
- On a failed extraction, the draft is updated with `failure_reason` as a side effect before the error returns — so prose is never lost.

### C. LLM extraction — prose → workflow JSON
`src/services/extraction.service.ts`

The centrepiece. Four stages:

1. **Prompt assembly** — a long system prompt (`extraction.prompt.ts`) encoding all schema semantics, plus **two few-shot examples** loaded from real sample files (`extraction-few-shot.prompt.ts`).
2. **Structured-output call** — Azure OpenAI with `response_format: json_schema, strict: true`, forcing schema-conformant JSON. `temperature: 0`, skipped for reasoning models (`o*`/`gpt-5*`, regex-detected).
3. **Two-layer validation** on every candidate (see C below).
4. **Self-repair loop** — on failure, the invalid JSON + formatted error list are appended as conversation turns and the model is asked to fix *only* those problems. Up to `EXTRACTION_MAX_ATTEMPTS` (default 3), then throws `ExtractionError` (HTTP 422).

**Non-workflow guard:** if the model itself flags the input as not a process (`metadata.review_status === "rejected"`), that's rejected as a 422 rather than a hallucinated workflow.

### D. Validation (standalone capability)
`src/services/validation.service.ts`

Deliberately separated from extraction, so hand-edited workflows can be re-validated too.

- **Schema validation** (`schema-validator.util.ts`) — AJV against `workflow.schema.json`.
- **Graph validation** (`graph-validator.util.ts`) — 8 semantic checks JSON Schema can't express:

| Check | Catches |
|---|---|
| `checkDependencyReferences` | `depends_on` → non-existent step |
| `checkRequiredOutcomes` | referenced outcome doesn't exist on target |
| `checkNoCycles` | DAG violation (white/gray/black DFS) |
| `checkEntryStepExists` | no step with empty `depends_on` |
| `checkReachability` | orphaned steps (BFS) |
| `checkApprovalOutcomes` | approval step missing `approved`/`rejected` |
| `checkCompletionRequiredSteps` | `completion.required_steps` → unknown step |
| `checkNamespacePaths` | dangling `inputs.*`/`computed.*`/`steps.*` references |

### E. Versioned template storage + embeddings
`src/services/workflow.service.ts` · `src/services/embedding.service.ts`

- **Never updates in place** — every save creates a new version, auto-incrementing per `workflow_id` and demoting the previous `is_latest`.
- Each save generates a retrieval embedding.
- **`review_status` is the publish gate**: `pending_admin_review` → `confirmed` via `PATCH /workflows/:id/review`. Retrieval only sees `confirmed` + `is_latest` templates. Nothing is findable until published.

### F. Retrieval + Selector Agent (end-user read path)
`src/services/retrieval.service.ts` · `selector.service.ts` · `selection.service.ts`

A multi-round conversation mapping a plain-language request onto one template:

1. **Retrieval** — embed the query, vector search top-K+2, apply **alias boost** (additive score bump for exact alias matches, `alias-boost.util.ts`), slice to `RETRIEVAL_TOP_K` (5).
2. **Selector agent** — an LLM decides between four outcomes:

| Decision | Meaning |
|---|---|
| `matched` | One template chosen. Terminal. |
| `ambiguous` | Asks one clarifying question |
| `no_match` | Nothing suitable. Terminal — never stretches to the nearest option. |
| `manual_choice` | Round budget spent; user picks from a list. Produced by the service loop, never the model. |

**Key design decision** (`selection.service.ts`): retrieval runs **only once**, in round 1. The candidate set is deliberately frozen so it can't drift under an in-progress clarifying conversation. Round cap is `SELECTION_MAX_ROUNDS` (default 2).

### G. Task planning (end-user requirement collection)
`src/services/task.service.ts` · `src/services/planner.service.ts` · `src/models/task.model.ts`

Turns a matched workflow (from F) into a task that walks the requester through supplying
every value the workflow needs, then hands off a runnable plan:

1. **Create** (`POST /tasks`) — pulls the matched, version-pinned workflow off a
   selection session and compiles it (`PlannerService.compile`, pure/no I/O) into a
   flat **requirement list** plus one step-state entry per workflow step. Requirements
   come from two sources: `workflow.inputs` needing the requester (`source: "input"`),
   and `dynamic`-resolution step assignees (`source: "actor"`, `type: "person"`) —
   walked in topological order and de-duplicated so two steps needing the same
   role/relative-to share one requirement.
2. **Collect** (`GET /tasks/:id/next`, `POST /tasks/:id/values`) — one requirement at a
   time. Each value is type-coerced and validated (`value-validator.util.ts`),
   including cross-field checks (a return date can't be before a `not_before_field`
   departure date).
3. **Finalize** (`POST /tasks/:id/finalize`) — once every required requirement is
   filled, collected `actor:*` people are attached to their steps' `assignee`, and step
   states are seeded: no-dependency steps → `ready`, everything else → `blocked`.
   `status` moves `collecting` → `ready`.
4. **Cancel** (`PATCH /tasks/:id/status`) — the only other status transition; any
   non-terminal task can move to `cancelled`.

**Finalizing is not starting.** `POST /tasks/:id/finalize` only computes initial step
states (`ready` / `blocked`) — nothing progresses a step, resolves a `dynamic` approver
against a real directory, sends a notification, or issues an approval token yet.
`steps[].approval_token` and `steps[].reason` stay `null` until `POST /tasks/:id/start`
(area H below) actually dispatches the entry step(s).

**Approver email is requester-supplied and untrusted** — for an `actor:*` requirement,
the requester types in their own approver's name and email; there is no directory
lookup here, so this is a trust boundary worth remembering before building anything
that emails that address automatically.

### H. Approval execution (end-user approval path)
`src/services/execution.service.ts` · `src/services/approval.service.ts` ·
`src/services/notification.service.ts` · `src/services/mailer/` · `src/utils/approval/`

Turns a finalized task (from G) into a running approval chain. Split into a pure
engine and an I/O shell around it, deliberately — the engine is provably correct
without a database or a network:

1. **`ExecutionService`** (pure, no I/O) — `advance()` walks the step graph: a
   `blocked` step whose every `depends_on` dependency reports its `required_outcome`
   becomes `ready`; a `ready` step is collected into a `dispatched[]` list and moves
   to `pending_approval` (the engine reports what needs sending — it never sends
   anything itself); completion and termination are evaluated last, with termination
   checked **before** dispatch, so a rejected task never emits a dispatch for a step
   downstream of the rejection. `applyDecision()` writes an approver's outcome onto a
   step and re-runs `advance()`, unless the outcome is `reopen_input` (see below).
2. **Approval tokens** (`utils/approval/token.util.ts`) — an HMAC-SHA256-signed,
   non-throwing token (`base64url(payload) + "." + base64url(signature)`) issued per
   dispatched step. The token proves authenticity only; whether it's still *usable*
   (unexpired, unused, step still `pending_approval`) is checked separately by
   `ApprovalService` on every request, so revocation is a DB write, not a key
   rotation.
3. **`POST /tasks/:id/start`** and **`POST /approvals/:token/decision`** are the only
   two places the chain moves. Starting dispatches the entry step(s); each decision
   advances the graph until the task completes, terminates, or is left waiting on
   further approvals.
4. **Notifications** (`notification.service.ts` + pluggable `IMailer`, mirroring
   `services/vector-store/`) — approval-request, rejection, completion, and
   more-info emails. Never throws; a failed send is logged and returned as `false`
   rather than rolling back a recorded decision. Default transport is `console`,
   which logs the full approval URL to stdout instead of calling a real provider —
   the whole chain is demonstrable with no email account. Every workflow now declares a
   `requester_email` input (extraction prompt rule, see
   [requester-contact-gap.md](requester-contact-gap.md)), so all four notification paths
   send for newly-extracted workflows; stored workflows predating that change still hit
   the no-op path gracefully until re-extracted.
5. **The request-more-info loop** — an outcome, not a backward graph edge. It resets
   the step to `ready` with a cleared token (forcing a fresh one on redispatch),
   increments a per-step `reopen_count` capped at 3, appends a `followup:*`
   requirement answered through the existing `POST /tasks/:id/values`, and returns
   `status` to `collecting`. Re-finalizing after a reopen re-dispatches only the
   reopened step — it must not re-seed the whole graph, which would silently wipe
   already-recorded approvals.
6. **Completion documents** (`src/services/completion-document.service.ts` ·
   `src/utils/document/` · `src/services/document/` — see
   [completion-document-email-phase-plan.md](completion-document-email-phase-plan.md)) —
   when the last required step reaches its outcome (`result.completed === true`), a
   PDF record of the whole request is generated: every requester-supplied value in
   the workflow template's declared order, calculated values, follow-up answers, and
   an approval trail (step, designation, approver name/email, decision) built from
   `task.steps` in workflow step order. It is attached to the completion email
   (`DOCUMENT_ATTACH_TO_EMAIL`, default on) and independently downloadable from
   `GET /tasks/:id/document`. Nothing is stored but a small metadata record
   (`filename`, `byte_size`, `sha256`) — the task is immutable and its workflow
   version-pinned once completed, so the PDF is re-rendered deterministically from
   that metadata on every download rather than kept as a blob. Generation never
   throws into the decision path (`DOCUMENT_ENABLED=false` or a renderer failure both
   just skip it silently) — the same failure-isolation discipline as the rest of
   notification dispatch.

**`GET /tasks/:id/status`** is the requester-facing view built on top of this: current
pending steps, and — critically — for a `rejected` task, **who** rejected it, **at
which step**, and **why**, lifted straight from the terminating step's `reason`.

### I. Frontend — two distinct UIs

**Admin** (`src/app/admin/`) — the authoring surface:
- Template list with institution-type filtering
- Split-pane editor (`TemplateEditor.tsx`): prose on the left, **compiled flowchart** on the right
- State machine (`empty` → `ready` → `compiled` → `edited`) with a stale banner when text drifts from the last compile
- Save draft / Generate / **Publish** actions

**Portal** (`src/app/portal/`) — the requester surface:
- Job list (currently **placeholder fixtures**, `jobs.ts`)
- New job: chat panel + live plan preview (`useSelectionSession.ts` drives the whole conversation)

---

## 2. Tools and technologies

### Backend — `unblock-ai-api/`

| Concern | Choice | Notes |
|---|---|---|
| Runtime | **Node.js ≥18**, ES modules (`"type": "module"`) | `.js` extensions in TS imports |
| Language | **TypeScript 5.9**, `strict: true` | |
| Framework | **Express 5** | `app.ts` builds, `server.ts` listens — split for testability |
| LLM | **Azure OpenAI** via official `openai` SDK's `AzureOpenAI` client | gpt-4o default |
| Embeddings | **Azure AI Foundry**, `text-embedding-3-small`, 1536-dim | Separate resource from chat, own endpoint/key |
| Schema validation | **AJV 8** (draft 2020-12) + `ajv-formats` | |
| Database | **MongoDB 7** — official driver, no ODM | Workflows, drafts, tasks, selection sessions, task-deletion audit |
| Database (auth) | **PostgreSQL 17** via `pg` — official driver, no ORM | `admin_users`, `portal_users`, `template_deletions`; polyglot-persistence by design, see area A |
| Vector search | **Pluggable**: `memory` \| `atlas` | `createVectorStore` factory behind `IVectorStore` |
| Mailer | **Pluggable**: `console` \| `smtp` (`nodemailer`) | `createMailer` factory behind `IMailer`, mirrors `IVectorStore`'s shape |
| Auth store | **Pluggable**: `postgres` \| `memory` | `createAuthStore` factory behind `IAuthStore`; `memory` backs `npm test` with no live Postgres |
| Config | **dotenv**, validated once at startup | `env.config.ts` is the *only* place reading `process.env` |
| Testing | **`node:test`** (built-in) via **tsx** + `mongodb-memory-server` | No Jest/Vitest |
| Dev runner | **tsx watch** | |

**Backend architecture:** strict layering — `routes → controllers → services → models → db`. Constructor-injected dependencies wired manually in `server.ts` (no DI container). Naming convention is `*.service.ts`, `*.controller.ts`, `*.util.ts`, `*.type.ts` throughout.

**Middleware chain** (`app.ts`): `requestId → requestLogger → cors → jsonBody (1MB cap) → /api router → notFound → errorHandler`.

**Error handling:** a `BaseError` hierarchy where each subclass carries its own `statusCode` and `toJSON()`, so the single error middleware needs no status lookup table. Nine error types map to consistent `{ error, code, details }` responses:

`ValidationError` 400 · `NotFoundError` 404 · `ConflictError` 409 · `ExtractionError` 422 · `SelectionError`/`EmbeddingError` 502 · `DatabaseError`/`ConfigurationError` 500

### Frontend — `unblock-ai-web/`

| Concern | Choice |
|---|---|
| Framework | **Next.js 16.3** (App Router, RSC) |
| UI | **React 19.2** |
| Styling | **Tailwind CSS v4** (PostCSS plugin, no config file) |
| Flowchart | **`@xyflow/react` v12** (React Flow) + **dagre** for auto-layout |
| Data fetching | **SWR** for client; `force-dynamic` server components for admin pages |
| Utilities | `clsx` |
| Lint | ESLint 9 + `eslint-config-next` |

**Frontend architecture:**
- **Single API chokepoint** — `client.ts` is the only place calling `fetch`; feature modules (`workflows.ts`, `drafts.ts`, `selection.ts`, `health.ts`) build on it. `ApiError` carries `status`, `code`, `details`.
- **Hand-mirrored types** in `src/types/` — narrowed to match backend unions exactly, to avoid loose `string`/`Record<string, unknown>` fields that would absorb schema drift silently.
- **Pure transform layer** — `toFlowGraph.ts` (workflow → React Flow nodes/edges), `toPlanNodes.ts` (workflow → portal plan list), `editorState.ts` (editor state machine).
- **Auth is a real, stateless session** — `session.ts` reads an httpOnly `ua_session` cookie set by this app's own `POST /api/auth/login` Route Handler (never by the API directly, so the flow survives the API moving to another domain — see area A). `proxy.ts` (the current Next convention for what used to be `middleware.ts`) verifies the cookie's HMAC signature and expiry before letting a request reach `/admin*` or `/portal*`, redirecting to the matching login page otherwise. `getRequesterContext()`'s `{ faculty, department, actor_type }` shape is unchanged from the old mock, since the selector agent depends on those exact keys.

---

## 3. Things worth knowing for future work

**The workflow schema is the core design artifact** — `unblock-ai-api/src/data/schemas/workflow.schema.json`. Changing it ripples widely:

- `steps` is a **dependency graph**, not a list. Sequencing, parallelism, and gating all fall out of `depends_on: [{step_id, required_outcome}]`.
- **Actors are never named people** — four resolution modes (`dynamic`/`static`/`requester`/`system`). Unknown roles get flagged in `metadata.unmapped_roles`, not rejected.
- **Conditions and computed values are structured**, never free-text expressions. Fixed operator and operation sets.
- **Loop-backs stay acyclic** — "request more info" is an *outcome* (`action: reopen_input, return_to_step: self`), not a backward edge.
- **Strict-mode discipline**: every property must be present, `additionalProperties: false` everywhere. Unused scalars are `null`, unused arrays are `[]`. Required by OpenAI's `strict: true` mode.

**The two worked fixtures serve three roles at once** — few-shot prompt examples, validation test fixtures, *and* live extraction-accuracy gold data. Any schema or prompt change must keep all three consistent.

**Not built yet** (explicitly out of scope):
- **No self-registration, password reset, or password change** — three seeded users (one
  admin, two portal), changed by re-running `npm run seed:auth --force`. See area A.
- **No session revocation** ("log out everywhere") — sessions are stateless bearer tokens
  with no `sessions` table to delete a row from; would need one to add revocation.
- **No rate limiting by IP** on login — only per-account failed-attempt counting, and even
  that is off by default (`AUTH_MAX_FAILED_ATTEMPTS=0`).
- **`req.user` is populated but mostly unused past the auth/deletion-log routes** —
  `submitted_by` on a draft or task is still always `null`; nothing yet uses the now-real
  identity to scope a requester's own job list. This is a small, contained follow-on now
  that every route has a real `req.user` (unlike the pre-auth state, where nothing did).
- **No directory/identity service** integration — task planning's `actor:*` requirements
  are filled with requester-supplied name/email, not a directory lookup. Approval
  execution (H) inherits this: the approval authority emailed for a decision is
  whatever address the requester typed in, unverified. Every workflow now also collects a
  `requester_email` input the same self-asserted way (see
  [requester-contact-gap.md](requester-contact-gap.md), resolved) — closing this gap
  properly is Option C, still not scheduled.
- **No `dynamic`-condition evaluation, no SLA/reminders/escalation.** `WorkflowStep.sla`
  and `condition` exist in the schema and stay unread by the execution engine.
- **No LLM assistance in the approval flow** — question phrasing, context summarising,
  and reject-vs-more-info suggestion are all left as plain data for a caller to render.
- **The only `DELETE` endpoint is `DELETE /api/workflows/:id`** (admin-only, typed
  confirmation, logs the deleting admin — area A). Tasks still have no delete route.
- **No frontend for approval execution** — the approver page and requester status view
  are JSON APIs only (H); no UI consumes them yet.
- Portal job list is **placeholder fixtures**, not real data.

**Known rough edge:** malformed ObjectIds on `/drafts/:id*`, `/selection/sessions/:id*`, and `/tasks/:id*` fail inside the Mongo driver and surface as **500 `DATABASE_ERROR`**, not 400/404. The frontend already works around this at `admin/templates/[id]/page.tsx`.

**Documentation locations** (per-subproject, unusually good and current — check these before implementing anything new):
- `unblock-ai-api/docs/architecture/project-overview.md` — the best single entry point for the backend
- `unblock-ai-api/docs/api/api-documentation.md` — all 34 endpoints with request/response bodies and per-route auth requirements
- `unblock-ai-api/docs/architecture/rag-implementation-guide.md` — retrieval design
- `unblock-ai-api/docs/postman/` — runnable collection that chains ids automatically
- `unblock-ai-web/docs/fe-api-migration-plan.md` — FE/API contract history (mostly resolved; see below)

**Frontend/backend contract status:** the migration plan at `unblock-ai-web/docs/fe-api-migration-plan.md` describes a set of risks found when the FE was aligned to the TypeScript backend rewrite. As of this writing those have been resolved in code: the `requester_context` stringification bug is fixed via `optionalObject` in `selection.controller.ts`, the `choose` response is correctly typed as `ChooseResponse`, `ApiError` carries the `code` field, and the Publish button is wired in `TemplateEditor.tsx`. Treat that migration doc as historical context, not a live task list.

---

## 4. HTTP API quick index

Full detail in `unblock-ai-api/docs/api/api-documentation.md`. Base URL: `http://localhost:3000/api`.

| Area | Endpoints | Auth |
|---|---|---|
| Health | `GET /health` | none |
| Auth | `POST /auth/login` · `GET /auth/me` · `POST /auth/logout` | none / `requireAuth()` / none |
| Workflows | `POST /workflows/extract` (preview) · `POST /workflows` · `GET /workflows` · `GET /workflows/:id` · `PUT /workflows/:id` · `POST /workflows/:id/validate` · `DELETE /workflows/:id` · `GET /workflows/deletions` · `GET /workflows/:id/record` · `PATCH /workflows/:id/review` | mostly `admin`; `GET` routes are `requireAuth()` |
| Drafts | `POST /drafts` · `GET /drafts` · `GET /drafts/:id` · `POST /drafts/:id/extract` | `admin` |
| Selection | `POST /selection/sessions` · `POST /selection/sessions/:id/answer` · `POST /selection/sessions/:id/choose` · `GET /selection/sessions/:id/workflow` | `requireAuth()` |
| Tasks | `POST /tasks` · `GET /tasks` · `GET /tasks/:id` · `GET /tasks/:id/next` · `POST /tasks/:id/values` · `POST /tasks/:id/finalize` · `PATCH /tasks/:id/status` · `POST /tasks/:id/start` · `GET /tasks/:id/status` · `GET /tasks/:id/document` | `requireAuth()` |
| Approvals | `GET /approvals/:token` · `POST /approvals/:token/decision` | none — the approval token IS the auth |

`admin` means `requireRole("admin")`: a `portal` token gets `403`, no token gets `401`.
`requireAuth()` accepts either audience. `DELETE /workflows/:id` is the only `DELETE`
route in the API.
