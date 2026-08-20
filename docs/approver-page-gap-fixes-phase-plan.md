# Approver Page — Gap Fixes Phase Plan

Execution plan for the defects found in the shipped approver page
(`/approvals/[token]`), plus the four UX changes requested after seeing it live.

**Baseline verified before writing this plan** (read, not assumed):
Next **16.3.0** / React 19, `strict: true`, path alias `@/*` → `./src/*`.
`unblock-ai-web/package.json` has **no test runner and no typecheck script** — only
`dev`, `build`, `start`, `lint`. That shapes the gate in §0.4.

Unlike [web-task-approval-phase-plan.md](web-task-approval-phase-plan.md), which was
**web-only**, this plan **requires backend changes**. Two of the requested fixes cannot be
done in the frontend at all, because the data needed is not on the wire (§0.1).

---

## 0. Findings that shape this plan

All confirmed by reading source. Read this section — three of them contradict the
obvious approach.

### Finding 1 — `[object Object]` cannot be fixed in the frontend

The `[object Object]` rows in the screenshot come from one line:

```ts
// approval.service.ts:61-64
const requesterAnswers = Object.entries(task.values).map(([key, value]) => {
  const input = workflow.inputs.find((i) => i.id === key);
  return { label: input?.label ?? key, value: value === null ? "" : String(value) };
});
```

Two independent bugs are stacked here, and **both are server-side**:

1. **`String(value)` on a `PersonValue`** → `"[object Object]"`. `task.values` is
   `Record<string, RequirementValue>` where `RequirementValue = string | number | boolean |
   PersonValue | null` (`requirement.type.ts`). The `actor:*` keys hold `PersonValue`
   objects (`{name, email}`), and `String({})` is `"[object Object]"`.
2. **`workflow.inputs.find(...)` never matches an `actor:*` key.** Actor requirements are
   built from *steps*, not inputs (`requirement-builder.util.ts:38`, key = `actor:${step.id}`).
   So the lookup misses, `label` falls back to the raw key, and the approver sees the
   internal string `actor:advisor_review`.

The previous plan (§3.3) proposed filtering these rows out client-side. **That was the
wrong call and it was never implemented anyway.** Filtering hides the approver list — but
the approver list is exactly what the user now wants *shown*. Fix it at the source instead.

> **Consequence: the `[object Object]` fix and the "show approvers with designation +
> pending status" feature are the same change, not two.** Do them in one phase (Phase 1).

### Finding 2 — the label the user wants already exists, but is on the *requirement*, not the input

`buildActorRequirements` already computes a human label and stores it on the requirement:

```ts
// requirement-builder.util.ts:41
const label = step.assignee.role ? titleCaseRole(step.assignee.role) : step.name;
```

For `role: "academic_advisor"` this yields **"Academic Advisor"** — precisely the
"designation" the user asked for. It is written to `TaskRequirement.label` at task-creation
time and persisted on the task document.

**So Phase 1 does not need to invent labels or re-derive them from the workflow.** It reads
`task.requirements` (already on `TaskDocument`) instead of `workflow.inputs`. This also
fixes the *input* rows for free, since input requirements carry their label the same way.

### Finding 3 — "pending" must be derived from step state, and the obvious source is wrong

The user wants approvers who have not yet decided marked **Pending**. The tempting source is
`step.assignee`, but that is unreliable:

`buildActorRequirements` **dedupes** actors by `role|relative_to`
(`requirement-builder.util.ts:35-36`) — if two steps share a role, only **one** requirement
is created, keyed to the *first* step's id. Then `attachAssignees` matches
`requirement.ref === step.step_id` (`task.service.ts:304`), so the **second** step never
matches and keeps `assignee: null` — even though the requester did supply that person.

> **Therefore: build the approver list from `task.requirements` (source `actor`) joined to
> `task.steps`, and treat a missing/`null` assignee as "not yet supplied" rather than
> assuming `step.assignee` is populated.** Never drive this list off `step.assignee` alone.

