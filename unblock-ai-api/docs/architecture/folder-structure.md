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
│  │  ├─ workflow-template.route.ts   # /workflow-templates: draft, generate, publish, archive, versions
│  │  ├─ selection.route.ts           # /selection: sessions, messages, choose, catalogue
│  │  ├─ task.route.ts                # /tasks: create, list, get, forms, cancel, delete, transcript
│  │  ├─ approval.route.ts            # /approvals/:token: approver view and decision (no session)
│  │  ├─ auth.route.ts                # login, me, logout
│  │  ├─ user-session.route.ts        # list / revoke own sessions under /auth/sessions
│  │  ├─ user.route.ts                # user management (user:manage)
│  │  ├─ organisational-unit.route.ts # faculties, departments, divisions
│  │  ├─ designation.route.ts         # designation catalogue
│  │  ├─ user-affiliation.route.ts    # user affiliations, own affiliations, unit members
│  │  └─ health.route.ts
│  ├─ controllers/
│  │  ├─ workflow-template.controller.ts
│  │  ├─ selection.controller.ts
│  │  ├─ task.controller.ts
│  │  ├─ task-form.controller.ts      # form draft and submit
│  │  ├─ approval.controller.ts
│  │  ├─ auth.controller.ts
│  │  ├─ user-session.controller.ts
│  │  ├─ user.controller.ts
│  │  ├─ organisational-unit.controller.ts
│  │  ├─ designation.controller.ts
│  │  ├─ user-affiliation.controller.ts
│  │  └─ health.controller.ts
│  ├─ services/
│  │  ├─ workflow-template.service.ts # template lifecycle, immutable versions, retrieval embedding
│  │  ├─ workflow-template-generation.service.ts # prompt -> validated definition (repair loop)
│  │  ├─ embedding.service.ts
│  │  ├─ retrieval.service.ts
│  │  ├─ selector.service.ts
│  │  ├─ selection.service.ts         # ephemeral owned sessions, eligibility, round budget, catalogue
│  │  ├─ requester-profile.service.ts # memberships, designations, actor types, profile facts (no AI)
│  │  ├─ organisation-catalogue.service.ts # active units and designations snapshot
│  │  ├─ assignee-resolution.service.ts # resolves every step assignee through the registry
│  │  ├─ assignee-resolution/         # IAssigneeResolver strategies: directory, requester, system + registry
│  │  ├─ task.service.ts              # create, read, list, cancel, delete
│  │  ├─ task-plan.service.ts         # pinned definition + resolutions -> pure compiler
│  │  ├─ task-form.service.ts         # draft and submit
│  │  ├─ task-engine.service.ts       # pure state machine, returns TaskEffect[]
│  │  ├─ task-transition.service.ts   # engine context, revision-checked commit, then effects
│  │  ├─ task-effect-executor.service.ts # approval tokens, emails, notified_at
│  │  ├─ approval.service.ts          # token-based approver view and decisions
│  │  ├─ notification.service.ts      # approval, requester and completion emails; never throws
│  │  ├─ task-transcript.service.ts   # transcript PDF on demand
│  │  ├─ audit.service.ts
│  │  ├─ validation.service.ts
│  │  ├─ authentication.service.ts    # login, token -> AuthContext, logout, lockout
│  │  ├─ user-session.service.ts      # issue, list, revoke server-side sessions
│  │  ├─ user.service.ts              # create / list (search, unit filter, paging) / get users
│  │  ├─ organisational-unit.service.ts # hierarchy and lifecycle rules for units
│  │  ├─ designation.service.ts       # designation catalogue rules
│  │  ├─ user-affiliation.service.ts  # replace-set affiliations, single-holder checks
│  │  ├─ llm-adapter/
│  │  │  ├─ llm-adapter.interface.ts
│  │  │  ├─ azure-openai.llm-adapter.ts
│  │  │  ├─ gemini.llm-adapter.ts
│  │  │  ├─ usage-logging.llm-adapter.ts # decorator: logs token usage per LlmOperation
│  │  │  └─ index.llm-adapter.ts
│  │  ├─ embedding-adapter/
│  │  │  ├─ embedding-adapter.interface.ts
│  │  │  ├─ azure-openai.embedding-adapter.ts
│  │  │  ├─ gemini.embedding-adapter.ts
│  │  │  └─ index.embedding-adapter.ts
│  │  ├─ document/                    # IDocumentRenderer: pdf, text
│  │  ├─ mailer/                      # IMailer: console, brevo
│  │  └─ vector-store/
│  │     ├─ vector-store.interface.ts
│  │     ├─ in-memory.vector-store.ts
│  │     └─ atlas.vector-store.ts
│  ├─ repositories/                   # Postgres data access; backend picked by POSTGRES_REPOSITORY_BACKEND
│  │  ├─ user-repository/
│  │  │  ├─ user-repository.interface.ts
│  │  │  ├─ postgres.user-repository.ts
│  │  │  ├─ in-memory.user-repository.ts
│  │  │  └─ index.user-repository.ts
│  │  ├─ user-session-repository/      # same four-file shape
│  │  ├─ organisational-unit-repository/ # same four-file shape + postgres row mapper
│  │  ├─ designation-repository/      # same four-file shape + postgres row mapper
│  │  ├─ user-affiliation-repository/ # same four-file shape
│  │  ├─ in-memory-organisation-store.ts # shared state for the in-memory organisation twins
│  │  └─ repository-registry.factory.ts  # builds every repository for a backend
│  ├─ models/
│  │  ├─ workflow-template.model.ts   # workflow_templates: list, update, retrieval queries, vector search
│  │  ├─ workflow-template-version.model.ts # workflow_template_versions: immutable versions
│  │  ├─ selection-session.model.ts   # selection_sessions: owned, TTL on expires_at
│  │  ├─ task.model.ts                # tasks: optimistic revision, approval token hash lookup
│  │  ├─ audit-log.model.ts
│  │  └─ index.model.ts
│  ├─ config/
│  │  ├─ env.config.ts
│  │  ├─ db.config.ts
│  │  ├─ llm.config.ts
│  │  ├─ embedding.config.ts
│  │  ├─ workflow-template-generation.config.ts # WORKFLOW_TEMPLATE_GENERATION_MAX_ATTEMPTS
│  │  ├─ retrieval.config.ts
│  │  ├─ selection.config.ts          # SELECTION_SESSION_TTL_HOURS, SELECTION_MAX_ROUNDS
│  │  ├─ task.config.ts               # TASK_MAX_INFORMATION_REQUESTS_PER_STEP
│  │  ├─ mail.config.ts
│  │  ├─ document.config.ts
│  │  ├─ server.config.ts
│  │  ├─ postgres.config.ts
│  │  ├─ auth.config.ts               # session TTL, lockout
│  │  ├─ user.config.ts               # USER_DEFAULT_PASSWORD
│  │  ├─ seed.config.ts               # loaded lazily by the seed CLI only
│  │  └─ index.config.ts
│  ├─ middlewares/
│  │  ├─ cors.middleware.ts
│  │  ├─ json-body.middleware.ts
│  │  ├─ request-id.middleware.ts
│  │  ├─ request-logger.middleware.ts
│  │  ├─ async-handler.middleware.ts
│  │  ├─ not-found.middleware.ts
│  │  ├─ authenticate.middleware.ts   # Bearer token -> req.auth; never rejects
│  │  ├─ require-authentication.middleware.ts
│  │  ├─ require-permission.middleware.ts   # requireAnyPermission(...)
│  │  ├─ require-task-ownership.middleware.ts
│  │  └─ error-handler.middleware.ts
│  ├─ utils/
│  │  ├─ shared/
│  │  │  ├─ logger.util.ts
│  │  │  ├─ hash.util.ts
│  │  │  ├─ object-id.util.ts
│  │  │  ├─ assert.util.ts
│  │  │  ├─ env-parse.util.ts
│  │  │  ├─ password.util.ts         # scrypt hash / verify
│  │  │  └─ json-schema-guard.util.ts
│  │  ├─ auth/
│  │  │  ├─ user-session-token.util.ts
│  │  │  ├─ permission.util.ts
│  │  │  └─ authenticated-user.util.ts
│  │  ├─ user/
│  │  │  └─ email.util.ts
│  │  ├─ workflow/
│  │  │  ├─ graph-validator.util.ts
│  │  │  ├─ catalogue-validator.util.ts # audience unit codes against the live catalogue
│  │  │  ├─ definition-normaliser.util.ts # fills fields missing from legacy versions
│  │  │  ├─ condition-evaluator.util.ts
│  │  │  ├─ computed-evaluator.util.ts
│  │  │  ├─ workflow-overview.util.ts # deterministic "More information" overview
│  │  │  ├─ schema-validator.util.ts
│  │  │  ├─ namespace-path.util.ts
│  │  │  └─ build-workflow-template-generation-messages.util.ts
│  │  ├─ workflow-template/
│  │  │  └─ workflow-template-input.util.ts # title / prompt normalisation and limits
│  │  ├─ retrieval/
│  │  │  ├─ vector-math.util.ts
│  │  │  ├─ alias-boost.util.ts
│  │  │  ├─ render-summary.util.ts
│  │  │  └─ retrieval-candidate.util.ts  # template retrieval row -> RetrievalCandidate
│  │  ├─ requester/                   # profile facts, requester attributes, legacy input aliases
│  │  ├─ selection/                   # candidate-eligibility.util.ts
│  │  ├─ assignee/                    # assignee-context-unit.util.ts
│  │  ├─ task/                        # plan compiler, field and step ids, form layout, field validator,
│  │  │                               #   information request insertion, condition namespace, reference
│  │  ├─ approval/                    # token.util.ts (sign, verify, hash)
│  │  ├─ document/                    # task-transcript.util.ts, pdf-layout, document-format
│  │  └─ http/
│  │     ├─ request-validator.util.ts
│  │     ├─ bearer-token.util.ts
│  │     ├─ serializer.util.ts
│  │     ├─ workflow-template-serializer.util.ts
│  │     ├─ selection-request.util.ts / selection-serializer.util.ts
│  │     ├─ task-request.util.ts / task-serializer.util.ts
│  │     └─ approval-serializer.util.ts
│  ├─ data/
│  │  ├─ prompts/
│  │  │  ├─ workflow-template-generation.prompt.ts
│  │  │  ├─ workflow-template-generation-few-shot.prompt.ts
│  │  │  └─ selector.prompt.ts
│  │  ├─ schemas/
│  │  │  ├─ workflow.schema.json
│  │  │  ├─ workflow-schema.data.ts
│  │  │  └─ selection-decision.schema.ts # selector structured-output schema
│  │  ├─ templates/
│  │  │  ├─ approval-email.template.ts
│  │  │  └─ requester-notification.template.ts
│  │  ├─ vocabulary/
│  │  │  └─ role.vocabulary.ts
│  │  ├─ constants/
│  │  │  ├─ collection.constant.ts
│  │  │  ├─ task.constant.ts          # task and step statuses, kinds, outcomes, decisions, limits
│  │  │  ├─ task-form.constant.ts     # form controls, widths, issue codes, value patterns
│  │  │  ├─ requester.constant.ts     # requester attributes, input aliases, actor types by category
│  │  │  ├─ assignee.constant.ts
│  │  │  ├─ selection.constant.ts
│  │  │  ├─ task-error.constant.ts / selection-error.constant.ts / approval-error.constant.ts
│  │  │  ├─ workflow-template.constant.ts # statuses, title / prompt limits
│  │  │  ├─ workflow-template-error.constant.ts
│  │  │  ├─ ai-provider.constant.ts
│  │  │  ├─ llm.constant.ts
│  │  │  ├─ embedding.constant.ts
│  │  │  ├─ permission.constant.ts
│  │  │  ├─ user.constant.ts
│  │  │  ├─ user-session.constant.ts
│  │  │  ├─ auth.constant.ts
│  │  │  ├─ user-error.constant.ts
│  │  │  ├─ repository.constant.ts
│  │  │  ├─ postgres.constant.ts
│  │  │  ├─ seed.constant.ts
│  │  │  ├─ time.constant.ts
│  │  │  └─ identifier.constant.ts
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
│  │     ├─ workflow-template/workflow-template.type.ts
│  │     ├─ selection/                # session, decision, candidate, eligibility, overview, DTOs
│  │     ├─ requester/requester.type.ts
│  │     ├─ organisation/organisation-catalogue.type.ts
│  │     ├─ assignee/assignee-resolver.type.ts
│  │     ├─ task/                     # document, form, value, plan, engine, DTOs
│  │     ├─ approval/                 # approver view, decision DTOs, token, mail
│  │     ├─ document/document.type.ts # TaskTranscript
│  │     ├─ retrieval/retrieval.type.ts
│  │     ├─ ai/llm.type.ts
│  │     ├─ config/config.type.ts
│  │     ├─ http/http.type.ts
│  │     ├─ auth/auth.type.ts
│  │     ├─ user/user.type.ts
│  │     ├─ user-session/user-session.type.ts
│  │     ├─ seed/seed.type.ts
│  │     └─ index.type.ts
│  ├─ errors/
│  │  ├─ base.error.ts
│  │  ├─ validation.error.ts
│  │  ├─ unauthorized.error.ts
│  │  ├─ forbidden.error.ts
│  │  ├─ not-found.error.ts
│  │  ├─ conflict.error.ts
│  │  ├─ gone.error.ts               # 410, expired approval links
│  │  ├─ workflow-template-generation.error.ts
│  │  ├─ workflow-template.error.ts  # factories for WORKFLOW_TEMPLATE_* codes
│  │  ├─ selection.error.ts
│  │  ├─ selection-session.error.ts  # factories for SELECTION_* codes
│  │  ├─ task.error.ts               # factories for TASK_* codes
│  │  ├─ approval.error.ts           # factories for APPROVAL_* codes
│  │  ├─ embedding.error.ts
│  │  ├─ database.error.ts
│  │  ├─ configuration.error.ts
│  │  ├─ seed.error.ts
│  │  └─ index.error.ts
│  └─ db/
│     ├─ mongo.client.ts
│     ├─ postgres.client.ts
│     ├─ migration/
│     │  ├─ core/                     # shared engine: runner, loader, generator, engine, cli
│     │  ├─ postgres/                 # store, template, engine, migrations/
│     │  └─ mongo/                    # store, template, engine, migrations/
│     └─ seed/
│        ├─ core/                     # runner, loader, generator, engine, cli (mirrors migration/core)
│        └─ postgres/                 # seed context, engine, template, seeders/*.seeder.ts
├─ scripts/
│  ├─ copy-assets.script.ts           # build step: copies non-.ts assets into dist/
│  └─ db/
│     ├─ migrate-postgres.script.ts
│     ├─ migrate-mongo.script.ts
│     └─ seed-postgres.script.ts      # npm run seed:pg:run | seed:pg:list | seed:pg:create
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

