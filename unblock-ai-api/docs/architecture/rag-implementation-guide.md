# RAG Pipeline Implementation Guide — UNBLOCK-AI

> Historical planning document. Paths and file names below predate the TypeScript restructure — see docs/architecture/folder-structure.md for the current layout.

> **Goal:** persist both the original plain-text **draft** and the extracted **workflow template**, index the template into a **vector database**, and use that index as a **RAG retrieval layer** over the workflow knowledge bank.
>
> This guide is written against the codebase as it exists on branch `dev` (see [overview.md](./overview.md)). Every recommendation names the *actual* file it touches.

---

## 1. Where the current code stands

Three facts drive every decision below.

**Fact 1 — the draft is currently discarded.** In [src/api/routes.js:20](src/api/routes.js#L20), `POST /api/workflows/extract` calls `extractWorkflow(text)` and returns the result. The `text` variable goes out of scope and is never written anywhere. There is no `draft_id`, and nothing links a saved template back to the prose that produced it.

**Fact 2 — extraction and persistence are separate HTTP calls.** `POST /workflows/extract` does not persist; `POST /workflows` persists a workflow the client hands back. So the draft text is not even in scope at save time. Any draft↔template link has to be threaded through the client, or the two operations have to be joined server-side. (Section 5 recommends the latter, with the former as a compatible fallback.)

**Fact 3 — there is already a correct abstraction seam.** [src/knowledgeBank/store.js](src/knowledgeBank/store.js) defines an abstract `WorkflowStore` (`save`/`getById`/`list`/`search`/`update`), and [src/index.js:10](src/index.js#L10) injects a concrete `FileWorkflowStore` into `createRoutes(store)`. **Do not bypass this seam.** Every piece of new storage below should either implement this interface or be injected the same way. This is the single most important structural constraint in the whole design — it is why this change stays additive rather than invasive.

Also note `store.search(query)` ([fileStore.js:109](src/knowledgeBank/fileStore.js#L109)) is a case-insensitive substring match over title/description only, and **no HTTP route exposes it**. That is your existing "retrieval," and it is the thing RAG replaces.

---

## 2. Recommended stack

### 2.1 Summary table

| Concern | Recommendation | Why this one |
|---|---|---|
| **Relational / document store** (drafts + templates + link) | **PostgreSQL 16** | You need a real DB anyway (overview §13 lists "no database" as a known gap). `JSONB` stores the workflow document without flattening the graph schema; `tsvector` gives you keyword search for hybrid retrieval for free; foreign keys enforce the draft↔template link. |
| **Vector database** | **pgvector** (Postgres extension) | Keeps vectors in the *same* database and the *same* transaction as the template. No dual-write consistency problem — the single hardest bug class in RAG systems. Handles 10k–1M chunks comfortably, far beyond your scale. |
| **Vector DB (alternative)** | Qdrant | Only if you outgrow pgvector or need multi-tenant collection isolation. Costs you the transactional guarantee. |
| **Embeddings** | **Azure OpenAI `text-embedding-3-small`** (1536-dim) | You already have an Azure OpenAI resource, credentials, and a configured client ([azureClient.js](src/llm/azureClient.js)). Adding a second *deployment* to the same resource means **zero new vendors, zero new secrets**. Use `-large` (3072-dim) only if retrieval quality measurably falls short. |
| **DB driver** | `pg` (node-postgres) | Plain SQL. Your data access is ~8 queries; an ORM is overhead here. |
| **Migrations** | `node-pg-migrate` | Plain-SQL up/down migrations, no ORM buy-in. |
| **Local infra** | Docker Compose → `pgvector/pgvector:pg16` | One container, extension pre-installed. |
| **Reranking** *(phase 2)* | Azure OpenAI LLM-as-reranker | You have no reranker endpoint; a cheap `gpt-4o-mini` scoring pass over top-20 is a pragmatic substitute. Skip in v1. |
| **Chunking** | **Custom, structure-aware** (see §4) | ⚠️ **Do not use a generic text splitter here.** Your templates are strict JSON graphs, not prose. This is the highest-leverage decision in the guide. |
| **Framework** | **None** — write it directly | LangChain/LlamaIndex would add a large dependency to replace ~200 lines. Your schema is custom, your chunking is custom, your LLM client already exists. A framework buys you nothing and obscures the retrieval logic you will need to tune. |

### 2.2 On not using a RAG framework

This is worth stating explicitly because it is a common default. The pipeline you need is: chunk → embed → upsert → query-embed → search → assemble prompt. Each step is 20–40 lines against the SDK you already use. A framework's value is in adapters for stores and models you *don't* have and format-handling for documents you *don't* have — you have one Azure client and one strict JSON schema. Adopting one here means learning its abstractions, fighting its chunkers to respect your graph structure, and pinning a fast-moving dependency. Write it directly.

### 2.3 Why one database and not two

The tempting alternative is "keep the file store, add a standalone vector DB." Reject it. The failure mode is *silent index drift*: a template saves successfully, the vector upsert fails or lands late, and retrieval quietly serves stale or missing content with no error anywhere. With pgvector, the template row and its chunk rows commit in **one transaction** — they are consistent by construction, not by convention. At your scale the performance argument for a dedicated vector DB does not apply, so you would be paying a real correctness cost for a benefit you cannot yet use.

---

## 3. Target architecture

```
POST /api/workflows/extract                 (persist draft + template + index)
  │
  ├─► drafts table ──────────────► id, raw_text, sha256, status
  │                                        │
  ├─► extractWorkflow(text)                │ draft_id FK
  │      (unchanged)                       ▼
  │                              workflow_templates
  │                              id, workflow_id, version, document JSONB
  │                                        │
  └─► indexWorkflow(template) ─────────────┘
             │
             ├─ chunkWorkflow()   structure-aware → 4–12 chunks
             ├─ embedBatch()      Azure text-embedding-3-small
             └─ INSERT workflow_chunks (embedding vector(1536))
                        ▲
                        │  ← ALL IN ONE TRANSACTION
─────────────────────────────────────────────────────────────
POST /api/rag/query
  │
  ├─ embed(question)
  ├─ hybrid search: vector (cosine) + keyword (tsvector), RRF-fused
  ├─ assemble context (top-K chunks + parent template metadata)
  └─ Azure chat completion → { answer, citations[] }
```

---

## 4. Chunking strategy — the most important design decision

### 4.1 Why generic chunking fails here

A generic 512-token splitter over `JSON.stringify(workflow)` produces chunks like:

```json
"resolution": "dynamic", "role": "academic_advisor", "relative_to": "requester",
"directory_query": "Assigned academic advisor for the student index number.",
"fallback_role": "head_of_department", "display_name": null }, "depends_on": [],
```

This is near-useless to embed. It is mostly syntax and `null` padding (your schema mandates every key be present — [overview.md §5](./overview.md), "strict-mode discipline"), it splits mid-object, and it carries no statement of *meaning*. A user asking *"which workflows need Dean approval for long trips?"* will not match it.

### 4.2 Structure-aware chunking

Instead, **serialize each semantic unit into natural-language prose**, then embed that. The workflow graph gives you natural unit boundaries.

Produce these chunk types per template:

| `chunk_type` | Count | Content |
|---|---|---|
| `summary` | 1 | Title, description, institution type, who it applies to, step count, ordered step names |
| `scope` | 1 | `scope.applies_to.actor_type` + constraints rendered as prose |
| `step` | 1 per step | Step name, type, description, assignee role and resolution mode, dependencies **by step name**, condition in prose, outcome behaviours |
| `inputs` | 1 | Requester-supplied fields, types, requiredness |
| `completion` | 1 | Completion rule + actions (reference number format, notifications) |

That is ~4–12 chunks per workflow — small, and each one independently meaningful.

### 4.3 Worked example

From [fixtures/expected/it_faculty_overseas_leave.json](fixtures/expected/it_faculty_overseas_leave.json), the `advisor_review` step should render to roughly:

> **Workflow: Overseas Leave Request for IT Undergraduate Students.**
> Step 1 of 3: "Academic Advisor Review" (approval step).
> Initial review by the student's academic advisor.
> Assigned to: the requester's academic advisor, resolved dynamically from the directory, falling back to the head of department.
> This step has no dependencies and starts automatically.
> If approved, the workflow continues. If rejected, the workflow terminates and the requester is notified with a reason. If more information is requested, the step reopens for the requester.

Every retrieval-relevant fact is present, in prose, with **no JSON syntax and no nulls**. Two details matter and are easy to get wrong:

- **Prefix each chunk with the workflow title.** A step chunk retrieved alone must still say what workflow it belongs to, or the LLM will attribute it wrongly when several workflows appear in one context window.
- **Resolve `depends_on` step *IDs* to step *names*.** The raw ID `hod_review` embeds poorly; "Head of Department Review" matches a user's natural phrasing.

Keep the raw JSON of the unit in a `raw_json` column alongside the prose. You embed the prose; you can return the exact structure when the caller needs it.

---

## 5. Persisting the draft — the API decision

Section 1, Fact 2 is the wrinkle: extraction and saving are separate calls, so at `POST /workflows` time the server no longer has the draft text.

**Recommended: persist the draft inside `/extract`, and return its id.**

`POST /api/workflows/extract` writes the draft row *before* calling the LLM (so failed extractions are still recorded — valuable for debugging prompt regressions), then returns `draft_id` alongside the workflow. The client passes that `draft_id` back to `POST /api/workflows`, which stores it as a foreign key on the template row.

This gives you, for free:
- a record of extractions that **failed** — the current code loses these entirely
- deduplication by `sha256(text)` — the same draft submitted twice is one row
- the full audit chain *draft → template v1 → v2 → …*, since `save()` already versions ([fileStore.js:66](src/knowledgeBank/fileStore.js#L66))

`draft_id` should be **optional** on `POST /workflows` so hand-authored workflows (which have no draft) still save — and so the existing route tests in [tests/routes.test.js](tests/routes.test.js) keep passing unchanged.

Optionally add `POST /api/workflows/extract-and-save?autosave=true` to do all three steps in one call for the common admin path.

---

## 6. Database schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. The plain-text draft, exactly as submitted
CREATE TABLE workflow_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text        TEXT        NOT NULL,
  text_sha256     CHAR(64)    NOT NULL UNIQUE,   -- dedupe identical submissions
  submitted_by    TEXT,                          -- fill in when auth exists
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','extracted','failed','rejected')),
  failure_reason  TEXT,                          -- ExtractionError message when failed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. The extracted template. Mirrors FileWorkflowStore's versioning semantics.
CREATE TABLE workflow_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       TEXT        NOT NULL,        -- workflow.workflow_id (NOT unique: versioned)
  version           INT         NOT NULL,
  draft_id          UUID        REFERENCES workflow_drafts(id) ON DELETE SET NULL,
  title             TEXT        NOT NULL,
  description       TEXT        NOT NULL,
  institution_type  TEXT,                        -- lifted from scope for cheap filtering
  schema_version    TEXT        NOT NULL,
  review_status     TEXT        NOT NULL,        -- metadata.review_status
  document          JSONB       NOT NULL,        -- the complete workflow JSON
  is_latest         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version)
);

CREATE INDEX ON workflow_templates (workflow_id) WHERE is_latest;
CREATE INDEX ON workflow_templates USING GIN (document jsonb_path_ops);

-- 3. Embedded chunks. ON DELETE CASCADE => reindexing is just delete + insert.
CREATE TABLE workflow_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  workflow_id  TEXT NOT NULL,
  chunk_type   TEXT NOT NULL,          -- summary | scope | step | inputs | completion
  step_id      TEXT,                   -- set when chunk_type='step'
  content      TEXT NOT NULL,          -- the prose that gets embedded
  raw_json     JSONB,                  -- exact source structure for this unit
  token_count  INT,
  embedding    VECTOR(1536) NOT NULL,  -- text-embedding-3-small
  content_tsv  TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow_chunks USING GIN (content_tsv);
CREATE INDEX ON workflow_chunks (template_id);
```

### 6.1 The vector index — a real trap

```sql
CREATE INDEX workflow_chunks_embedding_idx
  ON workflow_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

⚠️ **`vector_cosine_ops` must match the distance operator in your query (`<=>`).** If you build the index with `vector_l2_ops` but query with `<=>`, **Postgres silently ignores the index and does a sequential scan.** You get correct results and quietly terrible performance — no error, no warning. This is the single most common pgvector misconfiguration.

Also: only build the HNSW index once you have a few hundred chunks. Below that, sequential scan is genuinely faster and the index just adds write cost.

---

## 7. Step-by-step implementation

### Step 1 — Infrastructure

`docker-compose.yml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: unblock
      POSTGRES_PASSWORD: unblock
      POSTGRES_DB: unblock_ai
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
volumes:
  pgdata:
```

```bash
docker compose up -d
npm install pg node-pg-migrate
```

**Verify before proceeding:**
```bash
docker compose exec postgres psql -U unblock -d unblock_ai -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname='vector';"
```

### Step 2 — Provision the embedding deployment

In Azure AI Foundry, on the **same** OpenAI resource you already use, create a deployment of `text-embedding-3-small`. Note the deployment name.

### Step 3 — Extend configuration

[src/config/env.js](src/config/env.js) validates required vars at startup and throws on missing ones. Extend it in the same style:

```js
const REQUIRED_VARS = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_API_VERSION",
  "DATABASE_URL",                        // new
  "AZURE_OPENAI_EMBEDDING_DEPLOYMENT",   // new
];
```

Add to the returned config object:

```js
database: { url: process.env.DATABASE_URL },
embedding: {
  deployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  dimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 1536,
},
rag: {
  topK: Number(process.env.RAG_TOP_K) || 6,
  minScore: Number(process.env.RAG_MIN_SCORE) || 0.25,
},
```

Update [.env.example](.env.example) to match:

```
DATABASE_URL=postgres://unblock:unblock@localhost:5432/unblock_ai
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
RAG_TOP_K=6
RAG_MIN_SCORE=0.25
```

> ⚠️ Making `DATABASE_URL` **required** means the app will not boot without Postgres — including for the offline tests. If you want `npm test` to keep running without a database, make these two vars optional and have the Postgres store construct lazily. Decide this deliberately; it is easy to get wrong and annoying to debug later.

### Step 4 — Database client

`src/db/pool.js`:

```js
import pg from "pg";
import { config } from "../config/env.js";

export const pool = new pg.Pool({ connectionString: config.database.url, max: 10 });

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

`withTransaction` is what makes template+chunks atomic. Use it for every write path that touches both tables.

### Step 5 — Embedding client

`src/rag/embeddings.js` — reuse the existing `azureClient`; do **not** construct a second client.

```js
import { azureClient } from "../llm/azureClient.js";
import { config } from "../config/env.js";

const MAX_BATCH = 96;

export async function embedBatch(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);
    const res = await azureClient.embeddings.create({
      model: config.embedding.deployment,
      input: batch,
    });
    // Azure does not guarantee ordering — sort by index before mapping.
    out.push(...res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return out;
}

export async function embedOne(text) {
  const [v] = await embedBatch([text]);
  return v;
}

export const toPgVector = (embedding) => `[${embedding.join(",")}]`;
```

⚠️ Two real bugs to avoid: **sort `res.data` by `index`** (ordering is not guaranteed, and a mismatch silently pairs each chunk with the wrong vector — retrieval degrades with no error); and pgvector needs the `[1,2,3]` bracket-string literal, not a JS array.

### Step 6 — Structure-aware chunker

`src/rag/chunker.js` — pure functions, no I/O, so it is trivially unit-testable against your existing fixtures.

```js
export function chunkWorkflow(workflow) {
  const chunks = [];
  const title = workflow.title;
  const stepName = (id) => workflow.steps.find((s) => s.id === id)?.name ?? id;

  chunks.push({
    chunk_type: "summary",
    step_id: null,
    content: [
      `Workflow: ${title}.`,
      workflow.description,
      `Institution type: ${workflow.scope?.institution_type ?? "unspecified"}.`,
      `Applies to: ${workflow.scope?.applies_to?.actor_type ?? "unspecified"}.`,
      `This workflow has ${workflow.steps.length} steps: ${workflow.steps.map((s) => s.name).join(", ")}.`,
    ].join(" "),
    raw_json: {
      title, description: workflow.description, scope: workflow.scope,
    },
  });

  workflow.steps.forEach((step, i) => {
    const parts = [
      `Workflow: ${title}.`,                                  // always anchor to parent
      `Step ${i + 1} of ${workflow.steps.length}: "${step.name}" (${step.type} step).`,
      step.description,
      describeAssignee(step.assignee),
      step.depends_on?.length
        ? `Depends on: ${step.depends_on.map((d) => `"${stepName(d.step_id)}" (requires outcome: ${d.required_outcome})`).join("; ")}.`
        : "This step has no dependencies and starts automatically.",
      step.condition ? `Runs only when: ${describeCondition(step.condition)}.` : null,
      describeOutcomes(step.outcomes),
    ].filter(Boolean);

    chunks.push({ chunk_type: "step", step_id: step.id, content: parts.join(" "), raw_json: step });
  });

  // ...plus scope, inputs, completion chunks in the same shape
  return chunks;
}
```

Implement the `describe*` helpers to render prose, mapping `resolution` modes to phrases (`dynamic` → "the requester's {role}, resolved from the directory"; `static` → "the {role} office"; `requester` → "the requester"; `system` → "handled automatically"). **Skip every `null` field** — your schema mandates their presence, but they carry no retrieval signal and dilute the embedding.

**Test it against your fixtures immediately** — chunking is where quality is won or lost, and you can inspect the output by eye without spending a single embedding call:

```js
// tests/chunker.test.js — offline, no network
test("every chunk mentions the workflow title", () => {
  const chunks = chunkWorkflow(fixture);
  for (const c of chunks) assert.ok(c.content.includes(fixture.title));
});
test("no chunk contains raw nulls or JSON syntax", () => {
  for (const c of chunkWorkflow(fixture)) assert.ok(!/null|[{}]/.test(c.content));
});
```

### Step 7 — Postgres-backed store

`src/knowledgeBank/postgresStore.js` — **implements the existing `WorkflowStore` interface** so it drops into [src/index.js:10](src/index.js#L10) with a one-line change.

```js
import { WorkflowStore } from "./store.js";
import { withTransaction, pool } from "../db/pool.js";
import { chunkWorkflow } from "../rag/chunker.js";
import { embedBatch, toPgVector } from "../rag/embeddings.js";

export class PostgresWorkflowStore extends WorkflowStore {
  async save(workflow, { draftId = null } = {}) {
    // Embed BEFORE opening the transaction — network I/O must not hold a DB
    // connection open, and a failed embed should abort before we write anything.
    const chunks = chunkWorkflow(workflow);
    const embeddings = await embedBatch(chunks.map((c) => c.content));

    return withTransaction(async (client) => {
      const { rows: [{ next }] } = await client.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next
           FROM workflow_templates WHERE workflow_id = $1`,
        [workflow.workflow_id]
      );

      await client.query(
        `UPDATE workflow_templates SET is_latest = false
          WHERE workflow_id = $1 AND is_latest`,
        [workflow.workflow_id]
      );

      const { rows: [tpl] } = await client.query(
        `INSERT INTO workflow_templates
           (workflow_id, version, draft_id, title, description,
            institution_type, schema_version, review_status, document)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [workflow.workflow_id, next, draftId, workflow.title, workflow.description,
         workflow.scope?.institution_type ?? null, workflow.schema_version,
         workflow.metadata?.review_status ?? "pending_admin_review", workflow]
      );

      for (const [i, c] of chunks.entries()) {
        await client.query(
          `INSERT INTO workflow_chunks
             (template_id, workflow_id, chunk_type, step_id, content, raw_json, embedding)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [tpl.id, workflow.workflow_id, c.chunk_type, c.step_id,
           c.content, c.raw_json ?? null, toPgVector(embeddings[i])]
        );
      }

      return { id: workflow.workflow_id, version: next };
    });
  }

  async getById(workflowId, version) {
    const { rows } = version
      ? await pool.query(
          `SELECT document FROM workflow_templates WHERE workflow_id=$1 AND version=$2`,
          [workflowId, version])
      : await pool.query(
          `SELECT document FROM workflow_templates WHERE workflow_id=$1 AND is_latest`,
          [workflowId]);
    return rows[0]?.document ?? null;
  }

  // list(), search(), update() — same interface, straightforward SQL.
  // update() delegates to save() with workflow_id forced, exactly as FileWorkflowStore does.
}
```

Note `save()` returns `{ id, version }` — **identical to `FileWorkflowStore`** ([fileStore.js:75](src/knowledgeBank/fileStore.js#L75)) — so [routes.js:38](src/api/routes.js#L38) needs no change at all. That is the payoff of the existing abstraction.

Because `is_latest` and version numbering are maintained inside the transaction, concurrent saves of the same `workflow_id` cannot interleave into a duplicate version — the `UNIQUE (workflow_id, version)` constraint is the backstop if they try.

### Step 8 — Draft repository

`src/knowledgeBank/draftRepository.js`:

```js
import { createHash } from "node:crypto";
import { pool } from "../db/pool.js";

const sha256 = (t) => createHash("sha256").update(t, "utf8").digest("hex");

export async function saveDraft(rawText, { submittedBy = null } = {}) {
  const hash = sha256(rawText);
  const { rows } = await pool.query(
    `INSERT INTO workflow_drafts (raw_text, text_sha256, submitted_by)
     VALUES ($1,$2,$3)
     ON CONFLICT (text_sha256) DO UPDATE SET raw_text = EXCLUDED.raw_text
     RETURNING id, text_sha256`,
    [rawText, hash, submittedBy]
  );
  return rows[0];
}

export async function markDraftStatus(id, status, failureReason = null) {
  await pool.query(
    `UPDATE workflow_drafts SET status=$2, failure_reason=$3 WHERE id=$1`,
    [id, status, failureReason]
  );
}
```

The `ON CONFLICT … DO UPDATE` (rather than `DO NOTHING`) is deliberate: `DO NOTHING` returns **zero rows** on conflict, so `rows[0]` would be `undefined` and resubmitting an identical draft would crash. This is a classic upsert bug — the no-op update guarantees a row comes back either way.

Your schema already carries `metadata.source_text_hash` ([overview.md §5](./overview.md)), so the same hash links template → draft even outside the FK.

### Step 9 — Wire the draft into the extract route

In [src/api/routes.js](src/api/routes.js), the extract handler becomes:

```js
const draft = await saveDraft(text);
try {
  const { workflow, attempts } = await extractWorkflow(text);
  await markDraftStatus(draft.id, "extracted");
  res.json({ draft_id: draft.id, workflow, validation: { valid: true, errors: [] }, attempts });
} catch (err) {
  await markDraftStatus(draft.id, err instanceof ExtractionError ? "rejected" : "failed", err.message);
  throw err;   // existing error middleware at routes.js:95 still handles the response
}
```

Then accept an optional `draft_id` in `POST /workflows` and pass it through as `store.save(workflow, { draftId })`.

⚠️ Rethrow `err` after marking status. Swallowing it would turn a failed extraction into a `200 OK` with an undefined body. The existing middleware at [routes.js:95](src/api/routes.js#L95) already maps `ExtractionError` → `422`; let it do its job.

### Step 10 — Retrieval

`src/rag/retriever.js` — **hybrid search**, because pure vector search reliably misses exact identifiers (role names like `head_of_department`, reference formats like `LEAVE-{YYYY}-{SEQ:5}`) that keyword search nails.

```js
export async function retrieve(question, { topK = 6, institutionType = null } = {}) {
  const qvec = toPgVector(await embedOne(question));

  const { rows } = await pool.query(
    `WITH vec AS (
       SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.embedding <=> $1) AS rank
       FROM workflow_chunks c
       JOIN workflow_templates t ON t.id = c.template_id
       WHERE t.is_latest AND ($3::text IS NULL OR t.institution_type = $3)
       ORDER BY c.embedding <=> $1 LIMIT 40
     ),
     kw AS (
       SELECT c.id, ROW_NUMBER() OVER (
                ORDER BY ts_rank(c.content_tsv, plainto_tsquery('english', $2)) DESC) AS rank
       FROM workflow_chunks c
       JOIN workflow_templates t ON t.id = c.template_id
       WHERE t.is_latest AND c.content_tsv @@ plainto_tsquery('english', $2)
             AND ($3::text IS NULL OR t.institution_type = $3)
       LIMIT 40
     )
     SELECT c.id, c.workflow_id, c.chunk_type, c.step_id, c.content, t.title, t.version,
            COALESCE(1.0/(60+vec.rank),0) + COALESCE(1.0/(60+kw.rank),0) AS score
     FROM workflow_chunks c
     JOIN workflow_templates t ON t.id = c.template_id
     LEFT JOIN vec ON vec.id = c.id
     LEFT JOIN kw  ON kw.id  = c.id
     WHERE vec.id IS NOT NULL OR kw.id IS NOT NULL
     ORDER BY score DESC
     LIMIT $4`,
    [qvec, question, institutionType, topK]
  );
  return rows;
}
```

This is **Reciprocal Rank Fusion** (`k=60`): each result scores `1/(60+rank)` in each list, summed. It fuses rankings without needing the two scoring scales to be comparable — which they are not, since cosine distance and `ts_rank` have unrelated ranges. Naively adding or averaging the raw scores is the common mistake and gives whichever scale has larger numbers effective veto power.

Filtering on `t.is_latest` matters: without it, superseded versions compete with current ones and the LLM may answer from an outdated template.

### Step 11 — Generation

`src/rag/answer.js`:

```js
const RAG_SYSTEM_PROMPT = `You answer questions about institutional approval workflows using ONLY the numbered context below.
Cite the workflow title for every claim. If the context does not contain the answer, say so plainly — never infer a workflow that is not shown.`;

export async function answerQuestion(question, opts = {}) {
  const chunks = await retrieve(question, opts);
  if (chunks.length === 0) {
    return { answer: "No relevant workflows found in the knowledge bank.", citations: [] };
  }

  const context = chunks
    .map((c, i) => `[${i + 1}] (workflow: ${c.title}, section: ${c.chunk_type})\n${c.content}`)
    .join("\n\n");

  const res = await azureClient.chat.completions.create({
    model: config.azure.deployment,
    messages: [
      { role: "system", content: RAG_SYSTEM_PROMPT },
      { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
    ],
    ...(supportsTemperatureControl(config.azure.deployment) ? { temperature: 0 } : {}),
  });

  return {
    answer: res.choices[0].message.content,
    citations: chunks.map((c, i) => ({
      ref: i + 1, workflow_id: c.workflow_id, title: c.title,
      version: c.version, chunk_type: c.chunk_type, step_id: c.step_id,
    })),
  };
}
```

Reuse the `supportsTemperatureControl` guard from [extractWorkflow.js:12](src/llm/extractWorkflow.js#L12) — reasoning deployments (`o*`/`gpt-5*`) reject a `temperature` parameter outright, and this route hits the same deployment.

### Step 12 — RAG endpoints

Add to [src/api/routes.js](src/api/routes.js), following the existing `asyncHandler` pattern so errors reach the middleware:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/rag/query` | `{ question, institution_type?, top_k? }` → `{ answer, citations[] }` |
| `POST` | `/api/rag/search` | Retrieval only, no LLM — for debugging relevance and for UI autocomplete |
| `GET` | `/api/drafts/:id` | Fetch original draft text |
| `GET` | `/api/workflows/:id/draft` | Fetch the draft a template came from |
| `POST` | `/api/admin/reindex` | Re-chunk and re-embed all latest templates |

`/api/rag/search` is the one to build first. It lets you evaluate retrieval quality in isolation, without the LLM masking bad retrieval with a plausible-sounding answer — the most common way RAG quality problems go unnoticed.

### Step 13 — Swap the store

[src/index.js:10](src/index.js#L10):

```js
const store = new PostgresWorkflowStore();
```

One line, because the interface holds. Keep `FileWorkflowStore` — it is what makes [tests/fileStore.test.js](tests/fileStore.test.js) and the offline tier of [tests/routes.test.js](tests/routes.test.js) runnable without a database.

### Step 14 — Reindexing

You will change the chunker — it is the main tuning lever. `src/rag/reindex.js` should re-chunk and re-embed every `is_latest` template. `ON DELETE CASCADE` on `workflow_chunks.template_id` makes each template's reindex a clean `DELETE FROM workflow_chunks WHERE template_id = $1` followed by fresh inserts, inside one transaction.

Add `"reindex": "node scripts/reindex.js"` to [package.json](package.json) scripts.

---

## 8. Testing

Extend the existing two-tier split (`tests/*.test.js` offline, `tests/live/*.test.js` networked) rather than inventing a third convention.

**Offline (`npm test`) — no network, no database:**
- `tests/chunker.test.js` — chunk counts and content assertions against both fixtures; every chunk names its workflow; no `null` or JSON braces leak into prose; `depends_on` renders step *names* not IDs.

**Integration (needs Postgres, no LLM):**
- Store round-trip: save → `getById` → version bump on re-save → `is_latest` moves to the new row.
- Draft dedupe: saving the same text twice returns the same `id` and does not throw.
- Chunk cascade: deleting a template removes its chunks.

Use a **stub embedder** (deterministic pseudo-random vector from a hash of the text) so these run without Azure. This is worth doing — it keeps the DB logic testable in CI without API keys or cost.

**Live (`npm run test:live`):**
- Retrieval quality: a small set of question → expected-`workflow_id` pairs, asserting the right workflow appears in the top 3. Start with ~10 questions drawn from your three fixtures. This is your regression harness for chunker changes — without it you are tuning blind.

---

## 9. Build order

Each phase is independently useful and independently shippable.

| Phase | Deliverable | Depends on |
|---|---|---|
| **1** | Docker Postgres + migrations + `pool.js` | — |
| **2** | `draftRepository` + drafts persisted in `/extract` | 1 |
| **3** | `PostgresWorkflowStore` (no vectors yet) + swap in `index.js` | 1 |
| **4** | `chunker.js` + offline tests — **inspect the prose output by eye** | — |
| **5** | `embeddings.js` + chunk writes inside `save()`'s transaction | 3, 4 |
| **6** | `retriever.js` + `POST /api/rag/search` | 5 |
| **7** | `answer.js` + `POST /api/rag/query` | 6 |
| **8** | Reindex script + live retrieval-quality tests | 7 |

Phases 1–3 are worth doing regardless of RAG — they close the "no database" gap in [overview.md §13](./overview.md).

**Phase 4 before phase 5.** Chunking determines retrieval quality more than any other choice, and you can evaluate it by reading the output — no embeddings, no cost, no API calls. Get the prose right before you spend a single embedding call on it.

---

## 10. Pitfalls worth restating

1. **HNSW opclass must match the query operator.** `vector_cosine_ops` ⟷ `<=>`. A mismatch silently disables the index — correct results, terrible performance, no error.
2. **Sort embedding responses by `index`.** Ordering is not guaranteed; a mismatch pairs chunks with the wrong vectors and degrades retrieval with nothing in the logs.
3. **Embed outside the transaction.** Network I/O while holding a DB connection exhausts the pool under load.
4. **Never chunk raw JSON.** §4 is the whole argument. Prose in, JSON in a side column.
5. **`ON CONFLICT DO NOTHING` returns zero rows.** Use `DO UPDATE` when you need the id back.
6. **Filter on `is_latest`.** Otherwise superseded versions compete with current ones in retrieval.
7. **RRF, not raw score addition.** Cosine distance and `ts_rank` are not on comparable scales.
8. **Keep `draft_id` optional.** Hand-authored workflows have no draft, and existing route tests pass no draft.
9. **Decide whether `DATABASE_URL` is required at boot.** If required, the offline test tier needs a database — probably not what you want.
10. **There is still no auth on any route** ([overview.md §9](./overview.md)). `/api/rag/query` will expose the full contents of every stored workflow to anyone who can reach the port. Not a blocker for local development; a blocker before any shared deployment.

---

## 11. Cost estimate

`text-embedding-3-small` is ~$0.02 per 1M tokens. At ~10 chunks × ~150 tokens ≈ 1.5k tokens per workflow, indexing **10,000 workflows costs well under $1**. Query embeddings are negligible. Effectively all your spend stays in the chat-completion calls you already make — indexing cost is not a factor in any design decision here.
