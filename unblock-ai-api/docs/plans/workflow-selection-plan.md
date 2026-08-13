# Workflow Selection — Draft → Template → Retrieval → Selector

> Historical planning document. Paths and file names below predate the TypeScript restructure — see docs/architecture/folder-structure.md for the current layout.

> Phase 2 design. Covers the path from **admin submits a plain-English draft** to **system confidently identifies which workflow template the user's request refers to**, including clarifying questions.
>
> Scope boundary: this document stops at *"we know which template"*. Instantiating a task from the template, collecting inputs, and executing steps are the next phase.
>
> Related: [overview.md](./overview.md) (what exists today), [RAG_IMPLEMENTATION_GUIDE.md](./RAG_IMPLEMENTATION_GUIDE.md) and [RAG_MONGODB_AZURE_SEARCH.md](./RAG_MONGODB_AZURE_SEARCH.md) (policy-document RAG — a *different* retrieval problem, see §2).

---

## 1. The pipeline

```
ADMIN SIDE (write path, runs once per workflow)
──────────────────────────────────────────────
  Plain-English draft
        │
        ├──────────────────────────────► drafts collection        (raw text preserved)
        ▼
  Extraction (Azure OpenAI, unchanged)
        │  + NEW: retrieval_summary section
        ▼
  Schema + graph validation  ──► repair loop (unchanged)
        │
        ├──────────────────────────────► templates collection     (draft_id links back)
        ▼
  Render retrieval_summary → one string
        │
        ▼
  Embed (Gemini)  ───────────────────► vectors: one per template
                                        (+ workflow_id, version, aliases)

USER SIDE (read path, runs per request)
───────────────────────────────────────
  "I want to apply for overseas leave"
        │
        ▼
  Embed query (Gemini, RETRIEVAL_QUERY)
        │
        ▼
  Vector search → top-K candidates (K=5)
        │
        ├── + alias exact-match boost
        ▼
  SELECTOR LLM CALL  ──► { decision, workflow_id, question, candidates }
        │
        ├── matched   → hand off to instantiation
        ├── ambiguous → ask question → re-decide over SAME candidates ──┐
        └── no_match  → tell the user, offer to list what exists        │
                                     ▲                                  │
                                     └──────────────────────────────────┘
                                          (max 2 rounds)
```

The single most important structural point: **retrieval narrows, the LLM decides.** Cosine similarity is an uncalibrated signal and must never be the thing that picks a workflow on its own.

---

## 2. Two retrieval problems — do not conflate them

Your existing RAG docs describe chunking, and that is correct **for policies**. It is wrong here. These are separate systems that happen to both use embeddings.

| | **Workflow selection** (this doc) | **Policy retrieval** (later phase) |
|---|---|---|
| Corpus | 2–50 workflow templates | Many long policy PDFs |
| Retrieval unit | One whole template | One clause/passage |
| Chunking | **None** — 1 template = 1 vector | Yes — structure-aware |
| Question answered | "Which process does the user mean?" | "Does a clause modify this approval chain?" |
| Consumer | Selector Agent | Planner Agent |
| Failure mode | Wrong workflow selected | Missing/incorrect approval step |

Chunking a template would scatter one workflow across several vectors and force you to de-duplicate back to a template ID before you could do anything — pure cost, no benefit, at this corpus size.

---

## 3. `retrieval_summary` — a new schema section

Add to [src/schema/workflow.schema.json](./src/schema/workflow.schema.json) as a top-level required property. **Structured, not a prose blob** — a blob is unqueryable, untestable, and you cannot boost on parts of it.

