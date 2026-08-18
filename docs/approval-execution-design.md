# Approval & Execution — Design and Implementation Plan

Design for the **approval execution slice**: the layer that sits between "a task is
finalized and its steps are seeded" and "the approval chain has actually run to a
decision the requester can see".

Status: **agreed design, not yet implemented.** Read
[task-planner-design.md](task-planner-design.md) first — this document picks up exactly
where that one stops, and does not re-argue its decisions.

**Target:** `unblock-ai-api/` primarily; the final phase touches `unblock-ai-web/`.

---

## 1. What already exists (and it is more than it looks)

The workflow schema already encodes the entire approval flow **as data**. This slice
does not need to invent the semantics — it needs to build the runtime that reads them.

From `src/data/samples/expected/it_faculty_overseas_leave.json`, every approval step
already carries:

| Field | Already declares |
|---|---|
| `outcomes.rejected.action = "terminate_workflow"` | Rejection stops the workflow |
| `outcomes.rejected.include_reason = true` | A reason is mandatory on rejection |
| `outcomes.rejected.notify = [requester]` | The requester is told, with the reason |
| `outcomes.request_more_info.action = "reopen_input"` | The loop-back path |
| `outcomes.request_more_info.return_to_step = "self"` | Loop-backs stay acyclic |
| `outcomes.request_more_info.prompt_source = "approver_message"` | Where the question text comes from |
| `depends_on[].required_outcome` | What unblocks the next step |
| `instructions_to_approver`, `response_fields`, `context_from_steps` | What the approver page renders |
| `completion.rule` + `completion.required_steps` + `completion.actions` | When the task is done, and what happens then |

And `TaskStepState` (`src/lib/types/task/task.type.ts`) already carries `state`,
`outcome`, `reason`, `responded_at`, and `approval_token` — all currently always `null`,
explicitly reserved for this work.

**The gap, in one line:** `POST /tasks/:id/finalize` sets steps to `ready` / `blocked`
and stops. Nothing dispatches, nothing receives a decision, nothing advances. That is
the whole slice.

---

## 2. Architecture — four new services

Keep the strict layering. These are added rather than grown into `task.service.ts`,
which is already at capacity with collection concerns.

| File | Responsibility |
|---|---|
| `services/execution.service.ts` | **Deterministic engine.** The only thing that mutates step state. Advance / unblock / terminate / complete. Zero LLM, zero I/O beyond the model. |
| `services/approval.service.ts` | Token issue + verify, approver-view assembly, decision intake |
| `services/notification.service.ts` | Composes emails from step + task data, calls the mailer |
| `services/mailer/` | `IMailer` interface + `smtp.mailer.ts` + `console.mailer.ts` — mirrors the existing `IVectorStore` pluggable pattern exactly |

**Why the engine is a separate service:** it is the piece the proposal stakes its
credibility on — *"the AI compiles and interprets, the program executes"*
(Proposal §4). Making it a pure, injectable, unit-testable service with no I/O is worth
the extra file. It should be callable as `advance(task) → task` and fully testable with
`node:test` against the two fixtures, with no Mongo and no network.

---

## 3. The execution engine core loop

One function, called after every state change:

```
advance(task):
  1. for each step in `pending_approval` — leave alone (waiting on a human)

  2. for each `blocked` step:
       all depends_on satisfied?
         (dep.step_id has outcome === dep.required_outcome)
       → yes: state = ready

  3. for each `ready` step:
       → dispatch: issue token, send email, state = pending_approval

  4. completion check:
       evaluate workflow.completion.rule against required_steps
       → all satisfied: status = completed, run completion.actions

  5. termination:
       any step with outcome=rejected and action=terminate_workflow
       → status = rejected; all non-terminal steps → skipped
```

**Parallelism falls out for free.** Step 2 makes every step whose dependencies are
satisfied `ready` in the same pass, so two independent steps both dispatch. Proposal
Scenario B (hall booking and outsider access in parallel, refreshments gated on the hall)
works with no additional code. Worth demonstrating explicitly — it is a headline claim.

