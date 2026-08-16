# Task Planner — Implementation Plan

Step-by-step build order for the endpoints described in
[task-planner-design.md](task-planner-design.md). Read that first — this document assumes
its decisions and does not re-argue them.

**Target:** `unblock-ai-api/` only. No frontend work in this plan.

---

## 0. Ground rules

Carried from the existing codebase — every step below obeys these.

| Rule | Consequence |
|---|---|
| Strict layering `routes → controllers → services → models → db` | A service never touches `req`/`res`; a model never throws HTTP errors |
| ES modules, `"type": "module"` | **Every relative import ends in `.js`**, even from `.ts` |
| `strict: true` | No implicit `any`; explicit `null` over `undefined` in documents |
| Constructor-injected deps, wired by hand in `server.ts` | No DI container, no singletons inside services |
| Naming: `*.service.ts`, `*.controller.ts`, `*.model.ts`, `*.util.ts`, `*.type.ts` | New files follow suit |
| Errors are `BaseError` subclasses carrying their own `statusCode` | Never `res.status(400)` by hand — throw `ValidationError` |
| `config/env.config.ts` is the only reader of `process.env` | New config goes there |
| Tests are `node:test` via `tsx` | No Jest/Vitest. `npm test` runs `tests/unit/**` + `tests/integration/**` |

**Verification after every phase:** `npm run typecheck && npm test` must pass.

---

## Phase 1 — Types and constants

Pure declarations. No logic, nothing imports them yet.

### 1.1 `src/data/constants/collection.constant.ts`

Add to the existing `COLLECTIONS` object:

```ts
TASKS: "tasks",
```

### 1.2 `src/data/constants/status.constant.ts`

Append three new `as const` objects alongside the existing ones:

```ts
export const TASK_STATUS = {
  COLLECTING: "collecting",
  READY: "ready",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export const REQUIREMENT_STATUS = {
  PENDING: "pending",
  FILLED: "filled",
  SKIPPED: "skipped",
} as const;

export const STEP_STATE = {
  BLOCKED: "blocked",
  READY: "ready",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
  SKIPPED: "skipped",
} as const;
```

### 1.3 `src/lib/types/task/requirement.type.ts`

```ts
export type RequirementSource = "input" | "actor";
export type RequirementStatus = "pending" | "filled" | "skipped";

export interface PersonValue {
  name: string;
  email: string;
}

export type RequirementValue = string | number | boolean | PersonValue | null;

export interface TaskRequirement {
  key: string;                    // "departure_date" | "actor:advisor_review"
  source: RequirementSource;
  ref: string;                    // input id, or step id
  label: string;
  description: string | null;
  type: InputType | "person";
  required: boolean;
  validation: InputValidation | null;
  collection_hint: string | null;
  status: RequirementStatus;
}
```

Import `InputType` / `InputValidation` from `../workflow/workflow.type.js`.

### 1.4 `src/lib/types/task/task.type.ts`

`TaskDocument`, `TaskStepState`, `TaskAuditEntry`, plus the DTOs
(`TaskDto`, `NextRequirementDto`). Mirror the field list in design §4 exactly.

Two points that matter:

- `values` is `Record<string, RequirementValue>`.
- `steps[].approval_token` and `steps[].reason` are declared **now**, always `null` in
  this slice. They exist so Week 4 adds no migration.

### 1.5 `src/lib/types/task/index.type.ts`

Barrel re-export, matching the sibling `lib/types/*/index.type.ts` files.

> **Checkpoint:** `npm run typecheck` passes. Nothing else changed.

---

## Phase 2 — Pure utilities (no I/O, no DB)

These are the testable core. Build and unit-test them **before** anything touches Mongo.

### 2.1 `src/utils/task/requirement-builder.util.ts`

One exported function:

```ts
export function buildRequirements(workflow: WorkflowDefinition): TaskRequirement[]
```

Algorithm:

1. **Input requirements** — map `workflow.inputs` in declaration order. Skip any input
   whose `collected_from.resolution !== "requester"` (nothing else can supply it).
   `key = input.id`, `source: "input"`, `ref: input.id`.
2. **Actor requirements** — walk `workflow.steps` in **topological order** and, for each
   step whose `assignee.resolution === "dynamic"`, emit one requirement:
   - `key = "actor:" + step.id`
   - `source: "actor"`, `ref: step.id`, `type: "person"`, `required: true`
   - `label` derived from the role: `academic_advisor` → `"Academic Advisor"`
     (`role.replace(/_/g, " ")` + title case). Fall back to `step.name` when `role` is null.
   - `collection_hint`: `"Name and email address of your Academic Advisor."`
