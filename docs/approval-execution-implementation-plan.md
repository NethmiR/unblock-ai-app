# Approval & Execution — API Implementation Plan

Step-by-step build order for the approval execution slice described in
[approval-execution-design.md](approval-execution-design.md). Read that first — this
document assumes its decisions and does not re-argue them.

**Target:** `unblock-ai-api/` only. No frontend work in this plan.

**Starting point:** `POST /tasks/:id/finalize` seeds step states to `ready` / `blocked`
and stops. Everything below is what turns that seeded graph into a running approval chain.

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
| `config/env.config.ts` is the only reader of `process.env` | New config goes in a `*.config.ts` reading `rawEnv` |
| Tests are `node:test` via `tsx` | No Jest/Vitest. `npm test` runs `tests/unit/**` + `tests/integration/**` |
| Pluggable backends go behind an interface + factory | Mirror `services/vector-store/` exactly for `services/mailer/` |

**Verification after every phase:** `npm run typecheck && npm test` must pass.

---

## Phase 1 — Types, constants, config

Pure declarations plus one config module. No logic; nothing consumes them yet.

### 1.1 `src/lib/types/task/task.type.ts` — extend `TaskStepState`

Add four fields to the existing interface (design §4). `approval_token` already exists.

```ts
export interface TaskStepState {
  // ...existing fields unchanged...
  approval_token: string | null;      // exists — becomes non-null in Phase 4
  token_expires_at: Date | null;      // new
  token_used_at: Date | null;         // new
  notified_at: Date | null;           // new
  reopen_count: number;               // new — guards the §8 ping-pong loop
}
```

`reopen_count` is a **number, not nullable**, and defaults to `0`. Making it nullable
would force a `?? 0` at every comparison site.

> **Ripple:** `PlannerService.compile()` constructs `TaskStepState` literally, so it stops
> compiling until 1.4 adds the new fields. That is the intended order — the compiler finds
> the construction site for you.

### 1.2 `src/data/constants/status.constant.ts`

Append two `as const` objects alongside the existing ones. `STEP_STATE` and `TASK_STATUS`
are unchanged — every value this slice needs already exists.

```ts
export const STEP_OUTCOME = {
  APPROVED: "approved",
  REJECTED: "rejected",
  REQUEST_MORE_INFO: "request_more_info",
} as const;

export const OUTCOME_ACTION = {
  CONTINUE: "continue",
  TERMINATE_WORKFLOW: "terminate_workflow",
  REOPEN_INPUT: "reopen_input",
} as const;
```

These mirror `StepOutcomeResult` and `StepOutcomeAction` in
`lib/types/workflow/step.type.ts`. The types already exist; only the runtime constants
are missing.

### 1.3 `src/lib/types/approval/` — new type folder

Four files, matching the `lib/types/*/` convention:

| File | Contents |
|---|---|
| `token.type.ts` | `ApprovalTokenPayload { task_id, step_id, nonce }`, `TokenVerifyResult` |
| `approval.type.ts` | `ApproverViewDto`, `DecisionInput`, `DecisionResultDto` |
| `mail.type.ts` | `MailMessage { to, subject, text, html }`, `MailSendResult` |
| `index.type.ts` | Barrel re-export |

`ApproverViewDto` mirrors the JSON in design §6 field-for-field:

```ts
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
  computed: Array<{ label: string; value: string }>;
  prior_decisions: Array<{ step: string; outcome: string; reason: string | null; at: Date }>;
  allowed_outcomes: StepOutcomeResult[];
  already_decided: boolean;
  decided_outcome: StepOutcomeResult | null;
  decided_at: Date | null;
}
```

### 1.4 `src/services/planner.service.ts` — fix the construction site

Add the four new fields to the object literal in `compile()`:
`token_expires_at: null`, `token_used_at: null`, `notified_at: null`, `reopen_count: 0`.

One-line change, but it is what makes 1.1 compile.