```jsonc
"retrieval_summary": {
  "type": "object",
  "additionalProperties": false,
  "required": ["one_liner", "aliases", "keywords", "requester_types", "triggers", "not_for"],
  "properties": {
    // One sentence a requester would recognise. Plain language, no jargon.
    "one_liner":       { "type": "string" },

    // Exact names/codes people actually say. THE lexical escape hatch:
    // embeddings are bad at rare tokens like "AR-7" or "Faculty of IT".
    "aliases":         { "type": "array", "items": { "type": "string" } },

    // Everyday vocabulary, incl. informal phrasings a student would use.
    "keywords":        { "type": "array", "items": { "type": "string" } },

    // Who this applies to — mirrors scope.applies_to in words.
    "requester_types": { "type": "array", "items": { "type": "string" } },

    // Situations that should route here: "travelling abroad for a conference".
    "triggers":        { "type": "array", "items": { "type": "string" } },

    // NEGATIVE signal. The highest-value field, and the one an LLM
    // will not produce unless you ask for it explicitly.
    // e.g. "local leave", "student leave (staff workflow only)"
    "not_for":         { "type": "array", "items": { "type": "string" } }
  }
}
```

### Why `not_for` matters more than it looks

Your hardest real case (proposal Scenario A) is several near-identical overseas-leave workflows differing only by faculty. Positive descriptions of those are nearly identical, so their embeddings sit almost on top of each other and similarity cannot separate them. `not_for` is what makes them *distinguishable* — both in the embedding text and, more importantly, in what the selector LLM sees when it decides whether to ask a clarifying question.

### Prompt change

Add a `retrieval_summary` section to [src/llm/prompts/systemPrompt.js](./src/llm/prompts/systemPrompt.js), and add the field to both gold fixtures in [fixtures/expected/](./fixtures/expected) — they are few-shot examples *and* test data, so all three uses must stay consistent ([overview.md §12](./overview.md)).

Instruct explicitly:

- Write for **the requester's vocabulary, not the administrator's.** A student says "going abroad", the policy says "overseas leave of absence". Both belong in `keywords`.
- `not_for` must name the *sibling workflows this is most likely to be confused with*.
- Never invent an alias that does not appear in the draft.

> ⚠️ Adding a required property to the schema means every previously-saved template lacks it. Handle it: see §8.

### Rendering to embedding text

Deterministic, one place, used by both indexing and reindexing — the classic drift bug is rendering differently in two spots.

```js
// src/retrieval/renderSummary.js
export function renderForEmbedding(workflow) {
  const s = workflow.retrieval_summary;
  const line = (label, arr) => (arr?.length ? `${label}: ${arr.join(", ")}` : null);

  return [
    workflow.title,
    s.one_liner,
    line("Also known as", s.aliases),
    line("Applies to", s.requester_types),
    line("Use when", s.triggers),
    line("Keywords", s.keywords),
    line("Not for", s.not_for),
  ].filter(Boolean).join("\n");
}
```

Keep `title` first — it is the strongest single signal.

---

## 4. Storage (MongoDB)

Three collections. `drafts` and `templates` are the durable record; `templates` also carries the vector so selection is a single query with no cross-store consistency problem.

```js
// drafts — raw admin input, never mutated
{
  _id, raw_text, text_sha256,          // sha256 dedupes re-submission
  submitted_by,                         // when auth exists
  status: "pending" | "extracted" | "failed" | "rejected",
  failure_reason,                       // ExtractionError message
  created_at
}

// templates — mirrors FileWorkflowStore versioning semantics
{
  _id,
  workflow_id, version,                 // NOT unique alone; unique together
  draft_id,                             // ← the link you asked for
  title, description,
  institution_type,                     // lifted from scope for filtering
  schema_version, review_status,
  document,                             // the complete workflow JSON
  is_latest: true,

  retrieval: {
    text,                               // exactly what was embedded (debuggable)
    embedding: [ ... ],                 // 768 floats
    aliases_lower: [ ... ],             // lowercased, for exact-match boost
    model: "gemini-embedding-001",
    dim: 768,
    embedded_at
  },
  created_at
}

// selection_sessions — the clarifying-question loop + evaluation data
{
  _id, user_query, candidates: [{ workflow_id, score }],
  rounds: [{ question, answer }],
  outcome: "matched" | "abandoned" | "no_match",
  selected_workflow_id, created_at
}
```

