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

There are **eight** functional areas. Two admin areas (workflow template authoring, validation), three end-user paths
(selection, task planning, approval execution), plus auth and supporting infrastructure.

### A. Users, permissions & sessions
`src/services/authentication.service.ts` · `src/services/user-session.service.ts` · `src/services/user.service.ts` · `src/repositories/` · `src/middlewares/authenticate.middleware.ts` · `src/middlewares/require-*.middleware.ts`

- Real login backed by **PostgreSQL**: one `users` table, sign-in by **email** (stored
  trimmed and lower-cased, unique on `lower(email)`). There are no roles — each user holds
  **one or more permissions** from a fixed catalogue (`permissions` + `user_permissions`
  tables): `workflow:manage`, `task:create`, `task:approve`, `user:manage`. The "at least
  one permission" rule is enforced in `UserService` and by a deferred constraint trigger.
  `task:approve` gates the signed-in approvals inbox (`/api/approver/*`, area G).
- No self-registration. The bootstrap administrator (all four permissions) is created by
  `npm run seed:pg:run`; further users are created by a `user:manage` holder through
  `POST /api/users`. Every new user starts with the password in `USER_DEFAULT_PASSWORD`.
- Sessions are **opaque, server-side** (`user_sessions` table): login returns a random
  256-bit Bearer token and only its SHA-256 hash is stored. Expiry is absolute
  (`SESSION_TTL_HOURS`), a user may hold many concurrent sessions, logout revokes the
  current one immediately, and a user can list their sessions and revoke one or all others
  (`/api/auth/sessions`). The `authenticate` middleware populates `req.auth` on every request
  but never rejects by itself; `requireAuthentication()` and `requireAnyPermission(...)` do the
  gating per-route, and `requireTaskOwnership` limits `/tasks/:id*` to the task's creator.
  That split is what lets `/api/approvals/*` (a *different*, token-based auth mechanism)
  keep working for an approver with no session, while `/api/approver/*` requires a session
  and `task:approve`.
- Passwords are hashed with **`node:crypto` scrypt** — no `bcrypt`/`argon2` native-build
  dependency. Failed logins are counted per account; when `AUTH_MAX_FAILED_ATTEMPTS > 0` the
  account locks for `AUTH_LOCKOUT_DURATION_MINUTES` (rejected even with the right password).
  Enforcement is off by default (`AUTH_MAX_FAILED_ATTEMPTS=0`).
- Data access goes through repositories (user, user session and the organisation
  repositories), each with a Postgres and an in-memory implementation chosen by
  `POSTGRES_REPOSITORY_BACKEND` (`postgres` | `memory`).
- Workflow templates are never deleted, only archived and restored (area B), so there is no
  template deletion log. Task deletions are recorded in the Mongo `audit_logs` collection.
- Full design and phase-by-phase build log: [user-access-and-session-management-phase-plan.md](user-access-and-session-management-phase-plan.md).

### B. Workflow templates (admin write path)
`src/services/workflow-template.service.ts` · `src/models/workflow-template.model.ts` · `src/models/workflow-template-version.model.ts` · `src/services/embedding.service.ts`

- A template is a title plus a prompt, managed through `/api/workflow-templates`. Lifecycle:
  **draft** (title + prompt saved, nothing generated) → **unpublished** (generated, not yet
  offered) → **published** (offered to requesters).
- The `workflow_templates` collection (string UUID `_id`) holds the title, status,
  `current_version`, `draft_prompt` (a saved prompt not yet generated), the retrieval
  embedding of the current version, `archived_at` and `created_by`/`updated_by`. The API
  resolves those user ids to names.
- **Every generate creates a new immutable version** in `workflow_template_versions`
  (prompt + generated definition + attempt count). Once a template is published, regenerating
  publishes the new version immediately; older versions stay for the tasks that reference them.
- **The title lives on the template**, not the version: renaming never creates a version, but
  it does rebuild the retrieval embedding.
- **Archive/restore replaces delete.** Archived templates are read-only and invisible to
  retrieval; restoring makes them editable again with their status unchanged.
