# Completion Document — PDF Record Emailed on Approval

Phase-by-phase implementation plan for a new capability: **when a portal request is fully
approved, email the requester a PDF record of the whole thing** — every value they supplied,
laid out in the order the workflow template declares it, followed by the approval trail
(who approved, their designation, and their email address).

**Surfaces touched:** `unblock-ai-api/` (most of the work) and `unblock-ai-web/` (a download
button plus one proxy fix).

**Read first:** [overview.md](overview.md) areas G and H, and
[approval-execution-design.md](approval-execution-design.md). This plan assumes both and does
not re-argue their decisions.

---

## 0. Where this plugs in

The completion path already exists and fires exactly once per task. Today it sends a
one-line email:

```
ApprovalService.submitDecision()                     approval.service.ts
  └─ ExecutionService.applyDecision()  → result.completed === true
       └─ sendDecisionNotifications()                approval.service.ts
            └─ NotificationService.sendCompletionNotice(task, workflow)
                 └─ completionNoticeEmail()           data/templates/approval-email.template.ts
                      "Your request ... has been approved and completed."
```

That single call site is the whole insertion point. Everything below either feeds it a
document or reads the same document back out over HTTP.

**Verified facts this plan depends on** (each checked against the code, not assumed):

| Fact | Where | Why it matters |
|---|---|---|
| `result.completed` is reachable **only** through `submitDecision` | `task.service.ts` `start()` hard-codes `TASK_STATUS.IN_PROGRESS`, ignoring `result.completed` | One generation site, not two. See risk R-3 for the zero-step edge case |
| A completed task is **immutable** — no route mutates values, steps, or status afterwards | terminal-status guards in `cancel()` / `updateStatus` | Lets us regenerate the PDF on demand instead of storing bytes (D-4) |
| The workflow is **version-pinned** on the task (`task.workflow_id` + `task.version`) | `workflowService.getDocument(task.workflow_id, task.version)` | A later template edit can never change an already-issued record |
| Per-step approver identity lives on `task.steps[].assignee`, not on the requirement | `actor:*` requirements are **de-duplicated** by `role\|relative_to` in `requirement-builder.util.ts` | The approver table must be built from `task.steps`, or two steps sharing one requirement collapse into one row |
| `MailMessage` has no `attachments` field | `lib/types/approval/mail.type.ts` | Phase 5 exists |
| The web proxy does `await upstream.text()` | `app/api/proxy/[...path]/route.ts` | A PDF forwarded through it today would be corrupted. Phase 8 fixes it |
| Notifications **never throw** — a failed send is logged and returns `false` | `NotificationService.dispatch()` | Document generation must inherit exactly this discipline (D-9) |

---

## 1. Ground rules

Carried from the existing codebase; every phase below obeys them.

| Rule | Consequence |
|---|---|
| Strict layering `routes → controllers → services → models → db` | The renderer never sees `req`/`res` |
| ES modules, `"type": "module"` | **Every relative import ends in `.js`**, even from `.ts` |
| `strict: true` | Explicit `null` over `undefined` in stored documents |
| Constructor-injected deps, wired by hand in `server.ts` | No DI container, no module-level singletons |
| Pluggable backends go behind an interface + factory | `services/document/` mirrors `services/mailer/` exactly |
| `config/*.config.ts` are the only readers of `rawEnv` | New knobs get a `document.config.ts` |
| Errors are `BaseError` subclasses carrying their own `statusCode` | Throw `ConflictError`, never `res.status(409)` |
| Tests are `node:test` via `tsx` | No Jest/Vitest |
| Pure logic lives in `utils/`, I/O in `services/` | The document *model* is a pure function; only rendering and sending are services |

**Verification gate after every phase:** `npm run typecheck && npm test` must pass in
`unblock-ai-api/`, and `npm run lint && npx tsc --noEmit` in `unblock-ai-web/` for Phase 8.

---

## 2. Design decisions

These are settled before Phase 1 so the phases read as instructions rather than options.

### D-1 — PDF library: `pdfkit`

Pure JavaScript, no native build step, no headless browser, streams straight to a `Buffer`.
It is a dependency of the same weight class as `nodemailer`, which this project already ships.

Rejected alternatives, with the reason:

