# UNBLOCK-AI Backend Restructure — Phased Implementation Plan

> **Audience:** AI coding agents executing one phase at a time.
> **Rule:** Execute exactly one phase per hand-off. Do not start a later phase early. Do not "improve" things a phase declares out of scope.
> **Repository root referenced throughout:** `UNBLOCK-AI/` (all relative paths in this document are relative to that folder unless stated otherwise).

---

## 1. The Problem

### 1.1 What the project is today

UNBLOCK-AI is a Node.js backend that turns plain-English descriptions of institutional approval processes (university leave requests, event approvals, procurement, etc.) into strict, machine-executable JSON "workflow definitions", stores them as versioned templates in MongoDB, embeds them for semantic search, and then helps an end user find the right workflow through a short LLM-driven clarifying conversation.

Concretely, the current system does four things:

1. **Extraction** — takes prose, calls Azure OpenAI with a large system prompt plus few-shot examples and a strict JSON schema, validates the result against both a JSON Schema and a hand-written graph validator, and retries with a repair prompt up to 3 times.
2. **Storage** — persists raw admin drafts (`drafts`), versioned workflow templates with their embeddings (`templates`), and selection conversations (`selection_sessions`) in MongoDB.
3. **Retrieval** — renders each template into a canonical embedding text, embeds it with Azure AI Foundry, and searches by cosine similarity (in-memory today, Atlas `$vectorSearch` optionally), then applies an additive alias boost for exact lexical hits.
4. **Selection** — runs a bounded, multi-round clarifying loop where a "Selector Agent" LLM either matches a workflow, asks exactly one clarifying question, or declares no match; after a round cap it falls back to a manual pick list.

The code is competent and well-commented, but the **structure** is the problem, not the logic.

### 1.2 Why it must change

**Problem 1 — It is plain JavaScript, and it must become TypeScript.**
Every file under `src/` is ESM JavaScript (`"type": "module"`, `.js` extensions, `import ... from "./x.js"`). There is no compile step, no type checking, and no build output. Types exist only as JSDoc comments (`src/retrieval/vectorStore.js` has a `@typedef Candidate`; `src/knowledgeBank/mongoStore.js` documents its constructor deps in prose). The single richest type source in the project — `src/schema/workflow.schema.json`, a 511-line JSON Schema describing the entire workflow document — is never reflected into the type system at all. Every consumer of a workflow object today accesses deeply nested optional fields (`workflow.scope?.institution_type`, `c.retrieval_summary?.one_liner`, `row.document?.retrieval_summary`) with no compiler help. The project must become **Express + TypeScript**, compiled, with a real type layer.

**Problem 2 — Markdown documentation is scattered.**
There are eight markdown files in three different places with no consistent rule:

| File | Location | Size |
| --- | --- | --- |
| `IMPLEMENTATION_PLAN.md` | repo root | 968 lines |
| `RAG_IMPLEMENTATION_GUIDE.md` | repo root | 717 lines |
| `RAG_MONGODB_AZURE_SEARCH.md` | repo root | 363 lines |
| `WORKFLOW_SELECTION_PLAN.md` | repo root | 433 lines |
| `overview.md` | repo root | 223 lines |
| `docs/RUNNING_THE_APP.md` | `docs/` root | 291 lines |
| `docs/documentations/API_DOCUMENTATION.md` | `docs/documentations/` | 852 lines |
| `docs/plans/WORKFLOW_SELECTION_IMPLEMENTATION_PLAN.md` | `docs/plans/` | 5495 lines |

Five plan/design documents sit at the repo root next to `package.json`; a `docs/` folder already exists but is used inconsistently (`docs/RUNNING_THE_APP.md` is loose at the top of `docs/`, while others are nested); and the folder name `docs/documentations/` is redundant. There is also duplication: `WORKFLOW_SELECTION_PLAN.md` at the root and `docs/plans/WORKFLOW_SELECTION_IMPLEMENTATION_PLAN.md` cover overlapping material.

**Problem 3 — There is no standard layered structure.**
The current `src/` is organised by *technical topic* (`llm/`, `retrieval/`, `selector/`, `knowledgeBank/`, `validation/`, `db/`, `schema/`), not by *layer*. The consequences:

- **Routes contain controller logic.** `src/api/routes.js`, `src/api/draftRoutes.js`, and `src/api/selectionRoutes.js` each define the Express route *and* parse the body *and* validate input *and* branch on status codes *and* call the domain logic inline. There is no controller layer at all.
- **Routes reach into services' internals.** `src/api/selectionRoutes.js` accesses `selectionService.sessionStore.getById(...)` — the HTTP layer reaching two levels down into a service's private collaborator.
- **Routes contain serialization logic.** `serializeDraft()` lives at the bottom of `src/api/draftRoutes.js`.
- **Stores mix persistence with business logic.** `MongoWorkflowStore.save()` in `src/knowledgeBank/mongoStore.js` computes the next version number, renders embedding text, calls the Azure embedding API, demotes the previous `is_latest`, and inserts — persistence, orchestration, and an external network call in one method.
- **No models layer.** The three MongoDB collections (`drafts`, `templates`, `selection_sessions`) have their document shapes defined implicitly, scattered across the object literals inside `DraftStore.create()`, `MongoWorkflowStore.save()`, and `SelectionSessionStore.create()`. There is nothing you can read to learn what a `templates` document looks like.
- **Two competing "service" concepts.** `SelectionService` is a real service class; `extractWorkflow()` is a bare exported function doing the same kind of work.

**Problem 4 — Error handling is typed but structurally scattered.**
There are three error classes, each defined inside the module that throws it: `ExtractionError` inside `src/llm/extractWorkflow.js`, `SelectionError` inside `src/selector/selectorAgent.js`, `EmbeddingError` inside `src/retrieval/embeddings.js`. There is **no base error class**, no HTTP status carried on the error itself, and no error code. The mapping from error type to status code lives in a `Map` in `src/api/middleware/errorHandler.js`, so adding an error type requires editing a file in a different layer. Worse, all *validation* and *not-found* failures are not errors at all — they are inline `return res.status(400).json({...})` calls duplicated across routes (the string `"Body must include a 'workflow' object"` appears three times verbatim). `SelectionService.choose()` throws a bare `new Error(...)`, which the error handler maps to a 500 even though it is a client mistake (404/409).

**Problem 5 — Residual artifacts and dead code.**

- `txt.json` (18 KB) at the repo root — a stray dump of a `{"workflow": {...}}` request body for a `transcript_retrieval_request` workflow. Not imported by anything.
- `src/knowledgeBank/fileStore.js` (`FileWorkflowStore`) — the pre-Mongo persistence implementation. It is **not** used by `src/index.js`; it is referenced only by `tests/fileStore.test.js` and `tests/routes.test.js`. It also cannot satisfy the current retrieval path (no `listForRetrieval`, no embeddings, no `getRecord`, no `setReviewStatus`).
- `config.knowledgeBankPath` in `src/config/env.js` and `KNOWLEDGE_BANK_PATH` in `.env` / `.env.example` — read into config but consumed by nothing since the Mongo migration. The corresponding `data/workflows/` directory exists and is empty.
- `demo-drafts/` — three loose `.txt` demo files at the repo root with no code reference.
- `src/llm/azureClient.js` exports `smokeTest()`, a diagnostic function living in a production client module.
- **Docker leftovers:** there is no `Dockerfile`, `docker-compose.yml`, or `.dockerignore` in the repo, but `docs/RUNNING_THE_APP.md` documents Docker as the recommended MongoDB setup path. There is nothing to delete on disk; the audit must still be run and the finding recorded.
- `.gitignore` is 4 lines (`node_modules/`, `.env`, `data/`, `*.log`) and has no entry for a TypeScript build output directory.

**Problem 6 — Tests exist but are not organised, and will not survive the migration untouched.**
There are 11 unit test files in `tests/` (1,414 lines) and 6 live/integration files in `tests/live/` (311 lines) using `node:test`. They are flat — no `unit/` vs `integration/` split, no mirroring of the source structure. `tests/fileStore.test.js` (109 lines) tests a class slated for deletion. `tests/routes.test.js` (503 lines) constructs `FileWorkflowStore` as its default store, so it depends on the same doomed class. There is no test runner that understands TypeScript, no coverage configuration, and no `tests/` entry in any tsconfig.

**Problem 7 — The Postman collection is real but incomplete and hand-maintained.**
`docs/postman/UNBLOCK-AI.postman_collection.json` exists with 18 requests across 3 folders and an accompanying environment file. It covers all 14 current endpoints. However it has **no test scripts**, so nothing chains: `{{draftId}}`, `{{workflowId}}`, and `{{sessionId}}` are declared as collection variables but are never populated from a response, meaning a user must copy IDs by hand between requests. It must be regenerated against the new endpoint paths with `pm.test` / `pm.collectionVariables.set` scripts that make the whole collection runnable in sequence.

**Problem 8 — Inconsistent naming.**
File naming today is camelCase (`draftRoutes.js`, `mongoStore.js`, `extractWorkflow.js`, `renderSummary.js`, `selectionSessionStore.js`) with no layer suffix, so you cannot tell a route from a store from a pure helper by its filename. Folder naming mixes concepts (`knowledgeBank` is a domain word, `db` is a technical word, `api` is a layer word).

**Problem 9 — Composition root does too much, and startup order is fragile.**
`src/index.js` builds nine collaborators inline, decides the vector backend by reading `process.env.VECTOR_BACKEND` **directly** (bypassing the `config` module that every other consumer uses), calls `await ensureIndexes()` at module top level, mounts routes, starts the server, and registers signal handlers — all in 52 lines with no separation between "build the app" and "listen on a port". This makes the Express app untestable without binding a port.

**Problem 10 — Undocumented / unvalidated configuration.**
`CORS_ORIGIN` is read in `src/api/middleware/cors.js` via `process.env.CORS_ORIGIN` and `VECTOR_BACKEND` in `src/index.js` via `process.env.VECTOR_BACKEND`. Neither appears in `.env`, `.env.example`, or `src/config/env.js`. Two config-reading mechanisms coexist.

---

## 2. Proposed Implementation

### 2.1 Target technology baseline

| Concern | Target |
| --- | --- |
| Language | TypeScript (strict mode), compiled with `tsc` |
| Runtime | Node.js 18+ ESM (`"type": "module"` retained; `moduleResolution: "NodeNext"`) |
| Web framework | Express 5 (unchanged version) |
| Database | MongoDB via the official `mongodb` driver (unchanged) |
| LLM | Azure OpenAI / Azure AI Foundry via the `openai` SDK (unchanged) |
| Validation | Ajv 2020 + `ajv-formats` (unchanged) for the workflow JSON Schema; a small hand-written request validator for HTTP bodies |
| Build output | `dist/` (git-ignored) |
| Dev loop | `tsx watch` (replaces `nodemon` on raw JS) |
| Tests | `node:test` executed against compiled output or via `tsx` |

**Explicit non-negotiable constraint:** endpoint paths, file names, folder names, and internal organisation may all change. **The underlying core functionality of every existing feature must be fully preserved.** Concretely, all of the following must still work after the restructure: draft create/list/get, LLM extraction with schema+graph validation and repair-retry, template save-with-embedding and versioning, template read/list/update/validate, admin record fetch, review-status publishing, retrieval with alias boost, both vector-store backends, the multi-round selection loop with round cap and manual-choice fallback, session persistence, matched-workflow fetch, all five CLI scripts, index creation on boot, and graceful shutdown.

### 2.2 Target folder structure

```
UNBLOCK-AI/
├─ src/
│  ├─ app.ts                          # builds and returns the Express app; no listen()
│  ├─ server.ts                       # entry point: config load, DI wiring, listen, shutdown
│  ├─ routes/
│  │  ├─ index.route.ts               # mounts every route group under /api
│  │  ├─ draft.route.ts
│  │  ├─ workflow.route.ts
│  │  ├─ selection.route.ts
│  │  └─ health.route.ts
│  ├─ controllers/
│  │  ├─ draft.controller.ts
│  │  ├─ workflow.controller.ts
│  │  ├─ selection.controller.ts
│  │  └─ health.controller.ts
│  ├─ services/
│  │  ├─ draft.service.ts
│  │  ├─ workflow.service.ts
│  │  ├─ extraction.service.ts
│  │  ├─ embedding.service.ts
│  │  ├─ retrieval.service.ts
│  │  ├─ selector.service.ts
│  │  ├─ selection.service.ts
│  │  ├─ validation.service.ts
│  │  └─ vector-store/
│  │     ├─ vector-store.interface.ts
│  │     ├─ in-memory.vector-store.ts
│  │     └─ atlas.vector-store.ts
│  ├─ models/
│  │  ├─ draft.model.ts
│  │  ├─ template.model.ts
│  │  ├─ selection-session.model.ts
│  │  └─ index.model.ts
│  ├─ config/
│  │  ├─ env.config.ts
│  │  ├─ db.config.ts
│  │  ├─ azure-openai.config.ts
│  │  ├─ azure-embedding.config.ts
│  │  ├─ retrieval.config.ts
│  │  ├─ server.config.ts
│  │  └─ index.config.ts
│  ├─ middlewares/
│  │  ├─ cors.middleware.ts
│  │  ├─ json-body.middleware.ts
│  │  ├─ request-id.middleware.ts
│  │  ├─ request-logger.middleware.ts
│  │  ├─ async-handler.middleware.ts
│  │  ├─ not-found.middleware.ts
│  │  └─ error-handler.middleware.ts
│  ├─ utils/
│  │  ├─ shared/
│  │  │  ├─ logger.util.ts
│  │  │  ├─ hash.util.ts
│  │  │  ├─ object-id.util.ts
│  │  │  ├─ assert.util.ts
│  │  │  └─ env-parse.util.ts
│  │  ├─ workflow/
│  │  │  ├─ graph-validator.util.ts
│  │  │  ├─ schema-validator.util.ts
│  │  │  └─ namespace-path.util.ts
│  │  ├─ retrieval/
│  │  │  ├─ vector-math.util.ts
│  │  │  ├─ alias-boost.util.ts
│  │  │  └─ render-summary.util.ts
│  │  └─ http/
│  │     ├─ request-validator.util.ts
│  │     └─ serializer.util.ts
│  ├─ data/
│  │  ├─ prompts/
│  │  │  ├─ extraction.prompt.ts
│  │  │  ├─ extraction-few-shot.prompt.ts
│  │  │  ├─ selector.prompt.ts
│  │  │  └─ retrieval-summary.prompt.ts
│  │  ├─ schemas/
│  │  │  ├─ workflow.schema.json
│  │  │  ├─ workflow-schema.data.ts
│  │  │  ├─ decision.schema.ts
│  │  │  └─ retrieval-summary.schema.ts
│  │  ├─ vocabulary/
│  │  │  └─ role.vocabulary.ts
│  │  ├─ constants/
│  │  │  ├─ collection.constant.ts
│  │  │  ├─ status.constant.ts
│  │  │  └─ model.constant.ts
│  │  └─ samples/
│  │     ├─ input/            # from fixtures/input/
│  │     ├─ expected/         # from fixtures/expected/
│  │     ├─ selection/        # from fixtures/selection/
│  │     └─ demo-drafts/      # from demo-drafts/
│  ├─ lib/
│  │  └─ types/
│  │     ├─ workflow/
│  │     │  ├─ workflow.type.ts
│  │     │  ├─ step.type.ts
│  │     │  ├─ actor.type.ts
│  │     │  ├─ condition.type.ts
│  │     │  └─ retrieval-summary.type.ts
│  │     ├─ draft/draft.type.ts
│  │     ├─ template/template.type.ts
│  │     ├─ selection/
│  │     │  ├─ session.type.ts
│  │     │  ├─ decision.type.ts
│  │     │  └─ candidate.type.ts
│  │     ├─ retrieval/retrieval.type.ts
│  │     ├─ config/config.type.ts
│  │     ├─ http/http.type.ts
│  │     └─ index.type.ts
│  ├─ errors/
│  │  ├─ base.error.ts
│  │  ├─ validation.error.ts
│  │  ├─ not-found.error.ts
│  │  ├─ conflict.error.ts
│  │  ├─ extraction.error.ts
│  │  ├─ selection.error.ts
│  │  ├─ embedding.error.ts
│  │  ├─ database.error.ts
│  │  ├─ configuration.error.ts
│  │  └─ index.error.ts
│  └─ db/
│     ├─ mongo.client.ts
│     └─ index.definition.ts
├─ scripts/
│  ├─ init-db.script.ts
│  ├─ backfill-summaries.script.ts
│  ├─ evaluate-selection.script.ts
│  ├─ smoke-test-azure.script.ts
│  └─ smoke-test-embeddings.script.ts
├─ tests/
│  ├─ unit/
│  │  ├─ utils/
│  │  ├─ services/
│  │  ├─ models/
│  │  └─ errors/
│  ├─ integration/
│  ├─ live/
│  └─ helpers/
├─ docs/
│  ├─ api/
│  ├─ architecture/
│  ├─ guides/
│  ├─ plans/
│  └─ postman/
├─ dist/                              # build output, git-ignored
├─ .env
├─ .example.env
├─ .gitignore
├─ tsconfig.json
├─ package.json
└─ package-lock.json
```

### 2.3 Folder responsibilities

**`src/routes/`** — One file per route group. A route file does exactly three things: create an Express `Router`, attach middlewares that apply to that group, and bind each path+method to a controller method wrapped in `asyncHandler`. **A route file contains no business logic, no body parsing, no status-code decisions, and no `res.json` calls.** Route grouping does not have to mirror the current URL layout; what matters is that every current capability is reachable.

**`src/controllers/`** — Parses and validates the HTTP request (params, query, body), declares/assigns the variables the service needs, calls one or more services, maps the service result to an HTTP status code and response body, and returns. Controllers never touch MongoDB, never call the OpenAI SDK, and never contain domain rules. A controller throws typed errors from `src/errors/`; it never formats an error response itself.

**`src/services/`** — Owns all business logic. A service performs DB access through its model, calls utils for pure computation, and calls external resources (Azure chat completions, Azure embeddings). Services receive their collaborators through constructor injection, never by importing a concrete singleton. Strict separation of concerns: `extraction.service.ts` only extracts, `embedding.service.ts` only embeds, `retrieval.service.ts` only ranks, `selector.service.ts` only makes one model decision, `selection.service.ts` only orchestrates the multi-round loop.

