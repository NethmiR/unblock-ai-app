# Requester Contact — Implementation Plan (Option A)

Closes the gap recorded in [requester-contact-gap.md](requester-contact-gap.md): the system
has no way to email the requester, because nothing captures a requester's email address.

**Approach: Option A** — declare a `requester_email` input in the workflow schema output, so
every workflow collects it through the existing requirement/value chat loop.

**Target:** `unblock-ai-api/` only. No frontend work.

**Status of the surrounding slice:** all seven phases of
[approval-execution-implementation-plan.md](approval-execution-implementation-plan.md) are
implemented. Baseline verified before writing this plan: `npm run typecheck` clean,
`npm test` **236/236 passing**. This is a standalone change against a complete slice.

---

## 0. Two findings that shape this plan

Both were confirmed by inspecting the code, and both differ from the gap doc's framing.

### Finding 1 — the consuming code is already written *and already tested*

`notification.service.ts` needs **zero changes**. More than that:
`tests/unit/services/notification.service.test.ts:98` already proves the closed state works,
by hand-building a requirement and asserting a real send:

```ts
requirements: [{ key: "requester_email", source: "input", type: "email", ... }],
values: { requester_email: "student@example.com" },
```

Two consequences:

- **The field name is already decided.** Use `requester_email` exactly — a different id
  leaves that passing test asserting against a name no fixture produces.
- **The notification layer is not at risk in this change.** It is proven on both sides:
  present (line 98, sends) and absent (line 134, no-ops). Neither test needs editing.

### Finding 2 — the gap doc understates the test cost, and names the wrong file

> The gap doc says: *"`tests/unit/utils/requirement-builder.util.test.ts` — counts shift
> (7 inputs → 8)."*

That file does need updating, but it is **not** the file that matters. The real blast radius
is `tests/unit/services/task.service.test.ts:115`:

```ts
async function fillAllRequirements(service: TaskService, taskId: ObjectId): Promise<void> {
  const values: Record<string, unknown> = { full_name: "Jane Doe", /* …9 more… */ };
  for (const [key, value] of Object.entries(values)) await service.setValue(taskId, key, value);
}
```

`finalize()` throws `ValidationError` when **any** required requirement is unfilled. Adding a
required input to the fixture means this helper stops filling everything, so **every test
that calls `fillAllRequirements` then `finalize()` fails** — around ten of them, including
the Phase 6 reopen and re-finalize tests.

The fix is one line in the helper. But the failure presents as a wall of unrelated red across
the finalize, start, and reopen suites, which is alarming if unanticipated — exactly the
`ApiControllers` ripple pattern from the approval plan §4.6.

**Do the helper edit in the same commit as the fixture edit.** Never separately.

---

## 1. Ground rules

Carried from the existing codebase and the approval-execution plan §0.

| Rule | Consequence |
|---|---|
| Strict-mode schema discipline | Every property present, `additionalProperties: false`. Unused scalars `null`, unused arrays `[]` |
| The two fixtures serve **three** roles | Few-shot examples, validation fixtures, **and** live extraction gold data. All three must stay consistent |
| Tests are `node:test` via `tsx` | `npm test` runs `tests/unit/**` + `tests/integration/**`. `tests/live/**` is excluded (needs Azure) |
| `config/env.config.ts` is the only reader of `process.env` | Unchanged here — this plan adds no config |

**Verification after every phase:** `npm run typecheck && npm test` must pass.

---

## Phase 1 — The extraction prompt rule

Do the prompt **before** the fixtures. The fixtures are few-shot examples for this very
prompt; editing them first leaves a window where the model sees an example field it has no
instruction to emit.

### 1.1 `src/data/prompts/extraction.prompt.ts`

Add a rule to the `inputs` guidance (near the actor-resolution block, ~line 31–34):

> Every workflow must declare an input collecting the requester's own email address, so the
> system can notify them of the outcome. Use `id: "requester_email"`, `type: "email"`,
> `required: true`, `collected_from: { "resolution": "requester", … }`. Declare it **last**
> in the `inputs` array. This is required even when the source text does not explicitly ask
> for an email address.

Three details that matter:

- **`id` is fixed, not free.** `notification.service.ts` matches on `type === "email"`, so
  any id technically works — but the existing unit test pins `requester_email`, and a stable
  id keeps the two fixtures consistent with each other.