### 1.5 `src/config/mail.config.ts` — new config module

Follow `server.config.ts` exactly: import `rawEnv`, use `env-parse.util.js` helpers,
export a frozen object.

```ts
const TRANSPORTS = ["console", "smtp"] as const;

export const mail: MailConfig = Object.freeze({
  transport: parseEnum("MAIL_TRANSPORT", rawEnv.MAIL_TRANSPORT, TRANSPORTS, "console"),
  from: optionalString("MAIL_FROM", rawEnv.MAIL_FROM, "Unblock AI <noreply@localhost>"),
  smtpHost: optionalString("SMTP_HOST", rawEnv.SMTP_HOST, ""),
  smtpPort: parseNumber("SMTP_PORT", rawEnv.SMTP_PORT, 587),
  smtpUser: optionalString("SMTP_USER", rawEnv.SMTP_USER, ""),
  smtpPass: optionalString("SMTP_PASS", rawEnv.SMTP_PASS, ""),
  appPublicUrl: optionalString("APP_PUBLIC_URL", rawEnv.APP_PUBLIC_URL, "http://localhost:3001"),
  tokenSecret: optionalString("APPROVAL_TOKEN_SECRET", rawEnv.APPROVAL_TOKEN_SECRET, ""),
  tokenTtlDays: parseNumber("APPROVAL_TOKEN_TTL_DAYS", rawEnv.APPROVAL_TOKEN_TTL_DAYS, 14),
});
```

**Fail fast on a missing secret in production.** Throw `ConfigurationError` when
`transport === "smtp"` and `tokenSecret` is empty. A dev default is fine; a silently
unsigned production token is not.

### 1.6 `src/lib/types/config/config.type.ts` + `src/config/index.config.ts`

Add `MailConfig` to the type file and `mail` to the frozen `config` object.

### 1.7 `.example.env`

Append the block from design §7, each line with its `#` comment, matching the existing
file's style. Update `.env` locally too — `.example.env` alone will not run.

> **Checkpoint:** `npm run typecheck` passes. No behaviour has changed.

---

## Phase 2 — Pure utilities and the execution engine

The testable core. Build and unit-test **before** anything touches Mongo, email, or HTTP.
This is the phase worth being fussy about; the rest is plumbing around it.

### 2.1 `src/utils/approval/token.util.ts`

Three exported functions, `node:crypto` only — no new dependency.

```ts
export function issueToken(taskId: string, stepId: string, secret: string): string
export function parseToken(token: string): ApprovalTokenPayload | null
export function verifyToken(token: string, secret: string): ApprovalTokenPayload | null
```

Format, per design §4:

```
payload = base64url(JSON.stringify({ t: taskId, s: stepId, n: nonce }))
token   = payload + "." + base64url(HMAC-SHA256(payload, secret))
```

Three rules that matter:

- **`parseToken` never throws.** Malformed input returns `null`. Approval links are pasted
  out of email clients and arrive line-wrapped, truncated, or with a trailing `>`.
- **Use `crypto.timingSafeEqual`** for signature comparison, not `===`. Guard the length
  first — `timingSafeEqual` throws on mismatched buffer lengths.
- **The token carries no expiry or use-state.** Those live on the step document, so
  revocation is a DB write rather than a key rotation. `verifyToken` proves authenticity
  only; `approval.service.ts` decides whether it is *still valid* (2.4).

### 2.2 `src/utils/approval/outcome-resolver.util.ts`

The §3.1 dispatch, isolated as a pure function so it is testable without a task.

```ts
export function resolveOutcomeAction(
  step: WorkflowStep,
  outcome: StepOutcomeResult,
): StepOutcome  // throws ValidationError if that outcome is not declared on the step

export function allowedOutcomes(step: WorkflowStep): StepOutcomeResult[]
```