---

### 3.1 The outcome → action dispatch

When an approver clicks Approve or Reject, **the engine does not reason about what to do
next — it reads it** from the step's own `outcomes` block. This is the single most
important property of this slice, and the reason an administrator can change the rule in
plain English without a code change.

From `it_faculty_overseas_leave.json`, every approval step already carries:

```json
"outcomes": {
  "approved":  { "action": "continue",           "notify": [] },
  "rejected":  { "action": "terminate_workflow",
                 "include_reason": true,
                 "notify": [requester] },
  "request_more_info": { "action": "reopen_input",
                         "return_to_step": "self",
                         "prompt_source": "approver_message" }
}
```

So the intake path is a lookup, not a judgment:

```
decision arrives
  → step.outcome       = "approved" | "rejected" | "request_more_info"
    step.reason        = <approver's text>
    step.responded_at  = now
    step.token_used_at = now

  → action = workflow.steps[step_id].outcomes[outcome].action

      "continue"           → advance(task)          // §3.2
      "terminate_workflow" → terminate(task, reason) // §3.3
      "reopen_input"       → reopen(task, step, reason) // §8
```

| `action` | Engine behaviour | Declared where |
|---|---|---|
| `continue` | Re-run the unblock pass; successors may become `ready` | `outcomes.approved.action` |
| `terminate_workflow` | Task → `rejected`, remaining steps → `skipped`, reason propagates | `outcomes.rejected.action` |
| `reopen_input` | Step back to `ready`, new requirement raised for the requester | `outcomes.request_more_info.action` |

A workflow whose rejection routes to an appeals step instead of terminating simply carries
a different `action`. **The same engine handles it with no new code** — which is the
claim Proposal §4 makes about the platform generalising across institutions.

---

### 3.2 What `continue` actually does

It does **not** jump to a hardcoded next step. It re-runs the unblock pass in §3 step 2:

```
for each blocked step:
    every dep satisfied?  dep.step_id.outcome === dep.required_outcome
    → ready → dispatch
```

`hod_review` declares `depends_on: [{ step_id: "advisor_review", required_outcome:
"approved" }]`, so the HoD is notified **only** on the literal value `"approved"`.
Nothing in the engine special-cases the advisor: the same three lines drive
dean-after-HoD, and drive Scenario B's parallel branches.

---

### 3.3 What `terminate_workflow` does

Three things, in one atomic write:

1. `task.status` → `rejected`
2. Every non-terminal step → `skipped` — **the HoD's email is never sent.** That is the
   entire point: a rejected request must not continue soliciting approvals.
3. The rejecting step's `reason` propagates to the requester, per
   `outcomes.rejected.notify: [requester]` and `include_reason: true`.

The reason is stored on the step that produced it and surfaced through
`GET /tasks/:id/status` (§5):

```json
{
  "status": "rejected",
  "rejected_at_step": "Advisor Review",
  "rejected_by": "Dr. Perera",
  "reason": "Cannot approve leave 12–20 Aug — final exams are scheduled that week.",
  "timeline": [ ... ]
}
```

The requester sees **who** rejected it, **at which step**, and **why**, in the approver's
own words.

---

### 3.4 Reason enforcement is a hard gate

`include_reason: true` is the schema declaring the reason mandatory. The engine must
**refuse the decision** rather than store an empty string:

```
POST /approvals/:token/decision
  { "outcome": "rejected" }                 → 400  reason required
  { "outcome": "rejected", "reason": "" }   → 400  reason required
  { "outcome": "rejected", "reason": "  " } → 400  reason required (trimmed)
  { "outcome": "rejected", "reason": "…" }  → 200
```

The same gate applies to `request_more_info`, where the reason **is** the question put to
the requester. Implement as a `ValidationError` in `approval.controller.ts`, driven by
`outcomes[outcome].include_reason` — not hardcoded per outcome name.

A rejection with no reason is unusable to the requester and silently breaks the audit
trail promised in Proposal §5.

