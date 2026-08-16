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

There are **five** functional areas. Two write paths (admin), one read path (end user), plus supporting infrastructure.

### A. Draft management (admin write path, step 1)
`src/services/draft.service.ts` · `src/models/draft.model.ts`

- Stores raw admin prose in the `drafts` collection.
- **Idempotent by SHA-256** of the normalised text — resubmitting identical text returns the original draft instead of creating a duplicate (`hash.util.ts`).
- Tracks lifecycle status: `pending` → `extracted` / `failed` / `rejected`.
- On a failed extraction, the draft is updated with `failure_reason` as a side effect before the error returns — so prose is never lost.

### B. LLM extraction — prose → workflow JSON
`src/services/extraction.service.ts`

The centrepiece. Four stages:

1. **Prompt assembly** — a long system prompt (`extraction.prompt.ts`) encoding all schema semantics, plus **two few-shot examples** loaded from real sample files (`extraction-few-shot.prompt.ts`).
2. **Structured-output call** — Azure OpenAI with `response_format: json_schema, strict: true`, forcing schema-conformant JSON. `temperature: 0`, skipped for reasoning models (`o*`/`gpt-5*`, regex-detected).
3. **Two-layer validation** on every candidate (see C below).
4. **Self-repair loop** — on failure, the invalid JSON + formatted error list are appended as conversation turns and the model is asked to fix *only* those problems. Up to `EXTRACTION_MAX_ATTEMPTS` (default 3), then throws `ExtractionError` (HTTP 422).

**Non-workflow guard:** if the model itself flags the input as not a process (`metadata.review_status === "rejected"`), that's rejected as a 422 rather than a hallucinated workflow.

### C. Validation (standalone capability)
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

### D. Versioned template storage + embeddings
`src/services/workflow.service.ts` · `src/services/embedding.service.ts`

- **Never updates in place** — every save creates a new version, auto-incrementing per `workflow_id` and demoting the previous `is_latest`.
- Each save generates a retrieval embedding.
- **`review_status` is the publish gate**: `pending_admin_review` → `confirmed` via `PATCH /workflows/:id/review`. Retrieval only sees `confirmed` + `is_latest` templates. Nothing is findable until published.

### E. Retrieval + Selector Agent (end-user read path)
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

### F. Frontend — two distinct UIs

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
| Database | **MongoDB 7** — official driver, no ODM | |
| Vector search | **Pluggable**: `memory` \| `atlas` | `createVectorStore` factory behind `IVectorStore` |
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
- **Auth is a mock seam** — `session.ts` returns hardcoded sessions, explicitly marked *"REPLACE BEFORE ANY DEPLOYMENT"*. Every component reads identity through `getSession()` so swapping in NextAuth touches one file.

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
- **No execution engine** — nothing runs a saved workflow, resolves actors against a real directory, evaluates conditions, or sends notifications. The schema is designed for it; none of it exists.
- **No authentication** on any HTTP route (`req.user` is always undefined; `submitted_by` is always `null`).
- **No directory/identity service** integration.
- **No `DELETE` endpoint** anywhere.
- Portal job list is **placeholder fixtures**, not real data.

**Known rough edge:** malformed ObjectIds on `/drafts/:id*` and `/selection/sessions/:id*` fail inside the Mongo driver and surface as **500 `DATABASE_ERROR`**, not 400/404. The frontend already works around this at `admin/templates/[id]/page.tsx`.

**Documentation locations** (per-subproject, unusually good and current — check these before implementing anything new):
- `unblock-ai-api/docs/architecture/project-overview.md` — the best single entry point for the backend
- `unblock-ai-api/docs/api/api-documentation.md` — all 18 endpoints with request/response bodies
- `unblock-ai-api/docs/architecture/rag-implementation-guide.md` — retrieval design
- `unblock-ai-api/docs/postman/` — runnable collection that chains ids automatically
- `unblock-ai-web/docs/fe-api-migration-plan.md` — FE/API contract history (mostly resolved; see below)

**Frontend/backend contract status:** the migration plan at `unblock-ai-web/docs/fe-api-migration-plan.md` describes a set of risks found when the FE was aligned to the TypeScript backend rewrite. As of this writing those have been resolved in code: the `requester_context` stringification bug is fixed via `optionalObject` in `selection.controller.ts`, the `choose` response is correctly typed as `ChooseResponse`, `ApiError` carries the `code` field, and the Publish button is wired in `TemplateEditor.tsx`. Treat that migration doc as historical context, not a live task list.

---

## 4. HTTP API quick index

Full detail in `unblock-ai-api/docs/api/api-documentation.md`. Base URL: `http://localhost:3000/api`.

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Workflows | `POST /workflows/extract` (preview) · `POST /workflows` · `GET /workflows` · `GET /workflows/:id` · `PUT /workflows/:id` · `POST /workflows/:id/validate` · `GET /workflows/:id/record` · `PATCH /workflows/:id/review` |
| Drafts | `POST /drafts` · `GET /drafts` · `GET /drafts/:id` · `POST /drafts/:id/extract` |
| Selection | `POST /selection/sessions` · `POST /selection/sessions/:id/answer` · `POST /selection/sessions/:id/choose` · `GET /selection/sessions/:id/workflow` |

No `DELETE` route exists anywhere in the API.
