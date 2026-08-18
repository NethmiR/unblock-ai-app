# Web Task & Approval — Phase-by-Phase Implementation Plan

Execution plan for the gap analysed in
[web-task-approval-implementation-plan.md](web-task-approval-implementation-plan.md): the
API's task-planning (§7) and approval-execution (§8) surfaces have **no frontend at all**.

**Target:** `unblock-ai-web/` only. No backend changes in any phase.

**Baseline verified before writing this plan:** Next 16.3.0 / React 19.2.8, `next dev -p 3001`,
`tsconfig` `strict: true`, path alias `@/*` → `./src/*`. There is **no test runner and no
typecheck script** in `unblock-ai-web/package.json` — only `dev`, `build`, `start`, `lint`.
That shapes the gate for every phase below (§0.3).

---

## 0. Four findings that shape this plan

All four were confirmed by reading the API source. Three of them **correct or sharpen** the
analysis document; do not skip this section.

### Finding 1 — the approver page's error model is not what the analysis assumed

The analysis said an expired token gives the approver page a 404. **It does not.**
`getApproverView` calls `resolveToken`, which checks only three things — signature, task
lookup, step presence — and **none of them is expiry or step state**
(`approval.service.ts:185-198`). Expiry and `state !== pending_approval` are enforced
*only* in `submitDecision` (`approval.service.ts:103-114`), as **`409 CONFLICT`**.

The real consequence, and it is a UX one:

> An approver clicking an expired link gets a **fully rendered, apparently actionable
> page**. The failure arrives only when they press Approve — as a 409, after they have
> read the request and made a decision.

So the page needs a **fourth state** the analysis did not list: *rendered, submitted,
rejected at submit time*. Phase 3 handles this by treating a 409 on decision as a
first-class terminal state with its own message, not as a generic inline form error.

This is not a bug to route around — `token_expires_at` **is** on the step, but it is not on
`ApproverViewDto`, so the page genuinely cannot know before submitting. Handle it at submit.

### Finding 2 — `already_decided` is keyed on `token_used_at`, not on `outcome`

`already_decided: step.token_used_at !== null` (`approval.service.ts:88`). This matters for
one specific case: a step **reopened** via `request_more_info` gets a cleared token and is
re-dispatched with a fresh one, while `reopen_count` increments. A fresh token on a
previously-decided step means `already_decided` is **`false`** again, with
`decided_outcome` possibly still populated from the earlier round.

**Therefore: branch on `already_decided`, never on `decided_outcome !== null`.** The two can
disagree, and only the first one answers "should I show the buttons".

### Finding 3 — `computed` is always empty, and `requester_answers` contains the person objects

Two things about `ApproverViewDto` that are invisible from the docs:

- **`computed: []` is hardcoded** (`approval.service.ts:84`). The field exists in the DTO but
  the service never populates it. Render it defensively (`.length > 0 &&`) rather than
  building a section that is dead on arrival.
- **`requester_answers` is built from `Object.entries(task.values)`** — *every* value,
  including `actor:*` person requirements, stringified with `String(value)`
  (`approval.service.ts:60-63`). A `PersonValue` object therefore arrives as the literal
  **`"[object Object]"`**, and its label falls back to the raw key (`actor:advisor_review`)
  because `workflow.inputs.find` misses actor keys.

So the approver's "the request itself" section will contain rows like
`actor:advisor_review → [object Object]`. This is a **backend presentation bug**, out of
scope to fix here. Phase 3 filters `key.startsWith("actor:")` rows out client-side and logs
the finding as a backend follow-up (§7). Rendering them verbatim would put visible garbage
in front of the one external stakeholder this system emails.

### Finding 4 — the collection loop's ordering is stricter than "next pending"

`nextRequirement` returns the first pending **required** requirement in array order, and only
falls through to optional ones once no required one is pending
(`task.service.ts:92-104`). Combined with `buildRequirements` ordering — all `input`
requirements, then all `actor:*` ones — the practical sequence a requester walks is:

1. Every workflow input, in declaration order, **ending with `requester_email`** (the
   extraction prompt declares it last).
2. Then every approver, as `person` requirements.

This is worth knowing for Phase 4's progress indicator: the person-typed questions are always
last, so a naive "question N of M" is accurate, but the *shape* of the form changes partway
through. Do not build the progress UI assuming a uniform input.

---

## 0.1 Ground rules

Carried from the existing frontend, not invented here.

