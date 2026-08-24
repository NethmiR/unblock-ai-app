# Admin Template Open — Performance Phase Plan

Execution plan for reducing **time-to-open a template** and clarifying **time-to-update a
flowchart** in the admin portal.

Each phase is independently shippable and independently verifiable. **Stop after each
phase, confirm the result, then move on.** Phases 2–4 do not depend on Phase 1's code, but
they are ordered by payoff-to-risk.

---

## 0. Findings that shape this plan

All confirmed by reading source, not assumed. Read this section — two findings contradict
the obvious approach, and one cancels a change that looked free.

### Finding 0.1 — Opening a template does NOT re-run the AI. The current design is correct.

This was the original concern, and the answer is no. The LLM extraction runs from exactly
one place:

```ts
// TemplateEditor.tsx:78-96 — generate()
const draft = await draftsApi.create(text, documentTitle);
const result = await draftsApi.extract(draft.id);   // <- the only extract() caller
```

`generate()` is bound to an `onClick`. There is **no `useEffect`** that triggers it, and no
other caller of `draftsApi.extract` in the web app. Opening a template runs two indexed
Mongo reads and nothing else:

| Call | Path | Index used |
| --- | --- | --- |
| `workflowsApi.getRecord(id)` | `findOneByIdAndVersion` | `template_id_version_unique` |
| `draftsApi.get(draftId)` | `DraftModel.findById` | `_id` |

> **Consequence: no phase in this plan needs to "stop regeneration". It already doesn't
> happen.** The work here is purely about round-trips and bundle weight.

### Finding 0.2 — `toFlowGraph` is recomputed per open, and that is fine

`toFlowGraph(workflow)` runs on every open, but it is a **pure deterministic function**:
same workflow JSON in → byte-identical coordinates out. It reads `steps[].depends_on` and
runs dagre. No randomness, no I/O. It is already memoized on `workflow` identity at
`WorkflowFlowchart.tsx:26`.

**Storing the coordinates is therefore deliberately NOT in this plan.** See §5 for the
reasoning and the one future condition that would reverse that decision.

### Finding 0.3 — `revalidate` on the list page cannot work while the shared client sends `no-store`

This one kills the obvious caching fix. `apiRequest` sets the header unconditionally:

```ts
// client.ts:36
cache: "no-store",   // this data is never safe to serve stale
```

A `no-store` fetch **opts the whole route out of Next's Data Cache regardless of what the
page exports.** So adding `export const revalidate = 30` to `admin/page.tsx` would be inert
— it would look like a fix, change nothing, and cost a day of confusion.

Worse, the thing it would buy is staleness on `review_status`, which is exactly the badge
the admin just changed by clicking Publish. **Phase 3 therefore does the opposite of
caching**: it keeps the always-fresh read and makes the refresh explicit.

### Finding 0.4 — `getRecord` has three callers, only one of which wants draft text

```
workflow.controller.ts:getRecord    <- the admin page. WANTS draft text.
workflow.controller.ts:setReviewStatus  <- does not.
workflow.service.ts:132 (delete)        <- does not.
```

A naive "just join the draft in `getRecord`" makes `delete` and `setReviewStatus` pay for a
Mongo lookup they discard. Phase 1 handles this with an **opt-in option**, not a blanket
change.

### Finding 0.5 — test + gate commands (verified in `package.json`)

| Workspace | typecheck | test |
| --- | --- | --- |
| `unblock-ai-api` | `npm run typecheck` | `npm test` (node:test) |
| `unblock-ai-web` | `npm run typecheck` | `npm test` (vitest) |

Integration tests for this area already exist at
`unblock-ai-api/tests/integration/workflow.route.test.ts:224` — that file is the one to
extend in Phase 1, not a new file.

---

## Phase 1 — Collapse the two sequential fetches into one

**Goal:** the template detail page makes one API round-trip instead of two sequential ones.

**Why this is first:** it is the only change that removes a *blocking, serialised* network
hop. The two fetches cannot be parallelised on the client, because `draft_id` is only known
*after* `getRecord` returns. Moving the join server-side puts both reads on the same
network as Mongo.

**Expected win:** one full client↔API round-trip (typically 30–150ms, more on a slow link).

### 1.1 — Widen the DTO

`unblock-ai-api/src/lib/types/template/template.type.ts`