Status per approver comes from the step's `outcome` / `state`, which *is* authoritative:
`outcome === "approved" | "rejected" | "request_more_info"`, else `state ===
"pending_approval"` → awaiting, else → not yet reached.

### Finding 4 — the 409 terminal-state gap is real and still open

`submitDecision` enforces expiry, token reuse, and `state !== pending_approval` as **409**
(`approval.service.ts:99-114`), while `getApproverView` checks **none** of them
(`:185-198`). So an approver can open an expired link, read a fully actionable page, decide,
press Approve — and only then hit the failure.

The previous plan (§3.4) required replacing the form with a terminal panel on a 409. **This
was specified but not implemented.** `ApproverView.tsx:50-51` sets an inline `error` string
and leaves both buttons enabled, so the approver can keep re-clicking a dead token. Phase 3
closes this.

---

## 0.1 What is server-side vs client-side

| Requested change | Where it lives |
|---|---|
| `[object Object]` → real names | **API** — `String(PersonValue)` (Finding 1) |
| `actor:advisor_review` → "Academic Advisor" | **API** — label lookup misses (Finding 1/2) |
| Show other approvers + "Pending" | **API** (new DTO field) + **Web** (render) |
| Remove always-on reason box → reason modal on Reject | **API** (`include_reason` on DTO) + **Web** (dialog) |
| 409 → terminal state | **Web only** |
| Missing `layout.tsx` / `loading.tsx` | **Web only** |
| DB-level idempotency | **API only** |

## 0.2 Contract discipline

`unblock-ai-web/src/types/approval.ts` is a **hand-maintained mirror** of
`unblock-ai-api/src/lib/types/approval/approval.type.ts` — its own header says so, and there
is no codegen. A drifted contract yields `undefined` at runtime with **no compile error**.

> **Rule for every phase below: if the DTO changes, change both files in the same commit.**

## 0.3 Ordering rationale

Phase 1 is first because it is the only phase the user can *see* is fixed from the
screenshot, and because **both Phase 2 and Phase 3 consume DTO fields that Phase 1 adds** —
`approvers` (§1.3) and `outcomes` (§1.4) respectively. Phases 2 and 3 are independent of
each other. Phases 4 and 5 depend on nothing and may be done at any point, including first
if a quick win is wanted.

## 0.4 Verification gate (no test runner exists)

Per phase, minimum bar:

1. `cd unblock-ai-api && npm run build` — must pass (API phases).
2. `cd unblock-ai-web && npx tsc --noEmit` — must pass. There is no `typecheck` script;
   invoke `tsc` directly.
3. `cd unblock-ai-web && npm run lint` — must pass.
4. **Manual walkthrough** of the live page against the checklist stated in that phase.

Manual is the only functional coverage available. Phase 6 optionally fixes that.

---

## Phase 1 — Fix `requester_answers` and add a real approver list *(API)*

**Fixes:** `[object Object]`, `actor:advisor_review`, and supplies the data Phase 2 renders.

### 1.1 Format values by type, not by `String()`

New util `unblock-ai-api/src/utils/approval/answer-format.util.ts`:

```ts
import type { RequirementValue } from "../../lib/types/task/requirement.type.js";

export function formatRequirementValue(value: RequirementValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && "name" in value && "email" in value) {
    return `${value.name} (${value.email})`;
  }
  return String(value);
}
```

The `"name" in value && "email" in value` shape check mirrors the one already used in
`task.service.ts:310` — same guard, so behaviour stays consistent.

### 1.2 Label from `task.requirements`, not `workflow.inputs`

In `getApproverView` (`approval.service.ts:61-64`), replace the `workflow.inputs` lookup
with a `task.requirements` lookup keyed on `requirement.key`, falling back to the
workflow-input label, then to the raw key. Reading requirements fixes **both** the
`actor:*` labels and the input labels through one path (Finding 2).