3. Concatenate: all inputs first, then all actors.

**Topological order:** reuse the existing DFS in `utils/workflow/graph-validator.util.ts`.
If it does not already export a reusable ordering function, extract one there rather than
writing a second traversal — the cycle-safety is already proven by
`tests/unit/utils/graph-validator.util.test.ts`.

De-duplicate actors: two steps with the same `role` and same `relative_to` should produce
**one** requirement, keyed on the first step that referenced it, and both steps later
resolve to the same person. Track a `role|relative_to` → key map while walking.

### 2.2 `src/utils/task/value-validator.util.ts`

```ts
export function validateValue(
  requirement: TaskRequirement,
  value: unknown,
  allValues: Record<string, RequirementValue>,
): RequirementValue
```

Returns the coerced value or throws `ValidationError`.

- **Takes `allValues`** — non-negotiable, because `not_before_field` / `not_after_field`
  are cross-field (return date after departure date). Design §8.
- Type coercion per `requirement.type`: `date` → ISO `YYYY-MM-DD` check; `number` →
  `Number.isFinite`; `email` → simple pattern; `boolean` → real boolean.
- `person` → object with non-empty `name` and a valid `email`.
- Then apply `validation`: `min_length`, `max_length`, `min`, `max`, `pattern`,
  `not_before`, `not_after`, `not_before_field`, `not_after_field`.
- Skip all checks when `value` is `null` and `required === false`.

### 2.3 `src/utils/task/reference.util.ts`

```ts
export function buildReference(seq: number, now = new Date()): string  // TASK-2026-00042
```

Trivial, but isolated so the format is testable and changeable in one place.

### 2.4 Unit tests

New files under `tests/unit/utils/`:

- `requirement-builder.util.test.ts` — feed
  `src/data/samples/expected/it_faculty_overseas_leave.json`; assert **7 input
  requirements then 3 actor requirements**, in that order, with keys
  `actor:advisor_review`, `actor:hod_review`, `actor:dean_review`. Add a case using
  `departmental_event_workshop.json` to cover the parallel/branching graph.
- `value-validator.util.test.ts` — happy path per type, plus: return-date-before-departure
  rejected, bad email rejected, person missing email rejected, `null` on optional accepted.
- `reference.util.test.ts` — zero-padding and year.

> **Checkpoint:** `npm test` passes with the new unit tests. Still zero DB code.

---

## Phase 3 — Model layer

### 3.1 `src/models/task.model.ts`

Mirror `models/selection-session.model.ts` closely: private `collection()` helper,
every method wrapped in `try/catch` re-throwing `DatabaseError`.

Methods:

| Method | Purpose |
|---|---|
| `insert(doc)` | Create; returns the document with `_id` |
| `findById(id)` | Single lookup via `toObjectId` |
| `findAll(filters)` | `session_id` / `status` filters, `created_at: -1` |
| `setValue(id, key, value, requirementIndex)` | `$set` the value **and** flip that requirement's status to `filled`, in one update |
| `replaceSteps(id, steps)` | Used by finalize |
| `setStatus(id, status)` | Status transitions |
| `appendAudit(id, entry)` | `$push` onto `audit` |
| `nextSequence()` | For the human reference (see 3.3) |

Every write also `$set`s `updated_at: new Date()` — same as the session model.

### 3.2 `src/db/index.definition.ts`

Append to `INDEX_SPECS`:

```ts
{ collection: COLLECTIONS.TASKS, keys: { session_id: 1 },  options: { name: "task_session" } },
{ collection: COLLECTIONS.TASKS, keys: { status: 1, created_at: -1 }, options: { name: "task_status_created" } },
{ collection: COLLECTIONS.TASKS, keys: { reference: 1 }, options: { unique: true, name: "task_reference_unique" } },
```

### 3.3 Reference sequence

`reference` is unique, so it needs a real counter. Simplest correct approach: a
`counters` collection with `findOneAndUpdate({_id: "task_ref_2026"}, {$inc: {seq: 1}}, {upsert: true, returnDocument: "after"})`.
Atomic, no race. Add `COUNTERS: "counters"` to `COLLECTIONS`.

> Do **not** use `countDocuments() + 1` — it races and breaks the unique index under
> concurrent creation.

---

## Phase 4 — Services

### 4.1 `src/services/planner.service.ts`