- **"Declare it last"** is load-bearing. `requirement-builder.util.ts` preserves declaration
  order, and `requirement-builder.util.test.ts:30` asserts the full ordered key list.
  Appending keeps that assertion a one-line append instead of a reshuffle.
- **"Even when the source text does not ask for it"** is the point of the rule. Note that
  all three input prose fixtures *already* say the requester is notified by email
  (`it_faculty_overseas_leave.txt:13`, `departmental_event_workshop.txt:11`,
  `lab_equipment_purchase_request.txt:11`). The rule makes the model emit the address that
  the prose already implies is needed — it is not inventing a requirement.

> **Checkpoint:** `npm run typecheck && npm test` — still 236/236. The prompt is not
> exercised by the offline suite, so nothing changes yet.

---

## Phase 2 — The gold fixtures

The real work of this plan, per the gap doc. Both files, identical shape.

### 2.1 `src/data/samples/expected/it_faculty_overseas_leave.json`

Append to `inputs` (after `travel_reason`), matching the strict-mode shape of its siblings
exactly — every property present, unused scalars `null`:

```json
{
  "id": "requester_email",
  "label": "Your Email Address",
  "description": "Email address for approval and outcome notifications.",
  "type": "email",
  "collected_from": {
    "resolution": "requester",
    "role": null,
    "relative_to": null,
    "directory_query": null,
    "fallback_role": null,
    "display_name": null
  },
  "required": true,
  "validation": {
    "min_length": null, "max_length": null,
    "min": null, "max": null,
    "not_before": null, "not_after": null,
    "not_before_field": null, "not_after_field": null,
    "pattern": null
  },
  "collection_hint": null
}
```

### 2.2 `src/data/samples/expected/departmental_event_workshop.json`

The same object, appended after `expected_attendance`. Identical field-for-field — this
fixture's requester is staff rather than a student, but the contact input does not vary.

### 2.3 What must **not** change

- **`requester.identifier_field`** stays `student_index_number` / `department_id`. An
  identifier is not a contact; conflating them is what created this gap
  ([requester-contact-gap.md](requester-contact-gap.md) §2).
- **`notify: Actor[]` stays unread.** Generalising to arbitrary notify targets is a separate
  design question. The requester is the only target any fixture uses.
- **No new `computed`, no new step, no `completion.actions` edit.**

> **Checkpoint:** `npm test` now **fails** — expected, and quantified in Phase 3. Do not
> stop here; Phases 2 and 3 are one commit.

---

## Phase 3 — Realign the tests

Four edits. All mechanical; none touch assertions about behaviour.

### 3.1 `tests/unit/services/task.service.test.ts` — the one that matters

Add one entry to `fillAllRequirements` (~line 116):

```ts
requester_email: "jane.doe@example.com",
```

This single line clears the ~10 cascading failures described in §0 Finding 2.

### 3.2 `tests/unit/utils/requirement-builder.util.test.ts`

| Line | Change |
|---|---|
| 6 | Test name: `7 input requirements` → `8 input requirements` |
| 13 | `assert.equal(inputs.length, 7)` → `8` |
| 17 | `[...Array(7).fill("input"), ...]` → `Array(8)` |
| 30 | Append `"requester_email"` to the end of the `inputKeys` list |
| 60 | Workshop fixture: `input` count `2` → `3` |

### 3.3 `tests/unit/services/notification.service.test.ts` — **no changes**

Stated explicitly so nobody edits it defensively. Per §0 Finding 1, both its relevant tests
stay correct:

- Line 98 (sends when a `requester_email` requirement is filled) — already passing, and now
  reflects the real fixture rather than a synthetic one.
- Line 134 (no-ops when no email requirement exists) — still valid. It builds its task from
  `baseTask()` with no requirements, so it continues to prove the graceful-degradation path
  for any workflow authored before this change.

That second test is worth keeping deliberately: **existing stored workflows in Mongo will not
have this input.** The no-op path is not dead code after this change — it is the compatibility
path (see §5).

### 3.4 `tests/live/extraction-accuracy.live.test.ts`

Line 11: `assert.equal(workflow.inputs.length, 7)` → `8`.

This file is excluded from `npm test` (needs Azure), so it will not go red locally. Edit it in
the same commit anyway — it is gold-data drift, and it is invisible until someone runs the
live suite.

> **Checkpoint:** `npm run typecheck && npm test` — back to green, at **236/236**. No test is
> added or removed by this plan; the count is unchanged.

