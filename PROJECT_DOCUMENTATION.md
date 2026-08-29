# UNBLOCK-AI — Complete Project Documentation

> **Plain English in, verified workflow out.**
>
> A full-stack system that turns a plain-English description of an institutional
> approval process into a strict, machine-readable workflow graph — then lets end
> users find the right process by chatting, fill it in, run the real approval
> chain over email, and receive a PDF record when it completes.

| | |
|---|---|
| **Document version** | 1.0 |
| **Last updated** | 2026-08-29 |
| **Repository** | `unblock-ai-app` (branch `dev`, mainline `main`) |
| **Audience** | Engineers, architects, product stakeholders, reviewers, presenters |
| **Status of the system** | Working end-to-end for the happy path; see [§16 Limitations](#16-known-limitations--explicitly-out-of-scope) |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem and the Product Idea](#2-the-problem-and-the-product-idea)
3. [System at a Glance](#3-system-at-a-glance)
4. [The Workflow Schema — The Core Design Artifact](#4-the-workflow-schema--the-core-design-artifact)
5. [Functional Areas — End to End](#5-functional-areas--end-to-end)
6. [Backend Architecture](#6-backend-architecture)
7. [Data and Persistence](#7-data-and-persistence)
8. [Frontend Architecture](#8-frontend-architecture)
9. [HTTP API Reference](#9-http-api-reference)
10. [Configuration Reference](#10-configuration-reference)
11. [AI / LLM Engineering](#11-ai--llm-engineering)
12. [Security Model and Trust Boundaries](#12-security-model-and-trust-boundaries)
13. [Testing and Quality Strategy](#13-testing-and-quality-strategy)
14. [Operations — Setup, Run, Build, Deploy](#14-operations--setup-run-build-deploy)
15. [Engineering Conventions and Standards](#15-engineering-conventions-and-standards)
16. [Known Limitations & Explicitly Out of Scope](#16-known-limitations--explicitly-out-of-scope)
17. [Roadmap and Extension Points](#17-roadmap-and-extension-points)
18. [Glossary](#18-glossary)
19. [Appendices](#19-appendices)

---

# 1. Executive Summary

## 1.1 What UNBLOCK-AI is

Institutions — universities, hospitals, government offices, companies — run on
approval processes that exist only as prose: a paragraph in a handbook, an email
convention, or tribal knowledge. "A student travelling overseas needs their
advisor's approval, then the Head of Department; if the trip is longer than
fourteen days the Dean must sign off too."

Those processes are **real, structured, and enforceable** — but they live as text,
so nothing can execute them. Requesters don't know who to ask, in what order, or
what information to bring. Approvers get ad-hoc emails with no context. Nobody has
a record.

UNBLOCK-AI closes that gap in four moves:

| # | Move | Who | Result |
|---|---|---|---|
| 1 | **Compile** | Admin pastes the policy prose | An LLM extracts it into a strict JSON **workflow graph**, machine-validated and rendered as a flowchart the admin verifies and publishes |
| 2 | **Find** | Requester describes their need in plain language | Vector retrieval + an LLM selector agent maps that request onto exactly one published template — or honestly says it can't |
| 3 | **Fill & Run** | Requester answers one question at a time | A task is compiled from the template, values are validated, and the approval chain runs over real email with signed per-step links |
| 4 | **Record** | System, on completion | A deterministic PDF record of the whole request — inputs, computed values, follow-ups, and every approval — emailed and downloadable |

## 1.2 The shape of the system

Two applications in one repository:

| Project | Role | Stack | Port |
|---|---|---|---|
| [`unblock-ai-api/`](unblock-ai-api/) | Backend — extraction, validation, storage, retrieval, planning, execution, documents | Node 18+ · TypeScript 5.9 (strict) · Express 5 · MongoDB 7 · PostgreSQL 17 · Azure OpenAI | 3000 |
| [`unblock-ai-web/`](unblock-ai-web/) | Frontend — admin authoring surface, requester portal, approver decision page | Next.js 16.3 (App Router, RSC) · React 19.2 · Tailwind CSS v4 · React Flow | 3001 |

Roughly **8,100 lines** of backend source across 169 TypeScript files, and
**6,700 lines** of frontend source across 89 files, backed by **43 backend test
files** and 3 frontend test files.

## 1.3 The five ideas that define the design

Everything else follows from these. If you read nothing else in this document,
read this list.

**1. A workflow is a dependency graph, not a checklist.**
Every step carries `depends_on: [{ step_id, required_outcome }]`. Sequencing,
parallelism, and gating are not three features — they are one mechanism.
See [§4.2](#42-steps-is-a-graph).

**2. Actors are roles, never named people.**
A step is assigned to `head_of_department relative_to requester`, not to
"Dr. Perera". This is what makes a template reusable across every requester in
the institution. See [§4.3](#43-actors-are-roles-not-people).

**3. Structure beats free text, everywhere the machine must reason.**
Conditions are `{operator, left, right}` over dotted namespace paths. Computed
values use a fixed operation set. No free-text formulas the model could invent and
nothing could evaluate. See [§4.4](#44-conditions-and-computed-values-are-structured).

**4. The LLM is fenced in by a schema and a validator, then given a chance to fix itself.**
Extraction uses OpenAI structured outputs with `strict: true`, then runs eight
semantic graph checks that JSON Schema cannot express, then feeds any failures back
to the model for repair — up to three attempts. See [§11.2](#112-the-extraction-pipeline).

**5. Uncertainty is a first-class outcome, never a guess.**
The selector agent may return `no_match` and stop. The extractor may declare the
input "not a workflow" and refuse. A round budget expires into a manual list. The
system is designed to say "I don't know" rather than stretch to the nearest
plausible answer. See [§5.6](#56-retrieval--the-selector-agent).

## 1.4 Current maturity

| Area | State |
|---|---|
| Prose → validated workflow JSON | **Working**, with a self-repair loop and live accuracy tests |
| Admin authoring UI with flowchart | **Working** |
| Publish gate (`pending_admin_review` → `confirmed`) | **Working** |
| Retrieval + clarifying-question selection | **Working**, with a scored evaluation harness |
| Requirement collection and validation | **Working** |
| Email approval chain (approve / reject / request-more-info) | **Working**, default transport logs to console |
| Completion PDF record | **Working**, deterministic and hash-verified |
| Auth (admin + portal), deletion audit log | **Working** |
| Directory / HR integration for real approver identity | **Not built** — approver emails are requester-supplied |
| SLA reminders, escalation, `condition` evaluation at runtime | **Not built** — the schema carries the fields; nothing reads them |

---

# 2. The Problem and the Product Idea

## 2.1 The problem, stated precisely

Consider a single real process: a faculty member requesting overseas leave.

**What exists today:** a paragraph in a staff handbook. It says the request goes to
the academic advisor, then the Head of Department, and — if the absence exceeds
fourteen days — the Dean. It mentions that any approver may ask for more
information, and that a rejection ends the process.

**What that costs, per request:**

- The requester doesn't know the fourteen-day rule until someone tells them.
- They email the wrong person first, or all three at once.
- Each approver receives a bare request with no context about what came before.
- "Request more information" happens by reply-all and loses the thread.
- Nobody can answer "where is my request?" without asking someone.
- When it completes, there is no record beyond a mailbox.

**What is actually true about that paragraph:** it is a precise, executable
specification. Three approvers, one dependency chain, one numeric condition, one
loop-back, one terminal rejection. It is a program written in English.

## 2.2 The product idea

> **Treat institutional policy prose as source code, and compile it.**

The admin does not fill in a form-builder or drag boxes on a canvas. They **paste
the paragraph**. The system compiles it into a graph, shows them the flowchart, and
asks them to verify. Verification is the human's job; authoring is not.

Downstream of that compiled artifact, everything else becomes mechanical:

```
   POLICY PROSE                        (the source)
        |  compile  (LLM + schema + graph validation)
        v
   WORKFLOW GRAPH                      (the program)
        |  publish  (admin verifies the flowchart)
        v
   PUBLISHED TEMPLATE                  (the library)
        |  retrieve + select  (embeddings + selector agent)
        v
   MATCHED TEMPLATE                    (the right program for this request)
        |  compile  (planner -> requirement list)
        v
   TASK                                (the process instance)
        |  collect -> finalize -> start -> decide -> advance
        v
   COMPLETION RECORD                   (the receipt)
```

## 2.3 Who uses it

| Persona | Surface | What they do |
|---|---|---|
| **Workflow administrator** | `/admin` (session-authenticated, `admin` audience) | Paste prose, generate, inspect the flowchart, edit, publish, rename, delete. Review the deletion audit log. |
| **Requester** | `/portal` (session-authenticated, `portal` audience) | Describe a need in plain language, answer clarifying questions, fill requirements, submit, track status, download the record. |
| **Approver** | `/approvals/:token` (**no account**, token-authenticated) | Open a link from an email, see the request in context, approve / reject with a reason / ask for more information. |

The approver having **no account at all** is a deliberate constraint that shapes the
whole auth design — see [§12.2](#122-two-independent-authentication-mechanisms).

## 2.4 Worked example — the process this system was designed against

`it_faculty_overseas_leave` is one of two fully worked fixtures in the repo. It
serves three roles simultaneously: few-shot prompt example, validation test
fixture, and live extraction-accuracy gold data.

```
                    +----------------------+
   requester ------>|  advisor_review      |  (approval, entry step)
   submits          |  academic_advisor    |
                    +----------+-----------+
                     approved  |  rejected -> terminate_workflow
                               |  request_more_info -> reopen_input (self)
                               v
                    +----------------------+
                    |  hod_review          |  (approval)
                    |  head_of_department  |
                    +----------+-----------+
                     approved  |
                               v
                    +----------------------+
                    |  dean_review         |  (approval, conditional)
                    |  dean                |  condition:
                    +----------+-----------+  computed.trip_duration_days > 14
                               |
                               v
                          completion
                     issue_reference_number
                        notify requester
```

The second fixture, `departmental_event_workshop`, exercises the *other* half of the
schema: **parallel** branches (hall booking and speaker clearance run
simultaneously), and a step that consumes a prior step's response field via
`context_from_steps` (refreshments needs the hall's `confirmed_capacity`).

Between them, the two fixtures cover: sequential chains, parallel branches,
conditional steps, computed values, loop-backs, terminal rejection, cross-step data
binding, and both `dynamic` and `static` actor resolution.

---

# 3. System at a Glance

## 3.1 Runtime topology

```
+----------------------------------------------------------------------------+
|  BROWSER                                                                    |
|                                                                             |
|   /admin/*          /portal/*         /approvals/:token                     |
|   admin session     portal session    NO session - token only               |
+-------+-----------------+-------------------+-------------------------------+
        |                 |                   |
        v                 v                   v
+----------------------------------------------------------------------------+
|  unblock-ai-web  ·  Next.js 16 App Router  ·  :3001                        |
|                                                                             |
|   proxy.ts ---------- route guard: verifies ua_session HMAC + expiry        |
|   Server Components - read httpOnly cookie, call API directly w/ Bearer     |
|   /api/auth/login --- sets the httpOnly cookie on THIS origin               |
|   /api/proxy/* ------ forwards browser fetches upstream, attaching Bearer   |
|   lib/api/client.ts - THE single fetch chokepoint (+ apiBlob for the PDF)   |
+-------------------------------+--------------------------------------------+
                                |  HTTP /api  (Bearer session token)
                                v
+----------------------------------------------------------------------------+
|  unblock-ai-api  ·  Express 5  ·  :3000                                    |
|                                                                             |
|  requestId -> requestLogger -> cors -> jsonBody(1MB) -> authenticate        |
|           -> /api router (requireAuth / requireRole per route)              |
|           -> notFound -> errorHandler                                       |
|                                                                             |
|  routes -> controllers -> services -> models -> db                          |
|                                                                             |
|  SERVICES                                                                   |
|   Draft · Extraction · Validation · Workflow · Embedding                    |
|   Retrieval · Selector · Selection                                          |
|   Planner · Task · Execution · Approval · Notification                      |
|   CompletionDocument · Auth · Audit · DeletionLog                           |
|                                                                             |
|  PLUGGABLE ADAPTERS (factory behind an interface)                           |
|   IVectorStore      memory | atlas                                          |
|   IMailer           console | smtp                                          |
|   IAuthStore        memory | postgres                                       |
|   IDocumentRenderer text   | pdf                                            |
+----+--------------+---------------+-----------------+----------------------+
     |              |               |                 |
     v              v               v                 v
+----------+  +----------+  +--------------+  +--------------+
| MongoDB  |  | Postgres |  | Azure OpenAI |  | SMTP / stdout|
|   7      |  |    17    |  |  chat +      |  |              |
|          |  |          |  |  embeddings  |  |              |
| drafts   |  | admin_   |  |              |  | approval     |
| templates|  |  users   |  | gpt-4o       |  | links + PDF  |
| tasks    |  | portal_  |  | text-embed-  |  |              |
| selection|  |  users   |  |  ding-3-small|  |              |
| _sessions|  | template_|  |              |  |              |
| counters |  | deletions|  |              |  |              |
| audit_   |  |          |  |              |  |              |
|  logs    |  |          |  |              |  |              |
+----------+  +----------+  +--------------+  +--------------+
```

## 3.2 The nine functional areas

| # | Area | Primary services | Doc |
|---|---|---|---|
| A | Authentication & authorization | `auth.service`, `auth-store/` | [§5.1](#51-authentication--authorization) |
| B | Draft management | `draft.service` | [§5.2](#52-draft-management) |
| C | LLM extraction | `extraction.service` | [§5.3](#53-llm-extraction--prose--workflow-json) |
| D | Validation | `validation.service`, `graph-validator.util` | [§5.4](#54-validation--schema--graph) |
| E | Versioned storage & embeddings | `workflow.service`, `embedding.service` | [§5.5](#55-versioned-template-storage--embeddings) |
| F | Retrieval & selector agent | `retrieval.service`, `selector.service`, `selection.service` | [§5.6](#56-retrieval--the-selector-agent) |
| G | Task planning | `planner.service`, `task.service` | [§5.7](#57-task-planning--requirement-collection) |
| H | Approval execution | `execution.service`, `approval.service`, `notification.service` | [§5.8](#58-approval-execution) |
| I | Completion documents | `completion-document.service`, `document/` | [§5.9](#59-completion-documents) |
| — | Deletion & audit | `deletion-log.service`, `audit.service` | [§5.10](#510-deletion-tracking-and-audit) |

## 3.3 Technology choices and why

### Backend

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Node.js ≥18, ES modules (`"type": "module"`) | Native ESM; `.js` extensions on every relative TS import (NodeNext) |
| Language | TypeScript 5.9, `strict: true` | Explicit types on every exported function, class, and constant |
| Framework | Express 5 | `app.ts` builds the app, `server.ts` listens — split so tests can mount the app in-process without a port |
| LLM | Azure OpenAI via the official `openai` SDK's `AzureOpenAI` client | Enterprise deployment, regional data residency, structured-output support |
| Embeddings | Azure AI Foundry, `text-embedding-3-small`, 1536-dim | Separate resource from chat — its own endpoint, key, and API version |
| Schema validation | AJV 8, draft 2020-12, + `ajv-formats` | Full support for the 2020-12 dialect this schema uses |
| Primary DB | MongoDB 7, official driver, **no ODM** | Workflow documents are deeply nested and schema-versioned; an ODM would duplicate the JSON Schema that already governs them |
| Auth DB | PostgreSQL 17, `pg`, **no ORM** | Relational, hard uniqueness constraints, real foreign keys — see [§7.3](#73-why-two-databases) |
| PDF | `pdfkit`, Standard-14 fonts | No headless browser, no font bundling, deterministic byte output |
| Mail | `nodemailer` (SMTP) or a console transport | Console transport makes the whole approval chain demonstrable with no mail account |
| Testing | Node's built-in `node:test` via `tsx`, + `mongodb-memory-server` | No Jest, no Vitest on the backend — one fewer toolchain |
| Config | `dotenv`, read once, validated at startup | `env.config.ts` is the **only** file permitted to touch `process.env` |

### Frontend

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.3, App Router, RSC | Server Components read the httpOnly session cookie directly — no client-side token handling |
| UI | React 19.2 | |
| Styling | Tailwind CSS v4 via the PostCSS plugin | No `tailwind.config` file; design tokens live in `globals.css` |
| Flowchart | `@xyflow/react` v12 (React Flow) + `dagre` | Auto-layout from `depends_on`, so the graph is derived, never hand-positioned |
| Data fetching | SWR client-side; `force-dynamic` Server Components for admin/portal pages | Approval state is never safe to serve stale |
| Testing | Vitest | |
| Lint | ESLint 9 + `eslint-config-next` | |

> **Note on Next.js 16:** `middleware.ts` was renamed `proxy.ts` (same convention,
> new name and export). `unblock-ai-web/AGENTS.md` is a generated block warning that
> this Next version differs from older conventions — consult
> `node_modules/next/dist/docs/` before writing new framework-level code.

## 3.4 Repository layout

```
unblock-ai-app/
├─ PROJECT_DOCUMENTATION.md      <- this document
├─ docs/                          cross-cutting design + phase plans (13 documents)
│   ├─ overview.md                     the prior single-page reference
│   ├─ task-planner-design.md          area G design
│   ├─ approval-execution-design.md    area H design
│   ├─ auth-and-deletion-tracking-phase-plan.md
│   ├─ completion-document-email-phase-plan.md
│   ├─ requester-contact-gap.md  ·  requester-contact-implementation-plan.md
│   ├─ web-task-approval-*.md    ·  approver-page-gap-fixes-phase-plan.md
│   └─ admin-template-open-performance-phase-plan.md
├─ unblock-ai-api/
│   ├─ src/          169 .ts files, ~8,100 LOC
│   ├─ scripts/      10 CLI scripts (init-db, migrate, seed, backfill, evaluate, smoke tests)
│   ├─ tests/        43 test files across unit / integration / live
│   └─ docs/         api/ · architecture/ · guides/ · plans/ · postman/
└─ unblock-ai-web/
    ├─ src/          89 .ts/.tsx files, ~6,700 LOC
    └─ docs/         fe-api-migration-plan.md (historical)
```

The complete `src/` trees are in [Appendix A](#appendix-a--complete-source-tree).

---

# 4. The Workflow Schema — The Core Design Artifact

**File:** [`unblock-ai-api/src/data/schemas/workflow.schema.json`](unblock-ai-api/src/data/schemas/workflow.schema.json) — 511 lines, JSON Schema draft 2020-12.

This is the single most important file in the repository. Everything upstream
produces it and everything downstream consumes it. Changing it ripples into the
extraction prompt, the graph validator, the planner, the execution engine, the
flowchart renderer, the completion document builder, and three test tiers at once.

## 4.1 Top-level shape

```jsonc
{
  "schema_version":     "1.0",
  "workflow_id":        "it_faculty_overseas_leave",   // ^[a-z][a-z0-9_]*$
  "title":              "Faculty Overseas Leave Request",
  "description":        "...",
  "retrieval_summary":  { /* how the selector finds this workflow */ },
  "scope":              { "institution_type": "university",
                          "applies_to": { "actor_type": "faculty", "constraints": [] } },
  "requester":          { "actor_type": "faculty", "identifier_field": "staff_id" },
  "inputs":             [ /* what the requester must supply */ ],
  "computed":           [ /* derived values, fixed operation set */ ],
  "steps":              [ /* the dependency graph - minItems: 1 */ ],
  "completion":         { "rule", "required_steps", "actions" },
  "metadata":           { /* provenance + the model's own self-assessment */ }
}
```

`additionalProperties: false` is set on **every** object in the schema. Nothing
undeclared can appear anywhere.

Enumerated vocabularies fixed by the schema:

| Field | Allowed values |
|---|---|
| `scope.institution_type` | `university` `school` `company` `hospital` `government` `other` |
| `scope.applies_to.actor_type`, `requester.actor_type` | `student` `staff` `faculty` `external` `any` |
| `step.type` | `approval` `notification` `data_collection` `automated_action` `review` |
| `step.initial_state` | `auto` `blocked` |
| input / response-field `type` | `string` `text` `number` `date` `datetime` `boolean` `email` `phone` `enum` `file` `person` |
| `completion.rule` | `all_required_steps_complete` `any_step_complete` `specific_steps` |
| `completion_action.type` | `issue_reference_number` `notify` `instruction_to_requester` |
| `notification_setting.channel` | `email` `sms` `in_app` |
| `metadata.confidence` | `high` `medium` `low` |
| `metadata.review_status` | `pending_admin_review` `confirmed` `rejected` |

## 4.2 `steps` is a graph

Each step declares its own preconditions:

```jsonc
{
  "id": "dean_review",
  "name": "Dean Approval",
  "type": "approval",
  "assignee": { "resolution": "dynamic", "role": "dean",
                "relative_to": "requester", ... },
  "depends_on": [
    { "step_id": "hod_review", "required_outcome": "approved" }
  ],
  "initial_state": "blocked",
  "condition": { "operator": "greater_than",
                 "left": "computed.trip_duration_days", "right": 14,
                 "clauses": [], "description": "Trips over 14 days need the Dean" },
  "instructions_to_approver": "...",
  "response_fields": [ /* structured data the approver returns */ ],
  "context_from_steps": [ /* bind a prior step's response field into this step */ ],
  "outcomes": { "approved": {...}, "rejected": {...}, "request_more_info": {...} },
  "notifications": { "on_assign": {...}, "on_outcome": {...} },
  "sla": { "reminder_after_hours": 48, "escalate_after_hours": 96 }
}
```

**Why a graph and not a list:** four concepts collapse into one mechanism.

| Concept | How it is expressed | No special field needed |
|---|---|---|
| Sequence | B `depends_on` A | yes |
| Parallelism | B and C both `depends_on` A | yes |
| Gating | B `depends_on` A **with `required_outcome: "approved"`** | yes |
| Entry point | `depends_on: []` | yes |

A step with no dependencies is an entry step. Two steps with the same single
dependency run in parallel. A step that requires a specific outcome is gated. The
execution engine ([§5.8](#58-approval-execution)) needs exactly one rule:
*a blocked step whose every dependency has recorded its required outcome becomes ready.*

## 4.3 Actors are roles, not people

Every `assignee`, `collected_from`, and notification target is an **actor object**
with four resolution modes:

| `resolution` | Meaning | Example |
|---|---|---|
| `dynamic` | Look up in a directory, **relative to** another actor | `{ role: "head_of_department", relative_to: "requester" }` |
| `static` | A fixed office that doesn't vary per requester | `{ role: "facilities_office", directory_query: "..." }` |
| `requester` | Whoever started the workflow | supplies inputs |
| `system` | Automated, no human | `review` steps, notifications |

```jsonc
{
  "resolution":      "dynamic",
  "role":            "head_of_department",   // snake_case, normalised
  "relative_to":     "requester",
  "directory_query": null,
  "fallback_role":   "dean",
  "display_name":    "Head of Department"
}
```

**Why this matters:** it is what makes a template *a template*. One
`it_faculty_overseas_leave` document serves every faculty member in the
institution, because it never names a person — it names a relationship.

**Role vocabulary is suggested, not enforced.**
[`src/data/vocabulary/role.vocabulary.ts`](unblock-ai-api/src/data/vocabulary/role.vocabulary.ts)
groups suggested roles (academic, administrative, financial, facilities, security,
IT, generic). The model may coin a new role; when it does, that role is flagged in
`metadata.unmapped_roles` for admin review rather than being rejected as an error.
An unfamiliar institution should not fail extraction.

## 4.4 Conditions and computed values are structured

**Conditions** are trees, never expressions. Twelve operators:
`equals` `not_equals` `greater_than` `less_than` `greater_or_equal`
`less_or_equal` `in` `not_in` `exists` `and` `or` `not`.

```jsonc
{
  "operator": "and",
  "left": null, "right": null,
  "clauses": [
    { "operator": "greater_than", "left": "computed.trip_duration_days",
      "right": 14, "clauses": [], "description": null },
    { "operator": "equals", "left": "inputs.funding_source",
      "right": "external", "clauses": [], "description": null }
  ],
  "description": "Long trips with external funding"
}
```

**Computed values** use a closed operation set:

| Operation | Arguments used | Meaning |
|---|---|---|
| `date_diff_days` | `from`, `to`, `inclusive` | Days between two dates |
| `sum` | `values` | Sum of the resolved values |
| `difference` | `values` | First minus the rest |
| `multiply` | `values` | Product |
| `count` | `values` | Number of non-null values |
| `lookup` | `source`, `key` | Value at a key in a source |
| `constant` | `value` | A fixed literal |

**Why closed sets:** a free-text formula (`"end_date - start_date"`) would be a
string that the model invents and no downstream component can evaluate safely. A
fixed operation set is a contract the extractor, the evaluator
([`computed-evaluator.util.ts`](unblock-ai-api/src/utils/workflow/computed-evaluator.util.ts)),
and the validator all agree on.

## 4.5 The flat data namespace

One shared namespace exists for the lifetime of a workflow run. Every reference in
a condition, a computed argument, or a `context_from_steps` binding is a dotted path
into it:

| Prefix | Resolves to |
|---|---|
| `inputs.<id>` | A value the requester supplied |
| `computed.<id>` | A derived value |
| `steps.<id>.outcome` | `approved` \| `rejected` \| `request_more_info` |
| `steps.<id>.response.<field>` | A structured field an approver returned |
| `requester.<attr>` | An attribute of whoever started the workflow |
| `system.today` | The current date |

[`checkNamespacePaths`](unblock-ai-api/src/utils/workflow/graph-validator.util.ts)
verifies that every path used anywhere in the document actually resolves to
something declared elsewhere in the same document. A dangling
`computed.trip_duration` that was never declared is a validation failure, not a
runtime surprise.

## 4.6 Outcomes: the three-key rule

**Every outcome-bearing step has exactly three keys** — `approved`, `rejected`,
`request_more_info` — and each is either an outcome effect or explicitly `null`.

```jsonc
"outcomes": {
  "approved":          { "action": "continue",           "notify": [...],
                         "include_reason": false, "return_to_step": null,
                         "prompt_source": null },
  "rejected":          { "action": "terminate_workflow", "notify": [...],
                         "include_reason": true,  "return_to_step": null,
                         "prompt_source": null },
  "request_more_info": { "action": "reopen_input",       "notify": [...],
                         "include_reason": true,  "return_to_step": "self",
                         "prompt_source": "approver_note" }
}
```

Three `action` values exist: `continue`, `terminate_workflow`, `reopen_input`.

**Two consequences worth calling out:**

**Loop-backs stay acyclic.** "Send it back for more information" is *not* a backward
edge in the graph. It is an **outcome** on the same step with
`action: "reopen_input", return_to_step: "self"`. The dependency graph therefore
remains a strict DAG, and `checkNoCycles` can be an unconditional invariant rather
than a rule with exceptions.

**Terminal rejection is an outcome, not a workflow field.** There is no
`workflow.on_rejection`. A rejection that ends the process is
`outcomes.rejected.action === "terminate_workflow"` on the step that rejected. The
execution engine finds the terminator by scanning steps, which means *any* step can
be terminal without the document declaring it twice.

## 4.7 Strict-mode discipline

The extraction call uses OpenAI's `strict: true` structured-output mode, which
requires a fully closed schema. That forces three rules on every emitted document:

1. **Every property declared in the schema must be present in the output.** No
   optional-by-omission.
2. **Unused scalars are `null`** — never omitted.
3. **Unused arrays are `[]`** — never `null`, never omitted.

This is why `outcome_effect` always carries `return_to_step` and `prompt_source`
even when they don't apply, and why `computedArguments` declares all seven argument
slots regardless of operation.

## 4.8 `metadata` — provenance and self-assessment

```jsonc
"metadata": {
  "created_from":        "plain_text",
  "source_text_hash":    "<sha256 of the normalised source prose>",
  "extraction_model":    "gpt-4o",
  "extraction_timestamp":"2026-08-29T...",
  "confidence":          "high",
  "ambiguities":         [ "Assumed 'department head' means head_of_department" ],
  "unmapped_roles":      [ "faculty_registrar" ],
  "review_status":       "pending_admin_review"
}
```

Two fields do real work beyond record-keeping:

- **`ambiguities`** is where the model reports assumptions it had to make. It is
  shown to the admin during review, turning a silent guess into a visible decision.
- **`review_status`** is the **publish gate**. Retrieval only ever sees `confirmed`
  templates ([§5.5](#55-versioned-template-storage--embeddings)). It is also the
  channel by which the extractor **refuses** non-workflow input — see below.

## 4.9 Non-workflow input is a first-class outcome

If the source text describes no institutional process at all ("here is my grocery
list"), the prompt instructs the model **not** to hallucinate a workflow. Instead it
emits the smallest valid document — one `review` step, `system`-resolved, with
`metadata.review_status: "rejected"`.

The extraction service then rejects that result with `ExtractionError` (HTTP 422),
even though it is schema-valid. Refusal is modeled inside the schema so the model
always has a legal way to say "this isn't a workflow" rather than being forced to
invent one.

## 4.10 `retrieval_summary` — the field that makes selection work

```jsonc
"retrieval_summary": {
  "one_liner":       "Faculty request approval for overseas travel absence.",
  "aliases":         ["overseas leave", "foreign travel", "travel abroad"],
  "keywords":        ["leave", "travel", "overseas", "absence"],
  "requester_types": ["faculty", "staff"],
  "triggers":        ["planning a conference abroad", "sabbatical travel"],
  "not_for":         ["local day trips", "student exchange programmes"]
}
```

This block is what gets embedded for vector search and what the selector agent
reads when choosing between candidates. **`not_for` is doing more work than it
looks like** — it is how a template declares what it is *not*, which is precisely
what a selector needs to reject a near-miss instead of stretching to it.

---

# 5. Functional Areas — End to End

## 5.1 Authentication & Authorization

**Code:** [`src/services/auth.service.ts`](unblock-ai-api/src/services/auth.service.ts) ·
[`src/services/auth-store/`](unblock-ai-api/src/services/auth-store/) ·
[`src/middlewares/authenticate.middleware.ts`](unblock-ai-api/src/middlewares/authenticate.middleware.ts) ·
[`src/middlewares/require-auth.middleware.ts`](unblock-ai-api/src/middlewares/require-auth.middleware.ts)

### Two user tables, not one table with a role column

`admin_users` and `portal_users` are **separate PostgreSQL tables**. They are
different privilege domains with different columns — `portal_users` carries a
`faculty` column that feeds `getRequesterContext()`; `admin_users` does not need it.
Collapsing them into one table with a `role` column would mean every query carries a
filter that a missing `WHERE` clause could silently drop.

### Stateless HMAC-signed bearer tokens

Sessions are signed tokens ([`session-token.util.ts`](unblock-ai-api/src/utils/auth/session-token.util.ts)),
mirroring the approval-token pattern already in the codebase. There is **no
`sessions` table**.

| Property | Consequence |
|---|---|
| Nothing to look up per request | Verification is a single HMAC check |
| Nothing to delete | **No revocation** — "log out everywhere" is impossible |
| Secret rotation invalidates everything | Acceptable for three seeded users |

`SESSION_TOKEN_SECRET` is **required in production**; in dev it falls back to a
random per-process value (a restart invalidating sessions beats shipping a default
secret in a config file). It must differ from `APPROVAL_TOKEN_SECRET` — the config
module throws `ConfigurationError` at startup if they match.

### Authentication and authorization are two separate layers

This split is load-bearing:

```
authenticate middleware   - runs on EVERY request
                            parses the Bearer token, populates req.user
                            NEVER rejects

requireAuth()             - per-route guard: any valid session, either audience
requireRole("admin")      - per-route guard: audience must be "admin"
```

**Why:** `/api/approvals/*` is authenticated by a **completely different
mechanism** — a per-step approval token in the URL. An approver has no account and
no session. If authentication rejected unauthenticated requests globally, the entire
approval path would be unreachable. Instead, `authenticate` is permissive and
observational; the guards do the gating, applied only where they belong.

### Password hashing: `node:crypto` scrypt

Not `bcrypt`, not `argon2`. Both require a native build toolchain, which is
painful on Windows and adds a compilation step to CI. `scrypt` is a memory-hard KDF
already in the Node standard library —
[`password.util.ts`](unblock-ai-api/src/utils/shared/password.util.ts).

### Failed-attempt tracking

`failed_attempt_count` and `last_failed_attempt_at` are incremented on a wrong
password against a known username. **Lockout enforcement is off by default**
(`AUTH_MAX_FAILED_ATTEMPTS=0`) — attempts are tracked regardless, so turning
enforcement on later needs no migration. There is **no IP-based rate limiting**.

### The auth store is pluggable

`IAuthStore` has `postgres` and `memory` implementations, selected by
`AUTH_STORE_BACKEND`. The `memory` backend is what lets `npm test` run with **no
live PostgreSQL at all** — the same trick `mongodb-memory-server` provides for Mongo.

### Web-side session flow

```
1. User posts credentials to  unblock-ai-web  POST /api/auth/login   (Route Handler)
2. That handler calls the API POST /api/auth/login -> { token, user, expires_at }
3. It sets an httpOnly cookie  ua_session  ON THE WEB APP'S OWN ORIGIN
4. proxy.ts verifies that cookie's HMAC + expiry before /admin* or /portal* renders
5. Server Components read the cookie and call the API directly with a Bearer header
6. Browser fetches go through /api/proxy/*, which reads the cookie server-side
   and attaches the Bearer header upstream
```

**Step 3 is deliberate.** The cookie is set by the *web app*, never by the API. That
keeps the flow working if the API later moves to a different domain, and means the
token never reaches JavaScript — only an httpOnly `Set-Cookie`.

**Step 6 exists because** a browser fetch can never read an httpOnly cookie to set
its own `Authorization` header. The same-origin proxy Route Handler can.

**`proxy.ts` is UX, not security.** A forged cookie there just bounces someone to a
login page. The real boundary is the API's `requireAuth()` / `requireRole()`. The
proxy still verifies the signature and expiry rather than merely checking the
cookie exists — a bare presence check is defeated by setting any junk value with the
right name.

---

## 5.2 Draft Management

**Code:** [`src/services/draft.service.ts`](unblock-ai-api/src/services/draft.service.ts) ·
[`src/models/draft.model.ts`](unblock-ai-api/src/models/draft.model.ts)

The `drafts` collection stores raw admin prose before it becomes anything.

| Property | Behaviour |
|---|---|
| **Idempotent by content** | Keyed on SHA-256 of the *normalised* text (`hash.util.ts`), with a unique index `draft_text_sha256_unique`. Resubmitting identical prose returns the original draft — no duplicate. |
| **Lifecycle** | `pending` → `extracted` \| `failed` \| `rejected` |
| **Failures preserve the prose** | On a failed extraction the draft is updated with `failure_reason` as a side effect *before* the error propagates. The admin's typing is never lost to a model failure. |

The draft is also the source of the left-hand prose panel in the admin editor, and
`draft_id` on a template is the link back to the text a workflow was compiled from.

---

## 5.3 LLM Extraction — Prose → Workflow JSON

**Code:** [`src/services/extraction.service.ts`](unblock-ai-api/src/services/extraction.service.ts) ·
[`src/data/prompts/`](unblock-ai-api/src/data/prompts/)

The centrepiece. Four stages — detailed further in [§11.2](#112-the-extraction-pipeline).

```
   prose
     |
     v
  +----------------------------------------------------------+
  | 1. PROMPT ASSEMBLY                                        |
  |    system prompt (all schema semantics)                   |
  |    + 2 few-shot examples (real sample files)              |
  |    + the admin's text                                     |
  +------------------------+---------------------------------+
                           v
  +----------------------------------------------------------+
  | 2. STRUCTURED-OUTPUT CALL                                 |
  |    response_format: json_schema, strict: true             |
  |    temperature: 0 (skipped for o*/gpt-5* reasoning models)|
  +------------------------+---------------------------------+
                           v
  +----------------------------------------------------------+
  | 3. TWO-LAYER VALIDATION                                   |
  |    AJV schema check  +  8 semantic graph checks           |
  +-------+----------------------------------+---------------+
     pass |                             fail |
          |                                  v
          |        +---------------------------------------+
          |        | 4. SELF-REPAIR LOOP                    |
          |        |    append invalid JSON + error list    |
          |        |    as conversation turns; ask the model|
          |        |    to fix ONLY those problems          |
          |        |    up to EXTRACTION_MAX_ATTEMPTS (3)   |
          |        +----------+---------------+-------------+
          |            retry  |        spent  |
          |                   +-->(back to 2) v
          |                              ExtractionError 422
          v
  +----------------------------------------------------------+
  | 5. NON-WORKFLOW GUARD                                     |
  |    metadata.review_status === "rejected"  ->  422          |
  +----------------------------------------------------------+
```

**The self-repair loop is the quality mechanism.** A structured-output call
guarantees the *shape* is right; it cannot guarantee the *graph* is coherent. The
repair loop closes that gap by handing the model its own failure and asking for a
targeted fix, which is far more reliable than regenerating from scratch.

---

## 5.4 Validation — Schema + Graph

**Code:** [`src/services/validation.service.ts`](unblock-ai-api/src/services/validation.service.ts) ·
[`src/utils/workflow/schema-validator.util.ts`](unblock-ai-api/src/utils/workflow/schema-validator.util.ts) ·
[`src/utils/workflow/graph-validator.util.ts`](unblock-ai-api/src/utils/workflow/graph-validator.util.ts)

Validation is **deliberately a standalone capability**, not a private step inside
extraction. That is what lets an admin hand-edit a workflow in the UI and re-validate
it before saving, and it is what backs `POST /api/workflows/:id/validate`.

### Layer 1 — Schema validation (AJV)

Structural conformance to `workflow.schema.json`: types, enums, required
properties, patterns, `additionalProperties: false`.

### Layer 2 — Graph validation (eight semantic checks)

These express what JSON Schema cannot:

| Check | Catches | Algorithm |
|---|---|---|
| `checkDependencyReferences` | `depends_on` pointing at a step that doesn't exist | Set membership |
| `checkRequiredOutcomes` | A `required_outcome` the target step doesn't define | Lookup |
| `checkNoCycles` | A cycle in the dependency graph | White/gray/black DFS |
| `checkEntryStepExists` | No step with empty `depends_on` — nothing can start | Scan |
| `checkReachability` | Orphaned steps unreachable from any entry | BFS from entries |
| `checkApprovalOutcomes` | An `approval` step missing `approved` or `rejected` | Scan |
| `checkCompletionRequiredSteps` | `completion.required_steps` naming an unknown step | Set membership |
| `checkNamespacePaths` | A dangling `inputs.*` / `computed.*` / `steps.*` / `requester.*` / `system.*` reference | Resolve every path against declarations |

`checkNamespacePaths` is the broadest: it walks conditions, computed arguments, and
`context_from_steps` bindings, and confirms every dotted path resolves to something
the document itself declares.

**Testing approach:** the two gold fixtures must pass all eight. Then **mutation
tests** deliberately break each invariant in turn and assert the corresponding check
fires. Passing fixtures alone would not prove the checks work.

---

## 5.5 Versioned Template Storage & Embeddings

**Code:** [`src/services/workflow.service.ts`](unblock-ai-api/src/services/workflow.service.ts) ·
[`src/services/embedding.service.ts`](unblock-ai-api/src/services/embedding.service.ts) ·
[`src/models/template.model.ts`](unblock-ai-api/src/models/template.model.ts)

### Templates are never updated in place

Every save creates a **new version**:

1. Look up the current max `version` for this `workflow_id`
2. Insert a new document at `version + 1` with `is_latest: true`
3. Demote the previous latest to `is_latest: false`

Guarded by a unique index on `{ workflow_id, version }`.

**Why:** a task pins the exact `{ workflow_id, version }` it was created from. An
in-progress approval chain must not change shape because an admin edited the
template underneath it. Version-pinning makes that structurally impossible rather
than merely unlikely.

### Every save generates a retrieval embedding

`text-embedding-3-small`, 1536 dimensions, computed over the
`retrieval_summary` block. The returned vector's length is validated against
`AZURE_EMBEDDING_DIM` — a dimension mismatch raises `EmbeddingError` (502) rather
than silently poisoning the index.

### `review_status` is the publish gate

```
extraction  ->  pending_admin_review   <- invisible to retrieval
                       |
      PATCH /workflows/:id/review
                       v
                  confirmed            <- findable
                       |
                       v
                  rejected             <- invisible
```

Retrieval queries filter on `is_latest: true AND review_status: "confirmed"`,
supported by the compound index `template_retrieval_filter`. **Nothing is findable
until a human publishes it.** An LLM extraction is a *proposal*; a published
template is an *institutional commitment*.

---

## 5.6 Retrieval & The Selector Agent

**Code:** [`src/services/retrieval.service.ts`](unblock-ai-api/src/services/retrieval.service.ts) ·
[`src/services/selector.service.ts`](unblock-ai-api/src/services/selector.service.ts) ·
[`src/services/selection.service.ts`](unblock-ai-api/src/services/selection.service.ts)

A multi-round conversation that maps a plain-language request onto exactly one
template — or honestly reports that it can't.

### Retrieval (once, in round 1 only)

```
user query
   |  embed  (text-embedding-3-small)
   v
vector search, k = RETRIEVAL_TOP_K + 2      <- over-fetch by 2
   |           filtered to is_latest + confirmed [+ institution_type]
   v
alias boost: +RETRIEVAL_ALIAS_BOOST per exact alias match in the query
   |
   v
slice to RETRIEVAL_TOP_K (5)
```

**Why over-fetch then slice:** the alias boost can reorder candidates. Fetching
exactly K would mean a candidate whose boost *would* have promoted it into the top
five never gets the chance, because it was cut before boosting.

**The alias boost** is a small additive bump (default `0.15`) for exact matches
against a template's declared `aliases`. Pure cosine similarity treats "overseas
leave" and "foreign travel" as merely similar; an explicit alias declares them
*equivalent for this workflow*. The boost lets a template's own vocabulary
outweigh a marginally closer generic embedding.

### The selector agent — four outcomes

An LLM reads the candidates' `retrieval_summary` blocks and the conversation so far,
then returns a structured decision:

| Decision | Meaning | Terminal? | Produced by |
|---|---|---|---|
| `matched` | One template chosen | yes | the model |
| `ambiguous` | Ask **one** clarifying question, with options | no | the model |
| `no_match` | Nothing suitable — **stops, never stretches** | yes | the model |
| `manual_choice` | Round budget spent; show the list, let the user pick | yes | **the service loop, never the model** |

### The critical design decision: retrieval runs once

`SelectionService.start()` runs retrieval and **freezes the candidate set on the
session**. Rounds 2+ (`answer()`) re-run only the *selector*, over the same frozen
candidates plus the growing transcript.

**Why:** if retrieval re-ran on each answer, the candidate set would drift under an
in-progress clarifying conversation. The user answers a question about candidates A
and B, and the system replies about candidates C and D. Freezing the set makes the
conversation coherent by construction.

### The round budget

`SELECTION_MAX_ROUNDS` (default 2). When it is spent without a match, the *service*
— not the model — emits `manual_choice` and hands the user the candidate list.

**This is a product decision, not a technical limit.** After two clarifying
questions, continuing to interrogate someone is worse than showing them five options
and letting them choose. The system stops guessing at a fixed point.

### Session record

`selection_sessions` stores the query, the frozen candidates (with scores, base
scores, and alias hits), every round, the final `outcome`
(`matched` / `abandoned` / `no_match`), the selected `workflow_id`, and the
`requester_context` handed in from the caller's session.

### `requester_context`

`{ faculty, department, actor_type }`, read from the logged-in portal user's record
server-side and passed to the selector. **The selector uses it to skip questions it
can already answer.** When the requester's faculty is known, "Which faculty are you
in?" is a question the system should never have to ask. The exact key names matter —
the selector prompt depends on them.

---

## 5.7 Task Planning — Requirement Collection

**Code:** [`src/services/planner.service.ts`](unblock-ai-api/src/services/planner.service.ts) ·
[`src/services/task.service.ts`](unblock-ai-api/src/services/task.service.ts) ·
[`src/models/task.model.ts`](unblock-ai-api/src/models/task.model.ts) ·
Design: [`docs/task-planner-design.md`](docs/task-planner-design.md)

### The core insight

Look at what a compiled template actually contains when there is no HR system:

- All the `inputs` are `resolution: "requester"` — data the user types.
- All the step `assignee`s are `resolution: "dynamic"` with roles like
  `academic_advisor` — people HR was *meant* to resolve.

Since there is no directory, **an unresolved `dynamic` assignee is just another
input**: "Who is your academic advisor? Name and email."

> **The planner compiles a template into a flat, ordered *requirement list*, where
> each requirement is either a template input or an unresolved actor. Collection is
> one uniform loop over that list.**

This is the load-bearing decision of the whole area. When directory integration
lands later, the *only* change is that actor requirements arrive pre-filled instead
of asked — the collection loop and the execution engine are untouched.

### One document, not two

An earlier draft proposed separate `plans` and `tasks` collections. **Rejected.**

An approval email link must resolve, in a single lookup, to: the request's captured
values, the workflow context, somewhere to write the decision, and something the
requester can later read the reason from. That is one document's identity, not a
join. Minting a token against a "plan" and then creating a separate "task" at
execution time means every token either points at the wrong document or needs
remapping.

**One `tasks` collection. Planning is a *status*, not a separate document.** The
task `_id` exists from the first moment values are collected and never changes.

Alongside it sits a human-facing `reference` — `TASK-2026-00042` — allocated from a
`counters` collection with a unique index. Approver emails read better with one.

### The task status machine

| `status` | Meaning |
|---|---|
| `collecting` | Values still being gathered. **The only status in which `values` can change.** |
| `ready` | Finalized — every required value filled, step states seeded |
| `in_progress` | Approval chain running (set by `POST /tasks/:id/start`) |
| `completed` | Every `completion.required_steps` step reached its required outcome |
| `rejected` | A step resolved to `terminate_workflow`; every non-terminal step became `skipped` |
| `cancelled` | Terminal, set via `PATCH /tasks/:id/status` |

### Requirement keys

| Key form | `source` | `type` | Origin |
|---|---|---|---|
| `destination_country` | `input` | schema type | A `workflow.inputs` entry |
| `actor:advisor_review` | `actor` | `person` | A `dynamic` step assignee |
| `followup:advisor_review:1` | `input` | `text` | A "request more info" reopen |

Ordering: **inputs first, in declaration order**; then **actor requirements in
topological step order**, de-duplicated so two steps needing the same
`role`/`relative_to` pair share one requirement; then follow-ups appended as
generated.

`values` is keyed by `requirement.key`. A `person` value is `{ name, email }`.

Each requirement carries `key`, `source`, `ref`, `label`, `description`, `type`,
`required`, `validation`, `collection_hint`, and `status`
(`pending` / `filled` / `skipped`).

### The four operations

**1. Create** — `POST /tasks`
Pulls the matched, version-pinned workflow off a selection session and compiles it
with `PlannerService.compile` (**pure, no I/O**) into a requirement list plus one
step-state entry per workflow step. Allocates the `reference`. Inserts with
`status: "collecting"`.

**2. Collect** — `GET /tasks/:id/next`, `POST /tasks/:id/values`
One requirement at a time. Each submitted value is type-coerced and validated by
[`value-validator.util.ts`](unblock-ai-api/src/utils/task/value-validator.util.ts),
including **cross-field checks** — a return date cannot precede the departure date
named by `not_before_field`.

There is **no LLM in this loop.** `GET /tasks/:id/next` returns a requirement's
`label` and `collection_hint` as plain strings; the caller renders the prompt. The
question phrasing is data, not generation.

**3. Finalize** — `POST /tasks/:id/finalize`
Once every *required* requirement is filled: collected `actor:*` people are attached
to their steps' `assignee`, and step states are seeded — steps with no dependencies
→ `ready`, everything else → `blocked`. `status` moves `collecting` → `ready`.

> **Finalizing is not starting.** Finalize only computes initial step states.
> Nothing progresses a step, resolves an approver, sends a notification, or issues a
> token. `steps[].approval_token` and `steps[].reason` stay `null` until
> `POST /tasks/:id/start`.

**4. Cancel** — `PATCH /tasks/:id/status`
The only other transition. Any non-terminal task can move to `cancelled`.

### Trust boundary

> **Approver email is requester-supplied and unverified.** For an `actor:*`
> requirement, the requester types in their own approver's name and email. There is
> no directory lookup. The same applies to `requester_email`. See
> [§12.4](#124-the-central-trust-gap-self-asserted-identity).

---

## 5.8 Approval Execution

**Code:** [`src/services/execution.service.ts`](unblock-ai-api/src/services/execution.service.ts) ·
[`src/services/approval.service.ts`](unblock-ai-api/src/services/approval.service.ts) ·
[`src/services/notification.service.ts`](unblock-ai-api/src/services/notification.service.ts) ·
[`src/utils/approval/`](unblock-ai-api/src/utils/approval/) ·
Design: [`docs/approval-execution-design.md`](docs/approval-execution-design.md)

### The split: a pure engine inside an I/O shell

This is the defining architectural decision of the area.

```
  +-----------------------------------------------------------+
  |  ApprovalService / TaskService        <- the I/O shell     |
  |    reads Mongo, mints tokens, sends mail, writes Mongo     |
  |                                                            |
  |    +------------------------------------------------+      |
  |    |  ExecutionService                <- pure       |      |
  |    |    advance(task, workflow) -> AdvanceResult    |      |
  |    |    applyDecision(...)      -> AdvanceResult    |      |
  |    |                                                |      |
  |    |    NO database. NO network. NO clock beyond    |      |
  |    |    what is passed in. Fully unit-testable.     |      |
  |    +------------------------------------------------+      |
  +-----------------------------------------------------------+
```

`ExecutionService.advance()` returns a `dispatched: string[]` list — **it reports
what needs sending; it never sends anything.** The shell turns that list into tokens
and emails. The graph engine is therefore provably correct without a database or a
network.

### `advance()` — the algorithm, in order

The **order of these four phases is itself a correctness property**:

```
1. TERMINATION CHECK  (first, deliberately)
   Find any step with outcome "rejected" whose workflow outcome
   action is "terminate_workflow".
   If found -> every non-terminal step becomes "skipped",
               status = rejected, dispatched = []  ->  RETURN

2. UNBLOCK
   Every "blocked" step whose EVERY depends_on entry reports its
   required_outcome  ->  becomes "ready"

3. DISPATCH
   Every "ready" step  ->  collected into dispatched[],
                           state becomes "pending_approval"

4. COMPLETION
   Evaluate workflow.completion.rule against the required_steps
```

**Why termination is checked first:** if dispatch ran before termination, a
rejection would still emit a dispatch for a step downstream of the rejection — an
email to an approver about a request that is already dead. Checking termination
first makes that impossible rather than merely unlikely.

**Completion rules:**

| `rule` | Satisfied when |
|---|---|
| `all_required_steps_complete` | every `required_steps` entry has `outcome === "approved"` |
| `any_step_complete` | any one of them does |
| `specific_steps` | every one of them does |

**Step states:** `blocked` → `ready` → `pending_approval` → `approved` / `rejected`,
plus `skipped` for anything cut off by a termination.

### Approval tokens

[`utils/approval/token.util.ts`](unblock-ai-api/src/utils/approval/token.util.ts) —
`base64url(payload) + "." + base64url(HMAC-SHA256 signature)`. **Non-throwing**:
verification returns `null` on any malformation rather than raising.

> **The token proves authenticity only.** Whether it is still *usable* —
> unexpired, unused, and its step still `pending_approval` — is checked separately by
> `ApprovalService` on **every** request. That separation means revoking an approval
> is a database write, not a key rotation.

A token is minted per dispatched step, TTL `APPROVAL_TOKEN_TTL_DAYS` (14). The
sparse index `task_step_token` on `steps.approval_token` makes token → task lookup a
single indexed query.

### The two places the chain moves

Only two:

| Endpoint | Effect |
|---|---|
| `POST /tasks/:id/start` | Dispatches the entry step(s), mints tokens, sends approval-request emails, `status` → `in_progress` |
| `POST /approvals/:token/decision` | Records the outcome, re-runs `advance()`, dispatches whatever became ready, sends the appropriate notifications |

### The request-more-info loop

An **outcome**, not a backward graph edge:

```
approver chooses "request more info", writes a question
        |
        v
step resets to "ready", approval_token CLEARED  (forces a fresh token on redispatch)
reopen_count++                                  (capped at MAX_REOPENS = 3)
a  followup:<step_id>:<n>  requirement is appended
task status returns to "collecting"
        |
        v
requester answers via the existing POST /tasks/:id/values
        |
        v
re-finalize  ->  re-dispatches ONLY the reopened step
```

> **Re-finalizing after a reopen must not re-seed the whole graph.** Doing so would
> silently wipe approvals already recorded on other steps. This is the subtlest
> correctness requirement in the area.

The token is cleared rather than reused so that a stale link from the first
dispatch cannot be replayed against the reopened step.

### Notifications

[`notification.service.ts`](unblock-ai-api/src/services/notification.service.ts)
over a pluggable `IMailer` (`console` | `smtp`), mirroring the `IVectorStore`
pattern. Four paths: approval request, rejection, completion, more-info.

> **`dispatch()` never throws.** A failed send is logged and returned as `false`
> rather than rolling back a recorded decision. An approver's decision is a fact
> about the world; a mail server outage must not un-record it.

**The default `console` transport logs the full approval URL to stdout.** The entire
approval chain is demonstrable end-to-end with no email account configured — which
matters enormously for demos and for local development.

### `requester_email`

Every workflow now declares a `requester_email` input (an extraction-prompt rule —
see [`docs/requester-contact-gap.md`](docs/requester-contact-gap.md)). It is what
lets all four notification paths reach the requester.

**Backward compatibility:** workflows stored before that rule existed have no such
input. Their tasks hit the no-op path gracefully — `notification.service` skips the
requester send when the requirement is absent — and remain **pull-only** via
`GET /tasks/:id/status`. Nothing breaks; those requests just aren't pushed.

### The requester-facing status view

`GET /tasks/:id/status` returns the timeline: current pending steps, and —
critically — for a `rejected` task, **who** rejected it, **at which step**, and
**why**, lifted straight from the terminating step's `reason`.

The `reason` field is the one the entire rejection experience turns on. Being told
"rejected" without being told why is the failure mode this endpoint exists to
prevent.

---

## 5.9 Completion Documents

**Code:** [`src/services/completion-document.service.ts`](unblock-ai-api/src/services/completion-document.service.ts) ·
[`src/utils/document/`](unblock-ai-api/src/utils/document/) ·
[`src/services/document/`](unblock-ai-api/src/services/document/) ·
Design: [`docs/completion-document-email-phase-plan.md`](docs/completion-document-email-phase-plan.md)

When a task's last required approval is decided, the system generates a durable
record of the whole request and emails it alongside the completion notice.

### Four components, each with one job

**1. Pure builder** —
[`completion-document.util.ts`](unblock-ai-api/src/utils/document/completion-document.util.ts)
`buildCompletionDocument()` assembles a `CompletionDocument` with **no I/O at all**,
mirroring `ExecutionService` and `PlannerService`:

- Header (reference, title, requester, dates)
- Request-detail fields, in `workflow.inputs` **declaration order**
- Calculated values
- Follow-up answers from the request-more-info loop
- One `ApprovalRow` per approval step, in workflow order

**2. Computed-value evaluator** —
[`computed-evaluator.util.ts`](unblock-ai-api/src/utils/workflow/computed-evaluator.util.ts)
Evaluates `workflow.computed` against the task's collected values. **Never throws** —
anything malformed or forward-referenced resolves to `null` and is omitted. A bad
`computed` entry must not cost the requester their record.

**3. Pluggable renderer** — [`services/document/`](unblock-ai-api/src/services/document/)
`IDocumentRenderer` behind `createDocumentRenderer(format)`, mirroring
`services/mailer/`:

| Renderer | Use |
|---|---|
| `PdfDocumentRenderer` | `pdfkit`, Standard-14 fonts, no headless browser |
| `TextDocumentRenderer` | Tests and console runs |

> **The PDF is byte-for-byte deterministic.** Its `CreationDate` is stamped from the
> task's persisted `completion_document.generated_at`, **not** `new Date()`.
> Re-rendering the same document produces identical bytes — verified by comparing
> `sha256` hashes in the test suite.

**4. `CompletionDocumentService`**
Composes builder + evaluator + renderer behind one `generate()` call that **never
throws** — `config.document.enabled === false` and any internal failure both return
`null`. The same failure-isolation discipline as `NotificationService.dispatch()`.

### Where it runs

`ApprovalService` calls it **once**, on the `result.completed === true` branch,
before sending the completion email. A successful render is attached to that email
when `DOCUMENT_ATTACH_TO_EMAIL` is on and the size is under
`DOCUMENT_MAX_ATTACHMENT_BYTES`.

### No bytes are stored

Only **metadata** is persisted onto the task as `completion_document`:
`filename`, `byte_size`, `sha256`, `emailed_to`, `emailed_at`.

**Why storing bytes is unnecessary:** a completed task is immutable and its workflow
is version-pinned, so the record is a pure function of data already in Mongo.
`GET /api/tasks/:id/document` **regenerates** the PDF on every call from the
persisted `generated_at`. No blob store, no lifecycle management, no orphaned files.

A hash mismatch against the stored `sha256` is **logged as drift, not raised** — the
requester still gets their document; the operator gets a signal that something
upstream changed.

### Smoke test

`npm run smoke-test:document -- <task-id> [out.pdf]` renders a real task's record to
a local file for eyeballing, entirely independent of the completion path that
normally triggers it.

---

## 5.10 Deletion Tracking and Audit

Two separate audit mechanisms, deliberately not unified:

| What | Where | Why |
|---|---|---|
| **Template deletions** | PostgreSQL `template_deletions` | Needs a real foreign key to `admin_users` with `ON DELETE RESTRICT` |
| **Task deletions** | Mongo `audit_logs` | Pre-existing; no dual write introduced |

### Template deletion — write ordering as atomicity

There is **no cross-database transaction** between Postgres and Mongo.
`WorkflowService.delete()` therefore uses write ordering as the only atomicity
available:

```
1. Write the Postgres deletion-log row, versions_removed = 0
2. Delete the template versions from Mongo
3. Update versions_removed with the confirmed count
```

> A row still reading `versions_removed: 0` means **the log landed but the delete
> didn't** — a recoverable, *visible* failure state rather than a silent gap. The
> admin deletion-log UI renders exactly that row as `Incomplete`.

`ON DELETE RESTRICT` on `deleted_by_admin_id` means an audit row can never be
orphaned or erased by removing the admin who created it. `deleted_by_username` is
**denormalised on purpose** so the log stays readable if the admin is later renamed.

The endpoint requires a **typed confirmation** and is `admin`-only.
`DELETE /api/workflows/:id` is the **only `DELETE` route in the entire API**.

---

# 6. Backend Architecture

## 6.1 Strict layering

```
   routes  ->  controllers  ->  services  ->  models  ->  db
                    |               |
                    |               +-->  utils (pure)
                    |               +-->  external clients (Azure, SMTP)
                    |               +-->  adapters (IVectorStore, IMailer, ...)
                    |
                    +-->  errors (typed, thrown; never formatted here)
```

Each layer has a written contract:

| Layer | Does | Never does |
|---|---|---|
| **routes** | Creates a `Router`, attaches group middleware, binds path+method to a controller method wrapped in `asyncHandler` | Business logic, body parsing, status decisions, `res.json` |
| **controllers** | Parses/validates params, query, body; calls services; maps results to status + body | Touch MongoDB, call the OpenAI SDK, hold domain rules, format error responses |
| **services** | All business logic; DB access via its model; pure computation via utils; external calls | Read `process.env`, import concrete singletons instead of injected collaborators |
| **models** | Collection name, document interface, index specs, thin typed CRUD | Version-number computation, embedding calls, status-transition policy |
| **utils** | Pure functions | Any I/O, any config read beyond arguments, any class state |
| **config** | Read and validate `process.env` **once**, export frozen objects | Anything else |

## 6.2 Dependency injection — manual, no container

`server.ts` is the single **composition root**. Every service receives its
collaborators through constructor injection; nothing imports a concrete singleton.

```ts
const draftModel    = new DraftModel();
const templateModel = new TemplateModel();
// ...
const embeddingService  = new EmbeddingService();
const validationService = new ValidationService();
const extractionService = new ExtractionService({ validationService });

const authStore   = createAuthStore(config.auth.storeBackend);
const authService = new AuthService({ authStore, config });

const workflowService = new WorkflowService({
  templateModel, embeddingService, validationService,
  taskModel, deletionLog: deletionLogService,
});

const vectorStore = createVectorStore(config.retrieval.vectorBackend, {
  templateReader: templateModel, templateModel,
  indexName: config.retrieval.atlasIndexName,
});
// ... retrieval, selector, selection, planner, mailer, notification,
//     execution, documentRenderer, completionDocument, task, approval
```

**Why no DI container:** with roughly twenty services wired in one readable file,
a container adds indirection and a runtime resolution failure mode in exchange for
nothing. The wiring *is* the architecture diagram, and it fits on one screen.

**What this buys the tests:** every service can be constructed with fakes. The
test helpers ship `fake-model.helper.ts`, `fake-vector-store.helper.ts`,
`in-memory-mongo.helper.ts`, and `test-server.helper.ts` for exactly this.

## 6.3 The middleware chain

```
requestId       -> attaches a correlation id to req, echoed in logs and errors
requestLogger   -> structured JSON access log
cors            -> single allowed origin from CORS_ORIGIN
jsonBody        -> express.json({ limit: "1mb" })
authenticate    -> parses Bearer, populates req.user, NEVER rejects
/api router     -> requireAuth() / requireRole("admin") applied per route
notFound        -> 404 for unmatched paths
errorHandler    -> the single place an error becomes a response
```

`app.ts` builds and returns the app; `server.ts` calls `listen()`. That split is
what lets integration tests mount the real app in-process without binding a port.

## 6.4 Error handling

### The `BaseError` contract

```ts
abstract class BaseError extends Error {
  abstract readonly statusCode: number;   // each subclass sets its own
  readonly code: string;                  // stable machine identifier
  readonly details: unknown;              // optional extra context
  readonly isOperational: boolean;        // false only for ConfigurationError
  toJSON() { return { error: this.message, code: this.code, details: this.details ?? null }; }
}
```

`code` defaults to the class name in `SCREAMING_SNAKE_CASE` with a trailing `Error`
stripped, unless overridden through the constructor options.

### The ten subclasses

| Class | Status | `code` | Raised for |
|---|---|---|---|
| `ValidationError` | 400 | `VALIDATION_ERROR` | Malformed/missing bodies or fields. Has `.forField()` and `.forObject()` factories |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | No or invalid session token |
| `ForbiddenError` | 403 | `FORBIDDEN` | Valid session, wrong audience |
| `NotFoundError` | 404 | `NOT_FOUND` | Missing draft/workflow/session/task. Has `.of(resource, id)` factory |
| `ConflictError` | 409 | `CONFLICT` | Well-formed but conflicts with current state |
| `ExtractionError` | 422 | `EXTRACTION_ERROR` | Extraction failed after all repairs, or input flagged not-a-workflow |
| `SelectionError` | 502 | `SELECTION_ERROR` | The selector-agent Azure call failed |
| `EmbeddingError` | 502 | `EMBEDDING_ERROR` | Embeddings call failed or returned an unexpected dimension |
| `DatabaseError` | 500 | `DATABASE_ERROR` | An unexpected MongoDB failure |
| `ConfigurationError` | 500 | `CONFIGURATION_ERROR` | Missing/invalid env var at startup. `isOperational: false` |

### The middleware

```ts
if (err instanceof BaseError) {
  logger.warn(...);                                    // type, code, message, request id
  res.status(err.statusCode).json(err.toJSON());
} else {
  logger.error(..., err.stack);                        // full stack, logged only
  res.status(500).json({ error: "Internal server error",
                         code: "INTERNAL_ERROR", details: null });
}
```

> **Adding a new error type never requires touching the error handler.** It reads
> `statusCode` and `toJSON()` off the instance rather than maintaining a status-code
> lookup table. Add a file to `src/errors/`, extend `BaseError`, export it from the
> barrel — done.

An unexpected error's real message and stack are **never sent to the client**, only
logged.

Every route handler is wrapped in
[`asyncHandler`](unblock-ai-api/src/middlewares/async-handler.middleware.ts) so a
rejected promise reaches this middleware instead of crashing the process.

## 6.5 The four pluggable adapters

Every external dependency that has a "real" and a "local" mode follows the same
shape: an interface, two or more implementations, and a factory selected by config.

| Interface | Implementations | Selected by | Local default |
|---|---|---|---|
| `IVectorStore` | `in-memory` · `atlas` | `VECTOR_BACKEND` | `memory` |
| `IMailer` | `console` · `smtp` | `MAIL_TRANSPORT` | `console` |
| `IAuthStore` | `memory` · `postgres` | `AUTH_STORE_BACKEND` | `postgres` |
| `IDocumentRenderer` | `text` · `pdf` | `DOCUMENT_FORMAT` | `pdf` |

**The pattern pays for itself twice.** First, the whole system runs locally with
zero cloud services: in-memory vectors, console mail, memory auth. Second, the test
suite gets fakes for free — no mocking framework, because the seam is already there.

## 6.6 Structured logging and observability

[`logger.util.ts`](unblock-ai-api/src/utils/shared/logger.util.ts) emits
single-line JSON at `debug` / `info` / `warn` / `error` with timestamps, to
stdout/stderr. Every request carries a correlation id from `requestId`, echoed in
access logs and error logs.

**Currently absent:** metrics, tracing, and any APM integration. Health is a
liveness check only (`GET /api/health` touches no dependency) — see
[§17](#17-roadmap-and-extension-points).

## 6.7 Process lifecycle

```ts
await ensureIndexes();                    // idempotent, runs at every boot
const server = app.listen(config.server.port);

on SIGINT / SIGTERM   -> server.close() -> closeDb() -> closePool() -> exit(0)
on unhandledRejection -> log + exit(1)
on uncaughtException  -> log + exit(1)
```

Both database clients use **lazily-created** connections, so the process starts even
if Mongo or Postgres is momentarily unavailable — and each has its own close
function invoked on shutdown.

---

# 7. Data and Persistence

## 7.1 MongoDB — six collections

| Collection | Holds | Key fields |
|---|---|---|
| `drafts` | Raw admin prose | `text_sha256` (unique), `raw_text`, `status`, `failure_reason`, `created_at` |
| `templates` | Versioned workflow documents + embeddings | `workflow_id`, `version`, `is_latest`, `review_status`, `institution_type`, `document`, `embedding`, `draft_id` |
| `selection_sessions` | Multi-round selection conversations | `user_query`, `candidates[]` (frozen), `rounds[]`, `outcome`, `selected_workflow_id`, `requester_context` |
| `tasks` | Process instances | `reference`, `session_id`, `workflow_id`, `version`, `status`, `requirements[]`, `values{}`, `steps[]`, `audit[]`, `completion_document` |
| `counters` | Sequence allocation for `reference` | one document per counter |
| `audit_logs` | Task-deletion audit | `resource`, `resource_id`, `created_at` |

### Indexes — all 12, created idempotently at boot

**File:** [`src/db/index.definition.ts`](unblock-ai-api/src/db/index.definition.ts)

| Collection | Index | Options | Purpose |
|---|---|---|---|
| `drafts` | `{ text_sha256: 1 }` | **unique** | Content-hash idempotency |
| `drafts` | `{ created_at: -1 }` | | List newest first |
| `templates` | `{ workflow_id: 1, version: 1 }` | **unique** | Version integrity |
| `templates` | `{ workflow_id: 1, is_latest: 1 }` | | Latest-version lookup |
| `templates` | `{ is_latest: 1, review_status: 1, institution_type: 1 }` | | **The retrieval filter** |
| `selection_sessions` | `{ created_at: -1 }` | | List newest first |
| `tasks` | `{ session_id: 1 }` | | Task-for-session lookup |
| `tasks` | `{ status: 1, created_at: -1 }` | | Filtered task list |
| `tasks` | `{ reference: 1 }` | **unique** | Human reference integrity |
| `tasks` | `{ "steps.approval_token": 1 }` | **sparse** | **Token → task, one indexed hop** |
| `tasks` | `{ workflow_id: 1, status: 1 }` | | Per-workflow task queries |
| `audit_logs` | `{ resource: 1, resource_id: 1, created_at: -1 }` | | Audit trail reads |

`ensureIndexes()` runs on every server start and via `npm run init-db`.

## 7.2 PostgreSQL — three tables

**Migration:** [`src/db/migrations/001_auth_tables.sql`](unblock-ai-api/src/db/migrations/001_auth_tables.sql)

### `admin_users` / `portal_users`

```sql
id                     UUID PRIMARY KEY DEFAULT gen_random_uuid()
username               TEXT NOT NULL
email                  TEXT NOT NULL
full_name              TEXT NOT NULL
department             TEXT
organisation           TEXT
faculty                TEXT          -- portal_users only; feeds getRequesterContext()
password_hash          TEXT NOT NULL -- node:crypto scrypt
is_active              BOOLEAN NOT NULL DEFAULT TRUE
last_login_at          TIMESTAMPTZ
failed_attempt_count   INTEGER NOT NULL DEFAULT 0
last_failed_attempt_at TIMESTAMPTZ
created_at, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

CREATE UNIQUE INDEX ... ON <table> (lower(username));
CREATE UNIQUE INDEX ... ON <table> (lower(email));
```

**Case-insensitive uniqueness via `lower()` functional indexes**, deliberately
avoiding a dependency on the `citext` extension.

### `template_deletions`

```sql
id                  BIGSERIAL PRIMARY KEY
workflow_id         TEXT NOT NULL
template_title      TEXT NOT NULL
latest_version      INTEGER NOT NULL
versions_removed    INTEGER NOT NULL DEFAULT 0    -- still 0 => delete never confirmed
institution_type    TEXT
review_status       TEXT
deleted_by_admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT
deleted_by_username TEXT NOT NULL                 -- denormalised on purpose
reason              TEXT
request_id          TEXT                          -- correlates to the API request log
snapshot            JSONB NOT NULL DEFAULT '{}'
deleted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

Three indexes: `deleted_at DESC`, `(deleted_by_admin_id, deleted_at DESC)`,
`workflow_id`.

### Migrations are plain SQL, not a framework

[`src/db/migrate.ts`](unblock-ai-api/src/db/migrate.ts) applies `.sql` files in
**filename order**, each inside its own transaction, tracked in a
`schema_migrations` table. `npm run migrate:pg` runs them.

`npm run seed:auth` seeds the fixed set of users from `.env` credentials,
idempotently (`ON CONFLICT DO NOTHING`; `DO UPDATE` with `--force`).

## 7.3 Why two databases

This is deliberate polyglot persistence, not accident.

| Reason | Detail |
|---|---|
| **Relational shape** | Auth data has hard uniqueness constraints on `lower(username)` and `lower(email)` |
| **Real foreign keys** | `template_deletions.deleted_by_admin_id` → `admin_users(id)` with `ON DELETE RESTRICT`. An audit row can never be silently orphaned |
| **Document shape** | Workflow documents are deeply nested, schema-versioned JSON already governed by a JSON Schema. A relational decomposition would duplicate that schema in DDL |

### The cost, stated honestly

**There is no cross-database transaction.** A template deletion touches both stores
with no coordinator. The mitigation is write ordering ([§5.10](#510-deletion-tracking-and-audit)):
the log row lands first with `versions_removed: 0`, updated only once the Mongo
delete confirms. A stuck `0` is a *visible* inconsistency, which is the best
available outcome without a distributed transaction.

Two connection lifecycles are managed in parallel:
[`mongo.client.ts`](unblock-ai-api/src/db/mongo.client.ts) and
[`postgres.client.ts`](unblock-ai-api/src/db/postgres.client.ts), both lazily
created, both closed on shutdown.

## 7.4 Version pinning — the data-integrity backbone

```
templates:   { workflow_id: "x", version: 1, is_latest: false }
             { workflow_id: "x", version: 2, is_latest: true  }

tasks:       { workflow_id: "x", version: 1, ... }   <- pinned; unaffected by v2
```

A running task reads `version: 1` forever. An admin publishing `version: 2` cannot
change the shape of an in-flight approval chain. This is what makes the completion
document a faithful record: it is regenerated from the *same* workflow version the
approvals actually ran against.

---

# 8. Frontend Architecture

## 8.1 Route map

| Route | Type | Guard | Purpose |
|---|---|---|---|
| `/` | Server Component | — | Redirects by session: none → `/login`, admin → `/admin`, portal → `/portal` |
| `/login` | Server Component | — | Admin sign-in |
| `/portal/login` | Server Component | — | Requester sign-in |
| `/admin` | Server, `force-dynamic` | `proxy.ts` + API | Template list with institution-type filter |
| `/admin/templates/new` | Client | admin | Split-pane authoring: prose ⇄ flowchart |
| `/admin/templates/[id]` | Server → Client | admin | Open, edit, publish, rename, delete an existing template |
| `/admin/deletions` | Server, `force-dynamic` | admin | The deletion audit log |
| `/portal` | Server, `force-dynamic` | portal | "My Requests" — the task list |
| `/portal/jobs/new` | Server → Client | portal | Selection chat + live plan preview |
| `/portal/jobs/[id]` | Server, `force-dynamic` | portal | Task status timeline + plan + document download |
| `/approvals/[token]` | Server → Client | **none** | The approver decision page |
| `/api/auth/login` · `/api/auth/logout` | Route Handler | — | Sets/clears the httpOnly cookie |
| `/api/proxy/[...path]` | Route Handler | — | Forwards browser fetches upstream with the Bearer header |

> **`/approvals/*` lives deliberately outside `/admin` and `/portal`.** The approver
> holds a token from an email, not a session. The route must not inherit a
> navigation shell that implies an account they don't have.

## 8.2 The single API chokepoint

[`src/lib/api/client.ts`](unblock-ai-web/src/lib/api/client.ts) is **the only place
in the app that calls `fetch`** against the backend. Feature modules — `workflows`,
`drafts`, `selection`, `tasks`, `approvals`, `auth`, `health` — all build on it.

```ts
export async function apiRequest<T>(path, options): Promise<T>
export async function apiBlob(path): Promise<{ blob: Blob; filename: string }>
export const fetcher = <T,>(path: string) => apiRequest<T>(path);   // SWR
export class ApiError extends Error { status; code?; details?; }
```

### Two branches, because the token is reachable two different ways

```ts
if (typeof window === "undefined") {
  // Server Component / Route Handler:
  // read the httpOnly cookie via next/headers, call the API directly
  const { cookies } = await import("next/headers");   // dynamic - keeps this
  headers["Authorization"] = `Bearer ${token}`;       // module client-safe
  url = `${DIRECT_API_URL}${path}`;
} else {
  // Browser: a fetch can NEVER read an httpOnly cookie to set its own header,
  // so it goes through this app's own same-origin proxy Route Handler
  url = `/api/proxy${path}`;
}
```

The `next/headers` import is **dynamic** so this module stays safe to import from
Client Components — the import is only ever reached on the server branch.

`apiBlob` is `apiRequest`'s sibling for binary bodies (the completion PDF), kept as
one more chokepoint rather than a second `fetch` call site, so it shares the same
two-branch logic and the same `ApiError` type. It reads the filename out of the
`Content-Disposition` header.

`cache: "no-store"` is set unconditionally. **This data is never safe to serve
stale** — the very next thing a user does after publishing is look at the badge that
publish changed.

> **Consequence worth knowing:** a `no-store` fetch opts the whole route out of
> Next's Data Cache regardless of what the page exports, so `export const
> revalidate = N` on a page whose data comes through this client is **inert**. The
> project instead uses `router.refresh()` after mutations to invalidate the
> server-rendered tree at the moment data actually changed.

## 8.3 The proxy Route Handler

[`/api/proxy/[...path]/route.ts`](unblock-ai-web/src/app/api/proxy/) forwards every
method, attaching the Bearer token read server-side from the cookie.

Two details that matter:

- **Null-body statuses** (204/205/304) are returned as `new NextResponse(null, ...)`.
  Constructing a `Response` with even an empty-string body for one of these throws.
- **The upstream body is streamed through**, not `.text()`'d. Stringifying would
  mangle a binary body like the completion PDF. Streaming covers text and binary
  alike, so JSON rides through unchanged too. `content-disposition` is forwarded so
  the download filename survives.

## 8.4 Hand-mirrored types

`src/types/` mirrors the backend's DTOs — `workflow.ts`, `task.ts`, `selection.ts`,
`approval.ts`, `draft.ts`, `auth.ts` — with unions narrowed to match the backend
**exactly**.

**Why hand-mirrored rather than generated or loose:** a loose `string` or
`Record<string, unknown>` field silently absorbs schema drift. A narrowed union
turns a backend change into a TypeScript error at the exact call site that needs
updating. Given that the workflow schema is the project's core artifact, catching
drift at compile time is worth the duplication.

## 8.5 The pure transform layer

Four pure modules, unit-tested where behaviour is non-obvious, that convert backend
data into view data:

| Module | Input → Output |
|---|---|
| [`toFlowGraph.ts`](unblock-ai-web/src/lib/workflow/toFlowGraph.ts) | `WorkflowDefinition` → React Flow nodes + edges, auto-laid-out with dagre from `depends_on` |
| [`toPlanNodes.ts`](unblock-ai-web/src/lib/workflow/toPlanNodes.ts) | `WorkflowDefinition` → the portal's plan list |
| [`applyTaskProgress.ts`](unblock-ai-web/src/lib/workflow/applyTaskProgress.ts) | plan nodes + task step states → progress-annotated nodes |
| [`editorState.ts`](unblock-ai-web/src/lib/workflow/editorState.ts) | three facts → one editor state |

> **`toFlowGraph` is deterministic.** Same workflow JSON in → byte-identical
> coordinates out. It reads `depends_on` and runs dagre — no randomness, no I/O.
> That is why node positions are **not** persisted: the layout is derived, so
> storing it would create a second source of truth that could disagree with the
> graph.

## 8.6 The admin editor state machine

[`editorState.ts`](unblock-ai-web/src/lib/workflow/editorState.ts) derives one state
from three facts, rather than juggling four booleans that can contradict each other:

```ts
export type EditorState = "empty" | "typed" | "generated" | "edited";

deriveEditorState({ text, hasCompiled, compiledFromText }) {
  if (text.trim() === "") return "empty";
  if (!hasCompiled)       return "typed";
  return text === compiledFromText ? "generated" : "edited";
}
```

The call-to-action falls out of the state — no separate logic:

| State | CTA label | Enabled |
|---|---|---|
| `empty` | Generate template | no |
| `typed` | Generate template | yes |
| `generated` | Regenerate template | no |
| `edited` | Regenerate template | yes |

`edited` is what drives the **stale banner** — the prose has drifted from what the
flowchart was compiled from, so the flowchart on screen no longer describes the text
on screen.

> **Opening a template never re-runs the AI.** `generate()` is bound to an
> `onClick`; there is no `useEffect` that triggers it, and `draftsApi.extract` has
> exactly one caller in the whole web app. Opening a template is two indexed Mongo
> reads and nothing else.

## 8.7 The selection conversation hook

[`useSelectionSession.ts`](unblock-ai-web/src/lib/hooks/useSelectionSession.ts)
drives one selection conversation and is the single source of truth for the message
list, the session id, the current decision, and the matched workflow. Components
render this state and call `send`; they never talk to the API themselves.

Its four decision branches **are the product**:

| Decision | What the user sees |
|---|---|
| `ambiguous` | The one clarifying question, with its options as quick replies |
| `manual_choice` | "Two rounds spent — here are the candidates, pick one" |
| `no_match` | An honest "nothing matches", not a nearest guess |
| `matched` | The plan preview, ready to start filling in |

`requesterContext` is read from the session cookie **server-side** and handed down as
a prop — `getSession()` / `getRequesterContext()` are Server-Component-only (they
call `next/headers`), so this client hook cannot call them itself.

A sibling hook, [`useTaskCollection.ts`](unblock-ai-web/src/lib/hooks/useTaskCollection.ts),
drives the one-requirement-at-a-time collection modal.

## 8.8 Component inventory

### Admin — `src/components/admin/`

| Component | Role |
|---|---|
| `TemplateEditor` | The split-pane authoring surface; owns the state machine, generate/save/publish/rename |
| `DraftEditor` · `EditorToolbar` | The prose panel |
| `TemplateFilters` · `TemplateRow` | List page |
| `DeleteTemplateDialog` | Typed-confirmation deletion |
| `TopBar` | Admin nav shell |
| `flowchart/WorkflowFlowchart` | React Flow canvas; `NODE_TYPES` is module-scope on purpose — moving it inside the component remounts every node on each render |
| `flowchart/nodes/{Step,Condition,Input,Terminal}Node` | The four node renderers |

### Portal — `src/components/portal/`

| Component | Role |
|---|---|
| `NewRequestFlow` | Orchestrates chat + plan preview |
| `SelectionChat` · `ChatComposer` · `ChatMessage` | The conversation UI |
| `TaskPlanPanel` · `PlanNode` | Live plan preview and progress |
| `RequirementDialog` · `RequirementField` | One-requirement-at-a-time collection, as a modal |
| `JobList` · `JobRow` · `EmptyJobs` | "My Requests" |
| `JobStatusView` | Status timeline, plan, document download |
| `DeleteRequestDialog` | Task deletion |
| `TopBar` | Portal nav shell |

### Approvals — `src/components/approvals/`

`ApproverView` (the decision page), `ApproverList` (who has decided, and when),
`ReasonDialog` (reject / request-more-info reason capture).

### Shared UI — `src/components/ui/`

`Badge`, `Button`, `Card`, `ConfirmDialog`, `DateTime`, `EmptyState`, `SearchInput`,
`Spinner`.

> **`DateTime` exists for a specific reason:** server-rendered timestamps must
> hydrate to the same string the server sent. Pages stamp a `renderedAt` once and
> hand it to the client tree so relative times don't mismatch across the hydration
> boundary.

## 8.9 Styling

Tailwind CSS v4 through the PostCSS plugin — **no `tailwind.config` file**. Design
tokens live in `globals.css`: semantic color names (`bg`, `surface`, `ink`, `muted`,
`faint`, `accent`, `line-admin`), radii (`rounded-card`), and two font families
(`font-admin` / `font-portal`) bound to `Public_Sans` and `IBM_Plex_Sans` via
`next/font/google`.

The admin and portal surfaces are visually distinct on purpose — different
typography scale and density for an authoring tool versus a requester-facing app.

---

# 9. HTTP API Reference

**Base URL:** `http://localhost:3000/api` — every route is mounted under `/api`.
**Full reference with request/response bodies:** [`unblock-ai-api/docs/api/api-documentation.md`](unblock-ai-api/docs/api/api-documentation.md)
**Runnable collection:** [`unblock-ai-api/docs/postman/`](unblock-ai-api/docs/postman/)

## 9.1 Auth guards

| Guard | Requires | Failure |
|---|---|---|
| *(none)* | — | — |
| `requireAuth()` | Any valid session, either audience | `401` |
| `requireRole("admin")` | Valid session with `audience: "admin"` | `401` no token, `403` portal token |

Headers: `Content-Type: application/json` on every POST/PUT/PATCH;
`Authorization: Bearer <token>` on every guarded route.
Request bodies capped at **1 MB**.

## 9.2 All 34 route bindings

### Health

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 1 | `GET` | `/health` | Liveness — touches no dependency. Returns `{ status, uptime, version }` | none |

### Auth

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 2 | `POST` | `/auth/login` | Log in, either audience → `{ token, user, expires_at }` | none |
| 3 | `GET` | `/auth/me` | The caller's own identity from their token | `requireAuth()` |
| 4 | `POST` | `/auth/logout` | No-op `204` — sessions are stateless | none |

### Workflows / templates

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 5 | `POST` | `/workflows/extract` | Extract workflow JSON from prose — **does not save** | admin |
| 6 | `POST` | `/workflows` | Save a workflow document as a new version | admin |
| 7 | `GET` | `/workflows` | List latest workflow summaries (filter `institution_type`) | `requireAuth()` |
| 8 | `GET` | `/workflows/:id` | Get one workflow document (optional `version`) | `requireAuth()` |
| 9 | `PUT` | `/workflows/:id` | Update — saves a **new version** | admin |
| 10 | `POST` | `/workflows/:id/validate` | Validate without saving | admin |
| 11 | `DELETE` | `/workflows/:id` | Permanently delete; logs the deleting admin. **The only DELETE route** | admin |
| 12 | `GET` | `/workflows/deletions` | The deletion log, newest first | admin |
| 17 | `GET` | `/workflows/:id/record` | Full stored row for the admin editor, **including inlined `draft_text`** | `requireAuth()` |
| 18 | `PATCH` | `/workflows/:id/review` | Publish / reject — the `review_status` gate | admin |

### Drafts

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 13 | `POST` | `/drafts` | Save raw prose (idempotent by content hash) | admin |
| 14 | `GET` | `/drafts` | List drafts | admin |
| 15 | `GET` | `/drafts/:id` | Get one draft | admin |
| 16 | `POST` | `/drafts/:id/extract` | Generate **and save** a template from a draft | admin |

### Selection

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 19 | `POST` | `/selection/sessions` | Start a conversation (round 1 — **the only retrieval**) | `requireAuth()` |
| 20 | `POST` | `/selection/sessions/:id/answer` | Answer a clarifying question (round 2+) | `requireAuth()` |
| 21 | `POST` | `/selection/sessions/:id/choose` | Pick a workflow manually | `requireAuth()` |
| 22 | `GET` | `/selection/sessions/:id/workflow` | Get the matched workflow document | `requireAuth()` |

### Tasks

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 23 | `POST` | `/tasks` | Create a task from a matched session | `requireAuth()` |
| 24 | `GET` | `/tasks` | List tasks (filter `session_id`, `status`) | `requireAuth()` |
| 25 | `GET` | `/tasks/:id` | Get one task | `requireAuth()` |
| 26 | `GET` | `/tasks/:id/next` | The next unfilled requirement | `requireAuth()` |
| 27 | `POST` | `/tasks/:id/values` | Submit a value (coerced + validated) | `requireAuth()` |
| 28 | `POST` | `/tasks/:id/finalize` | Seed step states; `collecting` → `ready` | `requireAuth()` |
| 29 | `PATCH` | `/tasks/:id/status` | Cancel | `requireAuth()` |
| 30 | `POST` | `/tasks/:id/start` | **Dispatch entry steps, mint tokens, send email** | `requireAuth()` |
| 31 | `GET` | `/tasks/:id/status` | Requester-facing timeline (incl. who rejected and why) | `requireAuth()` |
| 32 | `GET` | `/tasks/:id/document` | Download the completion PDF (regenerated on demand) | `requireAuth()` |

### Approvals

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 33 | `GET` | `/approvals/:token` | The approver page's data | **none — the token IS the auth** |
| 34 | `POST` | `/approvals/:token/decision` | Approve / reject / request more info | **none — the token IS the auth** |

> **Route ordering note:** `GET /tasks/:id/status` and `GET /tasks/:id/document` are
> registered **before** the bare `GET /tasks/:id` pattern, so neither suffix is ever
> swallowed as an `:id` value.

## 9.3 Error response shape

Every error returns the same body:

```json
{ "error": "Human-readable message", "code": "STABLE_CODE", "details": null }
```

`details` carries structured context where useful — for example, the list of
schema and graph validation messages on a `VALIDATION_ERROR`.

## 9.4 Known API rough edge

> **Malformed ObjectIds return `500 DATABASE_ERROR`, not `400`/`404`.**
> On `/drafts/:id*`, `/selection/sessions/:id*`, and `/tasks/:id*`, a syntactically
> invalid ObjectId fails inside the Mongo driver rather than being rejected at the
> controller boundary. The frontend works around this at
> `admin/templates/[id]/page.tsx`. The clean fix is an ObjectId-shape guard in
> `request-validator.util.ts` applied at each of those route params.

---

# 10. Configuration Reference

All configuration is read **exactly once**, in
[`src/config/env.config.ts`](unblock-ai-api/src/config/env.config.ts) — the only
file in the repository permitted to reference `process.env`. Domain config modules
validate what they own, and `index.config.ts` composes them into a single frozen
`config` object.

## 10.1 Server

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` |
| `PORT` | no | `3000` | HTTP listen port |
| `CORS_ORIGIN` | no | `http://localhost:3001` | The single allowed browser origin |

## 10.2 Databases

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | **yes** | — | MongoDB connection string |
| `MONGODB_DB` | no | `unblock_ai` | Database name |
| `POSTGRES_URL` | conditional | — | Required unless `AUTH_STORE_BACKEND=memory` |
| `POSTGRES_POOL_MAX` | no | `10` | Max pooled connections |
| `POSTGRES_CONNECTION_TIMEOUT_MS` | no | `5000` | Acquisition timeout |

## 10.3 Auth

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SESSION_TOKEN_SECRET` | **in production** | random per-process in dev | HMAC key for session tokens. **Must differ from `APPROVAL_TOKEN_SECRET`** — startup throws if equal |
| `SESSION_TTL_HOURS` | no | `12` | Session lifetime |
| `AUTH_MAX_FAILED_ATTEMPTS` | no | `0` | Consecutive failures before lockout. `0` = tracked but not enforced |
| `AUTH_STORE_BACKEND` | no | `postgres` | `postgres` \| `memory` |
| `SEED_ADMIN_USERNAME` / `_PASSWORD` | seed only | `admin` / — | Consumed only by `npm run seed:auth` |
| `SEED_USER1_USERNAME` / `_PASSWORD` | seed only | `chathura` / — | Portal user 1 |
| `SEED_USER2_USERNAME` / `_PASSWORD` | seed only | `dilani` / — | Portal user 2 |

## 10.4 Azure OpenAI — chat

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | **yes** | — | Resource endpoint |
| `AZURE_OPENAI_API_KEY` | **yes** | — | API key |
| `AZURE_OPENAI_DEPLOYMENT` | **yes** | — | Chat deployment used for extraction (`gpt-4o`) |
| `AZURE_OPENAI_API_VERSION` | **yes** | — | e.g. `2024-10-21` |
| `AZURE_SELECTOR_DEPLOYMENT` | no | falls back to `AZURE_OPENAI_DEPLOYMENT` | Selector-agent model — **can be a cheaper model than extraction** |
| `EXTRACTION_MAX_ATTEMPTS` | no | `3` | Self-repair loop cap |

## 10.5 Azure embeddings

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AZURE_EMBEDDING_ENDPOINT` | **yes** | — | Azure AI Foundry endpoint — **a separate resource from chat** |
| `AZURE_EMBEDDING_API_KEY` | **yes** | — | |
| `AZURE_EMBEDDING_DEPLOYMENT` | no | `text-embedding-3-small` | |
| `AZURE_EMBEDDING_API_VERSION` | no | `2024-10-21` | |
| `AZURE_EMBEDDING_DIM` | no | `1536` | **Validated against the actual returned vector length** |

## 10.6 Retrieval & selection

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `RETRIEVAL_TOP_K` | no | `5` | Candidates returned (search over-fetches `K+2`) |
| `RETRIEVAL_ALIAS_BOOST` | no | `0.15` | Additive score bump per exact alias match |
| `SELECTION_MAX_ROUNDS` | no | `2` | Clarifying-question budget before `manual_choice` |
| `VECTOR_BACKEND` | no | `memory` | `memory` \| `atlas` |
| `ATLAS_VECTOR_INDEX` | no | `template_vector_index` | Only used when `VECTOR_BACKEND=atlas` |

## 10.7 Mail & approval tokens

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MAIL_TRANSPORT` | no | `console` | `console` \| `smtp` |
| `MAIL_FROM` | no | `Unblock AI <noreply@localhost>` | `From` header |
| `SMTP_HOST` | no | `""` | **Not validated at startup** — a bad host surfaces as a send failure |
| `SMTP_PORT` | no | `587` | `465` selects implicit TLS (`secure: true`) |
| `SMTP_USER` / `SMTP_PASS` | no | `""` | Omitted from transporter `auth` entirely when empty |
| `APP_PUBLIC_URL` | no | `http://localhost:3001` | Base URL for `/approvals/:token` links |
| `APPROVAL_TOKEN_SECRET` | **when `MAIL_TRANSPORT=smtp`** | `""` | HMAC key for approval tokens. Startup throws if SMTP is on and this is empty |
| `APPROVAL_TOKEN_TTL_DAYS` | no | `14` | Token lifetime |

## 10.8 Completion documents

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DOCUMENT_ENABLED` | no | `true` | `false` reproduces pre-feature behaviour exactly |
| `DOCUMENT_ATTACH_TO_EMAIL` | no | `true` | Attach vs. download-only |
| `DOCUMENT_FORMAT` | no | `pdf` | `pdf` \| `text` |
| `DOCUMENT_INSTITUTION_NAME` | no | `Unblock AI` | Printed in the record's footer |
| `DOCUMENT_MAX_ATTACHMENT_BYTES` | no | `5000000` | Above this, download-only |

## 10.9 Frontend

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | no | `http://localhost:3000/api` | Upstream API base |
| `SESSION_TOKEN_SECRET` | yes | — | **Must match the API's** — `proxy.ts` verifies the same HMAC |

## 10.10 Parsing discipline

[`env-parse.util.ts`](unblock-ai-api/src/utils/shared/env-parse.util.ts) exports five
pure functions that take the raw value as an **argument** — none of them read
`process.env` themselves, which is what keeps `env.config.ts` the single point of
contact:

`requireString` · `optionalString` · `parseNumber` · `parseBoolean` · `parseEnum`

Each throws `ConfigurationError` when a present value is invalid, so
misconfiguration is a startup failure rather than a runtime surprise.

Two config modules add checks of their own beyond those helpers:

- `auth.config.ts` — throws if `SESSION_TOKEN_SECRET === APPROVAL_TOKEN_SECRET`.
- `mail.config.ts` — throws if `transport === "smtp"` and `tokenSecret === ""`. A dev
  default that leaves approval tokens unsigned is fine; a production SMTP deployment
  silently doing the same is not.

**Two config files, two purposes:**

| File | Contains | Git-ignored |
|---|---|---|
| `.env` | Real secrets for this machine | **yes** |
| `.example.env` | Every variable, in the same order, placeholder value, one-line comment | no |

Never put a real secret in `.example.env`.

---

# 11. AI / LLM Engineering

## 11.1 Where the LLM is used — and where it deliberately is not

| Used | Not used |
|---|---|
| Extracting workflow JSON from prose | Validating the extracted graph *(deterministic checks)* |
| Deciding which template matches a request | Ranking candidates *(vector similarity + alias boost)* |
| Generating a clarifying question | Phrasing requirement prompts *(plain `label` + `collection_hint`)* |
| Generating a template's `retrieval_summary` | Deciding whether a step is ready *(a pure graph rule)* |
| — | Building or rendering the completion document *(pure functions)* |
| — | Suggesting reject-vs-more-info to an approver *(left as plain data)* |

> **The pattern:** the LLM is used for *language*, never for *state*. Anything that
> must be reproducible, auditable, or provably correct is a deterministic function.

## 11.2 The extraction pipeline

### Prompt assembly

[`extraction.prompt.ts`](unblock-ai-api/src/data/prompts/extraction.prompt.ts) is a
long system prompt encoding every schema semantic in [§4](#4-the-workflow-schema--the-core-design-artifact):
graph-not-list, actor resolution modes, namespace paths, condition structure,
ambiguity reporting, the three-outcome rule, strict-mode discipline, and the
non-workflow refusal rule.

[`extraction-few-shot.prompt.ts`](unblock-ai-api/src/data/prompts/extraction-few-shot.prompt.ts)
appends **two worked examples loaded from real sample files** —
`src/data/samples/input/*.txt` paired with `src/data/samples/expected/*.json`.

> **The few-shot examples are not inline strings.** They are read from the same
> fixture files the tests assert against, which makes it structurally impossible for
> the prompt examples and the test gold data to drift apart.

### The structured-output call

```ts
response_format: {
  type: "json_schema",
  json_schema: { schema: strictWorkflowSchema, strict: true }
}
temperature: 0        // omitted for reasoning models
```

**Reasoning-model detection:** `REASONING_MODEL_PATTERN = /^(o\d|gpt-5)/i`. Models
matching it don't support temperature control, so
`supportsTemperatureControl(deployment)` gates the parameter
([`model.constant.ts`](unblock-ai-api/src/data/constants/model.constant.ts)). This
lets the deployment be swapped to a reasoning model without a code change.

### Validation and self-repair

Every candidate goes through both validation layers ([§5.4](#54-validation--schema--graph)).
On failure, and while attempts remain:

```
conversation so far
  + assistant turn: <the invalid JSON the model produced>
  + user turn:      <formatted list of the exact validation errors>
                    "return corrected JSON fixing ONLY those problems"
  -> call again
```

**Why "only those problems" matters:** an open-ended "try again" invites the model to
restructure parts that were already correct, which can introduce new failures and
turn the loop into a random walk. Constraining the repair keeps each attempt
monotonically closer to valid.

Default cap: `EXTRACTION_MAX_ATTEMPTS` = 3. Exhausted → `ExtractionError` (422).

### The non-workflow guard

Even a fully schema-valid result is rejected when
`metadata.review_status === "rejected"` — the model's own signal that the input
described no institutional process. See [§4.9](#49-non-workflow-input-is-a-first-class-outcome).

## 11.3 Embeddings and vector search

| Property | Value |
|---|---|
| Model | `text-embedding-3-small` |
| Dimensions | 1536, validated against `AZURE_EMBEDDING_DIM` on every call |
| Embedded content | The `retrieval_summary` block |
| Storage | Inline on the template document in Mongo |
| Backends | `in-memory` (cosine similarity via `vector-math.util.ts`) · `atlas` (MongoDB Atlas Vector Search) |

The in-memory backend loads confirmed latest templates and computes cosine
similarity in process. It is genuinely usable at the scale of an institution's
template library — a few hundred documents — and it removes Atlas from the local
development critical path entirely.

## 11.4 The selector agent

[`selector.prompt.ts`](unblock-ai-api/src/data/prompts/selector.prompt.ts) +
[`decision.schema.ts`](unblock-ai-api/src/data/schemas/decision.schema.ts) — another
structured-output call, this time producing a decision object rather than a
workflow.

The prompt receives:
- Each candidate's `retrieval_summary` (including **`not_for`**)
- The conversation transcript so far
- The `requester_context` (`faculty`, `department`, `actor_type`)

And must return one of `matched` / `ambiguous` / `no_match`, with a question and
options when ambiguous.

> **`no_match` being available to the model is the point.** Without it, a model asked
> "which of these five" will always pick one. Making refusal a legal, first-class
> answer is what allows the system to be honest.

`manual_choice` is **never** produced by the model — the service loop emits it when
the round budget expires.

## 11.5 Retrieval summaries as a generated artifact

[`retrieval-summary.prompt.ts`](unblock-ai-api/src/data/prompts/retrieval-summary.prompt.ts)
+ [`retrieval-summary.schema.ts`](unblock-ai-api/src/data/schemas/retrieval-summary.schema.ts)
generate the `retrieval_summary` block. `npm run backfill:summaries` regenerates
them for templates stored before the block existed.

## 11.6 Evaluation harness

| Command | What it measures |
|---|---|
| `npm run evaluate:selection` | Runs [`src/data/samples/selection/queries.json`](unblock-ai-api/src/data/samples/selection/queries.json) — labelled plain-language queries with expected workflow ids — and scores selection accuracy |
| `npm run test:live` → `extraction-accuracy.live.test.ts` | Asserts the model extracts *specific structural details* from the gold fixtures: right step ids, right `depends_on` chains, right condition operator and operands, right loop-back and termination outcomes, right `context_from_steps` bindings |
| → `consistency.live.test.ts` | Repeatability across repeated calls with the same input |
| → `generalisation.live.test.ts` | Extraction on `lab_equipment_purchase_request` — an **unseen** fixture with no gold JSON |
| → `robustness.live.test.ts` | Messy, edge-case, and non-workflow input |
| → `selection-quality.live.test.ts` | Selector agent decision quality |

> **`extraction-accuracy` asserts structure, not string equality.** Comparing whole
> documents would fail on any harmless wording difference. Asserting that
> `dean_review.condition.operator === "greater_than"` and its `left` is
> `computed.trip_duration_days` tests what actually matters.

## 11.7 Cost and latency posture

- **Extraction** is the expensive call (long system prompt + two few-shot examples +
  structured output). It runs **only on an explicit admin "Generate" click** — never
  on page open, never on a `useEffect`.
- **Selection** uses `AZURE_SELECTOR_DEPLOYMENT`, which can point at a cheaper model
  than extraction. One call per conversation round, max two rounds.
- **Embeddings** run once per template save and once per selection query.
- **Everything else** — planning, execution, document generation — has zero LLM cost.

---

# 12. Security Model and Trust Boundaries

## 12.1 Threat posture

This is an internal institutional tool with a small, seeded user base and one
externally-reachable unauthenticated surface (the approval link). The security model
is scaled to that, and the gaps are documented rather than implied.

## 12.2 Two independent authentication mechanisms

```
+------------------------------------------------------------------+
|  SESSION AUTH                    |  APPROVAL TOKEN AUTH           |
|                                  |                                |
|  Who:  admin, portal users       |  Who:  approvers, no account   |
|  Form: HMAC bearer token in an   |  Form: HMAC token in the URL   |
|        httpOnly cookie           |        path                    |
|  Key:  SESSION_TOKEN_SECRET      |  Key:  APPROVAL_TOKEN_SECRET   |
|  TTL:  SESSION_TTL_HOURS (12)    |  TTL:  APPROVAL_TOKEN_TTL_DAYS |
|  Scope: whole API except         |  Scope: exactly one step of    |
|         /health and /approvals/* |         exactly one task       |
|  Revoke: impossible (stateless)  |  Revoke: a DB write            |
+------------------------------------------------------------------+
```

**The two secrets must differ** — enforced at startup by `auth.config.ts`. If they
were the same, a session token and an approval token would be interchangeable
artifacts signed by the same key.

## 12.3 Approval token security model

> **The token proves authenticity. It does not prove usability.**

Signature verification tells you the token was minted by this server and hasn't been
tampered with. Every request additionally checks, against the database:

- Is it expired?
- Has it already been used?
- Is the step still `pending_approval`?

That separation is what makes revocation a **database write** rather than a key
rotation that would invalidate every outstanding approval link in the institution.

**Additional properties:**
- `GET /approvals/:token` returns `404` for both a malformed and an
  unrecognised/expired token. The API deliberately does not distinguish, so the page
  can't be used to probe which tokens exist.
- Verification is **non-throwing** — malformation returns `null`, so a garbage URL
  can't produce a 500.
- A reopened step gets its token **cleared**, forcing a fresh one on redispatch, so a
  stale link from the first dispatch cannot be replayed.

## 12.4 The central trust gap: self-asserted identity

> **There is no directory or identity service.** The approval authority emailed for a
> decision is whatever address the *requester typed in*. The same applies to
> `requester_email`.

Concretely, a requester could name themselves as their own approver and approve their
own request.

This is a known, documented gap, not an oversight — see
[`docs/requester-contact-gap.md`](docs/requester-contact-gap.md). It is the single
most important thing to close before any real deployment, and closing it is
structurally cheap: `actor:*` requirements simply arrive **pre-filled** from a
directory instead of being asked, and the collection loop and execution engine are
untouched by design ([§5.7](#57-task-planning--requirement-collection)).

## 12.5 What is protected

| Control | Where |
|---|---|
| Passwords hashed with scrypt (memory-hard KDF) | `password.util.ts` |
| httpOnly, `sameSite: lax`, `secure` in production cookie | `/api/auth/login` Route Handler |
| Token never reaches JavaScript | Cookie set server-side; browser calls go through the proxy |
| Route guard verifies **signature and expiry**, not mere cookie presence | `proxy.ts` |
| Real error messages and stacks never sent to clients | `error-handler.middleware.ts` |
| Request body cap (1 MB) | `json-body.middleware.ts` |
| Single allowed CORS origin | `cors.middleware.ts` |
| Case-insensitive unique usernames/emails | Postgres functional indexes |
| Audit rows cannot be orphaned | `ON DELETE RESTRICT` |
| Deletion requires typed confirmation, admin role, and writes a log first | `DELETE /workflows/:id` |
| Config secrets validated at startup, never defaulted in production | `auth.config.ts`, `mail.config.ts` |

## 12.6 What is not protected — the honest list

| Gap | Impact | Mitigation path |
|---|---|---|
| **No session revocation** | A stolen token is valid until it expires (≤12h) | Add a `sessions` table |
| **No IP rate limiting on login** | Brute force is limited only by per-account counting, which is **off by default** | Set `AUTH_MAX_FAILED_ATTEMPTS`; add IP throttling |
| **No password reset / change / self-registration** | Three seeded users, rotated via `npm run seed:auth --force` | Real user management |
| **Unverified approver identity** | See §12.4 | Directory integration |
| **No cross-database transaction** | A partial template deletion is possible (visible, not silent) | Accepted; write ordering mitigates |
| **`SMTP_*` not validated at startup** | A misconfigured transport fails at send time | Caught and logged, not fatal — by design |
| **`req.user` largely unused past auth routes** | `submitted_by` is always `null`; a requester's job list is not scoped to them | Small, contained follow-on now that identity is real |
| **Malformed ObjectId → 500** | Noise, and a slightly leaky error class | Add an ObjectId guard to `request-validator.util.ts` |

---

# 13. Testing and Quality Strategy

## 13.1 Three backend tiers

```bash
npm test            # tests/unit/** + tests/integration/**   fast, no network
npm run test:live   # tests/live/**                          slow, real Azure calls
```

**43 backend test files.** Runner: Node's built-in `node:test` via `tsx` — no Jest,
no Vitest on the backend.

### `tests/unit/utils/` — 17 files

Schema validation, graph validation (with **mutation tests** per failure mode), alias
boost, render-summary, request-validator, serializer, vector math, token utils,
session tokens, password hashing, content hashing, requirement builder, value
validator, computed evaluator, completion document, answer format, reference
allocation.

### `tests/unit/services/` — 13 files

Draft, workflow, retrieval, selection, selector, vector-store, task, execution,
approval, notification, mailer, document, auth — each against fakes supplied through
constructor injection.

### `tests/integration/` — 7 files

Full HTTP-level coverage of the draft, workflow, selection, task, approval, and auth
routes plus the error handler, using an **in-process Express server**
(`test-server.helper.ts`) and `mongodb-memory-server`.

`AUTH_STORE_BACKEND=memory` means these run with **no live PostgreSQL**.

### `tests/live/` — 5 files

Network-dependent, CI-gated, run manually. See [§11.6](#116-evaluation-harness).

## 13.2 Test helpers

| Helper | Provides |
|---|---|
| `fake-model.helper.ts` | Model doubles |
| `fake-vector-store.helper.ts` | An `IVectorStore` double |
| `in-memory-mongo.helper.ts` | `mongodb-memory-server` lifecycle |
| `fixture.helper.ts` | Loads the gold sample files |
| `test-server.helper.ts` | Mounts the real Express app in-process |
| `live.helper.ts` | Guards live tests behind real credentials |

## 13.3 Frontend tests

Vitest, 3 files, targeting the pure logic that is worth pinning:

- `lib/auth/token.test.ts` — session-token verification (the same HMAC the API mints)
- `lib/utils/submit-error.test.ts` — error-message mapping
- `lib/workflow/applyTaskProgress.test.ts` — plan-progress transform

## 13.4 The mutation-testing discipline for the graph validator

Passing fixtures prove nothing about a validator. The graph-validator tests
therefore:

1. Assert the two gold fixtures pass all eight checks.
2. For each check, **deliberately corrupt** the fixture in exactly the way that check
   exists to catch (dangling `depends_on`, an introduced cycle, an unreachable step,
   an approval step missing `rejected`, a dangling namespace path, …).
3. Assert the corresponding check fires — and that the error message names the
   problem.

## 13.5 The three-role fixture constraint

> `it_faculty_overseas_leave` and `departmental_event_workshop` each serve **three
> roles simultaneously**: few-shot prompt example, schema/graph validation fixture,
> and live extraction-accuracy gold data.
>
> **Any change to the schema or the extraction prompt must keep all three
> consistent.** This is the sharpest coupling in the repository and the first thing
> to check when a schema change breaks something unexpected.

## 13.6 Quality gates

```bash
cd unblock-ai-api && npm run typecheck && npm test
cd unblock-ai-web && npm run typecheck && npm run lint && npm test && npm run build
```

`strict: true` TypeScript in both projects. The web `build` is part of the gate
because Next surfaces RSC/client-boundary violations at build time that
`typecheck` alone will not.

---

# 14. Operations — Setup, Run, Build, Deploy

## 14.1 Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | ESM, native test runner |
| MongoDB | 7 | Local, Docker, or Atlas |
| PostgreSQL | 17 | Skippable locally with `AUTH_STORE_BACKEND=memory` |
| Azure OpenAI | — | A chat deployment (`gpt-4o`) |
| Azure AI Foundry | — | An embeddings deployment (`text-embedding-3-small`), **separate resource** |
| SMTP | — | Optional; `console` transport is the default |

## 14.2 First-time setup

```bash
# -- Backend ----------------------------------------------------
cd unblock-ai-api
npm install
cp .example.env .env          # then fill in Azure + Mongo + Postgres credentials

npm run init-db               # create Mongo collections + all 12 indexes
npm run migrate:pg            # create the Postgres auth + deletion-log tables
npm run seed:auth             # seed 1 admin + 2 portal users from .env credentials

npm run smoke-test:azure      # verify the chat deployment answers
npm run smoke-test:embeddings # verify embeddings and the 1536-dim assertion

npm run dev                   # tsx watch on :3000

# -- Frontend ---------------------------------------------------
cd ../unblock-ai-web
npm install
# .env.local:
#   NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
#   SESSION_TOKEN_SECRET=<the SAME value as the API's>
npm run dev                   # Next dev on :3001
```

Open http://localhost:3001 and sign in.

> **Port 3001 is fixed in `package.json`** because the API binds 3000 and its
> default `CORS_ORIGIN` is `http://localhost:3001`.
>
> **`SESSION_TOKEN_SECRET` must be identical in both projects** — `proxy.ts` verifies
> the same HMAC the API mints.

## 14.3 Every npm script

### Backend

| Script | Does |
|---|---|
| `npm run dev` | `tsx watch src/server.ts` |
| `npm run build` | `tsc` + `copy-assets.script.ts` (copies `workflow.schema.json` and samples into `dist/`) |
| `npm start` | `node dist/src/server.js` (with a `prestart` build) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit + integration |
| `npm run test:live` | Live Azure tests |
| `npm run init-db` | Create Mongo indexes (idempotent) |
| `npm run migrate:pg` | Apply Postgres migrations in filename order |
| `npm run seed:auth` | Seed users (`--force` to overwrite) |
| `npm run backfill:summaries` | Regenerate `retrieval_summary` for older templates |
| `npm run evaluate:selection` | Score selection accuracy against labelled queries |
| `npm run smoke-test:azure` | Chat connectivity |
| `npm run smoke-test:embeddings` | Embeddings connectivity + dimension check |
| `npm run smoke-test:mail` | Send one test mail through the configured transport |
| `npm run smoke-test:document` | Render a real task's PDF to a file: `-- <task-id> [out.pdf]` |

### Frontend

| Script | Does |
|---|---|
| `npm run dev` | `next dev -p 3001` |
| `npm run build` | `next build` |
| `npm start` | `next start -p 3001` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `eslint` |
| `npm test` | `vitest run` |

> **`npm run build` on the backend is not just `tsc`.** `copy-assets.script.ts` moves
> `workflow.schema.json` and the sample fixtures into `dist/` — they are read at
> runtime, and TypeScript does not copy non-TS files.

## 14.4 Production checklist

| | Item |
|---|---|
| ☐ | `NODE_ENV=production` |
| ☐ | `SESSION_TOKEN_SECRET` set to a strong value, **different** from `APPROVAL_TOKEN_SECRET` |
| ☐ | `APPROVAL_TOKEN_SECRET` set (**mandatory** once `MAIL_TRANSPORT=smtp`) |
| ☐ | The same `SESSION_TOKEN_SECRET` in the web app |
| ☐ | `MAIL_TRANSPORT=smtp` with working `SMTP_*` — verify with `npm run smoke-test:mail` |
| ☐ | `APP_PUBLIC_URL` set to the real public origin (approval links are built from it) |
| ☐ | `CORS_ORIGIN` set to the real web origin |
| ☐ | `AUTH_STORE_BACKEND=postgres`, `POSTGRES_URL` set |
| ☐ | `npm run migrate:pg` applied |
| ☐ | `npm run seed:auth` run with **real** credentials, not the `.example.env` defaults |
| ☐ | `npm run init-db` applied |
| ☐ | Consider `VECTOR_BACKEND=atlas` with `ATLAS_VECTOR_INDEX` if the template library is large |
| ☐ | `AUTH_MAX_FAILED_ATTEMPTS` set to a non-zero value |
| ☐ | HTTPS terminated in front of both services (the cookie is `secure` in production) |

## 14.5 Operational notes

- **Both DB clients connect lazily** — the process starts even if a database is
  briefly unavailable, and fails per-request rather than at boot.
- **`ensureIndexes()` runs at every boot** and is idempotent, so a fresh environment
  self-provisions its Mongo indexes.
- **Graceful shutdown** on `SIGINT`/`SIGTERM`: stop accepting, close Mongo, close the
  Postgres pool, exit 0.
- **`GET /api/health` is liveness only** — it touches no dependency. It will report
  healthy while Mongo is down. A readiness probe that pings both databases is a known
  gap ([§17](#17-roadmap-and-extension-points)).
- **Logs are single-line JSON** with a request correlation id — pipe straight into any
  log aggregator.

---

# 15. Engineering Conventions and Standards

## 15.1 File naming — Angular-style dot notation

`<name>.<role>.ts`, kebab-case for multi-word names, `index.<role>.ts` for barrels.

Roles in use: `.route` `.controller` `.service` `.model` `.middleware` `.util`
`.config` `.type` `.error` `.prompt` `.schema` `.constant` `.vocabulary` `.data`
`.client` `.interface` `.script` `.test` `.document` `.mailer` `.auth-store`
`.vector-store` `.definition` `.template`

Examples: `selection-session.model.ts`, `in-memory.vector-store.ts`,
`graph-validator.util.ts`, `smoke-test-document.script.ts`.

The frontend follows Next/React convention instead: `PascalCase.tsx` for components,
`camelCase.ts` for modules.

## 15.2 Module rules

- **Every relative import ends in `.js`** (NodeNext ESM): `import { x } from "./y.util.js";`
- **`strict: true`** TypeScript throughout, with explicit types on every exported
  function, class, and constant
- **Only `src/config/env.config.ts` reads `process.env`**
- **Barrel files** (`index.*.ts`) per folder; `lib/types/index.type.ts` re-exports all
  type domains

## 15.3 Comment discipline

The codebase has an unusually high — and unusually **useful** — comment density.
The rule in practice:

> **Comments explain *why*, and specifically why the obvious alternative was
> rejected.** They never restate what the code does.

Representative examples from the source:

```ts
// RESTRICT, not CASCADE: an audit row must never be orphaned or erased by
// removing the admin who created it.

// Denormalised on purpose: the log stays readable if the admin is renamed.

cache: "no-store",   // this data is never safe to serve stale

// A valid admin session previewing the requester surface is allowed
// through deliberately - see Phase 5 §5.3 of the phase plan.

// 204/205/304 are null-body statuses - constructing a Response with even an
// empty-string body for one of these throws.

// Dev/test: a random per-process secret is fine - a restart invalidating
// sessions beats ever shipping a default secret into a config file.
```

These comments are **load-bearing**. Several encode decisions that a well-meaning
refactor would otherwise reverse. Read them before changing the line above them.

## 15.4 The phase-plan development method

The repository's 71 commits show a consistent method, and the `docs/` folder is its
artifact trail:

```
1. Write a DESIGN document        - the problem, the options, the decision, the why
2. Write a PHASE PLAN             - independently shippable, independently verifiable
                                    phases, each with explicit "done when" criteria
                                    and a gate command
3. Implement ONE phase            - one commit: "implemented the phase N of X"
4. Run the gate, confirm, move on
```

Every phase plan opens with a **Findings** section — facts confirmed by *reading the
source*, not assumed. Several plans contain findings that **cancel the obvious
approach** before any code is written. From the admin-performance plan:

> *"Finding 0.3 — `revalidate` on the list page cannot work while the shared client
> sends `no-store`. … So adding `export const revalidate = 30` would be inert — it
> would look like a fix, change nothing, and cost a day of confusion."*

That is the method working: an hour of reading saved a day of implementing the wrong
thing.

**Commit message convention:** `feat: implemented the phase N of <feature>`.

## 15.5 Recurring design patterns

| Pattern | Where it appears |
|---|---|
| **Interface + factory + config-selected implementation** | `IVectorStore`, `IMailer`, `IAuthStore`, `IDocumentRenderer` |
| **Pure core, I/O shell** | `ExecutionService` / `ApprovalService`; `buildCompletionDocument` / `CompletionDocumentService`; `PlannerService` / `TaskService` |
| **Never-throw at failure-isolation boundaries** | `NotificationService.dispatch()`, `CompletionDocumentService.generate()`, `computed-evaluator`, approval-token verification |
| **Derive, don't store** | Flowchart layout, completion-document bytes, requirement lists |
| **Freeze what a conversation depends on** | Selection candidate set; task workflow version |
| **One chokepoint per external boundary** | `client.ts` for fetch; `env.config.ts` for `process.env`; `errorHandler` for error responses |
| **Write the audit row before the destructive act** | Template deletion |

---

# 16. Known Limitations & Explicitly Out of Scope

## 16.1 Not built — by design, for this stage

| Gap | Consequence | Notes |
|---|---|---|
| **No directory / identity service** | Approver and requester emails are self-asserted and unverified | **The most important gap.** See [§12.4](#124-the-central-trust-gap-self-asserted-identity) |
| **No runtime `condition` evaluation** | `WorkflowStep.condition` is extracted, validated, and rendered — but the execution engine does not evaluate it. A conditional step is dispatched like any other | The evaluator for `computed` already exists and is the natural foundation |
| **No SLA, reminders, or escalation** | `WorkflowStep.sla` is carried in the schema and never read | Needs a scheduler |
| **No self-registration, password reset, or password change** | Three seeded users, rotated via `npm run seed:auth --force` | |
| **No session revocation** | Stateless tokens; no `sessions` table to delete from | |
| **No IP rate limiting** | Only per-account counting, off by default | |
| **No LLM assistance in the approval flow** | Question phrasing, context summarising, and reject-vs-more-info suggestions are plain data for the caller to render | Deliberate — see [§11.1](#111-where-the-llm-is-used--and-where-it-deliberately-is-not) |
| **`req.user` largely unused past auth routes** | `submitted_by` is always `null`; a requester's job list is not scoped to them | Small, contained follow-on |
| **No task DELETE route** | Task removal is handled through status transitions and the Mongo audit log | `DELETE /workflows/:id` is the only DELETE route |
| **No metrics, tracing, or readiness probe** | `/health` is liveness only and stays green while Mongo is down | |

## 16.2 Known rough edges

| Issue | Detail | Fix |
|---|---|---|
| **Malformed ObjectId → 500** | On `/drafts/:id*`, `/selection/sessions/:id*`, `/tasks/:id*`, an invalid ObjectId fails inside the driver as `DATABASE_ERROR` instead of `400`/`404`. The frontend works around it in `admin/templates/[id]/page.tsx` | An ObjectId-shape guard in `request-validator.util.ts` |
| **Pre-`requester_email` workflows** | Templates saved before that input existed produce tasks that send no requester notifications — pull-only via `GET /tasks/:id/status` | Re-extract, or backfill the input |
| **SMTP config unvalidated at startup** | A bad host surfaces only at send time | Intentional: caught and logged rather than crashing the process |
| **`revalidate` is inert on API-backed pages** | The shared client sends `cache: "no-store"`, opting routes out of the Data Cache | Documented; `router.refresh()` is used instead |

## 16.3 Historical documents — treat as context, not tasks

| Document | Status |
|---|---|
| `unblock-ai-api/docs/plans/*` | Pre-restructure. `docs/architecture/folder-structure.md` is the current layout source of truth |
| `unblock-ai-api/docs/architecture/rag-*.md` | Historical RAG design explorations (Postgres+pgvector, Mongo+Azure AI Search) |
| `unblock-ai-web/docs/fe-api-migration-plan.md` | **Resolved.** The `requester_context` stringification bug, the `choose` response typing, `ApiError.code`, and the Publish wiring are all fixed in code |

---

# 17. Roadmap and Extension Points

## 17.1 Ordered by value

### Tier 1 — Required before any real deployment

**1. Directory / identity integration**
Resolve `dynamic` actors against a real institutional directory.
*Why the architecture is already ready:* `actor:*` requirements simply arrive
pre-filled instead of asked. The collection loop, execution engine, and every
downstream component are untouched — this was the explicit design goal of
[§5.7](#57-task-planning--requirement-collection).
*Closes:* the central trust gap ([§12.4](#124-the-central-trust-gap-self-asserted-identity)).

**2. Runtime condition evaluation**
Evaluate `WorkflowStep.condition` in `ExecutionService.advance()`; a step whose
condition is false becomes `skipped` rather than `ready`.
*Foundation already present:* `computed-evaluator.util.ts` resolves namespace paths
against collected values, and `checkNamespacePaths` guarantees every path is valid.
*Why it matters:* today, the fourteen-day Dean rule is *extracted, validated, and
drawn on the flowchart* — but not enforced at runtime.

**3. Real user management**
Self-registration or SSO, password reset, a `sessions` table for revocation, IP rate
limiting.

### Tier 2 — Operational maturity

**4. Readiness probe + metrics + tracing**
`/health/ready` that pings both databases; counters for extraction attempts, repair
loops, selection decisions by type, and approval latency.

**5. SLA reminders and escalation**
A scheduler reading `WorkflowStep.sla` — reminder at `reminder_after_hours`,
escalation to `fallback_role` at `escalate_after_hours`. Both fields already exist.

**6. ObjectId guard**
Close the 500-instead-of-400 rough edge.

### Tier 3 — Product depth

**7. Scope requesters to their own data**
`req.user` is real on every route now; `submitted_by` should be populated and the job
list scoped to the caller.

**8. Analytics on the corpus**
Which workflows are used most, which steps bottleneck, which get rejected, average
time-to-completion per step. The `tasks` collection already holds every fact needed.

**9. Multi-institution / tenancy**
`scope.institution_type` exists in the schema and filters retrieval. Real tenancy
would add an org dimension to templates, users, and tasks.

**10. Selection quality loop**
Feed real `no_match` and `manual_choice` outcomes back into `retrieval_summary`
tuning — the sessions are already recorded with their frozen candidate sets and
scores.

## 17.2 Extension points already designed in

| To add | Do this | Because |
|---|---|---|
| A new vector backend (pgvector, Pinecone) | Implement `IVectorStore`, add a case to the factory | Callers depend on the interface only |
| A new mail transport (SES, SendGrid) | Implement `IMailer`, add a case to the factory | `NotificationService` is transport-agnostic |
| A new document format (DOCX, HTML) | Implement `IDocumentRenderer`, add a case to the factory | The builder is already format-independent |
| A new auth backend | Implement `IAuthStore` | Already has two implementations |
| A new error type | Add a file to `src/errors/`, extend `BaseError`, export from the barrel | The handler reads `statusCode`/`toJSON()` off the instance |
| A new graph invariant | Add a check function to `graph-validator.util.ts` + a mutation test | Checks are independent functions over the same document |
| A new step type | Extend the schema enum, the prompt, and the flowchart node map | Schema-first change; expect the three-role fixture constraint to bite |
| A different LLM deployment | Change `AZURE_OPENAI_DEPLOYMENT` | Reasoning models auto-detected for temperature handling |

---

# 18. Glossary

| Term | Meaning |
|---|---|
| **Actor** | A role-based reference to whoever performs a step. Four resolution modes: `dynamic`, `static`, `requester`, `system`. Never a named person |
| **Alias boost** | An additive score bump (default 0.15) applied when a query exactly matches a template's declared alias |
| **Approval token** | An HMAC-SHA256-signed token minted per dispatched step, embedded in the approver's email link. Proves authenticity; usability is checked separately |
| **Candidate** | A template returned by retrieval, carrying `score`, `base_score`, `alias_hits`, and its `retrieval_summary` |
| **Completion document** | The deterministic PDF record generated when a task completes. Metadata persisted, bytes regenerated on demand |
| **Computed value** | A derived value from a fixed operation set (`date_diff_days`, `sum`, …). Never a free-text formula |
| **Dispatch** | Moving a `ready` step to `pending_approval`, minting its token, and emailing the assignee |
| **Draft** | Raw admin prose, stored idempotently by SHA-256 of its normalised text |
| **Entry step** | A step with `depends_on: []`. Every valid workflow has at least one |
| **Extraction** | The LLM pipeline turning prose into validated workflow JSON |
| **Few-shot examples** | Two worked input/output pairs loaded from real fixture files into the extraction prompt |
| **Graph validation** | Eight semantic checks JSON Schema cannot express (cycles, reachability, dangling references, namespace paths, …) |
| **`is_latest`** | A boolean marking the current version per `workflow_id`. Exactly one per id |
| **Namespace path** | A dotted reference into the shared run data: `inputs.x`, `computed.y`, `steps.z.outcome`, `requester.a`, `system.today` |
| **Publish gate** | `metadata.review_status` moving `pending_admin_review` → `confirmed`. Retrieval only ever sees `confirmed` |
| **Reopen** | The "request more info" loop — an outcome that resets a step to `ready`, clears its token, and appends a `followup:*` requirement. Capped at 3 |
| **Requirement** | One unit of the flat collection list: a template input, an unresolved actor, or a follow-up question |
| **`retrieval_summary`** | The block that gets embedded and read by the selector: one-liner, aliases, keywords, requester types, triggers, and **`not_for`** |
| **Selection session** | A multi-round conversation record with a **frozen** candidate set |
| **Selector agent** | The LLM that chooses `matched` / `ambiguous` / `no_match` over the frozen candidates |
| **Self-repair loop** | Feeding validation errors back to the model with "fix only these", up to 3 attempts |
| **Step state** | `blocked` \| `ready` \| `pending_approval` \| `approved` \| `rejected` \| `skipped` |
| **Task** | One instance of a workflow: the process a requester actually started |
| **Template** | A stored, versioned workflow definition with its embedding |
| **Terminal rejection** | `outcomes.rejected.action === "terminate_workflow"` — checked before dispatch, so no email goes out for a dead branch |
| **Version pinning** | A task recording the exact `{ workflow_id, version }` it was created from, so template edits cannot reshape a running chain |

---

# 19. Appendices

## Appendix A — Complete source tree

### Backend — `unblock-ai-api/src/`

```
app.ts                     builds the Express app; no listen()
server.ts                  entry point: DI wiring, listen, graceful shutdown

routes/                    index · health · auth · workflow · draft · selection
                           · task · approval
controllers/               health · auth · workflow · draft · selection · task
                           · approval
services/
  draft · extraction · validation · workflow · embedding
  retrieval · selector · selection
  planner · task · execution · approval · notification
  completion-document · auth · audit · deletion-log
  azure-openai.client · azure-embedding.client
  vector-store/    interface · in-memory · atlas · index
  mailer/          interface · console · smtp · index
  auth-store/      interface · in-memory · postgres · index
  document/        interface · text · pdf · index
models/                    draft · template · selection-session · task
                           · audit-log · index
config/                    env · server · db · postgres · auth · azure-openai
                           · azure-embedding · retrieval · mail · document · index
middlewares/               request-id · request-logger · cors · json-body
                           · authenticate · require-auth · async-handler
                           · not-found · error-handler · index
utils/
  shared/                  logger · hash · object-id · assert · env-parse · password
  workflow/                schema-validator · graph-validator · namespace-path
                           · computed-evaluator
  retrieval/               vector-math · alias-boost · render-summary
  http/                    request-validator · serializer · actor
  task/                    requirement-builder · value-validator · reference
  approval/                token · outcome-resolver · answer-format
  auth/                    session-token
  document/                completion-document · document-format · pdf-layout
data/
  prompts/                 extraction · extraction-few-shot · selector
                           · retrieval-summary
  schemas/                 workflow.schema.json · workflow-schema.data
                           · decision.schema · retrieval-summary.schema
  vocabulary/              role.vocabulary
  constants/               collection · status · model
  templates/               approval-email.template
  samples/                 input/ · expected/ · selection/ · demo-drafts/
lib/types/                 workflow/ · draft/ · template/ · selection/ · retrieval/
                           · task/ · approval/ · audit/ · auth/ · document/
                           · config/ · http/ · index
errors/                    base · validation · unauthorized · forbidden · not-found
                           · conflict · extraction · selection · embedding
                           · database · configuration · index
db/                        mongo.client · postgres.client · index.definition
                           · migrate · migrations/001_auth_tables.sql
```

### Frontend — `unblock-ai-web/src/`

```
proxy.ts                   route guard (Next 16's renamed middleware)
app/
  layout.tsx · globals.css · page.tsx (session-based redirect)
  login/page.tsx
  admin/  layout · page · deletions/page · templates/new/page · templates/[id]/page
  portal/ layout · page · login/page · jobs/new/page · jobs/[id]/page
  approvals/ layout · [token]/{page,loading,not-found}
  api/    auth/login · auth/logout · proxy/[...path]
components/
  admin/     TemplateEditor · DraftEditor · EditorToolbar · TemplateFilters
             · TemplateRow · DeleteTemplateDialog · TopBar
             · flowchart/WorkflowFlowchart + nodes/{Step,Condition,Input,Terminal}
  portal/    NewRequestFlow · SelectionChat · ChatComposer · ChatMessage
             · TaskPlanPanel · PlanNode · RequirementDialog · RequirementField
             · JobList · JobRow · JobStatusView · EmptyJobs · DeleteRequestDialog
             · TopBar
  approvals/ ApproverView · ApproverList · ReasonDialog
  auth/      LoginForm · SignOutButton
  ui/        Badge · Button · Card · ConfirmDialog · DateTime · EmptyState
             · SearchInput · Spinner
lib/
  api/       client (THE chokepoint) · auth · workflows · drafts · selection
             · tasks · approvals · health
  auth/      session · session-cookie · token
  hooks/     useSelectionSession · useTaskCollection
  workflow/  toFlowGraph · toPlanNodes · applyTaskProgress · editorState
  utils/     cn · format · submit-error
types/       workflow · task · selection · approval · draft · auth
```

## Appendix B — Documentation index

### Cross-cutting — `docs/`

| Document | Covers |
|---|---|
| `overview.md` | The prior single-page project reference |
| `task-planner-design.md` | Area G design and the requirement-list insight |
| `task-planner-implementation-plan.md` | Area G build plan |
| `approval-execution-design.md` | Area H design: the pure-engine split |
| `approval-execution-implementation-plan.md` | Area H build plan |
| `auth-and-deletion-tracking-phase-plan.md` | Area A: full design + phase log (1069 lines) |
| `completion-document-email-phase-plan.md` | Area I design + phase log |
| `requester-contact-gap.md` · `requester-contact-implementation-plan.md` | The `requester_email` gap and its resolution |
| `web-task-approval-phase-plan.md` · `web-task-approval-implementation-plan.md` | The frontend approval surface |
| `approver-page-gap-fixes-phase-plan.md` | Approver-page refinements |
| `admin-template-open-performance-phase-plan.md` | Template-open latency work; a model example of finding-driven planning |

### Backend — `unblock-ai-api/docs/`

| Document | Covers |
|---|---|
| `README.md` | Backend documentation index |
| `architecture/project-overview.md` | **Best single entry point for the backend** |
| `architecture/folder-structure.md` | The complete target tree and per-folder contracts — **the layout source of truth** |
| `architecture/error-handling.md` | The `BaseError` hierarchy in full |
| `architecture/rag-implementation-guide.md` · `rag-mongodb-azure-search.md` | Historical RAG design explorations |
| `api/api-documentation.md` | **All 34 endpoints** with request/response bodies (1870 lines) |
| `guides/running-the-app.md` | Full local setup and troubleshooting |
| `guides/configuration.md` | Every environment variable |
| `postman/` | Runnable collection + environment that chains ids automatically |
| `plans/` | Four historical plans, pre-restructure |

### Frontend — `unblock-ai-web/`

| Document | Covers |
|---|---|
| `README.md` | Next.js getting started + the port-3001 rationale |
| `AGENTS.md` | Generated Next.js 16 warning block — read `node_modules/next/dist/docs/` before framework-level work |
| `docs/fe-api-migration-plan.md` | FE/API contract history — **resolved**, historical only |

## Appendix C — Demo script

A 10-minute end-to-end walkthrough that exercises every functional area.

**Setup:** `MAIL_TRANSPORT=console`, both servers running, terminal visible.

### 1 · Admin authoring (3 min)

1. Sign in at `/login` as the admin.
2. **Create new template.** Paste the overseas-leave policy paragraph — plain
   English, no structure.
3. Click **Generate template**. *Talking point: this is one Azure OpenAI call with a
   strict JSON schema, followed by AJV validation and eight graph checks. If any
   check fails, the model gets its own errors back and repairs — up to three
   attempts.*
4. The flowchart appears. *Talking point: nobody positioned these nodes. The layout
   is derived from `depends_on` by dagre — the graph structure came out of the
   prose.*
5. Point out the **conditional Dean step** and the **loop-back** on the advisor step.
   *Talking point: the fourteen-day rule was a clause in a sentence; it's now a
   structured condition over a computed value.*
6. Edit one word in the prose. **The stale banner appears** — the picture no longer
   describes the text.
7. Click **Publish**. *Talking point: until this moment the template is invisible to
   every requester. Extraction proposes; a human commits.*

### 2 · Requester selection (2 min)

1. Sign in at `/portal/login` as a portal user.
2. **New Request** → type something deliberately vague: *"I need to go to a
   conference in Singapore next month."*
3. *Talking point: that query was embedded, matched against published templates by
   vector similarity plus an alias boost, and handed to a selector agent with a
   round budget of two.*
4. If it asks a clarifying question, answer it. The plan preview appears.
5. **Optional, and worth doing:** ask for something that genuinely doesn't exist.
   *Talking point: it says `no_match` and stops. It does not stretch to the nearest
   template. That refusal is the feature.*

### 3 · Filling and starting (2 min)

1. Answer the requirements one at a time in the modal.
2. Point out the **approver requirement**: "Name and email of your Academic
   Advisor." *Talking point: with no HR directory, an unresolved role is just another
   input. When directory integration lands, this arrives pre-filled and nothing else
   changes.*
3. Try an invalid date — a return before departure. It's rejected by a cross-field
   rule declared in the workflow itself.
4. **Submit.** *Talking point: finalizing is not starting. Start dispatches the entry
   steps, mints a signed token per step, and sends the emails.*

### 4 · The approval chain (2 min)

1. **Switch to the API terminal.** The console mailer has printed the full approval
   URL. *Talking point: no mail account is configured. The whole chain is
   demonstrable from a terminal.*
2. Open the link in a private window. *Talking point: no session, no account. The
   token in that URL is the entire authentication — scoped to one step of one task,
   expiring in fourteen days, and revocable with a database write.*
3. **Approve.** Back in the terminal: the next approver's email appears immediately.
4. On the second step, choose **Request more information** and type a question.
   *Talking point: that is not a backward edge in the graph. It's an outcome that
   resets the step, clears its token, and appends a follow-up question to the
   requester's list — which is how the dependency graph stays a strict DAG.*
5. Answer as the requester; resubmit; approve.

### 5 · Completion (1 min)

1. The final approval triggers completion. **The PDF is in the console output**, and
   downloadable from `/portal/jobs/[id]`.
2. Open it: every input in declaration order, every computed value, every follow-up
   Q&A, and every approver with their decision and timestamp.
3. *Talking point: those bytes are not stored anywhere. The record is regenerated on
   every request from a version-pinned workflow and an immutable task — and it is
   byte-for-byte identical each time, which the test suite verifies by hash.*

### 6 · Optional closers

- `/admin/deletions` — the audit log, with the `Incomplete` badge explained: it means
  the log row landed but the Mongo delete didn't. Visible, not silent.
- `npm run evaluate:selection` — scored selection accuracy against labelled queries.
- `npm run test:live` — the model asserted against specific structural details of the
  gold fixtures.

## Appendix D — Development history

71 commits, from `a8c6127 initial commit`. The sequence traces the build order:

| Phase | Commits | Delivered |
|---|---|---|
| Foundation | `a8c6127` → `f144f96` | Initial planner design and first four implementation phases |
| TypeScript restructure | — | The layered architecture, naming convention, and error hierarchy documented in `plans/restructure-implementation-plan.md` |
| Approval execution | `0e45736` → `85ec620` (7 phases) | The pure engine, tokens, notifications, the reopen loop |
| Requester contact | `74f0a00` → `6e46a2f` (5 phases) | The `requester_email` input and all four notification paths |
| Web task approval | `ff6783c` → `bbf22bb` (5 phases) | The frontend approval surface |
| Approver page | `0d51231` → `81a819d` (6 phases) | The approver decision UI |
| Admin performance | `d7ebd3e` → `87cb820` (4 phases) | Single-round-trip template open, deferred flowchart bundle |
| Auth + deletion tracking | `800e651` → `143d2bf` (7 phases) | PostgreSQL, real login, the deletion audit log |
| Completion documents | `b47746d` → `b98f6bd` (9 phases) | The PDF record, end to end |

Every feature followed the same pattern: a design or phase-plan commit, then one
commit per shippable phase. The `docs/` folder preserves all of it.

---

## Document maintenance

This document is generated from a full read-through of the codebase as of
**2026-08-29** (`dev` @ `b98f6bd`).

**Update it when:**
- The workflow schema changes → [§4](#4-the-workflow-schema--the-core-design-artifact)
- An endpoint is added or its auth changes → [§9](#9-http-api-reference)
- An environment variable is added → [§10](#10-configuration-reference)
- A limitation in [§16](#16-known-limitations--explicitly-out-of-scope) is closed → move it out and note it in [§1.4](#14-current-maturity)
- A new pluggable adapter or service is introduced → [§6.5](#65-the-four-pluggable-adapters), [Appendix A](#appendix-a--complete-source-tree)

**Deeper references, kept current alongside the code:**
[`unblock-ai-api/docs/architecture/project-overview.md`](unblock-ai-api/docs/architecture/project-overview.md) ·
[`unblock-ai-api/docs/api/api-documentation.md`](unblock-ai-api/docs/api/api-documentation.md) ·
[`unblock-ai-api/docs/guides/configuration.md`](unblock-ai-api/docs/guides/configuration.md) ·
[`docs/overview.md`](docs/overview.md)