**Indexes:**

```js
db.drafts.createIndex({ text_sha256: 1 }, { unique: true });
db.templates.createIndex({ workflow_id: 1, version: 1 }, { unique: true });
db.templates.createIndex({ workflow_id: 1, is_latest: 1 });
```

**Store `retrieval.text` verbatim.** When selection misbehaves the first question is always "what did we actually embed?" — without this you are guessing.

### Vector search

**Atlas** — use a `vectorSearch` index and `$vectorSearch`, filtered to `is_latest: true` and `review_status: "confirmed"`:

```js
db.templates.createSearchIndex({
  name: "template_vector_index",
  type: "vectorSearch",
  definition: {
    fields: [
      { type: "vector", path: "retrieval.embedding",
        numDimensions: 768, similarity: "cosine" },
      { type: "filter", path: "is_latest" },
      { type: "filter", path: "review_status" },
      { type: "filter", path: "institution_type" }
    ]
  }
});
```

**Local/self-hosted Mongo has no vector search.** Below ~200 templates this genuinely does not matter: load candidates and cosine-sort in Node. It is O(n) over a few hundred 768-float arrays — sub-millisecond, and it keeps the PoC runnable offline. Put it behind the same interface so Atlas is a swap:

```js
// src/retrieval/vectorStore.js — two impls, one interface
export class InMemoryVectorSearch { async search(queryVec, { k, filter }) { /* cosine over all */ } }
export class AtlasVectorSearch   { async search(queryVec, { k, filter }) { /* $vectorSearch */ } }
```

This mirrors the `WorkflowStore` / `FileWorkflowStore` split you already have in [src/knowledgeBank/store.js](./src/knowledgeBank/store.js).

---

## 5. Embeddings (Gemini)

| Setting | Value | Reason |
|---|---|---|
| Model | `gemini-embedding-001` | GA, stable, task-type support. `gemini-embedding-2` is preview and drops `taskType` in favour of prompt instructions — not worth the churn here. |
| `outputDimensionality` | `768` | MRL — 3072 is 4× the storage for no measurable gain on short summaries. Atlas vector indexes also cap at 4096, so stay well under. |
| Task type (indexing) | `RETRIEVAL_DOCUMENT` | |
| Task type (query) | `RETRIEVAL_QUERY` | |
| Normalization | **manual, required** | `gemini-embedding-001` does **not** auto-normalize when `outputDimensionality < 3072`. |

> ⚠️ **The normalization trap.** With `gemini-embedding-001`, truncated (non-3072) embeddings come back **unnormalized**. Cosine similarity on unnormalized vectors is wrong in a way that produces plausible-but-degraded rankings — no error, just quietly worse results. You must L2-normalize yourself, on **both** sides, before storing and before querying. (`gemini-embedding-2` auto-normalizes; `-001` does not.)

Asymmetric task types matter: `RETRIEVAL_QUERY` for a short question and `RETRIEVAL_DOCUMENT` for a descriptive summary are projected differently, which is exactly the short-query/long-document shape you have.

```js
// src/retrieval/embeddings.js
import { GoogleGenAI } from "@google/genai";

const ai  = new GoogleGenAI({ apiKey: config.gemini.apiKey });
const DIM = 768;

function l2normalize(v) {
  const n = Math.hypot(...v);
  return n === 0 ? v : v.map((x) => x / n);   // required for dim < 3072
}

async function embed(text, taskType) {
  const res = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: { taskType, outputDimensionality: DIM },
  });
  return l2normalize(res.embeddings[0].values);
}

export const embedDocument = (t) => embed(t, "RETRIEVAL_DOCUMENT");
export const embedQuery    = (t) => embed(t, "RETRIEVAL_QUERY");
```