Deliberately **pure** — no DB, no HTTP. Wraps the Phase 2 utilities so the compile step is
independently testable and swappable when policy/HR land later.

```ts
export class PlannerService {
  compile(workflow: WorkflowDefinition): {
    requirements: TaskRequirement[];
    steps: TaskStepState[];
  }
}
```

- `requirements` ← `buildRequirements(workflow)`
- `steps` ← one `TaskStepState` per `workflow.steps` entry, all `state: "blocked"`,
  `assignee: null`, `outcome: null`, `reason: null`, `approval_token: null`,
  `depends_on` copied verbatim.

### 4.2 `src/services/task.service.ts`

Orchestration. Constructor takes `{ taskModel, selectionService, plannerService }`.

**`create(sessionId)`**
1. `selectionService.getMatchedWorkflow(sessionId)` — already throws `ConflictError` if
   the session has not matched, and `NotFoundError` if it does not exist. Reuse; do not
   reimplement.
2. Resolve the pinned `version` via `workflowService.getRecord(...)`.
3. `plannerService.compile(workflow)`.
4. `taskModel.nextSequence()` → `buildReference(seq)`.
5. Insert with `status: COLLECTING`, `values: {}`, one audit entry `task_created`.

**`get(id)`** — `findById`, `NotFoundError` if absent, serialize.

**`nextRequirement(id)`** — first requirement with `status === "pending"` and
`required === true`; if none, first pending optional; if none at all, return
`{ requirement: null, complete: true }`.

**`setValue(id, key, value)`**
1. Load task. Reject unless `status === COLLECTING` → `ConflictError`.
2. Find requirement by `key` → `ValidationError` if unknown.
3. `validateValue(requirement, value, task.values)`.
4. Persist value + flip requirement status + append audit `value_captured`.

**`finalize(id)`**
1. Reject unless `status === COLLECTING` → `ConflictError`.
2. Assert **every** `required` requirement is `filled`; otherwise `ValidationError`
   listing the missing keys.
3. Attach collected people to steps: for each `actor:*` requirement, write its
   `{name, email}` onto the matching `steps[].assignee` (including de-duplicated steps
   sharing a role).
4. Initialize states: steps with empty `depends_on` → `READY`; all others → `BLOCKED`.
5. `status` → `READY`; audit `task_finalized`.

**`cancel(id)`** — any non-terminal status → `CANCELLED`; audit.

**`list(filters)`** — thin pass-through to the model + serializer.

### 4.3 `src/utils/http/serializer.util.ts`

Add `serializeTask(doc): TaskDto` and `serializeTaskSummary(doc)` beside the existing
serializers. `_id` → `id: String(doc._id)`, same as `serializeDraft`.

### 4.4 Unit tests

`tests/unit/services/task.service.test.ts`, following the pattern in
`tests/unit/services/selection.service.test.ts` (hand-rolled fakes, no mocking library):

- create from an unmatched session → `ConflictError`
- setValue on a finalized task → `ConflictError`
- setValue with an unknown key → `ValidationError`
- finalize with a missing required requirement → `ValidationError` naming the key
- finalize on the leave fixture → 3 steps, `advisor_review` `READY`, other two `BLOCKED`
- finalize attaches the collected advisor `{name, email}` to `advisor_review.assignee`

---

## Phase 5 — HTTP layer

### 5.1 `src/controllers/task.controller.ts`

One arrow-function property per endpoint (matching `SelectionController`), each doing
**only**: pull + validate inputs via `request-validator.util.js`, call the service, set the
status code.

```ts
createTask      = POST   /tasks              requireNonEmptyString(body, "session_id")   → 201
getTask         = GET    /tasks/:id                                                      → 200
getNext         = GET    /tasks/:id/next                                                 → 200
setValue        = POST   /tasks/:id/values   requireNonEmptyString(body, "key")          → 200
finalizeTask    = POST   /tasks/:id/finalize                                             → 200
updateStatus    = PATCH  /tasks/:id/status   requireOneOf(body, "status", ["cancelled"]) → 200
listTasks       = GET    /tasks?session_id=&status=                                      → 200
```

`value` in `setValue` is **not** validated in the controller — it is polymorphic
(string / number / boolean / `{name,email}`), and `value-validator.util.ts` owns that
judgement. The controller only asserts the field is present.

### 5.2 `src/routes/task.route.ts`

Copy `selection.route.ts` shape exactly; every handler wrapped in `asyncHandler`.

