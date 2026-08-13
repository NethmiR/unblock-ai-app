# RAG with MongoDB + Azure AI Search — Architecture & Trade-offs

> Historical planning document. Paths and file names below predate the TypeScript restructure — see docs/architecture/folder-structure.md for the current layout.

> Companion to [RAG_IMPLEMENTATION_GUIDE.md](./RAG_IMPLEMENTATION_GUIDE.md), which specs the same pipeline on Postgres + pgvector. This document answers: **what changes if we use MongoDB as the document store and Azure AI Search as the vector database?**
>
> Short answer: it is a **legitimately good fit** — arguably better than Postgres on two axes (schema fit, retrieval quality out of the box) and worse on one that matters (consistency between the two stores). This document is about managing that one weakness.

---

## 1. How each piece maps onto the pipeline

The pipeline shape does not change. What changes is **who owns which stage**.

```
POST /api/workflows/extract
  │
  ├─► MongoDB  `drafts`     ── raw plain text, sha256, status
  │                                     │
  ├─► extractWorkflow(text)             │ draftId
  │      (unchanged)                    ▼
  │                          MongoDB  `workflow_templates`
  │                          workflow_id, version, document (native BSON)
  │                                     │
  └─► indexWorkflow(template)           │  SYSTEM OF RECORD
             │                          │
             ├─ chunkWorkflow()  ───────┘
             ├─ embedBatch()      Azure OpenAI text-embedding-3-small
             └─ uploadDocuments() ─────► Azure AI Search index `workflow-chunks`
                                          DERIVED — rebuildable from Mongo
─────────────────────────────────────────────────────────────────────────
POST /api/rag/query
  │
  ├─ Azure AI Search: hybrid (BM25 + vector) + semantic reranker  ← ONE call
  ├─ hydrate parent templates from MongoDB by workflow_id
  └─ Azure OpenAI chat completion → { answer, citations[] }
```

**The single most important rule in this architecture:**

> **MongoDB is the system of record. Azure AI Search is a derived index.**
> Anything in Search must be reconstructible from Mongo by re-running the chunker. Never store a fact only in Search.

Get this right and every consistency problem below degrades to "retrieval is briefly stale," which is recoverable by reindexing. Get it wrong and you have unrecoverable data loss in a search index that was never designed to be a database.

---

## 2. Role of each technology

| Stage | Owner | Notes |
|---|---|---|
| Draft text storage | **MongoDB** | `drafts` collection, unique index on `text_sha256` |
| Template storage + versioning | **MongoDB** | `workflow_templates`, unique compound index on `(workflow_id, version)` |
| Chunking | **Your code** | Unchanged from the Postgres guide — §4 of that document applies verbatim |
| Embedding | **Azure OpenAI** | Unchanged. Or hand off to Search's built-in vectorizer (§6) |
| Vector storage + ANN search | **Azure AI Search** | HNSW, managed |
| Keyword search | **Azure AI Search** | BM25, built in — no `tsvector` to maintain |
| Hybrid fusion | **Azure AI Search** | RRF **built in** — you do not implement it |
| Reranking | **Azure AI Search** | Semantic reranker, a genuine differentiator (§4) |
| Answer generation | **Azure OpenAI** | Unchanged |

---

## 3. Where MongoDB is a better fit than Postgres

**Your documents are already JSON, and deeply nested.** The workflow schema is an 11-key document with nested `scope.applies_to.constraints[]`, `steps[].outcomes.approved.notify[]`, and so on. In Postgres this lives in a `JSONB` column — workable, but you are storing a document in a relational engine and reaching for JSON operators every time you query it. Mongo stores it natively. `IMPLEMENTATION_PLAN.md:149` already flagged this ("Stores natively in MongoDB/Postgres JSONB").

**Schema evolution is free.** `schema_version` exists in your schema, implying it will change. Mongo needs no migration to hold v1 and v2 documents side by side.

