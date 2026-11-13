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
| **Last updated** | 2026-11-11 (workflow templates); otherwise 2026-08-29 |
| **Repository** | `unblock-ai-app` (branch `dev`, mainline `main`) |
| **Intended readers** | Engineers, architects, product stakeholders, reviewers, presenters |
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
| 1 | **Compile** | A workflow manager writes a title and pastes the policy prose as the prompt | An LLM generates a strict JSON **workflow graph** from it, machine-validated, stored as an immutable template version and rendered as a flowchart the workflow manager verifies and publishes |
| 2 | **Find** | Requester describes their need in plain language | Vector retrieval + an LLM selector agent maps that request onto exactly one published template — or honestly says it can't |
| 3 | **Fill & Run** | Requester answers one question at a time | A task is compiled from the template, values are validated, and the approval chain runs over real email with signed per-step links |
| 4 | **Record** | System, on completion | A deterministic PDF record of the whole request — inputs, computed values, follow-ups, and every approval — emailed and downloadable |

## 1.2 The shape of the system

Two applications in one repository:

| Project | Role | Stack | Port |
|---|---|---|---|
| [`unblock-ai-api/`](unblock-ai-api/) | Backend — workflow template generation, validation, versioned storage, retrieval, planning, execution, documents | Node 18+ · TypeScript 5.9 (strict) · Express 5 · MongoDB 7 · PostgreSQL 17 · Azure OpenAI | 3000 |
| [`unblock-ai-web/`](unblock-ai-web/) | Frontend — dashboard (workflow template management, users, organisation, task request assistant, workspace and list), approver decision page | Next.js 16.3 (App Router, RSC) · React 19.2 · Tailwind CSS v4 · React Flow | 3001 |