```ts
router.post("/tasks", asyncHandler(controller.createTask));
router.get("/tasks", asyncHandler(controller.listTasks));
router.get("/tasks/:id", asyncHandler(controller.getTask));
router.get("/tasks/:id/next", asyncHandler(controller.getNext));
router.post("/tasks/:id/values", asyncHandler(controller.setValue));
router.post("/tasks/:id/finalize", asyncHandler(controller.finalizeTask));
router.patch("/tasks/:id/status", asyncHandler(controller.updateStatus));
```

> Register `GET /tasks` **before** `GET /tasks/:id` to avoid the literal path being
> swallowed by the parameterized one.

### 5.3 `src/routes/index.route.ts`

Add `taskController` to the `ApiControllers` interface and
`router.use(createTaskRouter(controllers.taskController))`.

> This interface is structural, so **`tests/integration/*.test.ts` will fail to compile
> until every existing test's `buildServer` helper supplies a `taskController`.** Expect
> to touch all four integration test files in this step. This is the one unavoidable
> ripple in the plan — do it deliberately rather than being surprised by it.

### 5.4 `src/server.ts`

Wire in dependency order:

```ts
const taskModel = new TaskModel();
const plannerService = new PlannerService();
const taskService = new TaskService({ taskModel, selectionService, workflowService, plannerService });
// ...
taskController: new TaskController({ taskService }),
```

### 5.5 Integration tests

`tests/integration/task.route.test.ts`, mirroring `selection.route.test.ts` with a
`fakeTaskService`:

- `POST /api/tasks` with no `session_id` → 400
- `POST /api/tasks` on an unmatched session → 409
- `POST /api/tasks` happy path → 201, body carries `id`, `reference`, `status: collecting`
- `GET /api/tasks/:id/next` → 200 with a requirement
- `POST /api/tasks/:id/values` missing `key` → 400
- `POST /api/tasks/:id/finalize` with unfilled requirements → 400
- `PATCH /api/tasks/:id/status` with a bad status → 400

---

## Phase 6 — Docs

1. **`unblock-ai-api/docs/api/api-documentation.md`** — add the 7 endpoints with request
   and response bodies. It currently documents 18; it becomes 25.
2. **`unblock-ai-api/docs/postman/unblock-ai.postman_collection.json`** — add a "Tasks"
   folder chaining `session_id` → `task_id` the way the existing collection chains ids.
3. **`docs/overview.md`** — update §1 (add a functional area **G. Task planning**), the
   §4 endpoint index, and remove "no execution engine" from *Not built yet* only insofar
   as planning now exists (execution still does not).

---

## Build order summary

| Phase | Deliverable | Gate |
|---|---|---|
| 1 | Types + constants | `npm run typecheck` |
| 2 | Pure utils + unit tests | `npm test` |
| 3 | Model + indexes | `npm run typecheck` |
| 4 | Services + unit tests | `npm test` |
| 5 | Controller, routes, wiring, integration tests | `npm test` |
| 6 | Docs | — |

Phases 1–2 are the ones worth being fussy about: everything else is plumbing around
them. If the requirement list and the validator are right, the rest follows mechanically.

---

## Explicitly out of scope

Named so nobody has to guess whether they were forgotten:

- **No email dispatch, no approval tokens, no approver page.** `approval_token` and
  `reason` exist as always-`null` fields (design §5).
- **No LLM question phrasing.** Endpoints return `label` + `collection_hint`; the
  frontend renders plain prompts (design §7).
- **No policy search, no HR/directory resolution** (design §1).
- **No authentication.** Consistent with the rest of the API today — any caller holding a
  task id can read and modify it.
- **No `DELETE`.** Cancellation is a status transition, matching the existing convention
  that nothing is deleted anywhere in this API.

---

## Two risks worth stating up front

**1. The `ApiControllers` ripple (§5.3).** Adding a controller to a structurally-typed
interface breaks the compile of all four existing integration tests at once. Cheap to fix,
alarming if unexpected.

**2. Malformed ObjectIds return 500, not 400.** The known rough edge noted in
`overview.md` applies to `/tasks/:id*` exactly as it does to `/drafts/:id*`. This plan does
**not** fix it — doing so is a separate, API-wide change to `toObjectId`. Worth fixing
centrally at some point; noted here so the new endpoints' behaviour is not mistaken for a
regression.

**3. Approver email trust** (design §9) — the requester supplies their own approver's
email address. Add the code comment at the point of capture in
`requirement-builder.util.ts`, so it is visible where it matters.