| Rule | Source | Consequence |
|---|---|---|
| `apiRequest` is the only `fetch` | [client.ts](../unblock-ai-web/src/lib/api/client.ts) | New clients call it; no component calls either |
| Types are a hand-maintained mirror | [types/workflow.ts](../unblock-ai-web/src/types/workflow.ts) header | "WHEN THE SCHEMA CHANGES, CHANGE THIS FILE IN THE SAME COMMIT" |
| Never write a hex literal | [globals.css](../unblock-ai-web/src/app/globals.css) | Use tokens: `bg-surface`, `text-muted`, `rounded-card`, `border-line` |
| Variant styles as data | [Badge.tsx](../unblock-ai-web/src/components/ui/Badge.tsx) | New status maps are `Record<K, string>` lookups, never `if/else` chains |
| Mutations use `useTransition` | [TemplateEditor.tsx](../unblock-ai-web/src/components/admin/TemplateEditor.tsx) | `startX(async () => { try/catch ApiError → setError(err.message) })` |
| Hooks own conversational state | [useSelectionSession.ts](../unblock-ai-web/src/lib/hooks/useSelectionSession.ts) | Components render and call; they never hold API state |
| Dynamic routes take `Promise` params | Next 16 | `{ params }: { params: Promise<{ id: string }> }`, then `await params` |

## 0.2 Font and layout inheritance

`/portal/*` is wrapped in `font-portal` (IBM Plex) by
[portal/layout.tsx](../unblock-ai-web/src/app/portal/layout.tsx); `/admin/*` uses
`font-admin`. **`/approvals/*` will inherit neither** — it sits at the app root, where
`body` carries no font class. Phase 3 must add its own layout or the approver page renders
in the browser default while every other page is styled. Easy to miss, visible immediately.

## 0.3 Verification gate for every phase

There is no `typecheck` script and no test runner. Add one line to
`unblock-ai-web/package.json` in Phase 1 — it is the only `package.json` edit in this plan:

```json
"typecheck": "tsc --noEmit"
```

**Gate after every phase:** `npm run typecheck && npm run lint`, plus the manual check named
in that phase. `npm run build` also typechecks, but it is far slower and Phase 3–5 changes
are mostly runtime behaviour that a build cannot prove.

---

## Phase 1 — Types

Pure additions. No existing file changes except `package.json`.

### 1.1 `package.json` — add the `typecheck` script

Per §0.3. Do this first so every later phase has a gate.

### 1.2 New — `src/types/task.ts`

Mirror of `unblock-ai-api/src/lib/types/task/{requirement,task}.type.ts`. Import
`InputType` and `InputValidation` from `@/types/workflow` — do not redeclare them.

```ts
import type { InputType, InputValidation } from "./workflow";

export type RequirementSource = "input" | "actor";
export type RequirementStatus = "pending" | "filled" | "skipped";
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
  validation: InputValidation | null;
  collection_hint: string | null;
  status: RequirementStatus;
}

export type TaskStatus =
  | "collecting" | "ready" | "in_progress" | "completed" | "rejected" | "cancelled";

export type StepRuntimeState =
  | "blocked" | "ready" | "pending_approval" | "approved" | "rejected" | "skipped";

export type StepOutcomeResult = "approved" | "rejected" | "request_more_info";

export interface TaskStepState {
  step_id: string;
  name: string;
  type: string;              // API types this `string`, not StepType — mirror it as-is
  depends_on: Array<{ step_id: string; required_outcome: string }>;
  state: StepRuntimeState;
  assignee: PersonValue | null;
  outcome: StepOutcomeResult | null;
  reason: string | null;
  responded_at: string | null;      // Date on the API, ISO string on the wire
  approval_token: string | null;
  token_expires_at: string | null;
  token_used_at: string | null;
  notified_at: string | null;
  reopen_count: number;
}

export interface TaskAuditEntry {
  type: string;
  detail: string | null;
  created_at: string;
}

export interface TaskDto {
  id: string;
  reference: string;
  session_id: string;
  workflow_id: string;
  version: number;
  status: TaskStatus;
  requirements: TaskRequirement[];
  values: Record<string, RequirementValue>;
  steps: TaskStepState[];
  audit: TaskAuditEntry[];
  created_at: string;
  updated_at: string;
}

export interface NextRequirementDto {
  requirement: TaskRequirement | null;
  complete: boolean;
}
```

**Three decisions encoded above, each deliberate:**

- **Every date is `string`.** The API types them `Date`, but `serializeTask` passes them
  through and JSON makes them ISO strings. This is the exact `WorkflowRecord.updated_at`
  finding from [fe-api-migration-plan.md](../unblock-ai-web/docs/fe-api-migration-plan.md)
  R9 — copying `Date` from the backend would type-check and then fail on any `.getTime()`.
- **`validation: InputValidation | null`.** Nullable here, non-null on `WorkflowInput`.
  Actor requirements always carry `null`. Do not share one alias.
