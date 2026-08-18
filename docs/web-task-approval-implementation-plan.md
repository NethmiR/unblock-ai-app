# Frontend Alignment Plan — `unblock-ai-web` → Task & Approval API

> Planning document. No frontend code has been changed.
> Verified against `unblock-ai-api/src/**` (routes, controllers, serializers, DTOs) —
> not only against `docs/api/api-documentation.md`.

Successor to [unblock-ai-web/docs/fe-api-migration-plan.md](../unblock-ai-web/docs/fe-api-migration-plan.md),
which covered the workflow/draft/selection surface. That plan's contract work has largely
landed; this one covers the two API areas built since and **never wired to the frontend at
all**: task planning (§7) and approval execution (§8).

---

## Summary

The backend added **eleven endpoints across two whole functional areas** — nine
`/tasks/*` and two `/approvals/*` — and the frontend calls **none of them**. This is not
type drift like last time; it is a missing feature surface. `src/lib/api/` has clients for
workflows, drafts, selection, and health, and there is no `tasks.ts` and no `approvals.ts`.

Three findings shape the work, and they are ordered by how badly they break a demo:

1. **The approval email points at a Next.js route that does not exist.** The API builds
   the approver link as `${APP_PUBLIC_URL}/approvals/<token>`, and `APP_PUBLIC_URL`
   defaults to `http://localhost:3001` — the **web app's** port, not the API's. So every
   approval email already sent contains a link into `unblock-ai-web`, which 404s. This is
   the single highest-value item in this plan, and it is the only one where the backend is
   already depending on frontend code that was never written.
2. **The selection chat dead-ends at `matched`.** `useSelectionSession` fetches the matched
   workflow and stops. `PlanPanel`'s "Submit request" button calls
   `onSubmit={() => router.push("/portal")}` — it navigates, and creates nothing. No task
   is ever created, so no requirement is ever collected and no approval is ever dispatched.
3. **`requester_email` needs no special-casing, but it is what forces typed inputs.** It
   is an ordinary `type: "email"` requirement in the generic list. What it changes is that
   **every workflow now has at least one non-`string` input**, so a naive "render a text
   box for everything" collection UI would 400 on the very first workflow it meets. The
   requirement-collection UI must branch on `type` from day one — it is not a later polish
   pass.

The portal's job list is placeholder fixtures (`src/lib/fixtures/jobs.ts`, whose own header
says *"DELETE THIS FILE when the execution engine ships"*). The execution engine has
shipped.

---

## What the API exposes vs. what the web calls

| API endpoint | Web client today | Status |
| --- | --- | --- |
| `POST /tasks` | — | **Missing** |
| `GET /tasks` | — | **Missing** |
| `GET /tasks/:id` | — | **Missing** |
| `GET /tasks/:id/next` | — | **Missing** |
| `POST /tasks/:id/values` | — | **Missing** |
| `POST /tasks/:id/finalize` | — | **Missing** |
| `POST /tasks/:id/start` | — | **Missing** |
| `GET /tasks/:id/status` | — | **Missing** |
| `PATCH /tasks/:id/status` | — | **Missing** |
| `GET /approvals/:token` | — | **Missing** |
| `POST /approvals/:token/decision` | — | **Missing** |

Every workflow/draft/selection endpoint is already wired. Nothing in this plan changes an
existing endpoint call — it is all additive.

---

## Phase 1 — Types: mirror the task & approval DTOs

`src/types/workflow.ts` carries the standing rule: *"WHEN THE SCHEMA CHANGES, CHANGE THIS
FILE IN THE SAME COMMIT."* Same discipline applies to the new files.

### 1.1 New file — `src/types/task.ts`

Hand-mirror of `unblock-ai-api/src/lib/types/task/{requirement,task}.type.ts`.

```ts
export type RequirementSource = "input" | "actor";
export type RequirementStatus = "pending" | "filled" | "skipped";

/** `type` reuses the workflow InputType union, plus "person" for actor requirements. */
export type RequirementType = InputType | "person";

export interface PersonValue { name: string; email: string; }
export type RequirementValue = string | number | boolean | PersonValue | null;

export interface TaskRequirement {
  key: string;
  source: RequirementSource;
  ref: string;
  label: string;
  description: string | null;
  type: RequirementType;
  required: boolean;
  validation: InputValidation | null;   // reuse from types/workflow.ts
  collection_hint: string | null;
  status: RequirementStatus;
}

export type TaskStatus =
  | "collecting" | "ready" | "in_progress" | "completed" | "rejected" | "cancelled";

export type StepRuntimeState =
  | "blocked" | "ready" | "pending_approval" | "approved" | "rejected" | "skipped";

export type StepOutcomeResult = "approved" | "rejected" | "request_more_info";
```

