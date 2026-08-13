# UNBLOCK-AI — MVP Implementation Plan

> Historical planning document. Paths and file names below predate the TypeScript restructure — see docs/architecture/folder-structure.md for the current layout.

## Phase 1: Workflow Ingestion (Plain Text → Structured JSON → Knowledge Bank)

**Goal of this phase:** An admin pastes a workflow description in plain English. An LLM converts it into a validated, machine-readable JSON structure conforming to a fixed schema. The result is stored in a knowledge bank for later execution.

This document covers **only** Phase 1. Execution of workflows (actually sending emails, collecting approvals) is a later phase, but the schema is designed so that the execution engine can consume it directly without rework.

---

## Table of Contents

1. [Understanding the Problem](#1-understanding-the-problem)
2. [Designing the Standard Structure](#2-designing-the-standard-structure) ← *the critical design step*
3. [The Schema Specification](#3-the-schema-specification)
4. [Worked Examples (Your Two Sample Workflows)](#4-worked-examples)
5. [Project Setup](#5-project-setup)
6. [Step-by-Step Implementation](#6-step-by-step-implementation)
7. [Testing & Validation Strategy](#7-testing--validation-strategy)
8. [Definition of Done](#8-definition-of-done)

---

## 1. Understanding the Problem

### 1.1 What we are building

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌───────────────┐
│ Admin types │ →  │  LLM         │ →  │  Validator  │ →  │ Knowledge     │
│ plain-text  │    │  Extraction  │    │  (schema +  │    │ Bank          │
│ workflow    │    │  (Azure)     │    │   graph)    │    │ (storage)     │
└─────────────┘    └──────────────┘    └─────────────┘    └───────────────┘
                                              │
                                              ↓ on failure
                                       ┌─────────────┐
                                       │ Repair loop │
                                       │ (feed errors│
                                       │ back to LLM)│
                                       └─────────────┘
```

### 1.2 Why the structure design comes first

You correctly identified this as the first problem to solve. Here is why it matters so much:

The LLM is only as good as the target you give it. If the schema is vague, the LLM will produce inconsistent output for the same input, and you will have no way to detect that it got something wrong. If the schema is precise and constrained, the LLM's job becomes a **filling-in exercise** rather than a creative one — which is exactly what makes it reliable.

The schema must satisfy three competing pressures:

| Pressure | Meaning | Risk if ignored |
|---|---|---|
| **Expressive enough** | Must represent every routing pattern in real workflows (sequential, parallel, conditional, dependency-gated, loop-back) | Workflows can't be represented; you hard-code special cases forever |
| **Constrained enough** | Must have a fixed vocabulary so the LLM can't invent new field names or step types | Output varies run-to-run; nothing downstream can be trusted |
| **Institution-agnostic** | No hard-coded roles like `"HoD"` or `"Dean"` in the schema itself | Only works for one university; fails your "any institute" requirement |

### 1.3 Analysing the two sample workflows

Before designing anything, we extract the *capabilities* each sample demands. This is the requirements list the schema must satisfy.

**From `IT Faculty Overseas Leave`:**

| # | Requirement | Schema implication |
|---|---|---|
| R1 | Collect 5 typed fields from a student, conversationally | Need an `inputs` block with field types and who provides them |
| R2 | Resolve "the student's Academic Advisor" at runtime, not design time | Need **dynamic approver resolution** — a directory lookup, not a literal name |
| R3 | Advisor → HoD, strictly in order | Need **sequential dependencies** |
| R4 | If trip > 30 days, append a Dean step | Need **conditional steps** with a computed expression |
| R5 | Trip duration is derived from two input dates | Need **computed/derived variables** |
| R6 | "Request More Information" pauses, reopens chat, returns to *same* approver | Need a **loop-back outcome** distinct from approve/reject |
| R7 | Any rejection terminates the whole workflow | Need **terminal outcomes** with workflow-level effect |
| R8 | On completion, issue a reference number | Need **completion actions** |

**From `Departmental Event & Workshop Organization`:**

| # | Requirement | Schema implication |
|---|---|---|
| R9 | Three sub-requests split from one submission | Need **parallel branches** (fan-out) |
| R10 | Hall booking and security clearance run concurrently, independently | Parallel steps must have **no dependency on each other** |
| R11 | Refreshments starts on hold — deliberately blocked | Need an explicit **blocked/waiting** initial state |
| R12 | Refreshments releases the *moment* hall booking is approved | Need **dependency on another step's outcome**, not just its completion |
| R13 | Capacity is read from the hall approver's response and feeds catering | Need approvers to **return data**, not just a yes/no |
| R14 | Single consolidated status page | Need stable step IDs and a queryable state model |
| R15 | Complete only when all three branches are approved | Need **fan-in / join** completion semantics |

The union of R1–R15 is our design brief.

### 1.4 The key insight: a graph, not a list

The naive structure — `steps: [step1, step2, step3]` — is an ordered **list**. It handles the Leave workflow (R3) but completely fails the Event workflow: a list cannot express "these two run at the same time and neither waits for the other" (R10).

The fix is to make `steps` an **unordered set**, where each step declares what it **depends on**:

```
Sequential (Leave):        Parallel + gated (Event):

  advisor                    hall ────┐
    ↓ depends_on               │      │
   hod                         │      ├──→ (all done) → complete
    ↓ depends_on               ↓      │
  dean (conditional)       refreshments│
                                       │
                           security ───┘
```

- **Sequential** = a chain of `depends_on`.
- **Parallel** = multiple steps with the *same* (or empty) `depends_on`.
- **Dependency gate** = `depends_on` that also requires a specific *outcome*.

One mechanism, all three patterns. This is the single most important decision in the schema, and it is what makes the structure genuinely reusable across institutions.

> **Terminology note:** this is a directed acyclic graph (DAG) of steps. The `request_more_info` loop-back is *not* a cycle in this graph — it is a state transition *within* a single step (the step goes back to `pending` after collecting more input). Keeping it inside the step preserves acyclicity, which keeps the execution engine simple.

---

## 2. Designing the Standard Structure

### 2.1 Design principles

Apply these five rules; they are what separate a schema that survives contact with real workflows from one that doesn't.

**Principle 1 — Closed vocabularies.**
Every field whose value affects control flow uses a fixed `enum`. `step.type` can only be one of a known set. The LLM picks from a menu; it never invents. Free text is allowed only in fields that are purely descriptive (`title`, `description`, `instructions_to_approver`) and never parsed by code.

**Principle 2 — Roles, not people.**
Never store `"Dr. Silva"`. Store a *role reference* that is resolved at runtime against the institution's directory:

```json
{ "resolution": "dynamic", "role": "academic_advisor", "relative_to": "requester" }
```

This is what makes the same workflow definition portable to another university — they supply a different directory, not a different workflow. (Satisfies R2, and the institution-agnostic pressure from §1.2.)

**Principle 3 — Stable, human-readable IDs.**
Every step gets a `snake_case` id (`hall_booking`, not `step_2`). Dependencies reference these ids. Positional references break the moment a step is inserted; names survive edits and make the stored JSON reviewable by a human. (Supports R14.)

**Principle 4 — Data flows through a single namespace.**
There is one flat variable namespace per workflow run. Inputs write into it (`inputs.departure_date`). Computed values write into it (`computed.trip_duration_days`). Approver responses write into it (`steps.hall_booking.response.confirmed_capacity`). Conditions and message templates read from it. Without this, R5/R12/R13 each need bespoke plumbing.

**Principle 5 — Separate definition from instance.**
This file describes the **definition** (the template, authored once by the admin). A **run/instance** (one student's actual leave request, with its current state) is a separate document that *references* a definition. Phase 1 produces definitions only — but designing with the split in mind means the execution engine won't require a schema rewrite.

### 2.2 Choosing the serialization format

You were unsure whether JSON is right. It is — here is the reasoning:

| Option | Verdict |
|---|---|
| **JSON** | ✅ **Chosen.** Native to Node. Azure OpenAI supports *structured outputs* (`response_format: json_schema`) which constrains generation to a JSON Schema — this is the single biggest reliability win available. Validates with mature libraries (Ajv). Stores natively in MongoDB/Postgres JSONB. |
| YAML | More readable for humans, but no constrained-decoding support, and its implicit type coercion (`NO` → `false`, unquoted dates) is a real hazard for generated content. |
| BPMN/XML | The formal industry standard for workflows, and genuinely more expressive — but enormously verbose, LLMs generate it poorly, and it is far beyond MVP needs. |
| Custom DSL | Requires writing a parser and teaching the LLM a language it has never seen. No. |

**Decision: JSON, defined by a JSON Schema (Draft 2020-12), enforced both at generation time (structured outputs) and after generation (Ajv validation).**

Belt *and* braces: structured outputs guarantee the *shape* is valid, but cannot guarantee *semantic* correctness — e.g. that `depends_on: "hall_booking"` points at a step that actually exists. That is what the custom graph validator in §6.6 is for.

---

## 3. The Schema Specification

### 3.1 Top-level anatomy

```jsonc
{
  "schema_version": "1.0",          // lets you migrate stored workflows later
  "workflow_id": "it_overseas_leave",
  "title": "IT Faculty Overseas Leave Approval",
  "description": "Brief summary of purpose and scope.",
  "scope": { ... },                 // who may start this, which org unit
  "requester": { ... },             // who initiates it
  "inputs": [ ... ],                // what to collect, and from whom
  "computed": [ ... ],              // values derived from inputs
  "steps": [ ... ],                 // the DAG — the heart of the schema
  "completion": { ... },            // what "done" means + final actions
  "metadata": { ... }               // provenance, extraction confidence
}
```

### 3.2 `scope` — institution-agnostic targeting

```jsonc
"scope": {
  "institution_type": "university",       // enum: university | school | company | hospital | government | other
  "applies_to": {
    "actor_type": "student",              // enum: student | staff | faculty | external | any
    "constraints": [                      // free-form but structured filters
      { "attribute": "faculty", "operator": "equals", "value": "Information Technology" },
      { "attribute": "level",   "operator": "equals", "value": "undergraduate" }
    ]
  }
}
```

Constraints are *data*, not hard-coded logic — a different institute supplies different attribute values against the same schema. This is Principle 2 applied at workflow level.

### 3.3 `inputs` — what to collect, from whom

This directly answers your question of *"whose input we need / what are they"*.

```jsonc
"inputs": [
  {
    "id": "full_name",                    // becomes inputs.full_name in the namespace
    "label": "Full Name",
    "description": "Student's full legal name as registered.",
    "type": "string",                     // enum: string | text | number | date | datetime |
                                          //       boolean | email | phone | enum | file | person
    "collected_from": {
      "resolution": "requester"           // enum: requester | dynamic | static | system
    },
    "required": true,
    "validation": { "min_length": 2, "max_length": 120 },
    "collection_hint": "Ask conversationally; confirm spelling if unusual."
  },
  {
    "id": "departure_date",
    "label": "Departure Date",
    "type": "date",
    "collected_from": { "resolution": "requester" },
    "required": true,
    "validation": { "not_before": "today" }
  },
  {
    "id": "expected_attendance",
    "label": "Expected Attendance",
    "type": "number",
    "collected_from": { "resolution": "requester" },
    "required": true,
    "validation": { "min": 1 }
  }
]
```

**Why `collected_from` is an object, not a string:** most inputs come from the requester, but some workflows need a field from a *third party* (e.g. a guest speaker's passport number, supplied by the speaker). Modelling it as an object means that case needs no schema change — you set `resolution: "dynamic"` and add a `role`.

### 3.4 `actor` — the reusable reference object

Used by `collected_from`, `steps[].assignee`, and notification targets. **One shape, used everywhere** — this is what keeps the schema small.

```jsonc
// Form A — resolved live from the institution's directory (PREFERRED)
{
  "resolution": "dynamic",
  "role": "academic_advisor",         // snake_case role key
  "relative_to": "requester",         // whose advisor? optional; defaults to requester
  "directory_query": "Find the assigned academic advisor for the given student index number.",
  "fallback_role": "head_of_department"
}

// Form B — a fixed office/department (no per-person lookup needed)
{ "resolution": "static", "role": "finance_office", "display_name": "Finance Office" }

// Form C — the person who started the request
{ "resolution": "requester" }

// Form D — automated, no human
{ "resolution": "system" }
```

> **Important:** `role` values are **not** enumerated in the schema — they cannot be, because every institution has different roles. Instead the LLM is instructed to normalise them to `snake_case` and the extraction prompt supplies a *suggested* vocabulary (`head_of_department`, `dean`, `finance_office`, `security_office`, `venue_admin`, …). Unknown roles are permitted but flagged in `metadata.unmapped_roles` for admin review. This is the deliberate seam between "generic schema" and "this institute's reality".

### 3.5 `computed` — derived values

Needed for R5 (trip duration drives the Dean condition).

```jsonc
"computed": [
  {
    "id": "trip_duration_days",
    "description": "Total days between departure and return, inclusive.",
    "operation": "date_diff_days",      // enum: date_diff_days | sum | difference |
                                        //       multiply | count | lookup | constant
    "arguments": {
      "from": "inputs.departure_date",
      "to": "inputs.return_date",
      "inclusive": true
    }
  }
]
```

A closed `operation` enum keeps this safe and evaluable — **never** let the LLM emit an arbitrary expression string that you would have to `eval()`. That would be both a correctness hazard and a code-injection hole, since the expression originates from text an admin pasted in.

### 3.6 `steps` — the DAG (the core)

```jsonc
{
  "id": "hod_review",
  "name": "Head of Department Sign-off",
  "type": "approval",                   // enum: approval | notification | data_collection |
                                        //       automated_action | review
  "description": "Departmental sign-off on the leave request.",

  "assignee": {                         // an actor object (§3.4)
    "resolution": "dynamic",
    "role": "head_of_department",
    "relative_to": "requester"
  },

  "depends_on": [                       // ← THE parallelism/sequencing mechanism
    { "step_id": "advisor_review", "required_outcome": "approved" }
  ],

  "initial_state": "auto",              // enum: auto | blocked
                                        // "blocked" = explicitly on hold (R11)

  "condition": null,                    // null = always runs; see §3.7

  "instructions_to_approver": "Review dates and reason for departmental conflicts.",

  "response_fields": [],                // data the approver must return (R13)

  "outcomes": {
    "approved":            { "action": "continue" },
    "rejected":            { "action": "terminate_workflow",
                             "notify": [{ "resolution": "requester" }],
                             "include_reason": true },
    "request_more_info":   { "action": "reopen_input",
                             "return_to_step": "self",        // ← R6
                             "prompt_source": "approver_message" }
  },

  "notifications": {
    "on_assign":  { "channel": "email", "template": "approval_request" },
    "on_outcome": { "channel": "email", "template": "approval_result" }
  },

  "sla": { "reminder_after_hours": 48, "escalate_after_hours": 120 }
}
```

**How each routing pattern is expressed — this is the payoff of §1.4:**

| Pattern | Encoding | Sample |
|---|---|---|
| Sequential | `depends_on: [{step_id: "advisor_review", required_outcome: "approved"}]` | Leave R3 |
| Parallel | Two steps both with `depends_on: []` | Event R9/R10 |
| Dependency gate | `initial_state: "blocked"` + `depends_on` a step's `approved` outcome | Event R11/R12 |
| Conditional | `condition` object evaluates false → step is skipped | Leave R4 |
| Loop-back | `outcomes.request_more_info.return_to_step: "self"` | Leave R6 |
| Terminate | `outcomes.rejected.action: "terminate_workflow"` | Leave R7 |

Note that **`initial_state: "blocked"` is arguably redundant** — a step with unmet `depends_on` cannot run anyway. It is kept because the source text explicitly says refreshments is "automatically placed on hold", and surfacing that as an intentional `blocked` state (rather than an incidental one) makes the consolidated status page (R14) clearer to the lecturer: *"On hold — waiting for venue capacity"* reads better than an unexplained *"pending"*.

### 3.7 `condition` — structured, never free-text

```jsonc
"condition": {
  "operator": "greater_than",           // enum: equals | not_equals | greater_than |
                                        //       less_than | greater_or_equal |
                                        //       less_or_equal | in | not_in | exists
  "left":  "computed.trip_duration_days",   // namespace path
  "right": 30,                              // literal or namespace path
  "description": "Only require Dean approval for trips longer than 30 days."
}
```

For multi-clause logic:

```jsonc
"condition": {
  "operator": "and",                    // "and" | "or" | "not"
  "clauses": [ { ...condition... }, { ...condition... } ]
}
```

Same rationale as `computed`: a closed operator set is evaluable by a ~40-line interpreter and carries no injection risk. Free-text conditions would require `eval()` on LLM-generated, admin-influenced strings.

### 3.8 `response_fields` — approvers returning data (R13)

```jsonc
"response_fields": [
  {
    "id": "confirmed_capacity",
    "label": "Confirmed Venue Capacity",
    "type": "number",
    "required_on_outcome": ["approved"]
  }
]
```

Writes to `steps.hall_booking.response.confirmed_capacity`, readable by any later step's condition or message template. This is what lets the refreshments branch size the catering (Event R12/R13).

### 3.9 `completion`

```jsonc
"completion": {
  "rule": "all_required_steps_complete",   // enum: all_required_steps_complete |
                                           //       any_step_complete | specific_steps
  "required_steps": ["hall_booking", "speaker_clearance", "refreshments_approval"],
  "actions": [
    { "type": "issue_reference_number", "format": "LEAVE-{YYYY}-{SEQ:5}",
      "store_as": "reference_number" },
    { "type": "notify", "target": { "resolution": "requester" },
      "template": "completion_notice", "channel": "email" },
    { "type": "instruction_to_requester",
      "message": "Collect your authorized travel letter from the faculty office." }
  ]
}
```

### 3.10 `metadata` — extraction provenance

```jsonc
"metadata": {
  "created_from": "plain_text",
  "source_text_hash": "sha256:…",     // detect re-uploads of the same text
  "extraction_model": "gpt-4o-2024-08-06",
  "extraction_timestamp": "2026-07-30T10:00:00Z",
  "confidence": "high",               // enum: high | medium | low
  "ambiguities": [                    // ← surface these to the admin for confirmation
    "Source text does not state what happens if the hall booking is rejected."
  ],
  "unmapped_roles": ["hall_warden"],  // roles not in the suggested vocabulary
  "review_status": "pending_admin_review"
}
```

**Do not skip `ambiguities`.** Real admin text is incomplete — your Event workflow, for instance, never says what happens if the hall booking is *rejected*, yet the whole refreshments branch hangs off its approval. An LLM asked to produce only a clean structure will silently invent an answer. An LLM explicitly asked to *report* what it had to assume gives you a review queue instead of a silent bug. This field is a correctness mechanism, not documentation.

---

## 4. Worked Examples

These are the ground-truth targets for testing. Store them as fixtures — §7 compares LLM output against them.

### 4.1 `IT Faculty Overseas Leave` (abridged — full version in `fixtures/expected/`)

```jsonc
{
  "schema_version": "1.0",
  "workflow_id": "it_faculty_overseas_leave",
  "title": "IT Faculty Overseas Leave Approval",
  "description": "Application and approval process for IT Faculty undergraduates travelling overseas during the academic term.",

  "scope": {
    "institution_type": "university",
    "applies_to": {
      "actor_type": "student",
      "constraints": [
        { "attribute": "faculty", "operator": "equals", "value": "Information Technology" },
        { "attribute": "level",   "operator": "equals", "value": "undergraduate" }
      ]
    }
  },

  "requester": { "actor_type": "student", "identifier_field": "student_index_number" },

  "inputs": [
    { "id": "full_name",           "label": "Full Name",              "type": "string", "required": true,
      "collected_from": { "resolution": "requester" } },
    { "id": "student_index_number","label": "Student Index Number",   "type": "string", "required": true,
      "collected_from": { "resolution": "requester" } },
    { "id": "destination_country", "label": "Destination Country",    "type": "string", "required": true,
      "collected_from": { "resolution": "requester" } },
    { "id": "destination_city",    "label": "Destination City",       "type": "string", "required": true,
      "collected_from": { "resolution": "requester" } },
    { "id": "departure_date",      "label": "Departure Date",         "type": "date",   "required": true,
      "collected_from": { "resolution": "requester" } },
    { "id": "return_date",         "label": "Return Date",            "type": "date",   "required": true,
      "collected_from": { "resolution": "requester" },
      "validation": { "not_before_field": "inputs.departure_date" } },
    { "id": "travel_reason",       "label": "Detailed Reason for Travel", "type": "text", "required": true,
      "collected_from": { "resolution": "requester" } }
  ],

  "computed": [
    { "id": "trip_duration_days", "operation": "date_diff_days",
      "arguments": { "from": "inputs.departure_date", "to": "inputs.return_date", "inclusive": true } }
  ],

  "steps": [
    {
      "id": "advisor_review",
      "name": "Academic Advisor Review",
      "type": "approval",
      "assignee": { "resolution": "dynamic", "role": "academic_advisor", "relative_to": "requester",
                    "directory_query": "Assigned academic advisor for the student index number." },
      "depends_on": [],
      "initial_state": "auto",
      "condition": null,
      "instructions_to_approver": "Review dates and reason; ensure no conflict with critical exams or academic requirements.",
      "outcomes": {
        "approved":          { "action": "continue" },
        "rejected":          { "action": "terminate_workflow",
                               "notify": [{ "resolution": "requester" }], "include_reason": true },
        "request_more_info": { "action": "reopen_input", "return_to_step": "self",
                               "prompt_source": "approver_message" }
      }
    },
    {
      "id": "hod_review",
      "name": "Head of Department Sign-off",
      "type": "approval",
      "assignee": { "resolution": "dynamic", "role": "head_of_department", "relative_to": "requester" },
      "depends_on": [ { "step_id": "advisor_review", "required_outcome": "approved" } ],
      "initial_state": "auto",
      "condition": null,
      "outcomes": { /* identical three-outcome block */ }
    },
    {
      "id": "dean_review",
      "name": "Dean of IT Faculty Approval",
      "type": "approval",
      "assignee": { "resolution": "dynamic", "role": "dean", "relative_to": "requester" },
      "depends_on": [ { "step_id": "hod_review", "required_outcome": "approved" } ],
      "initial_state": "auto",
      "condition": {
        "operator": "greater_than",
        "left": "computed.trip_duration_days",
        "right": 30,
        "description": "Dean approval required only for trips longer than 30 days."
      },
      "outcomes": { /* identical three-outcome block */ }
    }
  ],

  "completion": {
    "rule": "all_required_steps_complete",
    "required_steps": ["advisor_review", "hod_review", "dean_review"],
    "actions": [
      { "type": "issue_reference_number", "format": "LEAVE-{YYYY}-{SEQ:5}", "store_as": "reference_number" },
      { "type": "notify", "target": { "resolution": "requester" }, "template": "completion_notice", "channel": "email" },
      { "type": "instruction_to_requester",
        "message": "Collect your physical authorized travel letter from the faculty office using your reference number." }
    ]
  }
}
```

> Note `dean_review` is listed in `required_steps` even though it is conditional. The execution engine treats a step whose `condition` evaluates false as **`skipped`**, and `skipped` counts as satisfied for completion purposes. Defining it this way avoids a second "optional steps" list.

### 4.2 `Departmental Event & Workshop Organization` (steps only)

```jsonc
"steps": [
  {
    "id": "hall_booking",
    "name": "Hall Booking Approval",
    "type": "approval",
    "assignee": { "resolution": "static", "role": "venue_admin", "display_name": "Campus Administration / Hall Warden" },
    "depends_on": [],                                   // ← parallel: no dependency
    "initial_state": "auto",
    "response_fields": [
      { "id": "confirmed_capacity", "label": "Confirmed Venue Capacity",
        "type": "number", "required_on_outcome": ["approved"] },
      { "id": "venue_name", "label": "Assigned Venue", "type": "string",
        "required_on_outcome": ["approved"] }
    ],
    "outcomes": {
      "approved": { "action": "continue" },
      "rejected": { "action": "terminate_workflow",
                    "notify": [{ "resolution": "requester" }], "include_reason": true }
    }
  },
  {
    "id": "speaker_clearance",
    "name": "Guest Speaker Security Clearance",
    "type": "approval",
    "assignee": { "resolution": "static", "role": "security_office" },
    "depends_on": [],                                   // ← parallel: independent of hall_booking
    "initial_state": "auto",
    "outcomes": {
      "approved": { "action": "continue" },
      "rejected": { "action": "terminate_workflow",
                    "notify": [{ "resolution": "requester" }], "include_reason": true }
    }
  },
  {
    "id": "refreshments_approval",
    "name": "Refreshments Budget Approval",
    "type": "approval",
    "assignee": { "resolution": "static", "role": "finance_office" },
    "depends_on": [ { "step_id": "hall_booking", "required_outcome": "approved" } ],
    "initial_state": "blocked",                         // ← explicitly on hold (R11)
    "blocked_reason": "Catering cost estimate depends on the confirmed venue capacity.",
    "context_from_steps": [                             // ← the handshake (R12/R13)
      { "step_id": "hall_booking", "field": "confirmed_capacity", "as": "venue_capacity" }
    ],
    "instructions_to_approver": "Approve the refreshments budget based on the confirmed venue capacity.",
    "outcomes": {
      "approved": { "action": "continue" },
      "rejected": { "action": "terminate_workflow",
                    "notify": [{ "resolution": "requester" }], "include_reason": true }
    }
  }
],

"completion": {
  "rule": "all_required_steps_complete",
  "required_steps": ["hall_booking", "speaker_clearance", "refreshments_approval"],
  "actions": [
    { "type": "notify", "target": { "resolution": "requester" },
      "template": "event_confirmed", "channel": "email" }
  ]
}
```

Compare `hall_booking`/`speaker_clearance` (both `depends_on: []` → run concurrently) against `refreshments_approval` (gated on a specific outcome). **Both sample workflows are expressed by the same mechanism with no special-casing.** That is the test of whether the schema design succeeded.

> Note the two rejection paths the source text left unspecified (§3.10). Here they are modelled as `terminate_workflow`, and that assumption must appear in `metadata.ambiguities` so the admin can confirm or override it.

---

## 5. Project Setup

### 5.1 Directory layout

```
UNBLOCK-AI/
├─ .env                          # secrets — gitignored, never committed
├─ .env.example                  # committed template
├─ .gitignore
├─ package.json
├─ README.md
├─ IMPLEMENTATION_PLAN.md        # this file
└─ src/
   ├─ index.js                   # Express entry point
   ├─ config/
   │  └─ env.js                  # loads + validates environment variables
   ├─ schema/
   │  ├─ workflow.schema.json    # THE standard structure (§3)
   │  └─ roleVocabulary.js       # suggested role keys
   ├─ llm/
   │  ├─ azureClient.js          # Azure OpenAI client setup
   │  ├─ prompts/
   │  │  ├─ systemPrompt.js      # extraction instructions
   │  │  └─ fewShot.js           # worked examples from §4
   │  └─ extractWorkflow.js      # orchestrates call + repair loop
   ├─ validation/
   │  ├─ schemaValidator.js      # Ajv — structural validation
   │  └─ graphValidator.js       # semantic validation (refs, cycles, reachability)
   ├─ knowledgeBank/
   │  ├─ store.js                # storage interface
   │  └─ fileStore.js            # MVP: JSON files on disk
   ├─ api/
   │  └─ routes.js               # HTTP endpoints
   └─ utils/
      └─ logger.js
└─ fixtures/
   ├─ input/                     # your two .txt sample files
   └─ expected/                  # hand-written ground-truth JSON (§4)
└─ tests/
   └─ extraction.test.js
```

### 5.2 Initialise

```bash
cd "d:/Asentic project/UNBLOCK-AI"
npm init -y
npm install express dotenv openai ajv ajv-formats
npm install --save-dev nodemon
```

Package notes:
- **`openai`** — the official SDK; it ships the `AzureOpenAI` client, so you do not need a separate Azure package.
- **`ajv` + `ajv-formats`** — JSON Schema validation; `ajv-formats` adds `date`, `email`, `uri` format checks.
- Node 24 is installed, so `fetch`, `crypto.randomUUID()` and `node:test` are all built in — no extra deps needed.

In `package.json` set `"type": "module"` (so `import` works) and add:

```json
"scripts": {
  "start": "node src/index.js",
  "dev": "nodemon src/index.js",
  "test": "node --test tests/"
}
```

### 5.3 Environment configuration

`.env.example` (commit this):

```bash
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-10-21
PORT=3000
KNOWLEDGE_BANK_PATH=./data/workflows
```

`.gitignore`:

```
node_modules/
.env
data/
*.log
```

> **Model requirement:** structured outputs (`response_format: { type: "json_schema" }`) need a `gpt-4o` deployment dated **2024-08-06 or later**, on API version **2024-08-01-preview or later**. Check your Azure deployment before starting — if your deployment is older, §6.4 has a documented fallback path, but the strict mode is worth having, so upgrade the deployment if you can.

---

## 6. Step-by-Step Implementation

### Step 6.1 — Write the JSON Schema

Translate §3 into `src/schema/workflow.schema.json` as a JSON Schema Draft 2020-12 document.

Rules to follow:
- Set `"additionalProperties": false` on **every** object. Without it, the LLM will happily add fields you never defined and validation will pass.
- Mark genuinely-required fields in `required` — but keep the list minimal, because Azure's strict structured-output mode requires *every* property to be listed as required (you express optionality with `["string", "null"]` union types instead).
- Use `$defs` for the repeated shapes (`actor`, `condition`, `outcome`) and `$ref` them. `condition` is recursive via `clauses` — `$ref: "#/$defs/condition"` handles this fine.

**Verify before moving on:** load the schema with Ajv and validate the two hand-written fixtures from §4. Fix the schema until both pass. Doing this *before* touching the LLM means that when extraction later fails, you know the schema is not the culprit.

### Step 6.2 — Build the Azure client

`src/llm/azureClient.js`:

```js
import { AzureOpenAI } from "openai";
import { config } from "../config/env.js";

export const azureClient = new AzureOpenAI({
  endpoint:   config.azure.endpoint,
  apiKey:     config.azure.apiKey,
  apiVersion: config.azure.apiVersion,
  deployment: config.azure.deployment,
});
```

`src/config/env.js` should **fail loudly at startup** if any required variable is missing. A misconfigured key that surfaces as a confusing 401 twenty minutes into debugging is a waste of your time; a one-line "AZURE_OPENAI_API_KEY is not set" at boot is not.

Smoke-test with a trivial "reply OK" completion before going further. Confirm connectivity in isolation.

### Step 6.3 — Write the extraction prompt

This is where most of the accuracy comes from. Structure the system prompt in these sections:

1. **Role** — "You convert institutional workflow descriptions written in plain English into a strict JSON structure."
2. **Schema explanation** — walk through what each top-level field means. Do not merely paste the JSON Schema; explain the *intent*, especially the DAG semantics.
3. **The critical rules** — state these explicitly and emphatically:
   - Steps that the text describes as *parallel*, *simultaneous*, *concurrent*, or *independent* must have **no dependency on each other**.
   - Steps described as *after*, *once X approves*, *then* must depend on that step with `required_outcome: "approved"`.
   - Steps described as *on hold*, *waiting for*, *depends on* get `initial_state: "blocked"` **and** a `depends_on` entry.
   - Never emit a real person's name as an assignee — always a `role` + resolution strategy.
   - Normalise all role names to `snake_case`.
   - Any policy phrased as *if/when/unless* becomes a `condition` object, never prose.
4. **Suggested role vocabulary** — the list from `roleVocabulary.js`, framed as *preferred if applicable, but coin a new snake_case role if none fits*.
5. **Ambiguity instruction** — "If the source text does not specify what happens in some situation, choose the most reasonable default **and record the assumption in `metadata.ambiguities`**. Never silently invent a rule."
6. **Few-shot examples** — the two worked examples from §4, as `input text → expected JSON` pairs.

On few-shot examples: two full examples is a lot of tokens, but it is the highest-leverage thing you can do for output consistency, and it directly demonstrates the parallel-vs-sequential distinction that is hardest to get right. Keep them. If cost becomes a concern later, enable **prompt caching** rather than cutting the examples — the system prompt is identical on every call, which is the ideal caching shape.

### Step 6.4 — Implement extraction with structured outputs

`src/llm/extractWorkflow.js`:

```js
const response = await azureClient.chat.completions.create({
  model: config.azure.deployment,
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    ...FEW_SHOT_MESSAGES,
    { role: "user", content: plainTextWorkflow },
  ],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "workflow_definition",
      schema: workflowSchema,
      strict: true,          // ← constrains generation; shape is guaranteed
    },
  },
  temperature: 0,            // ← deterministic; this is extraction, not creative writing
});

const parsed = JSON.parse(response.choices[0].message.content);
```

Two settings carry real weight here:

- **`strict: true`** makes the shape structurally impossible to get wrong. Note the strict-mode constraints: every property must be in `required`, `additionalProperties: false` everywhere, and no `minLength`/`maximum`-style keywords (they are ignored). Design the schema around this from the start rather than retrofitting.
- **`temperature: 0`** — you want the same text to produce the same structure every time. Determinism is a feature for extraction.

*Fallback if your deployment predates structured outputs:* use `response_format: { type: "json_object" }`, paste the schema into the prompt, and lean harder on the repair loop in §6.5. It works, just less reliably.

### Step 6.5 — Build the repair loop

Structured outputs guarantee shape, not meaning. The graph validator (§6.6) will still catch things like a `depends_on` pointing at a nonexistent step id. When that happens, feed the errors back:

```js
async function extractWithRepair(text, maxAttempts = 3) {
  let messages = [ /* system + few-shot + user */ ];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = await callAzure(messages);
    const errors = [
      ...validateSchema(candidate),
      ...validateGraph(candidate),
    ];
    if (errors.length === 0) return { workflow: candidate, attempts: attempt };

    messages.push(
      { role: "assistant", content: JSON.stringify(candidate) },
      { role: "user", content:
        `The JSON has these problems:\n${errors.map(e => `- ${e}`).join("\n")}\n` +
        `Return the corrected JSON. Fix only these problems.` }
    );
  }
  throw new ExtractionError("Failed to produce a valid workflow after 3 attempts", { errors });
}
```

Cap the attempts. If three tries fail, the input text is probably genuinely ambiguous — that is an admin-review case, not something to burn API calls on.

### Step 6.6 — Build the graph validator

This catches the semantic errors Ajv structurally cannot. Implement each check:

| Check | Why it matters |
|---|---|
| Every `depends_on.step_id` refers to an existing step | Dangling reference → step never unblocks; workflow hangs forever |
| No cycles in the dependency graph (DFS with a colour marker) | Deadlock — A waits on B waits on A |
| Every step is reachable from an entry step (`depends_on: []`) | Orphaned step never runs |
| At least one step has `depends_on: []` | Otherwise nothing can start |
| Every namespace path in `condition`/`computed`/`context_from_steps` resolves to a declared input, computed value, or response field | Typo'd path silently evaluates to `undefined`, condition quietly goes false, step is skipped without anyone noticing |
| `required_outcome` is a key that exists in the target step's `outcomes` | Gate can never open |
| `completion.required_steps` all exist | Workflow can never complete |
| Every `approval` step defines at least an `approved` and a `rejected` outcome | Incomplete decision handling |

Return errors as human-readable strings — they are consumed both by the repair loop (§6.5) and by the admin review UI, so `Step 'refreshments_approval' depends on unknown step 'hall_booking_2'` beats an error code.

### Step 6.7 — Implement the knowledge bank

Define the interface first so the storage backend can change without touching callers:

```js
// src/knowledgeBank/store.js
export class WorkflowStore {
  async save(workflow)                  { /* → { id, version } */ }
  async getById(workflowId, version)    { /* → workflow | null */ }
  async list(filters)                   { /* → [summary] */ }
  async search(query)                   { /* → [summary] — semantic later */ }
  async update(workflowId, workflow)    { /* → new version */ }
}
```

For the MVP, implement `fileStore.js` — one JSON file per workflow version at `data/workflows/{workflow_id}/v{n}.json`, plus an `index.json` holding summaries for fast listing.

**Version, don't overwrite.** Admins will iterate on a workflow, and in-flight runs must keep referencing the definition they started under. Overwriting silently changes the rules mid-flight for people who already submitted requests. Bumping `v{n}` costs nothing now and prevents a genuinely nasty class of bug later.

Keep a `store_as` seam for a vector database — Phase 2 will want semantic search over the knowledge bank ("which workflow handles overseas travel?"), and having the interface in place means adding it is an implementation swap, not a refactor.

### Step 6.8 — Expose the API

`src/api/routes.js`:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/workflows/extract` | Body `{ text }` → returns extracted JSON + validation report. **Does not save** — this is the preview step. |
| `POST` | `/api/workflows` | Body `{ workflow }` → validates and saves to the knowledge bank. |
| `GET` | `/api/workflows` | List stored workflow summaries. |
| `GET` | `/api/workflows/:id` | Fetch one (optional `?version=`). |
| `PUT` | `/api/workflows/:id` | Save a corrected version. |
| `POST` | `/api/workflows/:id/validate` | Re-run validation on an edited definition. |

**Keep extract and save as separate endpoints.** The admin must see the extracted structure — especially `metadata.ambiguities` — and confirm it before it enters the knowledge bank. Auto-saving would mean silently storing the LLM's guesses about things the source text never specified. The human-in-the-loop review is a core part of the design, not a nicety.

### Step 6.9 — Minimal admin UI (optional for MVP)

A single static HTML page is enough: a textarea on the left, the extracted JSON on the right, `ambiguities` shown as a prominent warning banner, and Save / Re-extract buttons. Skip a frontend framework — this is a proof of concept, and a plain page keeps the focus on the extraction quality, which is what you are actually trying to prove.

---

## 7. Testing & Validation Strategy

### 7.1 Fixture-based accuracy testing

The two hand-written JSON files from §4 are your ground truth. For each sample:

1. Run extraction on the `.txt` input.
2. Assert the structural properties that actually matter — **not** a deep-equality check against the fixture. Exact equality will fail on harmless wording differences in `description` fields and will make the test useless through noise.

Assert specifically:

```js
// Leave workflow
assert(workflow.inputs.length === 7);
assert(step("dean_review").condition.operator === "greater_than");
assert(step("dean_review").condition.right === 30);
assert(step("hod_review").depends_on[0].step_id === "advisor_review");
assert(step("advisor_review").outcomes.request_more_info.return_to_step === "self");

// Event workflow — the parallelism assertions are the important ones
assert(step("hall_booking").depends_on.length === 0);
assert(step("speaker_clearance").depends_on.length === 0);      // ← truly parallel
assert(step("refreshments_approval").initial_state === "blocked");
assert(step("refreshments_approval").depends_on[0].required_outcome === "approved");
```

### 7.2 Consistency testing

Run the same input **5 times**. The structural assertions above must hold on every run. If step ids or dependency edges vary between runs, the prompt is underspecified — tighten it before building anything on top.

### 7.3 Robustness testing

Deliberately feed it degraded input and confirm graceful behaviour:

| Input | Expected behaviour |
|---|---|
| Very short text ("Students need leave approval from HoD.") | Minimal valid workflow; `confidence: "low"`; ambiguities listed |
| Text with no approval steps at all | Valid workflow with only `data_collection` steps |
| Contradictory text ("A must be before B" + "B must be before A") | Graph validator catches the cycle; extraction fails clearly rather than storing a deadlocked workflow |
| Non-workflow text (a recipe) | Rejected with a clear error, not a hallucinated workflow |
| A third, unseen workflow you write yourself | The real generalisation test — see below |

### 7.4 The generalisation test

Write a **third** workflow, in a different domain (equipment purchase, lab access, grant application), in your own words, and run it through. This is the only test that actually validates your "any institute can use this" requirement — the two samples informed the schema design, so passing them proves less than it appears to. If the third workflow needs a schema change, that is genuinely valuable information, and far cheaper to learn now than after the execution engine is built on top.

---

## 8. Definition of Done

Phase 1 is complete when:

- [ ] `workflow.schema.json` exists and both hand-written fixtures validate against it
- [ ] Azure OpenAI client connects and completes a smoke-test call
- [ ] Extraction produces schema-valid JSON for both sample workflows
- [ ] The graph validator catches dangling references, cycles, and unreachable steps
- [ ] The repair loop recovers from at least one deliberately-induced validation error
- [ ] Workflows save to and load from the knowledge bank, with versioning
- [ ] `POST /api/workflows/extract` and `POST /api/workflows` work end to end
- [ ] Consistency test passes: 5 identical runs, identical structure
- [ ] The parallel-vs-sequential distinction is correctly extracted in both samples — **this is the single most important success criterion**, because it is what proves the schema design generalises
- [ ] `metadata.ambiguities` is populated for the under-specified cases (e.g. hall-booking rejection)
- [ ] The generalisation test (§7.4) passes on an unseen third workflow

---

## Appendix A — Suggested Role Vocabulary

Starting `snake_case` keys for `src/schema/roleVocabulary.js`. Deliberately generic — the point is that the LLM normalises varied phrasings ("hall warden", "campus admin", "venue booking office") onto stable keys, while each institution maps those keys to real people in its own directory.

```js
export const SUGGESTED_ROLES = {
  academic:      ["academic_advisor", "supervisor", "head_of_department", "dean",
                  "vice_chancellor", "registrar", "course_coordinator"],
  administrative:["faculty_office", "administration_office", "hr_office", "registrar_office"],
  financial:     ["finance_office", "budget_officer", "procurement_office"],
  facilities:    ["venue_admin", "hall_warden", "facilities_office", "maintenance_office"],
  security:      ["security_office", "safety_officer"],
  it:            ["it_support", "system_administrator"],
  generic:       ["requester", "direct_manager", "department_head", "approver"],
};
```

## Appendix B — Namespace Path Reference

Every path usable in `condition.left`, `condition.right`, `computed.arguments`, `context_from_steps`, and message templates:

| Path pattern | Resolves to |
|---|---|
| `inputs.<input_id>` | A value collected from a person |
| `computed.<computed_id>` | A derived value |
| `steps.<step_id>.outcome` | `"approved"` / `"rejected"` / … |
| `steps.<step_id>.response.<field_id>` | Data an approver returned |
| `steps.<step_id>.assignee` | The resolved actor for that step |
| `requester.<attribute>` | An attribute of the initiating person |
| `system.today` | Current date |

The graph validator (§6.6) checks every path against this table. A typo like `computed.trip_duration` (missing `_days`) would otherwise evaluate to `undefined`, silently make the Dean condition false, and skip an approval that policy requires — the kind of bug that is invisible until it matters.