**Queries read naturally against your actual shape.** The `list({ institution_type })` filter at [fileStore.js:96](src/knowledgeBank/fileStore.js#L96) — which currently loads *every* workflow and filters in JavaScript — becomes:

```js
db.workflow_templates.find({ is_latest: true, "document.scope.institution_type": "university" })
```

with an index on that dotted path. Compare the Postgres equivalent: `document->'scope'->>'institution_type'` plus an expression index. Mongo wins on readability here, and the enum is small and fixed (`university`, `school`, `company`, `hospital`, `government`, `other` — confirmed in [workflow.schema.json](src/schema/workflow.schema.json)), so the index is highly effective.

**If you use Azure Cosmos DB for MongoDB (vCore), you also get vector search** in the same store — which collapses the two-store problem entirely. See §7; this is a real option worth considering.

---

## 4. Where Azure AI Search genuinely beats pgvector

This is the strongest argument for this stack, and it is not a small one.

**1. Hybrid search and RRF are built in.** In the Postgres guide I hand-wrote a 25-line CTE implementing Reciprocal Rank Fusion over a vector CTE and a `tsvector` CTE, and flagged that naively summing cosine distance and `ts_rank` is a classic bug. Azure AI Search does hybrid retrieval with RRF **as a single query parameter**. That entire class of bug disappears.

**2. The semantic reranker.** This is the real differentiator. Azure AI Search can rerank the top ~50 hybrid results with a cross-encoder — a model that reads *query and document together*, rather than comparing two independently-computed vectors. Cross-encoders substantially outperform bi-encoder similarity on relevance. In the Postgres design I listed reranking as "phase 2, LLM-as-reranker, skip in v1" precisely because there is no good managed option. Here it is a flag.

For your data this matters more than usual. Your chunks are **structurally near-identical** — every workflow has an approval step assigned to a role with dependencies and three outcomes. Embeddings of "Head of Department Review" across five different workflows will sit very close together in vector space. A bi-encoder struggles to separate them; a cross-encoder that reads the query alongside each candidate does much better.

**3. Rich filter syntax over `filterable` fields**, combined with vector search in one query — no post-filtering, no fetch-more-then-discard.

**4. Managed.** No HNSW parameter tuning, no index-opclass footgun (the `vector_cosine_ops`/`<=>` mismatch from §10 of the Postgres guide simply cannot occur).

---

## 5. The cost: two stores, no shared transaction

This is the whole trade-off, and it is worth being blunt.

Postgres + pgvector writes the template and its chunk vectors **in one transaction**. Either both land or neither does. MongoDB and Azure AI Search are separate services over the network: **there is no transaction spanning them.** You can now have a template in Mongo with no chunks in Search, or chunks in Search whose template was rolled back.

Mongo's own multi-document transactions do not help — they cover Mongo only.

### The failure that actually bites

```js
await mongo.insertOne(template);        // ✅ succeeds
await search.uploadDocuments(chunks);   // ❌ throttled (503) — request dies here
```

The template is saved and visible via `GET /api/workflows/:id`. It is invisible to RAG. **Nothing anywhere reports an error.** The user sees a successful save; retrieval quietly never returns that workflow. This is exactly the silent-drift failure I warned about in the Postgres guide — with this stack you cannot design it away, so you must **make it observable and repairable.**

### The mitigation: outbox + reconciliation

Make indexing state explicit **in Mongo**, so drift is always detectable by querying the system of record alone.

```js
// In the template document:
{
  workflow_id: "overseas_leave_it_undergrad",
  version: 3,
  is_latest: true,
  document: { /* full workflow JSON */ },
  index_state: {
    status: "pending",       // pending | indexed | failed
    chunk_count: null,
    indexed_at: null,
    last_error: null,
    attempts: 0
  }
}
```

**Write order matters — always Mongo first:**

1. Insert template with `index_state.status: "pending"`. Mongo is the system of record; it must be durable before anything derived exists.
2. Chunk + embed + upload to Search.
3. On success → `status: "indexed"`, set `chunk_count` and `indexed_at`.
4. On failure → `status: "failed"`, record `last_error`, increment `attempts`. **Do not fail the HTTP request** — the template *was* saved. Return `201` with an honest `indexing: "pending"` in the body.

Then two safety nets:

- **Reconciliation sweep** — a periodic job querying `{ "index_state.status": { $in: ["pending", "failed"] } }` and retrying. Because chunking is deterministic and uploads are idempotent (see below), retry is always safe. This single query is your drift detector.
- **Health endpoint** — `GET /api/admin/index-health` returning counts by status. Non-zero `failed` means retrieval is incomplete. Without this, drift is invisible until a user notices a missing workflow.

**Make uploads idempotent** by deriving the Search document key deterministically:

```js
const chunkKey = (workflowId, version, chunkType, stepId) =>
  Buffer.from(`${workflowId}:${version}:${chunkType}:${stepId ?? "_"}`)
        .toString("base64url");   // Search keys: letters, digits, _ - = only
```

With `mergeOrUpload`, re-running a partially-failed index overwrites the same keys instead of creating duplicates. Retry becomes free of consequence. ⚠️ Azure AI Search restricts key characters — `base64url` is safe; plain `base64` is not (`+` and `/` are rejected).

---

## 6. Azure AI Search index definition

```js
const index = {
  name: "workflow-chunks",
  fields: [
    { name: "id",           type: "Edm.String", key: true },
    { name: "workflow_id",  type: "Edm.String", filterable: true, facetable: true },
    { name: "version",      type: "Edm.Int32",  filterable: true },
    { name: "template_oid", type: "Edm.String", filterable: true },   // Mongo _id
    { name: "is_latest",    type: "Edm.Boolean", filterable: true },
    { name: "chunk_type",   type: "Edm.String", filterable: true, facetable: true },
    { name: "step_id",      type: "Edm.String", filterable: true },
    { name: "title",        type: "Edm.String", searchable: true },
    { name: "institution_type", type: "Edm.String", filterable: true, facetable: true },
    { name: "actor_type",   type: "Edm.String", filterable: true },
    { name: "content",      type: "Edm.String", searchable: true, analyzer: "en.microsoft" },
    {
      name: "content_vector", type: "Collection(Edm.Single)",
      searchable: true, dimensions: 1536,
      vectorSearchProfile: "hnsw-cosine"
    }
  ],
  vectorSearch: {
    algorithms: [{ name: "hnsw-alg", kind: "hnsw",
                   hnswParameters: { m: 4, efConstruction: 400, metric: "cosine" } }],
    profiles: [{ name: "hnsw-cosine", algorithm: "hnsw-alg" }]
  },
  semantic: {
    configurations: [{
      name: "workflow-semantic",
      prioritizedFields: {
        titleField: { fieldName: "title" },
        prioritizedContentFields: [{ fieldName: "content" }]
      }
    }]
  }
};
```

Notes:

- `content` is the **prose** from the structure-aware chunker — §4 of the Postgres guide applies unchanged. Feeding raw JSON here is just as wrong as it was there; BM25 will additionally match on JSON keys and `null`, which is worse than useless.
- Lift `institution_type` and `actor_type` onto every chunk. Denormalization is correct here: it enables filtering without a round-trip to Mongo.
- `is_latest` must be filterable, and **must be updated on superseded chunks** when a new version indexes — otherwise old versions compete with current ones in retrieval.
- The semantic configuration is what enables the reranker.

### Retrieval — one call replaces the CTE

```js
const results = await searchClient.search(question, {
  vectorSearchOptions: {
    queries: [{
      kind: "vector", fields: ["content_vector"],
      vector: await embedOne(question), kNearestNeighborsCount: 50
    }]
  },
  queryType: "semantic",                       // ← cross-encoder reranker
  semanticSearchOptions: { configurationName: "workflow-semantic" },
  filter: institutionType
    ? `is_latest eq true and institution_type eq '${institutionType}'`
    : "is_latest eq true",
  top: 6,
  select: ["workflow_id", "version", "title", "chunk_type", "step_id", "content"]
});
```

Passing both a text query and a vector triggers hybrid search with automatic RRF; `queryType: "semantic"` layers the reranker on top. That single call replaces the entire hand-written CTE from the Postgres guide.

⚠️ **The filter is OData, and string-interpolating user input into it is an injection risk.** `institution_type` is a closed enum — validate against it rather than interpolating freely.

### Optional: integrated vectorization

Azure AI Search can call your Azure OpenAI embedding deployment itself, at both index and query time, so you upload `content` and never handle vectors. Tempting, and it removes the "sort by `index`" bug class from the Postgres guide.

I would **not** use it here. You control chunking tightly and will iterate on it; keeping embedding in your code keeps that loop fast, makes the stub-embedder testing strategy (§8) possible, and avoids an extra managed dependency in your hottest path. Revisit once the chunker stabilizes.

---

## 7. A third option worth serious consideration: Cosmos DB for MongoDB (vCore)

If the two-store consistency problem is the main objection to this stack — and it should be — **Azure Cosmos DB for MongoDB vCore supports native vector search** (DiskANN/HNSW) in the same database.

That gives you:
- Mongo's document model and wire protocol (the same driver and query code)
- Vectors in the **same document as the template**, so template + embedding commit together
- One Azure service instead of two, one bill, one identity

You give up the semantic reranker and BM25 hybrid fusion — the two strongest reasons to pick Azure AI Search. So the decision reduces to a clean question:

> **Is retrieval quality (Search) worth more than write consistency (Cosmos vCore)?**

For a knowledge bank where a stale index self-heals on the next reconciliation sweep, and where chunks are structurally near-identical and therefore hard to rank, **retrieval quality is usually worth more**. But if your team is small and you want fewer moving parts, Cosmos vCore is a defensible and materially simpler answer.

---

## 8. What changes in your code

The good news: **less than you would expect**, because [src/knowledgeBank/store.js](src/knowledgeBank/store.js) already abstracts persistence.

| File | Change |
|---|---|
| [src/knowledgeBank/store.js](src/knowledgeBank/store.js) | **None** — the interface holds |
| [src/api/routes.js](src/api/routes.js) | Only the draft-persistence change from §5/§9 of the Postgres guide |
| [src/index.js](src/index.js#L10) | One line: `new MongoWorkflowStore(...)` |
| [src/llm/](src/llm/) | **None** |
| [src/validation/](src/validation/) | **None** |
| [src/rag/chunker.js](src/rag/chunker.js) | **Identical** to the Postgres design — it is pure functions over the workflow document |
| `src/rag/searchIndex.js` | **New** — index management + upload |
| `src/rag/retriever.js` | **Simpler** than Postgres — one SDK call, no CTE |
| `src/knowledgeBank/mongoStore.js` | **New** — implements `WorkflowStore` |

```bash
npm install mongodb @azure/search-documents
```

`MongoWorkflowStore.save()` still returns `{ id, version }`, matching [fileStore.js:75](src/knowledgeBank/fileStore.js#L75), so [routes.js:38](src/api/routes.js#L38) needs no edit. Keep `FileWorkflowStore` for the offline test tier.

### Required Mongo indexes

```js
db.drafts.createIndex({ text_sha256: 1 }, { unique: true });
db.workflow_templates.createIndex({ workflow_id: 1, version: 1 }, { unique: true });
db.workflow_templates.createIndex({ workflow_id: 1, is_latest: 1 });
db.workflow_templates.createIndex({ "index_state.status": 1 });          // reconciliation sweep
db.workflow_templates.createIndex({ "document.scope.institution_type": 1, is_latest: 1 });
```

The unique compound index on `(workflow_id, version)` is what protects version numbering under concurrency. ⚠️ Mongo has no `SELECT ... FOR UPDATE`; the read-max-then-insert pattern from the Postgres guide **races** here. Either use `findOneAndUpdate` on a counter document (atomic), or catch the duplicate-key error (code `11000`) and retry. Do not skip this — two concurrent saves of the same `workflow_id` is a realistic scenario the moment there is a UI.

### Testing

Same two-tier split. The chunker tests are unchanged (pure functions, no I/O). For store tests, `mongodb-memory-server` gives you a real Mongo in-process with no Docker — genuinely convenient.

There is no equivalent local emulator for Azure AI Search. Define a narrow `VectorIndex` interface (`upsert`, `search`, `deleteByTemplate`) and supply an in-memory implementation for tests, with the Azure one used live. This also keeps the door open to swapping in Cosmos vCore (§7) without touching the retriever.

---

## 9. Head-to-head

| Dimension | Postgres + pgvector | MongoDB + Azure AI Search |
|---|---|---|
| Write consistency | ✅ **Single transaction** | ❌ Two services — needs outbox + reconciliation |
| Document-model fit | 🟡 JSONB, workable | ✅ **Native** |
| Hybrid search | ❌ Hand-written RRF CTE | ✅ **Built in** |
| Reranking | ❌ Roll your own | ✅ **Semantic reranker** — significant for your near-identical chunks |
| Ops burden | 🟡 Self-managed | ✅ Fully managed |
| Local dev | ✅ One container | ❌ No local Search emulator |
| Azure alignment | 🟡 Neutral | ✅ Same cloud, same identity |
| Cost at your scale | ✅ Container cost | 🟡 Search Basic ~$75/mo (free tier: 3 indexes, 50 MB) |
| Failure mode | Fails loudly | **Fails silently** unless you build §5 |
| Code volume | More retrieval code | Less retrieval code, more sync code |

**Honest summary:** Azure AI Search gives you a better retrieval engine and less retrieval code, at the price of a consistency problem you must engineer around. Postgres gives you correctness for free and asks you to write the retrieval logic yourself.

---

## 10. Recommendation

**If you are deploying on Azure and retrieval quality is the priority — use MongoDB + Azure AI Search**, and treat §5 as non-optional. The semantic reranker is a real advantage for this specific dataset, precisely because your chunks are so structurally similar that pure vector similarity struggles to separate them.

**If you want the simplest correct system — use Postgres + pgvector** as originally specified. One store, one transaction, no drift.

**If you want the document model without the drift risk — use Cosmos DB for MongoDB vCore** (§7) and accept weaker ranking.

Whichever you choose, three things are invariant:

1. **The structure-aware chunker is the same code** in all three, and it is still the highest-leverage decision. Build and eyeball it before wiring any store.
2. **`WorkflowStore` stays the seam.** Every option is a one-line swap at [index.js:10](src/index.js#L10).
3. **The draft-persistence change** ([routes.js:20](src/api/routes.js#L20) currently discards `text`) is store-independent — do it first, in any scenario.

### If you go with this stack, build in this order

| Phase | Deliverable |
|---|---|
| 1 | Mongo + `MongoWorkflowStore` + drafts, **no vectors** — swap in at `index.js` |
| 2 | Chunker + offline tests — **read the prose output before embedding anything** |
| 3 | Search index creation + upload, `index_state` written from the start |
| 4 | Retrieval endpoint (`/api/rag/search`, no LLM) — evaluate relevance in isolation |
| 5 | Reconciliation sweep + `/api/admin/index-health` |
| 6 | Answer generation (`/api/rag/query`) |

Phase 5 before phase 6 is deliberate. Drift starts the moment phase 3 ships, and an LLM answering from a silently incomplete index produces confident, wrong answers — the hardest failure mode to notice and the most damaging to trust in the system.

---

## 11. Configuration additions

```
# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=unblock_ai

# Azure AI Search
AZURE_SEARCH_ENDPOINT=https://<service>.search.windows.net
AZURE_SEARCH_API_KEY=
AZURE_SEARCH_INDEX=workflow-chunks

# Azure OpenAI embeddings (same resource you already use)
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

Add these to [src/config/env.js](src/config/env.js) following its existing `REQUIRED_VARS` pattern — and re-read the warning from the Postgres guide: making them **required** means the app will not boot without Mongo and Search, including for `npm test`. Decide that deliberately.

Prefer **managed identity** over `AZURE_SEARCH_API_KEY` in any deployed environment; the API key is here for local development convenience.