Plus `TaskStepState`, `TaskAuditEntry`, `TaskDto`, and `NextRequirementDto`.

**Two things to get right, both learned the hard way in the previous migration:**

- **Date fields stay `string`.** The API types `created_at`, `updated_at`,
  `responded_at`, `token_expires_at`, `notified_at`, and `decided_at` as `Date`, but
  `serializeTask` passes them through untouched and JSON turns them into ISO strings on
  the wire. Mirror them as `string` (nullable where the API has `| null`). Copying `Date`
  from the backend is the exact mistake `fe-api-migration-plan.md` R9/`WorkflowRecord`
  called out.
- **`InputValidation` is nullable here, unlike on `WorkflowInput`.** `TaskRequirement.validation`
  is `InputValidation | null` — actor requirements always carry `null`. `WorkflowInput.validation`
  is non-null. Do not reuse one alias for both.

### 1.2 New file — `src/types/approval.ts`

Mirror of `unblock-ai-api/src/lib/types/approval/approval.type.ts`: `ApproverViewDto`,
`DecisionResultDto`, `TaskStatusDto`, `TaskTimelineEntry`. Reuse `ResponseField` and
`StepOutcomeResult` from the existing/new type files rather than redeclaring them.

> **Do not model `allowed_outcomes` as a fixed triple.** It is computed per step from
> `workflow.steps[].outcomes` — a step that declares no `request_more_info` will never
> return it. Type it `StepOutcomeResult[]` and **render from the array**, never from a
> hardcoded approve/reject/more-info button row. This is the one place where a plausible
> UI shortcut produces a button that always 400s.

---

## Phase 2 — API clients

Both files follow the existing `src/lib/api/*` shape exactly: a single exported object of
thin functions over `apiRequest`, no `fetch`, no state.

### 2.1 New file — `src/lib/api/tasks.ts`

```ts
export const tasksApi = {
  create: (sessionId: string) =>
    apiRequest<TaskDto>("/tasks", { method: "POST", body: { session_id: sessionId } }),

  list: (filters?: { session_id?: string; status?: TaskStatus }) => /* query string */,
  get: (id: string) => apiRequest<TaskDto>(`/tasks/${id}`),
  next: (id: string) => apiRequest<NextRequirementDto>(`/tasks/${id}/next`),

  setValue: (id: string, key: string, value: RequirementValue) =>
    apiRequest<TaskDto>(`/tasks/${id}/values`, { method: "POST", body: { key, value } }),

  finalize: (id: string) => apiRequest<TaskDto>(`/tasks/${id}/finalize`, { method: "POST" }),
  start:    (id: string) => apiRequest<TaskDto>(`/tasks/${id}/start`,    { method: "POST" }),
  status:   (id: string) => apiRequest<TaskStatusDto>(`/tasks/${id}/status`),

  cancel: (id: string) =>
    apiRequest<TaskDto>(`/tasks/${id}/status`, { method: "PATCH", body: { status: "cancelled" } }),
};
```

Two notes on the client contract:

- **`finalize` and `start` send no body.** `apiRequest` only sets `Content-Type` and a body
  when `body` is truthy, so omitting it is correct and needs no change to `client.ts`.
- **`cancel` is the only accepted `PATCH /tasks/:id/status` transition.** The controller
  runs `requireOneOf(req.body, "status", ["cancelled"])`. Do not expose a general
  `updateStatus(id, status)` — it would type-check while 400ing for every value but one.
  Naming it `cancel` puts the API's actual constraint in the signature.

### 2.2 New file — `src/lib/api/approvals.ts`

```ts
export const approvalsApi = {
  getView: (token: string) => apiRequest<ApproverViewDto>(`/approvals/${token}`),

  submitDecision: (token: string, outcome: StepOutcomeResult, reason?: string | null) =>
    apiRequest<DecisionResultDto>(`/approvals/${token}/decision`, {
      method: "POST",
      body: { outcome, reason: reason ?? null },
    }),
};
```

