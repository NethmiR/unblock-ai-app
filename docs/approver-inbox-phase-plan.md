# Approver Inbox — Phase Plan

This plan builds the **approver side inside the application**. A signed-in approver can:

1. **See pending approvals.** Every approval step waiting for their decision, across all task requests.
2. **See their history.** Every decision they have made (approved, rejected, more information requested), with its comment and where the request went next.
3. **Decide in the app.** Open a request, read everything the emailed page shows, and approve, reject or request more information with a comment. The task then moves on exactly as it does through the emailed link.

When this plan is done, the whole requester → approver → requester loop in Appendix A of the revamp plan can be completed **with email switched off**. The emailed link stays as a second channel that works in parallel.

This plan **extends** [`task-request-revamp-phase-plan.md`](task-request-revamp-phase-plan.md), called *the revamp plan* below. It supersedes revamp D-25 ("signed-in approval inboxes stay stubs") and closes the first row of revamp §20.

Each phase can be built on its own by an agent that first reads **§1 Ground rules**, **§2 Architecture**, **§3 Decisions** and **§4 Contracts** of *this* plan, then the revamp plan's §1, §3 and §4, then its own phase section. Every phase must leave `npm run typecheck && npm test` green in each app it touches, plus `npm run lint` in the web app. **Stop after each phase, run its verification block, then move on.**

> **Status (2026-11-13):** planned, not started.

---

## Table of contents