| Option | Why not |
|---|---|
| `puppeteer` (HTML → PDF) | Downloads ~170 MB of Chromium and spawns a browser process inside the approval hot path. Wrong operational cost for a two-page document |
| `@react-pdf/renderer` | Drags a React runtime into a backend that has no React |
| `pdf-lib` | No layout engine — you hand-place every line and compute your own page breaks |
| `pdfmake` | Genuinely viable (declarative tables, built on pdfkit). Held in reserve: if the approver table's page-break handling in Phase 4 turns fiddly, swapping the renderer implementation behind `IDocumentRenderer` is a contained change, which is the point of D-3 |

### D-2 — Generate at completion, from the completion notification path

Not on a cron, not lazily on first download. The document is a *record of an event*, so it is
produced when the event happens and stamped with that moment.

### D-3 — Renderer behind an interface + factory, mirroring `services/mailer/`

```
src/services/document/
  document.interface.ts     IDocumentRenderer { render(doc: CompletionDocument): Promise<RenderedDocument> }
  pdf.document.ts           PdfDocumentRenderer  — pdfkit
  text.document.ts          TextDocumentRenderer — plain text, for tests and console runs
  index.document.ts         createDocumentRenderer(format, config)
```

The text renderer is not decoration: it is what lets `npm test` assert on document *content*
(ordering, labels, the approver block) without parsing a PDF, exactly as `ConsoleMailer` lets
the approval chain be tested without SMTP.

### D-4 — Store metadata, not bytes; regenerate deterministically on download

A completed task is immutable and its workflow is version-pinned, so re-rendering yields the
same document. We therefore persist a small record on the task:

```ts
export interface CompletionDocumentRecord {
  generated_at: Date;      // stamped ONCE — the renderer reads this, never `new Date()`
  filename: string;        // e.g. "UNB-2026-000481-record.pdf"
  byte_size: number;
  sha256: string;          // proves a re-render matches what was emailed
  emailed_to: string | null;
  emailed_at: Date | null;
}
```

No GridFS, no blob store, no 16 MB document bloat, and `GET /tasks/:id/document` stays a pure
function of data that already exists. Persisting `generated_at` is what keeps the render
deterministic — a `new Date()` in a footer would break the hash on every download.

### D-5 — Document contents and ordering

The user's requirement, made concrete. Sections in this order:

1. **Header** — workflow title, task reference, `Approved` status, submitted date
   (`task.created_at`), completed date (`completion_document.generated_at`).
2. **Request details** — iterate **`workflow.inputs` in declaration order**; for each, find the
   task requirement whose `ref` matches `input.id` and render `label` +
   `formatRequirementValue(value)`. This is the "order that is in the workflow template"
   requirement, taken literally. Unanswered optional inputs render as `—` rather than being
   dropped, so the record maps one-to-one onto the template.
3. **Calculated values** — `workflow.computed` in declaration order (Phase 3). Section omitted
   entirely when the workflow declares none.
4. **Additional information provided** — the `followup:*` requirements appended by the
   request-more-info loop, grouped under the step that asked. These are collected values too,
   but they are not in the template, so they sit after the template-ordered section rather than
   being interleaved into it.
5. **Approvals** — the user's explicit ask. One row per approval step, **in workflow step order**,
   built from `task.steps` (see the de-duplication note in §0):

   | Column | Source |
   |---|---|
   | Step | `workflow.steps[].name` |
   | Designation | `assignee.display_name` → title-cased `assignee.role` → step name (same fallback chain as `requirement-builder.util.ts`) |
   | Name | `task.steps[].assignee.name` |
   | Email address | `task.steps[].assignee.email` |
   | Decision | `outcome` + `responded_at` |
   | Note | `reason`, when present |

6. **Footer** — reference and page number on every page, plus a line stating this is a
   system-generated record and naming the approving institution.

### D-6 — Delivery: attach *and* link

The PDF is attached to the completion email **and** downloadable from the portal. The email body
always carries the portal link; the attachment is best-effort. If rendering or attaching fails,
the requester still gets a working completion email — see D-9.

### D-7 — Recipient

`NotificationService.requesterEmail(task)` unchanged — the first `email`-typed `input`
requirement. Inherits the existing trust boundary: that address is requester-asserted and
unverified (overview §3). Worth stating plainly, because we are now mailing a document
containing every answer they gave to an address nobody validated.

### D-8 — Feature flag