---

### 3.5 `rejected` vs `request_more_info` — the distinction that matters most

These are **different outcomes with opposite consequences**, and conflating them is the
most likely failure mode in a live demo:

| Approver says | Correct outcome | Consequence |
|---|---|---|
| "Cannot approve — final exams that week" | `rejected` | Substantive refusal. Workflow **terminates**. |
| "Need the HoD's signature before mine" | `request_more_info` | Not a refusal — a missing prerequisite. Workflow **survives**. |

From the approver's seat both feel like *"I'm not signing this yet"* — but recording the
second as `rejected` kills a request that was merely incomplete, forcing the requester to
start over. Two mitigations, both worth building:

1. **Label buttons by consequence, not by verb.** "Reject (ends this request)" versus
   "Request more information (sends it back to the requester)". Cheap, and the single
   most effective fix.
2. **Optional LLM assist.** If the approver picks Reject but the reason text reads like a
   prerequisite, offer *"did you mean request more information?"* — a **suggestion the
   approver can dismiss, never an override.**

This is the one place in this slice where a model earns its keep, and it stays on the
right side of the architectural line:

> **The human picks the outcome, the engine executes it, and AI only helps the human pick
> correctly.**

---

## 4. Approval tokens

**Decision for the PoC: HMAC-signed stateless tokens, with single-use tracking stored on
the step.**

```
payload = base64url(taskId.stepId.nonce)
token   = payload + "." + HMAC-SHA256(payload, APPROVAL_TOKEN_SECRET)
```

Uses `node:crypto` — no new dependency. The nonce and `used_at` are stored on the step so
a replayed token is rejected. Include `expires_at` (default 14 days).