**These four edits are sufficient — verified, not estimated.** The fixture change was applied
to a scratch copy and the suite run: it produced exactly 9 failures (6 in `task.service.test.ts`
from the `fillAllRequirements` cascade, 3 in `requirement-builder.util.test.ts`), and the four
edits above returned it to 236/236 with a clean typecheck. Two things this rules out:

- **No `metadata` edit is needed.** Neither fixture's `metadata` block carries an input count —
  it holds `created_from`, `source_text_hash`, `extraction_model`, `extraction_timestamp`,
  `confidence`, `ambiguities`, `unmapped_roles`, `review_status`. Nothing counts inputs.
- **No integration-test edit is needed.** `tests/integration/task.route.test.ts` stubs
  `TaskService` wholesale, so it never builds requirements from a fixture.

---

## Phase 4 — Live verification (requires Azure)

The offline suite cannot prove the thing this change is actually for: that the **model** emits
the new input. Phases 1–3 only prove the fixtures and consumers agree.

1. Run the live extraction suite against Azure.
2. Confirm both fixtures extract 8 and 3 inputs respectively, with `requester_email` present
   and typed `email`.
3. Run `tests/live/consistency.live.test.ts` — it extracts the same prose twice and compares.
   A newly-added prompt rule is exactly the kind of change that shows up as instability.

**If the model omits the field intermittently**, strengthen the Phase 1 wording rather than
adding a code-level backfill. A post-extraction "inject if missing" shim would make the
few-shot examples and the runtime output disagree, which is the failure mode the three-role
fixture discipline exists to prevent.

**Decide the threshold before running, not after.** "Intermittently" is otherwise judged
against whatever result you happen to get:

| Result over 5 runs per fixture | Verdict | Action |
|---|---|---|
| 5/5 emit `requester_email`, typed `email` | Pass | Land it |
| 3–4 of 5 | Prompt is too weak | Reword Phase 1 — make the rule its own bulleted line in the `inputs` guidance rather than prose, then re-run |
| 0–2 of 5 | Approach is not holding | **Stop.** Do not escalate wording a third time — reconsider Option B, and record why here |

Two runs are not a sample. The reason to fix a number now is that a 4/5 result is genuinely
ambiguous in the moment, and the tempting reading — "close enough, the fixtures are right" —
ships a workflow that silently fails to collect a contact address for one requester in five.

**Cap the rewording at two attempts.** If wording alone cannot get to 5/5, that is real
evidence about the approach, not a prompt-tuning puzzle. The shim stays rejected either way —
it is the one fix that breaks the three-role fixture discipline.

**Third prose fixture:** `lab_equipment_purchase_request.txt` has no `expected/` gold file, so
it needs no edit — but it is a useful manual check that the rule generalises beyond the two
worked examples.

### 4.1 Result — run against Azure on 2026-08-18

`npm run typecheck && npm test` stayed clean/236 before and after (prompt-only change).
`tests/live/extraction-accuracy.live.test.ts` and `tests/live/consistency.live.test.ts` both
passed against Azure.

A dedicated 5-run-per-fixture check (all three prose fixtures, including the ungoldened
`lab_equipment_purchase_request.txt`) was run twice:

| Attempt | Prompt wording | it_faculty | departmental_event | lab_equipment |
|---|---|---|---|---|
| 1 | Original §1.1 prose (`id`, `type`, `required: true`, `collected_from` folded into one sentence) | 2/5 | 4/5 | 3/5 |
| 2 | Reworded into a bulleted list, with `required: true` its own line calling out "not false" explicitly | 5/5 | 5/5 | 5/5 |

`id`, `type: "email"`, and array position were 5/5 compliant on **attempt 1 already** — the only
field that drifted was `required`, intermittently emitted as `false`. That's consistent with the
original wording burying `required: true` mid-sentence among four other clauses; the model
treated it as less binding than the id/type. This matches the plan's predicted 3–4-of-5 band
exactly: one reword closed it, no second attempt was needed.

`src/data/prompts/extraction.prompt.ts` §"Requester contact input — always required" now states
the five properties as a bulleted list instead of prose. Verdict: **Pass** — landed.

---

## Phase 5 — Docs

1. **[overview.md](overview.md)** — in *Not built yet*, remove requester notification from the
   gap list. The directory-resolution entry **stays**: this change does not close it (see §6).
   Area G's note that three of four notification paths no-op becomes stale — update it.