`DOCUMENT_ENABLED` (default `true`) and `DOCUMENT_ATTACH_TO_EMAIL` (default `true`). With both
off, behaviour is byte-for-byte today's. This is what makes Phase 6 safe to merge before Phase 8.

### D-9 — Failure isolation

Generation is wrapped the same way `dispatch()` is: it never throws into `submitDecision`. A
recorded approval decision must not be rolled back because a PDF library threw. Order inside
`sendDecisionNotifications` is: record decision → generate (best effort) → send email (with
attachment if generation succeeded, without if not) → persist `completion_document` only if
generation succeeded.

---

## Phase 1 — Types, config, constants

Pure declarations. Nothing consumes them yet; this phase compiles and changes no behaviour.

**Files**

| File | Change |
|---|---|
| `src/lib/types/document/document.type.ts` | **new** — `CompletionDocument`, `DocumentSection`, `DocumentField`, `ApprovalRow`, `RenderedDocument`, `CompletionDocumentRecord` |
| `src/lib/types/document/index.type.ts` | **new** — barrel |
| `src/lib/types/task/task.type.ts` | add `completion_document: CompletionDocumentRecord \| null` to `TaskDocument` **and** `TaskDto` |
| `src/lib/types/approval/mail.type.ts` | add `attachments?: MailAttachment[]` to `MailMessage`; add `MailAttachment { filename, content: Buffer, contentType }` |
| `src/lib/types/config/config.type.ts` | add `DocumentConfig`, add `document: DocumentConfig` to `AppConfig` |
| `src/config/document.config.ts` | **new** — reads `rawEnv` like `mail.config.ts` |
| `src/config/index.config.ts` | add `document` to the frozen `config` |
| `src/data/constants/status.constant.ts` | append `TASK_AUDIT_TYPE.DOCUMENT_GENERATED = "completion_document_generated"` |

The shape of the pure document model — this is the contract Phase 2 produces and Phase 4 consumes:

```ts
export interface DocumentField { label: string; value: string; }

export interface DocumentSection {
  title: string;
  fields: DocumentField[];
}

export interface ApprovalRow {
  step_name: string;
  designation: string;
  name: string | null;
  email: string | null;
  outcome: string;
  decided_at: Date | null;
  reason: string | null;
}

export interface CompletionDocument {
  reference: string;
  workflow_title: string;
  workflow_description: string;
  institution_name: string;      // from config — workflows carry institution_type, not a name
  submitted_at: Date;
  completed_at: Date;            // === CompletionDocumentRecord.generated_at
  sections: DocumentSection[];   // D-5 items 2-4, already ordered
  approvals: ApprovalRow[];      // D-5 item 5
}
```

`DocumentConfig`:

```ts
export interface DocumentConfig {
  enabled: boolean;              // DOCUMENT_ENABLED, default true
  attachToEmail: boolean;        // DOCUMENT_ATTACH_TO_EMAIL, default true
  format: "pdf" | "text";        // DOCUMENT_FORMAT, default "pdf"
  institutionName: string;       // DOCUMENT_INSTITUTION_NAME, default "Unblock AI"
  maxAttachmentBytes: number;    // DOCUMENT_MAX_ATTACHMENT_BYTES, default 5_000_000
}
```

> **Ripple to expect:** adding `completion_document` to `TaskDocument` breaks the object
> literal in `TaskService.create()` and any test helper building a task. That is the intended
> order — the compiler walks you to every construction site. Set it to `null` there.

**Verification:** `npm run typecheck` passes; `npm test` unchanged.

---

## Phase 2 — The pure document builder

The heart of the feature, and the part worth testing hardest — because it is a pure function
with no I/O at all, exactly like `ExecutionService` and `PlannerService`.

**File:** `src/utils/document/completion-document.util.ts` (**new**)

```ts
export function buildCompletionDocument(
  task: TaskDocument,
  workflow: WorkflowDefinition,
  options: { institutionName: string; completedAt: Date; computed?: DocumentField[] },
): CompletionDocument
```

**What it does, in order**

1. **Request details section** — walk `workflow.inputs` in declaration order. For each input,
   find `task.requirements.find(r => r.source === "input" && r.ref === input.id)`, read
   `task.values[requirement.key]`, format with the existing `formatRequirementValue()`
   (`utils/approval/answer-format.util.ts` — reuse, do not reimplement). Missing or empty → `—`.
   Inputs whose `collected_from.resolution !== "requester"` are never collected, so they are
   skipped, matching `buildInputRequirements()`.