- **`TaskStepState.type` stays `string`.** The API declares it `string`, not `StepType`.
  Narrowing it here would be *stricter than the server* — the failure mode the workflow
  types file warns about, in reverse.

### 1.3 New — `src/types/approval.ts`

```ts
import type { ResponseField } from "./workflow";
import type { StepOutcomeResult } from "./task";

export interface ApproverViewDto {
  task_reference: string;
  workflow_title: string;
  step: {
    step_id: string;
    name: string;
    instructions_to_approver: string | null;
    response_fields: ResponseField[];
  };
  approver: { name: string; email: string } | null;
  requester_answers: Array<{ label: string; value: string }>;
  computed: Array<{ label: string; value: string }>;   // always [] today — see §0 Finding 3
  prior_decisions: Array<{ step: string; outcome: string; reason: string | null; at: string }>;
  allowed_outcomes: StepOutcomeResult[];
  already_decided: boolean;
  decided_outcome: StepOutcomeResult | null;
  decided_at: string | null;
}

export interface DecisionResultDto {
  task_id: string;
  step_id: string;
  outcome: StepOutcomeResult;
  status: string;          // API types this `string`, not TaskStatus — mirror as-is
  completed: boolean;
  terminated: boolean;
}

export interface TaskTimelineEntry {
  step: string;
  outcome: string | null;
  reason: string | null;
  at: string;
}

export interface TaskStatusDto {
  status: string;          // likewise `string` on the API
  reference: string;
  workflow_title: string;
  current_steps: string[];
  rejected_at_step: string | null;
  rejected_by: string | null;
  reason: string | null;
  timeline: TaskTimelineEntry[];
}
```

`allowed_outcomes` is `StepOutcomeResult[]` and **must be rendered by mapping the array**.
Hardcoding three buttons produces one that 400s on any step not declaring
`request_more_info` (`allowedOutcomes` filters on non-null outcomes — `outcome-resolver.util.ts:13`).

> **Gate:** `npm run typecheck && npm run lint`. Nothing imports these yet, so both pass
> trivially — the point is that the new files themselves compile under `strict`.

---

## Phase 2 — API clients

Two new files, same shape as the four existing ones: one exported object of thin functions
over `apiRequest`, no state, no `fetch`.

### 2.1 New — `src/lib/api/tasks.ts`

```ts
import { apiRequest } from "./client";
import type { NextRequirementDto, RequirementValue, TaskDto, TaskStatus } from "@/types/task";
import type { TaskStatusDto } from "@/types/approval";

export const tasksApi = {
  create: (sessionId: string) =>
    apiRequest<TaskDto>("/tasks", { method: "POST", body: { session_id: sessionId } }),

  list: (filters: { session_id?: string; status?: TaskStatus } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== undefined) as [string, string][],
    ).toString();
    return apiRequest<TaskDto[]>(`/tasks${qs ? `?${qs}` : ""}`);
  },

  get:  (id: string) => apiRequest<TaskDto>(`/tasks/${id}`),
  next: (id: string) => apiRequest<NextRequirementDto>(`/tasks/${id}/next`),

  setValue: (id: string, key: string, value: RequirementValue) =>
    apiRequest<TaskDto>(`/tasks/${id}/values`, { method: "POST", body: { key, value } }),

  finalize: (id: string) => apiRequest<TaskDto>(`/tasks/${id}/finalize`, { method: "POST" }),
  start:    (id: string) => apiRequest<TaskDto>(`/tasks/${id}/start`,    { method: "POST" }),
  status:   (id: string) => apiRequest<TaskStatusDto>(`/tasks/${id}/status`),

  cancel: (id: string) =>
    apiRequest<TaskDto>(`/tasks/${id}/status`, {
      method: "PATCH",
      body: { status: "cancelled" },
    }),
};
```

**Four contract details, each verified against the controller:**