Add one optional field to `TemplateRecordDto`:

```ts
export interface TemplateRecordDto {
  workflow_id: string;
  version: number;
  draft_id: string | null;
  review_status: ReviewStatus;
  document: WorkflowDefinition;
  updated_at: Date;
  /**
   * The originating draft's prose, inlined so the admin editor does not need a
   * second round-trip. `null` when there is no draft_id, or when the draft row
   * is missing/unreadable - see the controller for why that is not a 404.
   */
  draft_text?: string | null;
}
```

Keep it **optional**. That keeps every existing caller and test compiling unchanged.

### 1.2 — Make the serializer accept the extra value

`unblock-ai-api/src/utils/http/serializer.util.ts`

`serializeTemplateRecord` currently maps one document purely. Add a second optional
parameter rather than a second lookup inside the serializer — serializers in this codebase
do no I/O, and that property is worth keeping:

```ts
export function serializeTemplateRecord(
  doc: TemplateDocument,
  draftText?: string | null,
): TemplateRecordDto {
  return {
    workflow_id: doc.workflow_id,
    version: doc.version,
    draft_id: doc.draft_id ? String(doc.draft_id) : null,
    review_status: doc.review_status,
    document: doc.document,
    updated_at: doc.updated_at,
    draft_text: draftText ?? null,
  };
}
```

### 1.3 — Give the controller access to the draft

`WorkflowController` does not currently have a draft dependency. Add `DraftService` to its
options (it is already constructed in `server.ts:44` and passed to `DraftController`, so no
new instance is needed).

`unblock-ai-api/src/controllers/workflow.controller.ts`

```ts
export interface WorkflowControllerOptions {
  workflowService: WorkflowService;
  extractionService: ExtractionService;
  validationService: ValidationService;
  draftService: DraftService;   // NEW
}
```

Assign it in the constructor alongside the others.

Then change **only** the `getRecord` handler:

```ts
getRecord = async (req: Request, res: Response): Promise<void> => {
  const version = optionalPositiveInt(req.query.version, "version");
  const record = await this.workflowService.getRecord(req.params.id as string, version);

  // A missing or malformed draft must NOT 404 the template. The template is the
  // real resource; the prose is a convenience for the left panel. Previously the
  // web layer turned a DATABASE_ERROR here into notFound(), which meant one bad
  // draft_id made a perfectly good template unopenable.
  let draftText: string | null = null;
  if (record.draft_id) {
    try {
      const draft = await this.draftService.get(String(record.draft_id));
      draftText = draft?.raw_text ?? null;
    } catch {
      draftText = null;
    }
  }

  res.json(serializeTemplateRecord(record, draftText));
};
```

> **Behaviour change, called out deliberately:** today a broken `draft_id` surfaces as
> `500 DATABASE_ERROR` and the web page maps it to `notFound()`. After this phase the
> template opens with an empty left panel instead. That is the better behaviour — losing
> the prose should not hide the compiled workflow — but it **is** a change, and it is the
> reason Phase 1 has its own verification step below.

Confirm the exact method name on `DraftService` before writing this (`get` vs `getById`)
and match it; `DraftModel.findById` returns `DraftDocument | null`.

### 1.4 — Wire the new dependency

`unblock-ai-api/src/server.ts:93`

```ts
workflowController: new WorkflowController({
  workflowService,
  extractionService,
  validationService,
  draftService,          // already in scope from line 44
}),
```

### 1.5 — Consume it on the web side

`unblock-ai-web/src/types/workflow.ts` — add `draft_text?: string | null` to
`WorkflowRecord`.

`unblock-ai-web/src/app/admin/templates/[id]/page.tsx` — delete the second fetch and the
`draftsApi` import:

```tsx
export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let record;
  try {
    record = await workflowsApi.getRecord(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <TemplateEditor
      documentTitle={record.document.title}
      initialText={record.draft_text ?? ""}
      initialWorkflow={record.document}
      initialDraftId={record.draft_id}
      initialReviewStatus={record.review_status}
      initialVersion={record.version}
    />
  );
}
```

### 1.6 — Tests

Extend `unblock-ai-api/tests/integration/workflow.route.test.ts` (near the existing
`:224` record test):

1. `GET /workflows/:id/record` on a template **with** a draft → `draft_text` equals the
   draft's `raw_text`.