2. **Calculated values section** — from `options.computed`, omitted when empty (Phase 3 fills it).
3. **Additional information section** — requirements whose `key` starts with `followup:`. The
   label is the approver's question (which is what `reopenForMoreInfo` stores in `label`),
   prefixed with the step name resolved from `ref`.
4. **Approvals** — iterate `workflow.steps` in declaration order, keep `type === "approval"`,
   join to `task.steps` by `step_id`, and emit an `ApprovalRow` per the D-5 table. Steps with
   `state === "skipped"` are omitted; a completed task should have none, but the record must not
   claim an approval that never happened.

**Tests:** `tests/unit/utils/completion-document.test.ts` (new), driven off the existing
`tests/helpers/fixture.helper.ts` sample workflows:

- fields come out in template declaration order, not requirement-array order
- an unanswered optional input renders `—` and is not dropped
- a boolean renders `Yes`/`No`; a `person` renders `Name (email)`
- two steps sharing one de-duplicated `actor:*` requirement produce **two** approval rows
- follow-up answers land in their own section, after the template inputs
- a workflow with no `computed` produces no calculated-values section

**Verification:** `npm test` — new tests pass, nothing else changes.

---

## Phase 3 — Computed-value evaluator (recommended, independently useful)

`workflow.computed` is declared in every template and evaluated nowhere — `ApproverViewDto.computed`
is hard-coded to `[]` in `approval.service.ts`. A record that omits "Number of days" on a leave
request is visibly incomplete, so this is in scope; it can be deferred at the cost of dropping
D-5 section 3.

**File:** `src/utils/workflow/computed-evaluator.util.ts` (**new**, pure)

```ts
export function evaluateComputed(
  workflow: WorkflowDefinition,
  values: Record<string, RequirementValue>,
): DocumentField[]
```

Supports the seven declared operations (`ComputedOperation` in `workflow.type.ts`):
`date_diff_days`, `sum`, `difference`, `multiply`, `count`, `lookup`, `constant`. Arguments
resolve through the existing namespace-path convention (`inputs.*`, `computed.*`) — reuse
`utils/workflow/namespace-path.util.ts` rather than writing a second path parser. Evaluation is
single-pass in declaration order, so a `computed` referencing an earlier `computed` works and a
forward reference yields `null`.

Anything unresolvable yields `null` and is **omitted** from the output. This function must never
throw: a malformed `arguments` block on a template written a year ago cannot be allowed to break
a completion email.

**Bonus:** wire it into `ApprovalService.getApproverView()`'s `computed: []` in the same phase —
one call site, and it closes a known stub.

**Tests:** `tests/unit/utils/computed-evaluator.test.ts` — one case per operation, plus a
missing-input case, a forward-reference case, and a malformed-arguments case.

---

## Phase 4 — The renderer

**Files**

| File | Contents |
|---|---|
| `src/services/document/document.interface.ts` | `IDocumentRenderer { render(doc): Promise<RenderedDocument> }` |
| `src/services/document/pdf.document.ts` | `PdfDocumentRenderer` — pdfkit |
| `src/services/document/text.document.ts` | `TextDocumentRenderer` — plain text, same interface |
| `src/services/document/index.document.ts` | `createDocumentRenderer(format, config)`, throwing `ConfigurationError` on an unknown format |
| `src/utils/document/pdf-layout.util.ts` | Layout primitives: `heading()`, `sectionTitle()`, `labelValueRow()`, `approvalTable()`, `footer()` — each takes the `PDFDocument` and returns the new `y` |

```ts
export interface RenderedDocument {
  buffer: Buffer;
  filename: string;      // `${reference}-record.pdf`
  contentType: string;   // "application/pdf"
  byteSize: number;
  sha256: string;        // reuse utils/shared/hash.util.ts
}
```

**Implementation notes**

- Collect pdfkit's stream into a `Buffer` (`doc.on("data")` / `doc.on("end")`), resolving a
  promise on `end`. Do **not** write to disk.
- Standard-14 fonts only (`Helvetica`, `Helvetica-Bold`). No embedded font files, so nothing
  needs adding to `ASSET_DIRS` in `scripts/copy-assets.script.ts`.