**`src/models/`** — One model per MongoDB collection. A model owns: the collection name, the TypeScript document interface, the index specifications for that collection, and thin typed CRUD operations (`insertOne`, `findOne`, `updateOne`, `find`, projections). Models contain no business rules — no version-number computation, no embedding calls, no status transition policy. Those live in services.

**`src/config/`** — Separate config modules per concern, each exporting a frozen, fully-typed object read from `process.env` exactly once at load time and validated on read. `index.config.ts` re-exports a single composed `config` object. **After this restructure no file outside `src/config/` may read `process.env` directly.**

**`src/utils/`** — Pure helper functions only: no I/O, no config reads other than values passed as arguments, no class state. Organised into `shared/` (cross-feature: logging, hashing, ObjectId coercion, assertions, env parsing) plus feature-specific subfolders (`workflow/`, `retrieval/`, `http/`).

**`src/data/`** — Predefined and hardcoded data: LLM prompt templates, JSON Schemas and structured-output schemas, the role vocabulary, enum-like constants, and sample/seed data. No logic beyond simple string composition of prompts.

**`src/lib/types/`** — The central type location, a directory (never one big file), organised into subfolders by domain. Every folder has an index barrel; `index.type.ts` re-exports all domains.

**`src/errors/`** — A base error class plus one subclass per error category. The base carries `statusCode`, `code`, `details`, and `isOperational`. Subclasses set their own defaults, so the error handler reads the status off the error instead of maintaining a lookup table.

**`src/middlewares/`** — One middleware per file, single responsibility each, wired into routes only where applicable.

**`tests/`** — Outside `src/`. All unit tests under `tests/unit/`, mirroring the `src/` layout; integration tests (HTTP-level, in-memory fakes) under `tests/integration/`; network-dependent tests under `tests/live/`; shared fixtures and fake builders under `tests/helpers/`.

**`docs/`** — Outside `src/`. All markdown reorganised into `api/`, `architecture/`, `guides/`, `plans/`, and `postman/`.

**Root-level files** — `.env` (real secrets, git-ignored), `.example.env` (every variable with a safe placeholder), `.gitignore` (extended for `dist/`), `package.json` (TypeScript scripts and dependencies), `tsconfig.json`.

### 2.4 Cross-cutting architectural requirements

**Modularity and reusability.** Every module has exactly one export surface and one reason to change. Anything used by two or more callers becomes a util or a service, never a copy. The three duplicated body-validation blocks in the current routes collapse to one `request-validator.util.ts`. The two `summarize()` functions (one in `mongoStore.js`, one in `fileStore.js`) collapse to one serializer.

**SOLID.**
- *Single Responsibility* — the split of `MongoWorkflowStore.save()` into `template.model.ts` (persistence), `workflow.service.ts` (versioning policy), and `embedding.service.ts` (the network call) is the canonical example.
- *Open/Closed* — adding a new error type means adding a file to `src/errors/`, not editing the error handler.
- *Liskov* — `InMemoryVectorStore` and `AtlasVectorStore` both satisfy `IVectorStore` and are interchangeable at the composition root.
- *Interface Segregation* — `IVectorStore` declares only `search`. `ITemplateReader` (used by the in-memory store) declares only `listForRetrieval`, so the in-memory store does not depend on the full template model surface.
- *Dependency Inversion* — services depend on interfaces from `src/lib/types/`; concrete classes are chosen only in `src/server.ts`.

**DRY.** Single sources of truth: one embedding-text renderer, one ObjectId coercion helper, one collection-name constant set, one status enum set, one draft serializer, one candidate-projection shape, one reasoning-model regex (currently duplicated verbatim in `extractWorkflow.js` and `selectorAgent.js`), one `temperature` decision helper.

**OOP where appropriate.** Services and models are classes with injected dependencies. Errors are a class hierarchy. Pure functions stay functions — utils are not wrapped in classes for the sake of it.

**Error handling.** `BaseError extends Error` with `statusCode`, `code`, `details`, `isOperational`, and a `toJSON()`. Subclasses: `ValidationError` (400), `NotFoundError` (404), `ConflictError` (409), `ExtractionError` (422), `SelectionError` (502), `EmbeddingError` (502), `DatabaseError` (500), `ConfigurationError` (500). `error-handler.middleware.ts` becomes: if `err instanceof BaseError`, log at the appropriate level and respond with `err.statusCode` and `err.toJSON()`; otherwise log the stack and respond 500 with a generic message.

**Central types location.** `src/lib/types/` as described in §2.3, with the workflow types derived from the actual current `workflow.schema.json`, and the model document types derived from the actual documents written today.

**Clean code, no unnecessary comments.** The current codebase carries long explanatory comment blocks (some 15+ lines). Keep only comments that record a *non-obvious decision* and cannot be expressed in a name or type — for example why `selectorClient` is a separate `AzureOpenAI` instance from `azureClient` (the SDK builds the URL from the constructor deployment and ignores the body `model`), why `answer()` deliberately does not re-run retrieval, and why vectors are L2-normalised unconditionally. Delete restating comments, phase-number references ("see Phase 14", "Phase 6.8", "§0.4 rule 2"), and section banners.

**Residual artifact removal.** Delete `txt.json`, `fileStore.js` and its test, the unused `knowledgeBankPath` config and `KNOWLEDGE_BANK_PATH` env var, the empty `data/workflows/` directory, the loose `demo-drafts/` folder (contents relocated into `src/data/samples/demo-drafts/`), and `smokeTest()` from the production client module. Run an explicit Docker audit (`Dockerfile`, `docker-compose*.yml`, `.dockerignore`, `.devcontainer/`) and record the result.

**Postman collection.** Regenerated against the final endpoint paths, covering every endpoint, with request bodies, URLs, folder-level ordering, and `pm.test` scripts that assert status codes and write `draftId` / `workflowId` / `sessionId` into collection variables so the whole collection runs end-to-end via Collection Runner.

**File naming convention.** Angular-style dot notation everywhere: `<name>.<role>.ts`. Roles in use: `.route.ts`, `.controller.ts`, `.service.ts`, `.model.ts`, `.middleware.ts`, `.util.ts`, `.config.ts`, `.type.ts`, `.error.ts`, `.prompt.ts`, `.schema.ts`, `.constant.ts`, `.vocabulary.ts`, `.data.ts`, `.client.ts`, `.interface.ts`, `.script.ts`, `.test.ts`. Multi-word names use kebab-case (`selection-session.model.ts`, `in-memory.vector-store.ts`). Barrel files are `index.<role>.ts`.

### 2.5 Current-state inventory (authoritative reference for all phases)

#### 2.5.1 Endpoints (14 total, all mounted under `/api`)

| # | Method + path | Defined in | Behaviour |
| --- | --- | --- | --- |
| 1 | `POST /api/workflows/extract` | `routes.js` | Requires non-empty `text` (400 otherwise). Calls `extractWorkflow(text)`. Responds `{ workflow, validation: { valid: true, errors: [] }, attempts }`. |
| 2 | `POST /api/workflows` | `routes.js` | Requires `workflow` object (400). Runs `validateWorkflow` (422 with errors). Calls `store.save(workflow)`. 201 with `{ id, version }`. |
| 3 | `GET /api/workflows` | `routes.js` | Optional `?institution_type=`. Calls `store.list()`. Returns summary array. |
| 4 | `GET /api/workflows/:id` | `routes.js` | Optional `?version=` (numeric). Calls `store.getById`. 404 if absent. Returns the bare workflow document. |
| 5 | `PUT /api/workflows/:id` | `routes.js` | Requires `workflow` (400). Validates (422). Calls `store.update(id, workflow)` → saves a new version. Returns `{ id, version }`. |
| 6 | `POST /api/workflows/:id/validate` | `routes.js` | Requires `workflow` (400). Returns `{ valid, errors }`, always 200. Note: `:id` is accepted but unused. |
| 7 | `POST /api/drafts` | `draftRoutes.js` | Requires non-empty `text`; optional `title`. Reads `req.user?.id` (always undefined — no auth middleware exists). Calls `draftStore.create`. 201 with serialized draft. Idempotent by SHA-256 of normalised text. |
| 8 | `GET /api/drafts` | `draftRoutes.js` | Lists up to 50 drafts, newest first. |
| 9 | `GET /api/drafts/:id` | `draftRoutes.js` | 404 if absent. Returns serialized draft. |
| 10 | `POST /api/drafts/:id/extract` | `draftRoutes.js` | 404 if draft absent. Runs extraction on `draft.raw_text`, saves as new template version linked by `draftId`, marks the draft extracted. On `ExtractionError`: marks the draft `rejected` if the message matches `/does not describe a workflow/i`, else `failed`, then rethrows (→ 422). 201 with `{ draft_id, workflow_id, version, attempts, review_status, workflow }`. |
| 11 | `GET /api/workflows/:id/record` | `draftRoutes.js` | Optional `?version=`. Returns `{ workflow_id, version, draft_id, review_status, document, updated_at }`. 404 if absent. |
| 12 | `PATCH /api/workflows/:id/review` | `draftRoutes.js` | Body `{ review_status, version? }`. 400 unless `review_status` ∈ `REVIEW_STATUS` values. 404 if record absent. Calls `store.setReviewStatus`. Returns the summary. |
| 13 | `POST /api/selection/sessions` | `selectionRoutes.js` | Requires non-empty `query`; optional `requester_context`, `institution_type`. Calls `selectionService.start`. 201 with the selection response. |
| 14a | `POST /api/selection/sessions/:id/answer` | `selectionRoutes.js` | Requires non-empty `answer`. Calls `selectionService.answer`. 200. |
| 14b | `POST /api/selection/sessions/:id/choose` | `selectionRoutes.js` | Requires `workflow_id`. Calls `selectionService.choose`. 200. |
| 14c | `GET /api/selection/sessions/:id/workflow` | `selectionRoutes.js` | Reaches into `selectionService.sessionStore.getById`. 409 if the session has no `selected_workflow_id`; 404 if the workflow is missing; else the workflow document. |

(Rows 14a–14c are three distinct endpoints; the total endpoint count is 17 route bindings across 14 numbered entries — treat all 17 bindings as in scope.)

#### 2.5.2 Database — MongoDB, database name from `MONGODB_DB` (default `unblock_ai`)

**Collection `drafts`** — written by `DraftStore`:
`_id` (ObjectId), `raw_text` (string, write-once), `text_sha256` (string, unique index), `title` (string|null), `submitted_by` (string|null), `status` (`pending`|`extracted`|`failed`|`rejected`), `failure_reason` (string|null, truncated to 2000 chars), `workflow_id` (string|null), `created_at` (Date), `updated_at` (Date).

**Collection `templates`** — written by `MongoWorkflowStore`:
`_id`, `workflow_id` (string), `version` (number), `draft_id` (ObjectId|null), `title`, `description`, `institution_type` (string|null, from `workflow.scope.institution_type`), `schema_version`, `review_status`, `document` (the full workflow JSON), `is_latest` (boolean), `retrieval` (`{ text, embedding: number[1536], aliases_lower: string[], model, dim, embedded_at }`), `created_at`, `updated_at`.

**Collection `selection_sessions`** — written by `SelectionSessionStore`:
`_id`, `user_query`, `candidates[]` (`{ workflow_id, version, title, score, base_score, alias_hits, retrieval_summary }` — deliberately excludes the embedding), `rounds[]` (`{ question, options, answer, asked_at, answered_at }`), `outcome` (`matched`|`abandoned`|`no_match`|null), `selected_workflow_id` (string|null), `requester_context` (any|null), `created_at`, `updated_at`.

**Indexes** (from `src/db/indexes.js`, created idempotently on every boot): `draft_text_sha256_unique` (unique), `draft_created_desc`, `template_id_version_unique` (unique), `template_latest`, `template_retrieval_filter`, `session_created_desc`. Additionally an Atlas Search index named `template_vector_index` on `retrieval.embedding` is required when `VECTOR_BACKEND=atlas`; it is created out-of-band in Atlas, not by this code.

#### 2.5.3 External service calls

| Call site | Service | Detail |
| --- | --- | --- |
| `src/llm/azureClient.js` | Azure OpenAI chat | Client bound to `AZURE_OPENAI_DEPLOYMENT`. Used by extraction and the backfill script. |
| `src/llm/extractWorkflow.js` | Azure OpenAI chat | `chat.completions.create` with `response_format: json_schema` (`strict: true`), `temperature: 0` unless the deployment matches `/^(o\d|gpt-5)/i`. Retries up to 3 times with a repair prompt. |
| `src/selector/selectorClient.js` | Azure OpenAI chat | Separate client bound to `AZURE_SELECTOR_DEPLOYMENT` (falls back to `AZURE_OPENAI_DEPLOYMENT`). |
| `src/selector/selectorAgent.js` | Azure OpenAI chat | One call per decision with the `workflow_selection_decision` strict schema. Short-circuits to `no_match` with zero candidates. |
| `src/retrieval/embeddingClient.js` | Azure AI Foundry embeddings | Separate endpoint/key/deployment. |
| `src/retrieval/embeddings.js` | Azure AI Foundry embeddings | `embeddings.create`; validates the returned dimension against `AZURE_EMBEDDING_DIM`; L2-normalises. |
| `src/retrieval/atlasVectorStore.js` | MongoDB Atlas | `$vectorSearch` on index `template_vector_index`, `numCandidates = max(100, k*20)`. |
| `scripts/backfillSummaries.js` | Azure OpenAI chat | Its own inline prompt and `retrieval_summary` strict schema. |

#### 2.5.4 Environment variables

Read via `src/config/env.js` (`dotenv/config`): `AZURE_OPENAI_ENDPOINT`\*, `AZURE_OPENAI_API_KEY`\*, `AZURE_OPENAI_DEPLOYMENT`\*, `AZURE_OPENAI_API_VERSION`\*, `AZURE_SELECTOR_DEPLOYMENT`, `AZURE_EMBEDDING_ENDPOINT`\*, `AZURE_EMBEDDING_API_KEY`\*, `AZURE_EMBEDDING_DEPLOYMENT`\*, `AZURE_EMBEDDING_API_VERSION`, `AZURE_EMBEDDING_DIM`, `MONGODB_URI`\*, `MONGODB_DB`, `RETRIEVAL_TOP_K`, `RETRIEVAL_ALIAS_BOOST`, `SELECTION_MAX_ROUNDS`, `PORT`, `KNOWLEDGE_BANK_PATH` (**dead**). (\* = in `REQUIRED_VARS`.)

Read directly from `process.env`, bypassing config: `CORS_ORIGIN` (in `cors.js`, default `http://localhost:3001`), `VECTOR_BACKEND` (in `index.js`, `"atlas"` selects `AtlasVectorStore`). Neither is in `.env` or `.env.example`.

#### 2.5.5 Existing tests

`tests/`: `aliasBoost.test.js` (36), `fileStore.test.js` (109), `graphValidator.test.js` (112), `mongoStore.test.js` (134), `renderSummary.test.js` (42), `routes.test.js` (503), `schema.test.js` (32), `selectionService.test.js` (325), `selectorAgent.test.js` (124), `vectorMath.test.js` (26), `vectorStore.test.js` (125).
`tests/live/`: `consistency.test.js` (69), `extractionAccuracy.test.js` (67), `generalisation.test.js` (41), `robustness.test.js` (50), `selectionQuality.test.js` (70), `helpers.js` (14).

#### 2.5.6 Residual artifacts

`txt.json` (root, 18 KB, unreferenced); `src/knowledgeBank/fileStore.js` + `tests/fileStore.test.js` (superseded); `data/workflows/` (empty, from the dead `KNOWLEDGE_BANK_PATH`); `demo-drafts/` (3 loose `.txt` files, unreferenced by code); `smokeTest()` inside `azureClient.js`; root-level plan markdown (5 files); Docker: **no files present**, only prose references in `docs/RUNNING_THE_APP.md`.

---

## 3. Phased Plan

There are **fifteen** phases. Each depends only on phases before it.

**Rules that apply to every phase:**
- Do not delete a source file until the phase that explicitly says to delete it. Migration phases *copy and translate*; the cleanup phase deletes.
- Every new file uses dot-notation naming per §2.4.
- Every new file is TypeScript with explicit types on all exported functions, classes, and constants.
- Never read `process.env` outside `src/config/`.
- Do not add comments that restate the code.
- After every phase, `npx tsc --noEmit` must exit 0.

---

### Phase 1 — TypeScript toolchain and skeleton folder tree

**Goal.** Turn the repository into a compiling TypeScript project and create the entire empty target folder tree, so every later phase has a place to put files. It is first because nothing else can be authored in TypeScript until `tsconfig.json` and the compiler exist.

**Preconditions.**
- Node.js 18+ and npm available.
- The current JavaScript app runs (`npm start`).
- No files have been deleted yet.

**Exact file/folder actions.**

*Create files:*
- `tsconfig.json`
- `src/lib/types/.gitkeep` (temporary placeholder, deleted in Phase 3)

*Create directories (empty for now):*
`src/routes/`, `src/controllers/`, `src/services/`, `src/services/vector-store/`, `src/models/`, `src/config/`, `src/middlewares/`, `src/utils/shared/`, `src/utils/workflow/`, `src/utils/retrieval/`, `src/utils/http/`, `src/data/prompts/`, `src/data/schemas/`, `src/data/vocabulary/`, `src/data/constants/`, `src/data/samples/`, `src/lib/types/workflow/`, `src/lib/types/draft/`, `src/lib/types/template/`, `src/lib/types/selection/`, `src/lib/types/retrieval/`, `src/lib/types/config/`, `src/lib/types/http/`, `src/errors/`, `tests/unit/`, `tests/integration/`, `tests/helpers/`, `docs/api/`, `docs/architecture/`, `docs/guides/`.

*Modify:* `package.json`, `.gitignore`.

*Delete:* nothing.

**Step-by-step instructions.**