- Retrieval only sees **published, non-archived** templates. Nothing is findable until published.

### C. Workflow template generation — prompt → workflow JSON
`src/services/workflow-template-generation.service.ts`

The centrepiece. Four stages:

1. **Prompt assembly** — a long system prompt (`workflow-template-generation.prompt.ts`) encoding all schema semantics, plus **two few-shot examples** loaded from real sample files (`workflow-template-generation-few-shot.prompt.ts`). The generated definition includes its own `retrieval_summary`, so no separate summary call is made.
2. **Structured-output call** — Azure OpenAI with `response_format: json_schema, strict: true`, forcing schema-conformant JSON. `temperature: 0`, skipped for reasoning models (`o*`/`gpt-5*`, regex-detected).
3. **Two-layer validation** on every candidate (see D below).
4. **Self-repair loop** — on failure, the invalid JSON + formatted error list are appended as conversation turns and the model is asked to fix *only* those problems. Up to `WORKFLOW_TEMPLATE_GENERATION_MAX_ATTEMPTS` (default 3), then throws `WorkflowTemplateGenerationError` (HTTP 422, `WORKFLOW_TEMPLATE_GENERATION_FAILED`).

**Non-workflow guard:** if the model itself flags the prompt as not a process (`metadata.is_workflow === false`), that's rejected as a 422 (`WORKFLOW_TEMPLATE_PROMPT_REJECTED`) rather than a hallucinated workflow.

### D. Validation (standalone capability)
`src/services/validation.service.ts`

Deliberately separated from generation. Every generated candidate passes through it before a version is stored; there is no endpoint for saving hand-edited workflow JSON.

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

### E. Selection — the assistant conversation (end-user read path)
`src/services/selection.service.ts` · `selector.service.ts` · `retrieval.service.ts` · `requester-profile.service.ts` · `src/utils/selection/`

A short, **ephemeral and owned** chat that maps a plain-language request onto one published
template, using what the directory already knows about the requester:

1. **Profile** — `RequesterProfileService` reads the requester's memberships and designations
   from Postgres (no AI) and turns them into numbered facts (`P1: Member of Department of
   Information Technology (Faculty of Information Technology)`).
2. **Retrieval** — embed once, vector search, alias boost, `RETRIEVAL_TOP_K`, optional
   `RETRIEVAL_MIN_SCORE`. The candidate set is frozen on the session and reused for every
   later turn, so clarifications cost no second embedding.
