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
- **Persistence**: MongoDB via the official `mongodb` driver ([src/db/mongo.client.ts](../../src/db/mongo.client.ts), [src/models/](../../src/models/))
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
│  ├─ middlewares/            # cors, json-body, request-id, logging, error handling
│  ├─ utils/                  # pure helpers (shared, workflow, retrieval, http)
│  ├─ data/                   # prompts, JSON Schemas, vocabulary, constants, samples
│  ├─ lib/types/              # central TypeScript type directory
│  ├─ errors/                 # BaseError + one subclass per error category
│  └─ db/                     # Mongo client + index definitions
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

## 9. HTTP API

All routes are mounted under `/api` (see [src/routes/index.route.ts](../../src/routes/index.route.ts) and [src/app.ts](../../src/app.ts)). See [../api/api-documentation.md](../api/api-documentation.md) for the full endpoint reference, request/response bodies, and error shapes.

**Error handling**: a single error-handling middleware ([src/middlewares/error-handler.middleware.ts](../../src/middlewares/error-handler.middleware.ts)) reads `statusCode` and `toJSON()` off any `BaseError` subclass and responds accordingly; anything else is logged with its stack and answered with a generic `500`. See [error-handling.md](./error-handling.md) for the full hierarchy. All route handlers are wrapped in [src/middlewares/async-handler.middleware.ts](../../src/middlewares/async-handler.middleware.ts) so rejected promises reach this middleware instead of crashing the process.

## 10. Supporting pieces

- **Logger** ([src/utils/shared/logger.util.ts](../../src/utils/shared/logger.util.ts)): structured JSON logger (`debug`/`info`/`warn`/`error`) writing single-line JSON to stdout/stderr with timestamps.
- **Smoke test scripts** ([scripts/smoke-test-azure.script.ts](../../scripts/smoke-test-azure.script.ts), [scripts/smoke-test-embeddings.script.ts](../../scripts/smoke-test-embeddings.script.ts)): sanity-check Azure OpenAI chat and embeddings connectivity independent of the extraction pipeline.

## 11. Test suite

Three tiers, matching the test scripts in [package.json](../../package.json):

- **`npm test`** → `tests/unit/**/*.test.ts` + `tests/integration/**/*.test.ts` (fast, no live network):
  - `tests/unit/utils/` — schema validation, graph validation (fixtures pass; mutation tests confirm each failure mode is caught), alias boost, render-summary, request-validator, serializer, vector-math.
  - `tests/unit/services/` — draft, workflow, retrieval, selection, selector, vector-store services against fakes.
  - `tests/unit/errors/` — `BaseError` contract.
  - `tests/integration/` — full HTTP-level coverage of draft, workflow, and selection routes, and the error handler, using an in-process Express server.
- **`npm run test:live`** → `tests/live/**/*.test.ts` (slow, calls real Azure OpenAI, run manually/CI-gated):
  - `extraction-accuracy.live.test.ts` — asserts the model correctly extracts *specific* structural details from the two worked examples (right step IDs, correct `depends_on` chains, correct condition operator/operands, correct loop-back/termination outcomes, correct `context_from_steps` bindings).
  - `generalisation.live.test.ts`, `consistency.live.test.ts`, `robustness.live.test.ts`, `selection-quality.live.test.ts` — extraction on an unseen fixture, repeatability across repeated calls, behavior on messy/edge-case/non-workflow input, and selector agent quality, respectively.

## 12. Sample data (used as both few-shot examples and test gold data)

| File | Institution scenario |
|---|---|
| `it_faculty_overseas_leave` | Student overseas-travel leave request: sequential advisor → HoD → (conditional) Dean approval chain, loop-back for "more info," computed trip-duration-based conditional step, terminal rejection |
| `departmental_event_workshop` | Event organization: parallel hall-booking + speaker-clearance branches, a refreshments step that starts `blocked` pending hall booking's outcome and consumes its `confirmed_capacity` response field via `context_from_steps` |
| `lab_equipment_purchase_request` | Input-only fixture (no expected/gold JSON) — used in `tests/live/` as an unseen example for generalisation/robustness testing |

These live under [src/data/samples/](../../src/data/samples/) (`input/`, `expected/`, `selection/`, `demo-drafts/`). The same two fully-worked fixtures (`it_faculty_overseas_leave`, `departmental_event_workshop`) serve **three roles at once**: few-shot prompt examples, schema/graph validation test fixtures, and live extraction-accuracy assertions — meaning any change to the schema or prompt must keep these three consistent.

## 13. What is explicitly out of scope / not yet built

- **No workflow execution engine** — nothing runs a saved workflow instance, resolves actors against a real directory, evaluates conditions against real data, or sends real notifications. The schema is designed to support this later, but none of it exists yet.
- **No authentication/authorization** on any HTTP route.
- **No directory/identity service integration** (needed to actually resolve `dynamic`/`static` actors to real people/offices).

## 14. Quick reference — how to run it

See [../guides/running-the-app.md](../guides/running-the-app.md) for the full setup guide. Quick version:

```bash
npm install
cp .example.env .env   # then fill in Azure OpenAI + MongoDB credentials
npm run init-db              # create Mongo collections/indexes
npm run dev                  # tsx watch, or: npm run build && npm start
npm test                     # fast unit + integration tests
npm run test:live            # slow tests that call Azure OpenAI (needs valid .env)
```