**Encode the token in the path.** It is `base64url(payload).base64url(sig)` — base64url is
URL-safe by construction, so `encodeURIComponent` is a no-op here today. Apply it anyway;
it costs nothing and it is the correct habit for a value that goes into a path segment.

---

## Phase 3 — The approver page (highest priority)

**Why this is first:** the backend is already emailing links here. Every approval email the
API has ever sent contains `http://localhost:3001/approvals/<token>`, and that route 404s.
Until this page exists, the approval chain cannot be completed through the UI at all —
`/tasks/:id/start` sends a mail whose only call to action is a dead link.

### 3.1 New route — `src/app/approvals/[token]/page.tsx`

Deliberately **outside** `/portal` and `/admin`. The approver is not a logged-in user of
this app — they hold a token from an email, and `src/lib/auth/session.ts` has nothing to
say about them. Putting this page under either existing layout would inherit a nav shell
that implies an account they do not have.

Render from `GET /approvals/:token`, which is designed to need no second round trip:

| Section | Source field |
| --- | --- |
| Header | `task_reference`, `workflow_title` |
| What is being asked | `step.name`, `step.instructions_to_approver` |
| Who they are | `approver.name` / `approver.email` (nullable — handle it) |
| The request itself | `requester_answers[]` — `{ label, value }` pairs, render as a definition list |
| Derived figures | `computed[]` — same shape, same rendering |
| What happened already | `prior_decisions[]` — `{ step, outcome, reason, at }` |
| The controls | **`allowed_outcomes[]`** — one button per entry, no more |

### 3.2 The three states this page must handle

Only the first is the happy path, and the other two are easy to skip and then discover in a
demo.

1. **Undecided** (`already_decided: false`) — render the outcome buttons.
2. **Already decided** (`already_decided: true`) — a re-clicked link is **`200`, not an
   error**. Render "already approved on 15 Aug" from `decided_outcome` / `decided_at` and
   hide the controls. Treating this as a failure state is wrong and the API went out of its
   way to make it renderable.
3. **Invalid / expired / unknown token** — `404`. Deliberately 404 and not 401, so the page
   must not say "session expired, please log in"; there is no login. Say the link is no
   longer valid and suggest contacting the requester.

### 3.3 The `reason` field

`POST /approvals/:token/decision` returns
`400 "A reason is required for outcome '<outcome>' on step '<step_id>'"` when the step's
outcome config sets `include_reason: true`. **The approver view does not expose
`include_reason`** — it is not a field on `ApproverViewDto`.

Two honest options, and the recommendation matters:

- **Recommended: always show an optional reason box**, submit whatever is typed, and
  surface the API's 400 message inline if the server demands one. Costs one round trip in
  the rare case; requires no backend change; cannot get out of sync.
- Alternative: add `include_reason` (or a `reason_required_for: StepOutcomeResult[]`) to
  `ApproverViewDto` so the form can mark the field required up front. Cleaner UX, but it is
  a **backend change** and therefore out of scope for a frontend plan. Note it as a
  follow-up rather than silently guessing per outcome name — the flag is per-step-per-outcome
  workflow data, and "rejections need a reason" is an assumption the schema does not make.

### 3.4 After a decision

`DecisionResultDto` gives `{ outcome, status, completed, terminated }`. Render a terminal
confirmation from it — do not redirect. The approver has nowhere in this app to go.

---

## Phase 4 — Requirement collection: closing the selection dead-end

This is the largest piece of UI work and the one that makes the portal real.

### 4.1 Wire "Submit request" to actually create a task

Today, `PlanPanel`'s submit is `onSubmit={() => router.push("/portal")}` in
[portal/jobs/new/page.tsx](../unblock-ai-web/src/app/portal/jobs/new/page.tsx). Replace with:
`tasksApi.create(sessionId)` → navigate to the new task's collection view using the returned
`id`.

`useSelectionSession` already holds `sessionId` but **does not currently return it** — it
returns `{ messages, decision, workflow, isBusy, send, choose, hasStarted }`. Add `sessionId`
to the returned object. One-line change, and it is the seam the whole task flow hangs off.