- Page-break handling: the layout helpers check remaining space before each row and call
  `doc.addPage()` themselves. An approval row must not split across a page boundary.
- `sha256` is computed over the produced buffer, reusing `utils/shared/hash.util.ts`.
- **Determinism:** pdfkit stamps a `CreationDate` in the PDF trailer by default. Set it
  explicitly from `doc.completed_at`
  (`new PDFDocument({ info: { CreationDate: completedAt, Title, Author } })`), or the sha256
  changes on every render and D-4 collapses.

**Dependency:** `npm i pdfkit` + `npm i -D @types/pdfkit` in `unblock-ai-api/`.

**Tests:** `tests/unit/services/document.service.test.ts`

- text renderer: section order, that the approver name, designation and email all appear, and
  that a rejected or skipped step never appears in a completed record
- pdf renderer: output starts with `%PDF-`, `byteSize > 0`, and — the determinism guarantee —
  **rendering the same `CompletionDocument` twice yields the same `sha256`**
- an oversized free-text value paginates instead of overflowing (see R-6)
- factory: unknown format throws `ConfigurationError`

---

## Phase 5 — Attachments through the mailer

Three small edits, no new files.

| File | Change |
|---|---|
| `src/services/mailer/smtp.mailer.ts` | Pass `attachments` through to `transporter.sendMail` — nodemailer's shape (`{ filename, content, contentType }`) is already what `MailAttachment` declares, so it forwards as-is |
| `src/services/mailer/console.mailer.ts` | Log attachment **metadata** (`filename`, `byteSize`), never the body — a 60 KB base64 blob in stdout makes the console transport useless for its actual purpose |
| `src/data/templates/approval-email.template.ts` | Extend `CompletionNoticeContext` with `documentUrl: string \| null` and `hasAttachment: boolean`; the body gains "A PDF record of this request is attached" and/or "Download it here: {url}" |

**Tests:** extend `tests/unit/services/notification.service.test.ts` with a fake mailer asserting
the attachment array reaches `send()`, and that the console transport does not print the buffer.

---

## Phase 6 — Wire into completion

The behaviour change. Everything before this phase is inert.

**New service:** `src/services/completion-document.service.ts`

```ts
export class CompletionDocumentService {
  constructor({ renderer, config }: Options) {}

  /** Never throws. Returns null when disabled or when rendering fails. */
  async generate(task: TaskDocument, workflow: WorkflowDefinition, completedAt: Date):
    Promise<RenderedDocument | null>
}
```

It composes Phase 2 + Phase 3 + Phase 4 and wraps the whole thing in the same try/catch/log
shape as `NotificationService.dispatch()` (D-9).

**`NotificationService.sendCompletionNotice`** gains an optional third parameter:

```ts
async sendCompletionNotice(
  task: TaskDocument,
  workflow: WorkflowDefinition,
  document: RenderedDocument | null = null,
): Promise<boolean>
```

Optional with a default, so no existing call site breaks. It attaches the document only when
`config.document.attachToEmail` **and** `document.byteSize <= config.document.maxAttachmentBytes`,
and always includes the portal URL (`${config.mail.appPublicUrl}/portal/jobs/${task._id}`) in
the body.

**`ApprovalService.sendDecisionNotifications`** — the `result.completed` branch becomes:

```ts
if (result.completed) {
  const completedAt = new Date();
  const document = await this.completionDocumentService.generate(task, workflow, completedAt);
  const sent = await this.notificationService.sendCompletionNotice(task, workflow, document);

  if (document) {
    await this.taskModel.setCompletionDocument(task._id, {
      generated_at: completedAt,
      filename: document.filename,
      byte_size: document.byteSize,
      sha256: document.sha256,
      emailed_to: sent ? this.notificationService.requesterEmailOf(task) : null,
      emailed_at: sent ? new Date() : null,
    });
    await this.taskModel.appendAudit(task._id, {
      type: TASK_AUDIT_TYPE.DOCUMENT_GENERATED,
      detail: document.sha256,
      created_at: completedAt,
    });
  }
}
```

`requesterEmail` becomes a public `requesterEmailOf` — do not duplicate the recipient-lookup
rule in two services.

**Model:** `TaskModel.setCompletionDocument(id, record)` — one `$set`, mirroring `setStatus`.