2. `GET /workflows/:id/record` on a template with `draft_id: null` → `draft_text` is `null`
   and the status is `200`.
3. `GET /workflows/:id/record` where `draft_id` points at a **deleted** draft → still
   `200`, `draft_text` is `null`. *(This is the regression guard for §1.3's behaviour
   change.)*
4. The existing `404 for an unknown workflow` test must still pass untouched.

### 1.7 — Gate

```bash
cd unblock-ai-api && npm run typecheck && npm test
cd ../unblock-ai-web && npm run typecheck && npm run build
```

### ✅ Phase 1 done when

- Opening a template shows **one** request to `/workflows/:id/record` in the Network tab and
  **zero** to `/drafts/:id`.
- The left panel still shows the original prose.
- A template whose draft was deleted still opens, with an empty left panel.

---

## Phase 2 — Defer the React Flow bundle

**Goal:** cut the JavaScript the detail page must parse before it can show anything.

**Why second:** `@xyflow/react` + dagre + the stylesheet is very likely the single largest
contributor to time-to-interactive on this page — larger than either fetch. But unlike
Phase 1 this is a **trade, not a pure win**, so it goes after the safe change.

### 2.0 — Measure first. Do not skip this.

```bash
cd unblock-ai-web && npm run build
```

Record the reported First Load JS for `/admin/templates/[id]`. **If the flowchart chunk is
not a meaningful share of it, stop and skip this phase** — you would be adding a loading
state for nothing.

### 2.1 — The honest trade

The flowchart is the **primary content** of the right-hand panel, not below-the-fold
decoration. Deferring it means:

- ✅ Faster first paint; the prose panel becomes usable sooner.
- ❌ The graph appears *later* than it does today.
- ❌ Layout shift when it mounts, unless the skeleton matches its box exactly.
- ❌ Must be `ssr: false` — React Flow measures the DOM — so the graph stops being
  server-rendered.

This is worth it **only** if §2.0 shows a real bundle cost.

### 2.2 — Implementation

`unblock-ai-web/src/components/admin/TemplateEditor.tsx`

Replace the static import with a dynamic one. `TemplateEditor` is already `"use client"`,
so `next/dynamic` with `ssr: false` is legal here:

```tsx
import dynamic from "next/dynamic";

/**
 * Deferred: React Flow measures the DOM, so it cannot server-render, and it is
 * the heaviest dependency on this route. The skeleton must match the panel box
 * so deferring it does not shift the layout when it mounts.
 */
const WorkflowFlowchart = dynamic(
  () => import("./flowchart/WorkflowFlowchart").then((m) => m.WorkflowFlowchart),
  { ssr: false, loading: () => <FlowchartSkeleton /> },
);
```

`FlowchartSkeleton` should reuse the existing `InertPlaceholder` geometry — that component
already renders a correctly-sized dashed placeholder inside the same panel, so lifting its
outer box gives a shift-free skeleton for free.

Leave the `NODE_TYPES` module-scope constant in `WorkflowFlowchart.tsx` exactly where it
is. Its comment explains that moving it remounts every node; dynamic import does not change
that.

### 2.3 — Gate

```bash
cd unblock-ai-web && npm run typecheck && npm run build
```

Compare First Load JS for the route against the §2.0 number.

### ✅ Phase 2 done when

- First Load JS for `/admin/templates/[id]` is measurably lower than the §2.0 baseline.
- The panel does not visibly jump when the graph appears.
- Pan/zoom, `fitView`, and the `StaleBanner` all still behave.

---

## Phase 3 — Fix list freshness *without* caching

**Goal:** make returning to the list feel instant **without** ever showing a stale
`review_status`.

**Why not caching:** see Finding 0.3. `revalidate` is inert while `client.ts` sends
`no-store`, and the staleness it would buy lands squarely on the Publish badge.

### 3.1 — The actual problem

After Publish, `TemplateEditor` updates its **local** `reviewStatus` state. The `/admin`
list page is a separate server component that re-fetches on navigation. The list is
therefore already correct — it is just paying a full server render on every visit.

### 3.2 — The change

`unblock-ai-web/src/components/admin/TemplateEditor.tsx`

Refresh the server-rendered tree after a successful mutation, so the cached RSC payload for
`/admin` is invalidated at the moment the data actually changed:

