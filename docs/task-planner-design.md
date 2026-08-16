# Task Planner — Backend Design

Design for the **user-side workflow planner**: the layer that sits between "selection matched a template" and "the approval chain runs".

Status: **agreed design, not yet implemented.** See [overview.md](overview.md) for what already exists.

---

## 1. Scope of this slice

| Decision | Choice |
|---|---|
| Planner meaning | **Instantiate a task from the matched template** — not ad-hoc workflow authoring |
| Policy store | **Omitted.** No semantic policy search, no conditional step injection |
| HR / directory integration | **Omitted.** Approver identities are collected from the requester |
| LLM question phrasing | **Deferred** to a thin layer on top (see §7) |
| Email / approval pages | **Not built here**, but the data model must not block them (see §5) |

---

## 2. The core insight

With no HR system, look at what a compiled template actually contains
(`src/data/samples/expected/it_faculty_overseas_leave.json`):

- All 7 `inputs` are `resolution: "requester"` — data the user types.
- All 3 step `assignee`s are `resolution: "dynamic"` with roles
  `academic_advisor`, `head_of_department`, `dean` — people HR was meant to resolve.

Since there is no HR, **an unresolved `dynamic` assignee is just another input**:
"Who is your academic advisor? Name and email."

> **The planner compiles a template into a flat, ordered *requirement list*, where each
> requirement is either a template input or an unresolved actor. Collection is one
> uniform loop over that list.**

This is the load-bearing decision. When HR integration lands later, the *only* change is
that actor requirements arrive pre-filled instead of asked — the collection loop and the
execution engine are untouched.

---

## 3. One document, not two

An earlier draft proposed separate `plans` and `tasks` collections. **Rejected.**

The approval email link must resolve, in a single lookup, to:

- the student's request (captured values)
- workflow context (which step, what came before)
- somewhere to write `approved` / `rejected` + reason
- something the student can later read that reason from

That is one document's identity, not a join. Minting an approval token against a "plan"
and then creating a separate "task" at execution time means every token either points at
the wrong document or needs remapping.

**One `tasks` collection. Planning is a *status*, not a separate document.** The task
`_id` exists from the first moment the user starts giving details and never changes.

A human-facing `reference` (`TASK-2026-00042`) sits alongside the ObjectId — the proposal
already calls for a reference number at completion, and approver emails read better with one.

---

## 4. Data model

### `tasks` collection

```
_id                  stable from creation; approval tokens mint against this
reference            TASK-2026-00042, human-facing
session_id           links back to the selection session
workflow_id, version the exact template version, pinned
status               collecting | ready | in_progress | completed | rejected | cancelled
requirements[]       the compiled, ordered list (below)
values{}             requirement_key -> captured value
steps[]              runtime step state (below)
audit[]              append-only
created_at, updated_at
```

### Requirement

The unit that makes the uniform collection loop work:

```ts
{
  key: "departure_date",          // or "actor:advisor_review"
  source: "input" | "actor",
  ref: "departure_date",          // input id, or step id
  label, description, type,       // type "person" for actors
  required, validation,
  collection_hint,
  status: "pending" | "filled" | "skipped"
}
```

For an actor requirement, `type: "person"` and the value is `{ name, email }` — exactly
the "give me your advisor's name and email" flow.

### Step runtime state

The frozen template graph, carrying execution fields — **populated but idle** in this slice:

```ts
{
  step_id, name, type,
  depends_on,                  // copied from template
  state: "blocked" | "ready" | "pending_approval"
         | "approved" | "rejected" | "skipped",
  assignee: { name, email },   // collected from the requester
  outcome: null,               // "approved" | "rejected" | "request_more_info"
  reason: null,                // ← the rejection reason the student reads
  responded_at: null,
  approval_token: null         // minted later; field exists now
}
```

`reason` is the field the whole rejection scenario turns on. It is populated on
**rejection and request-more-info** — e.g. "needs HoD signature first", or
"those dates fall during exams".

### Audit

Append-only: every value captured, every state transition, every decision. Written from
the planning phase onward — if we only start appending at execution time, the trail has a
hole exactly where the student's own submission belongs.