> Precondition: `POST /tasks` `409`s unless the session has `matched`. Gate the button on
> `workflow !== null`, which is only set on a matched decision — the existing state already
> encodes the precondition correctly.

### 4.2 New hook — `src/lib/hooks/useTaskCollection.ts`

Mirrors `useSelectionSession`'s role: single source of truth for one collection loop, so
components render state and never call the API themselves.

The loop is exactly what the Postman flow does:

```
GET /tasks/:id/next
  → { requirement: null, complete: true }  → enable finalize
  → { requirement, complete: false }       → render an input for requirement.type
POST /tasks/:id/values { key, value }      → returns the updated TaskDto
repeat
```

State: `task`, `current` (the `TaskRequirement | null`), `isBusy`, `error`.

**Drive the loop from `/next`, not from `task.requirements`.** Both are available and it is
tempting to render the whole requirement array as one big form. `/next` is the endpoint
that encodes the ordering rule (first pending *required*, then first pending optional), and
— critically — it is what surfaces **follow-up requirements appended after a
`request_more_info` decision** (§4.5). A form built from a snapshot of `requirements` taken
at task creation will never show them.

### 4.3 Per-type inputs — the part that cannot be skipped

`POST /tasks/:id/values` coerces strictly per `requirement.type`
(`unblock-ai-api/src/utils/task/value-validator.util.ts`). Sending a string for everything
works until the first typed input — and **`requester_email` guarantees every workflow now
has one**.

