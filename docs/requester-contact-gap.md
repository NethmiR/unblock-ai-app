# Requester Contact — A Gap to Handle Gracefully

An unresolved gap surfaced while implementing Phase 3 of
[approval-execution-implementation-plan.md](approval-execution-implementation-plan.md):
**the system has no way to email the requester**, because nothing anywhere captures a
requester's email address.

**Status: resolved.** Closed by Option A, per
[requester-contact-implementation-plan.md](requester-contact-implementation-plan.md) — every
workflow now declares a `requester_email` input, extracted and verified against Azure
(that plan's Phase 4). This document is kept for §2's analysis of *why* the gap existed
(one word doing two jobs), which is the reasoning that stops it recurring.

**Scope:** `unblock-ai-api/`. Affected three of the four notification paths in
`services/notification.service.ts`; all four now send for newly-extracted workflows (see
§5).

---

## 1. The gap in one line

[approval-execution-design.md](approval-execution-design.md) §3.3 and §7 both treat
"notify the requester" as a settled requirement — but no field in the workflow schema,
the task document, or the selection session holds a requester's email address.

The design doc says (§3.3):

> The rejecting step's `reason` propagates to the requester, per
> `outcomes.rejected.notify: [requester]` and `include_reason: true`.

And `it_faculty_overseas_leave.json` genuinely declares it:

```json
"rejected": {
  "action": "terminate_workflow",
  "notify": [{ "resolution": "requester", ... }],
  "include_reason": true
}
```

The *intent* is fully specified in data. The *address* does not exist.

---

## 2. Why it exists — a word doing two jobs

The word "requester" appears in two unrelated places, and they mean different things.
This is what let the gap hide in plain sight.

| Where | Shape | What it means |
|---|---|---|
| `inputs[].collected_from` | `{ resolution: "requester" }` | **"The requester types this value in."** A source of data. |
| `steps[].outcomes.*.notify[]` | `{ resolution: "requester" }` | **"Send this to the requester."** A destination for mail. |

Both are `Actor` objects with `resolution: "requester"`. The extraction prompt
(`data/prompts/extraction.prompt.ts`) defines that value as *"the person who started the
workflow"* — correct for the second use, but for the first it only marks **who supplies
the answer**, never **who they are**.

So a workflow can carry `notify: [requester]` on every rejection path while collecting
no contact details for that requester at all. Which is exactly what both fixtures do.

**Compare with approvers, which work correctly.** A step's `dynamic` assignee becomes an
`actor:*` requirement (`utils/task/requirement-builder.util.ts`), typed `person`, and the
requester types in `{ name, email }`. That value lands on `steps[].assignee` and is a
real, usable address — which is why `sendApprovalRequest` works today and the other three
methods do not.

> **Approver identity is collected. Requester identity is assumed.** The task-planner
> slice closed the first gap and did not open the second — it simply never needed it,
> because nothing sent mail until Phase 3.

### Confirmed by inspection

- Neither fixture declares an `email`-typed input. `requester.identifier_field` is
  `student_index_number` / `department_id` — an identifier, not a contact.
- `notify: Actor[]` exists in `lib/types/workflow/step.type.ts` and is read by **no code
  anywhere** in `src/`. It is declared intent awaiting a consumer.
- `TaskDocument` has `session_id`, but a selection session holds conversation state, not
  an identity.

---

## 3. How Phase 3 handled it before this closed

`services/notification.service.ts` looks for a genuine `email`-typed input requirement
and returns `false` when there isn't one:

```ts
private requesterEmail(task: TaskDocument): string | null {
  for (const requirement of task.requirements) {
    if (requirement.source !== "input" || requirement.type !== "email") continue;
    const value = task.values[requirement.key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}
```

`sendRejectionNotice`, `sendCompletionNotice`, and `sendMoreInfoNotice` each check it
first and return `false` without sending. `sendApprovalRequest` is unaffected — it uses
`step.assignee.email`, which is collected.

**Three properties make this the right holding position:**

1. **It never throws.** Identical to the contract every send already obeys (design §7):
   a failed send returns `false` and must never roll back a recorded approval decision.
   The caller uses the boolean only to decide whether to stamp `notified_at`.
2. **It never guesses.** An earlier draft scanned `task.values` for any `{name, email}`
   object. That is actively wrong — `actor:*` requirements store exactly that shape, so
   it would have mailed **an approver** a message addressed to the requester. Matching on
   `type === "email"` cannot collide with `type === "person"`.
3. **It is forward-compatible.** The moment any workflow declares an `email` input, this
   code starts working with no edit. `email` is already a valid `InputType` in
   `workflow.schema.json` and already has a validator in
   `utils/task/value-validator.util.ts` — the plumbing exists; only the declaration is
   missing.

**What was lost while this held:** a rejected requester was not emailed their rejection
reason. They could still see it via `GET /tasks/:id/status` (Phase 4), which is the
requester-facing surface the design doc leans on anyway. The demo degraded from "push" to
"pull", not to broken. Now that Option A has landed, this no-op path only fires for
workflows extracted before the change (see §5) — it remains correct, deliberate
compatibility behaviour rather than dead code.

---

## 4. How it was closed

Recommended, and implemented: **Option A.** It is the smallest change that makes the
declared intent true.

### Option A — declare a requester email input in the schema *(implemented)*

Teach the extractor to always emit a contact input, so every workflow collects it through
the existing chat loop:

```json
{
  "id": "requester_email",
  "label": "Your Email Address",
  "type": "email",
  "collected_from": { "resolution": "requester", ... },
  "required": true
}
```

| Touches | Change |
|---|---|
| `data/prompts/extraction.prompt.ts` | A rule: every workflow declares a requester contact input |
| `data/samples/expected/*.json` | Add the input to both fixtures |
| `tests/unit/utils/requirement-builder.util.test.ts` | Counts shift (7 inputs → 8) |
| `notification.service.ts` | **Nothing** — already reads it |

Delivered in [requester-contact-implementation-plan.md](requester-contact-implementation-plan.md),
Phases 1–4, verified against Azure on 2026-08-18.

**Why this one.** It reuses the collection loop wholesale. `GET /tasks/:id/next` already
walks requirements one at a time, `email` already validates, and the requester is already
answering questions in chat — one more question costs nothing. No new endpoint, no new
model field, no new service.

**The real cost is the fixtures.** Per [overview.md](overview.md), the two worked fixtures
serve three roles at once — few-shot prompt examples, validation fixtures, and live
extraction-accuracy gold data. Editing them means the extraction tests must still pass
against the edited gold. That is the work; the code change is trivial.

**Caveat worth stating:** a requester-typed address is self-asserted, exactly like the
approver addresses flagged in design §10. It is fine for a PoC and does not get worse —
but it is not identity.

### Option B — capture it on the selection session

Ask once at session start; carry it onto the task at `create()`.

Better if the same person files many requests, and it keeps contact data out of
per-workflow schemas. But it adds a field to `SelectionSessionDocument` **and**
`TaskDocument`, touches `selection.controller.ts`, and puts contact collection in a
different place from every other value — splitting one concern across two mechanisms.
Worth revisiting only if session-level identity is wanted for other reasons.

### Option C — a real identity/directory service

The correct long-term answer, and the one the proposal implies. Both this gap and the
approver-trust hole in design §10 dissolve at once: `resolution: "requester"` and
`resolution: "dynamic"` both resolve against a directory instead of being typed in.

Out of scope for the seven approval-execution phases, and explicitly excluded there
(`mock-directory.service.ts` is named as recommended but not scheduled).

### Not recommended

- **A placeholder/sentinel address.** Turns a visible no-op into invisible mail sent
  nowhere, and would need unwinding later.
- **Reusing an approver's address.** Mails the wrong human. Rejected above.
- **Blocking Phase 3 on it.** The mailer, templates, and three of four paths are correct
  and tested regardless.

---

## 5. Consequences — before and after Option A

| Path | Before | After Option A |
|---|---|---|
| Approval request → approver | **Works** | Works |
| Rejection notice → requester | No-op, `false` | **Works**, for workflows extracted after this change |
| Completion notice → requester | No-op, `false` | **Works**, for workflows extracted after this change |
| More-info notice → requester | No-op, `false` | **Works**, for workflows extracted after this change |

The Phase 6 request-more-info loop was the one that degraded most under the old no-op —
its whole premise is that an approver's question reaches the requester so they can answer
via `POST /tasks/:id/values`. That loop is now demonstrable end to end for newly-extracted
workflows.

**Stored workflows predating this change** — anything extracted or published before it
landed — still have no `requester_email` input, so they keep hitting the no-op path
described in §3. This is graceful degradation, not a bug, and needs no migration for a
PoC (see [requester-contact-implementation-plan.md](requester-contact-implementation-plan.md)
Risk 4).

Phase 4 of the approval-execution plan is unaffected either way: `GET /tasks/:id/status`
reads the reason off the step document and needs no email at all.

---

## 6. Outcome

1. **Option A shipped**, per
   [requester-contact-implementation-plan.md](requester-contact-implementation-plan.md) —
   outside the approval-execution plan, since it touched the schema, the extraction
   prompt, and the gold fixtures rather than the execution slice.
2. **[overview.md](overview.md) is updated** — the *Not built yet* list now notes that
   `requester_email` is collected the same self-asserted way as approver contacts, and
   Area G's notification note reflects that all four paths send for newly-extracted
   workflows.
3. **`notify: Actor[]` stays unread.** Generalising to arbitrary notify targets remains a
   separate design question; the requester is still the only target any fixture uses.
4. **Not closed by this:** identity verification. A requester-typed address is
   self-asserted, exactly like approver addresses (design §10). Only Option C
   (§4, out of scope) closes that.