---

## 5. Where this is heading (Week 4)

Not built in this slice, but the model above is shaped so none of it needs rework:

1. A finalized task (`status: ready`) is picked up by a dispatcher.
2. Entry steps → `pending_approval`; an `approval_token` is minted per step.
3. Email to `assignee.email` with a tokenized link.
4. Approver page renders the request + the context that step needs, and offers
   approve / reject.
5. Reject → **reason is mandatory** → written to `steps[].reason`.
6. Student reads it via `GET /api/tasks/:id`, which already returns per-step state
   and reasons.

`POST /api/tasks/:id/finalize` is the clean seam: collection ends there, and the
dispatcher starts there.

---

## 6. Endpoints

```
POST   /api/tasks              { session_id }        201 -> task (status: collecting)
GET    /api/tasks/:id                                    -> task (student's status view)
GET    /api/tasks/:id/next                               -> next requirement
POST   /api/tasks/:id/values   { key, value }            -> task
POST   /api/tasks/:id/finalize                           -> task (collecting -> ready)
PATCH  /api/tasks/:id/status   { status: "cancelled" }   -> task
GET    /api/tasks?session_id=&status=
```

Notes:

- **Creation takes `session_id`, not `workflow_id`.** This forces the task to originate
  from a real, matched selection session and carries `requester_context` forward. Returns
  409 (existing `ConflictError`) if the session has not matched — same behaviour as
  `getMatchedWorkflow` today.
- **`/next` returns one requirement at a time.** Keeps the conversational loop
  server-driven rather than having the frontend reimplement ordering.
- **`/finalize` is an explicit gate**: verifies all required requirements are filled,
  initializes `steps[]` (entry steps → `ready`, dependents → `blocked`), and freezes
  inputs.
- **`GET /api/tasks/:id` is the student's status view** — the endpoint that surfaces
  rejection reasons with no extra work later.

---

## 7. Deliberate deferrals

**LLM question phrasing.** The proposal has a narrow LLM call turn each field into a
natural chat question and parse the reply. Real, but separable. The requirement list,
validation, and state machine are deterministic and testable first; the LLM layer sits on
top afterwards. Building them together would make the planner untestable without mocking
Azure. The endpoints already return `label` + `collection_hint`, so the frontend renders
plain prompts today and LLM-phrased ones later **with no contract change**.

---

## 8. Implementation notes

### Requirement ordering

Template `inputs` have no explicit order, and actors attach to steps. Order is:

1. Template inputs, in declaration order.
2. Actor requirements, in **topological step order** — reuse the cycle-safe DFS already in
   `utils/workflow/graph-validator.util.ts` rather than writing new traversal.

The user gives their own details before being asked who approves them, which reads naturally.

### Cross-field validation

`InputValidation` supports `not_before_field` / `not_after_field` (e.g. return date after
departure date). The value validator therefore needs **the whole `values` map**, not just
the single value being set. Cheap now, annoying to retrofit.

### Files (following existing conventions)

```
models/task.model.ts                      mirrors selection-session.model.ts
services/task.service.ts                  orchestration
services/planner.service.ts               template -> requirements compiler (pure)
utils/task/requirement-builder.util.ts    inputs + actors -> requirements
utils/task/value-validator.util.ts        enforces InputValidation
controllers/task.controller.ts
routes/task.route.ts
lib/types/task/{task,requirement}.type.ts
data/constants/collection.constant.ts     + TASKS
data/constants/status.constant.ts         + TASK_STATUS, REQUIREMENT_STATUS, STEP_STATE
db/index.definition.ts                    + session_id, status, reference indexes
server.ts                                 wiring
```

---

## 9. Known consequence — approver email trust

Because assignees are collected from the requester, **the student supplies their own
advisor's email address**. The approval link therefore goes wherever the requester says,
so a requester could route their own approval to an address they control.

This is the direct and expected consequence of deliberately skipping HR integration, and
is acceptable for a PoC demo. It is, however, the thing real directory integration is
load-bearing for. To be noted in code where the assignee email is captured, so it does not
surprise anyone at demo time.