1. Run `npm install --save-dev typescript@^5.6 tsx@^4.19 @types/node@^22 @types/express@^5`.
2. Create `tsconfig.json` with: `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `lib: ["ES2022"]`, `rootDir: "."`, `outDir: "dist"`, `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: false`, `esModuleInterop: true`, `resolveJsonModule: true`, `skipLibCheck: true`, `forceConsistentCasingInFileNames: true`, `declaration: false`, `sourceMap: true`. Set `include: ["src/**/*", "scripts/**/*", "tests/**/*"]` and `exclude: ["node_modules", "dist"]`. Add `paths` mapping `"@/*": ["src/*"]` with `baseUrl: "."` **only if** you also add a runtime resolver; otherwise omit `paths` entirely and use relative imports. **Default decision: omit `paths`; use relative imports throughout.**
3. Because `module` is `NodeNext` and `package.json` has `"type": "module"`, **every relative import in every new `.ts` file must carry a `.js` extension** (e.g. `import { logger } from "../utils/shared/logger.util.js";`). Apply this rule in every subsequent phase without exception.
4. In `package.json`, add scripts: `"build": "tsc"`, `"typecheck": "tsc --noEmit"`, `"dev": "tsx watch src/server.ts"`, `"start": "node dist/src/server.js"`. **Leave the existing `start`, `dev`, `test`, and the five script entries in place for now** — rename the old ones to `"legacy:start"`, `"legacy:dev"`, `"legacy:test"` so the JavaScript app remains runnable during migration. Phase 14 removes them.
5. Create every directory listed above. Put a `.gitkeep` in any directory that will still be empty at the end of this phase.
6. Append to `.gitignore`: `dist/`, `*.tsbuildinfo`, `coverage/`.
7. Run `npx tsc --noEmit`. With no `.ts` source files yet it must exit 0.

**Mapping from old to new.** None — this phase adds only.

**Out of scope for this phase.** Do not convert, move, or delete any `.js` file. Do not touch `src/`'s existing contents. Do not touch `docs/`. Do not change `.env` or `.env.example`.

**Acceptance criteria.**
- [ ] `tsconfig.json` exists with `strict: true` and `module: "NodeNext"`.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run legacy:start` still boots the existing JavaScript server.
- [ ] All directories in §2.2 exist (empty or `.gitkeep`-only).
- [ ] `.gitignore` contains `dist/`.
- [ ] No `.js` file was modified or deleted.

---

### Phase 2 — Configuration layer

**Goal.** Establish the single, typed, validated source of configuration, including the two variables that currently bypass config (`CORS_ORIGIN`, `VECTOR_BACKEND`) and excluding the dead one (`KNOWLEDGE_BANK_PATH`). It comes second because nearly every later module imports config.

**Preconditions.** Phase 1 complete; `npx tsc --noEmit` exits 0.

**Exact file/folder actions.**

*Create:*
- `src/utils/shared/env-parse.util.ts`
- `src/lib/types/config/config.type.ts`
- `src/config/env.config.ts`
- `src/config/server.config.ts`
- `src/config/db.config.ts`
- `src/config/azure-openai.config.ts`
- `src/config/azure-embedding.config.ts`
- `src/config/retrieval.config.ts`
- `src/config/index.config.ts`

*Modify:* `.env`, `.env.example` → renamed to `.example.env`.

*Delete:* nothing. (`src/config/env.js` stays until Phase 14.)

**Step-by-step instructions.**

1. Create `src/utils/shared/env-parse.util.ts` exporting four pure functions: `requireString(name: string, raw: string | undefined): string` (throws if empty/undefined), `optionalString(name, raw, fallback: string): string`, `parseNumber(name, raw, fallback: number): number` (throws if present but non-numeric), `parseEnum<T extends string>(name, raw, allowed: readonly T[], fallback: T): T` (throws if present but not in `allowed`). These functions take the raw value as an argument — they do not read `process.env` themselves.
2. Create `src/lib/types/config/config.type.ts` exporting interfaces: `ServerConfig { port: number; corsOrigin: string; nodeEnv: "development" | "production" | "test" }`, `DbConfig { uri: string; dbName: string; serverSelectionTimeoutMs: number }`, `AzureOpenAIConfig { endpoint: string; apiKey: string; deployment: string; apiVersion: string; selectorDeployment: string; maxExtractionAttempts: number }`, `AzureEmbeddingConfig { endpoint: string; apiKey: string; deployment: string; apiVersion: string; dimensions: number }`, `RetrievalConfig { topK: number; aliasBoost: number; maxSelectionRounds: number; vectorBackend: "memory" | "atlas"; atlasIndexName: string }`, and `AppConfig` composing all five.
3. Create `src/config/env.config.ts`: it calls `import "dotenv/config";` at the top (the only place in the codebase that does so) and exports `const rawEnv = process.env;` typed as `NodeJS.ProcessEnv`. **This is the only file permitted to reference `process.env`.**
4. Create each of the five domain config modules. Each imports `rawEnv` and the parse utils, builds its typed object, and exports it via `Object.freeze`. Field-by-field sources:
   - `server.config.ts` → `port` from `PORT` (default `3000`), `corsOrigin` from `CORS_ORIGIN` (default `"http://localhost:3001"`), `nodeEnv` from `NODE_ENV` (enum, default `"development"`).
   - `db.config.ts` → `uri` from `MONGODB_URI` (**required**), `dbName` from `MONGODB_DB` (default `"unblock_ai"`), `serverSelectionTimeoutMs` hardcoded `5000` (matches current `mongoClient.js`).
   - `azure-openai.config.ts` → `endpoint`/`apiKey`/`deployment`/`apiVersion` from `AZURE_OPENAI_*` (**all required**), `selectorDeployment` from `AZURE_SELECTOR_DEPLOYMENT` falling back to `deployment`, `maxExtractionAttempts` from `EXTRACTION_MAX_ATTEMPTS` (default `3`, matching the current `DEFAULT_MAX_ATTEMPTS`).
   - `azure-embedding.config.ts` → `endpoint`/`apiKey`/`deployment` from `AZURE_EMBEDDING_*` (**required**; `deployment` keeps its current `"text-embedding-3-small"` fallback but stays in the required list to match current behaviour), `apiVersion` default `"2024-10-21"`, `dimensions` from `AZURE_EMBEDDING_DIM` (default `1536`).
   - `retrieval.config.ts` → `topK` from `RETRIEVAL_TOP_K` (default `5`), `aliasBoost` from `RETRIEVAL_ALIAS_BOOST` (default `0.15`), `maxSelectionRounds` from `SELECTION_MAX_ROUNDS` (default `2`), `vectorBackend` from `VECTOR_BACKEND` (enum `["memory","atlas"]`, default `"memory"`), `atlasIndexName` from `ATLAS_VECTOR_INDEX` (default `"template_vector_index"`).
5. Create `src/config/index.config.ts` exporting `export const config: AppConfig = Object.freeze({ server, db, azureOpenAI, azureEmbedding, retrieval });`.
6. **Do not add** `knowledgeBankPath` anywhere. It is dead.
7. Rename `.env.example` → `.example.env` (`git mv .env.example .example.env`). Rewrite it to list, in this order with placeholders and one-line comments: `NODE_ENV`, `PORT`, `CORS_ORIGIN`, `MONGODB_URI`, `MONGODB_DB`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`, `AZURE_SELECTOR_DEPLOYMENT`, `EXTRACTION_MAX_ATTEMPTS`, `AZURE_EMBEDDING_ENDPOINT`, `AZURE_EMBEDDING_API_KEY`, `AZURE_EMBEDDING_DEPLOYMENT`, `AZURE_EMBEDDING_API_VERSION`, `AZURE_EMBEDDING_DIM`, `RETRIEVAL_TOP_K`, `RETRIEVAL_ALIAS_BOOST`, `SELECTION_MAX_ROUNDS`, `VECTOR_BACKEND`, `ATLAS_VECTOR_INDEX`. **Never put a real secret in this file.**
8. In `.env`, remove the `KNOWLEDGE_BANK_PATH` line and add `NODE_ENV`, `CORS_ORIGIN`, `VECTOR_BACKEND`, `ATLAS_VECTOR_INDEX`, `EXTRACTION_MAX_ATTEMPTS` with values matching current runtime behaviour (`development`, `http://localhost:3001`, `memory`, `template_vector_index`, `3`). **Do not alter any existing secret value.**
9. Add `.example.env` is *not* ignored; confirm `.gitignore` still ignores `.env` only.
10. Run `npx tsc --noEmit`.

**Mapping from old to new.**

| Old | New |
| --- | --- |
| `src/config/env.js` → `config.azure.*` | `src/config/azure-openai.config.ts` |
| `src/config/env.js` → `config.embeddings.*` | `src/config/azure-embedding.config.ts` |
| `src/config/env.js` → `config.mongo.*` | `src/config/db.config.ts` |
| `src/config/env.js` → `config.retrieval.*` | `src/config/retrieval.config.ts` (+ `vectorBackend`, `atlasIndexName`) |
| `src/config/env.js` → `config.port` | `src/config/server.config.ts` |
| `src/config/env.js` → `config.knowledgeBankPath` | **deleted, no replacement** |
| `process.env.CORS_ORIGIN` in `cors.js` | `config.server.corsOrigin` |
| `process.env.VECTOR_BACKEND` in `index.js` | `config.retrieval.vectorBackend` |
| `numberEnv` / `requireEnv` in `env.js` | `src/utils/shared/env-parse.util.ts` |
| `DEFAULT_MAX_ATTEMPTS` in `extractWorkflow.js` | `config.azureOpenAI.maxExtractionAttempts` |
| `serverSelectionTimeoutMS: 5000` in `mongoClient.js` | `config.db.serverSelectionTimeoutMs` |
| `.env.example` | `.example.env` |

**Out of scope.** Do not delete `src/config/env.js` or `src/config/constants.js`. Do not touch any consumer of the old config. Do not create the Mongo client, logger, or errors.

**Acceptance criteria.**
- [ ] `src/config/env.config.ts` is the only file in the repo containing the string `process.env` (outside `src/config/env.js`, which still exists but is untouched).
- [ ] `.example.env` exists, `.env.example` does not, and `.example.env` lists all 21 variables with placeholders and no secrets.
- [ ] `.env` no longer contains `KNOWLEDGE_BANK_PATH`.
- [ ] Importing `src/config/index.config.ts` with a complete `.env` throws nothing; with `MONGODB_URI` removed it throws a message naming `MONGODB_URI`.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] No string `knowledgeBankPath` exists in `src/config/`.

---

### Phase 3 — Type layer

**Goal.** Author the complete central type directory, derived from the real `workflow.schema.json` and the real MongoDB document shapes, so every subsequent phase can be written type-first. It precedes errors and utils because both reference domain types.

**Preconditions.** Phase 2 complete.

**Exact file/folder actions.**

*Create:*
- `src/lib/types/workflow/actor.type.ts`
- `src/lib/types/workflow/condition.type.ts`
- `src/lib/types/workflow/step.type.ts`
- `src/lib/types/workflow/retrieval-summary.type.ts`
- `src/lib/types/workflow/workflow.type.ts`
- `src/lib/types/workflow/index.type.ts`
- `src/lib/types/draft/draft.type.ts`
- `src/lib/types/draft/index.type.ts`
- `src/lib/types/template/template.type.ts`
- `src/lib/types/template/index.type.ts`
- `src/lib/types/selection/candidate.type.ts`
- `src/lib/types/selection/decision.type.ts`
- `src/lib/types/selection/session.type.ts`
- `src/lib/types/selection/index.type.ts`
- `src/lib/types/retrieval/retrieval.type.ts`
- `src/lib/types/retrieval/index.type.ts`
- `src/lib/types/http/http.type.ts`
- `src/lib/types/http/index.type.ts`
- `src/lib/types/index.type.ts`

*Delete:* `src/lib/types/.gitkeep`.

**Step-by-step instructions.**

