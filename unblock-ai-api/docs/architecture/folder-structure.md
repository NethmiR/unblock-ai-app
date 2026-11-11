# Folder Structure

The target layout adopted by the TypeScript restructure (see
[../plans/restructure-implementation-plan.md](../plans/restructure-implementation-plan.md) §2.2–§2.3
for the original design rationale).

```
unblock-ai-api/
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
│  │  ├─ llm-adapter/
│  │  │  ├─ llm-adapter.interface.ts
│  │  │  ├─ azure-openai.llm-adapter.ts
│  │  │  ├─ gemini.llm-adapter.ts
│  │  │  └─ index.llm-adapter.ts
│  │  ├─ embedding-adapter/
│  │  │  ├─ embedding-adapter.interface.ts
│  │  │  ├─ azure-openai.embedding-adapter.ts
│  │  │  ├─ gemini.embedding-adapter.ts
│  │  │  └─ index.embedding-adapter.ts
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
│  │  ├─ llm.config.ts
│  │  ├─ embedding.config.ts
│  │  ├─ extraction.config.ts
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
│  │  │  ├─ env-parse.util.ts
│  │  │  └─ json-schema-guard.util.ts
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
│  │  │  ├─ ai-provider.constant.ts
│  │  │  ├─ llm.constant.ts
│  │  │  └─ embedding.constant.ts
│  │  └─ samples/
│  │     ├─ input/
│  │     ├─ expected/
│  │     ├─ selection/
│  │     └─ demo-drafts/
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
│  │     ├─ ai/llm.type.ts
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
│  ├─ copy-assets.script.ts           # build step: copies non-.ts assets into dist/
│  ├─ db/
│  │  ├─ init-db.script.ts
│  │  ├─ migrate-postgres.script.ts
│  │  └─ seed-auth.script.ts
│  └─ maintenance/
│     └─ backfill-summaries.script.ts
├─ tests/
│  ├─ unit/
│  │  ├─ utils/
│  │  ├─ services/
│  │  ├─ models/
│  │  └─ errors/
│  ├─ integration/
│  ├─ live/
│  ├─ smoke/                          # manual connectivity checks (tsx, not node:test)
│  ├─ evaluation/                     # offline evaluation harness (recall/decision accuracy report)
│  ├─ perf/                           # perf-test suite: operations, lib, results/ (git-ignored)
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

## Folder responsibilities

**`src/routes/`** — One file per route group. A route file does exactly three things: create an Express `Router`, attach middlewares that apply to that group, and bind each path+method to a controller method wrapped in `asyncHandler`. A route file contains no business logic, no body parsing, no status-code decisions, and no `res.json` calls.

**`src/controllers/`** — Parses and validates the HTTP request (params, query, body), calls one or more services, maps the service result to an HTTP status code and response body, and returns. Controllers never touch MongoDB, never call an AI adapter or provider SDK, and never contain domain rules. A controller throws typed errors from `src/errors/`; it never formats an error response itself.

**`src/services/`** — Owns all business logic. A service performs DB access through its model, calls utils for pure computation, and calls external AI providers only through `ILlmAdapter` and `IEmbeddingAdapter`, never through a provider SDK directly. Each provider lives in one adapter file under `llm-adapter/` or `embedding-adapter/`, and the matching `create*Adapter` factory picks one from config. Services receive their collaborators through constructor injection, never by importing a concrete singleton. `extraction.service.ts` only extracts, `embedding.service.ts` only embeds, `retrieval.service.ts` only ranks, `selector.service.ts` only makes one model decision, `selection.service.ts` only orchestrates the multi-round loop.

**`src/models/`** — One model per MongoDB collection. A model owns: the collection name, the TypeScript document interface, the index specifications for that collection, and thin typed CRUD operations (`insertOne`, `findOne`, `updateOne`, `find`, projections). Models contain no business rules — no version-number computation, no embedding calls, no status transition policy. Those live in services.

**`src/config/`** — Separate config modules per concern, each exporting a frozen, fully-typed object read from `process.env` exactly once at load time and validated on read. `index.config.ts` re-exports a single composed `config` object. No file outside `src/config/` may read `process.env` directly.

**`src/utils/`** — Pure helper functions only: no I/O, no config reads other than values passed as arguments, no class state. Organised into `shared/` (cross-feature: logging, hashing, ObjectId coercion, assertions, env parsing) plus feature-specific subfolders (`workflow/`, `retrieval/`, `http/`).

**`src/data/`** — Predefined and hardcoded data: LLM prompt templates, JSON Schemas and structured-output schemas, the role vocabulary, enum-like constants, and sample/seed data. No logic beyond simple string composition of prompts.

**`src/lib/types/`** — The central type location, a directory (never one big file), organised into subfolders by domain. Every folder has an index barrel; `index.type.ts` re-exports all domains.

**`src/errors/`** — A base error class plus one subclass per error category. The base carries `statusCode`, `code`, `details`, and `isOperational`. Subclasses set their own defaults, so the error handler reads the status off the error instead of maintaining a lookup table. See [error-handling.md](./error-handling.md).

**`src/middlewares/`** — One middleware per file, single responsibility each, wired into routes only where applicable.

**`scripts/`** — CLI entry points that are neither tests nor part of the running app: `db/` (init-db, run Postgres migrations, seed auth users) and `maintenance/` (one-off data backfills), plus `copy-assets.script.ts` at the root, invoked from `npm run build` to copy non-`.ts` assets (Postgres migrations, sample data) into `dist/`.

**`tests/`** — Outside `src/`. All unit tests under `tests/unit/`, mirroring the `src/` layout; integration tests (HTTP-level, in-memory fakes) under `tests/integration/`; network-dependent tests under `tests/live/`; shared fixtures and fake builders under `tests/helpers/`. Also home to test-adjacent tooling that isn't `node:test`-based: `tests/smoke/` (manual connectivity checks against real Azure/SMTP, run individually via `npm run smoke-test:*`), `tests/evaluation/` (the selector recall/accuracy report, `npm run evaluate:selection`), and `tests/perf/` (the perf-test suite, `npm run perf-test`, writing timestamped results under its own git-ignored `results/`).

**`docs/`** — Outside `src/`. All markdown organised into `api/`, `architecture/`, `guides/`, `plans/`, and `postman/`. See [../README.md](../README.md) for the full index.

**Root-level files** — `.env` (real secrets, git-ignored), `.example.env` (every variable with a safe placeholder), `.gitignore`, `package.json`, `tsconfig.json`.

## Naming convention

Angular-style dot notation everywhere: `<name>.<role>.ts`. Roles in use: `.route.ts`, `.controller.ts`, `.service.ts`, `.model.ts`, `.middleware.ts`, `.util.ts`, `.config.ts`, `.type.ts`, `.error.ts`, `.prompt.ts`, `.schema.ts`, `.constant.ts`, `.vocabulary.ts`, `.data.ts`, `.client.ts`, `.interface.ts`, `.script.ts`, `.test.ts`. Multi-word names use kebab-case (`selection-session.model.ts`, `in-memory.vector-store.ts`). Barrel files are `index.<role>.ts`.

## Module rules

- Every relative import ends in `.js` (NodeNext ESM), e.g. `import { x } from "./y.util.js";`.
- `strict: true` TypeScript throughout; explicit types on every exported function, class, and constant.
- Only `src/config/env.config.ts` reads `process.env`.
- No comments that restate the code; no references to restructure phase numbers in code or comments.