| `requirement.type` | Control | Value sent |
| --- | --- | --- |
| `string`, `phone`, `enum`, `file` | text input | string |
| `text` | textarea | string |
| `email` | `<input type="email">` | string matching `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| `number` | `<input type="number">` | **number** — a numeric string is coerced server-side, but send a real number |
| `boolean` | checkbox / toggle | **`true` / `false`, never `"true"`** — the string is rejected |
| `date`, `datetime` | `<input type="date">` | `"YYYY-MM-DD"` — note `datetime` also wants date-only here |
| `person` | **two fields**, name + email | `{ name, email }` object |

Four traps worth stating explicitly, each one a guaranteed 400:

- **`boolean` rejects the strings `"true"`/`"false"`.** `coerceBoolean` requires an actual
  boolean. A checkbox bound through a generic string-valued form state hits this every time.
- **`person` is an object, not a string.** Actor requirements (`actor:<step_id>`, the
  approvers) are all `type: "person"`. They need a two-field sub-form, and both parts are
  validated — non-empty `name`, and `email` against the same pattern.
- **`datetime` still wants `YYYY-MM-DD`.** `coerceByType` sends `datetime` through
  `coerceDate`, which tests `/^\d{4}-\d{2}-\d{2}$/`. An `<input type="datetime-local">`
  emits `YYYY-MM-DDTHH:mm` and will be rejected. Use a date input for both.
- **`enum` is not constrained server-side.** It is checked as a plain string, and the
  requirement carries no option list. Render it as a text input unless and until the API
  exposes allowed values — a `<select>` would need options the contract does not provide.

### 4.4 Client-side validation is a courtesy, not the contract

`requirement.validation` carries `min_length`, `max_length`, `min`, `max`, `pattern`,
`not_before`, `not_after`, `not_before_field`, `not_after_field`. Mirroring the simple ones
(length, min/max, pattern) into input attributes is good UX.

**Do not attempt the cross-field date rules client-side.** `not_before_field` resolves
against `inputs.<key>` in *every value collected so far*, and `not_before: "today"` resolves
server-side. Re-implementing that logic in the browser duplicates
`value-validator.util.ts` and will drift. Let the server own it and render the returned
message — the API deliberately names the requirement key in the error text
(`Requirement 'return_date' must not be before 'inputs.departure_date'`), which is exactly
enough to attach the message to the right field.

### 4.5 Finalize, start, and the reopen loop

Once `/next` reports `complete: true`:

1. `POST /tasks/:id/finalize` → `status: "ready"`, steps get resolved assignees.
2. `POST /tasks/:id/start` → `status: "in_progress"`, approval emails dispatched.

Present these as **one "Send for approval" action**, not two buttons. Nothing is sent to any
approver until `start` — which is precisely the promise `PlanPanel` already prints on screen
("Nothing is sent to any approver until you submit"). A task left `ready` but never started
is an invisible dead state for the user, and there is no UI reason to expose the gap.

**The reopen loop is the part that is easy to miss.** When an approver picks
`request_more_info`, the backend appends a `followup:<step_id>:<n>` requirement
(`type: "text"`, `required: true`) and flips the task **back to `collecting`**
(`task.service.ts:254`). So:

- A task in `status: "collecting"` is **not necessarily new** — it may be a live task that
  came back for more information. The collection view must be reachable from the job list,
  not only from the creation flow.
- The follow-up requirement's `label` **is the approver's question**, and `reopen_count` is
  capped at 3.
- After answering it, the same finalize → start pair runs again.

Handle this by keying the portal's routing off `task.status` rather than off how the user
arrived.

---

## Phase 5 — Replace the placeholder job list

### 5.1 Delete `src/lib/fixtures/jobs.ts`

Its header says to. The fixture's `Job` shape does not match `TaskDto` — it has `title`,
`description`, `statusLabel`, and a 3-member status union, against `TaskDto`'s `reference`,
`workflow_id`, and 6-member `TaskStatus`. Update `JobRow` and `portal/page.tsx` to consume
`TaskDto` from `tasksApi.list()`.

Two mismatches to resolve deliberately:

- **There is no `title` on a task.** `TaskDto` carries `workflow_id` and `reference`, not
  the workflow's title. Either fetch titles via `workflowsApi.list()` and join on
  `workflow_id`, or show `reference` as the primary label. `GET /tasks/:id/status` *does*
  return `workflow_title` — but it is per-task, so using it for a list means N requests.
  Recommendation: join against the workflow list, one extra call for the whole page.
- **`JobStatus` has three members; `TaskStatus` has six.** `collecting`, `ready`, and
  `cancelled` have no icon or tone today. Extend the `StatusIcon` lookup and add a
  `TaskStatus → Badge tone` map. Follow the existing convention in `Badge`/`Button`:
  *"styles as data, not as an if/else chain."*

### 5.2 `JobRow` already links to a route that does not exist

`JobRow` renders `<Link href={/portal/jobs/${job.id}}>` and there is no
`src/app/portal/jobs/[id]/page.tsx`. Every row in the portal is a 404 today. Phase 5.3
fixes it.

### 5.3 New route — `src/app/portal/jobs/[id]/page.tsx`

The requester's view of one task, driven by **`GET /tasks/:id/status`** — the endpoint built
for exactly this and not currently called by anything:

- `reference`, `workflow_title`, `status`
- `current_steps[]` — who it is waiting on right now
- `timeline[]` — `{ step, outcome, reason, at }`, oldest first
- On a rejected task: `rejected_at_step`, `rejected_by`, `reason` — **who** rejected it,
  **where**, and **why**

Branch on `status`: `collecting` routes into the Phase 4 collection view (new task *or*
reopened follow-up); everything else renders the timeline. Add a cancel control
(`PATCH /tasks/:id/status`) for non-terminal tasks — it 409s on `completed`/`rejected`/
`cancelled`, so hide it rather than letting it fail.

This view is also the **compatibility path** for pre-`requester_email` workflows: templates
saved before that input existed collect no requester address, so their tasks send no email
and the requester's only way to track progress is pulling this endpoint. Both the API docs
(§7) and `overview.md` call this out as graceful degradation, not a bug — the status page is
what makes it graceful.

---

## Phase 6 — Config and cross-cutting

### 6.1 Confirm `APP_PUBLIC_URL` matches the web origin

`unblock-ai-api/src/config/mail.config.ts:15` defaults `appPublicUrl` to
`http://localhost:3001`, and `next dev` runs on 3001 (`package.json`). So the default is
already correct for local development — the link 404s only because the **route** is missing,
not because the URL is wrong. Phase 3 fixes it with no config change.

Worth stating for deployment: `APP_PUBLIC_URL` must point at the **web** origin, not the
API. It is the one backend setting whose correct value is a frontend fact.

### 6.2 `ApiError.code` is available — use it here