**Wiring in `server.ts`:**

```ts
const documentRenderer = createDocumentRenderer(config.document.format, config.document);
const completionDocumentService = new CompletionDocumentService({ renderer: documentRenderer, config });
// ...then pass it into ApprovalService's options object
```

**Tests:** `tests/unit/services/approval.service.test.ts`

- approving the final step generates a document, attaches it, and persists `completion_document`
- a renderer that throws still lets the decision commit, still sends the completion email, and
  leaves `completion_document` as `null`
- `DOCUMENT_ENABLED=false` reproduces today's behaviour exactly
- a non-final approval generates nothing

---

## Phase 7 — Download endpoint

So the requester can fetch the record again from the portal, and so a lost attachment is not a
lost document.

**Route:** `GET /api/tasks/:id/document` — `requireAuth()`, registered **above** `GET /tasks/:id`
in `task.route.ts` to keep Express's matching order unambiguous.

**Controller:** `TaskController.getTaskDocument` — the one place in this feature that touches
`res` directly, because every other endpoint returns JSON through the serializer:

```ts
res.setHeader("Content-Type", document.contentType);
res.setHeader("Content-Disposition", `attachment; filename="${document.filename}"`);
res.setHeader("Content-Length", String(document.byteSize));
res.send(document.buffer);
```

**Service:** `TaskService.getDocument(id)` —

| Condition | Response |
|---|---|
| Task not found | `404 NOT_FOUND` (existing `NotFoundError`) |
| `task.status !== "completed"` | `409 CONFLICT` — "A record is only issued once every step is approved" |
| `completion_document === null` (generation failed at completion, or the task predates this feature) | Regenerate on the fly using `task.updated_at` as `completedAt`, persist the record, and serve it. A missing record is a recoverable gap, not an error |
| Otherwise | Re-render with the **persisted** `generated_at`; if the fresh `sha256` differs from the stored one, log a warning and still serve the fresh copy |

That last row is the payoff for storing the hash in D-4: a silent drift between what was emailed
and what is downloadable becomes visible in the logs instead of invisible forever.

**Tests:** `tests/integration/task.route.test.ts` — 200 with `application/pdf` and a `%PDF-`
prefix on a completed task; 409 on an in-progress one; 404 on an unknown id; 401 with no token.

---

## Phase 8 — Frontend

**8.1 — Fix the proxy for binary responses** (`src/app/api/proxy/[...path]/route.ts`)

`await upstream.text()` mangles PDF bytes. Stream the body through instead of stringifying it,
preserving `content-disposition`:

```ts
const contentType = upstream.headers.get("content-type") ?? "application/json";
const headers = new Headers({ "content-type": contentType });
const disposition = upstream.headers.get("content-disposition");
if (disposition) headers.set("content-disposition", disposition);
return new NextResponse(upstream.body, { status: upstream.status, headers });
```

Passing `upstream.body` through covers text and binary alike, so this replaces the `.text()`
branch rather than sitting beside it. The null-body status guard (204/205/304) stays.

**8.2 — A raw fetch helper** (`src/lib/api/client.ts`)

`apiRequest` always parses JSON. Add a sibling that keeps the single-chokepoint rule intact:

```ts
export async function apiBlob(path: string): Promise<{ blob: Blob; filename: string }>
```

Same two-branch URL logic; parses the filename out of `content-disposition`, falling back to a
derived name. On a non-OK response it parses the JSON error body and throws `ApiError`, so
callers keep one error type.

**8.3 — API module** (`src/lib/api/tasks.ts`)

```ts
/** Only meaningful for a completed task - the API 409s otherwise. */
document: (id: string) => apiBlob(`/tasks/${id}/document`),
```

**8.4 — Types** (`src/types/task.ts`) — mirror `completion_document` onto `TaskDto`, hand-narrowed
in the existing house style.

**8.5 — `JobStatusView.tsx`** — inside the existing `isCompleted` "This request is closed" card,
add a **Download record (PDF)** button. It fetches the blob, `URL.createObjectURL`s it, clicks a
temporary anchor, then revokes the URL. Local `isDownloading` / `downloadError` state, matching
the file's existing `isCancelling` / `error` pattern.