**`src/services/`** — Owns all business logic. A service performs DB access through its model, calls utils for pure computation, and calls external AI providers only through `ILlmAdapter` and `IEmbeddingAdapter`, never through a provider SDK directly. Each provider lives in one adapter file under `llm-adapter/` or `embedding-adapter/`, and the matching `create*Adapter` factory picks one from config. Services receive their collaborators through constructor injection, never by importing a concrete singleton. `workflow-template-generation.service.ts` only turns a prompt into a validated definition, `workflow-template.service.ts` owns the template lifecycle and versions, `embedding.service.ts` only embeds, `retrieval.service.ts` only ranks, `selector.service.ts` only makes one model decision, `selection.service.ts` only orchestrates the conversation. The task side keeps the same split: `task-engine.service.ts` is a pure state machine that returns effects, `task-effect-executor.service.ts` performs them after a successful write, and `task-plan.service.ts` gathers I/O for the pure compiler in `utils/task/`.

**`src/repositories/`** — Data access for the PostgreSQL tables. One folder per aggregate (`user-repository/`, `user-session-repository/`, `organisational-unit-repository/`, `designation-repository/`, `user-affiliation-repository/`), each holding an interface, a Postgres implementation, an in-memory implementation and an `index` factory that picks one from `POSTGRES_REPOSITORY_BACKEND` (`postgres` | `memory`). Repositories contain no business rules — permission validation, password hashing, lockout policy and affiliation rules live in services. Repositories only map database constraint violations (the backstop for those rules) to the same typed errors. `repository-registry.factory.ts` builds every repository for one backend; on `memory` the organisation repositories and the user repository share one `InMemoryOrganisationStore`, so services under test see the same world the Postgres joins give them.