`client.ts` already captures `code`. The task flow is the first place it earns its keep,
because status codes are ambiguous across this surface: `409 CONFLICT` means "session not
matched" on `POST /tasks`, "not collecting" on `values`/`finalize`, "not ready" on `start`,
and "token already used" on a decision. Branch on `code` plus the endpoint, and render
`err.message` — the API's messages are written to be shown.

### 6.3 No changes needed

`src/types/workflow.ts` needs no edit for any of this. `InputType` already includes
`"email"` and all eleven members; `TaskRequirement.type` reuses it. The frontend has no
per-input-type `switch` today, so **nothing existing breaks** — this is purely new surface.

---

## Build order

| Phase | Deliverable | Why here |
| --- | --- | --- |
| 1 | `types/task.ts`, `types/approval.ts` | Everything else references these |
| 2 | `lib/api/tasks.ts`, `lib/api/approvals.ts` | Thin, testable, no UI decisions |
| 3 | `/approvals/[token]` page | **Ship first.** Emails already point here |
| 4 | Task creation + collection loop | Makes the portal functional end to end |
| 5 | Real job list + `/portal/jobs/[id]` | Removes the fixtures; fixes the 404 rows |
| 6 | Error handling, config confirmation | Hardening, once flows exist |

Phases 1–2 are one commit. Phase 3 stands alone and is independently demoable — an approver
page can be tested against a token copied from the console mailer's stdout without any of
Phase 4 existing.

---

## Risks

**1. Per-type inputs are not optional polish.** A generic string-valued form 400s on
`requester_email` — which is now on *every* workflow — and on every `actor:*` person
requirement. There is no version of this UI that ships without type branching. (§4.3)

**2. The reopen loop puts a live task back into `collecting`.** If the portal treats
`collecting` as "new, still being created", a task returned for more information becomes
unreachable and the approval chain stalls with no visible cause. (§4.5)

**3. `allowed_outcomes` is per-step.** Hardcoding three buttons produces one that 400s on
steps that do not declare `request_more_info`. (§3.1)

**4. Already-decided is a `200`.** Rendering it as an error makes a normal re-click of an
email link look like a broken system. (§3.2)

**5. Stored workflows predate `requester_email`.** Their tasks send no requester email at
all. The status page (§5.3) is the fallback, and it needs to exist before anyone demos an
older template.

**6. No auth on `/tasks/*`.** Any client can read or mutate any task by id. The mock
`getSession()` gives no real identity and the API does not check one. Do not build UI that
implies ownership or privacy that the backend does not enforce — and do not deploy this
surface publicly as-is.

---

## Explicitly out of scope

- **Backend changes**, including adding `include_reason` to `ApproverViewDto` (§3.3) and
  exposing `enum` option lists (§4.3). Both are noted as follow-ups, not assumed.
- **Authentication.** Called out as a risk; closing it is a separate slice for both projects.
- **Directory/identity lookup.** Approver and requester addresses stay self-asserted —
  Option C in [requester-contact-gap.md](requester-contact-gap.md), unscheduled.
- **Realtime updates.** Everything here is pull-based; no polling or websockets. A manual
  refresh on the status page is sufficient at this stage.
- **Admin-side task visibility.** `GET /tasks` has no admin UI in this plan; the portal is
  requester-facing only.

---

## Appendix — verification method

Endpoints confirmed from `unblock-ai-api/src/routes/{task,approval}.route.ts`. Request and
response shapes confirmed from `src/controllers/{task,approval}.controller.ts`,
`src/utils/http/serializer.util.ts`, and the DTOs in `src/lib/types/{task,approval}/**`.
Coercion rules read from `src/utils/task/value-validator.util.ts` directly rather than from
the documentation table. The approval-URL finding comes from
`src/services/notification.service.ts:39` cross-checked against
`src/config/mail.config.ts:15` and `unblock-ai-web/package.json`. The reopen behaviour comes
from `src/services/task.service.ts:254` (`reopenForMoreInfo`). Frontend gaps confirmed by
enumerating `unblock-ai-web/src/app/**` and `src/lib/api/**`.

Two items from [fe-api-migration-plan.md](../unblock-ai-web/docs/fe-api-migration-plan.md)
were re-checked and are **now fixed** — they should not be carried forward: R1
(`requester_context` stringification) is resolved, the controller uses `optionalObject`; and
R5 (port/CORS collision) is resolved, the web app runs on 3001 matching the API's CORS
default.