One interaction to get right: the completed-task **delete prompt** fires on arrival at this page.
The delete dialog copy should mention that the emailed PDF is the requester's permanent copy —
deleting the request removes the download, not their record. Small copy change in
`DeleteRequestDialog.tsx`, and it is the honest thing to say.

**Verification:** `npm run lint`, `npx tsc --noEmit`, and a manual pass — complete a request end
to end with `MAIL_TRANSPORT=console`, then download the PDF from the portal.

---

## Phase 9 — Tooling, docs, and the seams

| Item | Where |
|---|---|
| `npm run smoke-test:document -- <task-id> [out.pdf]` | `scripts/smoke-test-document.script.ts`, modelled on `smoke-test-mail.script.ts` — renders a real task's record to a local file for eyeballing |
| Endpoint documentation | `unblock-ai-api/docs/api/api-documentation.md` — add `GET /tasks/:id/document` with its 409 rule |
| Postman | `unblock-ai-api/docs/postman/` — add the request to the existing chained collection |
| Env documentation | `.env.example` — the five `DOCUMENT_*` keys with defaults |
| Architecture note | `unblock-ai-api/docs/architecture/project-overview.md` |
| Project reference | `docs/overview.md` — new sub-section under area H, and strike the completion-document gap from the not-built-yet list |

---

## 3. Risks and edge cases

| # | Risk | Handling |
|---|---|---|
| R-1 | **PDF generation throws inside the decision path**, rolling back a recorded approval | D-9: `generate()` never throws; the decision is written before generation is attempted |
| R-2 | **Requester email is unverified** (overview §3) — we now mail a document containing every answer to a self-asserted address | Pre-existing trust boundary, unchanged but *raised in stakes*. Flag it; closing it properly is the directory-integration work (Option C), still unscheduled |
| R-3 | **A workflow with `completion.required_steps: []`** makes `evaluateCompletion` return `true` from `every()` on an empty array, so `advance()` reports `completed` at start time | `start()` hard-codes `IN_PROGRESS` today, so no email fires and no document is generated — the request silently never completes. Pre-existing, not introduced here; worth a separate ticket, and Phase 7's 409 correctly refuses a document for it |
| R-4 | **Any authenticated portal user can fetch any task's document** — `submitted_by` is always `null`, so nothing scopes a task to its requester | Real gap, and this feature sharpens it: the document concentrates personal data behind one URL. Recommend scoping `GET /tasks` and `/tasks/:id*` by `req.user` as a follow-on; the endpoint is `requireAuth()`-guarded in the meantime |
| R-5 | **Re-render drift** — a code change to the builder or layout alters an already-issued record | The stored `sha256` makes drift detectable (Phase 7); the log warning is the alarm. Accepted over storing bytes |
| R-6 | **Long free-text answers** (a `text` input with 4,000 characters) blow the layout | pdfkit flows and paginates text; layout helpers must use its height measurement rather than fixed row heights. Covered by a Phase 4 test with an oversized value |
| R-7 | **Attachment size** on a mail server with a small cap | `maxAttachmentBytes` (default 5 MB) drops the attachment and leaves the download link. Realistically inert — `file`-typed inputs are labels today, with no upload path |
| R-8 | **`completion_document` on tasks created before this feature** | Nullable field, and Phase 7 regenerates on demand. No migration needed |

---

## 4. Out of scope (deliberately)

- **File/attachment uploads** from the requester — `file` is a declared `InputType` with no upload
  path, so the record documents answers, not attached artefacts
- **Digital signatures / PDF certification** — the document is a record, not a legal instrument
- **Rejection records** — only approved requests produce one. The rejection email already names
  the step, the approver, and the reason; extending this to rejections is a later, easy phase
  once the builder exists
- **Per-institution document layouts** — one layout, configurable institution name
- **Localisation** — English only, matching the rest of the product
- **Long-term archival / retention policy** — deleting a task deletes its download; the emailed
  copy is the requester's permanent record

---

## 5. Suggested sequencing

Phases 1 → 2 → 4 → 5 → 6 deliver a working, shippable feature (document generated and emailed),
with Phase 3 and Phases 7–8 as clean follow-ons.

For the smallest useful first merge: **1, 2, 4, 5, 6 with `DOCUMENT_FORMAT=text`** — that proves
the whole pipeline end to end through the console mailer with no new runtime dependency at all.
Then add `pdfkit` and flip the format.