Keep the `actor:*` entries **out** of `requester_answers` — they are not answers to
questions, they are the routing list, and they get their own section in §1.3. So
`requester_answers` becomes input-source requirements only. This is what makes the
screenshot's bottom two rows disappear from "Request details".

### 1.3 New DTO field: `approvers`

Add to `ApproverViewDto` (and mirror in web, per §0.2):

```ts
approvers: Array<{
  step_id: string;
  designation: string;          // "Academic Advisor" — TaskRequirement.label
  name: string | null;          // null when not yet supplied
  email: string | null;
  status: "approved" | "rejected" | "request_more_info" | "awaiting" | "not_yet_reached";
  is_current: boolean;          // this is the step the viewer is deciding
  decided_at: Date | null;
}>
```

Built by joining `task.requirements.filter(r => r.source === "actor")` to `task.steps` on
`requirement.ref === step.step_id`, per Finding 3. Status derivation:

- `step.outcome !== null` → that outcome
- `step.state === "pending_approval"` → `"awaiting"`
- otherwise → `"not_yet_reached"` (covers `blocked`, `ready`, `skipped`)

Order the list by workflow step order (`workflow.steps` index), so the approver sees the
chain in the sequence it actually runs — not `Object.entries` insertion order.

> **Do not leak the other approvers' tokens.** Only the fields listed above. The current
> viewer's token is already in their URL; nobody else's belongs in this payload.

### 1.4 New DTO field: `outcomes` (decided — drives Phase 3's modal)

**This was an open question; it is now settled: server-driven.** Add alongside the existing
`allowed_outcomes`:

```ts
outcomes: Array<{
  outcome: StepOutcomeResult;
  include_reason: boolean;
}>
```

Sourced from `workflowStep.outcomes[key].include_reason` for each non-null outcome — the
same `StepOutcome` records `submitDecision` already validates against
(`approval.service.ts:120-122`). Note `include_reason` is typed `boolean | null`
(`step.type.ts`); coerce `null` → `false` so the client sees a plain boolean.

This is what lets Phase 3 open the reason modal on exactly the outcomes the server would
reject without a reason, rather than guessing from `outcome === "rejected"`.

`allowed_outcomes` stays as-is — Phase 2/3 keep rendering buttons from it, and removing it
would be a breaking change for no gain. `outcomes` is strictly additive.

**Deliverables:** `answer-format.util.ts`; `approval.service.ts` `getApproverView` rewrite
(§1.1–1.4); `approval.type.ts` + `types/approval.ts` updated together (§0.2).

**Verify:** API builds. Hit `GET /api/approvals/:token` for a live two-approver task —
no `[object Object]`, no `actor:` prefix anywhere, `approvers` has one entry per actor
requirement with correct statuses.

---

## Phase 2 — Render the approver list *(Web)*

**Depends on Phase 1.** Consumes `view.approvers`.

New `unblock-ai-web/src/components/approvals/ApproverList.tsx` — a section rendered
between "Request details" and the decision card in `ApproverView.tsx`:

- One row per approver: **designation** as the primary label ("Academic Advisor"), name +
  email as secondary text, status as a `Badge`.
- Reuse the existing `Badge` tones already imported by `ApproverView.tsx`:
  `approved` → `success`, `rejected` → `danger`, `request_more_info` → `warn`,
  `awaiting`/`not_yet_reached` → neutral. Add a neutral tone if `Badge` lacks one — check
  `components/ui/Badge.tsx` before assuming.
- Status copy: **"Pending"** for both `awaiting` and `not_yet_reached` — the user asked for
  "Pending", and the internal distinction between "email sent" and "blocked upstream" is not
  meaningful to an external advisor. Keep the two states distinct in the DTO (they are
  genuinely different, and useful in the portal) but collapse them in *this* view.
- Mark the current viewer's row — e.g. append "(you)" where `is_current` — so the advisor
  can locate themselves in the chain.
- `name === null` → render "Not yet provided" rather than an empty cell.