**`src/models/`** — One model per MongoDB collection. A model owns: the collection name, the TypeScript document interface, and thin typed CRUD operations (`insertOne`, `findOne`, `updateOne`, `find`, projections). Collections and indexes are created by Mongo migrations, not by models. Models contain no business rules — no version-number computation, no embedding calls, no status transition policy. Those live in services.

**`src/config/`** — Separate config modules per concern, each exporting a frozen, fully-typed object read from `process.env` exactly once at load time and validated on read. `index.config.ts` re-exports a single composed `config` object. No file outside `src/config/` may read `process.env` directly.

**`src/utils/`** — Pure helper functions only: no I/O, no config reads other than values passed as arguments, no class state. Organised into `shared/` (cross-feature: logging, hashing, password hashing, ObjectId coercion, assertions, env parsing) plus feature-specific subfolders (`workflow/`, `workflow-template/`, `retrieval/`, `http/`, `auth/`, `user/`, `organisation/`, `user-affiliation/`, `database/`).

**`src/data/`** — Predefined and hardcoded data: LLM prompt templates, JSON Schemas and structured-output schemas, the role vocabulary, enum-like constants, and sample/seed data. No logic beyond simple string composition of prompts.

**`src/lib/types/`** — The central type location, a directory (never one big file), organised into subfolders by domain. Every folder has an index barrel; `index.type.ts` re-exports all domains.

**`src/errors/`** — A base error class plus one subclass per error category. The base carries `statusCode`, `code`, `details`, and `isOperational`. Subclasses set their own defaults, so the error handler reads the status off the error instead of maintaining a lookup table. See [error-handling.md](./error-handling.md).

**`src/middlewares/`** — One middleware per file, single responsibility each, wired into routes only where applicable. `authenticate` runs on every request and only populates `req.auth`; `requireAuthentication()`, `requireAnyPermission(...)` and the task-ownership guard are attached per route.

**`scripts/`** — CLI entry points that are neither tests nor part of the running app: `db/` (Postgres and MongoDB migration CLIs, the Postgres seed CLI), plus `copy-assets.script.ts` at the root, invoked from `npm run build` to copy non-`.ts` assets (sample data) into `dist/`. See [../guides/database-migrations.md](../guides/database-migrations.md) for the migration engine and [../guides/database-seeding.md](../guides/database-seeding.md) for the seed pack.

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
