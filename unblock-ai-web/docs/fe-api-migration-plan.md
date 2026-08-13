# FE API Migration Plan — Unblock AI Web → TypeScript API

> Planning document only. No frontend code has been changed.
> Verified against the actual backend source (`unblock-ai-api/src/**`), not only the docs.

## Summary

The backend rewrite from plain Express/JS to Express + TypeScript **did not change a single endpoint path, HTTP method, or status code**. Every one of the 12 endpoints the frontend currently calls still exists at exactly the same URL with the same verb. The migration is therefore *not* a re-wiring job — it is a **type-fidelity and correctness job**. The real risks are three: (1) one genuine runtime bug where `POST /api/selection/sessions` stringifies the `requester_context` object the FE sends into the literal string `"[object Object]"`; (2) a family of FE types that are structurally correct but too loose (`string`, `Record<string, unknown>`) where the backend now publishes precise union types, meaning schema drift will type-check silently and fail at runtime; and (3) three endpoints the backend exposes that the FE never calls, one of which (`PATCH /workflows/:id/review`) is already wired into `workflowsApi` but has no UI caller, so **no template can currently be published from the frontend** — and unpublished templates are invisible to the entire selection flow. Field names and payload shapes are otherwise unchanged, so the work is concentrated in `src/types/*` and a small number of surgical fixes in `src/lib/api/*`.

---

## Endpoint changes

Comparing every FE call site against `unblock-ai-api/src/routes/*.route.ts`.

| Old endpoint (FE calls today) | New endpoint | What changed |
| --- | --- | --- |
| `POST /drafts` | `POST /drafts` | **No change.** Still `{ text, title? }` → `201` + draft object. |
| `GET /drafts` | `GET /drafts` | **No change.** Still an array, capped at 50 server-side. |
| `GET /drafts/:id` | `GET /drafts/:id` | **No change.** Note: a non-24-hex `:id` now returns **500 `DATABASE_ERROR`**, not 404. |
| `POST /drafts/:id/extract` | `POST /drafts/:id/extract` | **No change** to path/body/response. `review_status` is now a typed `ReviewStatus` union, not a bare string. |
| `GET /workflows` | `GET /workflows` | **No change** to path. Backend now accepts an `?institution_type=` query param the FE never sends. |
| `GET /workflows/:id` | `GET /workflows/:id` | **No change.** `?version=` still supported. Empty `?version=` is treated as "latest" (safe). |
| `GET /workflows/:id/record` | `GET /workflows/:id/record` | **No change** to path/params. `updated_at` serialization differs from the sibling summary endpoint — see Risks. |
| `PATCH /workflows/:id/review` | `PATCH /workflows/:id/review` | **No change.** Already in `workflowsApi`, but **never called by any component.** |
| `POST /selection/sessions` | `POST /selection/sessions` | Path unchanged. **`requester_context` is now silently corrupted** by the backend — see Risks §R1. New optional `institution_type` body field. |
| `POST /selection/sessions/:id/answer` | `POST /selection/sessions/:id/answer` | **No change.** Returns `200`. |
| `POST /selection/sessions/:id/choose` | `POST /selection/sessions/:id/choose` | Path/body unchanged. **Response is a narrower object** — no `candidates`, no `confidence`, no `question`, no `options`. FE types it as the full `SelectionResponse`. |
| `GET /selection/sessions/:id/workflow` | `GET /selection/sessions/:id/workflow` | **No change.** Returns the bare workflow document. `409` when the session has not matched. |
| — | `GET /health` | **New to the FE.** Never called. |
| — | `POST /workflows/extract` | **New to the FE.** Preview extraction without persisting. |
| — | `POST /workflows` / `PUT /workflows/:id` / `POST /workflows/:id/validate` | **New to the FE.** No FE save/validate path exists. |

**Net: zero breaking path/method changes.** Every FE endpoint constant in `src/lib/api/*` is still correct as written.

---

## Type/schema changes

The backend now publishes precise union types where the FE hand-mirror uses `string` or `Record<string, unknown>`. None of these break compilation today — that is exactly what makes them dangerous.