Guard the whole section with `view.approvers.length > 0 &&`, matching the existing defensive
pattern used for `computed` and `prior_decisions`.

**Verify:** `tsc --noEmit` + `lint` pass. On a two-approver task where only the advisor has
been emailed, the advisor's page shows themselves plus the HOD marked **Pending**.

---

## Phase 3 — Decision UX: reason-on-reject, and 409 as terminal *(Web)*

Two changes to `ApproverView.tsx`, both confined to the `else` branch at `:133-164`.

### 3.1 Reason moves into a confirmation modal

Delete the unconditional `<label>` + `<textarea>` (`:135-145`) — the reason box must not be
on screen during normal reading. Replace it with a **modal confirmation dialog**:

- **Default:** just the outcome buttons from `view.allowed_outcomes`.
- **Clicking an outcome that needs a reason** does **not** submit. It opens a dialog
  containing the reason textarea, a confirm button, and Cancel. Submission happens only on
  confirm; Cancel closes and records nothing.
- **Outcomes that need no reason** (typically Approve) submit immediately, as today.

**A modal, not an inline reveal.** Rejecting is the consequential, irreversible action here,
so it deserves a deliberate confirm step rather than a textarea that quietly appears in the
card and can be tabbed past. It also avoids the layout shift of growing the decision card.

**Which outcomes open the dialog is server-driven** — read `include_reason` from the
`outcomes` field added in §1.4, never `outcome === "rejected"`. `StepOutcome.include_reason`
is per-outcome *and* per-step (`step.type.ts`), so a step configured to require a reason on
**approval** must open the dialog too. Hardcoding "reject" would silently disagree with the
server on exactly those steps.

Inside the dialog, when `include_reason` is true: disable confirm while the textarea is
empty/whitespace and show a short hint. The server check
(`approval.service.ts:120-122`) stays the real gate — this only prevents the approver being
told "no" *after* they have committed to a decision.

Dialog requirements — check `components/ui/` for an existing modal/dialog before building
one; if none exists, a `<dialog>` element is sufficient and gives focus trapping and Esc
for free:

- Title naming the action ("Reject this request").
- Esc and Cancel both close without submitting.
- Focus moves to the textarea on open and returns to the triggering button on close.
- Confirm shows the in-flight state (existing `pendingOutcome` handles this).

State: replace the single `reason` string with `{ pendingConfirm: StepOutcomeResult | null }`
plus the existing `reason`, and clear `reason` on cancel so a dismissed rejection does not
leak text into a later action.

### 3.2 Treat 409 as terminal (Finding 4)

In `submit()`'s `catch` (`:50-51`), branch on `err.status`:

- **409** → set a terminal state (`setBlocked({message})`) that replaces the entire decision
  card with a panel: what happened, and that no action was recorded. **Buttons must not
  remain live.** Reuse the `alreadyDecided` panel shape at `:115-132` — this is a third
  variant of "no longer actionable", alongside `result` and `view.already_decided`.
- **400** → keep as an inline, recoverable form error (this is the missing-reason case; the
  approver can fix it and retry).
- **anything else** → existing generic inline message.

**Verify:** `tsc --noEmit` + `lint`. Manually: (1) Approve submits with no reason box ever
appearing; (2) Reject opens the dialog, confirm is disabled until text is entered, and
Cancel/Esc close it without recording anything; (3) reopening the dialog after a cancel
shows an empty box, not the abandoned text; (4) a deliberately expired/reused token produces
the terminal panel with **no clickable buttons left**.

---

## Phase 4 — Route shell: `layout.tsx` and `loading.tsx` *(Web)*

Two files, no logic.

### 4.1 `src/app/approvals/layout.tsx`

The root layout (`app/layout.tsx`) only sets the font CSS *variables* on `<html>`; it never
applies a `font-family` to `body`. `/portal` compensates with its own
`font-portal` wrapper (`app/portal/layout.tsx`). `/approvals` has **no layout at all**, so
the one page an external advisor ever sees renders in the browser default font.