2. **[requester-contact-gap.md](requester-contact-gap.md)** — mark resolved, pointing at this
   plan. Keep the document: its §2 analysis of *why* the gap existed (one word doing two jobs)
   is the reasoning that stops it recurring.
3. **`unblock-ai-api/docs/api/api-documentation.md`** — no endpoint changes. If the doc shows
   a worked `POST /tasks/:id/values` sequence, it gains one more requirement.

### 5.1 Result

`api-documentation.md` was checked (§7 task endpoints, §11 postman flow): it describes the
`POST /tasks/:id/values` loop generically, keyed by `requirement.key`, with no hardcoded
input count or worked-example field list anywhere. Nothing to change there — confirmed, not
assumed.

`overview.md` §3 *Not built yet* and Area G's notification-paths note were updated in place
(not rewritten) to say `requester_email` is now collected the same self-asserted way as
approver contacts, and that all four notification paths send for newly-extracted workflows
while stored pre-change workflows still hit the no-op path.

`requester-contact-gap.md` was marked **Status: resolved** at the top, §3–§6 reworded to past
tense / before-after framing, and a pointer added from §4's Option A section to this plan's
Phases 1–4. §2's root-cause analysis was left untouched, as instructed.

Verdict: **Done.**

---

## Build order summary

| Phase | Deliverable | Gate |
|---|---|---|
| 1 | Extraction prompt rule | `npm test` (unchanged, 236) |
| 2 | Both gold fixtures | *(red — expected)* |
| 3 | Four test realignments | `npm test` green, 236 |
| 4 | Live extraction verification | `tests/live/**` vs Azure |
| 5 | Docs | — |

**Phases 2 and 3 are a single commit.** Phase 1 may be its own commit; Phases 4–5 follow.

---

## Risks

**1. The `fillAllRequirements` cascade (§0 Finding 2).** Adding a required input breaks every
`finalize()`-dependent test at once — roughly ten, across suites that have nothing to do with
email. One line fixes it. Alarming only if unanticipated, which is why it leads this plan
rather than sitting in a footnote.

**2. Gold-data drift in the live suite.** `tests/live/**` is outside `npm test`, so Phase 3.4
is the easiest edit in this plan to forget and the slowest to discover. It fails only when
someone next runs the live suite, possibly weeks later.

**3. Model compliance is not guaranteed by Phases 1–3.** The offline suite proves the fixtures
and the consumers agree with each other, not that the LLM complies. Only Phase 4 tests that.
Do not treat a green `npm test` as proof this change works end to end.

**4. Stored workflows predate the change.** Any workflow already saved in Mongo — including
anything published through the admin UI before this lands — has no `requester_email` input.
Those tasks keep hitting the no-op path and stay pull-only via `GET /tasks/:id/status`. This
is graceful, not broken, and needs no migration for a PoC. Worth knowing before a demo where
someone asks why an older template sends no mail.

---

## Explicitly out of scope

- **Option B (session-level contact capture)** — splits contact collection across two
  mechanisms for no gain at PoC scale. Rejected in
  [requester-contact-gap.md](requester-contact-gap.md) §4.
- **Option C (directory/identity service)** — the correct long-term answer, and it dissolves
  both this gap *and* the approver-trust hole in
  [approval-execution-design.md](approval-execution-design.md) §10. A separate slice. Option A
  does not block it: when a directory lands, `requester_email` becomes a prefilled default
  rather than wasted work.
- **Reading `notify: Actor[]`.** Still unread by any code. Unchanged by this plan.
- **Backfilling existing stored workflows.** See Risk 4.
- **Frontend.** Verified, not assumed: `unblock-ai-web/` has **no requirement-rendering
  component at all**. `InputType` (including `"email"`) is declared in
  `src/types/workflow.ts:102` and consumed by nothing — the portal
  (`src/components/portal/`) is selection chat only. There is no per-type `switch` that could
  be missing an `email` branch, so this change cannot break the UI. When requirement
  collection is eventually built there, `email` must be handled like any other type.

---

## The caveat worth restating

A requester-typed address is **self-asserted**, exactly like the approver addresses flagged in
[approval-execution-design.md](approval-execution-design.md) §10. A student could enter
someone else's address, or a typo, and the system would mail it without complaint.

This is acceptable for a PoC and **does not get worse** — it is the same trust posture approver
email already has. But it is not identity, and it is not closed by this change. Only Option C
closes it.