Record `model` and `dim` on every row. The day you change either, every existing vector is invalid and must be rebuilt — you need to be able to detect that in a query rather than discover it through bad results.

### On Gemini for *extraction*

**Recommendation: don't, not in this phase.** Extraction currently passes `strictWorkflowSchema` straight into OpenAI structured output with `strict: true` ([extractWorkflow.js:43-50](./src/llm/extractWorkflow.js#L43-L50)). Gemini's structured output accepts a restricted OpenAPI-style schema subset and will **not** take `workflow.schema.json` as-is — `$defs`/`$ref`, `additionalProperties: false`, and some `anyOf` usage need rework. That is a real migration with real regression risk against a pipeline that currently works, and it buys this phase nothing.

Use Gemini where it is cheap and low-risk — **embeddings and the selector call**. Revisit extraction separately, behind a provider flag, with `tests/live/extractionAccuracy.test.js` as the gate.

Also confirm billing: a **Gemini Pro consumer subscription is not AI Studio API quota.** Get the key from `aistudio.google.com` and check the free-tier limits there.

---

## 6. The Selector Agent

Two stages. Retrieval narrows to 5; one LLM call decides.

### 6.1 Retrieve

```js
const qVec = await embedQuery(userQuery);
let candidates = await vectorStore.search(qVec, {
  k: 5,
  filter: { is_latest: true, review_status: "confirmed" },
});

// Cheap lexical boost — no BM25 index required.
const q = userQuery.toLowerCase();
candidates = candidates.map((c) => ({
  ...c,
  score: c.score + (c.aliases_lower.some((a) => q.includes(a)) ? 0.15 : 0),
})).sort((a, b) => b.score - a.score);
```

This is the pragmatic answer to your BM25 question. At 2–50 templates a full BM25 index is machinery you cannot yet justify; the failure it protects against is rare exact tokens, and `aliases` covers that directly. When the corpus grows, Atlas `$rankFusion` combines `$vectorSearch` with Atlas Search text scoring in one query — an upgrade, not a rewrite.

### 6.2 Decide

One call. Give the model the query and the **full structured summary** of each candidate (including `not_for`), and require structured output:

```jsonc
{
  "decision":      "matched" | "ambiguous" | "no_match",
  "workflow_id":   "string|null",     // when matched
  "confidence":    "high" | "medium" | "low",
  "question":      "string|null",     // when ambiguous — ONE question
  "options":       ["string"],        // user-facing labels for that question
  "reasoning":     "string"           // logged, never shown to the user
}
```

Prompt rules that matter:

- **You may only pick from the candidates given.** Never invent a `workflow_id`.
- If two candidates differ on one attribute (faculty, requester type), that difference **is** the question. Ask about the attribute — *"Which faculty are you in?"* — not *"Did you mean A or B?"*. The user knows their faculty; they do not know your workflow names.
- Ask **one** question at a time, with concrete options.
- If nothing genuinely fits, return `no_match`. Do not stretch to the nearest option — a wrong workflow is worse than an honest miss.
- `matched` with `low` confidence is not allowed; downgrade it to `ambiguous`.

Use Gemini here (`gemini-3.5-flash` — fast, cheap, structured output, and this schema is small and flat so none of the §5 schema-subset concerns apply).

### 6.3 The clarifying loop — the part your plan had backwards

Your draft plan re-ran similarity search after the user's answer. **Don't.** Appending "IT" to a 40-word query barely perturbs the embedding, and re-searching can *drop* the correct candidate that round one already found.

**The candidate set from round one is already correct — the ambiguity is about choosing within it.** So keep the candidates fixed and re-run only the decision:

```js
async function select(userQuery, session) {
  const candidates = session.candidates ?? await retrieve(userQuery);   // ONCE
  const transcript = [{ role: "user", text: userQuery }, ...session.rounds];

  let d = await decide(candidates, transcript);

  if (d.decision === "ambiguous" && session.rounds.length >= 2) {
    // Stop guessing; let the user choose explicitly.
    return { decision: "manual_choice", candidates };
  }
  return d;
}
```