Mirror the portal layout — a wrapper applying `font-portal min-h-screen`. Deliberately
**no nav shell**: the approver holds a token, not a session, and must not be shown
navigation implying an account. This is the same reasoning already recorded in the
comment at the top of `approvals/[token]/page.tsx`.

Placing it at `approvals/layout.tsx` (not `approvals/[token]/layout.tsx`) means the
`not-found.tsx` boundary inherits it too.

### 4.2 `src/app/approvals/[token]/loading.tsx`

`page.tsx` is `dynamic = "force-dynamic"` and awaits `approvalsApi.getView` before returning
any markup, so a slow API shows a blank page. Next 16's `loading.js` convention wraps the
segment in a Suspense boundary and renders the fallback immediately — confirmed against the
bundled docs at
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`.

A light skeleton echoing the real layout (title bar, two cards) is enough. Do not fetch in it.

**Verify:** page renders in the app font, matching `/portal`; throttled network shows the
skeleton, not a blank screen.

---

## Phase 5 — Close the decision race at the database *(API)*

Today's double-submit protection is a **check-then-write across an await boundary**:
`submitDecision` reads `step.token_used_at` (`:99`), then `updateStepAndStatus` issues a
plain `updateOne` matching only `_id` (`task.model.ts:132-147`) with no guard on the step's
state. Two near-simultaneous clicks can both pass the in-memory check before either write
lands — both then mint and dispatch next-step tokens, so the *next* approver gets two
emails and the audit log gains two `decision_recorded` entries.

Narrow window, real consequence. Fix by making the write conditional:

- Add a model method that filters on the step still being unused, e.g.
  `{ _id, steps: { $elemMatch: { step_id, token_used_at: null } } }`, and check
  `matchedCount === 0` → throw `ConflictError`.
- Call it from `submitDecision` in place of the unguarded update.

This keeps the existing 409 semantics — the loser of the race now gets the same
`ConflictError` the sequential path already produces, which Phase 3.2 renders as a terminal
panel. **Phases 3 and 5 therefore reinforce each other**, though neither requires the other.

Note the `reopen_input` path deliberately *clears* `token_used_at`
(`execution.service.ts`), which is what makes reopened steps actionable again (Finding 2 of
the earlier plan). The `token_used_at: null` filter is consistent with that — it is asking
"is this step currently actionable", which is exactly right.

**Verify:** API builds; a normal decision still succeeds; a replayed decision on a
used token returns 409.

---

## Phase 6 *(optional)* — Automated coverage

There is no test runner in `unblock-ai-web`, so everything above is gated on manual
walkthroughs. If this feature is going to keep changing, add Vitest and cover the pure logic
that now carries real branching:

- `formatRequirementValue` — person / boolean / number / null (Phase 1).
- The approver-list join and status derivation, incl. the deduped-actor case from Finding 3
  where a step legitimately has `assignee: null`.
- The 409-vs-400 branch in `submit()` (Phase 3.2).

The API side should be checked for an existing runner before adding a second one — do not
introduce a parallel toolchain.

---

## Summary

| Phase | Scope | Delivers |
|---|---|---|
| 1 | API | Real names + designations; new `approvers` + `outcomes` fields |
| 2 | Web | Approver list with **Pending** badges |
| 3 | Web | Reason **modal** on Reject; 409 becomes terminal |
| 4 | Web | `layout.tsx` (font) + `loading.tsx` (skeleton) |
| 5 | API | Atomic guard against double-submit |
| 6 | Both | *(optional)* automated coverage |

**Phase 1 gates both 2 and 3** (they consume `approvers` and `outcomes` respectively).
2 and 3 are independent of each other; 4 and 5 depend on nothing.

Phases 1–3 together resolve everything visible in the reported screenshot; 4 and 5 close the
two structural gaps from the earlier review that were specified but never implemented.