- **`finalize`/`start` send no body.** `apiRequest` sets `Content-Type` and a body only when
  `body` is truthy ([client.ts:36-38](../unblock-ai-web/src/lib/api/client.ts#L36-L38)), so
  omitting it is correct and needs no `client.ts` change.
- **`cancel`, not `updateStatus`.** The controller runs
  `requireOneOf(req.body, "status", ["cancelled"])` (`task.controller.ts:57`). A general
  `updateStatus(id, status)` would type-check while 400ing for every value but one; the
  narrow name puts the server's real constraint in the signature.
- **`list` filters `undefined` before building the query.** `URLSearchParams` renders a
  missing value as the literal string `"undefined"`, which the API would then try to match.
- **`setValue` takes `RequirementValue`, not `unknown`.** This is what makes Phase 4's
  per-type coercion a compile-time concern rather than a runtime surprise.

### 2.2 New — `src/lib/api/approvals.ts`

```ts
import { apiRequest } from "./client";
import type { ApproverViewDto, DecisionResultDto } from "@/types/approval";
import type { StepOutcomeResult } from "@/types/task";

export const approvalsApi = {
  getView: (token: string) =>
    apiRequest<ApproverViewDto>(`/approvals/${encodeURIComponent(token)}`),

  submitDecision: (token: string, outcome: StepOutcomeResult, reason: string | null = null) =>
    apiRequest<DecisionResultDto>(`/approvals/${encodeURIComponent(token)}/decision`, {
      method: "POST",
      body: { outcome, reason },
    }),
};
```

The token is `base64url(payload).base64url(sig)` — URL-safe by construction, so
`encodeURIComponent` is a no-op today. Apply it anyway: it is free and correct for any value
entering a path segment.

> **Gate:** `npm run typecheck && npm run lint`.
> **Manual check:** with the API running, in a browser console on `localhost:3001`:
> `await fetch("http://localhost:3000/api/tasks").then(r => r.json())` → `[]` or a task
> array, not a CORS error. Confirms origin config before any UI depends on it.

---

## Phase 3 — The approver page

**Ship this first among the UI phases.** The backend already emails
`${APP_PUBLIC_URL}/approvals/<token>` (`notification.service.ts:39`) and `APP_PUBLIC_URL`
defaults to `http://localhost:3001` (`mail.config.ts:15`) — the web app's own origin. Every
approval email sent so far contains a link into this app that 404s. This phase is also fully
demoable alone: copy a token from the console mailer's stdout, no Phase 4 required.

### 3.1 New — `src/app/approvals/layout.tsx`

Per §0.2 — without it the page inherits no font. Mirror the portal layout:

```tsx
import type { ReactNode } from "react";

export default function ApprovalsLayout({ children }: { children: ReactNode }) {
  return <div className="font-portal min-h-screen">{children}</div>;
}
```

Deliberately **not** nested under `/portal` or `/admin`: the approver holds a token from an
email and has no account. `getSession()` says nothing about them, and inheriting either nav
shell would imply an account they do not have.

### 3.2 New — `src/app/approvals/[token]/page.tsx`

Server component, `export const dynamic = "force-dynamic"` (matching
[admin/templates/[id]](../unblock-ai-web/src/app/admin/templates/%5Bid%5D/page.tsx)). Fetch
server-side, render a client component for the form.

```tsx
export default async function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let view;
  try {
    view = await approvalsApi.getView(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return <InvalidLink />;
    throw err;
  }
  return <ApprovalDecision token={token} view={view} />;
}
```

A 404 must render an **invalid-link panel, not `notFound()`** — the app's 404 page is
irrelevant to an approver, and the API returns 404 for a malformed *or* unrecognised token
deliberately (it does not confirm a token ever existed). Say the link is no longer valid and
suggest contacting the requester. Never say "session expired, please log in" — there is no
login.

### 3.3 New — `src/components/approvals/ApprovalDecision.tsx`

Client component. Renders from the DTO and owns the decision mutation.

| Section | Field | Note |
|---|---|---|
| Header | `task_reference`, `workflow_title` | |
| The ask | `step.name`, `step.instructions_to_approver` | instructions are nullable |
| Recipient | `approver.name` / `.email` | **`approver` is nullable** — guard it |
| The request | `requester_answers[]` | **filter `actor:` keys — §0 Finding 3** |
| Derived | `computed[]` | always `[]` today; render only if non-empty |
| History | `prior_decisions[]` | `at` via `formatDateTime` from `@/lib/utils/format` |
| Controls | `allowed_outcomes.map(...)` | one button per entry, never a fixed triple |

The `requester_answers` filter is the one place this component knowingly diverges from the
payload:

```tsx
// Actor requirements are person objects the API stringifies to "[object Object]",
// keyed by the raw `actor:<step_id>`. Filtering them is a display fix for a backend
// presentation bug — see web-task-approval-phase-plan.md §0 Finding 3.
const answers = view.requester_answers.filter((a) => !a.label.startsWith("actor:"));
```

### 3.4 The four states — all of them

State 4 is the one the analysis document missed (§0 Finding 1).

1. **Undecided** (`already_decided === false`) — render the outcome buttons.
2. **Already decided** (`already_decided === true`) — a re-clicked link is **200, not an
   error**. Render "Already approved on 15 Aug 2026, 09:12" from `decided_outcome` /
   `decided_at`, hide the controls. Branch on `already_decided` **only**, never on
   `decided_outcome !== null` (§0 Finding 2).
3. **Invalid token** — 404 from the GET, handled in the page (§3.2).
4. **Rejected at submit** — 409 from `POST /decision`. Three distinct causes, all arriving
   *after* the page rendered as actionable:

| 409 message contains | Cause | What to render |
|---|---|---|
| `already been used` | Concurrent decision / double submit | Same panel as state 2 |
| `expired on` | Token past `token_expires_at` | "This link expired on …. Ask the requester to have it reissued." |
| `no longer awaiting approval` | Step state changed underneath | "This step is no longer awaiting a decision." |

**Replace the whole form with a terminal panel on a 409** — do not leave the buttons live
under an inline error. All three causes are permanent for this token; re-clicking cannot
succeed, and leaving an enabled button invites exactly that.

### 3.5 The `reason` field

`POST /decision` returns
`400 "A reason is required for outcome '<outcome>' on step '<step_id>'"` when the step's
outcome config sets `include_reason: true` (`approval.service.ts:120-122`).
**`ApproverViewDto` does not expose `include_reason`** — the page cannot know in advance.

**Decision: always render an optional reason textarea**, submit whatever is typed, and on a
400 surface the API's message next to the field and keep the form live. This is the one
error class that is *retryable*, which is precisely why it renders differently from the 409s
in §3.4.

Adding `include_reason` to `ApproverViewDto` would be cleaner UX, but it is a backend change
and out of scope (§7). Do **not** guess by outcome name — "rejections need a reason" is an
assumption the schema does not make.

### 3.6 After a successful decision

Render a terminal confirmation from `DecisionResultDto` (`outcome`, `completed`,
`terminated`). **Do not redirect** — the approver has nowhere in this app to go.

> **Gate:** `npm run typecheck && npm run lint`.
> **Manual check (the real one for this phase):** with `MAIL_TRANSPORT=console`, drive a
> task to `start` via Postman, copy the token from the API's stdout, open
> `http://localhost:3001/approvals/<token>`. Verify: the page renders; buttons match
> `allowed_outcomes`; submitting records the decision; **reloading the same URL now shows
> the already-decided panel, not an error** (state 2 — the single most likely thing to get
> wrong).

---

## Phase 4 — Task creation and requirement collection

The largest phase, and the one that makes the portal functional. Split into 4.1–4.6; they
land as one commit because 4.1 without 4.2 navigates to a route that does not exist.

### 4.1 `useSelectionSession` — return `sessionId`

One line. The hook already holds `sessionId` in state but omits it from the return object
([useSelectionSession.ts:151](../unblock-ai-web/src/lib/hooks/useSelectionSession.ts#L151)):

```ts
return { messages, decision, workflow, isBusy, send, choose, hasStarted, sessionId };
```

This is the seam the entire task flow hangs off — `POST /tasks` needs the session id and
nothing else currently exposes it.

### 4.2 `PlanPanel` + `jobs/new/page.tsx` — create a real task

Today `onSubmit={() => router.push("/portal")}` navigates and creates nothing
([jobs/new/page.tsx:36](../unblock-ai-web/src/app/portal/jobs/new/page.tsx#L36)). Replace:

```ts
async function submit() {
  if (!sessionId) return;
  startSubmitting(async () => {
    try {
      const task = await tasksApi.create(sessionId);
      router.push(`/portal/jobs/${task.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start this request.");
    }
  });
}
```

`PlanPanel` gains `isSubmitting` and `error` props — it currently takes only
`{ workflow, onSubmit }` and has no error surface at all.

**Gate the button on `workflow !== null`.** `POST /tasks` 409s unless the session matched,
and `workflow` is set only on a matched decision — the existing state already encodes the
precondition, so no new check is needed.

### 4.3 New — `src/lib/hooks/useTaskCollection.ts`

Same role as `useSelectionSession`: single source of truth for one collection loop.

```ts
export function useTaskCollection(taskId: string) {
  const [task, setTask] = useState<TaskDto | null>(null);
  const [current, setCurrent] = useState<TaskRequirement | null>(null);
  const [complete, setComplete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // loadNext(), submitValue(value), sendForApproval()
}
```

The loop:

```
GET /tasks/:id/next
  → { requirement, complete: false } → render an input for requirement.type
  → { requirement: null, complete: true } → show the review + send action
POST /tasks/:id/values { key, value } → updated TaskDto → loadNext() again
```

**Drive the loop from `/next`, never from `task.requirements`.** Rendering the whole array
as one form is tempting and wrong twice over: `/next` encodes the ordering rule (all pending
*required* first, then optional — `task.service.ts:92-104`), and it is the **only** thing
that surfaces follow-up requirements appended after a `request_more_info` decision (§4.6). A
form built from a snapshot taken at task creation will never show them.

**Clear the field's local value on every successful submit.** The next requirement may be a
different type entirely, and a stale string leaking into a `person` or `boolean` field is a
guaranteed 400.

### 4.4 New — `src/components/portal/RequirementField.tsx`

The per-type input. **Not optional polish** — `requester_email` puts a typed input on every
workflow, and every approver is a `person`, so a generic text box 400s on any real workflow.

Rules read from `value-validator.util.ts` directly:

| `type` | Control | Value submitted |
|---|---|---|
| `string`, `phone`, `enum`, `file` | `<input type="text">` | string |
| `text` | `<textarea>` | string |
| `email` | `<input type="email">` | string matching `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| `number` | `<input type="number">` | **`Number(raw)`** — a real number |
| `boolean` | checkbox | **`true` / `false`** — never the strings |
| `date`, `datetime` | `<input type="date">` | `"YYYY-MM-DD"` |
| `person` | **two inputs**: name + email | `{ name, email }` object |

Four guaranteed-400 traps, each verified in the coercer:

- **`boolean` rejects `"true"`/`"false"`.** `coerceBoolean` demands an actual boolean
  (`value-validator.util.ts:46-51`). A checkbox routed through generic string form state
  hits this every time.
- **`person` is an object.** Every `actor:<step_id>` requirement is `type: "person"`, needing
  a two-field sub-form; both parts are validated — non-empty `name`, `email` against the
  same pattern (`value-validator.util.ts:53-61`).
- **`datetime` wants date-only.** `coerceByType` routes `datetime` through `coerceDate`,
  which tests `/^\d{4}-\d{2}-\d{2}$/`. `<input type="datetime-local">` emits
  `YYYY-MM-DDTHH:mm` and is rejected. Use a date input for both.
- **`enum` carries no options.** Checked as a plain string, and the requirement has no
  option list. Render a text input; a `<select>` would need options the contract does not
  provide.

Use `collection_hint` as helper text — it is populated for actor requirements
("Name and email address of your Head Of Department") and is exactly the guidance a
two-field person form needs.

### 4.5 Client-side validation stays shallow

Mirror the simple `validation` rules into input attributes (`min_length` → `minLength`,
`min`/`max`, `pattern`). Good UX, no risk.

**Do not implement the cross-field date rules.** `not_before_field` resolves against
`inputs.<key>` across every value collected so far, and `not_before: "today"` resolves
server-side (`value-validator.util.ts:12-22`). Reimplementing that duplicates the coercer
and will drift. Let the server own it and render the returned message — the API names the
requirement in the error text (`Requirement 'return_date' must not be before
'inputs.departure_date'`), which is enough to attach it to the right field.

### 4.6 Finalize, start, and the reopen loop

When `/next` returns `complete: true`, present **one "Send for approval" action** that calls
`finalize` then `start`:

```ts
await tasksApi.finalize(taskId);   // → status "ready", assignees resolved
await tasksApi.start(taskId);      // → status "in_progress", approval emails sent
```

One action, not two buttons. Nothing reaches an approver until `start` — which is exactly
what `PlanPanel` already promises on screen ("Nothing is sent to any approver until you
submit"). A task left `ready` but never started is an invisible dead state with no UI reason
to exist.

**If `finalize` succeeds and `start` fails**, the task is stranded in `ready`. Surface the
error and offer retry — `start` is safe to re-call (it 409s only if the status is not
`ready`, and after a failed start it still is).

**The reopen loop.** On `request_more_info`, the backend appends a
`followup:<step_id>:<n>` requirement (`type: "text"`, `required: true`) and flips the task
**back to `collecting`** (`task.service.ts:254-280`). Consequences:

- **`collecting` does not mean "new".** It may be a live task returned for more information.
  The collection view must be reachable from the job list, not only from the creation flow —
  which is why Phase 5.3 routes on `task.status`, not on how the user arrived.
- The follow-up requirement's **`label` is the approver's question**, and `reopen_count`
  caps at 3.
- After answering, the same finalize → start pair runs again. The "Send for approval" action
  must therefore work on a reopened task, not just a fresh one.

> **Gate:** `npm run typecheck && npm run lint`.
> **Manual check:** portal → new job → describe a request → match → Submit. Walk the full
> requirement loop, confirming a `person` question renders two fields and `requester_email`
> renders an email input. Send for approval, confirm the approval email in the API's stdout.
> Then from Phase 3's page choose `request_more_info` and confirm the task returns to
> `collecting` with the approver's question as the next requirement.

---

## Phase 5 — Real job list and task detail

### 5.1 Delete `src/lib/fixtures/jobs.ts`

Its own header says to: *"DELETE THIS FILE when the execution engine ships."* It has.

### 5.2 `portal/page.tsx` + `JobRow` — consume `TaskDto`

`tasksApi.list()` returns `TaskDto[]`, newest `created_at` first (`task.model.ts:54` sorts
`{ created_at: -1 }`) — so no client-side sorting is needed.

Two shape mismatches to resolve deliberately:

- **A task has no `title`.** `TaskDto` carries `reference` and `workflow_id`, not the
  workflow's title. `GET /tasks/:id/status` does return `workflow_title`, but per-task —
  using it for a list means N requests. **Fetch `workflowsApi.list()` once and join on
  `workflow_id`**, falling back to `reference` when no match (a task can outlive its
  template). One extra call for the whole page.
- **`JobStatus` has 3 members; `TaskStatus` has 6.** `collecting`, `ready`, and `cancelled`
  have no icon or tone today. Add lookups, following the `Badge`/`Button` convention —
  *"styles as data, not as an if/else chain"*:

```ts
const TASK_TONE: Record<TaskStatus, "neutral" | "warn" | "success" | "danger"> = {
  collecting: "warn", ready: "warn", in_progress: "warn",
  completed: "success", rejected: "danger", cancelled: "neutral",
};
```

The existing `StatusIcon` spinner suits `in_progress`; `collecting`/`ready` want a distinct
"needs you" treatment, since **`collecting` is the state that requires user action** — it is
the reopened-task case from §4.6 and must be visually obvious in the list.

**The delete button currently drops rows from local state only.** Wire it to
`tasksApi.cancel(id)` and hide it for terminal statuses (`completed`, `rejected`,
`cancelled`), which 409 (`task.controller.ts` → `cancel`). Cancelling is not deleting —
there is no `DELETE` endpoint anywhere in the API. Relabel it accordingly.

### 5.3 New — `src/app/portal/jobs/[id]/page.tsx`

`JobRow` already links to `/portal/jobs/${job.id}` and this route does not exist — **every
row in the portal 404s today.**

Fetch `tasksApi.get(id)` for `status`, then branch:

- **`collecting`** → the Phase 4 collection view (new task *or* reopened follow-up).
- **everything else** → the timeline from `tasksApi.status(id)`:
  `reference`, `workflow_title`, `current_steps[]` (who it is waiting on),
  `timeline[]` oldest-first, and on rejection `rejected_at_step` / `rejected_by` / `reason`
  — who rejected it, where, and why.

Branch on `task.status`, never on how the user arrived (§4.6).

This page is also the **compatibility path** for workflows saved before `requester_email`
existed: those tasks send the requester no email at all, so pulling this endpoint is the
only way to track progress. Both `api-documentation.md` §7 and `overview.md` call that
graceful degradation — this page is what makes it graceful.

> **Gate:** `npm run typecheck && npm run lint`. Confirm `jobs.ts` has no remaining
> importers (`grep -rn "fixtures/jobs" src/`).
> **Manual check:** portal list shows real tasks with correct tones; every row opens; a
> `collecting` row opens the collection view; an `in_progress` row shows the timeline; a
> rejected task names its rejector and reason.

---

## Phase 6 — Error handling and hardening

Once the flows exist, make their failures legible. No new screens.

### 6.1 Use `ApiError.code`, not status alone

`client.ts` already captures `code`. This surface is where it earns its keep, because `409`
means four different things:

| Endpoint | 409 means |
|---|---|
| `POST /tasks` | Session has not matched a workflow |
| `POST /values`, `POST /finalize` | Task is no longer `collecting` |
| `POST /start` | Task is not `ready` |
| `POST /decision` | Token used, expired, or step no longer awaiting (§3.4) |

Branch on endpoint plus `code`, and **render `err.message`** — the API's messages are written
to be shown to users, and the value-validation ones name the offending requirement.

### 6.2 Malformed ids surface as 500

A non-24-hex `:id` fails inside the Mongo driver and returns **500 `DATABASE_ERROR`**, not
404 (`api-documentation.md` §9.1). The admin route already handles this
([admin/templates/[id]:29](../unblock-ai-web/src/app/admin/templates/%5Bid%5D/page.tsx#L29)).
Apply the same treatment in `/portal/jobs/[id]`: treat `404` **or** `code === "DATABASE_ERROR"`
as not-found.

### 6.3 Confirm, do not change, `APP_PUBLIC_URL`

`mail.config.ts:15` defaults `appPublicUrl` to `http://localhost:3001`, and `next dev` runs
on 3001. The default is already correct locally — the link 404s only because the route was
missing, which Phase 3 fixed. **No config change is needed.**

Worth recording for deployment: `APP_PUBLIC_URL` must point at the **web** origin, not the
API. It is the one backend setting whose correct value is a frontend fact.

### 6.4 What needs no change

`src/types/workflow.ts` is untouched by this entire plan. `InputType` already has all eleven
members including `"email"`, and `RequirementType` reuses it. The frontend has no
per-input-type `switch` today, so **nothing existing breaks** — this is purely new surface.

> **Gate:** `npm run typecheck && npm run lint && npm run build`. The build is worth running
> once at the end; it is the only check that exercises route types across all new pages.

---

## Build order

| Phase | Deliverable | Gate |
|---|---|---|
| 1 | `types/task.ts`, `types/approval.ts`, `typecheck` script | typecheck + lint |
| 2 | `lib/api/tasks.ts`, `lib/api/approvals.ts` | typecheck + lint + CORS check |
| 3 | `/approvals/[token]` + layout + `ApprovalDecision` | Console-mailer token, incl. re-click |
| 4 | Task creation, `useTaskCollection`, `RequirementField` | Full loop incl. reopen |
| 5 | Real job list, `/portal/jobs/[id]`, delete fixtures | Every row opens |
| 6 | Error handling, hardening | typecheck + lint + build |

**Phases 1–2 are one commit.** Phase 3 stands alone and is independently demoable without
any of Phase 4. **Phase 4's sub-steps are one commit** — 4.1 without 4.2 navigates to a
route that does not exist, and 4.2 without 4.3 lands on an empty page. Phase 5 depends on
Phase 4 only for the `collecting` branch.

---

## Risks

**1. Per-type inputs are not optional.** A generic string form 400s on `requester_email` —
now on every workflow — and on every `actor:*` person requirement. There is no version of
this UI that ships without type branching. (§4.4)

**2. The expired-token page renders as actionable.** `getApproverView` checks neither expiry
nor step state, so the approver reads the request and decides before hitting a 409. Not
fixable frontend-side; it must be handled at submit, as a terminal state. (§0 Finding 1, §3.4)

**3. The reopen loop returns a live task to `collecting`.** If the portal treats `collecting`
as "new, still being created", a task returned for more information becomes unreachable and
the chain stalls with no visible cause. (§4.6)

**4. `already_decided` and `decided_outcome` can disagree.** A reopened, re-dispatched step
carries an old `decided_outcome` with `already_decided: false`. Branching on the wrong one
hides the buttons from an approver who genuinely needs them. (§0 Finding 2)

**5. `[object Object]` in the approver's view.** Person values are stringified into
`requester_answers`. Phase 3 filters them client-side; the underlying backend bug remains.
(§0 Finding 3)

**6. Stored workflows predate `requester_email`.** Their tasks email the requester nothing.
The status page is the only fallback, and it needs to exist before anyone demos an older
template. (§5.3)

**7. No auth on `/tasks/*`.** Any client can read or mutate any task by id. `getSession()` is
mock identity the API never checks. Do not build UI implying ownership the backend does not
enforce, and do not deploy this surface publicly as-is.

**8. No test runner.** Every gate here is a typecheck, a lint, and a manual walk. The manual
checks are not optional garnish — they are the only behavioural verification this project
has.

---

## Explicitly out of scope

- **All backend changes.** Two are worth filing as follow-ups from findings above:
  adding `include_reason` to `ApproverViewDto` (§3.5), and excluding `actor:*` values from
  `requester_answers` or serializing `PersonValue` properly (§0 Finding 3).
- **Authentication.** Risk 7; a separate slice spanning both projects.
- **Directory/identity lookup.** Approver and requester addresses stay self-asserted —
  Option C in [requester-contact-gap.md](requester-contact-gap.md), unscheduled.
- **Realtime updates.** Everything is pull-based; no polling or websockets. Manual refresh
  on the status page is sufficient at this stage.
- **Admin-side task visibility.** `GET /tasks` gets no admin UI here; the portal is
  requester-facing only.
- **Adding a test runner.** Worth doing, but it is its own decision (framework, scope,
  CI) and would block every phase behind it.

---

## Appendix — verification method

Endpoints confirmed from `unblock-ai-api/src/routes/{task,approval}.route.ts`; shapes from
`src/controllers/{task,approval}.controller.ts`, `src/utils/http/serializer.util.ts`, and
`src/lib/types/{task,approval}/**`. Coercion rules read from
`src/utils/task/value-validator.util.ts` rather than the documentation table. §0 Finding 1
comes from comparing `resolveToken` (`approval.service.ts:185-198`) against the guards in
`submitDecision` (`:103-114`); Finding 2 from `:88`; Finding 3 from `:60-63` and `:84`;
Finding 4 from `nextRequirement` (`task.service.ts:92-104`) with
`requirement-builder.util.ts`. Frontend conventions confirmed by reading
`unblock-ai-web/src/app/globals.css`, `package.json`, `tsconfig.json`, the existing
`src/lib/api/*` clients, and `TemplateEditor.tsx`'s `useTransition` mutation pattern.