`allowedOutcomes` returns the keys of `step.outcomes` whose value is non-null. This is
what feeds `ApproverViewDto.allowed_outcomes` (design §6) — **never a hardcoded list of
three.** A step that does not declare `request_more_info` must not render that button.

### 2.3 `src/services/execution.service.ts` — the engine

**Pure. No I/O, no DB, no LLM, no email.** Takes state, returns new state. This is the
piece Proposal §4 stakes its credibility on, and purity is what makes it provable.

```ts
export interface AdvanceResult {
  steps: TaskStepState[];
  status: TaskStatus;
  dispatched: string[];   // step_ids that just became pending_approval
  completed: boolean;
  terminated: boolean;
  termination_reason: string | null;
}

export class ExecutionService {
  advance(task: TaskDocument, workflow: WorkflowDefinition): AdvanceResult
  applyDecision(task, workflow, stepId, outcome, reason): AdvanceResult
}
```

**`advance()`** implements design §3 exactly:

1. Steps in `pending_approval` — untouched.
2. `blocked` steps whose every `depends_on` is satisfied
   (`dep.step_id`'s `outcome === dep.required_outcome`) → `ready`.
3. `ready` steps → collected into `dispatched[]`, state → `pending_approval`.
   **The engine does not send the email** — it reports what needs sending. Phase 3's
   caller does the I/O. This is what keeps the engine pure and testable.
4. Completion: evaluate `workflow.completion.rule` against `completion.required_steps`.
   All satisfied → `completed: true`, `status = completed`.
5. Termination: any step with `outcome === rejected` whose action is
   `terminate_workflow` → `status = rejected`, every non-terminal step → `skipped`,
   `termination_reason` = that step's reason.

**Order matters:** check termination *before* dispatch. A rejected task must never emit
a `dispatched` entry — that is precisely the "the HoD's email is never sent" guarantee in
design §3.3.

**`applyDecision()`** writes `outcome`, `reason`, `responded_at`, `token_used_at` onto the
step, then dispatches on `resolveOutcomeAction`:

| Action | Effect |
|---|---|
| `continue` | Step → `approved`, then run `advance()` |
| `terminate_workflow` | Step → `rejected`, then run `advance()` (which terminates) |
| `reopen_input` | Step → `ready`, `reopen_count += 1`, no `advance()` — Phase 6 owns this |

### 2.4 Token validity — where it lives

Deliberately **not** in the engine. `approval.service.ts` (Phase 4) checks, in order:

1. `verifyToken` → signature valid? → else 404 (not 401 — do not confirm a token exists)
2. Step found by `step_id` on that task? → else 404
3. `token_used_at !== null` → **not an error.** Return the view with
   `already_decided: true` (design §6). A re-clicked link must render "already approved
   on 12 Aug", never a 500.
4. `token_expires_at < now` → `ConflictError` 409, with an explanatory message
5. `step.state !== pending_approval` → `ConflictError` 409

### 2.5 Unit tests — the heart of this plan

`tests/unit/services/execution.service.test.ts`, using `loadExpectedFixture` and hand-built
`TaskDocument`s (no mocking library, matching `task.service.test.ts`):

**Sequential chain — `it_faculty_overseas_leave.json`:**
- advance on a freshly finalized task → dispatches `advisor_review` only
- advisor approves → `hod_review` dispatches, `dean_review` stays `blocked`
- advisor rejects → status `rejected`, `hod_review` and `dean_review` → `skipped`,
  **`dispatched` is empty**, `termination_reason` is the advisor's text
- all three approve → status `completed`, `completed: true`

**Parallel graph — `departmental_event_workshop.json`:**
- advance on a finalized task → **two** steps dispatch in one pass (Proposal Scenario B)
- the gated branch stays `blocked` until its dependency reports `approved`

**Dispatch guards:**
- a step already `pending_approval` is not re-dispatched
- `applyDecision` on an outcome the step does not declare → `ValidationError`

`tests/unit/utils/token.util.test.ts`:
- round-trip issue → verify
- tampered payload → `null`
- tampered signature → `null`
- garbage / empty / no-dot / line-wrapped input → `null`, never a throw
- token signed with a different secret → `null`

> **Checkpoint:** `npm test` passes. The entire approval logic is proven with zero I/O.

---

## Phase 3 — Mailer and notifications

Makes the flow observable end to end with **no provider account and no network**.

### 3.1 `src/services/mailer/` — mirror the vector-store pattern

```
mailer.interface.ts     IMailer { send(msg: MailMessage): Promise<MailSendResult> }
console.mailer.ts       logs subject, recipient, and the approval URL via logger.info
smtp.mailer.ts          nodemailer — Phase 5, stubbed here
index.mailer.ts         createMailer(transport, config) factory
```

Copy the shape of `services/vector-store/index.vector-store.ts` for the factory. Same
switch, same `ConfigurationError` on an unknown transport.

**`console.mailer.ts` is the default and does the real work of Phases 3–4:** it prints the
full approval URL to stdout, so the whole chain is clickable from the terminal.

### 3.2 `src/data/templates/approval-email.template.ts`

Plain functions returning `{ subject, text, html }` — no template engine.

| Function | Trigger |
|---|---|
| `approvalRequestEmail(ctx)` | Step dispatched to an approver |
| `rejectionNoticeEmail(ctx)` | `terminate_workflow` → requester |
| `completionNoticeEmail(ctx)` | Task completed → requester |
| `moreInfoNoticeEmail(ctx)` | `reopen_input` → requester |

Keep the HTML deliberately minimal — a heading, a definition list of request values, and
one anchor. Approval emails are read in Outlook and Gmail; elaborate CSS is a liability.

### 3.3 `src/services/notification.service.ts`

Composes and sends. Constructor: `{ mailer, config }`.

```ts
sendApprovalRequest(task, workflow, step): Promise<boolean>
sendRejectionNotice(task, workflow, step): Promise<boolean>
sendCompletionNotice(task, workflow): Promise<boolean>
sendMoreInfoNotice(task, workflow, step): Promise<boolean>
```

Builds the URL as `${config.mail.appPublicUrl}/approvals/${token}`.

**Never throws.** Every method catches, logs at `error`, and returns `false`. A failed SMTP
call must not roll back a recorded approval decision (design §7). The caller uses the
boolean only to decide whether to stamp `notified_at`.

### 3.4 Unit tests

`tests/unit/services/notification.service.test.ts` with a `FakeMailer` collecting messages
in an array:

- an approval request email contains the token URL and the step name
- a rejection notice contains the reason text verbatim
- a mailer that throws → returns `false`, does **not** propagate

> **Checkpoint:** `npm test` passes. Still no HTTP surface.

---

## Phase 4 — Persistence, service orchestration, HTTP

Where the pure pieces meet Mongo and Express. After this phase the flow is fully
demonstrable in Postman.

### 4.1 `src/models/task.model.ts` — three new methods

| Method | Purpose |
|---|---|
| `findByStepToken(token)` | Locate a task by `steps.approval_token` — the approver entry point |
| `updateStepAndStatus(id, steps, status)` | Replace the whole `steps` array **and** `status` in one `$set` |
| `appendRequirement(id, requirement)` | `$push` onto `requirements` — Phase 6 |

`updateStepAndStatus` being a single write is the point: the engine produces a new step
array and a new status together, and persisting them separately opens a window where a
terminated task still shows a step as `pending_approval`.

Add an index in `src/db/index.definition.ts`:

```ts
{
  collection: COLLECTIONS.TASKS,
  keys: { "steps.approval_token": 1 },
  options: { name: "task_step_token", sparse: true },
},
```

`sparse: true` matters — most steps have a `null` token.

### 4.2 `src/services/approval.service.ts`

Constructor: `{ taskModel, workflowService, executionService, notificationService, config }`.

**`getApproverView(token)`** — assembles `ApproverViewDto` (design §6):

1. `verifyToken` → `NotFoundError` on failure
2. `taskModel.findByStepToken` → `NotFoundError`
3. Load the pinned workflow via `workflowService.getRecord(workflow_id, version)` —
   **version-pinned**, so an admin republishing mid-approval cannot change the rules under
   a live task
4. Map `task.values` through `workflow.inputs[].label` → `requester_answers`.
   Fall back to the raw key only when no matching input exists.
5. `prior_decisions` from steps with a non-null `outcome`, ordered by `responded_at`
6. `allowed_outcomes` ← `allowedOutcomes(step)` from 2.2
7. `already_decided` ← `step.token_used_at !== null`

**`submitDecision(token, outcome, reason, responseFields)`:**

1. Validate token and load task + workflow (as above)
2. Reject a replay: `token_used_at !== null` → `ConflictError` 409
3. **Enforce the reason gate** (design §3.4) — driven by
   `outcomes[outcome].include_reason`, never hardcoded per outcome name.
   Empty or whitespace-only → `ValidationError` 400
4. `executionService.applyDecision(...)` → `AdvanceResult`
5. **Persist first** (`updateStepAndStatus`), then append audit
6. **Then** send email for every `dispatched` step, plus a rejection or completion notice
7. Stamp `notified_at` for whichever sends returned `true`

Step 5 before step 6 is the design §7 reliability rule, and it is the single easiest thing
to get backwards.

### 4.3 `src/services/task.service.ts` — two additions

**`start(id)`** — `ready` → `in_progress`:

1. Reject unless `status === READY` → `ConflictError`
2. Load the version-pinned workflow
3. `executionService.advance(task)`
4. Issue tokens for each `dispatched` step; persist; then send email
5. Audit `task_started`

**`getStatus(id)`** — the requester-facing timeline (design §3.3):

```ts
{
  status, reference, workflow_title,
  current_steps: [...],
  rejected_at_step, rejected_by, reason,
  timeline: [...]
}
```

`reason` is lifted from the terminating step so the requester sees **who** rejected it,
**where**, and **why** — the core requirement driving this whole slice.

### 4.4 `src/controllers/approval.controller.ts` + `src/routes/approval.route.ts`

Separate from `/tasks` — different auth model (token, not session), different consumer.

```ts
router.get("/approvals/:token", asyncHandler(controller.getApproverView));
router.post("/approvals/:token/decision", asyncHandler(controller.submitDecision));
```

Controller validates only: `requireOneOf(body, "outcome", ["approved", "rejected",
"request_more_info"])` and `optionalString(body, "reason")`. Whether *this step* permits
that outcome, and whether a reason is required, are service-layer judgements — the
controller does not know the workflow.

### 4.5 `src/routes/task.route.ts` — two routes

```ts
router.post("/tasks/:id/start", asyncHandler(controller.startTask));
router.get("/tasks/:id/status", asyncHandler(controller.getTaskStatus));
```

Register `/tasks/:id/status` **before** any bare `/tasks/:id` pattern is broadened, for
the same reason the existing plan orders `GET /tasks` first.

### 4.6 `src/routes/index.route.ts` and `src/server.ts`

Add `approvalController` to `ApiControllers`, and wire in dependency order:

```ts
const mailer = createMailer(config.mail.transport, config.mail);
const notificationService = new NotificationService({ mailer, config });
const executionService = new ExecutionService();
const approvalService = new ApprovalService({
  taskModel, workflowService, executionService, notificationService, config,
});
```

`taskService` gains `executionService` and `notificationService` in its constructor object.

> **Ripple, exactly as in the task-planner plan §5.3:** `ApiControllers` is structurally
> typed, so **all five integration test files stop compiling** until each `buildServer`
> helper supplies an `approvalController`. Cheap to fix, alarming if unexpected. Do it
> deliberately.

### 4.7 Tests

`tests/unit/services/approval.service.test.ts`:

- invalid token → `NotFoundError`
- reject with no reason → `ValidationError`; with whitespace-only reason → `ValidationError`
- reject with a reason → task `rejected`, reason readable via `getStatus`
- second decision on a used token → `ConflictError`
- `getApproverView` on a used token → 200 with `already_decided: true`
- `allowed_outcomes` omits `request_more_info` for a step that does not declare it

`tests/integration/approval.route.test.ts` with a `fakeApprovalService`, mirroring
`task.route.test.ts`:

- `GET /api/approvals/garbage` → 404, **not** 500
- `POST /api/approvals/:token/decision` with a bad `outcome` → 400
- rejection without `reason` → 400
- happy path approve → 200

> **Checkpoint:** the full chain runs in Postman against the console mailer. No provider
> account, no SMTP, no frontend.

---

## Phase 5 — SMTP transport

Swaps one binding. Everything above already works.

1. `npm install nodemailer` + `npm install -D @types/nodemailer`
2. Implement `smtp.mailer.ts` against `IMailer` — `createTransport` once in the
   constructor, never per send
3. Set `MAIL_TRANSPORT=smtp` and the four `SMTP_*` vars (design §7 — Resend or Brevo;
   not Gmail)
4. Add `scripts/smoke-test-mail.script.ts`, matching the existing
   `smoke-test-azure.script.ts` pattern — sends one real email and exits

**Deliverability caveat, worth hitting before demo rehearsal rather than during it:**
without a verified sending domain (SPF/DKIM), approval mail to real university addresses
will very likely be filtered as spam.

No new tests — `IMailer` is already covered by the fake. The smoke script is the
verification, and it is deliberately outside `npm test` because it needs network.

---

## Phase 6 — The request-more-info loop

Builds on a working happy path, which is why it is last among the logic phases.
Design §8, Proposal Scenario A step 7.

### 6.1 `ExecutionService.reopen()`

Already stubbed by 2.3's `applyDecision`. Completes it:

1. Step → `ready`, `outcome` → `request_more_info`, `reason` = the approver's question
2. `reopen_count += 1` — **cap at 3**, else `ConflictError`. Without the cap an approver
   and a requester can ping-pong indefinitely.
3. Clear `approval_token`, `token_used_at`, `token_expires_at` — the next dispatch issues
   a **fresh** token, invalidating the old link

### 6.2 `TaskService.reopenForMoreInfo()`

1. Append a requirement (design §8):
   `key = "followup:<step_id>:<n>"`, `source: "input"`, `type: "text"`,
   `required: true`, `status: "pending"`, `label` = the approver's question
2. `status` → `collecting` so the existing `GET /tasks/:id/next` surfaces it
3. Notify the requester
4. Audit `more_info_requested`

**No new endpoint.** The requester answers through the existing
`POST /tasks/:id/values`, which is what makes this cheap.

### 6.3 `TaskService.finalize()` — handle the re-finalize path

`finalize()` currently assumes a first pass. On a re-finalize after a reopen it must:

- **not** re-seed every step state (that would wipe recorded approvals)
- re-dispatch **only** the reopened step, with a fresh token
- return `status` to `in_progress`, not `ready`

Branch on `task.audit` containing `more_info_requested`, or more cleanly on any step
having a non-null `outcome`. **This is the subtlest edit in the whole plan** — the
existing `initializeStepStates()` is written for a fresh graph and will silently discard
prior approvals if reused unchanged.

### 6.4 Tests

Extend `execution.service.test.ts`:

- `request_more_info` → step `ready`, `reopen_count` 1, token cleared
- prior approvals on **other** steps survive a reopen
- a 4th reopen on the same step → `ConflictError`

Extend `task.service.test.ts`:

- reopen appends exactly one pending requirement, status returns to `collecting`
- re-finalize dispatches only the reopened step, leaving approved steps `approved`

---

## Phase 7 — Docs

1. **`unblock-ai-api/docs/api/api-documentation.md`** — add the 4 new endpoints with
   request/response bodies. It currently documents 25; it becomes 29.
2. **`unblock-ai-api/docs/postman/unblock-ai.postman_collection.json`** — an "Approvals"
   folder chaining `task_id` → `approval_token`, matching how the collection already
   chains ids.
3. **`docs/overview.md`** — add functional area **H. Approval execution**; update the §4
   endpoint index; remove "No execution engine" and "No approval flow" from *Not built
   yet*.
4. **`unblock-ai-api/docs/guides/configuration.md`** — document the eight new env vars.

---

## Build order summary

| Phase | Deliverable | Gate |
|---|---|---|
| 1 | Types, constants, `mail.config.ts` | `npm run typecheck` |
| 2 | Token util, outcome resolver, **execution engine** + unit tests | `npm test` |
| 3 | `IMailer`, console mailer, notification service | `npm test` |
| 4 | Model methods, approval service, controllers, routes, wiring | `npm test` + Postman |
| 5 | SMTP transport | `smoke-test:mail` |
| 6 | Request-more-info loop | `npm test` |
| 7 | Docs | — |

**Phases 1–4 give a fully demonstrable approval chain with no external accounts at all.**

Phase 2 is the one worth being fussy about. If the engine and the token util are right,
everything after is plumbing.

---

## Explicitly out of scope

Named so nobody has to guess whether they were forgotten:

- **No frontend.** The approver page and requester status view are Phase 7 of the design
  doc, not of this plan. This plan ends at a JSON API.
- **No authentication** on `/tasks/*`. Consistent with the rest of the API today. The
  `/approvals/*` routes are token-authenticated, which is a different mechanism and does
  not imply session auth exists.
- **No HR/directory resolution.** Approver identity remains requester-supplied
  (design §10). `mock-directory.service.ts` is recommended there but is **not** in these
  seven phases — adding it is a separate, self-contained change.
- **No LLM assistance.** The three agent touchpoints in design §7 (question phrasing,
  context summarising, reject-vs-more-info suggestion) are all optional polish and are
  deliberately excluded so the engine ships provably deterministic.
- **No SLA, reminders, or escalation.** `WorkflowStep.sla` exists in the schema and stays
  unread by this slice.
- **No retry sweep for failed sends.** A failed send leaves `notified_at: null`, which is
  the hook a later sweep would use — but the sweep is not built here.

---

## Risks worth stating up front

**1. The `ApiControllers` ripple (§4.6).** Adding a controller to a structurally-typed
interface breaks the compile of all five integration test files simultaneously. Identical
to the ripple in the task-planner plan §5.3 — expected, cheap, and alarming only if
unanticipated.

**2. Re-finalize after reopen (§6.3) can silently wipe approvals.**
`initializeStepStates()` is written for a fresh graph. Reusing it unchanged on the reopen
path resets recorded approvals to `blocked` with no error — a *silent* data loss, which is
why it is called out here and covered by an explicit test in §6.4.

**3. Token/step consistency.** A token is only meaningful while its step is
`pending_approval`. Every path that changes step state must clear or reissue the token in
the **same** write (§4.1 `updateStepAndStatus`). Two separate writes leave a window where
a stale link is still live against a terminated task.

**4. Approver email trust** (design §10) — the requester supplies their own approver's
address, and this slice emails approval authority to it. Unchanged from the task-planner
slice, but it becomes materially more consequential here, because now something actually
gets sent. Worth a code comment at the dispatch site in `notification.service.ts`.

**5. The design doc's malformed-ObjectId note is stale.** `utils/shared/object-id.util.ts`
already validates via `ObjectId.isValid` and throws `ValidationError` (400). Design §10
describes it as returning 500. Do **not** spend Phase 4 "fixing" it — the token path needs
its own non-throwing guard (§2.1) regardless, because approval tokens are not ObjectIds.