3. **Eligibility before the LLM** (`candidate-eligibility.util.ts`) — a template whose
   `scope.applies_to.organisational_unit_codes` does not include one of the requester's units
   (or a unit's parent), or whose requester type does not fit, is dropped and reported in the
   thinking trace. No eligible candidate means **no LLM call**.
4. **Selector** — one structured-output call (`LlmOperation.workflow_selection`, optionally on
   a smaller model through `LLM_SELECTION_MODEL`) with the profile facts and compact
   candidates. It returns `matched`, `ambiguous` (one question with options), `no_match` or
   `start_requested`, plus the fact ids it relied on. `manual_choice` is produced by the
   service when `SELECTION_MAX_ROUNDS` is spent.

Sessions carry `created_by` and `expires_at` (`SELECTION_SESSION_TTL_HOURS`, Mongo TTL index).
Starting a task copies the conversation into the task and deletes the session.
`GET /selection/catalogue` lists everything the requester may start with no embedding and no
LLM. The API returns typed data only (decision, ids, trace, a deterministic workflow overview);
every assistant sentence is composed by the web app.

### F. Task plan and forms (end-user request path)
`src/services/task.service.ts` · `task-plan.service.ts` · `task-form.service.ts` · `task-engine.service.ts` ·
`task-effect-executor.service.ts` · `src/services/assignee-resolution/` · `src/utils/task/` · `src/models/task.model.ts`

`POST /tasks` (from a matched session or the catalogue) compiles a **complete stored plan**
from the version-pinned definition, with no AI:

- **Assignees** are resolved by a registry of deterministic resolvers. A role that is an active
  designation code is looked up among the requester's units narrowed to the template audience:
  one holder → locked (`directory`), several → a select field (`requester_choice`), none →
  `fallback_role` or the requester names the person (`requester_supplied`). Roles the directory
  does not model (for example `academic_advisor`) are always requester-supplied.
- **Forms** — one stored form per form step (`collects_inputs`), plus a synthesised **entry
  form** for every requester input no step claims. The entry form starts with a locked
  **Your details** section from the profile and, when needed, an **Approver details** section.
  Requester name, email, faculty, department and division are prefilled and locked; legacy
  input ids for those attributes map onto them. `file` inputs are listed as unsupported.
- **Engine** — `TaskEngineService` is a pure state machine returning `TaskEffect[]`; the
  effect executor issues approval tokens and sends email after a successful write. It branches
  on step kind (forms wait for the requester, approvals are dispatched, notifications and
  automated steps complete at once), evaluates conditions (`false` → skipped; missing data runs
  the step), and ends the task on a dead end. Writes use an optimistic `revision`.
- **Drafts any time, submit when active.** `PUT /tasks/:id/forms/:formId/draft` works on any
  unsubmitted form, even a later step's; `POST …/submit` only while the step is
  `awaiting_requester`, validated by `task-field-validator.util.ts`.

Task status: `in_progress`, `completed`, `rejected`, `cancelled`. Pre-revamp tasks were moved to
`legacy_tasks` by the `task-request-revamp` migration and are never read.

### G. Approval execution (approver path)
`src/services/approval.service.ts` · `approver-assignment.service.ts` · `notification.service.ts` ·
`task-transcript.service.ts` · `src/services/mailer/` · `src/utils/approval/` · `src/utils/document/`

Approvers decide through **two channels over one engine**: the emailed link, or the in-app
approvals inbox. Whichever decides first wins; the other sees the step as decided
(`409 APPROVAL_ALREADY_DECIDED` on a late decision). Each decision records `decided_via`
(`email_link` or `app`) and `decided_by_user_id`.

1. **Tokens** — an HMAC-signed token per dispatched approval, emailed as
   `${APP_PUBLIC_URL}/approvals/<token>`. Only `sha256(token)` is stored; it is cleared on
   decision (through either channel), cancel and expiry (`APPROVAL_TOKEN_TTL_DAYS`). No
   requester DTO contains it.
2. **In-app inbox** (`/api/approver/approvals/*`, `task:approve`) — pending, history, a pending
   count, the approver view and the decision. A step is the caller's when `assignee.user_id`
   matches, or `assignee.email` matches their normalised account email (so approvers the
   requester named by email are covered). The caller's own requests are excluded. The inbox
   ignores token state, so a failed or expired email never blocks a signed-in approver, and
   the whole flow works with mail off. Rules live in `utils/approval/approver-identity.util.ts`;
   `ApprovalService` shares one view builder and one decision path between both channels.
3. **Three decisions with comments** — `approved`, `rejected`, `request_more_info`. A comment is
   required for the last two. Rejection ends the task and revokes the other links.
4. **More information inserts steps** (`information-request-insertion.util.ts`) — the approval
   completes with `request_more_info`; an `information_request` step (one required answer
   field labelled with the approver's comment) and a repeat of the same approval are spliced in,
   and later steps are rewired to the repeat. Capped by `TASK_MAX_INFORMATION_REQUESTS_PER_STEP`.
5. **Notifications** — approval request, action required, information requested, rejected and
   completed emails. Never throw. `MAIL_TRANSPORT=console` prints them, approval URLs included.
   The approval email also points approvers who have an account to Approvals → Pending.
6. **Transcript** — rendered on demand from the task and its pinned definition, never stored:
   conversation, form answers, information request Q&A, approval trail with comments, skipped
   steps marked "Not required". Emailed on completion and downloadable from
   `GET /tasks/:id/transcript`.

### H. Frontend
`unblock-ai-web/`

**Sign-in and dashboard** — one `/login` page for every user, then `/dashboard`, whose sidebar
links the screens the user's permissions allow. `src/app/old/account/**` remains; the old
requester portal was removed.

**Workflow templates** (`/dashboard/workflows`, `src/components/workflow-templates/`) — list,
editor with prompt on the left and the generated flowchart on the right, Save / Generate /
Publish, version history. The flowchart header shows **Applies to** (audience units and
requester type), and each step shows **Directory** or **Requester provides** for its approver.

**Task requests** (`src/components/task-requests/`, `src/lib/task-request/`, `src/lib/hooks/useTask*.ts`,
`useSelection*.ts`):
- `/dashboard/tasks/new` — the assistant: greeting, **See what Unblock can do** drawer, chat
  with a thinking trace, match card with **Start this task** and **Tell me more**.
- `/dashboard/tasks/[taskId]` — the workspace: step rail, forms with locked prefilled fields,
  draft and submit, approver cards, information requests, outcome banner, plan drawer and
  transcript download. Polls while an approval is pending.
- `/dashboard/tasks` — the list with search, status filter and pagination.

**Approver page** (`/approvals/[token]`, `src/components/approvals/`) — no dashboard shell and no
sign-in. Request summary, requester, submitted sections, calculated values, information
exchanges, earlier decisions and the plan; three decision buttons with a comment dialog;
dedicated states for invalid (404) and expired (410) links.

**Approvals inbox** (`task:approve`; `src/components/approvals/inbox/`, `workspace/`,
`src/lib/approvals/`, `src/lib/hooks/useApproval*.ts`):
- `/dashboard/approvals` — Pending: oldest first, search, a **Repeat review** badge, polls every
  30 seconds. The sidebar shows the pending count on **Pending**.
- `/dashboard/approvals/history` — every decision with its comment, a decision filter, and the
  outcome ("Approved · now with Dean approval", "Waiting for the requester's answer").
- `/dashboard/approvals/[taskId]/[stepId]` — the same summary, history, plan rail and decision
  panel as the emailed page (`ApproverDetailLayout`), inside the dashboard. A step not assigned
  to the caller shows "This approval isn't available to you".

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
| Database | **MongoDB 7** — official driver, no ODM | Workflow templates, workflow template versions, tasks, selection sessions, task-deletion audit |
| Database (auth) | **PostgreSQL 17** via `pg` — official driver, no ORM | `users`, `permissions`, `user_permissions`, `user_sessions`, organisational structure; polyglot-persistence by design, see area A |
| Vector search | **Pluggable**: `memory` \| `atlas` | `createVectorStore` factory behind `IVectorStore` |
| Mailer | **Pluggable**: `console` \| `smtp` (`nodemailer`) | `createMailer` factory behind `IMailer`, mirrors `IVectorStore`'s shape |
| Repositories | **Pluggable**: `postgres` \| `memory` (`POSTGRES_REPOSITORY_BACKEND`) | User, user-session and organisation repositories, each an interface + Postgres + in-memory implementation behind a factory; `memory` backs `npm test` with no live Postgres |
| Config | **dotenv**, validated once at startup | `env.config.ts` is the *only* place reading `process.env` |
| Testing | **`node:test`** (built-in) via **tsx** + `mongodb-memory-server` | No Jest/Vitest |
| Dev runner | **tsx watch** | |

**Backend architecture:** strict layering — `routes → controllers → services → models → db`. Constructor-injected dependencies wired manually in `server.ts` (no DI container). Naming convention is `*.service.ts`, `*.controller.ts`, `*.util.ts`, `*.type.ts` throughout.

**Middleware chain** (`app.ts`): `requestId → requestLogger → cors → jsonBody (1MB cap) → authenticate → /api router → notFound → errorHandler`. Permission guards are attached per route inside the router.

**Error handling:** a `BaseError` hierarchy where each subclass carries its own `statusCode` and `toJSON()`, so the single error middleware needs no status lookup table. The error types map to consistent `{ error, code, details }` responses:

`ValidationError` 400 · `UnauthorizedError` 401 · `ForbiddenError` 403 · `NotFoundError` 404 · `ConflictError` 409 · `GoneError` 410 · `WorkflowTemplateGenerationError` 422 · `SelectionError`/`EmbeddingError` 502 · `DatabaseError`/`ConfigurationError` 500

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
- **Single API chokepoint** — `client.ts` is the only place calling `fetch`; feature modules (`workflow-templates.ts`, `selection.ts`, `tasks.ts`, `health.ts`, ...) build on it. `ApiError` carries `status`, `code`, `details`.
- **Hand-mirrored types** in `src/types/` — narrowed to match backend unions exactly, to avoid loose `string`/`Record<string, unknown>` fields that would absorb schema drift silently.
- **Pure transform layer** — `toFlowGraph.ts` (workflow → React Flow nodes/edges, with approver-source hints), `workflow-template-editor-state.ts` (template editor dirty / generation-state flags), and `src/lib/task-request/*` (conversation reducer, form draft state, client field validation, status presentation, progress numbering), each unit-tested.
- **Auth is a server-side session held by the API** — this app's own `POST /api/auth/login` Route Handler forwards email + password (and the browser's `User-Agent`) to the API and stores the returned opaque token in an httpOnly `ua_session` cookie (never set by the API directly, so the flow survives the API moving to another domain — see area A). `session.ts` resolves the current user by calling the API's `GET /auth/me` with that token. `proxy.ts` (the current Next convention for what used to be `middleware.ts`) only checks that the cookie exists before letting a request reach `/dashboard*` or `/old*`, redirecting to `/login` otherwise; the API validates the token on every call, so a revoked or expired session fails there. The web app holds no auth secret — its only env variable is `NEXT_PUBLIC_API_BASE_URL`. The requester's context is derived by the API from their affiliations; the web app sends none.

---

## 3. Things worth knowing for future work

**The workflow schema is the core design artifact** — `unblock-ai-api/src/data/schemas/workflow.schema.json`. Changing it ripples widely:

- `steps` is a **dependency graph**, not a list. Sequencing, parallelism, and gating all fall out of `depends_on: [{step_id, required_outcome}]`.
- **Actors are never named people** — four resolution modes (`dynamic`/`static`/`requester`/`system`). Unknown roles get flagged in `metadata.unmapped_roles`, not rejected.
- **Conditions and computed values are structured**, never free-text expressions. Fixed operator and operation sets.
- **Loop-backs stay acyclic** — "request more info" is an *outcome*, not a backward edge. At runtime the engine inserts an information request step and a repeat approval into the task's own step list; the definition never changes.
- **Strict-mode discipline**: every property must be present, `additionalProperties: false` everywhere. Unused scalars are `null`, unused arrays are `[]`. Required by OpenAI's `strict: true` mode.

**The two worked fixtures serve three roles at once** — few-shot prompt examples, validation test fixtures, *and* live generation-accuracy gold data. Any schema or prompt change must keep all three consistent.

**Not built yet** (explicitly out of scope):
- **No self-registration, password reset, or password change** — every user is created
  with `USER_DEFAULT_PASSWORD` (bootstrap administrator via `npm run seed:pg:run`, everyone
  else via `POST /api/users`) and keeps it. No user update, deactivate or delete endpoints
  yet. See area A.
- **No rate limiting by IP** on login — only per-account failed-attempt lockout, and even
  that is off by default (`AUTH_MAX_FAILED_ATTEMPTS=0`).
- **Approvers can work in the app or by email** — the approvals inbox (`/dashboard/approvals*`)
  and the emailed link both decide through the same engine. Approvers without an account, or
  without `task:approve`, keep the emailed link only. Self-approval through the emailed link
  is not blocked yet (the inbox excludes own requests). See
  [approver-inbox-phase-plan.md](approver-inbox-phase-plan.md) §12.
- **No academic advisor directory** — roles the directory does not model are named by the
  requester (name and email, unverified). Student attributes (index number, batch, degree
  programme) are not in the user model, so requesters type them.
- **No file uploads** — `file` inputs are listed as unsupported on the task.
- **No re-issue of expired approval links, reminders, SLA or escalation.**
- **No editing or withdrawing a submitted form** — cancelling the task is the escape hatch.
- **No per-user rate limiting of selection calls** — bounded by the 20-message session cap and
  `SELECTION_MAX_ROUNDS`.

**Ids:** a malformed task id is a `400` from the ownership guard; a malformed selection session id is a `404`, like an unknown one. Workflow template ids are UUIDs and are validated up front (400).

**Documentation locations** (per-subproject, unusually good and current — check these before implementing anything new):
- `unblock-ai-api/docs/architecture/project-overview.md` — the best single entry point for the backend
- `unblock-ai-api/docs/api/api-documentation.md` — every endpoint with request/response bodies and per-route permission requirements
- `unblock-ai-api/docs/architecture/rag-implementation-guide.md` — retrieval design
- `unblock-ai-api/docs/postman/` — runnable collection that chains ids automatically
- `unblock-ai-web/docs/fe-api-migration-plan.md` — FE/API contract history (mostly resolved; see below)

**Frontend/backend contract status:** the migration plan at `unblock-ai-web/docs/fe-api-migration-plan.md` describes a set of risks found when the FE was aligned to the TypeScript backend rewrite. As of this writing those have been resolved in code: the `requester_context` stringification bug is fixed via `optionalObject` in `selection.controller.ts`, the `choose` response is correctly typed as `ChooseResponse`, `ApiError` carries the `code` field, and the Publish action exists (now in the workflow template editor). Treat that migration doc as historical context, not a live task list.

---

## 4. HTTP API quick index

Full detail in `unblock-ai-api/docs/api/api-documentation.md`. Base URL: `http://localhost:3000/api`.

| Area | Endpoints | Auth |
|---|---|---|
| Health | `GET /health` | none |
| Auth | `POST /auth/login` · `GET /auth/me` · `POST /auth/logout` | none / authenticated / authenticated |
| Sessions | `GET /auth/sessions` · `DELETE /auth/sessions/others` · `DELETE /auth/sessions/:sessionId` | authenticated (own sessions only) |
| Users | `POST /users` · `GET /users` · `GET /users/:userId` | `user:manage` |
| Workflow templates | `GET /workflow-templates` · `POST /workflow-templates` (save draft) · `POST /workflow-templates/generate` · `GET /workflow-templates/:workflowTemplateId` · `PATCH /workflow-templates/:workflowTemplateId` · `POST /workflow-templates/:workflowTemplateId/generate` · `POST …/publish` · `POST …/archive` · `POST …/restore` · `GET …/versions` · `GET …/versions/:version` | `workflow:manage`; the `GET` endpoints also accept `task:create` |
| Selection | `GET /selection/catalogue` · `POST /selection/sessions` · `GET /selection/sessions/:id` · `POST /selection/sessions/:id/messages` · `POST /selection/sessions/:id/choose` · `DELETE /selection/sessions/:id` | `task:create`, own sessions only |
| Tasks | `POST /tasks` · `GET /tasks` · `GET /tasks/:id` · `GET /tasks/:id/workflow-definition` · `PUT /tasks/:id/forms/:formId/draft` · `POST /tasks/:id/forms/:formId/submit` · `POST /tasks/:id/cancel` · `GET /tasks/:id/transcript` · `DELETE /tasks/:id` | `task:create`, own tasks only |
| Approvals | `GET /approvals/:token` · `POST /approvals/:token/decision` | none — the approval token IS the auth |
| Approver inbox | `GET /approver/approvals/pending` · `GET /approver/approvals/history` · `GET /approver/approvals/summary` · `GET /approver/approvals/:taskId/steps/:stepId` · `POST /approver/approvals/:taskId/steps/:stepId/decision` | `task:approve`, assigned steps only, never the caller's own requests |

Authentication is a `Bearer` session token from `POST /auth/login`. A missing, expired or
revoked token gets `401 AUTHENTICATION_REQUIRED`; a valid token without any of the route's
permissions gets `403 PERMISSION_DENIED` (`requireAnyPermission`). `GET /tasks` returns only
the caller's tasks, and another user's task under `/tasks/:id*` returns `404`, so its
existence is not revealed.