1. Open `src/schema/workflow.schema.json` and read it in full (511 lines). Every type below must be derived from it, not invented.
2. `actor.type.ts` — `ActorResolution = "dynamic" | "static" | "requester" | "system"`; `interface Actor { resolution: ActorResolution; role: string | null; relative_to: string | null; directory_query: string | null; fallback_role: string | null; display_name: string | null; }`. All six keys are always present (the schema requires them, unused ones are `null`).
3. `condition.type.ts` — a discriminated union covering both comparison conditions (`operator`, `left`, `right`) and compound conditions (`operator: "and" | "or" | "not"`, `clauses: Condition[]`), matching the schema's `$defs.condition`. Also export `NamespaceRoot = "inputs" | "computed" | "steps" | "requester" | "system"` and `type NamespacePath = string`.
4. `step.type.ts` — `StepOutcomeAction`, `interface StepOutcome { action: StepOutcomeAction; notify: Actor[]; include_reason: boolean | null; return_to_step: string | null; prompt_source: string | null }`; `interface StepOutcomes { approved: StepOutcome | null; rejected: StepOutcome | null; request_more_info: StepOutcome | null }`; `interface ResponseField { id: string; label: string; type: string; required_on_outcome: string[] }`; `interface StepDependency { step_id: string; required_outcome: string }`; `interface ContextBinding { step_id: string; field: string; as: string }`; `interface WorkflowStep { id; name; type; description; assignee: Actor; depends_on: StepDependency[]; initial_state; blocked_reason: string | null; condition: Condition | null; instructions_to_approver: string | null; response_fields: ResponseField[]; context_from_steps: ContextBinding[]; outcomes: StepOutcomes; notifications; sla }`. Take each field's exact name and nullability from the schema.
5. `retrieval-summary.type.ts` — `interface RetrievalSummary { one_liner: string; aliases: string[]; keywords: string[]; requester_types: string[]; triggers: string[]; not_for: string[] }` (all six required, per the schema).
6. `workflow.type.ts` — `interface WorkflowInput`, `interface WorkflowComputed` (with the fixed operation union `"date_diff_days" | "sum" | "difference" | "multiply" | "count" | "lookup" | "constant"` and the fixed `arguments` key set), `interface WorkflowScope`, `interface WorkflowRequester`, `interface WorkflowCompletion`, `interface WorkflowMetadata` (including `review_status`, `ambiguities: string[]`, `unmapped_roles: string[]`, `confidence`), and the top-level `interface WorkflowDefinition` with all twelve required keys in schema order.
7. `draft.type.ts` — `DraftStatus = "pending" | "extracted" | "failed" | "rejected"`; `interface DraftDocument` matching §2.5.2 exactly, with `_id: ObjectId`; `interface DraftDto` — the serialized shape currently produced by `serializeDraft()` in `draftRoutes.js`: `{ id: string; title: string | null; raw_text: string; status: DraftStatus; failure_reason: string | null; workflow_id: string | null; created_at: Date; updated_at: Date }`; `interface CreateDraftInput { rawText: string; title?: string | null; submittedBy?: string | null }`.
8. `template.type.ts` — `ReviewStatus = "pending_admin_review" | "confirmed" | "rejected"`; `interface TemplateRetrieval { text: string; embedding: number[]; aliases_lower: string[]; model: string; dim: number; embedded_at: string }`; `interface TemplateDocument` matching §2.5.2; `interface TemplateSummary` — the shape returned by the current `summarize()`: `{ workflow_id; title; description; version; schema_version; review_status; draft_id: string | null; updated_at: string }`; `interface TemplateRecordDto` — the shape returned by `GET /workflows/:id/record`; `interface RetrievalProjection` — the projected shape from `listForRetrieval`; `interface SaveResult { id: string; version: number }`.
9. `candidate.type.ts` — `interface RetrievalCandidate { workflow_id: string; version: number; title: string; description: string; score: number; aliases_lower: string[]; retrieval_summary: RetrievalSummary | null; retrieval_text: string }` and `interface BoostedCandidate extends RetrievalCandidate { base_score: number; alias_hits: string[] }`. These must match exactly what `InMemoryVectorStore.search`, `AtlasVectorStore.search`, and `applyAliasBoost` produce today.
10. `decision.type.ts` — `SelectionDecisionKind = "matched" | "ambiguous" | "no_match" | "manual_choice"`; `Confidence = "high" | "medium" | "low"`; `interface SelectorDecision { decision: Exclude<SelectionDecisionKind, "manual_choice">; workflow_id: string | null; confidence: Confidence; question: string | null; options: string[]; reasoning: string }` (the LLM's schema — note `manual_choice` is excluded, matching `decisionSchema.js`); `interface AppliedDecision` allowing `manual_choice`.
11. `session.type.ts` — `SessionOutcome = "matched" | "abandoned" | "no_match"`; `interface SessionCandidate` (the slim persisted projection); `interface SessionRound { question: string; options: string[]; answer: string | null; asked_at: Date; answered_at: Date | null }`; `interface SelectionSessionDocument`; `interface SelectionResponseDto` — the exact shape `SelectionService.#response` returns today: `{ session_id; decision; workflow_id; confidence; question; options; candidates: { workflow_id; title; one_liner; score }[] }`.
12. `retrieval.type.ts` — `interface VectorSearchOptions { k?: number; institutionType?: string | null }`; `interface IVectorStore { search(queryVector: number[], options?: VectorSearchOptions): Promise<RetrievalCandidate[]> }`; `interface ITemplateReader { listForRetrieval(options: { institutionType?: string | null }): Promise<RetrievalProjection[]> }`; `interface EmbeddingMetadata { model: string; dim: number; embedded_at: string }`.
13. `http.type.ts` — `interface ErrorResponseBody { error: string; code: string; details: unknown }`; `interface ValidationResultDto { valid: boolean; errors: string[] }`; `interface ExtractResponseDto { workflow: WorkflowDefinition; validation: ValidationResultDto; attempts: number }`; `interface DraftExtractResponseDto` matching `POST /drafts/:id/extract`'s current body.
14. Every subfolder gets an `index.type.ts` barrel re-exporting its files. The root `src/lib/types/index.type.ts` re-exports all seven subfolder barrels.
15. Delete `src/lib/types/.gitkeep`.
16. Run `npx tsc --noEmit`.

**Mapping from old to new.**

| Old | New |
| --- | --- |
| `src/schema/workflow.schema.json` (structure) | `src/lib/types/workflow/*.type.ts` |
| `@typedef Candidate` in `vectorStore.js` | `RetrievalCandidate` in `candidate.type.ts` |
| `VectorStore` abstract class | `IVectorStore` interface in `retrieval.type.ts` |
| `WorkflowStore` abstract class | superseded by concrete model + service types; no direct replacement |
| `decisionSchema.js` properties | `SelectorDecision` in `decision.type.ts` |
| Implicit doc shapes in `draftStore.js` / `mongoStore.js` / `selectionSessionStore.js` | `DraftDocument` / `TemplateDocument` / `SelectionSessionDocument` |
| `serializeDraft()` output shape | `DraftDto` |
| `summarize()` output shape | `TemplateSummary` |
| `SelectionService.#response` output shape | `SelectionResponseDto` |

**Out of scope.** Do not write runtime code — this phase produces types and interfaces only (no classes with bodies, no functions with implementations). Do not modify `workflow.schema.json`. Do not delete any `.js` file.

**Acceptance criteria.**
- [ ] All 19 type files exist with the exact names listed.
- [ ] `src/lib/types/index.type.ts` re-exports every domain.
- [ ] `WorkflowDefinition` has all twelve top-level keys from `workflow.schema.json`'s `required` array.
- [ ] `Actor` has exactly the six keys used in `fixtures/expected/*.json`.
- [ ] `RetrievalCandidate` field names match the object literal returned by `InMemoryVectorStore.search`.
- [ ] No file under `src/lib/types/` contains a function body or `class` implementation.
- [ ] `npx tsc --noEmit` exits 0.

---

### Phase 4 — Error class hierarchy

**Goal.** Create the base error class and its subclasses so services, models, and controllers can throw typed, HTTP-aware errors from Phase 6 onward. It comes before utils and services because both throw.

**Preconditions.** Phase 3 complete.

**Exact file/folder actions.**

*Create:* `src/errors/base.error.ts`, `src/errors/validation.error.ts`, `src/errors/not-found.error.ts`, `src/errors/conflict.error.ts`, `src/errors/extraction.error.ts`, `src/errors/selection.error.ts`, `src/errors/embedding.error.ts`, `src/errors/database.error.ts`, `src/errors/configuration.error.ts`, `src/errors/index.error.ts`.

**Step-by-step instructions.**

1. `base.error.ts` — `export abstract class BaseError extends Error`. Constructor takes `(message: string, options?: { code?: string; details?: unknown; cause?: unknown })`. It sets `this.name = new.target.name`, assigns `readonly statusCode: number` from an abstract/overridden member, `readonly code: string` (default derived from the class name in SCREAMING_SNAKE_CASE), `readonly details: unknown`, `readonly isOperational: boolean = true`, calls `Error.captureStackTrace(this, new.target)` when available, and sets `this.cause` when provided. Add `toJSON(): ErrorResponseBody` returning `{ error: this.message, code: this.code, details: this.details ?? null }`.
2. Create one subclass per file, each fixing `statusCode` and a default `code`:
   - `ValidationError` — 400, `VALIDATION_ERROR`. Add a static factory `ValidationError.forField(field: string, requirement: string)` producing the message form currently used inline (e.g. `"Body must include a non-empty 'text' field"`).
   - `NotFoundError` — 404, `NOT_FOUND`. Static factory `NotFoundError.of(resource: string, id: string)` producing e.g. `"Workflow 'x' not found"`.
   - `ConflictError` — 409, `CONFLICT`.
   - `ExtractionError` — 422, `EXTRACTION_ERROR`.
   - `SelectionError` — 502, `SELECTION_ERROR`.
   - `EmbeddingError` — 502, `EMBEDDING_ERROR`.
   - `DatabaseError` — 500, `DATABASE_ERROR`, `isOperational = true`.
   - `ConfigurationError` — 500, `CONFIGURATION_ERROR`, `isOperational = false`.
3. `index.error.ts` re-exports `BaseError` and all eight subclasses.
4. Preserve the current `cause` semantics: `ExtractionError` today carries `cause` set to either the underlying JSON parse error, the validation `errors` array, or `candidate.metadata.ambiguities`, and the current error handler responds with `details: err.cause ?? null`. In the new design **that content moves to `details`**, and `cause` is reserved for a real underlying `Error`. When Phase 6 migrates `extractWorkflow`, pass the errors array / ambiguities as `details` and the parse error as `cause`.
5. Run `npx tsc --noEmit`.

**Mapping from old to new.**

| Old | New |
| --- | --- |
| `ExtractionError` in `src/llm/extractWorkflow.js` | `src/errors/extraction.error.ts` (still 422) |
| `SelectionError` in `src/selector/selectorAgent.js` | `src/errors/selection.error.ts` (still 502) |
| `EmbeddingError` in `src/retrieval/embeddings.js` | `src/errors/embedding.error.ts` (still 502) |
| `STATUS_BY_ERROR` Map in `errorHandler.js` | `statusCode` on each error class |
| Inline `res.status(400).json({ error: "Body must include..." })` ×6 | `ValidationError` |
| Inline `res.status(404).json({ error: "... not found" })` ×5 | `NotFoundError` |
| `res.status(409)` in `selectionRoutes.js` | `ConflictError` |
| Bare `throw new Error(...)` in `SelectionService.choose` | `ValidationError` (the id was not among the session's candidates — a client mistake) |
| Bare `throw new Error("No open question to answer...")` in `selectionSessionStore.js` | `ConflictError` |
| `throw new Error("Missing required environment variable: ...")` in `env.js` | `ConfigurationError` (retrofit into Phase 2's env-parse utils in this phase) |
| `throw new Error("Dimension mismatch")` in `vectorMath.js` | `ValidationError` |
| `throw new Error("Workflow ... has no retrieval_summary")` in `renderSummary.js` | `ValidationError` |

6. After creating the error classes, go back and update `src/utils/shared/env-parse.util.ts` (Phase 2) so its throws use `ConfigurationError` instead of `Error`.

**Out of scope.** Do not modify the error handler middleware (Phase 11). Do not touch any existing `.js` file. Do not add error-to-HTTP mapping tables anywhere.

**Acceptance criteria.**
- [ ] All 10 error files exist.
- [ ] Every subclass extends `BaseError` and exposes a numeric `statusCode` and a string `code`.
- [ ] `new NotFoundError("x").statusCode === 404` and `instanceof BaseError === true`.
- [ ] `toJSON()` returns exactly `{ error, code, details }`.
- [ ] `src/errors/index.error.ts` exports all nine names.
- [ ] `env-parse.util.ts` throws `ConfigurationError`.
- [ ] `npx tsc --noEmit` exits 0.

---

### Phase 5 — Utilities and predefined data

**Goal.** Port every pure helper and all hardcoded data (prompts, schemas, vocabulary, constants, samples) into `src/utils/` and `src/data/`. It precedes services because every service imports from these two folders.

**Preconditions.** Phases 3 and 4 complete.

**Exact file/folder actions.**

*Create — utils:*
- `src/utils/shared/logger.util.ts`
- `src/utils/shared/hash.util.ts`
- `src/utils/shared/object-id.util.ts`
- `src/utils/shared/assert.util.ts`
- `src/utils/workflow/schema-validator.util.ts`
- `src/utils/workflow/graph-validator.util.ts`
- `src/utils/workflow/namespace-path.util.ts`
- `src/utils/retrieval/vector-math.util.ts`
- `src/utils/retrieval/alias-boost.util.ts`
- `src/utils/retrieval/render-summary.util.ts`
- `src/utils/http/request-validator.util.ts`
- `src/utils/http/serializer.util.ts`

*Create — data:*
- `src/data/constants/collection.constant.ts`
- `src/data/constants/status.constant.ts`
- `src/data/constants/model.constant.ts`
- `src/data/vocabulary/role.vocabulary.ts`
- `src/data/schemas/workflow.schema.json` (copy)
- `src/data/schemas/workflow-schema.data.ts`
- `src/data/schemas/decision.schema.ts`
- `src/data/schemas/retrieval-summary.schema.ts`
- `src/data/prompts/extraction.prompt.ts`
- `src/data/prompts/extraction-few-shot.prompt.ts`
- `src/data/prompts/selector.prompt.ts`
- `src/data/prompts/retrieval-summary.prompt.ts`

*Move (copy now, delete source in Phase 14):*
- `fixtures/input/*.txt` → `src/data/samples/input/`
- `fixtures/expected/*.json` → `src/data/samples/expected/`
- `fixtures/selection/queries.json` → `src/data/samples/selection/`
- `demo-drafts/*.txt` → `src/data/samples/demo-drafts/`

**Step-by-step instructions.**

1. **`logger.util.ts`** — port `src/utils/logger.js` verbatim in behaviour: four levels (`debug`, `info`, `warn`, `error`), JSON line output with `timestamp`, `level`, `message`, spread `meta`; `error` → `console.error`, `warn` → `console.warn`, others → `console.log`. Type it as `interface Logger { debug(msg: string, meta?: Record<string, unknown>): void; ... }` and export a `logger: Logger` const. Do not change the output format — `docs` and any log tooling depend on it.
2. **`hash.util.ts`** — port `sha256()` from `src/utils/hash.js` exactly, including CRLF→LF normalisation and `.trim()`. **The normalisation must not change**: it is the key of the unique index `draft_text_sha256_unique`; altering it would break idempotency against existing rows.
3. **`object-id.util.ts`** — port `toObjectId()` currently exported from `src/knowledgeBank/draftStore.js` (an odd home; it is imported by `selectionSessionStore.js`). Signature `toObjectId(id: string | ObjectId): ObjectId`. Throw `ValidationError` when the string is not a valid 24-hex ObjectId instead of letting the driver throw. Also export `toIdString(id: ObjectId | string | null): string | null`.
4. **`assert.util.ts`** — small typed guards used by controllers/services: `assertDefined<T>(value: T | null | undefined, error: BaseError): asserts value is T` and `assertNonEmptyString(value: unknown, field: string): asserts value is string` (throws `ValidationError`).
5. **`schema-validator.util.ts`** — port `src/validation/schemaValidator.js`. Load the schema from `src/data/schemas/workflow.schema.json` via `resolveJsonModule` import (preferred, since `tsconfig` enables it) rather than `readFileSync` + `import.meta.url` path arithmetic. Compile with `new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true })` + `addFormats`. Export `validateSchema(workflow: unknown): string[]` producing the same `` `${instancePath || "(root)"} ${message}` `` strings. Export `workflowSchema` and `strictWorkflowSchema` (the deep clone).
6. **`graph-validator.util.ts`** — port `src/validation/graphValidator.js` in full, preserving all eight checks in the same order (`checkDependencyReferences`, `checkRequiredOutcomes`, `checkNoCycles`, `checkEntryStepExists`, `checkReachability`, `checkApprovalOutcomes`, `checkCompletionRequiredSteps`, `checkNamespacePaths`) and the exact error message strings — `tests/graphValidator.test.js` asserts on them. Export `validateGraph(workflow: WorkflowDefinition): string[]`.
7. **`namespace-path.util.ts`** — extract the four namespace helpers currently private inside `graphValidator.js` (`declaredNamespaceIds`, `isValidNamespacePath`, `looksLikeNamespacePath`, and the recursive `checkConditionPaths` predicate portion) into their own module so the graph validator imports them. Behaviour must be identical.
8. **`vector-math.util.ts`** — port `l2normalize`, `dot`, `cosineSimilarity` from `src/retrieval/vectorMath.js`. Keep the loop-based norm (no `Math.hypot` spread). `cosineSimilarity` throws `ValidationError` on dimension mismatch instead of bare `Error`.
9. **`alias-boost.util.ts`** — port `applyAliasBoost` from `src/retrieval/aliasBoost.js`. **Change one thing:** the boost value must now be a required explicit parameter, not defaulted from an imported `config` (utils must be pure). Signature: `applyAliasBoost(candidates: RetrievalCandidate[], userQuery: string, boost: number): BoostedCandidate[]`. The caller (`retrieval.service.ts`, Phase 7) supplies `config.retrieval.aliasBoost`.
10. **`render-summary.util.ts`** — port `renderForEmbedding` and `renderAliasesLower` from `src/retrieval/renderSummary.js`. **The rendered string must be byte-identical** to today's output (same field order: title, one_liner, "Also known as", "Applies to", "Use when", "Keywords", "Not for"; same `", "` joins; same newline separator; same `.filter(Boolean)`). Any change silently invalidates every stored embedding. Throw `ValidationError` when `retrieval_summary` is missing, keeping the current message text.
11. **`request-validator.util.ts`** — new, replacing the six duplicated inline body checks. Export: `requireNonEmptyString(body: unknown, field: string): string`, `requireObject<T>(body: unknown, field: string): T`, `requireOneOf<T extends string>(body: unknown, field: string, allowed: readonly T[]): T`, `optionalString(body: unknown, field: string): string | null`, `optionalPositiveInt(value: unknown, field: string): number | undefined`. Each throws `ValidationError` whose message reproduces the current wording exactly, so API consumers see no change: `"Body must include a non-empty 'text' field"`, `"Body must include a 'workflow' object"`, `"Body must include a non-empty 'query' field"`, `"Body must include a non-empty 'answer' field"`, `"Body must include 'workflow_id'"`, and for review status `` `review_status must be one of: ${allowed.join(", ")}` ``.
12. **`serializer.util.ts`** — export `serializeDraft(doc: DraftDocument): DraftDto` (moved verbatim from `draftRoutes.js`), `serializeTemplateSummary(doc: TemplateDocument): TemplateSummary` (the `summarize()` from `mongoStore.js`, including the `updated_at?.toISOString?.() ?? updated_at` fallback), and `serializeTemplateRecord(doc: TemplateDocument): TemplateRecordDto` (the object literal currently built inline in the `/workflows/:id/record` handler).
13. **`collection.constant.ts`** — port `COLLECTIONS` from `src/config/constants.js`. Keep the same three values. Type as `const` object with `as const`.
14. **`status.constant.ts`** — port `DRAFT_STATUS`, `REVIEW_STATUS`, `SELECTION_DECISION`, `SESSION_OUTCOME` from `src/config/constants.js`, values unchanged. `REVIEW_STATUS.PENDING` must remain `"pending_admin_review"` — it mirrors `workflow.schema.json`.
15. **`model.constant.ts`** — port `EMBEDDING_MODEL_ID` (`"text-embedding-3-small"`) and add `REASONING_MODEL_PATTERN = /^(o\d|gpt-5)/i` plus `supportsTemperatureControl(deployment: string): boolean`, consolidating the regex currently duplicated in `extractWorkflow.js` and `selectorAgent.js`.
16. **`role.vocabulary.ts`** — port `SUGGESTED_ROLES` from `src/schema/roleVocabulary.js` verbatim (7 categories).
17. **`workflow.schema.json`** — copy `src/schema/workflow.schema.json` byte-for-byte to `src/data/schemas/workflow.schema.json`. **Do not edit it.** Add `src/data/schemas/workflow-schema.data.ts` exporting the imported JSON typed, plus the deep-cloned `strictWorkflowSchema`.
18. **`decision.schema.ts`** — port `decisionSchema` and `DECISION_SCHEMA_NAME` from `src/selector/decisionSchema.js` verbatim.
19. **`retrieval-summary.schema.ts`** — extract the inline `retrievalSummarySchema` from `scripts/backfillSummaries.js` into this file so the script no longer defines data.
20. **`extraction.prompt.ts`** — port `SYSTEM_PROMPT` from `src/llm/prompts/systemPrompt.js` **verbatim**, including the `formatRoleVocabulary()` interpolation which now imports from `src/data/vocabulary/role.vocabulary.ts`. Any wording change alters extraction behaviour and invalidates `tests/live/*`.
21. **`extraction-few-shot.prompt.ts`** — port `FEW_SHOT_MESSAGES` from `src/llm/prompts/fewShot.js`. It currently reads `fixtures/input/{name}.txt` and `fixtures/expected/{name}.json` at module load via three levels of `..` path arithmetic. Rewrite it to read from `src/data/samples/input/` and `src/data/samples/expected/` using a path resolved from `import.meta.url`, keeping the same two examples in the same order: `it_faculty_overseas_leave`, then `departmental_event_workshop`. **Order matters** — it is part of the prompt.
22. **`selector.prompt.ts`** — port `SELECTOR_SYSTEM_PROMPT`, `renderCandidates`, and `buildSelectorMessages` from `src/selector/selectorPrompt.js` verbatim (7 numbered rules, the score formatting `c.score.toFixed(3)`, the "Person:" / "You asked:" transcript rendering).
23. **`retrieval-summary.prompt.ts`** — extract `RETRIEVAL_SUMMARY_ONLY_PROMPT` from `scripts/backfillSummaries.js` verbatim.
24. Copy the four sample directories listed above. **Copy, do not move** — `tests/` and `scripts/` still reference `fixtures/` until Phases 12–14.
25. Run `npx tsc --noEmit`.

**Mapping from old to new.**

| Old | New |
| --- | --- |
| `src/utils/logger.js` | `src/utils/shared/logger.util.ts` |
| `src/utils/hash.js` | `src/utils/shared/hash.util.ts` |
| `toObjectId` in `src/knowledgeBank/draftStore.js` | `src/utils/shared/object-id.util.ts` |
| `src/validation/schemaValidator.js` | `src/utils/workflow/schema-validator.util.ts` |
| `src/validation/graphValidator.js` | `src/utils/workflow/graph-validator.util.ts` + `namespace-path.util.ts` |
| `src/retrieval/vectorMath.js` | `src/utils/retrieval/vector-math.util.ts` |
| `src/retrieval/aliasBoost.js` | `src/utils/retrieval/alias-boost.util.ts` (boost now a parameter) |
| `src/retrieval/renderSummary.js` | `src/utils/retrieval/render-summary.util.ts` |
| `serializeDraft` in `draftRoutes.js` | `src/utils/http/serializer.util.ts` |
| `summarize()` in `mongoStore.js` and `fileStore.js` | `serializeTemplateSummary` in `serializer.util.ts` (deduplicated) |
| inline record literal in `draftRoutes.js` | `serializeTemplateRecord` in `serializer.util.ts` |
| 6× inline body validation blocks | `src/utils/http/request-validator.util.ts` |
| `src/config/constants.js` | `src/data/constants/{collection,status,model}.constant.ts` |
| `src/schema/roleVocabulary.js` | `src/data/vocabulary/role.vocabulary.ts` |
| `src/schema/workflow.schema.json` | `src/data/schemas/workflow.schema.json` |
| `src/selector/decisionSchema.js` | `src/data/schemas/decision.schema.ts` |
| inline `retrievalSummarySchema` in `backfillSummaries.js` | `src/data/schemas/retrieval-summary.schema.ts` |
| `src/llm/prompts/systemPrompt.js` | `src/data/prompts/extraction.prompt.ts` |
| `src/llm/prompts/fewShot.js` | `src/data/prompts/extraction-few-shot.prompt.ts` |
| `src/selector/selectorPrompt.js` | `src/data/prompts/selector.prompt.ts` |
| inline `RETRIEVAL_SUMMARY_ONLY_PROMPT` in `backfillSummaries.js` | `src/data/prompts/retrieval-summary.prompt.ts` |
| `REASONING_MODEL_PATTERN` in `extractWorkflow.js` + `selectorAgent.js` | `src/data/constants/model.constant.ts` (deduplicated) |
| `fixtures/` | `src/data/samples/` |
| `demo-drafts/` | `src/data/samples/demo-drafts/` |

**Out of scope.** Do not create the Mongo client, models, or services. Do not delete `fixtures/`, `demo-drafts/`, or any `src/**/*.js`. Do not change any prompt wording, any error message string asserted by existing tests, or the embedding-render output.

**Acceptance criteria.**
- [ ] All 12 util files and all 12 data files exist with the exact names listed.
- [ ] `src/data/schemas/workflow.schema.json` is byte-identical to `src/schema/workflow.schema.json`.
- [ ] Calling `renderForEmbedding` on `src/data/samples/expected/it_faculty_overseas_leave.json` produces a string identical to the old `renderSummary.js` output for the same input.
- [ ] `validateGraph` on that same fixture returns `[]`.
- [ ] `sha256("a\r\nb\n")` equals the old implementation's output for the same input.
- [ ] No file under `src/utils/` imports from `src/config/`, `src/services/`, or `src/models/`.
- [ ] `SUGGESTED_ROLES` has 7 categories with unchanged contents.
- [ ] `npx tsc --noEmit` exits 0.

---

### Phase 6 — Database client and models

**Goal.** Create the typed Mongo client and one model per collection, owning document shapes, index specs, and thin CRUD. It precedes services because services depend on models.

**Preconditions.** Phases 2–5 complete.

**Exact file/folder actions.**

*Create:*
- `src/db/mongo.client.ts`
- `src/db/index.definition.ts`
- `src/models/draft.model.ts`
- `src/models/template.model.ts`
- `src/models/selection-session.model.ts`
- `src/models/index.model.ts`

**Step-by-step instructions.**

1. **`mongo.client.ts`** — port `src/db/mongoClient.js`. Keep the module-level singleton (`let client`, `let db`), `getDb(): Promise<Db>`, `closeDb(): Promise<void>`, and `getCollection<T extends Document>(name: string): Promise<Collection<T>>` (renamed from `collection` for clarity). Read `uri`, `dbName`, and `serverSelectionTimeoutMs` from `config.db`. Wrap connection failures in `DatabaseError`. Keep the `logger.info("mongo connected", { db })` line.
2. **`index.definition.ts`** — port the `INDEX_SPECS` array from `src/db/indexes.js` and `ensureIndexes()`. **All six index specs must be reproduced exactly**, same keys, same options, same `name` strings (`draft_text_sha256_unique`, `draft_created_desc`, `template_id_version_unique`, `template_latest`, `template_retrieval_filter`, `session_created_desc`). Changing a name would cause Mongo to create a duplicate index. Keep the final `logger.info("mongo indexes ensured", { count })`.
3. **`draft.model.ts`** — `export class DraftModel`. Private `collection(): Promise<Collection<DraftDocument>>` using `COLLECTIONS.DRAFTS`. Methods, each a thin typed wrapper with no business rules:
   - `findByTextHash(hash: string): Promise<DraftDocument | null>`
   - `insert(doc: Omit<DraftDocument, "_id">): Promise<DraftDocument>`
   - `findById(id: string | ObjectId): Promise<DraftDocument | null>`
   - `findAll(options: { limit: number }): Promise<DraftDocument[]>` — sort `{ created_at: -1 }`, `limit`
   - `patch(id: string | ObjectId, fields: Partial<DraftDocument>): Promise<DraftDocument | null>` — `$set` with `updated_at: new Date()`, then re-read
   The status-transition helpers (`markExtracted` / `markFailed` / `markRejected`) do **not** live here — they are policy and move to `draft.service.ts` in Phase 7.
4. **`template.model.ts`** — `export class TemplateModel` on `COLLECTIONS.TEMPLATES`:
   - `findLatestVersionNumber(workflowId: string): Promise<number>` — the `findOne` with `sort: { version: -1 }, projection: { version: 1 }`, returning `0` when absent
   - `demoteLatest(workflowId: string, now: Date): Promise<void>` — the `updateMany({ workflow_id, is_latest: true }, { $set: { is_latest: false, updated_at } })`
   - `insert(doc: Omit<TemplateDocument, "_id">): Promise<void>`
   - `findOneByIdAndVersion(workflowId: string, version?: number): Promise<TemplateDocument | null>` — when `version` is given, query `{ workflow_id, version: Number(version) }`; otherwise `{ workflow_id, is_latest: true }`
   - `findAll(filters: { institution_type?: string; review_status?: string }): Promise<TemplateDocument[]>` — always `is_latest: true`, sort `{ updated_at: -1 }`
   - `searchByText(needle: string): Promise<TemplateDocument[]>` — the escaped case-insensitive `RegExp` over `title` and `description`, `is_latest: true`
   - `updateReviewStatus(workflowId, version, reviewStatus): Promise<TemplateDocument | null>` — the `findOneAndUpdate` setting `review_status`, `document.metadata.review_status`, and `updated_at`, with `returnDocument: "after"`
   - `listForRetrieval(options: { institutionType?: string | null }): Promise<RetrievalProjection[]>` — query `{ is_latest: true, review_status: REVIEW_STATUS.CONFIRMED }` plus optional `institution_type`, with the **exact same projection** as today
   - `vectorSearch(queryVector: number[], options: { k: number; institutionType?: string | null; indexName: string }): Promise<AtlasSearchRow[]>` — the `$vectorSearch` + `$project` aggregation from `atlasVectorStore.js`, with `numCandidates: Math.max(100, k * 20)` and the index name supplied by the caller (from `config.retrieval.atlasIndexName`)
   The version-number increment, embedding call, and demote-then-insert *ordering policy* stay in the service (Phase 7); the model exposes the primitives.
5. **`selection-session.model.ts`** — `export class SelectionSessionModel` on `COLLECTIONS.SELECTION_SESSIONS`:
   - `insert(doc: Omit<SelectionSessionDocument, "_id">): Promise<SelectionSessionDocument>`
   - `findById(id): Promise<SelectionSessionDocument | null>`
   - `pushRound(id, round: SessionRound): Promise<SelectionSessionDocument | null>`
   - `setRoundAnswer(id, index: number, answer: string): Promise<SelectionSessionDocument | null>` — the positional `$set` on `rounds.${index}.answer` / `.answered_at`
   - `finalize(id, outcome: SessionOutcome, selectedWorkflowId: string | null): Promise<SelectionSessionDocument | null>`
   The "find the first unanswered round, throw if none" logic is policy → `selection.service.ts`.
6. **`index.model.ts`** re-exports the three model classes.
7. Every model method that can fail on a driver error wraps it in `DatabaseError`. Every model uses `toObjectId` from `src/utils/shared/object-id.util.ts` — never `new ObjectId()` inline.
8. Run `npx tsc --noEmit`.

**Mapping from old to new.**

| Old | New |
| --- | --- |
| `src/db/mongoClient.js` | `src/db/mongo.client.ts` |
| `src/db/indexes.js` | `src/db/index.definition.ts` |
| `DraftStore` persistence methods (`create`'s `findOne`/`insertOne`, `getById`, `list`, `#patch`) | `DraftModel` |
| `DraftStore.create`'s hash + idempotency decision | → `draft.service.ts` (Phase 7) |
| `DraftStore.markExtracted/markFailed/markRejected` | → `draft.service.ts` (Phase 7) |
| `MongoWorkflowStore` persistence (`#collection`, the `findOne`s, `updateMany`, `insertOne`, `find`, `findOneAndUpdate`, `listForRetrieval`) | `TemplateModel` |
| `MongoWorkflowStore.save`'s versioning + embedding orchestration | → `workflow.service.ts` (Phase 7) |
| `AtlasVectorStore`'s aggregation pipeline | `TemplateModel.vectorSearch` |
| `SelectionSessionStore` persistence | `SelectionSessionModel` |
| `SelectionSessionStore.recordAnswer`'s "find open round / throw" | → `selection.service.ts` (Phase 7) |
| `WorkflowStore` / `FileWorkflowStore` | **no replacement — dropped** (see Phase 14) |

**Out of scope.** Do not write any service. Do not call the OpenAI SDK from a model. Do not put version-increment, embedding, hashing, or status-transition policy in a model. Do not delete any `.js` file.

**Acceptance criteria.**
- [ ] `src/db/index.definition.ts` contains exactly six index specs with the six original names.
- [ ] No file under `src/models/` imports from `openai`, `src/services/`, or `src/controllers/`.
- [ ] No model method computes a version number, calls an embedder, or hashes text.
- [ ] `TemplateModel.listForRetrieval`'s projection matches the current one field-for-field.
- [ ] `TemplateModel.vectorSearch` uses `numCandidates: Math.max(100, k * 20)`.
- [ ] `npx tsc --noEmit` exits 0.

---

### Phase 7 — Services

**Goal.** Port all business logic into constructor-injected service classes with strict separation of concerns. This is the largest phase; it precedes controllers because controllers call services.

**Preconditions.** Phases 2–6 complete.

**Exact file/folder actions.**

*Create:*
- `src/services/azure-openai.client.ts`
- `src/services/azure-embedding.client.ts`
- `src/services/validation.service.ts`
- `src/services/embedding.service.ts`
- `src/services/extraction.service.ts`
- `src/services/draft.service.ts`
- `src/services/workflow.service.ts`
- `src/services/vector-store/vector-store.interface.ts`
- `src/services/vector-store/in-memory.vector-store.ts`
- `src/services/vector-store/atlas.vector-store.ts`
- `src/services/vector-store/index.vector-store.ts`
- `src/services/retrieval.service.ts`
- `src/services/selector.service.ts`
- `src/services/selection.service.ts`
- `src/services/index.service.ts`

**Step-by-step instructions.**

1. **`azure-openai.client.ts`** — port `src/llm/azureClient.js` **minus `smokeTest()`**. Export a factory `createChatClient(deployment: string): AzureOpenAI` plus two pre-built instances: `chatClient` (bound to `config.azureOpenAI.deployment`) and `selectorChatClient` (bound to `config.azureOpenAI.selectorDeployment`). **Keep them as two separate `AzureOpenAI` instances** — the SDK builds the request URL from the constructor's deployment and ignores the body's `model`, so sharing one client silently misroutes selector calls. Record that reason in a one-line comment.
2. **`azure-embedding.client.ts`** — port `src/retrieval/embeddingClient.js`, bound to `config.azureEmbedding.*`.
3. **`validation.service.ts`** — `export class ValidationService` with `validate(workflow: unknown): string[]` returning `[...validateSchema(w), ...validateGraph(w)]` (the current `validateWorkflow`) and `assertValid(workflow: unknown): asserts workflow is WorkflowDefinition` throwing `ValidationError` with `details = errors` when non-empty.
4. **`embedding.service.ts`** — port `src/retrieval/embeddings.js`. `export class EmbeddingService` with a constructor taking `{ client = embeddingClient, embeddingConfig = config.azureEmbedding }`. Methods: private `embed(text)` (empty-text guard → `EmbeddingError`; API call wrapped → `EmbeddingError`; missing-vector guard; dimension check against `embeddingConfig.dimensions` with the same message text; `l2normalize`), `embedDocument(text): Promise<number[]>`, `embedQuery(text): Promise<number[]>`, `embedBatch(texts: string[], options?: { onProgress?: (done: number, total: number) => void }): Promise<number[][]>` (sequential, unchanged), and `metadata(): EmbeddingMetadata` (`{ model: EMBEDDING_MODEL_ID, dim, embedded_at: new Date().toISOString() }`).
5. **`extraction.service.ts`** — port `src/llm/extractWorkflow.js`. `export class ExtractionService`, constructor `{ client = chatClient, validationService, openAIConfig = config.azureOpenAI }`. Methods:
   - private `buildMessages(text)` — system prompt + `FEW_SHOT_MESSAGES` + user text, in that order
   - private `buildRepairPrompt(errors)` — the exact current string
   - private `callModel(messages)` — `chat.completions.create` with `response_format: { type: "json_schema", json_schema: { name: "workflow_definition", schema: strictWorkflowSchema, strict: true } }`, plus `temperature: 0` only when `supportsTemperatureControl(deployment)`; JSON parse failure → `ExtractionError("Azure returned content that is not valid JSON", { cause: err })`
   - `extract(text: string, options?: { maxAttempts?: number }): Promise<{ workflow: WorkflowDefinition; attempts: number }>` — the retry loop, default `maxAttempts` from `openAIConfig.maxExtractionAttempts`. **Preserve all three exits exactly:** (a) valid + `metadata.review_status === "rejected"` → `ExtractionError("Source text does not describe a workflow", { details: candidate.metadata.ambiguities })`; (b) valid otherwise → return; (c) last attempt with errors → `` ExtractionError(`Failed to produce a valid workflow after ${maxAttempts} attempts`, { details: errors }) ``; otherwise push the assistant message + repair prompt and loop.
   - `generateRetrievalSummary(workflow: WorkflowDefinition): Promise<RetrievalSummary>` — new method holding the logic currently inline in `scripts/backfillSummaries.js`, using `RETRIEVAL_SUMMARY_ONLY_PROMPT` and `retrievalSummarySchema`.
6. **`draft.service.ts`** — `export class DraftService`, constructor `{ draftModel }`. Methods:
   - `create(input: CreateDraftInput): Promise<DraftDocument>` — compute `sha256(rawText)`, `findByTextHash`, return the existing doc when found (log `debug` as today), else build the full document with `status: DRAFT_STATUS.PENDING`, nulls, and timestamps, and insert
   - `getById(id): Promise<DraftDocument>` — throws `NotFoundError.of("Draft", id)` when absent (the controller no longer branches)
   - `findById(id): Promise<DraftDocument | null>` — non-throwing variant for callers that need it
   - `list(options?: { limit?: number }): Promise<DraftDocument[]>` — default limit 50
   - `markExtracted(id, workflowId)`, `markFailed(id, reason)`, `markRejected(id, reason)` — each delegating to `draftModel.patch`, preserving the 2000-char truncation on `failure_reason`
7. **`workflow.service.ts`** — `export class WorkflowService`, constructor `{ templateModel, embeddingService, validationService }`. Methods:
   - `save(workflow: WorkflowDefinition, options?: { draftId?: ObjectId | null }): Promise<SaveResult>` — the full policy from `MongoWorkflowStore.save`: next version = `findLatestVersionNumber + 1`; `text = renderForEmbedding(workflow)`; `embedding = await embeddingService.embedDocument(text)`; build the document including `institution_type: workflow.scope?.institution_type ?? null`, `review_status: workflow.metadata?.review_status ?? REVIEW_STATUS.CONFIRMED`, `is_latest: true`, and `retrieval: { text, embedding, aliases_lower: renderAliasesLower(workflow), ...embeddingService.metadata() }`; then **`demoteLatest` first, `insert` second** (preserve this order — a failed insert must leave zero `is_latest`, never two); log and return `{ id, version }`. **Carry over the existing `TODO(admin-approval)` note** about the `CONFIRMED` default as a one-line comment; do not change the default behaviour.
   - `update(workflowId, workflow, options?)` — `save({ ...workflow, workflow_id: workflowId }, options)`
   - `getDocument(workflowId, version?): Promise<WorkflowDefinition>` — returns `record.document`; throws `NotFoundError` when absent
   - `getRecord(workflowId, version?): Promise<TemplateDocument>` — throws `NotFoundError` when absent
   - `list(filters): Promise<TemplateSummary[]>` — maps through `serializeTemplateSummary`
   - `search(query: string): Promise<TemplateSummary[]>` — empty/whitespace query returns `[]`
   - `setReviewStatus(workflowId, version, reviewStatus): Promise<TemplateSummary | null>`
8. **`vector-store.interface.ts`** — re-export `IVectorStore` from `src/lib/types/retrieval/`. (One import path for implementers.)
9. **`in-memory.vector-store.ts`** — `export class InMemoryVectorStore implements IVectorStore`, constructor `{ templateReader: ITemplateReader }`. `search` calls `listForRetrieval`, maps each row to a `RetrievalCandidate` with `score: cosineSimilarity(queryVector, row.retrieval.embedding)`, sorts descending, slices to `k` (default 5). Field mapping identical to today, including `retrieval_summary: row.document?.retrieval_summary ?? null`.
10. **`atlas.vector-store.ts`** — `export class AtlasVectorStore implements IVectorStore`, constructor `{ templateModel, indexName = config.retrieval.atlasIndexName }`. `search` delegates to `templateModel.vectorSearch` and maps rows to `RetrievalCandidate` exactly as today (`score` from `$meta: "vectorSearchScore"`, `aliases_lower` defaulting to `[]`).
11. **`index.vector-store.ts`** — re-exports both implementations and the interface, plus a factory `createVectorStore(backend: "memory" | "atlas", deps): IVectorStore` so the composition root does not branch inline.
12. **`retrieval.service.ts`** — port `src/retrieval/retriever.js`. `export class RetrievalService`, constructor `{ vectorStore, embeddingService, retrievalConfig = config.retrieval }`. `retrieve(userQuery, options?: { institutionType?: string | null }): Promise<BoostedCandidate[]>`: embed the query, call `vectorStore.search(vector, { k: topK + 2, institutionType })` (**keep the `+2` over-fetch**), apply `applyAliasBoost(raw, userQuery, retrievalConfig.aliasBoost)`, slice to `topK`, log the debug line with the same shape (`query` truncated to 80 chars, per-candidate `id`/`score` to 4 dp/`alias_hits`).
13. **`selector.service.ts`** — port `src/selector/selectorAgent.js`. `export class SelectorService`, constructor `{ client = selectorChatClient, deployment = config.azureOpenAI.selectorDeployment }`. `decide(candidates, transcript): Promise<SelectorDecision>`: the zero-candidate short-circuit returning the exact current object (`no_match`, `high`, reasoning `"No confirmed templates were retrieved for this query."`) **without a model call**; otherwise build messages with `buildSelectorMessages`, call with the `workflow_selection_decision` strict schema and conditional `temperature: 0`, wrap failures in `SelectionError`, then run the private `sanitize`. **All three sanitize rules must be preserved verbatim**: (1) hallucinated `workflow_id` not in the candidate set → downgrade to `ambiguous` with the fallback question; (2) `matched` + `confidence: "low"` → downgrade to `ambiguous`, options falling back to candidate titles; (3) `ambiguous` with no question → inject the default question and candidate-title options. Keep the two `logger.warn`/`logger.info` lines.
14. **`selection.service.ts`** — port `src/selector/selectionService.js`. `export class SelectionService`, constructor `{ retrievalService, selectorService, sessionModel, maxRounds = config.retrieval.maxSelectionRounds }`. Methods:
   - `start(userQuery, options)` — retrieve once, create the session (building the slim candidate projection here, in the service, since it is policy: `workflow_id`, `version`, `title`, `score`, `base_score`, `alias_hits`, `retrieval_summary` — **never the embedding**), build the one-turn transcript, decide, apply
   - `answer(sessionId, answerText)` — load the session, find the first round with `answer === null` (throw `ConflictError("No open question to answer on this session")` when none), write the answer via `sessionModel.setRoundAnswer`, rebuild the full transcript from `user_query` + every round's question/answer pair, decide, apply. **Do not re-run retrieval** — keep a one-line comment stating that the candidate set from round one is deliberately frozen.
   - private `apply(session, decision, candidates)` — the three branches exactly as today: `matched` → finalize with `SESSION_OUTCOME.MATCHED` + `selectedWorkflowId` and log; `no_match` → finalize with `SESSION_OUTCOME.NO_MATCH`; `ambiguous` → if `roundsUsed >= maxRounds`, return the `manual_choice` response with question `"I could not narrow it down. Which of these do you want?"` and options = candidate titles (**and do not persist a round**), else `pushRound` and return
   - private `toResponse(...)` — the `SelectionResponseDto`, with `reasoning` stripped and `score` to 4 dp
   - `choose(sessionId, workflowId)` — load the session, find the candidate (throw `ValidationError` with the current message `` `'${workflowId}' was not among this session's candidates` `` when absent), finalize as matched, return `{ session_id, decision: "matched", workflow_id }`
   - `getMatchedWorkflow(sessionId): Promise<WorkflowDefinition>` — **new**, replacing the route's illegal reach into `selectionService.sessionStore`. Load the session; if `selected_workflow_id` is null throw `ConflictError("This session has not matched a workflow yet")`; otherwise delegate to `workflowService.getDocument` (add `workflowService` to the constructor deps) which throws `NotFoundError` when missing.
15. **`index.service.ts`** re-exports every service class.
16. No service may import from `src/controllers/` or `src/routes/`. No service constructs another service internally — all collaborators arrive through the constructor.
17. Run `npx tsc --noEmit`.

**Mapping from old to new.**

| Old | New |
| --- | --- |
| `src/llm/azureClient.js` (client) | `src/services/azure-openai.client.ts` |
| `src/llm/azureClient.js` → `smokeTest()` | → `scripts/smoke-test-azure.script.ts` (Phase 13); removed from the client |
| `src/selector/selectorClient.js` | `selectorChatClient` in `azure-openai.client.ts` |
| `src/retrieval/embeddingClient.js` | `src/services/azure-embedding.client.ts` |
| `extractWorkflow()` + `validateWorkflow()` in `extractWorkflow.js` | `ExtractionService.extract()` + `ValidationService.validate()` |
| `src/retrieval/embeddings.js` (all 5 exports) | `EmbeddingService` |
| `DraftStore` business methods | `DraftService` |
| `MongoWorkflowStore` business methods | `WorkflowService` |
| `src/retrieval/inMemoryVectorStore.js` | `src/services/vector-store/in-memory.vector-store.ts` |
| `src/retrieval/atlasVectorStore.js` | `src/services/vector-store/atlas.vector-store.ts` |
| `src/retrieval/vectorStore.js` (abstract class) | `IVectorStore` interface + `index.vector-store.ts` factory |
| `src/retrieval/retriever.js` (`Retriever`) | `RetrievalService` |
| `src/selector/selectorAgent.js` (`SelectorAgent`) | `SelectorService` |
| `src/selector/selectionService.js` (`SelectionService`) | `SelectionService` (+ new `getMatchedWorkflow`) |
| `src/selector/selectionSessionStore.js` business logic | `SelectionService` (persistence → `SelectionSessionModel`) |
| `scripts/backfillSummaries.js` LLM call | `ExtractionService.generateRetrievalSummary()` |

**Out of scope.** Do not write controllers, routes, middlewares, `app.ts`, or `server.ts`. Do not migrate the scripts. Do not delete any `.js` file. Do not change any prompt, any threshold, or any default (`topK` 5, `aliasBoost` 0.15, `maxRounds` 2, `maxAttempts` 3, `+2` over-fetch, `numCandidates` floor 100).

**Acceptance criteria.**
- [ ] All 15 service files exist.
- [ ] No service class instantiates another service, model, or client inside its own body — every collaborator is a constructor parameter with an optional default only for stateless clients.
- [ ] `SelectorService.decide` with `candidates: []` returns `no_match` and makes zero network calls (verifiable with a stub client whose method throws).
- [ ] `WorkflowService.save` calls `demoteLatest` before `insert`.
- [ ] `SelectionService.answer` contains no call to `retrievalService`.
- [ ] `SelectionService.getMatchedWorkflow` exists and no service exposes its session model publicly for outside reach-through.
- [ ] `smokeTest` does not appear in `src/services/`.
- [ ] Grep for `REASONING_MODEL_PATTERN` in `src/` returns exactly one definition (in `model.constant.ts`).
- [ ] `npx tsc --noEmit` exits 0.

---

### Phase 8 — Middlewares

**Goal.** Create every middleware as a single-responsibility file, including the new error handler that reads `statusCode` off `BaseError`. It comes before controllers and routes because both reference `asyncHandler` and the error handler.

**Preconditions.** Phases 2, 4, 5 complete.

**Exact file/folder actions.**

*Create:* `src/middlewares/cors.middleware.ts`, `src/middlewares/json-body.middleware.ts`, `src/middlewares/request-id.middleware.ts`, `src/middlewares/request-logger.middleware.ts`, `src/middlewares/async-handler.middleware.ts`, `src/middlewares/not-found.middleware.ts`, `src/middlewares/error-handler.middleware.ts`, `src/middlewares/index.middleware.ts`.

**Step-by-step instructions.**

1. **`cors.middleware.ts`** — port `src/api/middleware/cors.js`. Identical headers (`Access-Control-Allow-Origin` from `config.server.corsOrigin`, `Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS`, `Allow-Headers: Content-Type, Authorization`) and the `OPTIONS → 204` short-circuit. Read the origin from **config**, never `process.env`. Keep the one-line production note.
2. **`json-body.middleware.ts`** — exports `jsonBody = express.json({ limit: "1mb" })`, preserving the current limit.
3. **`request-id.middleware.ts`** — new. Assign `req.requestId` from an incoming `x-request-id` header or `crypto.randomUUID()`, and echo it on the response header. Declare the `requestId` property via a global Express `Request` augmentation placed in `src/lib/types/http/http.type.ts`.
4. **`request-logger.middleware.ts`** — new. On response `finish`, emit one `logger.info` line with `method`, `path`, `status`, `durationMs`, `requestId`. No body logging (bodies contain draft prose and could be large).
5. **`async-handler.middleware.ts`** — port `src/api/middleware/asyncHandler.js`, typed as `asyncHandler(fn: (req, res, next) => Promise<unknown>): RequestHandler` and forwarding rejections to `next`.
6. **`not-found.middleware.ts`** — new. Terminal middleware for unmatched routes: `next(new NotFoundError(\`Route ${req.method} ${req.originalUrl} not found\`))`.
7. **`error-handler.middleware.ts`** — rewrite of `src/api/middleware/errorHandler.js`. Signature `(err, req, res, _next)`. Logic: if `err instanceof BaseError` → `logger.warn("handled error", { type: err.name, code: err.code, message: err.message, requestId })` and `res.status(err.statusCode).json(err.toJSON())`; else → `logger.error("unhandled route error", { message, stack, requestId })` and `res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR", details: null })`. **Delete the `STATUS_BY_ERROR` map concept entirely.** Preserve the existing wire behaviour: the client still receives `{ error: <message> }` for handled errors, now with `code` and `details` alongside; the 500 message string stays `"Internal server error"`.
8. **`index.middleware.ts`** re-exports all seven.
9. Run `npx tsc --noEmit`.

**Mapping from old to new.**

| Old | New |
| --- | --- |
| `src/api/middleware/cors.js` | `src/middlewares/cors.middleware.ts` |
| `src/api/middleware/asyncHandler.js` | `src/middlewares/async-handler.middleware.ts` |
| `src/api/middleware/errorHandler.js` | `src/middlewares/error-handler.middleware.ts` (map-free) |
| `express.json({ limit: "1mb" })` inline in `index.js` | `src/middlewares/json-body.middleware.ts` |
| (none) | `request-id`, `request-logger`, `not-found` — new |

**Out of scope.** Do not add authentication or rate limiting — no auth exists today and inventing one is out of scope. Do not wire middlewares into an app yet (Phase 10). Do not delete the old middleware `.js` files.

**Acceptance criteria.**
- [ ] All 8 middleware files exist.
- [ ] `error-handler.middleware.ts` contains no error-type→status lookup table.
- [ ] `cors.middleware.ts` contains no `process.env`.
- [ ] Throwing a `NotFoundError` through the handler yields status 404 and body `{ error, code: "NOT_FOUND", details: null }`.
- [ ] Throwing a plain `new Error("boom")` yields 500 with `"Internal server error"` and never leaks `boom` to the client.
- [ ] `npx tsc --noEmit` exits 0.

---

### Phase 9 — Controllers

**Goal.** Create the controller layer that parses requests, validates input, calls services, and maps results to status codes — the layer that does not exist today. It comes after services and before routes.

**Preconditions.** Phases 4, 5, 7, 8 complete.

**Exact file/folder actions.**

*Create:* `src/controllers/draft.controller.ts`, `src/controllers/workflow.controller.ts`, `src/controllers/selection.controller.ts`, `src/controllers/health.controller.ts`, `src/controllers/index.controller.ts`.

**Step-by-step instructions.**

1. Each controller is a class taking its services through the constructor. Each handler is an instance method (or an arrow-function property, to keep `this` bound when passed to a router) with signature `(req: Request, res: Response) => Promise<void>`.
2. **Every handler follows exactly this shape:** (a) parse and validate inputs using `request-validator.util.ts` helpers, assigning them to named local variables; (b) call the service(s); (c) `res.status(...).json(...)`. No try/catch — errors propagate to the error middleware.
3. **`workflow.controller.ts`** — six handlers:
   - `extract` — `const text = requireNonEmptyString(req.body, "text")`; `const { workflow, attempts } = await this.extractionService.extract(text)`; `res.json({ workflow, validation: { valid: true, errors: [] }, attempts })`. **Keep the hardcoded `validation` block** — it is the current contract.
   - `create` — `requireObject(req.body, "workflow")`; `this.validationService.assertValid(workflow)` (→ 422 with `details = errors`); `const result = await this.workflowService.save(workflow)`; `res.status(201).json(result)`.
   - `list` — `const institutionType = optionalString(req.query, "institution_type")`; `res.json(await this.workflowService.list(institutionType ? { institution_type: institutionType } : {}))`.
   - `getById` — `const version = optionalPositiveInt(req.query.version, "version")`; `res.json(await this.workflowService.getDocument(req.params.id, version))` (service throws `NotFoundError`).
   - `update` — same validation as `create`; `res.json(await this.workflowService.update(id, workflow))`.
   - `validate` — `requireObject(req.body, "workflow")`; `const errors = this.validationService.validate(workflow)`; `res.json({ valid: errors.length === 0, errors })`, always 200.
   - `getRecord` — `res.json(serializeTemplateRecord(await this.workflowService.getRecord(id, version)))`.
   - `setReviewStatus` — `const reviewStatus = requireOneOf(req.body, "review_status", Object.values(REVIEW_STATUS))`; `const version = optionalPositiveInt(req.body.version, "version")`; resolve the record (404 via the service), then `res.json(await this.workflowService.setReviewStatus(id, record.version, reviewStatus))`. **Keep the current two-step behaviour** — the version defaults to the latest record's version when the body omits it.
4. **`draft.controller.ts`** — four handlers:
   - `create` — `requireNonEmptyString(req.body, "text")`, `optionalString(req.body, "title")`; `submittedBy` = `req.user?.id ?? null`. **Note:** no auth middleware exists, so `req.user` is always undefined. Preserve the behaviour but implement it as an explicit `const submittedBy: string | null = null;` with a one-line comment saying auth is not yet wired, rather than a phantom `req.user` access; add no `req.user` type augmentation.
   - `list`, `getById` — thin delegations; `getById` relies on the service's `NotFoundError`.
   - `extractFromDraft` — the most involved handler. Load the draft (service throws 404). `try { const { workflow, attempts } = await extractionService.extract(draft.raw_text); const saved = await workflowService.save(workflow, { draftId: draft._id }); await draftService.markExtracted(draft._id, workflow.workflow_id); res.status(201).json({ draft_id, workflow_id, version, attempts, review_status, workflow }); } catch (err) { if (err instanceof ExtractionError) { rejected-vs-failed branch on /does not describe a workflow/i; } throw err; }`. **This is the one permitted try/catch in a controller**, because the draft-status side effect must happen before the error reaches the middleware. Keep the regex and both `mark*` calls exactly.
5. **`selection.controller.ts`** — four handlers:
   - `startSession` — `requireNonEmptyString(req.body, "query")`, `optionalString(req.body, "requester_context")`, `optionalString(req.body, "institution_type")`; `res.status(201).json(await this.selectionService.start(query, { requesterContext, institutionType }))`.
   - `answerQuestion` — `requireNonEmptyString(req.body, "answer")`; 200.
   - `chooseWorkflow` — `requireNonEmptyString(req.body, "workflow_id")`; 200.
   - `getMatchedWorkflow` — `res.json(await this.selectionService.getMatchedWorkflow(req.params.id))`. **No reach into a session model** — that was the old route's violation.
6. **`health.controller.ts`** — new: `check` returns 200 with `{ status: "ok", uptime: process.uptime(), version: <package version imported from package.json> }`. Add it because the app currently has no liveness endpoint and route mounting benefits from a zero-dependency smoke target.
7. **`index.controller.ts`** re-exports the four classes.
8. No controller imports a model, the Mongo client, or the OpenAI SDK. No controller constructs a service.
9. Run `npx tsc --noEmit`.

**Mapping from old to new.**

| Old handler | New |
| --- | --- |
| `POST /workflows/extract` body in `routes.js` | `WorkflowController.extract` + `ExtractionService` |
| `POST /workflows` body | `WorkflowController.create` + `ValidationService` + `WorkflowService.save` |
| `GET /workflows` body | `WorkflowController.list` + `WorkflowService.list` |
| `GET /workflows/:id` body | `WorkflowController.getById` + `WorkflowService.getDocument` |
| `PUT /workflows/:id` body | `WorkflowController.update` + `WorkflowService.update` |
| `POST /workflows/:id/validate` body | `WorkflowController.validate` + `ValidationService.validate` |
| `GET /workflows/:id/record` body in `draftRoutes.js` | `WorkflowController.getRecord` + `serializeTemplateRecord` |
| `PATCH /workflows/:id/review` body | `WorkflowController.setReviewStatus` |
| `POST /drafts` body | `DraftController.create` + `DraftService.create` |
| `GET /drafts` body | `DraftController.list` |
| `GET /drafts/:id` body | `DraftController.getById` |
| `POST /drafts/:id/extract` body | `DraftController.extractFromDraft` (+ Extraction/Workflow/Draft services) |
| `POST /selection/sessions` body | `SelectionController.startSession` |
| `POST /selection/sessions/:id/answer` body | `SelectionController.answerQuestion` |
| `POST /selection/sessions/:id/choose` body | `SelectionController.chooseWorkflow` |
| `GET /selection/sessions/:id/workflow` body | `SelectionController.getMatchedWorkflow` + `SelectionService.getMatchedWorkflow` |
| `serializeDraft` at the bottom of `draftRoutes.js` | `serializer.util.ts` (Phase 5) |

**Out of scope.** Do not create routers. Do not change any response body shape, status code, or error message wording — every one of the 17 bindings must behave identically. Do not add pagination, filtering, or auth that does not exist today.

**Acceptance criteria.**
- [ ] All 5 controller files exist; 17 handlers total across four controllers plus health.
- [ ] Grep for `mongodb`, `AzureOpenAI`, and `getCollection` under `src/controllers/` returns nothing.
- [ ] `draft.controller.ts` contains exactly one `try {`; every other controller contains none.
- [ ] `selection.controller.ts` contains no reference to a session model or store.
- [ ] Every response body shape matches the corresponding row of §2.5.1.
- [ ] `npx tsc --noEmit` exits 0.

---

### Phase 10 — Routes, app assembly, and server bootstrap

**Goal.** Wire controllers behind routers, split app construction from port binding, and build the composition root. This is the phase that makes the TypeScript application runnable end to end.

**Preconditions.** Phases 6–9 complete.

**Exact file/folder actions.**

*Create:* `src/routes/health.route.ts`, `src/routes/draft.route.ts`, `src/routes/workflow.route.ts`, `src/routes/selection.route.ts`, `src/routes/index.route.ts`, `src/app.ts`, `src/server.ts`.

**Step-by-step instructions.**

1. Each route file exports a factory `createXRouter(controller: XController): Router`. It creates a `Router()`, binds paths to `asyncHandler(controller.method)`, and returns. **No logic beyond binding.**
2. **Final endpoint map.** Keep `/api` as the mount prefix. Move the two admin endpoints currently defined in `draftRoutes.js` but pathed under `/workflows` into `workflow.route.ts`, where they belong; their URLs are unchanged. Final bindings:

   | Router | Method + path (full) | Controller method |
   | --- | --- | --- |
   | health | `GET /api/health` | `HealthController.check` |
   | workflow | `POST /api/workflows/extract` | `WorkflowController.extract` |
   | workflow | `POST /api/workflows` | `WorkflowController.create` |
   | workflow | `GET /api/workflows` | `WorkflowController.list` |
   | workflow | `GET /api/workflows/:id` | `WorkflowController.getById` |
   | workflow | `PUT /api/workflows/:id` | `WorkflowController.update` |
   | workflow | `POST /api/workflows/:id/validate` | `WorkflowController.validate` |
   | workflow | `GET /api/workflows/:id/record` | `WorkflowController.getRecord` |
   | workflow | `PATCH /api/workflows/:id/review` | `WorkflowController.setReviewStatus` |
   | draft | `POST /api/drafts` | `DraftController.create` |
   | draft | `GET /api/drafts` | `DraftController.list` |
   | draft | `GET /api/drafts/:id` | `DraftController.getById` |
   | draft | `POST /api/drafts/:id/extract` | `DraftController.extractFromDraft` |
   | selection | `POST /api/selection/sessions` | `SelectionController.startSession` |
   | selection | `POST /api/selection/sessions/:id/answer` | `SelectionController.answerQuestion` |
   | selection | `POST /api/selection/sessions/:id/choose` | `SelectionController.chooseWorkflow` |
   | selection | `GET /api/selection/sessions/:id/workflow` | `SelectionController.getMatchedWorkflow` |

   **All 17 original bindings keep their exact paths and methods.** Only `GET /api/health` is added. Register `POST /workflows/extract` **before** `GET /workflows/:id`-style dynamic routes within the workflow router so `extract` is never captured as an `:id`.
3. **`index.route.ts`** — `createApiRouter(controllers): Router` mounting the four routers on one router. Do **not** attach the error handler here (the old `routes.js` did; it belongs at the app level, after all routes).
4. **`app.ts`** — `createApp(controllers): Express`. Order: `requestId` → `requestLogger` → `cors` → `jsonBody` → `app.use("/api", createApiRouter(controllers))` → `notFound` → `errorHandler`. `createApp` **must not call `listen`** and must not connect to MongoDB, so integration tests can build the app with fakes.
5. **`server.ts`** — the composition root and the only place concrete classes are chosen:
   1. `import { config } from "./config/index.config.js";` (loading it validates the environment and fails fast).
   2. Construct models: `draftModel`, `templateModel`, `sessionModel`.
   3. Construct clients/services: `embeddingService`, `validationService`, `extractionService`, `draftService`, `workflowService`.
   4. `const vectorStore = createVectorStore(config.retrieval.vectorBackend, { templateModel });` — **replacing the direct `process.env.VECTOR_BACKEND` read**.
   5. `retrievalService`, `selectorService`, `selectionService`.
   6. Construct the four controllers with their services.
   7. `await ensureIndexes();` — keep this before `listen`, as today.
   8. `const app = createApp(controllers); const server = app.listen(config.server.port, () => logger.info(\`Server listening on port ${config.server.port}\`));`
   9. Register `SIGINT`/`SIGTERM` handlers that log, `server.close()`, `await closeDb()`, `process.exit(0)` — same as today.
   10. Add a `process.on("unhandledRejection")` / `("uncaughtException")` handler that logs via `logger.error` and exits non-zero (new; the current app has none).
6. Run `npm run build`, then `node dist/src/server.js` against a running MongoDB and confirm boot.
7. Manually exercise at least: `GET /api/health`, `GET /api/workflows`, `GET /api/drafts`, and one 404 path.
8. Run `npx tsc --noEmit`.

**Mapping from old to new.**

| Old | New |
| --- | --- |
| `src/api/routes.js` (router + 6 handlers + error handler mount + sub-router mounting) | `src/routes/workflow.route.ts` + `src/routes/index.route.ts` + `src/app.ts` |
| `src/api/draftRoutes.js` — the 4 `/drafts*` bindings | `src/routes/draft.route.ts` |
| `src/api/draftRoutes.js` — `/workflows/:id/record`, `/workflows/:id/review` | `src/routes/workflow.route.ts` |
| `src/api/selectionRoutes.js` | `src/routes/selection.route.ts` |
| `src/index.js` — express app + middleware wiring | `src/app.ts` |
| `src/index.js` — DI wiring, `ensureIndexes`, `listen`, signal handlers | `src/server.ts` |
| `process.env.VECTOR_BACKEND` branch in `index.js` | `createVectorStore(config.retrieval.vectorBackend, …)` |
| optional-dependency guards (`if (draftStore)`, `if (selectionService)`) in `routes.js` | **removed** — the composition root always provides every controller |

**Out of scope.** Do not migrate scripts or tests. Do not delete any `.js` file. Do not add new endpoints beyond `GET /api/health`. Do not change any existing path or method.

**Acceptance criteria.**
- [ ] All 7 files exist.
- [ ] `npm run build` succeeds and `node dist/src/server.js` boots, logs `mongo connected`, `mongo indexes ensured`, and `Server listening on port ...`.
- [ ] `GET /api/health` returns 200.
- [ ] All 17 original method+path pairs are registered (verify against the table above).
- [ ] `createApp` contains no `listen` and no `getDb`.
- [ ] `src/server.ts` is the only file under `src/` outside `src/config/` that decides which vector store to build.
- [ ] `GET /api/nonexistent` returns 404 with `{ error, code: "NOT_FOUND", details: null }`.
- [ ] `npx tsc --noEmit` exits 0.

---

### Phase 11 — Test suite migration and expansion

**Goal.** Port every existing test to TypeScript against the new structure, reorganise into `unit/` / `integration/` / `live/` / `helpers/`, and add coverage for the newly extracted units. It comes after the application compiles and runs so tests target the final shape.

**Preconditions.** Phase 10 complete and the server boots.

**Exact file/folder actions.**

*Create:*
- `tests/helpers/fixture.helper.ts`, `tests/helpers/fake-vector-store.helper.ts`, `tests/helpers/fake-model.helper.ts`, `tests/helpers/test-server.helper.ts`
- `tests/unit/utils/vector-math.util.test.ts`
- `tests/unit/utils/alias-boost.util.test.ts`
- `tests/unit/utils/render-summary.util.test.ts`
- `tests/unit/utils/graph-validator.util.test.ts`
- `tests/unit/utils/schema-validator.util.test.ts`
- `tests/unit/utils/hash.util.test.ts`
- `tests/unit/utils/request-validator.util.test.ts`
- `tests/unit/utils/serializer.util.test.ts`
- `tests/unit/errors/base.error.test.ts`
- `tests/unit/services/selection.service.test.ts`
- `tests/unit/services/selector.service.test.ts`
- `tests/unit/services/retrieval.service.test.ts`
- `tests/unit/services/vector-store.test.ts`
- `tests/unit/services/workflow.service.test.ts`
- `tests/unit/services/draft.service.test.ts`
- `tests/integration/workflow.route.test.ts`
- `tests/integration/draft.route.test.ts`
- `tests/integration/selection.route.test.ts`
- `tests/integration/error-handler.test.ts`

*Move/rename (port to TS under `tests/live/`):* `consistency.test.js` → `consistency.live.test.ts`, `extractionAccuracy.test.js` → `extraction-accuracy.live.test.ts`, `generalisation.test.js` → `generalisation.live.test.ts`, `robustness.test.js` → `robustness.live.test.ts`, `selectionQuality.test.js` → `selection-quality.live.test.ts`, `helpers.js` → `tests/helpers/live.helper.ts`.

*Delete (this phase):* nothing. The old `tests/*.js` are deleted in Phase 14 after their ports are green.

**Step-by-step instructions.**

1. Add `tsx` as the test runner: `"test": "node --import tsx --test \"tests/unit/**/*.test.ts\" \"tests/integration/**/*.test.ts\""` and `"test:live": "node --import tsx --test \"tests/live/**/*.test.ts\""` in `package.json`. Keep `legacy:test` until Phase 14.
2. **`fixture.helper.ts`** — loads sample workflows from `src/data/samples/expected/` and prose from `src/data/samples/input/`, replacing the `readFileSync` + `__dirname` boilerplate repeated in six current test files.
3. **`fake-model.helper.ts`** — in-memory fakes implementing the `DraftModel`, `TemplateModel`, and `SelectionSessionModel` surfaces, replacing the `fakeDraftStore` currently inlined in `tests/routes.test.js` and the hand-rolled stubs in `mongoStore.test.js` and `selectionService.test.js`.
4. **`test-server.helper.ts`** — builds the Express app via `createApp` with injected fake-backed controllers, binds to port 0, and returns `{ baseUrl, close }`. Replaces `withTestServer` in `tests/routes.test.js`. Note the current helper depends on `FileWorkflowStore`; the replacement uses fake models instead, which is why `fileStore.js` can be deleted.
5. Port each existing unit test one-for-one, preserving every assertion:
   - `tests/vectorMath.test.js` → `tests/unit/utils/vector-math.util.test.ts`
   - `tests/aliasBoost.test.js` → `tests/unit/utils/alias-boost.util.test.ts` (**update call sites**: `boost` is now a required third argument)
   - `tests/renderSummary.test.js` → `tests/unit/utils/render-summary.util.test.ts`
   - `tests/graphValidator.test.js` → `tests/unit/utils/graph-validator.util.test.ts` (message strings unchanged)
   - `tests/schema.test.js` → `tests/unit/utils/schema-validator.util.test.ts`
   - `tests/vectorStore.test.js` → `tests/unit/services/vector-store.test.ts`
   - `tests/selectorAgent.test.js` → `tests/unit/services/selector.service.test.ts`
   - `tests/selectionService.test.js` → `tests/unit/services/selection.service.test.ts` (add a case for the new `getMatchedWorkflow`, covering both the `ConflictError` and success paths)
   - `tests/mongoStore.test.js` → `tests/unit/services/workflow.service.test.ts` (its embedding-stub injection now targets `EmbeddingService`)
   - `tests/routes.test.js` → split by domain into the three `tests/integration/*.route.test.ts` files, preserving every status-code and body assertion
   - `tests/fileStore.test.js` → **not ported.** The class is deleted. Confirm no assertion in it covers behaviour that exists nowhere else; the file-persistence semantics it tests (atomic write, index.json, version listing) are specific to the deleted implementation.
6. Write the new tests: `hash.util.test.ts` (CRLF/trim normalisation stability), `request-validator.util.test.ts` (each helper's exact `ValidationError` message), `serializer.util.test.ts` (ObjectId→string, `updated_at` ISO fallback), `base.error.test.ts` (`statusCode`/`code`/`toJSON`/`instanceof`), `retrieval.service.test.ts` (over-fetch `k+2`, boost application, slice to `topK`), `draft.service.test.ts` (hash idempotency, the three status transitions, 2000-char truncation), `error-handler.test.ts` (`BaseError` → its status; unknown error → 500 with a generic body and no leak of the original message).
7. Port `tests/live/*` with the same skip-on-missing-credentials behaviour they have today, pointing at the new services.
8. Run `npm test`. Every ported assertion must pass.

**Mapping from old to new.** As enumerated in step 5, plus: `fakeDraftStore` in `routes.test.js` → `tests/helpers/fake-model.helper.ts`; `withTestServer` in `routes.test.js` → `tests/helpers/test-server.helper.ts`; `tests/live/helpers.js` → `tests/helpers/live.helper.ts`; `fixtures/` reads in tests → `src/data/samples/` via `fixture.helper.ts`.

**Out of scope.** Do not delete the old `tests/*.js` files yet. Do not add a coverage threshold gate. Do not change any production behaviour to make a test pass — if a ported test fails, the port is wrong, not the assertion.

**Acceptance criteria.**
- [ ] `npm test` exits 0.
- [ ] Every assertion from the 10 ported unit/route test files exists in the new suite (`fileStore.test.js` is the only intentional non-port; record that in the phase report).
- [ ] `tests/unit/`, `tests/integration/`, `tests/live/`, `tests/helpers/` all exist and are populated.
- [ ] No test file imports from `src/knowledgeBank/`, `src/api/`, `src/llm/`, `src/retrieval/`, `src/selector/`, or `src/validation/`.
- [ ] No `.js` test file was deleted.
- [ ] `npx tsc --noEmit` exits 0.

---

### Phase 12 — Script migration

**Goal.** Port the five CLI scripts to TypeScript against the new services, removing the business logic currently embedded in them. It comes after services and the app so the scripts consume the final APIs.

**Preconditions.** Phases 5, 6, 7 complete.

**Exact file/folder actions.**

*Create:* `scripts/init-db.script.ts`, `scripts/backfill-summaries.script.ts`, `scripts/evaluate-selection.script.ts`, `scripts/smoke-test-azure.script.ts`, `scripts/smoke-test-embeddings.script.ts`.

*Modify:* `package.json` script entries.

**Step-by-step instructions.**

1. **`init-db.script.ts`** — port `scripts/initDb.js`: `getDb()`, `ensureIndexes()`, print the database name and every collection with its index names, `closeDb()`. Output format unchanged.
2. **`backfill-summaries.script.ts`** — port `scripts/backfillSummaries.js` but **it must no longer define the prompt or the schema**; both moved to `src/data/` in Phase 5 and the LLM call moved to `ExtractionService.generateRetrievalSummary` in Phase 7. The script becomes: construct the services, `workflowService.list()`, for each workflow load the document, `continue` with `skip` logged when `retrieval_summary` already exists, otherwise call `generateRetrievalSummary`, assign it, `workflowService.save(workflow)`, log `` `backfill ${id} -> v${version}` ``. Keep idempotency and the log wording.
3. **`evaluate-selection.script.ts`** — port `scripts/evaluateSelection.js`. Read cases from `src/data/samples/selection/queries.json`. Construct `TemplateModel` → `InMemoryVectorStore` → `RetrievalService` → `SelectorService`. Keep the recall/decision accounting, the `console.table` output, the two `pct()` percentages, and the two closing hint lines verbatim.
4. **`smoke-test-azure.script.ts`** — reimplement the deleted `smokeTest()` here: one `chat.completions.create` with `"Reply with only the word OK."`, print `` `Azure OpenAI connection OK — response: "${reply}"` ``, set `process.exitCode = 1` on failure. **This is where `smokeTest()` from `azureClient.js` lands** — diagnostics belong in scripts, not in a production client.
5. **`smoke-test-embeddings.script.ts`** — port `scripts/smokeTestEmbeddings.js` using `EmbeddingService.embedQuery` and `dot` from the vector-math util. Keep the five printed lines and the final `OK embeddings` / `FAIL dimension mismatch` verdict.
6. Update `package.json` scripts to `tsx` invocations: `"init-db": "tsx scripts/init-db.script.ts"`, `"backfill:summaries": "tsx scripts/backfill-summaries.script.ts"`, `"evaluate:selection": "tsx scripts/evaluate-selection.script.ts"`, `"smoke-test:azure": "tsx scripts/smoke-test-azure.script.ts"`, `"smoke-test:embeddings": "tsx scripts/smoke-test-embeddings.script.ts"`. Keep the same npm script **names** so existing muscle memory and docs still work.
7. Run `npm run init-db` against a live MongoDB and confirm the six indexes are reported.
8. Run `npx tsc --noEmit`.

**Mapping from old to new.**

| Old | New |
| --- | --- |
| `scripts/initDb.js` | `scripts/init-db.script.ts` |
| `scripts/backfillSummaries.js` | `scripts/backfill-summaries.script.ts` (prompt → `src/data/prompts/`, schema → `src/data/schemas/`, LLM call → `ExtractionService`) |
| `scripts/evaluateSelection.js` | `scripts/evaluate-selection.script.ts` (fixtures → `src/data/samples/selection/`) |
| `scripts/smokeTestAzure.js` + `smokeTest()` in `azureClient.js` | `scripts/smoke-test-azure.script.ts` |
| `scripts/smokeTestEmbeddings.js` | `scripts/smoke-test-embeddings.script.ts` |

**Out of scope.** Do not delete the old `scripts/*.js`. Do not change any script's console output format or npm script name. Do not add new scripts.

**Acceptance criteria.**
- [ ] All 5 `.script.ts` files exist.
- [ ] `npm run init-db` prints the database name and all six index names.
- [ ] `backfill-summaries.script.ts` contains no prompt string and no JSON Schema literal.
- [ ] Every script closes the DB connection (`closeDb`) before exiting where the original did.
- [ ] The five npm script names are unchanged.
- [ ] `npx tsc --noEmit` exits 0.

---

### Phase 13 — Documentation reorganisation

**Goal.** Consolidate all eight markdown files into `docs/` under sensible subfolders and update every path reference broken by the restructure. It comes after the code is final so documented paths are accurate.

**Preconditions.** Phases 1–12 complete.

**Exact file/folder actions.**

*Move:*

| From | To |
| --- | --- |
| `overview.md` | `docs/architecture/project-overview.md` |
| `IMPLEMENTATION_PLAN.md` | `docs/plans/original-implementation-plan.md` |
| `RAG_IMPLEMENTATION_GUIDE.md` | `docs/architecture/rag-implementation-guide.md` |
| `RAG_MONGODB_AZURE_SEARCH.md` | `docs/architecture/rag-mongodb-azure-search.md` |
| `WORKFLOW_SELECTION_PLAN.md` | `docs/plans/workflow-selection-plan.md` |
| `docs/plans/WORKFLOW_SELECTION_IMPLEMENTATION_PLAN.md` | `docs/plans/workflow-selection-implementation-plan.md` |
| `docs/RUNNING_THE_APP.md` | `docs/guides/running-the-app.md` |
| `docs/documentations/API_DOCUMENTATION.md` | `docs/api/api-documentation.md` |
| `docs/plans/RESTRUCTURE_IMPLEMENTATION_PLAN.md` (this file) | `docs/plans/restructure-implementation-plan.md` |

*Create:*
- `docs/README.md` — an index linking every document with a one-line description
- `docs/architecture/folder-structure.md` — the target tree from §2.2 with per-folder responsibilities
- `docs/architecture/error-handling.md` — the error hierarchy and status-code table
- `docs/guides/configuration.md` — every environment variable, its default, whether it is required, and which config module owns it

*Delete:* the now-empty `docs/documentations/` directory.

**Step-by-step instructions.**

1. Move each file with `git mv` (or plain move if git is unavailable) to the destination in the table above, lower-kebab-case throughout.
2. Update **every** stale reference inside the moved documents:
   - `docs/api/api-documentation.md` — verify each of the 17 endpoints against the Phase 10 table; add `GET /api/health`; update the error-response section to show the new `{ error, code, details }` body; update its "Suggested Postman test order" section to match the Phase 15 collection order.
   - `docs/guides/running-the-app.md` — replace `npm start` (which now runs `node dist/src/server.js`) with the build-then-start sequence, document `npm run dev` (tsx watch), update the tests section for the new test scripts, and update `.env.example` → `.example.env`.
   - `docs/architecture/project-overview.md` — its §3 "Directory structure" and its `src/config/env.js` / `src/llm/extractWorkflow.js` / `src/api/routes.js` links all point at deleted paths. Rewrite §3 from §2.2 of this plan and repoint every link.
   - Search all docs for the strings `src/api/`, `src/knowledgeBank/`, `src/llm/`, `src/retrieval/`, `src/selector/`, `src/validation/`, `src/schema/`, `fixtures/`, `demo-drafts/`, `.env.example`, and `KNOWLEDGE_BANK_PATH`, and update or annotate each hit.
3. In `docs/plans/*`, add a one-line banner at the top of each historical plan: `> Historical planning document. Paths and file names below predate the TypeScript restructure — see docs/architecture/folder-structure.md for the current layout.` Do **not** rewrite historical plan bodies; annotate them.
4. Write `docs/architecture/folder-structure.md` from §2.2 and §2.3.
5. Write `docs/architecture/error-handling.md`: the `BaseError` contract, the eight subclasses with their status codes and `code` strings, and how the error middleware works.
6. Write `docs/guides/configuration.md`: a table of all 21 environment variables — name, required/optional, default, owning config module, consuming code. Explicitly record that `KNOWLEDGE_BANK_PATH` was removed.
7. Write `docs/README.md` indexing all documents by folder.
8. Confirm no markdown file remains at the repository root and that `docs/documentations/` is gone.

**Mapping from old to new.** The move table above is the complete mapping. No document content is lost; five root-level files and three `docs/` files are relocated, four new documents are added.

**Out of scope.** Do not rewrite the historical planning documents' content beyond the banner and broken-path fixes. Do not delete any markdown file. Do not touch the Postman collection (Phase 15).

**Acceptance criteria.**
- [ ] Zero `.md` files at the repository root.
- [ ] All nine documents exist at their new paths with lower-kebab-case names.
- [ ] `docs/documentations/` no longer exists.
- [ ] `docs/README.md`, `docs/architecture/folder-structure.md`, `docs/architecture/error-handling.md`, `docs/guides/configuration.md` exist.
- [ ] Grepping `docs/` for `src/api/`, `src/knowledgeBank/`, `.env.example`, or `KNOWLEDGE_BANK_PATH` returns only intentional historical annotations.
- [ ] `docs/api/api-documentation.md` documents 18 endpoints (17 original + health).

---

### Phase 14 — Residual artifact removal and root-file cleanup

**Goal.** Delete every legacy JavaScript source, dead file, and stale config now that TypeScript equivalents exist and are tested; finalise `package.json`, `.gitignore`, and `.env`. It is second-to-last because deletion is only safe once everything above is green.

**Preconditions.** Phases 1–13 complete. `npm run build` succeeds, `npm test` passes, the server boots, and all five scripts run.

**Exact file/folder actions.**

*Delete — legacy source (entire directories):*
`src/api/` (4 files), `src/db/indexes.js`, `src/db/mongoClient.js`, `src/knowledgeBank/` (4 files), `src/llm/` (3 files), `src/retrieval/` (9 files), `src/selector/` (6 files), `src/schema/` (2 files), `src/validation/` (2 files), `src/utils/hash.js`, `src/utils/logger.js`, `src/config/constants.js`, `src/config/env.js`, `src/index.js`.

*Delete — legacy scripts:* `scripts/backfillSummaries.js`, `scripts/evaluateSelection.js`, `scripts/initDb.js`, `scripts/smokeTestAzure.js`, `scripts/smokeTestEmbeddings.js`.

*Delete — legacy tests:* `tests/aliasBoost.test.js`, `tests/fileStore.test.js`, `tests/graphValidator.test.js`, `tests/mongoStore.test.js`, `tests/renderSummary.test.js`, `tests/routes.test.js`, `tests/schema.test.js`, `tests/selectionService.test.js`, `tests/selectorAgent.test.js`, `tests/vectorMath.test.js`, `tests/vectorStore.test.js`, `tests/live/*.js` (6 files).

*Delete — residual artifacts:* `txt.json`, `fixtures/` (whole tree, now in `src/data/samples/`), `demo-drafts/` (whole tree), `data/workflows/` and the `data/` directory.

*Modify:* `package.json`, `.gitignore`, `.env`.

**Step-by-step instructions.**

1. **Before deleting anything**, run a reference sweep. For each of these strings, grep the entire repo excluding `node_modules/` and `dist/`: `knowledgeBank`, `fileStore`, `FileWorkflowStore`, `WorkflowStore`, `mongoStore`, `extractWorkflow.js`, `selectorAgent`, `selectionSessionStore`, `aliasBoost.js`, `renderSummary.js`, `vectorMath.js`, `roleVocabulary`, `decisionSchema`, `selectorPrompt`, `systemPrompt`, `fewShot`, `constants.js`, `env.js`, `txt.json`, `fixtures/`, `demo-drafts`, `KNOWLEDGE_BANK_PATH`, `knowledgeBankPath`. **Every hit must be either inside a file being deleted, or inside a historical `docs/plans/*` document.** If a hit appears in a kept `.ts` file, stop and fix the import before deleting.
2. Delete the legacy source directories and files listed above.
3. Delete the legacy scripts and tests.
4. Delete `txt.json`. It is an unreferenced 18 KB dump of a `transcript_retrieval_request` request body. **Before deleting, confirm it is not referenced by the Postman collection**; if it is, move it to `src/data/samples/expected/transcript_retrieval_request.json` instead of deleting.
5. Delete `fixtures/` and `demo-drafts/` — both were copied into `src/data/samples/` in Phase 5. Verify file counts match before deleting (3 input `.txt`, 2 expected `.json`, 1 selection `.json`, 3 demo `.txt`).
6. Delete `data/workflows/` and `data/`. This directory exists only because of the dead `KNOWLEDGE_BANK_PATH`. Confirm it is empty first; if it contains workflow JSON files, archive them into `src/data/samples/` rather than deleting.
7. **Docker audit.** Search the repo (excluding `node_modules/`) for `Dockerfile`, `docker-compose*.yml`, `docker-compose*.yaml`, `.dockerignore`, and `.devcontainer/`. **Expected result: none exist.** Record "no Docker artifacts present" in the phase report. Do **not** delete the Docker *instructions* in `docs/guides/running-the-app.md` — running MongoDB in a container is a legitimate, still-valid setup path.
8. **`package.json` final state:**
   - Remove `legacy:start`, `legacy:dev`, `legacy:test`.
   - `main` → `dist/src/server.js`.
   - Scripts: `build`, `typecheck`, `dev`, `start`, `test`, `test:live`, `init-db`, `backfill:summaries`, `evaluate:selection`, `smoke-test:azure`, `smoke-test:embeddings`, and `prestart: "npm run build"`.
   - Keep `"type": "module"`.
   - `dependencies`: `ajv`, `ajv-formats`, `dotenv`, `express`, `mongodb`, `openai` (unchanged).
   - `devDependencies`: `typescript`, `tsx`, `@types/node`, `@types/express`. **Remove `nodemon`** — `tsx watch` replaces it.
   - Add `"engines": { "node": ">=18" }`.
   - Fill in `description` (one sentence) and `license`.
   - Run `npm install` to refresh the lockfile.
9. **`.gitignore` final state:** `node_modules/`, `.env`, `dist/`, `*.tsbuildinfo`, `coverage/`, `*.log`, `.DS_Store`. **Remove the `data/` line** — that directory no longer exists.
10. **`.env` final state:** exactly the variables in `.example.env`, with real values, no `KNOWLEDGE_BANK_PATH`. Verify `.env` is still git-ignored and `.example.env` is not.
11. Run, in order: `npx tsc --noEmit`, `npm run build`, `npm test`, `npm run init-db`, then boot the server and hit `GET /api/health`.
12. Confirm `src/` contains **zero** `.js` files: `find src scripts tests -name "*.js" -not -path "*/node_modules/*"` must return nothing.

**Mapping from old to new.** Every deletion in this phase corresponds to a `.ts` replacement created in Phases 2–12. Cross-check each against the mapping tables of Phases 2, 5, 6, 7, 8, 9, 10, 11, and 12 before deleting. The only files with **no** replacement, deleted deliberately:

| Deleted with no replacement | Reason |
| --- | --- |
| `src/knowledgeBank/fileStore.js` | Superseded by MongoDB; cannot satisfy the retrieval path (no embeddings, no `listForRetrieval`, no `getRecord`, no `setReviewStatus`) |
| `src/knowledgeBank/store.js` (`WorkflowStore`) | Abstract base for a two-implementation hierarchy that is now one implementation |
| `tests/fileStore.test.js` | Tests the deleted class |
| `txt.json` | Unreferenced stray data dump |
| `data/workflows/` | Artifact of the dead `KNOWLEDGE_BANK_PATH` |
| `smokeTest()` in `azureClient.js` | Relocated to `scripts/smoke-test-azure.script.ts` |
| `config.knowledgeBankPath`, `KNOWLEDGE_BANK_PATH` | Read but never consumed |
| `nodemon` dependency | Replaced by `tsx watch` |

**Out of scope.** Do not delete `docs/`, `.git/`, `package-lock.json`, or `node_modules/`. Do not remove the Docker setup instructions from the running-the-app guide. Do not change any runtime behaviour — this phase deletes and configures only.

**Acceptance criteria.**
- [ ] `find src scripts tests -name "*.js"` returns nothing.
- [ ] `txt.json`, `fixtures/`, `demo-drafts/`, and `data/` no longer exist.
- [ ] The reference sweep in step 1 produces no hit in any kept `.ts` file.
- [ ] Docker audit run and result recorded (expected: no artifacts found).
- [ ] `package.json` has no `nodemon`, no `legacy:*` scripts, `main: "dist/src/server.js"`, and `engines.node >= 18`.
- [ ] `.gitignore` contains `dist/` and no longer contains `data/`.
- [ ] `.env` and `.example.env` contain the same variable names in the same order.
- [ ] `npm run build`, `npm test`, `npm run init-db` all succeed, and the server boots and serves `GET /api/health`.

---

### Phase 15 — Postman collection

**Goal.** Produce the final Postman collection and environment covering every endpoint with request bodies, correct URLs, and test scripts that chain variables so the whole collection runs in sequence. It is last because it must target the final, verified endpoint set.

**Preconditions.** Phase 14 complete; the server boots and all 18 endpoints respond.

**Exact file/folder actions.**

*Create/replace:*
- `docs/postman/unblock-ai.postman_collection.json`
- `docs/postman/unblock-ai.postman_environment.json`
- `docs/postman/README.md`

*Delete:* `docs/postman/UNBLOCK-AI.postman_collection.json`, `docs/postman/UNBLOCK-AI.postman_environment.json` (replaced by the lower-kebab-case files above).

**Step-by-step instructions.**

1. Build a Collection v2.1.0 document named `UNBLOCK-AI API`, with collection variables `baseUrl` (`http://localhost:3000/api`), `draftId`, `workflowId`, `sessionId`, `templateVersion`, all initially empty except `baseUrl`.
2. Organise into five folders **in this execution order** (the order the Collection Runner will follow):
   1. **Health** — `GET {{baseUrl}}/health`
   2. **Drafts** — `POST /drafts`, `GET /drafts`, `GET /drafts/{{draftId}}`, `POST /drafts/{{draftId}}/extract`
   3. **Workflows** — `POST /workflows/extract`, `POST /workflows`, `GET /workflows`, `GET /workflows/{{workflowId}}`, `PUT /workflows/{{workflowId}}`, `POST /workflows/{{workflowId}}/validate`, `GET /workflows/{{workflowId}}/record`, `PATCH /workflows/{{workflowId}}/review`
   4. **Selection** — `POST /selection/sessions`, `POST /selection/sessions/{{sessionId}}/answer`, `POST /selection/sessions/{{sessionId}}/choose`, `GET /selection/sessions/{{sessionId}}/workflow`
   5. **Error cases** — one request per error class: missing `text` on `POST /drafts` (400), unknown id on `GET /workflows/does_not_exist` (404), invalid workflow on `POST /workflows` (422), bad `review_status` on `PATCH /workflows/{{workflowId}}/review` (400), `GET /selection/sessions/{{sessionId}}/workflow` on an unmatched session (409), and `GET /api/nope` (404)

   **All 18 endpoints must appear.** Cross-check against the Phase 10 table.
3. Every request carries `Content-Type: application/json` where it has a body, and a realistic raw JSON body. Reuse the existing collection's bodies as the starting point (they are valid and schema-complete) and take additional prose bodies from `src/data/samples/input/`.
4. Add a `test` event script to each request:
   - Assert the expected status code with `pm.test`.
   - Where the response yields an id needed later, persist it: `POST /drafts` → `pm.collectionVariables.set("draftId", pm.response.json().id)`; `POST /drafts/:id/extract` → set `workflowId` and `templateVersion`; `POST /workflows` → set `workflowId`; `POST /selection/sessions` → set `sessionId`.
   - Assert one meaningful body property (e.g. `pm.expect(pm.response.json()).to.have.property("workflow_id")`).
   - In **Error cases**, assert the body has `error` and `code` and that `code` matches the expected error class.
5. Handle the two conditional flows explicitly:
   - `POST /selection/sessions/:id/answer` only applies when round 1 returned `ambiguous`. Add a pre-request script that reads a collection variable set by the previous request and calls `postman.setNextRequest` to skip the answer step when the decision was `matched`. Document this in the folder description.
   - `POST /workflows/extract` and `POST /drafts/:id/extract` take 10–60 seconds. Note the required Postman timeout increase in each request's description, as the current collection does.
6. Write `docs/postman/unblock-ai.postman_environment.json` with `baseUrl` and any host-specific overrides.
7. Write `docs/postman/README.md`: how to import both files, the required timeout setting, the prerequisite that MongoDB is running and at least one confirmed template exists (or that the Drafts folder be run first to create one), and how to run the whole collection with the Collection Runner.
8. **Verify by running the collection end to end** against a live server with the Collection Runner (or `newman`). Every request must pass its tests with no manual variable entry.
9. Update the "Suggested Postman test order" section of `docs/api/api-documentation.md` to match the folder order above.

**Mapping from old to new.**

| Old | New |
| --- | --- |
| `docs/postman/UNBLOCK-AI.postman_collection.json` (18 requests, 3 folders, no scripts) | `docs/postman/unblock-ai.postman_collection.json` (24 requests, 5 folders, full test scripts and variable chaining) |
| `docs/postman/UNBLOCK-AI.postman_environment.json` | `docs/postman/unblock-ai.postman_environment.json` |
| Manual copy-paste of `{{draftId}}` / `{{workflowId}}` / `{{sessionId}}` | `pm.collectionVariables.set` in test scripts |
| (none) | Health request; Error-cases folder; `docs/postman/README.md` |

**Out of scope.** Do not change any server code to make a Postman request pass — if a request fails, the request is wrong. Do not add endpoints that do not exist. Do not commit real credentials into the environment file.

**Acceptance criteria.**
- [ ] `docs/postman/unblock-ai.postman_collection.json` exists and the two old uppercase files are gone.
- [ ] All 18 endpoints appear as requests; the five folders are ordered Health → Drafts → Workflows → Selection → Error cases.
- [ ] Every request has at least one `pm.test` assertion.
- [ ] `draftId`, `workflowId`, and `sessionId` are each written by a test script and never require manual entry.
- [ ] A full Collection Runner pass against a live server completes with zero failures and zero manual steps.
- [ ] `docs/postman/README.md` exists and documents import, timeout, and prerequisites.
- [ ] `docs/api/api-documentation.md`'s test-order section matches the collection.

---

## Coverage check — every §2 requirement is addressed by a phase

| §2 requirement | Phase(s) |
| --- | --- |
| Express + TypeScript, build, dev loop | 1, 10, 14 |
| `src/routes` | 10 |
| `src/controllers` | 9 |
| `src/services` (strict separation) | 7 |
| `src/models` (one per DB table, schemas from real DB) | 6 |
| `src/config` (separated modules) | 2 |
| `src/utils` (with `shared/` + feature subfolders) | 5 |
| `src/data` (prompts, schemas, constants, samples) | 5 |
| `src/middlewares` (one per file, wired where applicable) | 8, 10 |
| `tests/` outside `src/` | 11 |
| `docs/` outside `src/`, reorganised | 13 |
| `.env`, `.example.env`, `.gitignore`, `package.json` | 2, 14 |
| Modularity and reusability | 5, 6, 7 |
| SOLID / DRY / OOP | 5, 6, 7, 8 |
| Base error class + subclasses | 4, 8 |
| Central types directory in `lib/` | 3 |
| Clean code, no unnecessary comments | 5, 6, 7, 8, 9, 10 |
| Residual artifacts, dead code, Docker audit | 14 |
| Postman collection with bodies, URLs, sequencing scripts | 15 |
| Dot-notation Angular-style naming | all |
| Core functionality fully preserved | 7, 9, 10, 11, 15 |