0. [Current state and gaps](#0-current-state-and-gaps)
1. [Ground rules](#1-ground-rules)
2. [Architecture](#2-architecture)
3. [Decisions](#3-decisions)
4. [Contracts](#4-contracts)
5. [Phase map](#5-phase-map)
6. [Phase 1 — API foundations](#phase-1--api-foundations)
7. [Phase 2 — Approver assignment service and routes](#phase-2--approver-assignment-service-and-routes)
8. [Phase 3 — Web foundations](#phase-3--web-foundations)
9. [Phase 4 — Pending and history screens](#phase-4--pending-and-history-screens)
10. [Phase 5 — In-app approval page](#phase-5--in-app-approval-page)
11. [Phase 6 — Documentation, Postman and final verification](#phase-6--documentation-postman-and-final-verification)
12. [Out of scope and follow-ups](#12-out-of-scope-and-follow-ups)
13. [Appendix A — End-to-end acceptance script (mail off)](#appendix-a--end-to-end-acceptance-script-mail-off)

---

## 0. Current state and gaps

Every item below was confirmed in the current code.

| # | Today | Problem | Closed by |
|---|---|---|---|
| G-1 | `/dashboard/approvals` and `/dashboard/approvals/history` render `null`. The sidebar already shows them to `task:approve` holders (`dashboard-navigation.ts`). | Approvers see two empty pages. | Phases 4, 5 |
| G-2 | The only way to decide is `GET/POST /approvals/:token`. The token exists only in the email (`TaskEffectExecutorService.applyLinkEffects` → `notifier.sendApprovalRequest`). | If the email fails or never arrives, the task sits at `awaiting_approver` forever. Nobody can act on it. | D-1, D-4 |
| G-3 | `boundAssignee` (`utils/task/task-assignee-binding.util.ts`) stores a requester-supplied approver (`PERSON` field) with `user_id: null`. The email is trimmed by validation but not lowercased. | An inbox keyed only on `assignee.user_id` would never show the academic advisor in Appendix A, so the flow would break at its first approval. | D-2, D-3 |
| G-4 | `ApprovalService.resolveToken` is the only way to build an `ApprovalContext`. `getView` and `decide` are tied to it. | A second channel would copy the comment rules, the allowed-decisions check and the commit path. | D-5 |
| G-5 | `TaskApprovalRecord` records `decision`, `comment` and `decided_at`, but not **who** decided or **through which channel**. | History and audit cannot tell an inbox decision from an emailed-link decision. | D-7 |
| G-6 | `ApproverDecisionPanel` calls `approvalsApi.decide(token, …)` and `router.refresh()` directly. `ApproverView` adds its own header with no shell. | The in-app page cannot reuse the decision panel or the summary as they are. | D-10 |
| G-7 | `ITaskModel` has no query by assignee. The `tasks` indexes cover `created_by`, `workflow_template_id` and `steps.approval.token_hash` only. | Listing "steps waiting for me" would scan the whole collection. | D-8 |
| G-8 | The requester's `ApproverCard` shows "Not yet sent" when `notified_at` is `null`. | After this feature, an unsent email no longer blocks the approver. The copy should say the request is waiting in the approver's inbox. | Phase 5 |

---

## 1. Ground rules

**All of revamp §1 applies unchanged:** §1.1 code standards, §1.2 AI usage rules, §1.3 UI and UX standards, §1.4 process rules. Read them before you write any code. The points below either repeat the rules this feature is most likely to break, or add rules specific to it.

### 1.1 Rules that apply with particular force

| Rule | What it means here |
|---|---|
| **One rule, one place** | The comment rules, the allowed-decisions check, the "live" check and the commit-plus-effects sequence already live in `ApprovalService`, `TaskEngineService.allowedDecisions` and `TaskTransitionService`. The inbox channel **reuses** them. It never re-implements them. The assignee-matching rule lives only in `utils/approval/approver-identity.util.ts` (§4.6), and the Mongo filter is built from the same identity type. |
| **No AI** | Nothing in this plan calls an LLM or an embedding (revamp §1.2, D-1). |
| **No hardcoded strings** | The new enums (`ApprovalChannel`, `ApprovalAssignmentState`), the error code, the route segments and the query parameters live in constants modules. UI copy goes in `TASK_REQUEST_COPY.approvals` (new group) and `TASK_REQUEST_COPY.approver` (existing). |
| **API ↔ web type consistency** | Every new DTO in §4.3 gets a hand-written mirror in `unblock-ai-web/src/types/approval.ts` in the same phase, with identical snake_case names and identical enum values. |
| **Strict types** | Route params (`taskId`, `stepId`) and query strings go through `request-validator.util.ts` helpers. No `as` casts on params, bodies or Mongo aggregation output. Type the aggregation result with an explicit interface. |
| **Narrow dependencies** | Services take `Pick<…>` collaborators through an `*Options` object, as `ApprovalService` already does. |
| **Migrations are frozen** | The new Mongo migration uses literal names and values only (revamp §1.1). Create it with `npm run migrate:mongo:create -- approval-inbox`. Never edit an applied migration. |
| **Consistent UI** | The inbox screens reuse the task request list's shape: `SearchInput`, `SegmentedControl`, `Table`, `Pagination`, `QueryState`, `EmptyState` and `NoMatchingResults`. The in-app approval page reuses `ApproverTaskSummary`, `ApproverHistory`, `ApproverDecisionPanel` and `ApproverPlanRail`, plus the workspace's two-column grid. Do not create a second visual language. |
| **Next.js 16** | Before writing web code, read `unblock-ai-web/AGENTS.md` and the relevant guides in `unblock-ai-web/node_modules/next/dist/docs/`. Dynamic route `params` is a `Promise`. Use the `PageProps<"/dashboard/approvals/[taskId]/[stepId]">` global. |
| **No comments** | New code has no comments, except a one-line *why* where the reason is truly non-obvious. Two such places are expected: the `$elemMatch` requirement (D-8) and the expiry exemption (D-4). |
| **Process** | Do not commit unless asked. A phase that changes a signature updates every call site in the same phase, including `server.ts` and `tests/helpers/*`. |

### 1.2 Vocabulary

*Approval* is one approval step instance on a task. *Assignment* is the relation "this approval step is assigned to this signed-in user". The *inbox* is the Pending screen. The *history* is the History screen. The *channel* is how a decision arrived (emailed link or the app). As in the revamp plan, never call an approver a *role*.

---

## 2. Architecture

### 2.1 Flow

```mermaid
sequenceDiagram
  autonumber
  actor R as Requester (web)
  participant T as Task services
  participant X as TaskEffectExecutor
  actor AP as Approver (signed in)
  participant AA as ApproverAssignmentService
  participant AS as ApprovalService (shared core)
  participant E as TaskEngine (pure)

  R->>T: POST /tasks/:id/forms/:formId/submit
  T->>E: submitForm → advance
  E-->>T: step awaiting_approver + DISPATCH_APPROVAL
  T->>X: execute effects (token + email; email may fail)
  AP->>AA: GET /approver/approvals/pending
  AA-->>AP: assignments (user_id OR normalised email match)
  AP->>AS: GET /approver/approvals/:taskId/steps/:stepId
  AS->>AS: resolveAssignment → ApprovalContext → same view builder
  AP->>AS: POST …/decision {decision, comment}
  AS->>E: recordDecision(actor: app channel)
  E-->>AS: task' + effects (link revoked for this step)
  AS->>X: commit + execute effects (notify requester, dispatch next)
```

### 2.2 Layering (API)

```
routes/approver.route.ts ──> controllers/approver.controller.ts ─┬─> services/approver-assignment.service.ts ──> models/task.model.ts (findApprovalAssignmentPage, countPendingApprovalAssignments)
                                                                 └─> services/approval.service.ts (getViewForAssignee, decideAsAssignee)
                                                                        ├─ resolveToken      (existing, emailed link)
                                                                        ├─ resolveAssignment (new, signed-in)
                                                                        └─ buildView / applyDecision (shared core)
utils/approval/approver-identity.util.ts      (pure: identity, matching, Mongo filter)
utils/http/approver-request.util.ts           (list query, path params)
utils/http/approval-serializer.util.ts        (+ serializeApprovalAssignment)
```

| Unit | Responsibility |
|---|---|
| `ApproverAssignmentService` | Lists pending and decided assignments for an identity, and counts the pending ones. Read-only. |
| `ApprovalService` | Builds the approver view and records decisions for **both** channels through one shared core (D-5). |
| `approver-identity.util.ts` | Builds an `ApproverIdentity` from the auth context, and decides whether a `TaskAssignee` belongs to it. Also builds the Mongo `$elemMatch` clause from the same identity type. |

### 2.3 Web

```
app/dashboard/approvals/page.tsx                     → ApprovalInboxScreen (pending)
app/dashboard/approvals/history/page.tsx             → ApprovalHistoryScreen
app/dashboard/approvals/[taskId]/[stepId]/page.tsx   → ApprovalWorkspaceScreen
app/approvals/[token]/page.tsx                       → ApproverView (unchanged route; uses the refactored panel)
        │
        ▼
components/approvals/{inbox,workspace}/*  +  components/approvals/* (shared, refactored)
        ──> lib/hooks/{useApprovalInbox,useApprovalHistory,useApprovalAssignment,usePendingApprovalCount}.ts
        ──> lib/api/approvals.ts (+ approverApprovalsApi)
        └─> lib/approvals/* (pure, tested: list filters, row presentation, history outcome text)
```

---

## 3. Decisions

These are settled. Do not reopen them while implementing.

| # | Decision |
|---|---|
| D-1 | **Two channels, one engine.** The emailed link (`/approvals/:token`) and the in-app inbox both decide through `TaskEngineService.recordDecision` and `TaskTransitionService.commit`. Whichever decides first wins. The other channel then sees `decided`, or gets `409 APPROVAL_ALREADY_DECIDED` if it tries to decide. `recordDecision` already clears the step's `token_hash`, so an inbox decision also kills that step's emailed link. |
| D-2 | **An assignment matches by user id or by email.** A step is assigned to the signed-in user when its `assignee.user_id` equals their id, **or** its `assignee.email` equals their normalised account email. This is the same trust model as the emailed link: whoever owns that mailbox can already decide. It is what makes requester-supplied approvers (G-3) work. The rule exists only in `approver-identity.util.ts`. |
| D-3 | **Assignee emails are stored normalised.** `boundAssignee` stores `normalizeEmail(value.email)` for a `PERSON` value. Directory and choice assignees already carry the account email, and are normalised too at compile time in `DirectoryAssigneeResolver`. The Phase 1 migration normalises the emails of existing tasks. Queries compare normalised values exactly, so no case-insensitive regex is used and the index applies. |
| D-4 | **The in-app channel ignores link state.** `resolveAssignment` never reads `token_hash` or `token_expires_at`. A failed or expired email must not block an approver who signs in. That is the point of this feature. A step is **live** when `status === awaiting_approver` and `approval.decision === null`. |
| D-5 | **One shared core in `ApprovalService`.** `resolveToken` and the new `resolveAssignment` each return an `ApprovalContext`. `buildView(context)` and `applyDecision(context, input, actor)` are private and shared. `getView`/`decide` (token) and `getViewForAssignee`/`decideAsAssignee` (signed in) are thin wrappers. Comment validation, the length limit, `COMMENT_REQUIRED_DECISIONS`, `allowedDecisions` and the result shape are written once. |
| D-6 | **Access rules.** Every `/approver/*` route requires authentication and `Permission.TASK_APPROVE`, matching the sidebar group. A step that does not exist, is not an approval, is not assigned to the caller, or belongs to a task the caller created returns `404 APPROVAL_NOT_FOUND`. This follows the same pattern as task ownership: no existence leak. The caller's own task requests are **excluded** from the inbox and history, so nobody can approve their own request in the app. The emailed-link path is not changed by this plan (see §12). |
| D-7 | **Decisions record who and how.** `TaskApprovalRecord` gains `decided_via: ApprovalChannel \| null` and `decided_by_user_id: string \| null`. `recordDecision` takes an `ApprovalActor { channel; user_id }` instead of nothing. The token channel passes `{ channel: EMAIL_LINK, user_id: assignee.user_id }`. The app channel passes `{ channel: APP, user_id: caller.id }`. The audit `detail` stays the decision value, as it is today. The requester DTO does not expose either field. The approver history DTO exposes `decided_via`, so the UI can show "Decided by email link". |
| D-8 | **Queries are per step, and match within one array element.** The list is one row per **(task, approval step)**, not per task, because a repeat review gives the same approver several rows on one task. The model runs an aggregation: an `$elemMatch` pre-filter on `steps` (status or decision, plus the identity `$or`, inside one element), then `$unwind: "$steps"`, then the same condition on the unwound step, then `$sort`, then a `$facet` for the rows and the total. Separate dotted paths are wrong here: they would match a task where one step is awaiting and a *different* step belongs to the caller. |
| D-9 | **Pending and history are two states of one query.** `ApprovalAssignmentState.PENDING`: step `awaiting_approver`, decision `null`, task `in_progress`. Sorted by `activated_at` ascending, so the oldest request comes first. `ApprovalAssignmentState.DECIDED`: `approval.decision !== null`. Sorted by `decided_at` descending, and filterable by decision. Both accept `search`, matched against reference, title and requester name (escaped, case-insensitive). Both use `limit`/`offset`, with the same limits as tasks (`TASK_FIELD_LIMIT`). Steps cancelled before a decision (another approver rejected first) appear in neither list. |
| D-10 | **The decision UI is channel-agnostic.** `ApproverDecisionPanel` takes `onDecide(input): Promise<ApprovalDecisionResultDto>` and `onDecided(result): void` props instead of a token. The token page passes `approvalsApi.decide(token, …)` and `router.refresh()`. The in-app page passes `approverApprovalsApi.decide(taskId, stepId, …)`, then `mutate()` plus `revalidateApiPaths` for the inbox, history and count keys. `ApproverView`'s body (summary, history, panel, plan rail) is extracted into `ApproverDetailLayout`, which both pages render. Only the token page renders `ApproverHeader`. |
| D-11 | **The in-app detail route is `/dashboard/approvals/[taskId]/[stepId]`.** The step id is in the path because one task can hold several approvals for the same person. The static `history` segment takes precedence over the dynamic `[taskId]`. Route access reuses `RoutePath.APPROVALS`. The topbar heading is set with `usePageHeading` to the task title and "Review this request and record your decision". |
| D-12 | **Freshness without push.** The inbox list and the pending count poll every `APPROVAL_INBOX_POLL_INTERVAL_MS` (30 s), and also revalidate on focus (the SWR default). After a decision, the app revalidates the list, history, count and the open assignment immediately. The requester's workspace already polls while a step is `awaiting_approver` (revamp Phase 8). |
| D-13 | **Pending count in the sidebar.** `GET /approver/approvals/summary` returns `{ pending: number }` (one `countDocuments`-style aggregation). The sidebar shows it as a small count pill on the **Pending** item when it is above zero. `NavItem` gains an optional `badgeKey: NavBadgeKey`, and `Sidebar` resolves each key through a `Record<NavBadgeKey, () => number \| null>` hook map, so no route is special-cased in the component. |
| D-14 | **The approval email points to the app too.** `approval-email.template.ts` adds one line under the button: "You can also find this request in Unblock under Approvals → Pending." The line uses `${appPublicUrl}/dashboard/approvals`, built by an `approvalInboxUrl` helper beside the template. It is shown only when `step.assignee.user_id !== null`, because only then do we know the person has an account. |
| D-15 | **No new Postgres tables, and no LLM.** The identity comes from the auth context (`AuthenticatedUser.id` and `.email`). The only persistence changes are the Mongo migration and indexes in §4.5. |

---

## 4. Contracts

Names are final. A shape may gain a field during implementation only if this section is updated in the same phase.

### 4.1 Constants (`unblock-ai-api/src/data/constants/`)

```ts
// task.constant.ts (append)
export enum ApprovalChannel { EMAIL_LINK = "email_link", APP = "app" }

// approval.constant.ts (new)
export enum ApprovalAssignmentState { PENDING = "pending", DECIDED = "decided" }
export const APPROVER_ROUTE_SEGMENT = { ROOT: "approver", APPROVALS: "approvals", PENDING: "pending", HISTORY: "history", SUMMARY: "summary", STEPS: "steps", DECISION: "decision" } as const;

// approval-error.constant.ts (append)
APPROVAL_NOT_FOUND = "APPROVAL_NOT_FOUND"
```

| Code | HTTP | Raised when |
|---|---|---|
| `APPROVAL_NOT_FOUND` | 404 | In-app path only: unknown task or step, a step that is not an approval, a step not assigned to the caller, or the caller's own task |
| `APPROVAL_ALREADY_DECIDED` | 409 | Existing. Also raised on the in-app path when the step is no longer live (D-4). |
| `APPROVAL_DECISION_NOT_ALLOWED`, `APPROVAL_COMMENT_REQUIRED` | 400 | Existing, shared core |
| `TASK_REVISION_CONFLICT` | 409 | Existing. Two channels decided at the same instant. |

Add `approvalNotFound(taskId, stepId)` to `src/errors/approval.error.ts`.

### 4.2 Domain types (`src/lib/types/approval/`)

```ts
// approver-identity.type.ts (new)
export interface ApproverIdentity { userId: string; email: string }   // email already normalised

// approval.type.ts (append)
export interface ApprovalActor { channel: ApprovalChannel; user_id: string | null }
export interface ApprovalAssignmentFilter {
  state: ApprovalAssignmentState;
  decision: ApprovalDecision | null;   // DECIDED only; ignored for PENDING
  search: string | null;
  limit: number;
  offset: number;
}
export interface ApprovalAssignmentRow { task: TaskDocument; step: TaskStepRecord }
export interface ApprovalAssignmentPage { rows: ApprovalAssignmentRow[]; total: number }
```

`TaskApprovalRecord` (`task/task-document.type.ts`) gains `decided_via: ApprovalChannel | null` and `decided_by_user_id: string | null`. The compiler and `insertInformationRequest` initialise both to `null`.

`ApprovalAssignmentRow.task` is a projection without `forms`, `values`, `conversation` or `audit` (§4.5). Type it as `Omit<TaskDocument, "forms" | "values" | "conversation" | "audit">` and name it `TaskAssignmentProjection`.

### 4.3 DTOs and web mirrors

These live in `lib/types/approval/approval.type.ts`, mirrored in `unblock-ai-web/src/types/approval.ts`. `ApproverViewDto` and `ApprovalDecisionInputDto`/`ApprovalDecisionResultDto` are **unchanged**. The in-app detail endpoint returns the same `ApproverViewDto`.

```ts
export interface ApprovalAssignmentDto {
  task_id: string;
  step_id: string;
  reference: string;
  title: string;
  requester: { full_name: string; email: string; unit_names: string[] };
  step_name: string;
  is_repeat: boolean;
  task_status: TaskStatus;
  current_step_name: string | null;           // the task's first active step now, for history ("Now with: Dean approval")
  submitted_at: string;                       // taskSubmittedAt
  activated_at: string | null;                // when it reached the approver
  decision: ApprovalDecision | null;
  comment: string | null;
  decided_at: string | null;
  decided_via: ApprovalChannel | null;
}
export interface ApprovalAssignmentListResponseDto { approvals: ApprovalAssignmentDto[]; page: { total: number; limit: number; offset: number } }
export interface ApprovalAssignmentSummaryDto { pending: number }
```

The web gets `enum ApprovalChannel` and `enum ApprovalAssignmentState` with identical values, and `ApprovalErrorCode.APPROVAL_NOT_FOUND`.

### 4.4 HTTP API

All routes require a session and `task:approve`. They are registered in a new `routes/approver.route.ts` under the `/approver` prefix. Using a distinct prefix means `/approvals/:token` can never swallow them, whatever the registration order.

| Method and path | Query / body | Response | Notes |
|---|---|---|---|
| `GET /approver/approvals/pending` | `search?`, `limit?`, `offset?` | `200 ApprovalAssignmentListResponseDto` | Oldest first (D-9) |
| `GET /approver/approvals/history` | `decision?`, `search?`, `limit?`, `offset?` | `200 ApprovalAssignmentListResponseDto` | Newest decision first |
| `GET /approver/approvals/summary` | — | `200 ApprovalAssignmentSummaryDto` | Sidebar count |
| `GET /approver/approvals/:taskId/steps/:stepId` | — | `200 ApproverViewDto` | Works for live and decided steps; `allowed_decisions: []` when not live |
| `POST /approver/approvals/:taskId/steps/:stepId/decision` | `ApprovalDecisionInputDto` | `200 ApprovalDecisionResultDto` | Same validation as the token route |

Request parsing lives in `utils/http/approver-request.util.ts`: `parseApprovalAssignmentQuery(query, state)` and `approvalAssignmentParams(req)`. It reuses `requireOneOf` for `decision` and the task list's limit and offset helpers.

### 4.5 Persistence

**`ITaskModel` additions** (`models/task.model.ts`):

```ts
findApprovalAssignmentPage(identity: ApproverIdentity, filter: ApprovalAssignmentFilter): Promise<ApprovalAssignmentPage>;
countPendingApprovalAssignments(identity: ApproverIdentity): Promise<number>;
```

- The base match is `{ created_by: { $ne: identity.userId }, steps: { $elemMatch: approvalAssignmentStepMatch(identity, filter) } }`. `approvalAssignmentStepMatch` lives in `approver-identity.util.ts` and is unit-tested.
- PENDING also requires `status: in_progress` on the task.
- The pipeline is `$match` → `$project` (drop `forms`, `values`, `conversation`, `audit`) → `$unwind: "$steps"` → `$match` on the unwound step with the same clause, re-prefixed to `steps.` → `$match` on `search` → `$sort` → `$facet { rows: [$skip, $limit], total: [$count] }`.
- `current_step_name` needs the task's other steps, and `$unwind` removes them. Keep a `$first`-free solution: before the `$unwind`, add `active_step_name` with `$let`/`$filter` over `steps` (the first step whose status is in `ACTIVE_TASK_STEP_STATUSES`). Pass the status values in from the constants, not as literals.

**Mongo migration `<timestamp>_approval-inbox.migration.ts`** (literals only):

- **up:**
  - Lowercase and trim `steps.$[s].assignee.email` on every task where `s.assignee.email` is a string. Use an update pipeline with `$map` over `steps`.
  - Set `decided_via: null` and `decided_by_user_id: null` on every step approval that lacks them. Use arrayFilters `{ "s.approval": { $type: "object" }, "s.approval.decided_via": { $exists: false } }`.
  - Create `task_step_assignee_user_status` on `{ "steps.assignee.user_id": 1, "steps.status": 1 }`.
  - Create `task_step_assignee_email_status` on `{ "steps.assignee.email": 1, "steps.status": 1 }`.
- **down:** drop both indexes and unset the two approval fields. Leave emails lowercased; the change is harmless and cannot be reversed.

### 4.6 Pure rules (single sources of truth)

| Rule | Lives in | Used by |
|---|---|---|
| Identity from the auth user; `isAssignedTo(assignee, identity)`; `approvalAssignmentStepMatch(identity, filter)` | `utils/approval/approver-identity.util.ts` | `ApprovalService.resolveAssignment`, `TaskModel` |
| Assignee email normalisation on bind | `utils/task/task-assignee-binding.util.ts` (calls `normalizeEmail`) | engine |
| Live check `isLiveApproval(step)` | `utils/approval/approver-identity.util.ts` | `ApprovalService` (both resolvers) |
| Assignment row → DTO | `utils/http/approval-serializer.util.ts` (`serializeApprovalAssignment`) | `ApproverController` |
| Web: list filters and URL params | `src/lib/approvals/approval-list-filter.ts` | inbox and history hooks |
| Web: row presentation (waiting time, "Now with …", channel label) | `src/lib/approvals/approval-assignment-presentation.ts` | inbox and history tables |

---

## 5. Phase map

| Phase | App | Depends on | Delivers |
|---|---|---|---|
| 1 | API | revamp 1–14 | Constants, error code, types, identity util, email normalisation, `ApprovalActor` in the engine, migration + indexes, tests |
| 2 | API | 1 | Model queries, `ApproverAssignmentService`, shared-core `ApprovalService`, `/approver/*` routes, email line, tests |
| 3 | Web | 2 (contracts only) | Type mirrors, API module, hooks, routes, copy, pure modules + tests, channel-agnostic decision panel and `ApproverDetailLayout` |
| 4 | Web | 3 | Pending and History screens, sidebar count |
| 5 | Web | 3 | In-app approval page, requester-side copy |
| 6 | Both | all | Docs, Postman, revamp plan notes, end-to-end verification with mail off |

Phases 4 and 5 can run in parallel after Phase 3.

---

## Phase 1 — API foundations

**Goal:** every name, type and pure rule exists and is tested, and stored data is ready for assignee queries. No route changes yet.

**Create**

- `data/constants/approval.constant.ts` (§4.1). Append `ApprovalChannel` to `task.constant.ts` and `APPROVAL_NOT_FOUND` to `approval-error.constant.ts`. Add `approvalNotFound` to `errors/approval.error.ts`.
- `lib/types/approval/approver-identity.type.ts`, and the §4.2 additions in `approval.type.ts`. Export them from `lib/types/approval/index.type.ts`.
- `utils/approval/approver-identity.util.ts`:
  - `approverIdentityOf(user: AuthenticatedUser): ApproverIdentity` (normalises the email)
  - `isAssignedTo(assignee: TaskAssignee | null, identity): boolean`
  - `isLiveApproval(step: TaskStepRecord): boolean`
  - `approvalAssignmentStepMatch(identity, filter): Filter<TaskStepRecord>`
- The Mongo migration (§4.5).

**Modify**

- `lib/types/task/task-document.type.ts`: `TaskApprovalRecord.decided_via` and `decided_by_user_id`.
- `utils/task/task-plan-compiler.util.ts`, `utils/task/information-request-insertion.util.ts`: initialise both fields to `null`.
- `services/assignee-resolution/directory.assignee-resolver.ts`: store normalised emails on the assignee and its candidates.
- `utils/task/task-assignee-binding.util.ts`: `normalizeEmail` on `PERSON` values (D-3).
- `services/task-engine.service.ts`: `recordDecision(task, stepId, decision, comment, actor: ApprovalActor, context)` stamps `decided_via` and `decided_by_user_id`. Update `ApprovalService.decide` to pass `{ channel: ApprovalChannel.EMAIL_LINK, user_id: step.assignee?.user_id ?? null }`, and update every test call site.
- `tests/helpers/task-fixture.helper.ts` (and any builder of `TaskApprovalRecord`): the two new fields.

**Tests**

- `tests/unit/utils/approver-identity.util.test.ts`:
  - match by user id
  - match by email, including mixed case on the identity side
  - no match when both differ
  - `null` assignee
  - live and not-live steps
  - the step-match clause shape for PENDING and for DECIDED with and without a decision filter
- `task-assignee-binding.util.test.ts`: a `PERSON` value with `"Ishara@U.C "` is stored as `"ishara@u.c"`.
- `task-engine.service.test.ts`: `recordDecision` stamps the channel and user id for all three decisions. Existing scenarios still pass.
- `tests/integration/mongo-models.test.ts`: the migration up/down runs on a seeded legacy-shaped task (mixed-case email, no `decided_via`).

**Verification**

```bash
npm run typecheck && npm test
npm run migrate:mongo:up && npm run migrate:mongo:status
```

**Done when:** no `"email_link"`, `"app"`, `"pending"` or `"decided"` literal exists outside `data/constants` and the migration, and every new util has a test file.

---

## Phase 2 — Approver assignment service and routes

**Goal:** a signed-in approver can list, open and decide their approvals through HTTP, with no email involved.

**Create**

- `services/approver-assignment.service.ts`: `ApproverAssignmentService.list(identity, filter): Promise<ApprovalAssignmentPage>` and `pendingCount(identity): Promise<number>`. It clamps `limit` to `TASK_FIELD_LIMIT.LIST_MAX_LIMIT` and trims `search` to `SEARCH_MAX_LENGTH`.
- `utils/http/approver-request.util.ts` (§4.4).
- `controllers/approver.controller.ts`: `listPending`, `listHistory`, `summary`, `getAssignment`, `decide`. It builds the identity once per request through `approverIdentityOf(requireAuthContext(req).user)`.
- `routes/approver.route.ts`: §4.4, every route behind `requireAnyPermission(Permission.TASK_APPROVE)`.

**Modify**

- `models/task.model.ts`: `findApprovalAssignmentPage` and `countPendingApprovalAssignments` (§4.5). Reuse `escapeRegex`.
- `services/approval.service.ts`, restructured per D-5:
  - private `resolveAssignment(taskId, stepId, identity): Promise<ApprovalContext>`, which loads by id. It raises `approvalNotFound` when the task or step is missing, the step has no `approval`, `!isAssignedTo(step.assignee, identity)`, or `task.created_by === identity.userId`. It sets `live = isLiveApproval(step) && task.status === in_progress`.
  - `resolveToken`: unchanged behaviour. Its live branch uses `isLiveApproval`.
  - private `buildView(context)` and private `applyDecision(context, input, actor)`, which hold today's `getView` and `decide` bodies.
  - public `getView(token)`, `decide(token, input)`, `getViewForAssignee(taskId, stepId, identity)` and `decideAsAssignee(taskId, stepId, identity, input)`.
  - `ApprovalServiceOptions.taskModel` stays `Pick<ITaskModel, "findById" | "findByApprovalTokenHash">`.
- `controllers/approval.controller.ts`: move `parseDecisionInput` to `utils/http/approver-request.util.ts` and import it from both controllers.
- `utils/http/approval-serializer.util.ts`: `serializeApprovalAssignment(row)`. `submitted_at` comes from `taskSubmittedAt` (adapt it to take the projection type). `unit_names` uses `describeRequesterUnit`.
- `routes/index.route.ts`, `server.ts`: construct `ApproverAssignmentService` and `ApproverController`, and mount `createApproverRouter`.
- `data/templates/approval-email.template.ts`, `services/notification.service.ts`: the inbox line (D-14).

**Tests**

- `tests/unit/services/approval.service.test.ts` (extend):
  - in-app view and decision for a directory assignee
  - in-app decision for a requester-supplied assignee matched by email
  - a non-assignee → 404
  - the requester themselves → 404
  - a decided step → view with `decided`; decide → 409
  - a step with an **expired token** and one with **no token** (the failed-dispatch case) can still be decided in the app
  - an in-app decision clears the token, and the token route then shows `decided`
  - the comment rules are unchanged on both channels
- `tests/unit/services/approver-assignment.service.test.ts` (in-memory Mongo):
  - pending lists only live steps assigned to the identity
  - a task with an awaiting step for someone else **and** a decided step for the identity does not appear in pending (`$elemMatch`)
  - a repeat review gives two history rows
  - decision filter
  - search on reference, title and requester name
  - pagination and total
  - own tasks excluded
  - cancelled-before-decision steps excluded
  - `current_step_name`
- `tests/integration/approver.route.test.ts`:
  - 401 with no session; 403 without `task:approve`
  - the full Appendix A story with the console mailer **disabled** (no notifier): create → submit → advisor (`u6@u.c`, named by email) sees it in pending → request more information → requester answers → the advisor sees the repeat in pending and the first decision in history → approve → HoD (`u19@u.c`) approves → Dean (`u18@u.c`) approves → completed
  - `GET /approvals/:token` still works next to `/approver/*` (route collision guard)
  - the summary count goes 1 → 0 after the decision
- `notification.service.test.ts`: the inbox line appears only for assignees with a `user_id`.

**Verification**

```bash
npm run typecheck && npm test
MAIL_TRANSPORT=console npm run dev   # walk the Phase 2 integration story in Postman without opening any emailed URL
```

**Done when:** the integration story passes with no notifier configured, and no comment rule or allowed-decisions check is duplicated between channels (grep `COMMENT_REQUIRED_DECISIONS` in `services/`: one use).

---

## Phase 3 — Web foundations

**Goal:** the web app speaks the new contracts, and every hook, pure rule and shared component the screens need exists and is tested.

**Create**

- Types: extend `src/types/approval.ts` with §4.3 (keep its "change this file in the same commit" header).
- `lib/api/approvals.ts`: add `approverApprovalPendingPath(filter)`, `approverApprovalHistoryPath(filter)`, `APPROVER_APPROVAL_SUMMARY_PATH`, `approverApprovalPath(taskId, stepId)`, and `approverApprovalsApi.decide(taskId, stepId, body)`. Build query strings with `query-string.ts`.
- `lib/approvals/approval-list-filter.ts` (+ test): parse and serialise `search`, `decision` and `offset` URL params, using `ListQueryParam` plus a new `DECISION` member if it is missing.
- `lib/approvals/approval-assignment-presentation.ts` (+ test): `waitingSince(row)`, `historyOutcomeText(row)` ("Approved · now with Dean approval", "Request completed", "Rejected", "Waiting for the requester's answer"), and `Record<ApprovalChannel, string>` channel labels.
- `lib/approvals/approval-constant.ts`: `APPROVAL_INBOX_POLL_INTERVAL_MS = 30_000`, `APPROVAL_LIST_PAGE_SIZE`.
- Hooks (`lib/hooks/`):
  - `useApprovalInbox.ts` and `useApprovalHistory.ts` mirror `useTaskRequests` (URL-driven, debounced search, `keepPreviousData`, inbox polls).
  - `useApprovalAssignment.ts` (SWR on `approverApprovalPath`).
  - `usePendingApprovalCount.ts` (polls; returns `null` when the user lacks `task:approve`, using the session's permissions so no request is sent).
- `components/approvals/ApproverDetailLayout.tsx`: the two-column body extracted from `ApproverView` (D-10). It takes `view`, `onDecide` and `onDecided`.
- `lib/routing/route-path.ts`: `approvalDetailPath(taskId, stepId)`.
- `lib/task-request/task-request-copy.ts`: a new `approvals` group (inbox, history, workspace, empty states, columns, filters, count label), and `approver.decidedVia(channel)`.

**Modify**

- `components/approvals/ApproverDecisionPanel.tsx`: replace `token` with `onDecide`/`onDecided` (D-10). Keep the 409 handling, now calling `onDecided`-style refresh through a prop.
- `components/approvals/ApproverView.tsx`: `ApproverHeader` + `ApproverDetailLayout`, wiring the token calls and `router.refresh()`.
- `lib/task-request/task-error-message.ts`: copy for `APPROVAL_NOT_FOUND`.
- `types/navigation.ts`: optional `badgeKey?: NavBadgeKey`. Add `enum NavBadgeKey { PENDING_APPROVALS = "pending_approvals" }` in the same file.

**Tests:** the two `lib/approvals` modules, plus an extension of `approver-decision.test.ts` if the decision rules change signature. Presentation maps must cover every enum member.

**Verification**

```bash
npm run typecheck && npm run lint && npm test
```

Manual: the emailed-link page still decides all three outcomes exactly as before.

**Done when:** `grep -rn "approvalsApi.decide" src/components` returns only `ApproverView.tsx`.

---

## Phase 4 — Pending and history screens

**Goal:** `/dashboard/approvals` and `/dashboard/approvals/history` list the approver's work in the same style as the task request list.

**Create** (`components/approvals/inbox/`)

| Component | Behaviour |
|---|---|
| `ApprovalInboxScreen.tsx` | `SearchInput` (reference, title, requester), `ApprovalAssignmentTable` in pending mode, `Pagination`. States: skeleton, `EmptyState` ("You're all caught up", with no action), no matches, error with retry. |
| `ApprovalHistoryScreen.tsx` | The same toolbar plus a `SegmentedControl`: All, Approved, Rejected, More information requested. Bound to the `decision` URL param. States as above; the empty state says decisions will appear here. |
| `ApprovalAssignmentTable.tsx` | Responsive `Table` that stacks into cards at 375px. **Pending columns:** *Request* (title + `CodeChip` reference + "Repeat review" `Badge` when `is_repeat`), *Requester* (name + first unit), *Your step*, *Waiting since* (`DateTime` + relative text). **History columns:** *Request*, *Requester*, *Your decision* (`ApprovalDecisionBadge` + one line of the comment), *Outcome* (`TaskStatusBadge` + `historyOutcomeText`), *Decided* (`DateTime`; channel caption when `email_link`). Each row links to `approvalDetailPath`. One `mode` prop, with columns chosen from a `Record<ApprovalAssignmentState, …>` map. |

**Modify**

- `app/dashboard/approvals/page.tsx` → `ApprovalInboxScreen`. `app/dashboard/approvals/history/page.tsx` → `ApprovalHistoryScreen`.
- `lib/navigation/dashboard-navigation.ts`: `badgeKey: NavBadgeKey.PENDING_APPROVALS` on the Pending item.
- `components/dashboard/sidebar/SidebarNavLink.tsx` (and `Sidebar.tsx` if needed): render the count pill from a `useNavBadgeCounts()` map (D-13). Use the existing token classes and an `aria-label` such as "3 pending".

**Verification:** `npm run typecheck && npm run lint && npm test`. Then, signed in as `u6@u.c` with a pending advisor step: the row appears within one poll interval, filters survive a refresh, the count pill matches, and the table stacks at 375px.

**Done when:** every state (loading, empty, no matches, error, populated) is designed for both screens, and the URL holds the filters.

---

## Phase 5 — In-app approval page

**Goal:** an approver opens a row and decides inside the dashboard, with the same information and rules as the emailed page.

**Create** (`components/approvals/workspace/`)

- `ApprovalWorkspaceScreen.tsx`: `useApprovalAssignment(taskId, stepId)` inside `QueryState`; `usePageHeading` (D-11); a back link to Pending or History (from `decided`); then `ApproverDetailLayout` with `onDecide` calling `approverApprovalsApi.decide` and `onDecided` revalidating the assignment, inbox, history and count keys and showing a `Toast`. After a decision, show a **Back to pending** `ButtonLink`. A 404 renders a "This approval isn't available to you" `EmptyState` with a link to Pending, not the global not-found.

**Modify**

- `app/dashboard/approvals/[taskId]/[stepId]/page.tsx` (new route file): `requireRouteAccess(RoutePath.APPROVALS)`, await `params`, render `ApprovalWorkspaceScreen`.
- `components/task-requests/workspace/ApproverCard.tsx` and copy: when `notified_at` is `null` and the step is `awaiting_approver`, show "Waiting in the approver's Unblock inbox" instead of "Not yet sent" (G-8).

**Verification:** `npm run typecheck && npm run lint && npm test`. Then decide all three outcomes from the app. Try a missing required comment. Decide a step in the app, then open its emailed link: it shows `decided`. Decide by link while the in-app page is open, then press Approve in the app: you get the "already decided" notice. Check keyboard-only use and a 375px layout.

**Done when:** an approver can make every decision with the keyboard only, and the requester's workspace reflects it within one poll interval.

---

## Phase 6 — Documentation, Postman and final verification

**Modify**

- `unblock-ai-api/docs/api/api-documentation.md`: the five `/approver/*` routes, with bodies and error codes.
- `unblock-ai-api/docs/architecture/project-overview.md`, `folder-structure.md`, `error-handling.md`; `docs/guides/database-migrations.md` (the new migration).
- `unblock-ai-api/docs/postman/*`: an **Approver inbox** folder (pending → open → decide → history → summary) that signs in as the approver.
- `docs/overview.md` (area G and the HTTP quick index), `docs/demo-script.md`, `README.md`, `PROJECT_DOCUMENTATION.md`: approvers can work in the app.
- `docs/task-request-revamp-phase-plan.md`: mark D-25 and the §20 inbox row "Superseded by `approver-inbox-phase-plan.md`".
- This plan: set the status note to implemented, with any refinements made during the build.

**Verification**

```bash
cd unblock-ai-api && npm run typecheck && npm test
cd ../unblock-ai-web && npm run typecheck && npm run lint && npm test && npm run build
```

Then walk Appendix A below in the browser.

**Done when:** Appendix A passes with mail off.

---

## 12. Out of scope and follow-ups

| Item | Why deferred |
|---|---|
| Blocking self-approval on the emailed-link path, and rejecting a requester-supplied approver email equal to the requester's own | The in-app path already excludes own tasks (D-6). Closing the link path needs a new form issue code and engine guard. That is a separate, small change. |
| Requester-supplied approvers without an account, or without `task:approve` | They keep the emailed link only. Inviting them or granting permissions is a user-management concern. |
| Resending an approval email from the requester's workspace | Revamp §20 already lists it. The inbox removes the urgency. |
| Delegation, out-of-office and bulk decisions | Not requested. Bulk decisions would weaken the comment rules. |
| Push updates (websockets or server-sent events) | Polling (D-12) is enough at this scale. |
| Notifying approvers in-app (a bell or toast feed) | The sidebar count covers discovery. |

---

## Appendix A — End-to-end acceptance script (mail off)

Preconditions: the revamp plan's Appendix A preconditions, except that **mail is disabled** (no notifier, or a mail transport that fails). Both Phase 1 migrations are applied. Before step 2, check the seeded emails: Ishara Bandara (IT senior lecturer, `task:approve`) is expected at `u6@u.c`, Dinesh at `u19@u.c` and Sunethra at `u18@u.c`.

1. As Kavindu (`u17@u.c`), start the IT overseas-leave task (revamp Appendix A steps 1–4). In the entry form, name the academic advisor as **Ishara Bandara**, `Ishara@U.C` (mixed case on purpose). Use a 40-day trip and submit. The advisor card says "Waiting in the approver's Unblock inbox".
2. Sign in as Ishara (`u6@u.c`). The sidebar shows **Pending 1**. Pending lists the request, with Kavindu as requester and "Academic advisor review" as the step.
3. Open it. The page shows Kavindu's details, the form answers and the plan rail, inside the dashboard. Choose **Request more information** with no comment: blocked. Add a comment and confirm. Pending is empty. History shows "More information requested · Waiting for the requester's answer".
4. As Kavindu, answer the information request.
5. As Ishara: Pending shows the request again with a **Repeat review** badge. Approve. History now has two rows for this task.
6. As Dinesh (`u19@u.c`): Pending shows the HoD step. Approve.
7. As Sunethra (`u18@u.c`): Pending shows the Dean step. Approve.
8. As Kavindu: the task is **Completed**, and **Download transcript** works. The approval trail lists all four decisions with comments.
9. As Kavindu, try `/dashboard/approvals/<that task id>/<any step id>`: "This approval isn't available to you" (no `task:approve`, and it is his own task).
10. Repeat with Hasitha (`u12@u.c`, CSE student) and reject at the first approval from the app: the task becomes **Rejected**, and the approver's History shows "Rejected".
11. Turn the console mailer back on. Start another task and decide its first approval in the app, then open the emailed link: it shows the decision as already made.