Cap at **two** clarifying rounds, then fall back to showing the candidate list. Three questions to start a leave request is worse UX than a list of five titles.

---

## 7. Evaluation — build this early

Selection quality is not eyeball-able, and every prompt or summary tweak silently shifts it. A 30-line fixture file makes the difference between engineering and guessing.

`fixtures/selection/queries.json`:

```jsonc
[
  { "query": "I want to apply for overseas leave",
    "expect": "ambiguous", "expect_in_candidates": ["it_faculty_overseas_leave"] },
  { "query": "I'm in the IT faculty and going abroad for 2 weeks",
    "expect": "matched", "expect_workflow": "it_faculty_overseas_leave" },
  { "query": "need to book a hall for a workshop next month",
    "expect": "matched", "expect_workflow": "departmental_event_workshop" },
  { "query": "how do I reset my email password",
    "expect": "no_match" }
]
```

Track two numbers separately, because they fail for different reasons and have different fixes:

1. **Recall@5** — is the right template in the candidates? *Bad → fix `retrieval_summary` / embeddings.*
2. **Decision accuracy** — given good candidates, is the verdict right? *Bad → fix the selector prompt.*

Include `no_match` and near-miss cases. A selector that always finds *something* is the most common and most damaging failure mode, and a fixture set of only happy paths will never catch it.

---

## 8. Migration & operational notes

- **Backfill.** `retrieval_summary` becomes required, so every existing template fails validation. Write `scripts/backfillSummaries.js`: read each template, call the LLM for just the summary section, validate, save as a new version. Do this before flipping the schema to required.
- **Re-embed on every save.** A new version means a new summary means a stale vector. Embed inside the save path, not as a separate step someone forgets.
- **Only `confirmed` templates are selectable.** `review_status: "pending_admin_review"` must be filtered out of retrieval — an unreviewed extraction routing real approvals is exactly the trust failure the deterministic-engine design exists to prevent.
- **Log every selection** to `selection_sessions` including the losing candidates and scores. This is both your debugging trail and, after a few weeks, your real evaluation set.

---

## 9. Build order

Each step is independently verifiable; do not skip ahead.

| # | Step | Done when |
|---|---|---|
| 1 | `retrieval_summary` in schema + both gold fixtures + prompt | `npm test` passes; live extraction emits sensible summaries |
| 2 | Mongo `drafts` + `templates`, `MongoWorkflowStore` behind existing `WorkflowStore` interface | `tests/fileStore.test.js` equivalent passes against Mongo |
| 3 | Persist the draft in the extract route, link `draft_id` | Draft retrievable from a template |
| 4 | Gemini embeddings + `renderForEmbedding` + **normalization** | Vector stored; `retrieval.text` inspectable |
| 5 | `InMemoryVectorSearch`, top-K + alias boost | Recall@5 measured on fixtures |
| 6 | Selector LLM call, structured decision | Decision accuracy measured |
| 7 | Clarifying loop + `selection_sessions`, 2-round cap | Scenario A disambiguates by faculty end-to-end |
| 8 | `GET /api/workflows/select` endpoint | Full path callable over HTTP |
| 9 | Backfill script; Atlas vector index when corpus grows | Existing templates selectable |

Steps 1–3 are pure refactoring with no retrieval risk. The genuine unknowns are 5 and 6, and by then you have fixtures to measure them with.

---

## 10. Config additions

```bash
# .env.example
GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIM=768
GEMINI_SELECTOR_MODEL=gemini-3.5-flash

MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=unblock_ai
```

Add these to `REQUIRED_VARS` in [src/config/env.js](./src/config/env.js) only once the code paths that use them are live — the current fail-fast-at-startup behaviour is worth preserving.