Roughly **8,100 lines** of backend source across 169 TypeScript files, and
**6,700 lines** of frontend source across 89 files, backed by **63 backend test
files** and 2 frontend test files.

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
Workflow template generation uses OpenAI structured outputs with `strict: true`, then runs eight
semantic graph checks that JSON Schema cannot express, then feeds any failures back
to the model for repair — up to three attempts. See [§11.2](#112-the-workflow-template-generation-pipeline).

**5. Uncertainty is a first-class outcome, never a guess.**
The selector agent may return `no_match` and stop. The generator may declare the
input "not a workflow" and refuse. A round budget expires into a manual list. The
system is designed to say "I don't know" rather than stretch to the nearest
plausible answer. See [§5.6](#56-selection--the-assistant-conversation).

## 1.4 Current maturity

| Area | State |
|---|---|
| Prose → validated workflow JSON | **Working**, with a self-repair loop and live accuracy tests |
| Workflow template management UI (`/dashboard/workflows`) with flowchart and version history | **Working** |
| Template lifecycle (`draft` → `unpublished` → `published`), immutable versions, archive/restore | **Working** |
| Retrieval + clarifying-question selection | **Working**, with a scored evaluation harness |
| Requirement collection and validation | **Working** |
| Email approval chain (approve / reject / request-more-info) | **Working**, default transport logs to console |
| Signed-in approvals inbox (pending, history, in-app decisions, sidebar count) | **Working** — the whole approval chain runs with mail off ([§5.8](#58-approvals)) |
| Completion PDF record | **Working**, deterministic and hash-verified |
| Email login, permission-based access, revocable server-side sessions, user management API | **Working** — no password change or reset yet |
| Task deletion audit log | **Working** |
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

The workflow manager does not fill in a form-builder or drag boxes on a canvas. They **paste
the paragraph** as the template's prompt. The system compiles it into a graph, shows them the flowchart, and
asks them to verify. Verification is the human's job; authoring is not.

Downstream of that compiled artifact, everything else becomes mechanical:

```
   POLICY PROSE                        (the source)
        |  generate  (LLM + schema + graph validation)
        v
   WORKFLOW TEMPLATE VERSION           (the program)
        |  publish  (workflow manager verifies the flowchart)
        v
   PUBLISHED TEMPLATE                  (the library)
        |  retrieve + select  (embeddings + selector agent)
        v
   MATCHED TEMPLATE                    (the right program for this request)
        |  compile  (directory-resolved approvers, forms, prefilled details; no AI)
        v
   TASK                                (the process instance)
        |  fill forms -> approvals -> decide (approve / reject / more information) -> advance
        v
   TRANSCRIPT                          (the receipt, rendered on demand)
```

## 2.3 Who uses it

| Persona | Surface | What they do |
|---|---|---|
| **Workflow manager** | `/dashboard/workflows` (signed in, holds `workflow:manage`) | Write a title and prompt, save it as a draft, generate or regenerate, inspect the flowchart, publish, rename, browse version history, archive and restore. |
| **Requester** | `/dashboard/tasks/new`, `/dashboard/tasks` (signed in, holds `task:create`) | Describe a need in one sentence, start the matched task, fill step forms (drafts any time), answer information requests, track progress, download the transcript. |
| **User manager** | `/api/users` (signed in, holds `user:manage`; no web screen yet) | Create users and grant them permissions. |
| **Approver** | `/approvals/:token` (**no account**, token-authenticated) | Open a link from an email, see the request in context, approve, reject or ask for more information, with a comment. |

These personas are **permissions, not account types**. Everyone signs in at the same
`/login` page with email and password and lands on `/dashboard`. One account may hold
any combination of the permissions (`workflow:manage`, `task:create`, `task:approve`,
`user:manage`, `organisation:manage`) — see [§5.1](#51-authentication--authorization).
The older `/old/account` screen is still reachable by URL; the old requester portal was removed.

The approver having **no account at all** is a deliberate constraint that shapes the
whole auth design — see [§12.2](#122-two-independent-authentication-mechanisms).

## 2.4 Worked example — the process this system was designed against

`it_faculty_overseas_leave` is one of two fully worked fixtures in the repo. It
serves three roles simultaneously: few-shot prompt example, validation test
fixture, and live generation-accuracy gold data.

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
|   /login  /dashboard/*  /old/*               /approvals/:token              |
|   one session cookie (ua_session)            NO session - token only        |
+-------+-----------------+-------------------+-------------------------------+
        |                 |                   |
        v                 v                   v
+----------------------------------------------------------------------------+
|  unblock-ai-web  ·  Next.js 16 App Router  ·  :3001                        |
|                                                                             |
|   proxy.ts ---------- route guard: no ua_session cookie -> /login           |
|   Server Components - read httpOnly cookie, call API directly w/ Bearer     |
|   /api/auth/login --- sets the httpOnly cookie on THIS origin               |
|   /api/auth/logout -- revokes the session at the API, clears the cookie     |
|   /api/proxy/* ------ forwards browser fetches upstream, attaching Bearer   |
|   lib/api/client.ts - THE single fetch chokepoint (+ apiBlob for the PDF)   |
+-------------------------------+--------------------------------------------+
                                |  HTTP /api  (Bearer opaque session token)
                                v
+----------------------------------------------------------------------------+
|  unblock-ai-api  ·  Express 5  ·  :3000                                    |
|                                                                             |
|  requestId -> requestLogger -> cors -> jsonBody(1MB) -> authenticate        |
|           -> /api router (requireAuthentication / requireAnyPermission)     |
|           -> notFound -> errorHandler                                       |
|                                                                             |
|  routes -> controllers -> services -> models | repositories -> db           |
|                                                                             |
|  SERVICES                                                                   |
|   WorkflowTemplate · WorkflowTemplateGeneration · Validation · Embedding    |
|   Retrieval · Selector · Selection                                          |
|   Planner · Task · Execution · Approval · Notification                      |
|   CompletionDocument · Audit                                                |
|   Authentication · UserSession · User                                       |
|                                                                             |
|  PLUGGABLE ADAPTERS (factory behind an interface)                           |
|   IVectorStore      memory | atlas                                          |
|   IMailer           console | smtp                                          |
|   IDocumentRenderer text   | pdf                                            |
|   I*Repository      memory | postgres  (user, user-session, ...)            |
+----+--------------+---------------+-----------------+----------------------+
     |              |               |                 |
     v              v               v                 v
+----------+  +----------+  +--------------+  +--------------+
| MongoDB  |  | Postgres |  | Azure OpenAI |  | SMTP / stdout|
|   7      |  |    17    |  |  chat +      |  |              |
|          |  |          |  |  embeddings  |  |              |
| workflow_|  | users    |  |              |  | approval     |
| templates|  | permis-  |  | gpt-4o       |  | links + PDF  |
| workflow_|  |  sions   |  | text-embed-  |  |              |
| template_|  | user_    |  |  ding-3-small|  |              |
| versions |  |  permis- |  |              |  |              |
| tasks    |  |  sions   |  |              |  |              |
| selection|  | user_    |  |              |  |              |
| _sessions|  |  sessions|  |              |  |              |
| counters |  |          |  |              |  |              |
| audit_   |  |          |  |              |  |              |
|  logs    |  |          |  |              |  |              |
+----------+  +----------+  +--------------+  +--------------+
```

## 3.2 The nine functional areas

| # | Area | Primary services | Doc |
|---|---|---|---|
| A | Authentication & authorization | `authentication.service`, `user-session.service`, `user.service`, `repositories/` | [§5.1](#51-authentication--authorization) |
| B | Workflow template lifecycle | `workflow-template.service` | [§5.2](#52-workflow-template-lifecycle) |
| C | Workflow template generation | `workflow-template-generation.service` | [§5.3](#53-workflow-template-generation--prompt--workflow-json) |
| D | Validation | `validation.service`, `graph-validator.util` | [§5.4](#54-validation--schema--graph) |
| E | Versioned storage & embeddings | `workflow-template.service`, `embedding.service` | [§5.5](#55-versioned-template-storage--embeddings) |
| F | Selection (assistant) | `requester-profile.service`, `retrieval.service`, `selector.service`, `selection.service` | [§5.6](#56-selection--the-assistant-conversation) |
| G | Task plan and forms | `task.service`, `task-plan.service`, `task-form.service`, `task-engine.service`, `assignee-resolution/` | [§5.7](#57-task-plan-and-forms) |
| H | Approvals | `approval.service`, `task-effect-executor.service`, `notification.service` | [§5.8](#58-approvals) |
| I | Transcript | `task-transcript.service`, `document/` | [§5.9](#59-transcript) |
| — | Task deletion audit | `audit.service` | [§5.10](#510-deletion-tracking-and-audit) |

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
| Users, permissions & sessions DB | PostgreSQL 17, `pg`, **no ORM** | Relational, hard uniqueness constraints, real foreign keys — see [§7.3](#73-why-two-databases) |
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
| Data fetching | SWR client-side; `force-dynamic` Server Components for dashboard/portal pages | Approval state is never safe to serve stale |
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
│   ├─ user-access-and-session-management-phase-plan.md
│   ├─ completion-document-email-phase-plan.md
│   ├─ requester-contact-gap.md  ·  requester-contact-implementation-plan.md
│   ├─ web-task-approval-*.md    ·  approver-page-gap-fixes-phase-plan.md
│   └─ admin-template-open-performance-phase-plan.md
├─ unblock-ai-api/
│   ├─ src/          169 .ts files, ~8,100 LOC
│   ├─ scripts/      4 CLI scripts (migrate-postgres, migrate-mongo, seed-postgres, copy-assets)
│   ├─ tests/        63 test files across unit / integration / live
│   └─ docs/         api/ · architecture/ · guides/ · plans/ · postman/
└─ unblock-ai-web/
    ├─ src/          89 .ts/.tsx files, ~6,700 LOC
    └─ docs/         fe-api-migration-plan.md (historical)
```

The complete `src/` trees are in [Appendix A](#appendix-a--complete-source-tree).

---

# 4. The Workflow Schema — The Core Design Artifact

**File:** [`unblock-ai-api/src/data/schemas/workflow.schema.json`](unblock-ai-api/src/data/schemas/workflow.schema.json) — 498 lines, JSON Schema draft 2020-12.

This is the single most important file in the repository. Everything upstream
produces it and everything downstream consumes it. Changing it ripples into the
workflow template generation prompt, the graph validator, the task plan compiler, the task engine, the
flowchart renderer, the transcript builder, and three test tiers at once.

## 4.1 Top-level shape

```jsonc
{
  "schema_version":     "1.0",
  "title":              "Faculty Overseas Leave Request",   // see note below
  "description":        "...",
  "retrieval_summary":  { /* how the selector finds this workflow */ },
  "scope":              { "institution_type": "university",
                          "applies_to": { "actor_type": "faculty", "constraints": [] } },
  "requester":          { "actor_type": "faculty", "identifier_field": "staff_id" },
  "inputs":             [ /* what the requester must supply */ ],
  "computed":           [ /* derived values, fixed operation set */ ],
  "steps":              [ /* the dependency graph - minItems: 1 */ ],
  "completion":         { "rule", "required_steps", "actions" },
  "metadata":           { /* the model's own self-assessment */ }
}
```

`additionalProperties: false` is set on **every** object in the schema. Nothing
undeclared can appear anywhere.

The document carries no identifier of its own. Identity belongs to the workflow
template that stores it (a UUID), and each generated definition is stored as one
immutable version of that template ([§5.5](#55-versioned-template-storage--embeddings)).
The model emits a `title`, but it is stripped before the definition is stored: the
title lives on the template, so renaming never creates a version. Runtime readers
get the definition with the template's current title merged back in.

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
task engine ([§5.7](#57-task-plan-and-forms)) needs exactly one rule:
*an upcoming step whose every dependency is satisfied activates (or is skipped when its condition is false).*

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
An unfamiliar institution should not fail generation.

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
fixed operation set is a contract the generator, the evaluator
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

The generation call uses OpenAI's `strict: true` structured-output mode, which
requires a fully closed schema. That forces three rules on every emitted document:

1. **Every property declared in the schema must be present in the output.** No
   optional-by-omission.
2. **Unused scalars are `null`** — never omitted.
3. **Unused arrays are `[]`** — never `null`, never omitted.

This is why `outcome_effect` always carries `return_to_step` and `prompt_source`
even when they don't apply, and why `computedArguments` declares all seven argument
slots regardless of operation.

## 4.8 `metadata` — the model's self-assessment

```jsonc
"metadata": {
  "confidence":     "high",
  "ambiguities":    [ "Assumed 'department head' means head_of_department" ],
  "unmapped_roles": [ "faculty_registrar" ],
  "is_workflow":    true
}
```

Provenance (who generated it, when, from which prompt) is not in the definition. It
lives on the template version that stores it: `prompt`, `created_by`, `created_at`
and `generation_attempts` ([§5.5](#55-versioned-template-storage--embeddings)).

Two fields do real work:

- **`ambiguities`** is where the model reports assumptions it had to make. It is
  shown to the workflow manager in the editor, turning a silent guess into a visible decision.
- **`is_workflow`** is the channel by which the generator **refuses** non-workflow
  input — see below. Publishing is a template status, not a metadata field
  ([§5.2](#52-workflow-template-lifecycle)).

## 4.9 Non-workflow input is a first-class outcome

If the source text describes no institutional process at all ("here is my grocery
list"), the prompt instructs the model **not** to hallucinate a workflow. Instead it
emits the smallest valid document — one `review` step, `system`-resolved, with
`metadata.is_workflow: false` and an `ambiguities` entry saying why.

The generation service then rejects that result with `WorkflowTemplateGenerationError`
(HTTP 422, code `WORKFLOW_TEMPLATE_PROMPT_REJECTED`, the model's ambiguities in
`details`), even though it is schema-valid. Nothing is stored. Refusal is modeled inside the schema so the model
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

**Code:** [`src/services/authentication.service.ts`](unblock-ai-api/src/services/authentication.service.ts) ·
[`src/services/user-session.service.ts`](unblock-ai-api/src/services/user-session.service.ts) ·
[`src/services/user.service.ts`](unblock-ai-api/src/services/user.service.ts) ·
[`src/repositories/`](unblock-ai-api/src/repositories/) ·
[`src/middlewares/authenticate.middleware.ts`](unblock-ai-api/src/middlewares/authenticate.middleware.ts) ·
[`src/middlewares/require-authentication.middleware.ts`](unblock-ai-api/src/middlewares/require-authentication.middleware.ts) ·
[`src/middlewares/require-permission.middleware.ts`](unblock-ai-api/src/middlewares/require-permission.middleware.ts) ·
[`src/middlewares/require-task-ownership.middleware.ts`](unblock-ai-api/src/middlewares/require-task-ownership.middleware.ts)

### One `users` table; access is a set of permissions

Every account is a row in a single PostgreSQL `users` table that holds identity and
credential fields only: email, full name, password hash, status (`active` |
`disabled`), login bookkeeping, and the user who created it. Users sign in with
**email**, which is stored trimmed and lower-cased and is unique on `lower(email)`.

What a user may do is a set of **permissions** in `resource:action` form, held as rows
in a `user_permissions` join table against a `permissions` catalogue (the
`Permission` enum in [`permission.constant.ts`](unblock-ai-api/src/data/constants/permission.constant.ts)):

| Permission | Grants |
|---|---|
| `workflow:manage` | Create, generate, publish and archive workflow templates |
| `task:create` | Find a workflow, and create, complete and manage **one's own** task requests. Also grants read access to published templates via `GET /workflow-templates*` |
| `task:approve` | List, open and decide one's assigned approvals in the app (`/dashboard/approvals*`, `/api/approver/*`). Approval links stay token-based and work without it ([§12.2](#122-two-independent-authentication-mechanisms)) |
| `user:manage` | Create and view users and their permissions |

A user can hold any combination. **Every user must hold at least one permission**,
enforced twice: `UserService` validates the input, and a `DEFERRABLE INITIALLY
DEFERRED` constraint trigger rejects, at `COMMIT`, any transaction that leaves a
user with none ([§7.2](#72-postgresql--user-tables)).

### Opaque, server-side sessions

`POST /auth/login` returns a random 256-bit token encoded as base64url
([`user-session-token.util.ts`](unblock-ai-api/src/utils/auth/user-session-token.util.ts)).
Only its SHA-256 hex hash is stored, in `user_sessions.token_hash`; the token itself
exists only in the login response and the client's cookie. The token is not signed,
so there is no session secret to configure or rotate.

| Property | Behaviour |
|---|---|
| Per-request lookup | `authenticate` hashes the Bearer token and finds an active session by hash, then loads the user with their permissions |
| Expiry | **Absolute** — `SESSION_TTL_HOURS` (default 12) after login, no sliding renewal |
| Activity | `last_seen_at` is refreshed at most once every 5 minutes; a failed refresh is logged and never fails the request |
| Concurrency | No limit — every login creates a new session. A user's expired sessions are deleted each time that user logs in |
| Revocation | **Immediate.** Logout revokes the current session (`signed_out`). A user can list their own active sessions and revoke any one of them, or all others at once (`revoked_by_user`) |
| Client metadata | `user_agent` only. No IP address is stored |

A session only resolves while its user's status is `active`.

### Login, step by step

[`AuthenticationService.login()`](unblock-ai-api/src/services/authentication.service.ts):

```
1. Normalise the email and look up the user's credentials
     unknown email   -> burn equivalent scrypt time, then 401 INVALID_CREDENTIALS
2. Verify the password - always, BEFORE any account-state check, so response
   timing does not reveal whether an account is locked
3. Account locked?   -> 403 ACCOUNT_LOCKED       (even when the password matched)
4. Wrong password?   -> count the failure; 403 ACCOUNT_LOCKED if this failure
                        reached the limit, otherwise 401 INVALID_CREDENTIALS
5. Account disabled? -> 403 ACCOUNT_DISABLED
6. Reset the failure counter, record last_login_at, issue a session
```

An unknown email and a wrong password produce the same `401` and the same message,
"Invalid email or password".

### Account lockout

When `AUTH_MAX_FAILED_ATTEMPTS > 0`, an account is **locked** while
`failed_login_count >= AUTH_MAX_FAILED_ATTEMPTS` and the last failure happened within
`AUTH_LOCKOUT_DURATION_MINUTES` (default 15). A locked account is refused **even with
the correct password**. Once that window has passed, the next failure restarts the
count at 1; a successful login resets it to 0. The counter update is a single SQL
statement, so concurrent attempts cannot lose a count.

With `AUTH_MAX_FAILED_ATTEMPTS=0` — the default — failures are still counted but
never enforced. A failure is logged with the user id and the count, never the email
or the password. There is **no IP-based rate limiting**.

### Authentication and authorization are separate layers

This split is load-bearing:

```
authenticate middleware       - runs on EVERY request
                                resolves the Bearer token,
                                populates req.auth = { user, session }
                                NEVER rejects

requireAuthentication()       - per-route guard: an active session
                                  none -> 401 AUTHENTICATION_REQUIRED
requireAnyPermission(...p)    - per-route guard: holds at least one of p
                                  none -> 401 AUTHENTICATION_REQUIRED
                                  lacks p -> 403 PERMISSION_DENIED
createRequireTaskOwnership()  - /tasks/:id* guard: the caller created the task
                                  otherwise -> 404 (existence not revealed)
```

**Why:** `/api/approvals/*` is authenticated by a **completely different
mechanism** — a per-step approval token in the URL. An approver has no account and
no session. If authentication rejected unauthenticated requests globally, the entire
approval path would be unreachable. Instead, `authenticate` is permissive and
observational; the guards do the gating, applied only where they belong. The full
route → guard map is in [§9.2](#92-route-bindings).

### Tasks are owner-only

`POST /tasks` records the caller's user id as the task's `created_by`. `GET /tasks`
always filters by the caller, whatever query parameters are sent. Every
`/tasks/:id*` route additionally runs the ownership guard, which answers **`404`,
not `403`**, for a task that exists but belongs to someone else, so the response
does not reveal that the task exists.

### User management

`POST /api/users`, `GET /api/users` and `GET /api/users/:userId`, all gated on
`user:manage` ([`user.service.ts`](unblock-ai-api/src/services/user.service.ts)):

- `email` is trimmed, lower-cased, pattern-checked and at most 254 characters; a
  duplicate is `409 EMAIL_ALREADY_REGISTERED`.
- `full_name` is trimmed, 1–200 characters.
- `permissions` is a non-empty, duplicate-free list of known permissions. A
  `user:manage` holder may grant any permission, including `user:manage`.
- The creating user's id is recorded as `created_by_user_id` on the user and as
  `granted_by_user_id` on each permission row.
- **Every new user gets the password in `USER_DEFAULT_PASSWORD`** (required, no code
  fallback, never returned or logged; `12345` in `.example.env`).

There is no update, disable or delete endpoint, and no password change or reset flow
yet. The first account is created by the seed pack ([§7.2](#72-postgresql--user-tables)).

### Password hashing: `node:crypto` scrypt

Not `bcrypt`, not `argon2`. Both require a native build toolchain, which is
painful on Windows and adds a compilation step to CI. `scrypt` is a memory-hard KDF
already in the Node standard library —
[`password.util.ts`](unblock-ai-api/src/utils/shared/password.util.ts).

### The repositories are pluggable

Postgres data access is split by responsibility into repositories under
[`src/repositories/`](unblock-ai-api/src/repositories/) — **user**, **user session**,
**organisational unit**, **designation** and **user affiliation**. Each is an interface
with a `postgres` and an in-memory implementation plus an `index` factory, and
`POSTGRES_REPOSITORY_BACKEND` (`postgres` | `memory`) selects the implementation for all of them.

The in-memory implementations reproduce the Postgres behaviour — the email conflict,
the at-least-one-permission rule, session revocation semantics — by throwing the
same errors. The test helpers construct them directly, so `npm test` runs with **no
live PostgreSQL at all**, the same trick `mongodb-memory-server` provides for Mongo.
A server started with `memory` begins with no users, and the seed pack writes only
to Postgres, so `memory` is for tests, not for signing in to a running server.

### Web-side session flow

```
1. User posts email + password to unblock-ai-web POST /api/auth/login (Route Handler)
2. That handler calls the API POST /api/auth/login, forwarding the browser's
   User-Agent  -> { token, expires_at, user }
3. It sets an httpOnly cookie  ua_session  ON THE WEB APP'S OWN ORIGIN,
   expiring at expires_at
4. The browser lands on /dashboard (or the ?next= path it was sent from)
5. proxy.ts lets /dashboard* and /old* render only if ua_session is present
6. Server Components read the cookie and call the API directly with a Bearer header;
   getSession() resolves the user through GET /auth/me
7. Browser fetches go through /api/proxy/*, which reads the cookie server-side
   and attaches the Bearer header upstream
8. Sign out: POST /api/auth/logout revokes the session at the API, then deletes
   the cookie (the cookie is deleted even if the API call fails)
```

**Step 3 is deliberate.** The cookie is set by the *web app*, never by the API. That
keeps the flow working if the API later moves to a different domain, and means the
token never reaches JavaScript — only an httpOnly `Set-Cookie`.

**Step 7 exists because** a browser fetch can never read an httpOnly cookie to set
its own `Authorization` header. The same-origin proxy Route Handler can.

**`proxy.ts` is UX, not security.** It only checks that the cookie exists and
otherwise redirects to `/login?next=…`; it cannot validate an opaque token. Real
validation is the API: an expired, revoked or junk token makes `getSession()` return
`null` and every guarded API call fail with `401`. Dashboard pages and `/old/account`
redirect to `/login` when `getSession()` returns `null`.

### The `/old/account` page

The former landing page after sign-in: profile (name, email, initials), the user's
permissions as badges, and their **active sessions** — device (user agent), sign-in
time and last activity, with the current session marked "This device". Actions: sign
out any other single session, **sign out of other sessions**, and sign out.

Sign-in now lands on `/dashboard`. `/old/account` is still
reachable by URL. The old `/admin` template screens have been removed; workflow
template management lives at `/dashboard/workflows` ([§8.6](#86-the-workflow-template-editor)).

---

## 5.2 Workflow Template Lifecycle

**Code:** [`src/services/workflow-template.service.ts`](unblock-ai-api/src/services/workflow-template.service.ts) ·
[`src/controllers/workflow-template.controller.ts`](unblock-ai-api/src/controllers/workflow-template.controller.ts) ·
[`src/routes/workflow-template.route.ts`](unblock-ai-api/src/routes/workflow-template.route.ts)

A **workflow template** is the unit a workflow manager works with. It has a UUID,
a title, a status, an optional prompt that has been saved but not yet generated
(`draft_prompt`), and a pointer to its current generated version. Every template moves through three statuses:

```
  POST /workflow-templates            POST /workflow-templates/generate
  (title + prompt, nothing generated)   (prompt, optional title)
           |                                     |
           v                                     |
        draft  --- POST /:id/generate ---+       |
                                         v       v
                                      unpublished          <- invisible to retrieval
                                         |
                              POST /:id/publish
                                         v
                                      published            <- offered to requesters
```

| Status | Meaning |
|---|---|
| `draft` | Title and prompt saved, nothing generated. `current_version` is `null`. Cannot be published (`409 WORKFLOW_TEMPLATE_NOT_GENERATED`). |
| `unpublished` | At least one version generated. The workflow manager is reviewing the flowchart. |
| `published` | Retrieval can find it and requesters can start tasks from its current version. Publishing again is `409 WORKFLOW_TEMPLATE_ALREADY_PUBLISHED`. |

| Rule | Behaviour |
|---|---|
| **Regenerating creates a version** | `POST /:id/generate` with a prompt generates a new immutable version at `current_version + 1`. A `draft` becomes `unpublished`; an `unpublished` template stays `unpublished`; a **`published` template stays published, so the new version goes live immediately**. Older versions remain for the tasks that reference them. |
| **Titles never create a version** | The title lives on the template. `PATCH /:id` with a new `title` updates it and re-embeds the retrieval text, but leaves the versions alone. |
| **Editing the prompt is saved separately** | `PATCH /:id` with `draft_prompt` saves edited prompt text without generating. A `draft_prompt` identical to the current version's prompt is stored as `null`; `has_ungenerated_changes` is true when a generated template has a non-null `draft_prompt`. A `draft` must keep its prompt (`null` is `400`). |
| **Archive replaces delete** | Nothing is deleted. `POST /:id/archive` sets `archived_at`; an archived template is hidden from retrieval and from the default list, and every change except restore is `409 WORKFLOW_TEMPLATE_ARCHIVED`. `POST /:id/restore` clears it. |
| **Authorship is recorded** | Templates store `created_by` / `updated_by`, versions store `created_by`, all as user ids. Responses resolve them to `{ id, full_name, email }`. |
| **Generation failures store nothing** | If the model cannot produce a valid definition, or refuses the prompt, the request fails with `422` and no version is written. A prompt saved as a `draft` (or in `draft_prompt`) survives the failure. |

Limits: title at most 200 characters after collapsing whitespace; prompt at most
20,000 characters after trimming. When `POST /generate` is sent without a title, the
model's title is used, cut to 200 characters.

---

## 5.3 Workflow Template Generation — Prompt → Workflow JSON

**Code:** [`src/services/workflow-template-generation.service.ts`](unblock-ai-api/src/services/workflow-template-generation.service.ts) ·
[`src/data/prompts/`](unblock-ai-api/src/data/prompts/)

The centrepiece. Four stages — detailed further in [§11.2](#112-the-workflow-template-generation-pipeline).

```
   prompt
     |
     v
  +----------------------------------------------------------+
  | 1. PROMPT ASSEMBLY                                        |
  |    system prompt (all schema semantics)                   |
  |    + 2 few-shot examples (real sample files)              |
  |    + the workflow manager's prompt                        |
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
          |        |    up to WORKFLOW_TEMPLATE_GENERATION_ |
          |        |    MAX_ATTEMPTS (3)                    |
          |        +----------+---------------+-------------+
          |            retry  |        spent  |
          |                   +-->(back to 2) v
          |               422 WORKFLOW_TEMPLATE_GENERATION_FAILED
          v
  +----------------------------------------------------------+
  | 5. NON-WORKFLOW GUARD                                     |
  |    metadata.is_workflow === false  ->  422                |
  |    WORKFLOW_TEMPLATE_PROMPT_REJECTED                      |
  +----------------------------------------------------------+
```

The service returns the definition without its `title`, plus the attempt count;
`WorkflowTemplateService` stores it as a version ([§5.5](#55-versioned-template-storage--embeddings)).

**The self-repair loop is the quality mechanism.** A structured-output call
guarantees the *shape* is right; it cannot guarantee the *graph* is coherent. The
repair loop closes that gap by handing the model its own failure and asking for a
targeted fix, which is far more reliable than regenerating from scratch.

---

## 5.4 Validation — Schema + Graph

**Code:** [`src/services/validation.service.ts`](unblock-ai-api/src/services/validation.service.ts) ·
[`src/utils/workflow/schema-validator.util.ts`](unblock-ai-api/src/utils/workflow/schema-validator.util.ts) ·
[`src/utils/workflow/graph-validator.util.ts`](unblock-ai-api/src/utils/workflow/graph-validator.util.ts)

Validation is a standalone service, not a private step inside generation, so the
same checks can be reused and tested on their own. Today its only caller is the
generation loop: every stored version has passed both layers. There is no
hand-edit path and no separate validate endpoint — a workflow manager changes a
template by editing the prompt and regenerating.

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

**Code:** [`src/services/workflow-template.service.ts`](unblock-ai-api/src/services/workflow-template.service.ts) ·
[`src/services/embedding.service.ts`](unblock-ai-api/src/services/embedding.service.ts) ·
[`src/models/workflow-template.model.ts`](unblock-ai-api/src/models/workflow-template.model.ts) ·
[`src/models/workflow-template-version.model.ts`](unblock-ai-api/src/models/workflow-template-version.model.ts)

### Two collections: the template and its versions

| Collection | One document per | Holds |
|---|---|---|
| `workflow_templates` | template (string UUID `_id`) | `title`, `description`, `status`, `draft_prompt`, `current_version`, `retrieval` (embedding of the current version), `archived_at`, `created_by`, `updated_by`, timestamps |
| `workflow_template_versions` | generated version | `workflow_template_id`, `version`, `prompt`, `definition` (without `title`), `generation_attempts`, `created_by`, `created_at` |

### Versions are never updated in place

Every generation inserts a **new version** at `current_version + 1` and then moves
the template's `current_version` pointer. Version documents are never modified;
a unique index on `{ workflow_template_id, version }` guards the sequence.

**Why:** a task pins the exact `{ workflow_template_id, workflow_template_version }`
it was created from. An in-progress approval chain must not change shape because a
workflow manager regenerated the template underneath it. Version-pinning makes that
structurally impossible rather than merely unlikely. Runtime reads take the
pinned version's definition and merge in the template's current title.

### The template carries the retrieval embedding

When a version is generated — and when the title changes — the service renders
the title plus the version's `retrieval_summary` into one text, embeds it, and
stores it on the template as `retrieval` (`text`, `embedding`, `aliases_lower`,
`retrieval_summary`, `institution_type`, `model`, `dim`, `embedded_at`). Only the
current version is ever embedded, so retrieval needs no "latest" flag. The returned
vector's length is validated against `EMBEDDING_DIMENSIONS` — a dimension mismatch
raises `EmbeddingError` (502) rather than silently poisoning the index.

### `status` is the publish gate

Retrieval queries filter on `status: "published"` and `archived_at: null` (plus
`retrieval.institution_type` when given), supported by the compound index
`workflow_template_retrieval_filter`. **Nothing is findable until a human publishes
it.** A generated version is a *proposal*; a published template is an
*institutional commitment*. See [§5.2](#52-workflow-template-lifecycle) for the
lifecycle.

---

## 5.6 Selection — The Assistant Conversation

`src/services/selection.service.ts` · `selector.service.ts` · `retrieval.service.ts` ·
`requester-profile.service.ts` · `src/utils/selection/candidate-eligibility.util.ts`

The requester describes a need in a chat. The assistant uses what the directory already knows
about them to pick one published template, usually with **no clarifying question**.

### The requester profile — derived, never asked for

`RequesterProfileService` reads the requester's memberships, designations and effective
faculties from Postgres and derives their actor types from designation categories (a Student
designation makes them `student`, a Lecturer `faculty` and `staff`). It also renders
**numbered facts** — `P1: Member of Department of Information Technology (Faculty of
Information Technology)`, `P2: Holds Student in Department of Information Technology`. No AI.

### One embedding, then deterministic eligibility

The first message is embedded once; the vector search, alias boost and `RETRIEVAL_TOP_K` cut
work as before (optionally with `RETRIEVAL_MIN_SCORE`). The candidate set is then **frozen on
the session**, so clarification turns cost no second embedding.

Before any LLM call, each candidate is checked against the profile:

- **Audience** — a non-empty `scope.applies_to.organisational_unit_codes` must include one of
  the requester's units or a unit's parent (a department member matches their faculty's
  audience).
- **Requester type** — `scope.applies_to.actor_type` other than `any` or `external` must be one
  of the requester's known actor types (skipped when the requester has no designations).

Excluded candidates are reported in the thinking trace and never sent to the model. **No
eligible candidate means no LLM call.**

### The selector — one structured call

The selector (`LlmOperation.workflow_selection`, optionally on a smaller model through
`LLM_SELECTION_MODEL`) receives the profile facts and compact candidates and returns:

| Decision | Meaning |
|---|---|
| `matched` | One template chosen, with the profile fact ids it relied on |
| `ambiguous` | One clarifying question with options — the only LLM text shown to users |
| `no_match` | Nothing suitable — never stretches to the nearest option |
| `start_requested` | The requester confirmed ("Start the task"); the web app creates the task |
| `manual_choice` | Produced by the service when `SELECTION_MAX_ROUNDS` is spent — never by the model |

The prompt tells the selector never to ask about something a fact already answers, so the old
"Which faculty?" round disappears.

### Ephemeral and owned

Sessions carry `created_by` and `expires_at` (`SELECTION_SESSION_TTL_HOURS`, default 24) with a
Mongo TTL index. Only the owner can read or continue a session; anyone else gets 404. Starting a
task copies the conversation into the task and deletes the session; an abandoned chat simply
expires. Sessions are capped at 20 messages.

### Composed by the web app

The API returns typed data only: decision kinds, ids, the trace, the matched profile facts and a
**deterministic workflow overview** (steps, who acts on each, what information is needed). Every
sentence the assistant shows is composed by the web app from copy modules.
`GET /selection/catalogue` lists everything the requester is eligible for with no embedding and
no LLM, which backs **See what Unblock can do**.

## 5.7 Task Plan and Forms

`src/services/task.service.ts` · `task-plan.service.ts` · `task-form.service.ts` ·
`assignee-resolution.service.ts` · `src/services/assignee-resolution/` ·
`src/utils/task/task-plan-compiler.util.ts`

### Compile a complete plan at creation

`POST /tasks` (from a matched session, or from the catalogue) loads the version-pinned
definition, resolves every assignee, and calls a **pure compiler** that returns the whole plan:
ordered steps, one stored form per form step, prefilled values and unsupported inputs. The task
starts immediately; its first active step is usually the entry form. No AI is involved from here
to the end of the request.

### Approvers come from the directory

A registry of resolvers, keyed by actor resolution, decides each assignee:

1. A role that is an **active designation code** is looked up among the requester's units
   (plus effective faculties) narrowed to the template audience, filtered to the designation's
   unit types.
2. Exactly one holder who is not the requester → **resolved and locked** (`directory`).
3. Several holders → a **select field** listing exactly those people (`requester_choice`).
4. No holder → retry with `fallback_role`, otherwise the requester names the person.
5. A role that is **not** a designation code (for example `academic_advisor`) → the requester
   names the person (`requester_supplied`); the fallback is not used, because the directory
   lacks the data rather than finding the post vacant.

`requester` actors resolve to the requester and `system` actors to the system. Because approver
roles became designation codes at generation time, most roles resolve with no mapping layer.

### Forms instead of one-question popups

- Each `data_collection` step lists the inputs it gathers in `collects_inputs`. Inputs no step
  claims go to a synthesised **entry form** placed before every workflow step with no
  dependency, so a legacy definition compiles into "one entry form, then the workflow".
- Each input type maps to a control and width (text areas full width, everything else half).
- The entry form opens with a locked **Your details** section — name, email, faculty,
  department and division from the account — and, when needed, an **Approver details** section.
  Legacy input ids such as `full_name` or `requester_email` map onto those attributes and are
  locked too. Index number, phone, batch and degree programme are not in the data model, so the
  requester types them.
- `file` inputs are not collected online; they are listed in `unsupported_inputs`.

**Drafts any time, submission when active.** A form can be saved as a draft at any status
except terminal, even before its step starts (type and format checks only). Submission needs
the step to be `awaiting_requester` and validates `required` plus cross-field rules (a return
date not before the departure date). A submitted form is read-only; locked fields can never be
written.

### The engine: pure state machine plus effect executor

`TaskEngineService` never does I/O. Given a task and an event (start, form submitted, decision
recorded, cancel) it returns the next task and a list of `TaskEffect`s:

- A `form` or `information_request` step becomes `awaiting_requester`; an approval or review
  becomes `awaiting_approver` and emits `DISPATCH_APPROVAL`; notification and automated steps
  complete at once.
- **Conditions are evaluated** when dependencies are satisfied, over `inputs.*`, `computed.*`,
  `requester.*`, `steps.<id>.outcome` and `system.today`. `false` → `skipped` ("Not
  required"); a condition that cannot be evaluated yet runs the step.
- **Dead ends end the task**: no active step and an unmet completion rule ends it as `rejected`
  (when any step was rejected) or `cancelled`.

`TaskEffectExecutorService` performs the effects after a successful write — issuing approval
tokens and sending email — and never throws into the caller. Every write is
`findOneAndReplace({ _id, revision })`; a lost race is `409 TASK_REVISION_CONFLICT`, and the web
app refetches.

| Task status | Step status | Step outcome |
|---|---|---|
| `in_progress`, `completed`, `rejected`, `cancelled` | `upcoming`, `awaiting_requester`, `awaiting_approver`, `completed`, `skipped`, `cancelled` | `completed`, `approved`, `rejected`, `request_more_info`, `skipped` |

## 5.8 Approvals

`src/services/approval.service.ts` · `approver-assignment.service.ts` · `notification.service.ts` ·
`src/utils/approval/token.util.ts` · `src/utils/approval/approver-identity.util.ts` ·
`src/utils/task/information-request-insertion.util.ts`

### Two channels, one engine

An approver decides either from the **emailed link** or in the **approvals inbox** inside the
dashboard. Both go through `TaskEngineService.recordDecision` and the same revision-checked
commit. Whichever decides first wins; the other channel then shows the step as decided, or
answers `409 APPROVAL_ALREADY_DECIDED`. `ApprovalService` has two resolvers (`resolveToken`,
`resolveAssignment`) that build the same `ApprovalContext`, and one shared view builder and
decision path, so the comment rules and the allowed decisions are written once. Each decision
records `decided_via` (`email_link` or `app`) and `decided_by_user_id`.

The inbox (`/api/approver/approvals/*`, `task:approve`):

- **Assignment** — a step is the caller's when `assignee.user_id` is their id, or
  `assignee.email` is their normalised account email. Assignee emails are stored trimmed and
  lower-cased, so an approver the requester named by email is covered too. The rule lives only
  in `approver-identity.util.ts`.
- **No self-approval in the app** — the caller's own requests never appear, and opening one
  answers `404 APPROVAL_NOT_FOUND`, like any step not assigned to them.
- **Link state is ignored** — a failed or expired email never blocks a signed-in approver.
- **Per-step rows** — one aggregation (`$elemMatch` pre-filter, `$unwind`, `$facet`) returns one
  row per (task, approval step), so a repeat review is a second row. Pending is oldest first;
  history is newest decision first and filterable by decision.

### Tokens never leave the approver channel

Each dispatched approval gets an HMAC-signed token, emailed as
`${APP_PUBLIC_URL}/approvals/<token>`. Only `sha256(token)` is stored on the step. No requester
DTO contains a token or a hash. Tokens are invalidated on decision (through either channel) and
on cancel, and expire
after `APPROVAL_TOKEN_TTL_DAYS`: an invalid link is 404, an expired one 410, a decided one 409
for a new decision (the view still loads and shows the decision).

### Three decisions with comments

| Decision | Comment | Effect |
|---|---|---|
| `approved` | optional | The task advances, or completes |
| `rejected` | required | The task ends as `rejected`; open steps are cancelled and other links revoked |
| `request_more_info` | required | Steps are inserted (below) |

### Requesting more information inserts steps

The approval completes with outcome `request_more_info`. Right after it, an
`information_request` step is inserted, holding one required text-area field labelled with the
approver's comment; after that, a **repeat** of the same approval (same assignee). Every step
that depended on the original approval is rewired to depend on the repeat. The requester is
emailed; when they answer, a fresh link goes to the same approver, whose page shows a "Repeat
review" notice. The cap is `TASK_MAX_INFORMATION_REQUESTS_PER_STEP` (default 3) per approval;
at the cap the option is no longer offered.

### Notifications

Approval request, requester action required, information requested, rejected and completed
emails, all addressed from `task.requester` and `step.assignee`. None reads a form value, and
none throws: a failed send is logged rather than rolling back a recorded decision.
`MAIL_TRANSPORT=console` prints every email, approval links included.

## 5.9 Transcript

`src/services/task-transcript.service.ts` · `src/utils/document/task-transcript.util.ts` ·
`src/services/document/`

When a task completes, a transcript PDF is built from the task and its version-pinned
definition, attached to the completion email (`DOCUMENT_ATTACH_TO_EMAIL`, under
`DOCUMENT_MAX_ATTACHMENT_BYTES`), and available from `GET /tasks/:id/transcript`. It is
**rendered on demand and never stored**; the audit log records `transcript_emailed`.

It holds the header, requester details, the requester's original messages, every submitted form
section in step order, information request questions and answers, the approval trail (step,
approver, designation, decision, comment, time), skipped steps marked "Not required", and
computed values. The renderer is pluggable (`pdfkit`, or text for tests and console runs).
`DOCUMENT_ENABLED=false` turns it off; the endpoint then answers
`409 TASK_TRANSCRIPT_UNAVAILABLE`.

### Smoke test

`npm run smoke-test:document` renders a transcript to a local file for eyeballing.

## 5.10 Deletion Tracking and Audit

| What | Where | How |
|---|---|---|
| **Workflow templates** | Never deleted | Archived and restored instead ([§5.2](#52-workflow-template-lifecycle)). Versions are immutable and stay for the tasks that reference them |
| **Task deletions** | Mongo `audit_logs` | `TaskService` writes an audit row with a snapshot (reference, `workflow_template_id`, `workflow_template_version`, status, step outcomes) before the hard delete |

Templates used to be hard-deleted, with a Postgres `template_deletions` log and a
typed-confirmation endpoint. Both were removed: archive-only means there is no
destructive template operation left to log, and no cross-database write to order.
Who last changed a template is recorded on the template itself as `updated_by`.

---

# 6. Backend Architecture

## 6.1 Strict layering

```
   routes  ->  controllers  ->  services  ->  models        ->  db (MongoDB)
                    |               |    ->  repositories  ->  db (PostgreSQL)
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
| **repositories** | PostgreSQL access behind an interface (user, user session, organisation), with a `postgres` and an in-memory implementation | Business rules such as permission validation, lockout policy or password hashing |
| **utils** | Pure functions | Any I/O, any config read beyond arguments, any class state |
| **config** | Read and validate `process.env` **once**, export frozen objects | Anything else |

## 6.2 Dependency injection — manual, no container

`server.ts` is the single **composition root**. Every service receives its
collaborators through constructor injection; nothing imports a concrete singleton.

```ts
const workflowTemplateModel        = new WorkflowTemplateModel();
const workflowTemplateVersionModel = new WorkflowTemplateVersionModel();
// ...
const embeddingService  = new EmbeddingService({ embeddingAdapter });
const validationService = new ValidationService();
const workflowTemplateGenerationService = new WorkflowTemplateGenerationService({ llmAdapter, validationService });

const { userRepository, userSessionRepository, /* organisation repositories */ } =
  createRepositoryRegistry(config.postgres.repositoryBackend);

const userSessionService    = new UserSessionService({ userSessionRepository, authConfig: config.auth });
const authenticationService = new AuthenticationService({
  userRepository, userSessionService, authConfig: config.auth,
});
// ... userService, organisation services

const workflowTemplateService = new WorkflowTemplateService({
  workflowTemplateModel, workflowTemplateVersionModel,
  generationService: workflowTemplateGenerationService,
  embeddingService, userRepository,
});

const vectorStore = createVectorStore(config.retrieval.vectorBackend, {
  workflowTemplateModel,
  indexName: config.retrieval.atlasIndexName,
});
// ... retrieval, selector, selection, planner, mailer, notification,
//     execution, documentRenderer, completionDocument, task, approval, controllers

const app = createApp(controllers, {
  authenticationService,
  routeGuards: { requireTaskOwnership: createRequireTaskOwnership({ taskService }) },
});
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
authenticate    -> resolves the Bearer session, populates req.auth, NEVER rejects
/api router     -> requireAuthentication() / requireAnyPermission(...) applied per
                   route; the task-ownership guard on /tasks/:id*
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

### The twelve subclasses

| Class | Status | `code` | Raised for |
|---|---|---|---|
| `ValidationError` | 400 | `VALIDATION_ERROR` | Malformed/missing bodies or fields. Has `.forField()` and `.forObject()` factories |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` (default) | Auth raises it with `INVALID_CREDENTIALS` (wrong email or password) or `AUTHENTICATION_REQUIRED` (no active session on a guarded route) |
| `ForbiddenError` | 403 | `FORBIDDEN` (default) | Auth raises it with `PERMISSION_DENIED` (signed in, lacks the route's permission), `ACCOUNT_LOCKED` or `ACCOUNT_DISABLED` |
| `NotFoundError` | 404 | `NOT_FOUND` | Missing session/task — including a task owned by someone else. Has `.of(resource, id)` factory. Also raised with `WORKFLOW_TEMPLATE_NOT_FOUND`, `WORKFLOW_TEMPLATE_VERSION_NOT_FOUND`, `USER_NOT_FOUND` and `USER_SESSION_NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` | Well-formed but conflicts with current state. Raised with `EMAIL_ALREADY_REGISTERED` for a duplicate user email, and with `WORKFLOW_TEMPLATE_ARCHIVED`, `WORKFLOW_TEMPLATE_NOT_ARCHIVED`, `WORKFLOW_TEMPLATE_NOT_GENERATED`, `WORKFLOW_TEMPLATE_ALREADY_PUBLISHED` and `WORKFLOW_TEMPLATE_NOT_PUBLISHED` for template lifecycle conflicts |
| `WorkflowTemplateGenerationError` | 422 | `WORKFLOW_TEMPLATE_GENERATION_FAILED` | Generation failed after all repairs (validator errors in `details`). Raised with `WORKFLOW_TEMPLATE_PROMPT_REJECTED` when the model flags the prompt as not a workflow (the model's ambiguities in `details`) |
| `SelectionError` | 502 | `SELECTION_ERROR` | The selector-agent Azure call failed |
| `EmbeddingError` | 502 | `EMBEDDING_ERROR` | Embeddings call failed or returned an unexpected dimension |
| `DatabaseError` | 500 | `DATABASE_ERROR` | An unexpected MongoDB failure |
| `ConfigurationError` | 500 | `CONFIGURATION_ERROR` | Missing/invalid env var at startup. `isOperational: false` |
| `MigrationError` | 500 | `MIGRATION_ERROR` | A migration run failed (CLI only). `isOperational: false` |
| `SeedError` | 500 | `SEED_ERROR` | A seeder run failed (CLI only). `isOperational: false` |

The auth, user and workflow template codes are the `AuthErrorCode`, `UserErrorCode` and `WorkflowTemplateErrorCode` enums in
[`src/data/constants/`](unblock-ai-api/src/data/constants/), passed through the
constructor's `code` option.

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
| `IUserRepository` · `IUserSessionRepository` · the organisation repositories | `in-memory` · `postgres` | `POSTGRES_REPOSITORY_BACKEND` (one switch for all of them) | `postgres` |
| `IDocumentRenderer` | `text` · `pdf` | `DOCUMENT_FORMAT` | `pdf` |

**The pattern pays for itself twice.** First, the system runs locally without cloud
vector search or a mail account: in-memory vectors, console mail. (The in-memory
repositories start with no users, so signing in to a running server needs
PostgreSQL.) Second, the test suite gets fakes for free — no mocking framework,
because the seam is already there.

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
const server = app.listen(config.server.port);   // schema is owned by migrations, not boot

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
| `workflow_templates` | One document per template (string UUID `_id`) | `title`, `description`, `status`, `draft_prompt`, `current_version`, `retrieval` (embedding of the current version), `archived_at`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `workflow_template_versions` | Immutable generated versions | `workflow_template_id`, `version`, `prompt`, `definition`, `generation_attempts`, `created_by`, `created_at` |
| `selection_sessions` | Ephemeral, owned assistant conversations (TTL on `expires_at`) | `created_by`, `status`, `messages[]`, `candidates[]` (frozen), `rounds_used`, `selected_workflow_template_id`, `expires_at` |
| `tasks` | Process instances (optimistic `revision`) | `reference`, `revision`, `created_by`, `requester`, `workflow_template_id`, `workflow_template_version`, `status`, `conversation[]`, `steps[]`, `forms[]`, `values{}`, `unsupported_inputs[]`, `audit[]` |
| `legacy_tasks` | Pre-revamp tasks, never read | — |
| `counters` | Sequence allocation for `reference` | one document per counter |
| `audit_logs` | Task-deletion audit | `resource`, `resource_id`, `created_at` |

### Indexes — created by the Mongo migrations

**Files:** [`20261111000000_initial-schema.migration.ts`](unblock-ai-api/src/db/migration/mongo/migrations/20261111000000_initial-schema.migration.ts) ·
[`20261111101053_workflow-templates.migration.ts`](unblock-ai-api/src/db/migration/mongo/migrations/20261111101053_workflow-templates.migration.ts)

| Collection | Index | Options | Purpose |
|---|---|---|---|
| `workflow_templates` | `{ archived_at: 1, updated_at: -1 }` | | The template list, most recently changed first |
| `workflow_templates` | `{ status: 1, archived_at: 1, "retrieval.institution_type": 1 }` | | **The retrieval filter** |
| `workflow_template_versions` | `{ workflow_template_id: 1, version: -1 }` | **unique** | Version integrity, newest first |
| `selection_sessions` | `{ created_at: -1 }` | | List newest first |
| `tasks` | `{ session_id: 1 }` | | Task-for-session lookup |
| `tasks` | `{ status: 1, created_at: -1 }` | | Filtered task list |
| `tasks` | `{ created_by: 1, created_at: -1 }` | | A user's own requests, newest first — `GET /tasks` always filters by the caller |
| `tasks` | `{ reference: 1 }` | **unique** | Human reference integrity |
| `tasks` | `{ "steps.approval_token": 1 }` | **sparse** | **Token → task, one indexed hop** |
| `tasks` | `{ workflow_template_id: 1, status: 1 }` | | Per-template task queries (`task_workflow_template_status`) |
| `audit_logs` | `{ resource: 1, resource_id: 1, created_at: -1 }` | | Audit trail reads |

`npm run migrate:mongo:up` creates them; the server never touches indexes at boot.

> **The workflow-templates migration does not migrate data.** It drops the old
> `templates` and `drafts` collections and creates the two new ones empty. Existing
> tasks and selection sessions keep their old `workflow_id` / `version` fields and no
> longer resolve to a template. Its `down()` recreates `templates` and `drafts` empty.
> Treat it as a reset of authored templates on any database that has them.

## 7.2 PostgreSQL — user tables

**Migrations**, applied in order:

1. [`20261111000000_initial-schema.migration.ts`](unblock-ai-api/src/db/migration/postgres/migrations/20261111000000_initial-schema.migration.ts) — creates `template_deletions` and a first set of user tables.
2. [`20261111015501_unified-users-permissions-and-sessions.migration.ts`](unblock-ai-api/src/db/migration/postgres/migrations/20261111015501_unified-users-permissions-and-sessions.migration.ts) —
   replaces those user tables with `permissions`, `users`, `user_permissions` and
   `user_sessions`, and points `template_deletions` at `users`.
3. [`20261111060534_organisational-structure-and-user-affiliations.migration.ts`](unblock-ai-api/src/db/migration/postgres/migrations/20261111060534_organisational-structure-and-user-affiliations.migration.ts) —
   adds the organisational structure and user affiliation tables (not described here).
4. [`20261111101054_workflow-template-archive-only.migration.ts`](unblock-ai-api/src/db/migration/postgres/migrations/20261111101054_workflow-template-archive-only.migration.ts) —
   drops `template_deletions` (templates are archived, never deleted) and rewords
   the `workflow:manage` permission description.

The user tables below are the state after all four.

### `permissions`

```sql
code        TEXT PRIMARY KEY      -- 'workflow:manage' | 'task:create' | 'task:approve' | 'user:manage'
description TEXT NOT NULL
```

A catalogue of reference data: the migration inserts the four rows. Codes mirror the
`Permission` enum.

### `users`

```sql
id                   UUID PRIMARY KEY DEFAULT gen_random_uuid()
email                TEXT NOT NULL          -- CHECK: email = lower(btrim(email))
full_name            TEXT NOT NULL
password_hash        TEXT NOT NULL          -- node:crypto scrypt
status               TEXT NOT NULL DEFAULT 'active'   -- CHECK: 'active' | 'disabled'
failed_login_count   INTEGER NOT NULL DEFAULT 0       -- CHECK: >= 0
last_failed_login_at TIMESTAMPTZ
last_login_at        TIMESTAMPTZ
created_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL
created_at, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

CREATE UNIQUE INDEX users_email_key ON users (lower(email));
```

**Case-insensitive uniqueness via a `lower()` functional index**, deliberately
avoiding a dependency on the `citext` extension. A duplicate email surfaces as
`409 EMAIL_ALREADY_REGISTERED`.

### `user_permissions`

```sql
user_id            UUID NOT NULL REFERENCES users(id)         ON DELETE CASCADE
permission_code    TEXT NOT NULL REFERENCES permissions(code) ON DELETE RESTRICT
granted_by_user_id UUID          REFERENCES users(id)         ON DELETE SET NULL
granted_at         TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (user_id, permission_code)
```

**At least one permission per user** is guaranteed by two `DEFERRABLE INITIALLY
DEFERRED` constraint triggers (`users_require_permission` after `INSERT` on `users`,
`user_permissions_require_remaining_permission` after `DELETE` on
`user_permissions`). Both run `enforce_user_has_permission()` at `COMMIT`, so a user
and their permission rows can be inserted in one transaction in either order.
Deleting a user cascades to its permission rows; the trigger then finds the user gone
and passes, so user deletion is not blocked.

### `user_sessions`

```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
token_hash        TEXT NOT NULL UNIQUE    -- SHA-256 hex of the opaque token
user_agent        TEXT
created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now()
expires_at        TIMESTAMPTZ NOT NULL    -- CHECK: expires_at > created_at
revoked_at        TIMESTAMPTZ
revocation_reason TEXT                    -- 'signed_out' | 'revoked_by_user'
```

A `CHECK` keeps `revoked_at` and `revocation_reason` both null or both set. Indexes:
a partial index on `user_id WHERE revoked_at IS NULL` (a user's active sessions) and
one on `expires_at`. A session is **active** while `revoked_at IS NULL AND
expires_at > now()`.

### Migrations

[`src/db/migration/`](unblock-ai-api/src/db/migration/) holds one shared engine and
independent Postgres and MongoDB migration sets with `up`/`down` support. Each database
tracks applied migrations, by batch, in its own `migrations` table or collection, and
guards runs with a `migrations_lock`. Each Postgres migration runs in its own transaction.
`npm run migrate:up` applies both sets. See
[`docs/guides/database-migrations.md`](unblock-ai-api/docs/guides/database-migrations.md).

### Seeds

[`src/db/seed/`](unblock-ai-api/src/db/seed/) mirrors the migration pack: a
database-agnostic core (`seed.loader`, `seed.runner`, `seed.generator`,
`seed.engine`, `seed.cli`), a Postgres adapter (`postgres.seed-context`,
`postgres.seed-engine`, `postgres.seed-template`), and timestamped seeder files in
`src/db/seed/postgres/seeders/<timestamp>_<slug>.seeder.ts`.

| Command | Does |
|---|---|
| `npm run seed:pg:run` | Run every seeder in file-name order |
| `npm run seed:pg:run -- --only <name>` | Run one seeder |
| `npm run seed:pg:list` | List the discovered seeders |
| `npm run seed:pg:create -- <name>` | Scaffold a new seeder file |

Seeders are **idempotent and untracked**: there is no seeds table; every run
re-checks and skips what already exists. They go through services such as
`UserService` rather than raw SQL, so business rules (email normalisation, the
permission list, password hashing) apply. The only seeder,
`20261111021734_administrator-user`, creates the **bootstrap administrator** from
`SEED_ADMINISTRATOR_EMAIL` and `SEED_ADMINISTRATOR_FULL_NAME`, holding all four
permissions, with the password from `USER_DEFAULT_PASSWORD`. If that email already
exists it is skipped — a re-run never changes an existing user. The seed variables
are read only by the seed command, never by the server. See
[`docs/guides/database-seeding.md`](unblock-ai-api/docs/guides/database-seeding.md).

## 7.3 Why two databases

This is deliberate polyglot persistence, not accident.

| Reason | Detail |
|---|---|
| **Relational shape** | User data has hard constraints: a unique `lower(email)`, a permission catalogue, a unique session-token hash, and an "at least one permission per user" invariant checked at `COMMIT` |
| **Real foreign keys** | `user_permissions` → `users` and `permissions`; `user_sessions` → `users` |
| **Document shape** | Workflow definitions are deeply nested, schema-versioned JSON already governed by a JSON Schema. A relational decomposition would duplicate that schema in DDL |

### The cost, stated honestly

**There is no cross-database transaction or foreign key.** Workflow templates store
`created_by` / `updated_by` (and versions `created_by`) as Postgres user ids in Mongo.
Nothing enforces them; `WorkflowTemplateService` resolves them to names with one
batched user lookup per response, and an id that no longer resolves is returned as
`null`. No operation writes to both stores, so there is no partial-write state to
reconcile.

Two connection lifecycles are managed in parallel:
[`mongo.client.ts`](unblock-ai-api/src/db/mongo.client.ts) and
[`postgres.client.ts`](unblock-ai-api/src/db/postgres.client.ts), both lazily
created, both closed on shutdown.

## 7.4 Version pinning — the data-integrity backbone

```
workflow_templates:          { _id: "x", status: "published", current_version: 2 }
workflow_template_versions:  { workflow_template_id: "x", version: 1, definition: ... }
                             { workflow_template_id: "x", version: 2, definition: ... }

tasks:  { workflow_template_id: "x", workflow_template_version: 1, ... }   <- pinned; unaffected by v2
```

A running task reads version 1 forever. Regenerating a published template makes
version 2 live for new requests immediately, but cannot change the shape of an
in-flight approval chain. Archiving a template stops new requests but leaves its
versions readable for existing tasks. This is what makes the completion
document a faithful record: it is regenerated from the *same* workflow version the
approvals actually ran against.

---

# 8. Frontend Architecture

## 8.1 Route map

| Route | Type | Guard | Purpose |
|---|---|---|---|
| `/` | Server Component | — | Redirects by session: signed in → `/dashboard`, otherwise → `/login` |
| `/login` | Server Component | — | The single sign-in page (email + password); a signed-in visitor is sent to `/dashboard` |
| `/dashboard` | Server | `proxy.ts` + session | Dashboard shell (sidebar + topbar); other dashboard pages cover tasks, approvals, users, organisation and profile |
| `/dashboard/workflows` | Server → Client | `proxy.ts` + `requireRouteAccess` + API | Workflow template list: search, Active / Archived / All filter (applied client-side over `GET /workflow-templates?include_archived=true`), archive / restore |
| `/dashboard/workflows/new` | Server → Client | `proxy.ts` + `requireRouteAccess` (`workflow:manage`) | New template editor: title + prompt, save as draft or generate |
| `/dashboard/workflows/[workflowTemplateId]` | Server → Client | `proxy.ts` + `requireRouteAccess` + API | Template editor: title, prompt, Save, Generate / Regenerate, Publish, version history drawer; `?version=N` shows a read-only historic version. A non-UUID id is a 404 |
| `/dashboard/tasks/new` | Server → Client | `proxy.ts` + `requireRouteAccess` (`task:create`) | The assistant: greeting, capabilities drawer, chat with thinking trace, match card, **Start this task**. `?session=<id>` restores the conversation after a refresh |
| `/dashboard/tasks` | Server → Client | `proxy.ts` + `requireRouteAccess` (`task:create`) | The requester's task requests: search, status filter, pagination, all in the URL |
| `/dashboard/tasks/[taskId]` | Server → Client | `proxy.ts` + `requireRouteAccess` + API ownership | The task workspace: step rail, forms, approver cards, information requests, outcome banner, plan drawer, transcript. `?step=<id>` selects a step; the topbar shows the workflow title |
| `/old/account` | Server, `force-dynamic` | `proxy.ts` + session | Profile, permission badges, active sessions (revoke one, sign out of other sessions), sign out |
| `/dashboard/approvals` | Server → Client | `proxy.ts` + `requireRouteAccess` (`task:approve`) | Pending approvals: oldest first, search, **Repeat review** badge, polls every 30 s; the sidebar shows the pending count |
| `/dashboard/approvals/history` | Server → Client | `proxy.ts` + `requireRouteAccess` (`task:approve`) | The approver's decisions: decision filter, search, comment, outcome and channel |
| `/dashboard/approvals/[taskId]/[stepId]` | Server → Client | `proxy.ts` + `requireRouteAccess` (`task:approve`) + API assignment | The in-app approval page: the same summary, history, plan rail and decision panel as the emailed page; "This approval isn't available to you" when not assigned |
| `/approvals/[token]` | Server → Client | **none** | The approver page: request summary, decisions with comments; dedicated invalid (404) and expired (410) states |
| `/api/auth/login` | Route Handler | — | Calls the API login (forwarding `User-Agent`), sets the httpOnly `ua_session` cookie |
| `/api/auth/logout` | Route Handler | — | Revokes the session at the API, then clears the cookie |
| `/api/proxy/[...path]` | Route Handler | — | Forwards browser fetches upstream with the Bearer header |

`proxy.ts` matches `/dashboard/:path*` and `/old/:path*` and only checks that the
`ua_session` cookie is present. Dashboard pages call `requireRouteAccess`, which
redirects to `/dashboard` when the user lacks the route's permission; the API still
enforces the permission on every call. The old `/admin` template screens were
removed, and so was the old requester portal; `/old/account` is reachable by URL only.

> **`/approvals/*` lives deliberately outside `/dashboard`.** The approver
> holds a token from an email, not a session. The route must not inherit a
> navigation shell that implies an account they don't have. Approvers who do have
> an account use `/dashboard/approvals/*`, which renders the same body
> (`ApproverDetailLayout`) inside the shell.

## 8.2 The single API chokepoint

[`src/lib/api/client.ts`](unblock-ai-web/src/lib/api/client.ts) is **the single
`fetch` chokepoint for every feature module** that talks to the backend:
`workflow-templates`, `selection`, `tasks`, `approvals`, `users`, `user-sessions`,
the organisation modules and `health` all build on it. The one exception is `lib/api/auth.ts`, used only server-side by `getSession()`
and the login/logout Route Handlers: it calls the API directly with an explicit token
(or, for login, the browser's `User-Agent`) and shares `client.ts`'s `ApiError`.

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

`src/types/` mirrors the backend's DTOs — `workflow.ts`, `workflow-template.ts`, `task.ts`,
`selection.ts`, `approval.ts`, `auth.ts`, `permission.ts` and others — with unions narrowed to match the backend
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
| [`assignee-source-hint.ts`](unblock-ai-web/src/lib/workflow-template/assignee-source-hint.ts) | an actor + active designation codes → **Directory** / **Requester provides** badge on each flowchart step |
| [`src/lib/task-request/*`](unblock-ai-web/src/lib/task-request/) | the task request rules — see [§8.7](#87-the-task-request-hooks-and-pure-modules) |
| [`workflow-template-editor-state.ts`](unblock-ai-web/src/lib/workflow-template/workflow-template-editor-state.ts) | template + typed title/prompt → editor flags |

> **`toFlowGraph` is deterministic.** Same workflow JSON in → byte-identical
> coordinates out. It reads `depends_on` and runs dagre — no randomness, no I/O.
> That is why node positions are **not** persisted: the layout is derived, so
> storing it would create a second source of truth that could disagree with the
> graph.

## 8.6 The workflow template editor

[`workflow-template-editor-state.ts`](unblock-ai-web/src/lib/workflow-template/workflow-template-editor-state.ts)
derives every button state from the loaded template and what is typed, rather than
juggling booleans that can contradict each other. The baseline prompt is the
template's `draft_prompt` if set, otherwise the current version's prompt. The
generation state compares the typed prompt with the current version's prompt:

| `GenerationState` | Meaning |
|---|---|
| `none` | Nothing generated yet (a new template or a `draft`) |
| `current` | The typed prompt is exactly what the current version was generated from |
| `stale` | The prompt has drifted from the current version — the flowchart on screen no longer describes the text on screen |

The actions fall out of it:

| Action | Enabled when |
|---|---|
| **Save** | Title or prompt changed. Creates a draft (`POST /workflow-templates`) or saves `title` / `draft_prompt` (`PATCH`) — never generates |
| **Generate / Regenerate** | There is a prompt and the state is not `current`. `POST /workflow-templates/generate` for a new template, `POST /:id/generate` otherwise |
| **Publish** | The template is `unpublished`, nothing is unsaved, and the state is `current` |

Everything is disabled on an archived template. The **version history drawer** lists
`GET /:id/versions`; choosing one opens `?version=N`, a read-only view of that
version's prompt and flowchart.

Code: [`src/components/workflow-templates/`](unblock-ai-web/src/components/workflow-templates/),
[`src/lib/hooks/useWorkflowTemplateEditor.ts`](unblock-ai-web/src/lib/hooks/useWorkflowTemplateEditor.ts),
[`src/lib/api/workflow-templates.ts`](unblock-ai-web/src/lib/api/workflow-templates.ts).

> **Opening a template never re-runs the AI.** Generation is bound to a button
> click; no effect triggers it. Opening a template is one `GET /workflow-templates/:id`,
> which returns the current version inline.

## 8.7 The task request hooks and pure modules

| Hook (`src/lib/hooks/`) | Owns |
|---|---|
| `useSelectionConversation` | The session id in the `session` query parameter, the optimistic requester bubble (through the `selection-conversation` reducer), send, choose and start over; restarts cleanly on `SELECTION_SESSION_NOT_FOUND` |
| `useSelectionCatalogue` | The capabilities drawer's list |
| `useTaskRequests` | The list, with URL-driven status, debounced search and page |
| `useTaskRequest` | One task, polling every `TASK_REQUEST_POLL_INTERVAL_MS` while any step is awaiting an approver |
| `useTaskFormDraft` | Local draft state, client-side issues, save draft and submit; maps `TASK_FORM_INVALID` issues onto fields and exposes `isDirty` for the leave-page guard |
| `useTaskRequestActions` · `useStartTaskRequest` | Cancel, delete and transcript download with toasts; create-and-route |
| `usePageHeading` | Lets a screen override the topbar heading (the workspace shows the workflow title) |

Pure, unit-tested modules in `src/lib/task-request/` hold every rule the screens need: the
conversation reducer, form draft state, a client mirror of the API's field validation (same
issue codes; the server stays authoritative), issue messages, status and decision presentation
maps (`Record<Enum, …>`, so a new enum value fails to compile until labelled), trace and
profile-fact sentences, progress numbering ("Step 2 of 5", skipping skipped and cancelled
steps), error messages, and the approver decision rules. All copy lives in
`task-request-copy.ts`.

## 8.8 Component inventory

### Workflow templates — `src/components/workflow-templates/`

| Component | Role |
|---|---|
| `list/WorkflowTemplatesScreen` · `list/WorkflowTemplateTable` | List page: search, Active / Archived / All filter, archive / restore actions |
| `editor/WorkflowTemplateEditor` · `editor/WorkflowTemplateEditorActions` · `editor/WorkflowTemplateEditorNotices` | The editor: title, Save / Generate / Publish, stale and archived notices |
| `detail/WorkflowTemplateDetailScreen` | Loads a template and shows the editor or, with `?version=N`, the historic version |
| `workspace/WorkflowTemplatePromptPanel` · `workspace/WorkflowTemplateFlowchartPanel` · `workspace/WorkflowTemplateGenerationNotes` | Split-pane prompt ⇄ flowchart, plus the model's ambiguities |
| `versions/WorkflowTemplateVersionsDrawer` · `versions/WorkflowTemplateVersionView` | Version history and the read-only historic version view |
| `shared/WorkflowTemplateStatusBadges` | Status / archived badges |
| `flowchart/WorkflowFlowchart` | React Flow canvas; `NODE_TYPES` is module-scope on purpose — moving it inside the component remounts every node on each render |
| `flowchart/nodes/{Step,Condition,Input,Terminal}Node` | The four node renderers |

### Task requests — `src/components/task-requests/`

| Folder | Components |
|---|---|
| `assistant/` | `TaskRequestAssistantScreen`, `AssistantWelcome`, `AssistantConversation`, `AssistantMessage` (exhaustive over decisions), `AssistantMatchCard`, `AssistantWorkflowOverview`, `AssistantQuestion`, `AssistantManualChoice`, `AssistantNoMatch`, `AssistantStartingTask`, `AssistantThinkingTrace`, `AssistantTypingIndicator`, `AssistantComposer`, `CapabilitiesDrawer`, `AssistantMark`, `RequesterMessageBubble` |
| `workspace/` | `TaskWorkspaceScreen`, `TaskStepRail` · `TaskStepRailItem`, `TaskStepPanel` (exhaustive over step kinds), `FormStepPanel`, `ApprovalStepPanel` · `ApproverCard`, `InformationRequestPanel`, `AutomaticStepPanel`, `TaskOutcomeBanner`, `TaskUnsupportedInputsNotice`, `TaskPlanDrawer`, `TaskWorkspaceActions` |
| `forms/` | `TaskForm`, `TaskFormEditor`, `TaskFormFieldControl` (exhaustive over controls), `PersonFieldControl`, `LockedFieldValue` |
| `list/` | `TaskRequestsScreen`, `TaskRequestTable` |
| `shared/` | `TaskStatusBadges` (task, step and decision badges), `TaskRequestActionDialog` |

### Approvals — `src/components/approvals/`

`ApproverView` (the token page: `ApproverHeader` plus `ApproverDetailLayout`),
`ApproverDetailLayout` (the two-column body both channels render), `ApproverTaskSummary`
(request, requester, submitted sections, calculated values, information exchanges),
`ApproverHistory` (earlier decisions), `ApproverDecisionPanel` (step, instructions,
repeat-review notice, decision buttons or the recorded result; channel-agnostic through
`onDecide` / `onDecided` props), `ApproverDecisionDialog` (comment, required for reject and
more information), `ApproverPlanRail`, `ApprovalLinkUnavailable` (invalid and expired links),
`ApproverSection`.

`inbox/` — `ApprovalInboxScreen` (Pending), `ApprovalHistoryScreen` (History, with a decision
`SegmentedControl`) and `ApprovalAssignmentTable` (one table, columns chosen by mode, stacking
into cards on narrow screens). `workspace/` — `ApprovalWorkspaceScreen` (the in-app approval
page). Pure rules live in `src/lib/approvals/` (list filters, row presentation), data in
`useApprovalInbox`, `useApprovalHistory`, `useApprovalAssignment` and
`usePendingApprovalCount`.

### Account and sign-in — `src/components/account/`, `src/components/auth/`

| Component | Role |
|---|---|
| `LoginForm` | Email + password form; posts to `/api/auth/login`, maps API error codes to messages, then goes to `?next=` or `/dashboard` |
| `SignOutButton` | Posts to `/api/auth/logout`, then returns to `/login` |
| `AccountProfileCard` | Name, email, initials |
| `PermissionBadgeList` | The user's permissions as labelled badges |
| `ActiveSessionList` · `ActiveSessionRow` | Active sessions from `GET /auth/sessions`; sign out one other session or all other sessions, with confirmation |

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

The dashboard and the approver page share `font-admin` and the same tokens, so the requester
screens and the approver page look like one product.

---

# 9. HTTP API Reference

**Base URL:** `http://localhost:3000/api` — every route is mounted under `/api`.
**Full reference with request/response bodies:** [`unblock-ai-api/docs/api/api-documentation.md`](unblock-ai-api/docs/api/api-documentation.md)
**Runnable collection:** [`unblock-ai-api/docs/postman/`](unblock-ai-api/docs/postman/)

## 9.1 Auth guards

| Guard | Requires | Failure |
|---|---|---|
| *(none)* | — | — |
| `requireAuthentication()` | An active session | `401 AUTHENTICATION_REQUIRED` |
| `requireAnyPermission(...p)` | An active session whose user holds at least one of `p` | `401 AUTHENTICATION_REQUIRED` with no session, `403 PERMISSION_DENIED` without the permission |
| task ownership | The caller created the task (`/tasks/:id*` only, after `task:create`) | `404 NOT_FOUND` — the task's existence is not revealed |

Headers: `Content-Type: application/json` on every POST/PUT/PATCH;
`Authorization: Bearer <token>` on every guarded route, where `<token>` is the opaque
token returned by `POST /auth/login`.
Request bodies capped at **1 MB**.

In the tables below, **auth** means `requireAuthentication()`, and a permission name
means `requireAnyPermission(...)` with that permission.

## 9.2 Route bindings

The 43 bindings below cover every area except the organisational unit, designation
and user affiliation routes, which are documented in
[`api-documentation.md`](unblock-ai-api/docs/api/api-documentation.md).

### Health

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 1 | `GET` | `/health` | Liveness — touches no dependency. Returns `{ status, uptime, version }` | none |

### Auth and sessions

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 2 | `POST` | `/auth/login` | `{ email, password }` → `{ token, expires_at, user: { id, email, full_name, permissions } }`. Records the `User-Agent`. Errors: `401 INVALID_CREDENTIALS`, `403 ACCOUNT_LOCKED`, `403 ACCOUNT_DISABLED` | none |
| 3 | `GET` | `/auth/me` | `{ user: { id, email, full_name, permissions }, session: { id, expires_at } }` | auth |
| 4 | `POST` | `/auth/logout` | Revoke the current session (`signed_out`) → `204` | auth |
| 5 | `GET` | `/auth/sessions` | The caller's active sessions, newest first, current one flagged `is_current` | auth |
| 6 | `DELETE` | `/auth/sessions/others` | Revoke every other active session of the caller → `{ revoked_count }` | auth |
| 7 | `DELETE` | `/auth/sessions/:sessionId` | Revoke one of the caller's sessions (`revoked_by_user`) → `204`. Revoking the current one acts as logout. `404 USER_SESSION_NOT_FOUND` if it is not the caller's or already inactive | auth |

### Users

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 8 | `POST` | `/users` | `{ email, full_name, permissions }` → `201 { user }`. Password set from `USER_DEFAULT_PASSWORD`. `409 EMAIL_ALREADY_REGISTERED` on a duplicate | `user:manage` |
| 9 | `GET` | `/users` | List users with their permissions | `user:manage` |
| 10 | `GET` | `/users/:userId` | Get one user. `404 USER_NOT_FOUND` | `user:manage` |

### Workflow templates

`:workflowTemplateId` must be a UUID (`400` otherwise). Single-template responses are
`{ workflow_template }`; full shapes and error codes are in
[`api-documentation.md`](unblock-ai-api/docs/api/api-documentation.md).

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 11 | `GET` | `/workflow-templates` | List templates, most recently changed first → `{ workflow_templates }` (summaries, no prompt or definition). `include_archived=true|false` (default `false`) | `workflow:manage` or `task:create` |
| 12 | `POST` | `/workflow-templates` | `{ title, prompt }` → `201`, a `draft`. Nothing is generated | `workflow:manage` |
| 13 | `POST` | `/workflow-templates/generate` | `{ prompt, title? }` → `201`, an `unpublished` template at version 1. Without a title the model's title is used | `workflow:manage` |
| 14 | `GET` | `/workflow-templates/:workflowTemplateId` | One template with `draft_prompt` and the current version (`current`) inline | `workflow:manage` or `task:create` |
| 15 | `PATCH` | `/workflow-templates/:workflowTemplateId` | `{ title?, draft_prompt? }` — rename (no new version) and/or save prompt text without generating | `workflow:manage` |
| 16 | `POST` | `/workflow-templates/:workflowTemplateId/generate` | `{ prompt, title? }` → `201`, a new version (an optional `title` is applied only if generation succeeds). A published template stays published, so the new version is live immediately | `workflow:manage` |
| 17 | `POST` | `/workflow-templates/:workflowTemplateId/publish` | `unpublished` → `published`. `409 WORKFLOW_TEMPLATE_NOT_GENERATED` / `WORKFLOW_TEMPLATE_ALREADY_PUBLISHED` | `workflow:manage` |
| 18 | `POST` | `/workflow-templates/:workflowTemplateId/archive` | Hide from retrieval and the default list. `409 WORKFLOW_TEMPLATE_ARCHIVED` if already archived | `workflow:manage` |
| 19 | `POST` | `/workflow-templates/:workflowTemplateId/restore` | Undo archive. `409 WORKFLOW_TEMPLATE_NOT_ARCHIVED` if not archived | `workflow:manage` |
| 20 | `GET` | `/workflow-templates/:workflowTemplateId/versions` | `{ versions }`, newest first, without prompt or definition | `workflow:manage` or `task:create` |
| 21 | `GET` | `/workflow-templates/:workflowTemplateId/versions/:version` | `{ version }` with its prompt and definition. `404 WORKFLOW_TEMPLATE_VERSION_NOT_FOUND` | `workflow:manage` or `task:create` |

Update, generate and publish on an archived template are `409 WORKFLOW_TEMPLATE_ARCHIVED`.
Generation failures are `422 WORKFLOW_TEMPLATE_GENERATION_FAILED` or
`422 WORKFLOW_TEMPLATE_PROMPT_REJECTED`. Callers without `workflow:manage` only see
published templates; drafts and unpublished templates return `404` to them.

### Selection

Sessions are owner-checked inside `SelectionService`: someone else's session is `404`.

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 22 | `GET` | `/selection/catalogue` | Published templates the caller is eligible for; no AI | `task:create` |
| 23 | `POST` | `/selection/sessions` | First message: profile, one embedding, eligibility, selector | `task:create` |
| 24 | `GET` | `/selection/sessions/:id` | Restore a conversation | `task:create` + owner |
| 25 | `POST` | `/selection/sessions/:id/messages` | A clarification answer, a refinement or "Start the task"; reuses the frozen candidates | `task:create` + owner |
| 26 | `POST` | `/selection/sessions/:id/choose` | Pick an offered template; no AI | `task:create` + owner |
| 27 | `DELETE` | `/selection/sessions/:id` | Start over | `task:create` + owner |

### Tasks

Every `/tasks/:id*` route also runs the **ownership** guard: a task created by
someone else is `404`.

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 28 | `POST` | `/tasks` | Compile and start a task from a matched session or the catalogue; deletes the session | `task:create` |
| 29 | `GET` | `/tasks` | List **the caller's own** tasks (`status`, `search`, `limit`, `offset`) | `task:create` |
| 30 | `GET` | `/tasks/:id` | One task with steps, forms and progress | `task:create` + owner |
| 31 | `GET` | `/tasks/:id/workflow-definition` | The pinned definition, for the plan drawer | `task:create` + owner |
| 32 | `PUT` | `/tasks/:id/forms/:formId/draft` | Save a draft | `task:create` + owner |
| 33 | `POST` | `/tasks/:id/forms/:formId/submit` | Submit and advance the engine | `task:create` + owner |
| 34 | `POST` | `/tasks/:id/cancel` | Cancel; revokes approval links | `task:create` + owner |
| 35 | `DELETE` | `/tasks/:id` | Delete (`409` while an approval is in progress); writes an audit row | `task:create` + owner |
| 36 | `GET` | `/tasks/:id/transcript` | The transcript PDF of a completed task, rendered on demand | `task:create` + owner |

### Approvals

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 37 | `GET` | `/approvals/:token` | The approver page's data | **none — the token IS the auth** |
| 38 | `POST` | `/approvals/:token/decision` | Approve, reject or request more information, with a comment | **none — the token IS the auth** |

### Approver inbox

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 57 | `GET` | `/approver/approvals/pending` | Live approval steps assigned to the caller, oldest first | `task:approve` |
| 58 | `GET` | `/approver/approvals/history` | The caller's decisions, newest first; `?decision=` filter | `task:approve` |
| 59 | `GET` | `/approver/approvals/summary` | `{ pending }` for the sidebar count | `task:approve` |
| 60 | `GET` | `/approver/approvals/:taskId/steps/:stepId` | The same approver view as `/approvals/:token` | `task:approve` + assignee |
| 61 | `POST` | `/approver/approvals/:taskId/steps/:stepId/decision` | Decide in the app; same rules as the token route | `task:approve` + assignee |

Numbers match the endpoint index in `api-documentation.md`. **+ assignee**: a step not
assigned to the caller, or on a task the caller created, answers `404 APPROVAL_NOT_FOUND`.

> **Route ordering notes:** `POST /workflow-templates/generate`
> before the `/:workflowTemplateId` routes, and `DELETE /auth/sessions/others` before
> `DELETE /auth/sessions/:sessionId`, so no literal suffix is ever swallowed as a
> path parameter.

## 9.3 Error response shape

Every error returns the same body:

```json
{ "error": "Human-readable message", "code": "STABLE_CODE", "details": null }
```

`details` carries structured context where useful — for example, the list of
schema and graph validation messages on a `WORKFLOW_TEMPLATE_GENERATION_FAILED`,
or the model's reasons on a `WORKFLOW_TEMPLATE_PROMPT_REJECTED`.

## 9.4 Known API rough edge

> **Malformed ObjectIds return `500 DATABASE_ERROR`, not `400`/`404`.**
> On `/selection/sessions/:id*`, a syntactically invalid ObjectId
> fails inside the Mongo driver rather than being rejected at the controller boundary.
> (`/tasks/:id*` is not affected: the task-ownership guard parses the id first and
> answers `400 VALIDATION_ERROR`, and `/workflow-templates/:workflowTemplateId*` ids are
> UUIDs checked by the controller.) The clean fix is an ObjectId-shape guard in
> `request-validator.util.ts` applied at those route params.

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
| `POSTGRES_URL` | conditional | — | Required when `POSTGRES_REPOSITORY_BACKEND=postgres` |
| `POSTGRES_POOL_MAX` | no | `10` | Max pooled connections |
| `POSTGRES_CONNECTION_TIMEOUT_MS` | no | `5000` | Acquisition timeout |
| `POSTGRES_REPOSITORY_BACKEND` | no | `postgres` | `postgres` \| `memory` — the implementation behind every Postgres repository (users, sessions, organisation). `memory` starts with no users |

## 10.3 Auth and users

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SESSION_TTL_HOURS` | no | `12` | Absolute session lifetime from login, in hours |
| `AUTH_MAX_FAILED_ATTEMPTS` | no | `0` | Failed attempts before an account locks. `0` = counted but not enforced |
| `AUTH_LOCKOUT_DURATION_MINUTES` | no | `15` | How long a lock lasts after the last failure; also the window in which failures accumulate |
| `USER_DEFAULT_PASSWORD` | **yes** | — (`12345` in `.example.env`) | Initial password for every created user, including the seeded administrator. No code fallback; never logged |
| `SEED_ADMINISTRATOR_EMAIL` | seed only | — | Bootstrap administrator's email. Read only by `npm run seed:pg:run` |
| `SEED_ADMINISTRATOR_FULL_NAME` | seed only | — | Bootstrap administrator's full name. Read only by `npm run seed:pg:run` |

Sessions are opaque random tokens stored as SHA-256 hashes, so there is no session
signing secret to set.

## 10.4 Azure OpenAI — chat

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | **yes** | — | Resource endpoint |
| `AZURE_OPENAI_API_KEY` | **yes** | — | API key |
| `AZURE_OPENAI_DEPLOYMENT` | **yes** | — | Chat deployment used for workflow template generation (`gpt-4o`) |
| `AZURE_OPENAI_API_VERSION` | **yes** | — | e.g. `2024-10-21` |
| `AZURE_SELECTOR_DEPLOYMENT` | no | falls back to `AZURE_OPENAI_DEPLOYMENT` | Selector-agent model — **can be a cheaper model than generation** |
| `WORKFLOW_TEMPLATE_GENERATION_MAX_ATTEMPTS` | no | `3` | Self-repair loop cap (initial attempt + repairs). Renamed from `EXTRACTION_MAX_ATTEMPTS`, which is now **silently ignored** — rename it in any local `.env` |

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

## 10.8 Transcripts

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DOCUMENT_ENABLED` | no | `true` | `false` turns transcripts off (`409 TASK_TRANSCRIPT_UNAVAILABLE`, no attachment) |
| `DOCUMENT_ATTACH_TO_EMAIL` | no | `true` | Attach vs. download-only |
| `DOCUMENT_FORMAT` | no | `pdf` | `pdf` \| `text` |
| `DOCUMENT_INSTITUTION_NAME` | no | `Unblock AI` | Printed in the transcript's footer |
| `DOCUMENT_MAX_ATTACHMENT_BYTES` | no | `5000000` | Above this, download-only |

## 10.9 Frontend

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | no | `http://localhost:3000/api` | Upstream API base — the web app's only variable. Sessions are validated by the API, so the web app holds no secret |

## 10.10 Parsing discipline

[`env-parse.util.ts`](unblock-ai-api/src/utils/shared/env-parse.util.ts) exports five
pure functions that take the raw value as an **argument** — none of them read
`process.env` themselves, which is what keeps `env.config.ts` the single point of
contact:

`requireString` · `optionalString` · `parseNumber` · `parseBoolean` · `parseEnum`

Each throws `ConfigurationError` when a present value is invalid, so
misconfiguration is a startup failure rather than a runtime surprise.

Config modules with checks worth knowing:

- `user.config.ts` — `USER_DEFAULT_PASSWORD` is required; startup fails without it.
- `postgres.config.ts` — `POSTGRES_URL` is required only when
  `POSTGRES_REPOSITORY_BACKEND=postgres`.
- `seed.config.ts` — builds the seed variables lazily, only inside the seed command,
  so the server never requires them.
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
| Generating workflow JSON from a prompt | Validating the generated graph *(deterministic checks)* |
| Deciding which template matches a request | Ranking candidates *(vector similarity + alias boost)* |
| Generating a clarifying question | Composing assistant messages *(the web app, from typed data)* |
| Writing a template's `retrieval_summary` *(inside the same generation call)* | Deciding whether a step is ready *(a pure graph rule)* |
| — | Resolving approvers, prefilling and laying out forms, evaluating conditions *(deterministic resolvers and a pure compiler)* |
| — | Building or rendering the transcript *(pure functions)* |
| — | Suggesting reject-vs-more-info to an approver *(left as plain data)* |

> **The pattern:** the LLM is used for *language*, never for *state*. Anything that
> must be reproducible, auditable, or provably correct is a deterministic function.

## 11.2 The workflow template generation pipeline

### Prompt assembly

[`workflow-template-generation.prompt.ts`](unblock-ai-api/src/data/prompts/workflow-template-generation.prompt.ts) is a
long system prompt encoding every schema semantic in [§4](#4-the-workflow-schema--the-core-design-artifact):
graph-not-list, actor resolution modes, namespace paths, condition structure,
ambiguity reporting, the three-outcome rule, strict-mode discipline, and the
non-workflow refusal rule.

[`workflow-template-generation-few-shot.prompt.ts`](unblock-ai-api/src/data/prompts/workflow-template-generation-few-shot.prompt.ts)
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

Default cap: `WORKFLOW_TEMPLATE_GENERATION_MAX_ATTEMPTS` = 3 (`config.workflowTemplateGeneration.maxAttempts`).
Exhausted → `WorkflowTemplateGenerationError` (422, `WORKFLOW_TEMPLATE_GENERATION_FAILED`,
the last validation errors in `details`). A response that is not valid JSON fails the same way.

### The non-workflow guard

Even a fully schema-valid result is rejected when
`metadata.is_workflow === false` — the model's own signal that the input
described no institutional process. It fails with
`422 WORKFLOW_TEMPLATE_PROMPT_REJECTED`. See [§4.9](#49-non-workflow-input-is-a-first-class-outcome).

## 11.3 Embeddings and vector search

| Property | Value |
|---|---|
| Model | `text-embedding-3-small` |
| Dimensions | 1536, validated against `EMBEDDING_DIMENSIONS` on every call |
| Embedded content | The template title plus the current version's `retrieval_summary` block |
| Storage | `retrieval.embedding` on the `workflow_templates` document in Mongo |
| Backends | `in-memory` (cosine similarity via `vector-math.util.ts`) · `atlas` (MongoDB Atlas Vector Search) |

The in-memory backend loads published, unarchived templates and computes cosine
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

The session's `requester_context` is stored on the session record but not sent to
the model, so attributes such as faculty are asked as clarifying questions
([§5.6](#56-selection--the-assistant-conversation)).

And must return one of `matched` / `ambiguous` / `no_match`, with a question and
options when ambiguous.

> **`no_match` being available to the model is the point.** Without it, a model asked
> "which of these five" will always pick one. Making refusal a legal, first-class
> answer is what allows the system to be honest.

`manual_choice` is **never** produced by the model — the service loop emits it when
the round budget expires.

## 11.5 Retrieval summaries as a generated artifact

The `retrieval_summary` block is a required part of the workflow schema, so the
generation call writes it along with the rest of the definition — the generation
prompt carries the rules for each field. There is no separate summary call and no
backfill script; every stored version has one.

## 11.6 Evaluation harness

| Command | What it measures |
|---|---|
| `npm run evaluate:selection` | Runs [`src/data/samples/selection/queries.json`](unblock-ai-api/src/data/samples/selection/queries.json) — labelled plain-language queries with expected workflow ids — and scores selection accuracy |
| `npm run test:live` → `workflow-template-generation-accuracy.live.test.ts` | Asserts the model generates *specific structural details* from the gold fixtures: right step ids, right `depends_on` chains, right condition operator and operands, right loop-back and termination outcomes, right `context_from_steps` bindings |
| → `consistency.live.test.ts` | Repeatability across repeated calls with the same input |
| → `generalisation.live.test.ts` | Generation on `lab_equipment_purchase_request` — an **unseen** fixture with no gold JSON |
| → `robustness.live.test.ts` | Messy, edge-case, and non-workflow input |
| → `selection-quality.live.test.ts` | Selector agent decision quality |

> **`workflow-template-generation-accuracy` asserts structure, not string equality.** Comparing whole
> documents would fail on any harmless wording difference. Asserting that
> `dean_review.condition.operator === "greater_than"` and its `left` is
> `computed.trip_duration_days` tests what actually matters.

## 11.7 Cost and latency posture

- **Workflow template generation** is the expensive call (long system prompt + two
  few-shot examples + structured output). It runs **only on an explicit "Generate" /
  "Regenerate" click** — never on page open, never on a `useEffect`, and never on a
  title change.
- **Selection** uses `AZURE_SELECTOR_DEPLOYMENT`, which can point at a cheaper model
  than generation. One call per conversation round, max two rounds.
- **Embeddings** run once per generated version, once per title change, and once per selection query.
- **Everything else** — planning, execution, document generation — has zero LLM cost.

---

# 12. Security Model and Trust Boundaries

## 12.1 Threat posture

This is an internal institutional tool with a small user base — a seeded bootstrap
administrator, plus users created through the `user:manage` API — and one
externally-reachable unauthenticated surface (the approval link). The security model
is scaled to that, and the gaps are documented rather than implied.

## 12.2 Two independent authentication mechanisms

```
+------------------------------------------------------------------+
|  SESSION AUTH                    |  APPROVAL TOKEN AUTH           |
|                                  |                                |
|  Who:  every user with an        |  Who:  any approver, with or   |
|        account (email login),    |        without an account      |
|        approvers in the inbox    |                                |
|  Form: opaque random bearer      |  Form: HMAC token in the URL   |
|        token in an httpOnly      |        path                    |
|        cookie; only its SHA-256  |                                |
|        hash is stored            |                                |
|  Key:  none - looked up by hash  |  Key:  APPROVAL_TOKEN_SECRET   |
|  TTL:  SESSION_TTL_HOURS (12),   |  TTL:  APPROVAL_TOKEN_TTL_DAYS |
|        absolute                  |                                |
|  Scope: guarded routes, then     |  Scope: exactly one step of    |
|         per-route permissions    |         exactly one task       |
|  Revoke: immediate - logout or   |  Revoke: a DB write            |
|          revoke from /old/account|                                |
+------------------------------------------------------------------+
```

The two mechanisms share nothing. A session token is random bytes checked against
`user_sessions`; an approval token is a signed payload checked against the task. One
can never be accepted in place of the other.

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
- `GET /approvals/:token` returns `404` for a malformed or unrecognised token and `410`
  only for a genuinely signed token that has expired, so the page can't be used to probe
  which tokens exist. Only `sha256(token)` is stored.
- Verification is **non-throwing** — malformation returns `null`, so a garbage URL
  can't produce a 500.
- A decided, cancelled or expired step has its token hash **cleared**; a repeat approval
  after an information request gets a fresh token, so a stale link cannot be replayed.

## 12.4 Identity: mostly from the directory now

The requester's name, email and units come from their account and are locked on the form.
Approvers whose post is a designation in the directory are looked up, never typed, and a
holder who is the requester is skipped. **The remaining gap** is roles the directory does
not model, such as the academic advisor: the requester names that person, and the address is
not verified. Adding a resolver for them (for example an advisor directory) closes it without
changing templates or tasks.

## 12.5 What is protected

| Control | Where |
|---|---|
| Passwords hashed with scrypt (memory-hard KDF); unknown emails burn equivalent hash time | `password.util.ts`, `AuthenticationService` |
| Session tokens stored only as SHA-256 hashes — a database read does not yield usable tokens | `user_sessions.token_hash` |
| Sessions revocable immediately: logout, revoke one, revoke all others | `/auth/logout`, `/auth/sessions/*` |
| A user can only see and revoke their **own** sessions | `user_id` filter in the session repository |
| Optional account lockout, enforced even against the correct password | `AUTH_MAX_FAILED_ATTEMPTS`, `AUTH_LOCKOUT_DURATION_MINUTES` |
| Least privilege per route — four permissions, checked by the API | `requireAnyPermission(...)` |
| Tasks are owner-only, and another user's task is a `404`, not a `403` | Task-ownership guard |
| httpOnly, `sameSite: lax`, `secure` in production cookie | `/api/auth/login` Route Handler |
| Token never reaches JavaScript | Cookie set server-side; browser calls go through the proxy |
| Real error messages and stacks never sent to clients | `error-handler.middleware.ts` |
| Request body cap (1 MB) | `json-body.middleware.ts` |
| Single allowed CORS origin | `cors.middleware.ts` |
| Case-insensitive unique emails | Postgres functional index on `lower(email)` |
| Every user holds at least one permission | Deferred constraint trigger + `UserService` |
| Workflow templates cannot be deleted, only archived and restored, by `workflow:manage` holders | `/workflow-templates/:id/archive`, `/restore` |
| Task deletion writes an audit row first | `TaskService` + `audit_logs` |
| Required config validated at startup | `user.config.ts` (`USER_DEFAULT_PASSWORD`), `mail.config.ts` |

## 12.6 What is not protected — the honest list

| Gap | Impact | Mitigation path |
|---|---|---|
| **Every user's password is `USER_DEFAULT_PASSWORD`** | All accounts — the seeded administrator included — share one initial password, and with no change flow they keep it | Set a strong, non-default value per environment; add password change and reset |
| **No password change, reset, or self-registration** | Users are created only through `POST /api/users` | Self-service password flows; SSO |
| **No user update, disable, or delete endpoint** | Permissions cannot be changed after creation; `status = 'disabled'` is honoured at login and per request, but nothing sets it | Extend the user management API |
| **No IP rate limiting on login** | Brute force is limited only by per-account lockout, which is **off by default** | Set `AUTH_MAX_FAILED_ATTEMPTS`; add IP throttling |
| **`proxy.ts` checks cookie presence only** | A junk cookie renders a page shell, but every API call it makes returns `401` | By design — the API is the boundary |
| **Unverified approver identity** | See §12.4 | Directory integration |
| **`task:create` can read every workflow template** | Requesters can list and open templates in any status, drafts included, via `GET /workflow-templates*` | Filter reads by status for callers without `workflow:manage` |
| **`SMTP_*` not validated at startup** | A misconfigured transport fails at send time | Caught and logged, not fatal — by design |
| **Malformed ObjectId → 500** | Noise, and a slightly leaky error class | Add an ObjectId guard to `request-validator.util.ts` |

---

# 13. Testing and Quality Strategy

## 13.1 Three backend tiers

```bash
npm test            # tests/unit/** + tests/integration/**   fast, no network
npm run test:live   # tests/live/**                          slow, real Azure calls
```

**63 backend test files.** Runner: Node's built-in `node:test` via `tsx` — no Jest,
no Vitest on the backend.

### `tests/unit/utils/`

Schema validation, graph validation (with **mutation tests** per failure mode), alias
boost, render-summary, request-validator, serializer, vector math, approval-token
utils, user-session tokens, bearer-token parsing, email normalisation, permission
checks, Postgres error mapping, password hashing, content hashing, the task plan
compiler, field validator, condition evaluator, information request insertion, eligibility,
requester profile, computed evaluator, transcript builder,
reference allocation, migration and seed file names.

### `tests/unit/services/`

Workflow template, retrieval, selection, selector, vector-store, task, execution,
approval, notification, mailer, document, embedding, the LLM and embedding adapters,
authentication, user session, and user — each against fakes supplied through
constructor injection.

### `tests/unit/repositories/`, `middlewares/`, `db/`, `errors/` — 7 files

The in-memory repositories (user, user session, organisation), the
`requireAnyPermission` guard, the migration and seed runners, and `BaseError`.

### `tests/integration/` — 10 files

Full HTTP-level coverage of the auth, user-session, user, workflow-template,
selection, task, task-ownership and approval routes plus the error handler, using an
**in-process Express server** (`test-server.helper.ts`) and `mongodb-memory-server`.

The helpers build the app on the **in-memory** user and user-session repositories, so
these run with **no live PostgreSQL**.

### `tests/live/` — 5 files

Network-dependent, CI-gated, run manually. See [§11.6](#116-evaluation-harness).

## 13.2 Test helpers

| Helper | Provides |
|---|---|
| `fake-model.helper.ts` | Model doubles |
| `fake-vector-store.helper.ts` | An `IVectorStore` double |
| `fake-migration-store.helper.ts` | An in-memory migration store for runner tests |
| `in-memory-mongo.helper.ts` | `mongodb-memory-server` lifecycle |
| `fixture.helper.ts` | Loads the gold sample files |
| `test-server.helper.ts` | Mounts the real Express app in-process, with fixed test users, each with chosen permissions and a ready session token (`authHeaderFor(...)`) |
| `auth-test-server.helper.ts` | Starts the app for login and session tests and signs users in through `POST /auth/login` |
| `live.helper.ts` | Guards live tests behind real credentials |

## 13.3 Frontend tests

Vitest, 2 files, targeting the pure logic that is worth pinning:

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
> and live generation-accuracy gold data.
>
> **Any change to the schema or the generation prompt must keep all three
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
| PostgreSQL | 17 | Needed to sign in. `npm test` runs without it (in-memory repositories) |
| Azure OpenAI | — | A chat deployment (`gpt-4o`) |
| Azure AI Foundry | — | An embeddings deployment (`text-embedding-3-small`), **separate resource** |
| SMTP | — | Optional; `console` transport is the default |

## 14.2 First-time setup

```bash
# -- Backend ----------------------------------------------------
cd unblock-ai-api
npm install
cp .example.env .env          # then fill in Azure + Mongo + Postgres credentials,
                              # SEED_ADMINISTRATOR_EMAIL / _FULL_NAME and USER_DEFAULT_PASSWORD

npm run migrate:up            # apply Postgres + Mongo migrations (tables, collections, indexes)
npm run seed:pg:run           # create the bootstrap administrator (all four permissions)

npm run smoke-test:azure      # verify the chat deployment answers
npm run smoke-test:embeddings # verify embeddings and the 1536-dim assertion

npm run dev                   # tsx watch on :3000

# -- Frontend ---------------------------------------------------
cd ../unblock-ai-web
npm install
# .env.local:
#   NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api   (the only variable)
npm run dev                   # Next dev on :3001
```

Open http://localhost:3001 and sign in with `SEED_ADMINISTRATOR_EMAIL` and the
`USER_DEFAULT_PASSWORD` value. You land on `/dashboard`; workflow templates are at
`/dashboard/workflows` and the requester screens under `/dashboard/tasks`. With `SEED_SAMPLE_USERS=true`, sample requesters such as `u17@u.c` exist already. Create further users with
`POST /api/users` while signed in as the administrator.

> **Port 3001 is fixed in `package.json`** because the API binds 3000 and its
> default `CORS_ORIGIN` is `http://localhost:3001`.

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
| `npm run migrate:up` / `migrate:status` | Apply / inspect migrations on both databases |
| `npm run migrate:pg:<up\|down\|reset\|status\|create\|unlock>` | Postgres migrations |
| `npm run migrate:mongo:<up\|down\|reset\|status\|create\|unlock>` | MongoDB migrations |
| `npm run seed:pg:run [-- --only <name>]` | Run the Postgres seeders (idempotent; skips what exists) |
| `npm run seed:pg:list` | List the Postgres seeders |
| `npm run seed:pg:create -- <name>` | Scaffold a new seeder file |
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
| ☐ | `USER_DEFAULT_PASSWORD` set to a strong value — **not** the `.example.env` `12345` — **before** seeding or creating users. Each user's password is hashed from it at creation, the administrator's included |
| ☐ | `APPROVAL_TOKEN_SECRET` set (**mandatory** once `MAIL_TRANSPORT=smtp`) |
| ☐ | `MAIL_TRANSPORT=smtp` with working `SMTP_*` — verify with `npm run smoke-test:mail` |
| ☐ | `APP_PUBLIC_URL` set to the real public origin (approval links are built from it) |
| ☐ | `CORS_ORIGIN` set to the real web origin |
| ☐ | `POSTGRES_REPOSITORY_BACKEND=postgres` (the default), `POSTGRES_URL` set |
| ☐ | `npm run migrate:up` applied (check with `npm run migrate:status`) |
| ☐ | `SEED_ADMINISTRATOR_EMAIL` / `SEED_ADMINISTRATOR_FULL_NAME` set to a real administrator, then `npm run seed:pg:run` |
| ☐ | Consider `VECTOR_BACKEND=atlas` with `ATLAS_VECTOR_INDEX` if the template library is large |
| ☐ | `AUTH_MAX_FAILED_ATTEMPTS` set to a non-zero value (and `AUTH_LOCKOUT_DURATION_MINUTES` reviewed) |
| ☐ | HTTPS terminated in front of both services (the cookie is `secure` in production) |

## 14.5 Operational notes

- **Both DB clients connect lazily** — the process starts even if a database is
  briefly unavailable, and fails per-request rather than at boot.
- **Schema changes are a deploy step**, not a boot step: run `npm run migrate:up`
  before starting a new release.
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
`.client` `.interface` `.script` `.test` `.document` `.mailer` `.vector-store`
`.user-repository` `.user-session-repository` `.organisational-unit-repository` …
`.migration` `.seeder` `.definition` `.template`

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
// The candidate set from round one is deliberately frozen; re-running
// retrieval here would let the candidate list drift out from under an
// in-progress clarifying conversation.

cache: "no-store",   // this data is never safe to serve stale

// node-postgres emits 'error' on idle clients. With no listener, Node treats it
// as an unhandled 'error' event and terminates the process.

// 204/205/304 are null-body statuses - constructing a Response with even an
// empty-string body for one of these throws.
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
| **Interface + factory + config-selected implementation** | `IVectorStore`, `IMailer`, `IDocumentRenderer`, `IUserRepository` / `IUserSessionRepository` / the organisation repositories |
| **Pure core, I/O shell** | `TaskEngineService` / `TaskEffectExecutorService`; `buildTaskTranscript` / `TaskTranscriptService`; `compileTaskPlan` / `TaskPlanService` |
| **Never-throw at failure-isolation boundaries** | `NotificationService.dispatch()`, `CompletionDocumentService.generate()`, `computed-evaluator`, approval-token verification |
| **Derive, don't store** | Flowchart layout, transcript bytes, workflow overviews |
| **Freeze what a conversation depends on** | Selection candidate set; task workflow version |
| **One chokepoint per external boundary** | `client.ts` for fetch; `env.config.ts` for `process.env`; `errorHandler` for error responses |
| **Write the audit row before the destructive act** | Task deletion |

---

# 16. Known Limitations & Explicitly Out of Scope

## 16.1 Not built — by design, for this stage

| Gap | Consequence | Notes |
|---|---|---|
| **No directory / identity service** | Approver and requester emails are self-asserted and unverified | **The most important gap.** See [§12.4](#124-the-central-trust-gap-self-asserted-identity) |
| **No runtime `condition` evaluation** | `WorkflowStep.condition` is generated, validated, and rendered — but the execution engine does not evaluate it. A conditional step is dispatched like any other | The evaluator for `computed` already exists and is the natural foundation |
| **No SLA, reminders, or escalation** | `WorkflowStep.sla` is carried in the schema and never read | Needs a scheduler |
| **No self-registration, password reset, or password change** | Every user keeps the `USER_DEFAULT_PASSWORD` they were created with | The most important auth gap — see [§12.6](#126-what-is-not-protected--the-honest-list) |
| **No user update, disable, or delete** | The user API is create, list and get-by-id; permissions are fixed at creation | `status = 'disabled'` is already honoured at login and per request |
| **Self-approval by link is not blocked** | A requester who names themselves as approver can decide through the emailed link | The inbox already excludes own requests; closing the link path is a small follow-up (see `docs/approver-inbox-phase-plan.md` §12) |
| **No IP rate limiting** | Only per-account lockout, off by default | |
| **No LLM assistance in the approval flow** | Question phrasing, context summarising, and reject-vs-more-info suggestions are plain data for the caller to render | Deliberate — see [§11.1](#111-where-the-llm-is-used--and-where-it-deliberately-is-not) |
| **No metrics, tracing, or readiness probe** | `/health` is liveness only and stays green while Mongo is down | |

## 16.2 Known rough edges

| Issue | Detail | Fix |
|---|---|---|
| **Legacy template versions** | Versions generated before the revamp have no audience codes or `collects_inputs`; they are open to everyone and compile into one entry form | Regenerate the template from its prompt |
| **Expired approval links** | There is no re-issue. An approver with an account and `task:approve` can still decide from the inbox; anyone else needs a new request | A requester-side **Resend link** that re-runs `DISPATCH_APPROVAL` |
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

**1. Directory coverage for the remaining roles**
Add resolvers for posts the directory does not model yet (the academic advisor first).
*Why the architecture is already ready:* assignee resolution is a registry keyed by
resolution kind; a new resolver is Open/Closed, and templates and tasks need no change.
*Closes:* the remaining identity gap ([§12.4](#124-identity-mostly-from-the-directory-now)).

**2. Complete user management**
Password change and reset (every user currently keeps `USER_DEFAULT_PASSWORD`), user
update / disable / delete endpoints, a user-management screen in the web app, SSO or
self-registration, and IP rate limiting on login.
*Foundation already present:* the `users` / `user_permissions` / `user_sessions`
schema, `UserService`, the `user:manage` permission, and per-user session revocation.

### Tier 2 — Operational maturity

**3. Readiness probe + metrics + tracing**
`/health/ready` that pings both databases; counters for generation attempts, repair
loops, selection decisions by type, and approval latency.

**4. SLA reminders and escalation**
A scheduler reading `WorkflowStep.sla` — reminder at `reminder_after_hours`,
escalation to `fallback_role` at `escalate_after_hours`. Both fields already exist.

### Tier 3 — Product depth

**5. Approver delegation and out-of-office**
The signed-in approvals inbox is built (`docs/approver-inbox-phase-plan.md`). Next:
delegation, out-of-office cover, and push updates instead of 30-second polling.

**6. Analytics on the corpus**
Which workflows are used most, which steps bottleneck, which get rejected, average
time-to-completion per step. The `tasks` collection already holds every fact needed.

**7. Multi-institution / tenancy**
`scope.institution_type` exists in the schema and filters retrieval. Real tenancy
would add an org dimension to templates, users, and tasks.

**8. Selection quality loop**
Feed real `no_match` and `manual_choice` outcomes back into `retrieval_summary`
tuning — the sessions are already recorded with their frozen candidate sets and
scores.

## 17.2 Extension points already designed in

| To add | Do this | Because |
|---|---|---|
| A new vector backend (pgvector, Pinecone) | Implement `IVectorStore`, add a case to the factory | Callers depend on the interface only |
| A new mail transport (SES, SendGrid) | Implement `IMailer`, add a case to the factory | `NotificationService` is transport-agnostic |
| A new document format (DOCX, HTML) | Implement `IDocumentRenderer`, add a case to the factory | The builder is already format-independent |
| A new user / session store | Implement `IUserRepository` or `IUserSessionRepository`, add a case to its `index` factory | Services depend on the interfaces only; each already has two implementations |
| A new permission | Add it to the `Permission` enum, insert the catalogue row in a new migration, guard routes with `requireAnyPermission(...)` | Permissions are data plus one guard, not a role hierarchy |
| New seed data | `npm run seed:pg:create -- <name>`, write an idempotent seeder that goes through services | The seed runner discovers seeder files by name |
| A new error type | Add a file to `src/errors/`, extend `BaseError`, export from the barrel | The handler reads `statusCode`/`toJSON()` off the instance |
| A new graph invariant | Add a check function to `graph-validator.util.ts` + a mutation test | Checks are independent functions over the same document |
| A new step type | Extend the schema enum, the prompt, and the flowchart node map | Schema-first change; expect the three-role fixture constraint to bite |
| A different LLM deployment | Change `AZURE_OPENAI_CHAT_DEPLOYMENT` (or `LLM_PROVIDER`) | Reasoning models auto-detected for temperature handling |

---

# 18. Glossary

| Term | Meaning |
|---|---|
| **Actor** | A role-based reference to whoever performs a step. Four resolution modes: `dynamic`, `static`, `requester`, `system`. Never a named person |
| **Alias boost** | An additive score bump (default 0.15) applied when a query exactly matches a template's declared alias |
| **Approval token** | An HMAC-SHA256-signed token minted per dispatched step, embedded in the approver's email link. Proves authenticity; usability is checked separately |
| **Candidate** | A template returned by retrieval, carrying `score`, `base_score`, `alias_hits`, and its `retrieval_summary` |
| **Computed value** | A derived value from a fixed operation set (`date_diff_days`, `sum`, …). Never a free-text formula |
| **Dispatch** | Moving an approval step to `awaiting_approver`, minting its token (hash stored), and emailing the assignee |
| **Draft** | A workflow template status: title and prompt saved, nothing generated yet. Also `draft_prompt` — prompt text saved on a generated template but not yet generated |
| **Entry step** | A step with `depends_on: []`. Every valid workflow has at least one |
| **Few-shot examples** | Two worked input/output pairs loaded from real fixture files into the generation prompt |
| **Graph validation** | Eight semantic checks JSON Schema cannot express (cycles, reachability, dangling references, namespace paths, …) |
| **Namespace path** | A dotted reference into the shared run data: `inputs.x`, `computed.y`, `steps.z.outcome`, `requester.a`, `system.today` |
| **Permission** | A `resource:action` code a user holds — `workflow:manage`, `task:create`, `task:approve`, `user:manage`, `organisation:manage`. Routes require one of a listed set; every user holds at least one |
| **Publish gate** | A workflow template's `status` moving `unpublished` → `published`. Retrieval only ever sees published, unarchived templates |
| **Information request** | A step inserted when an approver requests more information: one answer field for the requester, followed by a repeat of the same approval. Capped per approval |
| **Requester profile** | The requester's memberships, designations, actor types and numbered facts, derived from the directory. Never asked for |
| **Transcript** | The PDF record of a completed task, rendered on demand and never stored |
| **`retrieval_summary`** | The block that gets embedded and read by the selector: one-liner, aliases, keywords, requester types, triggers, and **`not_for`** |
| **Selection session** | A multi-round conversation record with a **frozen** candidate set |
| **Selector agent** | The LLM that chooses `matched` / `ambiguous` / `no_match` over the frozen candidates |
| **Self-repair loop** | Feeding validation errors back to the model with "fix only these", up to 3 attempts |
| **Step state** | `blocked` \| `ready` \| `pending_approval` \| `approved` \| `rejected` \| `skipped` |
| **Task** | One instance of a workflow: the process a requester actually started |
| **Terminal rejection** | `outcomes.rejected.action === "terminate_workflow"` — checked before dispatch, so no email goes out for a dead branch |
| **User session** | A server-side `user_sessions` row created at login, identified by the SHA-256 hash of an opaque bearer token. Absolute expiry; revocable immediately |
| **Version pinning** | A task recording the exact `{ workflow_template_id, workflow_template_version }` it was created from, so regenerating a template cannot reshape a running chain |
| **Workflow template** | A stored workflow (UUID, title, status, current version, retrieval embedding) with its immutable generated versions. Archived, never deleted |
| **Workflow template generation** | The LLM pipeline turning a prompt into validated workflow JSON, stored as a new version |
| **Workflow template version** | One immutable generated definition of a template, with the prompt it came from. Tasks pin one |

---

# 19. Appendices

## Appendix A — Complete source tree

### Backend — `unblock-ai-api/src/`

```
app.ts                     builds the Express app; no listen()
server.ts                  entry point: DI wiring, listen, graceful shutdown

routes/                    index · health · auth · user-session · user · workflow-template
                           · selection · task · approval · organisation routes
controllers/               health · auth · user-session · user · workflow-template
                           · selection · task · approval · organisation controllers
services/
  workflow-template · workflow-template-generation · validation · embedding
  retrieval · selector · selection
  requester-profile · organisation-catalogue · assignee-resolution/
  task · task-plan · task-form · task-engine · task-transition · task-effect-executor
  approval · notification · task-transcript · audit
  authentication · user-session · user · organisation services
  azure-openai.client · azure-embedding.client
  vector-store/    interface · in-memory · atlas · index
  mailer/          interface · console · smtp · index
  document/        interface · text · pdf · index
models/                    workflow-template · workflow-template-version
                           · selection-session · task · audit-log · index
repositories/              each: interface · in-memory · postgres · index
  user-repository/  ·  user-session-repository/  ·  organisation repositories
config/                    env · server · db · postgres · auth · user · seed · azure-openai
                           · azure-embedding · retrieval · mail · document · index
middlewares/               request-id · request-logger · cors · json-body
                           · authenticate · require-authentication
                           · require-permission · require-task-ownership
                           · async-handler
                           · not-found · error-handler · index
utils/
  shared/                  logger · hash · object-id · assert · env-parse · password
  workflow/                schema-validator · graph-validator · namespace-path
                           · computed-evaluator
  retrieval/               vector-math · alias-boost · render-summary · retrieval-candidate
  workflow-template/       workflow-template-input
  http/                    request-validator · serializer · actor · auth-context
                           · auth-serializer · bearer-token · user-serializer
                           · workflow-template-serializer
  task/                    task-plan-compiler · task-field-validator · task-field-id · task-step-id
                           · task-form-layout · information-request-insertion · reference · …
  selection/               candidate-eligibility
  requester/               requester-profile · requester-attribute · requester-attribute-input
  assignee/                assignee-context-unit
  approval/                token
  auth/                    user-session-token · permission · authenticated-user
  user/                    email
  database/                postgres-error
  document/                task-transcript · document-format · pdf-layout
data/
  prompts/                 workflow-template-generation
                           · workflow-template-generation-few-shot · selector
  schemas/                 workflow.schema.json · workflow-schema.data
                           · decision.schema
  vocabulary/              role.vocabulary
  constants/               collection · status · permission · user · user-session
                           · workflow-template · workflow-template-error
                           · auth · user-error · repository · postgres · seed · time
  templates/               approval-email.template
  samples/                 input/ · expected/ · selection/ · demo-drafts/
lib/types/                 workflow/ · workflow-template/ · selection/ · retrieval/
                           · task/ · approval/ · audit/ · auth/ · user/
                           · user-session/ · document/
                           · config/ · http/ · index
errors/                    base · validation · unauthorized · forbidden · not-found
                           · conflict · workflow-template · workflow-template-generation
                           · selection · embedding
                           · database · configuration · migration · seed · index
db/                        mongo.client · postgres.client
                           · migration/{core, postgres, mongo}
                           · seed/{core, postgres, postgres/seeders}
```

### Frontend — `unblock-ai-web/src/`

```
proxy.ts                   route guard: session cookie present (Next 16's renamed middleware)
app/
  layout.tsx · globals.css · page.tsx (session-based redirect)
  login/page.tsx
  dashboard/ layout · page · workflows/{page, new/page, [workflowTemplateId]/page}
             · tasks · approvals · users · organisation · profile
  dashboard/tasks/ page · new/page · [taskId]/page
  old/    account/{layout,page}
  approvals/ layout · [token]/{page,loading,not-found}
  api/    auth/login · auth/logout · proxy/[...path]
components/
  workflow-templates/  list/ · editor/ · detail/ · workspace/ · versions/ · shared/
             · flowchart/WorkflowFlowchart + nodes/{Step,Condition,Input,Terminal}
  dashboard/ DashboardShell · sidebar/ · topbar/
  task-requests/ assistant/ · workspace/ · forms/ · list/ · shared/
  approvals/ ApproverView · ApproverTaskSummary · ApproverHistory · ApproverDecisionPanel
             · ApproverDecisionDialog · ApproverPlanRail · ApprovalLinkUnavailable
  account/   AccountProfileCard · PermissionBadgeList · ActiveSessionList
             · ActiveSessionRow
  auth/      LoginForm · SignOutButton
  ui/        Badge · Button · Card · ConfirmDialog · DateTime · EmptyState
             · SearchInput · Spinner
lib/
  api/       client (THE chokepoint) · auth · workflow-templates · selection
             · tasks · approvals · user-sessions · health
  auth/      session · session-cookie · auth-error-message · permission-label
  routing/   route-path
  hooks/     useSelectionConversation · useSelectionCatalogue · useTaskRequest(s)
             · useTaskFormDraft · useTaskRequestActions · usePageHeading · useWorkflowTemplateData
             · useWorkflowTemplateEditor · useWorkflowTemplateLifecycle · …
  workflow/  toFlowGraph
  task-request/ conversation · form draft · field validation · presentation · progress · copy
  workflow-template/  editor-state · status · version-param · error-message
             · field-limit · copy · assignee-source-hint
  utils/     cn · format · submit-error
types/       workflow · workflow-template · task · selection · approval · auth · permission · …
```

## Appendix B — Documentation index

### Cross-cutting — `docs/`

| Document | Covers |
|---|---|
| `overview.md` | The prior single-page project reference |
| `task-request-revamp-phase-plan.md` | **Current** design of areas F–I and the requester and approver UIs: assistant, task plans, forms, approvals, transcript, with the end-to-end acceptance script. Supersedes the task planner, approval execution, requester contact, web task approval and completion document plans below |
| `task-planner-design.md` | Area G design and the requirement-list insight |
| `task-planner-implementation-plan.md` | Area G build plan |
| `approval-execution-design.md` | Area H design: the pure-engine split |
| `approval-execution-implementation-plan.md` | Area H build plan |
| `user-access-and-session-management-phase-plan.md` | Area A: users, permissions, server-side sessions, user management, seed pack, task ownership, `/account` — decisions, contracts and phase log (1246 lines) |
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
| `api/api-documentation.md` | **Every endpoint** with request/response bodies |
| `guides/running-the-app.md` | Full local setup and troubleshooting |
| `guides/configuration.md` | Every environment variable |
| `guides/database-migrations.md` | The Postgres and MongoDB migration packs and commands |
| `guides/database-seeding.md` | The Postgres seed pack, its commands, and the bootstrap administrator seeder |
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

**Setup:** `MAIL_TRANSPORT=console`, both servers running, terminal visible, and the
bootstrap administrator seeded (`npm run seed:pg:run`). That account holds every
permission, so it can drive both the authoring and the requester parts.

### 1 · Workflow template authoring (3 min)

1. Sign in at `/login` with the seeded administrator's email and password. You land
   on `/dashboard`; open **Workflows** (`/dashboard/workflows`).
2. **New template.** Give it a title and paste the overseas-leave policy paragraph
   as the prompt — plain English, no structure.
3. Click **Generate**. *Talking point: this is one Azure OpenAI call with a
   strict JSON schema, followed by AJV validation and eight graph checks. If any
   check fails, the model gets its own errors back and repairs — up to three
   attempts.*
4. The flowchart appears. *Talking point: nobody positioned these nodes. The layout
   is derived from `depends_on` by dagre — the graph structure came out of the
   prose.*
5. Point out the **conditional Dean step** and the **loop-back** on the advisor step.
   *Talking point: the fourteen-day rule was a clause in a sentence; it's now a
   structured condition over a computed value.*
6. Edit one word in the prompt. **The stale notice appears** — the picture no longer
   describes the text. Click **Regenerate**: version 2 is created, and the version
   history drawer shows both. *Talking point: versions are immutable; renaming the
   template never creates one.*
7. Click **Publish**. *Talking point: until this moment the template is invisible to
   every requester. Generation proposes; a human commits. Once published,
   regenerating makes the new version live immediately, and tasks already running
   stay on the version they started from.*

### 2 · The assistant (2 min)

1. Sign in as `u17@u.c` (Kavindu, an IT student) in a second browser profile and open
   **New task request**. Point at **See what Unblock can do**: only templates he is eligible
   for, listed with no AI.
2. Type *"I want to take 1 month overseas leave for a research visit."* It matches the IT
   template with no question. Open **Show thinking**: profile read, candidates found, the
   Engineering template left out by audience, the selector consulted once.
3. **Optional, and worth doing:** ask for something that genuinely doesn't exist. *Talking
   point: it says no match and stops. That refusal is the feature.*

### 3 · The form (2 min)

1. **Start this task**. Name and email are locked and grey: they came from the account. HoD
   and Dean are not asked: the directory found them. Only the advisor is named by hand.
2. **Save draft**, refresh, and show the values persist. Try a return date before departure:
   a cross-field rule rejects it.
3. **Submit and continue.** The rail moves to the advisor: **Awaiting decision**.

### 4 · The approval chain (2 min)

1. **Switch to the API terminal.** The console mailer printed the approval URL. Open it in a
   private window. *Talking point: no session, no account; only the token's hash is stored.*
   (An approver with an account can instead sign in and decide from **Approvals → Pending**.)
2. Choose **Request more information** with a comment. Back on the workspace, a **More
   information requested** step and a repeat review have appeared. Answer it; a fresh link
   prints; approve.
3. Approve as the HoD and the Dean (a 40-day trip needs the Dean; a 10-day one shows that step
   as "Not required"). Sign in as Dinesh (`u19@u.c`) and approve from his **Pending** inbox to
   show the in-app channel.

### 5 · Completion (1 min)

1. **Request completed.** **Download transcript**: the conversation, the answers, the
   information request Q&A and the approval trail with comments.
2. *Talking point: those bytes are not stored anywhere; the transcript is rendered on demand
   from a version-pinned workflow and the task.*

The full 10-minute script is [docs/demo-script.md](docs/demo-script.md), and the step-by-step
acceptance walk is Appendix A of
[docs/task-request-revamp-phase-plan.md](docs/task-request-revamp-phase-plan.md).

### 6 · Optional closers

- `/dashboard/workflows` — archive the template, show it disappear from the Active
  filter and from selection, then restore it. Nothing is ever deleted.
- `/old/account` — sign in from a second browser, then **Sign out of other sessions**: the
  other browser's next request is rejected. Sessions are server-side and revocable.
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
| User access & sessions | 8 phases (see `docs/user-access-and-session-management-phase-plan.md`) | One `users` table with permissions, server-side revocable sessions, the user management API, the Postgres seed pack, owner-only tasks, the single `/login` and `/account` page |
| Workflow templates | — | Extraction renamed to workflow template generation; drafts, template delete and the deletion log replaced by the draft → unpublished → published lifecycle, immutable versions and archive/restore; management moved to `/dashboard/workflows` |
| Approver inbox | 6 phases (see `docs/approver-inbox-phase-plan.md`) | Signed-in approvals inbox: pending, history, in-app decisions sharing one core with the emailed link, normalised assignee emails, the `approval-inbox` migration, the sidebar count |

Every feature followed the same pattern: a design or phase-plan commit, then one
commit per shippable phase. The `docs/` folder preserves all of it.

---

## Document maintenance

This document is generated from a full read-through of the codebase as of
**2026-08-29** (`dev` @ `b98f6bd`). The workflow template refactor (generation, versions, archive/restore,
`/dashboard/workflows`) was folded in on **2026-11-11**; other areas — notably the
organisational structure, the dashboard beyond workflows, and the LLM/embedding provider
configuration in [§10](#10-configuration-reference) — have not been re-read since 2026-08-29.

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