This delivers most of what the proposal defers to Phase 2 ("cryptographically signed,
single-use approval links") for roughly forty lines of code, so there is little reason to
ship the weaker demo-grade version.

### Extensions to `TaskStepState`

```ts
approval_token: string | null;        // exists, currently always null
token_expires_at: Date | null;        // new
token_used_at: Date | null;           // new
notified_at: Date | null;             // new
```

---

## 5. New endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/tasks/:id/start` | requester | `ready` → `in_progress`; engine dispatches the first step(s) |
| `GET` | `/approvals/:token` | token | Approver view — request data, requester info, instructions, prior decisions |
| `POST` | `/approvals/:token/decision` | token | `{ outcome, reason?, response_fields? }` |
| `GET` | `/tasks/:id/status` | requester | Timeline: current step, who is holding it, **rejection reason** |
| `POST` | `/tasks/:id/values` | requester | *(reuse)* answers a reopened `request_more_info` requirement |

**Validation rule that matters:** `reason` is **required** when `outcome === "rejected"`,
and also when `outcome === "request_more_info"` (there it is the question put to the
student). Enforce in the controller as a `ValidationError` → 400. This is precisely the
"cannot grant leave during exam week" case.

`/approvals/*` lives in its own `approval.route.ts` / `approval.controller.ts`, **not**
under `/tasks` — different auth model (token, not session) and a different consumer.

---

## 6. The approver page payload

`GET /approvals/:token` assembles everything server-side so the frontend stays dumb:

```json
{
  "task_reference": "TASK-2026-00042",
  "workflow_title": "IT Faculty Overseas Leave",
  "step": {
    "name": "Advisor Review",
    "instructions_to_approver": "...",
    "response_fields": []
  },
  "approver": { "name": "...", "email": "..." },
  "requester_answers": [ { "label": "Destination", "value": "Singapore" } ],
  "computed": [ { "label": "Duration", "value": "45 days" } ],
  "prior_decisions": [
    { "step": "Advisor Review", "outcome": "approved", "reason": "...", "at": "..." }
  ],
  "allowed_outcomes": ["approved", "rejected", "request_more_info"],
  "already_decided": false
}
```

Three details that matter:

- **`requester_answers`** maps `task.values` through `workflow.inputs[].label`. Raw
  requirement keys are unreadable; labels are what the advisor actually needs to decide.
- **`allowed_outcomes`** is derived from which `outcomes.*` are non-null on that step.
  Do not hardcode three buttons — a step may legitimately not offer
  `request_more_info`.
- **`already_decided`** lets a re-clicked email link render "already approved on 12 Aug"
  instead of a 500. Approval links get clicked twice; this is not an edge case.

---

## 7. Email and SMTP

**For the PoC, do not run an SMTP server.** Use a provider's SMTP relay via
`nodemailer` — one dependency, swappable behind `IMailer`.

Recommended path, in order:

1. **Development — `console.mailer.ts`.** Logs the email and the approval URL to stdout.
   Zero config; the entire flow is clickable before any provider account exists. Default
   when `MAIL_TRANSPORT=console`.
2. **Demo — Resend or Brevo.** Resend: 3,000/month free, clean API, plain SMTP at
   `smtp.resend.com:587` so `nodemailer` covers both paths. Brevo: 300/day with no domain
   verification, easier if no domain is owned yet.
3. **Avoid Gmail SMTP** — app passwords, rate limits, and approval links will land in
   spam.

**Deliverability caveat, worth knowing now rather than at rehearsal:** without a verified
sending domain (SPF/DKIM), approval emails to real university addresses will very likely
be filtered as spam. Either verify a cheap domain, or demo with the console mailer plus a
couple of controlled test inboxes.

### New environment variables

```
MAIL_TRANSPORT=console                  # console | smtp
MAIL_FROM="Unblock AI <noreply@yourdomain>"
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
APP_PUBLIC_URL=http://localhost:3001    # base for approval links
APPROVAL_TOKEN_SECRET=
APPROVAL_TOKEN_TTL_DAYS=14
```

Add `config/mail.config.ts` following the existing per-concern config pattern, registered
in `config/index.config.ts`. `env.config.ts` remains the only reader of `process.env`.

### Why not MCP or agent-mediated email

Recorded so it is not re-litigated. The system already uses agents
(`selector.service.ts`, extraction), so routing email through an MCP email server is a
natural question. It is the wrong layer.

MCP exists to give **an LLM** tools to call — it is built for a model deciding *whether*
and *what* to send. The engine already knows both: the recipient comes from
`steps[].assignee`, the trigger from the dependency graph. No decision remains for a
model to make. Sending an approval email is not a judgment; it is a deterministic side
effect of a state transition.

| Property required | SMTP behind `IMailer` | MCP / agent-mediated |
|---|---|---|
| Deterministic — identical every run | Yes | Model-mediated |
| Synchronous success/failure to set `notified_at` | Yes | Awkward |
| Auditable "sent at T to X" | Direct | Indirect |
| Retryable on failure | Standard | Ad hoc |
| Costs no LLM tokens | Yes | Tokens per email |
| Testable in `node:test`, no network | Trivial fake | Needs a harness |

The last row governs the build order: Phase 3 delivers a clickable flow with no provider
account, which behind `IMailer` is a ten-line console class.

There is also an audit point: an approval email **is** the record of a step dispatch.
Proposal §5 promises "an immutable audit log of every input and decision". A
deterministic call yields an exact log line; a model-mediated one yields a log line plus
an assumption.

This is not a quality judgment on MCP email servers — they are a good fit for
*interactive* agent use, where a human or model composes a one-off message. That is a
different job from a workflow engine firing templated notifications on state transitions.

**Where an agent does belong in this slice** (both language tasks, both optional polish):

- Phrasing the request-more-info question from `prompt_source: "approver_message"` (§8)
- Summarising collected values into a short brief above the raw field table on the
  approver page (§6)
- Suggesting `request_more_info` when a rejection reason reads like a prerequisite (§3.5)

All three generate content that feeds *into* the email. None of them send it.
**Agents write the words; the engine sends the mail.**

### One critical reliability rule

**Send email only after the DB write commits, never before.** If the send fails, the step
stays `pending_approval` with `notified_at: null`, and a retry endpoint or a simple sweep
can re-send. A failed SMTP call must never roll back a recorded approval decision.

---

## 8. The request-more-info loop

The fiddliest part, so it is spelled out. Proposal Scenario A, step 7. On
`request_more_info`:

1. Step state → `ready` (not approved, not rejected); record `reason` as the question.
2. Append a **new requirement** to `task.requirements` with `status: "pending"`, keyed
   `followup:<step_id>:<n>`, `label` = the approver's question.
3. Task status returns to a collecting state so `GET /tasks/:id/next` surfaces it.
4. The student answers via the **existing** `POST /tasks/:id/values` — no new endpoint.
5. When no pending requirements remain, the engine re-dispatches that step with a
   **fresh token** (invalidating the old one) and the new answer included in context.

Reusing the existing requirement/value machinery is what makes this cheap. The schema's
`prompt_source: "approver_message"` is the hook for generating the question text; an LLM
call to phrase it naturally is optional polish, as the raw approver text works.

**Guard against loops:** cap re-info cycles per step (suggested: 3), or an approver and a
requester can ping-pong indefinitely.

---

## 9. Build order

| Phase | Work | Why in this position |
|---|---|---|
| 1 | Extend `TaskStepState` fields, `mail.config.ts`, token util + tests | Pure, no dependencies, unblocks everything |
| 2 | `execution.service.ts` + unit tests against both fixtures | Riskiest logic, and testable with zero I/O |
| 3 | `IMailer` + console mailer, `notification.service.ts` | Full flow clickable from logs, no provider account needed |
| 4 | `approval.service.ts`, `/approvals` routes, `POST /tasks/:id/start` | End-to-end via Postman |
| 5 | SMTP mailer + provider account | Swaps one binding in `server.ts` |
| 6 | Request-more-info loop | Builds on a working happy path |
| 7 | `GET /tasks/:id/status`, frontend approver page and student status view | |

**Phases 1–4 give a demonstrable end-to-end flow with no external accounts at all.**

Verification after every phase, per existing house rule:
`npm run typecheck && npm test` must pass.

---

## 10. Two decisions to settle before coding

### Approver identity

[overview.md](overview.md) flags this correctly: `actor:*` requirements are filled with
**requester-supplied** name and email. A student types in who their advisor is, and the
system then emails a token granting approval authority to whatever address was typed.

For a PoC demo that is defensible, but a `mock-directory.service.ts` (a seeded JSON of
roles → people) is worth adding **even for the PoC**. It is small, it closes the trust
hole, and it makes Proposal Scenario A step 3 — *"resolves the current Academic Advisor
and Head of Department from HR data"* — actually true in the demo rather than narrated
over. The proposal explicitly promises HR resolution; the demo is stronger with it.

### Malformed-id handling on token routes

Known rough edge, currently affecting `/drafts/:id*`, `/selection/sessions/:id*` and
`/tasks/:id*`: malformed ObjectIds fail inside the Mongo driver and surface as **500
`DATABASE_ERROR`** rather than 400/404.

Approval links are pasted out of email clients and **will** arrive mangled or
line-wrapped. Validate token format before any DB call so `/approvals/:token` returns a
clean 400/404. Fixing the shared `object-id.util.ts` path at the same time is cheap.

---

## 11. Traceability to the proposal

| Proposal claim | Covered by |
|---|---|
| §4 "Execution Engine — deterministic program logic decides what happens next" | §3 execution engine, LLM-free by construction |
| §4 "Adaptation Logic — inserts a new information-gathering step into the live task" | §8 request-more-info loop |
| §6 Scenario A step 6 — email with a secure approval link | §4 tokens, §7 mailer |
| §6 Scenario A step 7 — request more information, no restart | §8 |
| §6 Scenario B — parallel and gated sub-approvals | §3 step 2, no extra code |
| §8 Phase 2 — "cryptographically signed, single-use approval links" | §4, pulled forward into the PoC |
| §9 "real-time visibility into where a request stands" | §5 `GET /tasks/:id/status` |