```tsx
import { useRouter } from "next/navigation";

const router = useRouter();

// inside publish(), after setVersion(summary.version):
router.refresh();
```

Keep `export const dynamic = "force-dynamic"` on both pages, and keep `cache: "no-store"`
in `client.ts`. **Do not touch either.** Their comments are load-bearing decisions.

### 3.3 — Explicitly out of scope

- Adding `revalidate` to `admin/page.tsx` — inert (Finding 0.3).
- Plumbing a cache option through `apiRequest` — touches every caller in the app for a
  benefit that only helps one page. Revisit only if list latency is measured and material.

### ✅ Phase 3 done when

- Publish → back to list shows the new badge with no manual reload.
- No stale `review_status` is ever observable.

---

## Phase 4 — Make "time to update a flowchart" legible

**Goal:** address the second half of the original question. The slow operation is the LLM
extraction, and it is **correctly** gated behind an explicit button — so this phase improves
how that wait is *communicated*, not how it is cached.

### 4.1 — What is already right (do not change it)

- `compiledFromText` tracks which prose the current graph came from.
- `deriveEditorState` yields `"edited"` when they diverge.
- `StaleBanner` tells the admin the graph is behind their edits instead of silently
  re-running an expensive call.
- Publish is disabled while `state === "edited"`, so a stale graph cannot be published.

That is the right trade-off and this plan preserves all of it.

### 4.2 — The gap

`isGenerating` renders a bare `"Compiling…"` label. Extraction is a multi-second LLM call
with a retry loop (the API returns an `attempts` count), and there is no progress signal —
so a slow compile is indistinguishable from a hung one.

### 4.3 — The change (UI only, no new network calls)

In `TemplateEditor.tsx`, while `isGenerating`:

- Show an indeterminate progress affordance in the right-hand panel, not just on the button.
- After ~8s still pending, add a line such as *"Still compiling — long workflows can take a
  little longer."* A single `setTimeout` behind the existing `useTransition` pending flag is
  enough; no polling.
- On success, surface `result.attempts` when `> 1` (e.g. *"Compiled after 2 attempts"*),
  since the API already returns it and it explains an unusually long wait.

### 4.4 — Explicitly out of scope

Making extraction itself faster (prompt size, model choice, streaming) is a backend concern
in `extraction.service.ts` and `extraction.prompt.ts`. It is the only lever that changes the
real number, and it deserves its own plan with its own quality gate — a faster extraction
that misreads an approval chain is a net loss.

### ✅ Phase 4 done when

- A long compile is visibly *in progress* rather than ambiguously frozen.
- Retry counts above 1 are surfaced.
- No new requests are issued during the wait.

---

## 5. Decision log — why the flowchart is not persisted

The original question asked whether to store the flowchart. **Deliberately not doing it.**

1. **The cost is not real.** dagre over a handful of nodes is sub-millisecond and already
   memoized. This is not where open-time goes; Phases 1 and 2 are.
2. **It introduces a staleness bug class that is currently structurally impossible.** Stored
   coordinates are a cache derived from the workflow JSON. Edit a step, add a dependency, or
   tune `NODE_WIDTH` / `ranksep` / `estimateNodeHeight`, and the cache silently
   misrepresents an approval chain. A stale flowchart is worse than a slow one.
3. **Node height depends on rendered content.** `estimateNodeHeight` exists precisely
   because `input` nodes grow with their bullet count. Freezing coordinates locks in
   estimates the renderer can drift away from.

**The one condition that reverses this:** if admins are ever allowed to **hand-position**
nodes, coordinates stop being a derived cache and become user data. At that point storing
them is *required*, and objection (2) dissolves because the stored positions are
authoritative rather than derived. Revisit this section then — not before.

---

## 6. Phase summary

| Phase | Change | Risk | Real payoff |
| --- | --- | --- | --- |
| 1 | One round-trip for the detail page | Low — one behaviour change, tested in §1.6 | Removes a serialised network hop |
| 2 | Defer React Flow bundle | Medium — perceived-perf trade, gated on §2.0 | Likely the largest TTI win |
| 3 | `router.refresh()` after publish | Low | Keeps freshness, drops a stale-badge risk |
| 4 | Compile progress feedback | Low — UI only | Removes "is it hung?" ambiguity |
| — | ~~Store flowchart coordinates~~ | — | Rejected, see §5 |