| Type | FE file | What changed / what to do |
| --- | --- | --- |
| `Workflow.scope.institution_type` | [workflow.ts:103](../src/types/workflow.ts#L103) | FE: `string`. API: `InstitutionType` union (`university \| school \| company \| hospital \| government \| other`). Narrow it. |
| `Workflow.scope.applies_to.actor_type` | [workflow.ts:104](../src/types/workflow.ts#L104) | FE: `string`. API: `ActorType` (`student \| staff \| faculty \| external \| any`). |
| `Workflow.scope.applies_to.constraints` | [workflow.ts:104](../src/types/workflow.ts#L104) | FE: `Array<Record<string, unknown>>`. API: `WorkflowConstraint { attribute, operator, value }`. **This is why [toPlanNodes.ts:106-109](../src/lib/workflow/toPlanNodes.ts#L106-L109) needs a cast to read `.attribute`** — typing it properly removes the cast. |
| `Workflow.requester.actor_type` | [workflow.ts:106](../src/types/workflow.ts#L106) | FE: `string`. API: `ActorType`. |
| `WorkflowInput.type` | [workflow.ts:77](../src/types/workflow.ts#L77) | FE: `string`. API: `InputType` — 11-member union (`string \| text \| number \| date \| datetime \| boolean \| email \| phone \| enum \| file \| person`). |
| `WorkflowInput.validation` | [workflow.ts:80](../src/types/workflow.ts#L80) | FE: `Record<string, unknown>`. API: `InputValidation` — 9 explicit nullable keys (`min_length`, `max_length`, `min`, `max`, `not_before`, `not_after`, `not_before_field`, `not_after_field`, `pattern`). |
| `Workflow.computed[]` | [workflow.ts:108](../src/types/workflow.ts#L108) | FE: `arguments: Record<string, unknown>`, `operation: string`. API: `ComputedOperation` union + `WorkflowComputedArguments` (`from`, `to`, `inclusive`, `values`, `source`, `key`, `value`). |
| `Workflow.completion` | [workflow.ts:110](../src/types/workflow.ts#L110) | FE: `rule: string`, `actions: Array<Record<string, unknown>>`. API: `CompletionRule` union + `CompletionAction` (7 fields incl. nested `target: Actor \| null`). |
| `Condition` | [workflow.ts:32-38](../src/types/workflow.ts#L32-L38) | FE: `operator: string`. API: discriminated union `ComparisonCondition \| CompoundCondition` over a 12-member `ConditionOperator`. FE reads `condition.description` only, so a narrowed `operator` is safe. |
| `WorkflowStep.notifications.*.channel` | [workflow.ts:67-68](../src/types/workflow.ts#L67-L68) | FE: `channel: string`. API: `NotificationChannel` (`email \| sms \| in_app`). |
| `WorkflowStep.response_fields[]` | [workflow.ts:59](../src/types/workflow.ts#L59) | Structurally identical to API `ResponseField`. Extract to a named interface for parity. |
| `WorkflowStep.context_from_steps[]` | [workflow.ts:60](../src/types/workflow.ts#L60) | Structurally identical to API `ContextBinding`. Extract to a named interface. |
| `Workflow.metadata.created_from` | [workflow.ts:112](../src/types/workflow.ts#L112) | FE: `string`. API: literal `"plain_text"`. |
| `WorkflowRecord.updated_at` | [workflow.ts:142](../src/types/workflow.ts#L142) | FE: `string`. API `TemplateRecordDto.updated_at` is typed `Date` and **not** `.toISOString()`-normalised by `serializeTemplateRecord`. Over JSON it still arrives as an ISO string, so `string` is correct on the wire — **keep `string`, do not copy the backend's `Date`.** |
| `Draft.created_at` / `updated_at` | [draft.ts:10-11](../src/types/draft.ts#L10-L11) | Same situation: API `DraftDto` types them `Date`, wire value is an ISO string. **FE `string` is correct.** |
| `SelectionResponse.confidence` | [selection.ts:14](../src/types/selection.ts#L14) | FE: `"high" \| "medium" \| "low"` (narrower). API `SelectionResponseDto.confidence` is `string`, but the underlying `Confidence` type is the same 3-member union. FE is fine and stricter. |
| `SelectionResponse.decision` | [selection.ts:1](../src/types/selection.ts#L1) | FE: 4-member union. API `SelectionResponseDto.decision` is `string`, underlying `SelectionDecisionKind` matches. FE is fine. |
| **`ChooseResponse`** (missing) | [selection.ts](../src/types/selection.ts) | **New type needed.** `POST /choose` returns only `{ session_id, decision, workflow_id }`. FE currently types it `SelectionResponse`, which lies about `candidates`/`options`/`confidence` being present. |
| `ExtractResult.review_status` | [drafts.ts:10](../src/lib/api/drafts.ts#L10) | FE: `string`. API `DraftExtractResponseDto.review_status`: `ReviewStatus`. Import the existing FE `ReviewStatus`. |
| `Actor`, `RetrievalSummary`, `WorkflowSummary`, `Dependency`, `OutcomeEffect`, `StepType`, `ReviewStatus`, `DraftStatus` | `src/types/*` | **Already exact matches.** No change needed. |

---

## Affected files

Checklist of every FE file needing an edit.

- [ ] **[src/types/workflow.ts](../src/types/workflow.ts)** — Narrow ~12 `string`/`Record<string, unknown>` fields to the API's union types; add `InstitutionType`, `ActorType`, `InputType`, `ComputedOperation`, `CompletionRule`, `ConditionOperator`, `NotificationChannel`, `WorkflowConstraint`, `InputValidation`, `CompletionAction`, `WorkflowComputedArguments`, `ResponseField`, `ContextBinding`. Update the stale header comment (it points at `UNBLOCK-AI/src/schema/workflow.schema.json`; the file now lives at `unblock-ai-api/src/data/schemas/workflow.schema.json`).
- [ ] **[src/types/selection.ts](../src/types/selection.ts)** — Add `ChooseResponse { session_id, decision, workflow_id }`. Optionally add `Confidence` as a shared alias.
- [ ] **[src/types/draft.ts](../src/types/draft.ts)** — No structural change required. Confirm `created_at`/`updated_at` stay `string` (they are ISO strings on the wire).
- [ ] **[src/lib/api/selection.ts](../src/lib/api/selection.ts)** — Change `choose` return type to `ChooseResponse`; add the optional `institution_type` parameter to `start`; **work around the `requester_context` stringification bug (R1)** by either sending a flat string-valued object or coordinating a backend fix.
- [ ] **[src/lib/api/drafts.ts](../src/lib/api/drafts.ts)** — Type `ExtractResult.review_status` as `ReviewStatus` instead of `string`.
- [ ] **[src/lib/api/workflows.ts](../src/lib/api/workflows.ts)** — Add `institution_type` filter to `list()`; fix the falsy-version bug (R4); optionally add `extract`, `create`, `update`, `validate` wrappers for the new endpoints.
- [ ] **[src/lib/api/client.ts](../src/lib/api/client.ts)** — Add the `code` field to `ApiError` (every backend error now returns `{ error, code, details }`; the FE currently discards `code`, which is the only stable machine-readable discriminator).
- [ ] **[src/lib/hooks/useSelectionSession.ts](../src/lib/hooks/useSelectionSession.ts)** — No change strictly required. Verify the `choose` flow still compiles once `ChooseResponse` narrows the return type (it ignores the return value, so it should). Consider handling the `409` from `getWorkflow`.
- [ ] **[src/lib/auth/session.ts](../src/lib/auth/session.ts)** — `getRequesterContext()` returns `{ faculty, department, actor_type }`. Given R1, this object is what gets mangled into `"[object Object]"`. No change if the backend is fixed; flatten to a string if not.
- [ ] **[src/lib/workflow/toPlanNodes.ts](../src/lib/workflow/toPlanNodes.ts)** — Once `WorkflowConstraint` is properly typed, remove the `as { attribute?: string }` / `as { value?: string }` casts at lines 106–109. Behaviour-neutral cleanup.
- [ ] **[src/components/admin/TemplateEditor.tsx](../src/components/admin/TemplateEditor.tsx)** — No API-shape change needed. The "Save draft" button at line 81 has no `onClick` — flag only; wiring it is a UI decision, out of scope here.
- [ ] **[.env.local](../.env.local)** — `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api` is correct, but the API also defaults to port **3000** and its CORS default allows origin **`http://localhost:3001`**. See R5.

**No changes needed:** all `src/components/ui/*`, `src/components/portal/*`, `src/components/admin/flowchart/*`, `src/lib/workflow/toFlowGraph.ts`, `src/lib/workflow/editorState.ts`, `src/lib/utils/*`, `src/lib/fixtures/jobs.ts`, and all `src/app/**/page.tsx` — they consume FE types and never touch endpoint shapes directly.

---

## New endpoints to integrate

| Endpoint | Why the FE wants it | Suggested placement |
| --- | --- | --- |
| `PATCH /workflows/:id/review` | **Highest value.** Already implemented in `workflowsApi.setReviewStatus` but **no component calls it.** Until a template is set to `confirmed`, retrieval ignores it entirely — so nothing an admin creates is ever findable in the portal. This is a functional gap, not a nicety. | A publish/approve control in `TemplateEditor.tsx` or `admin/templates/[id]/page.tsx`. |
| `GET /workflows?institution_type=` | `TemplateFilters.tsx` renders filter UI with no backing query. | `workflowsApi.list(institutionType?)`. |
| `POST /workflows/:id/validate` | Lets the admin editor verify an edited document before saving; returns `200` with `{ valid, errors }` either way. | New `workflowsApi.validate`. |
| `PUT /workflows/:id` | No FE path currently saves an edited workflow. Full-document replace, creates a new version. | New `workflowsApi.update`. |
| `POST /workflows/extract` | Preview extraction without persisting a draft — an alternative to the current `create`-then-`extract` two-call flow. | New `workflowsApi.extract`. |
| `POST /workflows` | Direct save of a hand-built document. Lower priority. | New `workflowsApi.create`. |
| `GET /health` | Useful for a connection banner / dev diagnostics. Optional. | New `healthApi`. |

`institution_type` on `POST /selection/sessions` is also newly available and would let the portal restrict candidates using the session's organisation.

---

## Deprecated / removed endpoints to clean up

**None.** No endpoint the frontend calls was renamed, removed, or changed method. There is no `DELETE` route anywhere in the API (it appears only in the CORS allow-list), and the FE never attempts one. `RequestOptions` in [client.ts:23](../src/lib/api/client.ts#L23) lists `"DELETE"` as a permitted method — harmless, but it can be dropped since no route accepts it.

---

## Risks / breaking changes

Ordered by likelihood of biting silently.

### R1 — `requester_context` is corrupted into `"[object Object]"` (real bug, backend-side)
The FE sends a nested object:
```ts
// src/lib/auth/session.ts:50
{ faculty, department, actor_type: "staff" }
```
The backend parses it with `optionalString(req.body, "requester_context")` ([selection.controller.ts:26](../../unblock-ai-api/src/controllers/selection.controller.ts)), and `optionalString` ends in `return String(value)` ([request-validator.util.ts](../../unblock-ai-api/src/utils/http/request-validator.util.ts)). `String({...})` yields the literal `"[object Object]"`, which is what gets persisted onto the session and passed to the selector.

**Impact:** every scrap of requester context is destroyed on every selection session. No error is thrown, no type fails, and the selector simply loses the faculty/department signal it was meant to use to skip clarifying questions. This is the single most consequential finding in this migration.

**Fix:** correct on the **backend** — `requester_context` is documented as `object | null` and should be read with an object-preserving accessor, not `optionalString`. A FE-side workaround (flattening to a string) would satisfy the type but discard the structure the docs promise. Note `institution_type` is legitimately a string, so `optionalString` is correct there.

### R2 — `choose` is typed as the full `SelectionResponse` but returns three fields
[selection.ts:18-22](../src/lib/api/selection.ts#L18-L22) declares `apiRequest<SelectionResponse>`. The real body is `{ session_id, decision, workflow_id }` only. Any future code doing `result.candidates.map(...)` or `result.options.length` compiles cleanly and throws `Cannot read properties of undefined` at runtime. `useSelectionSession.choose` currently ignores the return value, so nothing breaks *today* — this is a landmine, not an active fire.

### R3 — Loose types absorb schema drift without a compile error
`validation: Record<string, unknown>`, `arguments: Record<string, unknown>`, `constraints: Array<Record<string, unknown>>`, and every `operator: string` / `type: string` will accept *any* backend change silently. The file header in `workflow.ts` explicitly warns that "a drifted contract produces `undefined` at runtime with no compile error" — these fields are precisely where that happens. Narrowing them is the main defensive value of this migration.

### R4 — `version` falsy-check drops version `0`
```ts
// src/lib/api/workflows.ts:8 and :12
`${version ? `?version=${version}` : ""}`
```
`version === 0` is falsy and silently omits the param. The backend rejects `version <= 0` as a `400` anyway (`optionalPositiveInt`), so this masks a client error rather than causing a wrong fetch. Prefer `version !== undefined` so the API surfaces the real validation error. Minor.

### R5 — Port and CORS collision
The API defaults to `PORT=3000` and `CORS_ORIGIN=http://localhost:3001`. Next.js `next dev` also defaults to **3000**. So either the web app takes 3000 and the API cannot bind it, or the web app is moved to 3001 (matching the API's CORS default) — the second is clearly the intended setup. Note that server-side calls from `page.tsx` files (`admin/page.tsx`, `admin/templates/[id]/page.tsx` are both `force-dynamic` server components) bypass CORS entirely, so a misconfiguration here will manifest **only in client components** — `TemplateEditor` and the selection chat — which makes it easy to misdiagnose.

### R6 — Malformed ObjectIds return 500, not 404
For every `/drafts/:id*` and `/selection/sessions/:id*` route, an id that is not 24-hex fails inside the Mongo driver and surfaces as `500 DATABASE_ERROR`. [admin/templates/[id]/page.tsx:16](../src/app/admin/templates/[id]/page.tsx#L16) only calls `notFound()` on `err.status === 404`, so a malformed draft id renders a 500 error page instead of a not-found page. Note this route's own `:id` is a `workflow_id` (a plain string, always a clean 404) — the exposure is the **chained `draftsApi.get(draftId)` call on line 23**.

### R7 — `ApiError` discards the `code` field
Every backend error returns `{ error, code, details }` with a stable `code` (`VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `EXTRACTION_ERROR`, `SELECTION_ERROR`, `EMBEDDING_ERROR`, `DATABASE_ERROR`, `INTERNAL_ERROR`). [client.ts:45-49](../src/lib/api/client.ts#L45-L49) captures only `error` and `details`. Branching on HTTP status alone cannot distinguish a `422` extraction failure from a `409` unmatched session as precisely as `code` can.

### R8 — `409` from `getWorkflow` is unhandled
`GET /selection/sessions/:id/workflow` returns `409 CONFLICT` when the session has not matched. `useSelectionSession.choose` calls it immediately after `choose` resolves — safe, since `choose` finalises the session as `matched`. But the `matched` branch of `handleDecision` ([useSelectionSession.ts:69](../src/lib/hooks/useSelectionSession.ts#L69)) has no try/catch, so a `409` or `404` there escapes as an unhandled promise rejection rather than a chat error message.

### R9 — Inconsistent `updated_at` serialization between two workflow endpoints
`serializeTemplateSummary` explicitly calls `.toISOString()`; `serializeTemplateRecord` passes the raw `Date` through. Both emit an ISO string over JSON, so the FE is unaffected **today**. It becomes a real divergence only if a non-`Date` value ever reaches that field. Worth knowing, not worth acting on.

---

## Suggested implementation order

1. **Fix R1 on the backend first.** `requester_context` stringification is a live data-loss bug, and it is not fixable in the FE without discarding the structure. Everything else is safe to do in parallel, but this should not wait behind type work.
2. **Types layer — `src/types/workflow.ts`.** Add the union types and narrow the loose fields. Do this before touching the API layer so the client functions have precise types to reference. Run `npx tsc --noEmit` after; expect errors only in `toPlanNodes.ts`.
3. **Types layer — `src/types/selection.ts`.** Add `ChooseResponse`. `src/types/draft.ts` needs no change.
4. **Remove the now-redundant casts in `toPlanNodes.ts`** (lines 106–109), clearing the errors from step 2. Purely internal; no rendered output changes.
5. **API client layer — `src/lib/api/client.ts`.** Add `code` to `ApiError` (R7). Additive, breaks nothing.
6. **API client layer — `selection.ts`, `drafts.ts`, `workflows.ts`.** Apply the `ChooseResponse` return type (R2), the `ReviewStatus` typing, the `version !== undefined` fix (R4), and the `institution_type` params.
7. **Verify with a full typecheck and a manual pass** over the four flows: admin list, admin template open, generate-template, and the portal selection chat. Steps 2–6 should be behaviour-neutral — any visible change means something was over-narrowed.
8. **Then, and only then, integrate the new endpoints.** Start with `PATCH /workflows/:id/review`, since without it nothing published from the admin UI is ever selectable in the portal. `validate` / `update` / `extract` follow as the editor grows.
9. **Confirm the port/CORS setup (R5)** before any browser testing, so client-component failures are not misread as contract bugs.
10. **Harden error handling (R6, R8)** once the contract work is settled: catch the `409`/`404` in the `matched` branch, and treat `DATABASE_ERROR` on a chained draft fetch as not-found.

---

## Appendix — verification method

Endpoints were confirmed by reading `unblock-ai-api/src/routes/{workflow,draft,selection,health}.route.ts` directly rather than relying on the documentation. Response shapes were confirmed from the controllers (`src/controllers/*.controller.ts`), the serializers (`src/utils/http/serializer.util.ts`), and the DTO definitions in `src/lib/types/**`. The `requester_context` bug (R1) was found by tracing `optionalString` from the selection controller into `src/utils/http/request-validator.util.ts` — it is not visible from the API documentation, which describes the field as a passed-through object.
