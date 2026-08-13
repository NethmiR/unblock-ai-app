# UNBLOCK-AI — End-to-End Implementation Plan
## From "admin pastes a draft" to "system picks the right workflow template"

> Historical planning document. Paths and file names below predate the TypeScript restructure — see docs/architecture/folder-structure.md for the current layout.

> **Audience:** an implementing engineer or a code-generating AI model with no prior context on this repo.
> Every phase below states: *what you are building*, *which files to create/change*, *the exact code contracts*, *how to verify it works*, and *what the human must do manually*.
>
> **Read this section first, then do phases in order.** Do not skip ahead — later phases assume the artifacts of earlier ones exist.

---

## 0. Orientation — read before writing any code

### 0.1 What exists today (do not re-implement)

The repository at `UNBLOCK-AI/` is a **working Node.js + Express backend, Phase 1 only**. It does exactly one thing:

```
admin plain text ──► Azure OpenAI extraction ──► schema + graph validation ──► versioned JSON files on disk
                            (with self-repair loop)
```

| Area | File | Status |
|---|---|---|
| Express entrypoint | `src/index.js` | ✅ works |
| HTTP routes | `src/api/routes.js` | ✅ works — 6 endpoints |
| Env config | `src/config/env.js` | ✅ works — fail-fast on missing vars |
| Azure OpenAI client | `src/llm/azureClient.js` | ✅ works |
| Extraction + repair loop | `src/llm/extractWorkflow.js` | ✅ works |
| System prompt | `src/llm/prompts/systemPrompt.js` | ✅ works |
| Few-shot loader | `src/llm/prompts/fewShot.js` | ✅ works |
| Workflow JSON Schema | `src/schema/workflow.schema.json` | ✅ works |
| Role vocabulary | `src/schema/roleVocabulary.js` | ✅ works |
| AJV schema validator | `src/validation/schemaValidator.js` | ✅ works |
| Graph validator | `src/validation/graphValidator.js` | ✅ works — 8 checks |
| Abstract store interface | `src/knowledgeBank/store.js` | ✅ works |
| File-backed store | `src/knowledgeBank/fileStore.js` | ✅ works — versioned, atomic writes |
| Logger | `src/utils/logger.js` | ✅ works |
| Offline tests | `tests/*.test.js` | ✅ 4 suites pass |
| Live tests | `tests/live/*.test.js` | ✅ hit real Azure |

**Missing from the repo today — and therefore the work this plan specifies.**

Nothing in this table is excluded. Every row is a phase you will build; the "Built in" column is the phase that builds it. (For what is genuinely *not* being built, see **Appendix D — Explicitly out of scope**.)

| Missing capability | Built in |
|---|---|
| `retrieval_summary` section in the schema/prompt | Phase 2 |
| Embeddings of any kind | Phase 3 |
| MongoDB persistence (`drafts`, `templates`, `selection_sessions`) | Phase 4 |
| Vector search | Phase 5 |
| The Selector Agent (the LLM call that picks a template for a user query) | Phase 6 |
| The clarifying-question loop | Phase 6 (§6.7) |
| Any frontend whatsoever | Phases 9–13 |

### 0.2 What we are building — the whole picture

```
╔═══════════════════ ADMIN SIDE (write path — once per workflow) ═══════════════════╗
║                                                                                   ║
║  Admin Portal (Next.js)                                                           ║
║    "Create new template" → types plain English → clicks "Generate template"        ║
║        │                                                                          ║
║        ▼  POST /api/drafts                                                        ║
║  drafts collection ................................. raw text preserved forever   ║
║        │                                                                          ║
║        ▼  POST /api/drafts/:id/extract                                            ║
║  Extraction (Azure OpenAI gpt-4o, EXISTING)                                       ║
║    + NEW: emits a retrieval_summary section                                       ║
║        │                                                                          ║
║        ▼                                                                          ║
║  Schema + graph validation → repair loop (EXISTING)                               ║
║        │                                                                          ║
║        ▼                                                                          ║
║  renderForEmbedding(workflow) → one deterministic string                          ║
║        │                                                                          ║
║        ▼  Azure AI Foundry, text-embedding-3-small, 1536 dims                     ║
║  Embed → vector                                                                   ║
║        │                                                                          ║
║        ▼                                                                          ║
║  templates collection { document, retrieval: { text, embedding, aliases_lower } }  ║
║        │                                                                          ║
║        ▼  Admin reviews the flowchart in the portal, clicks "Publish"             ║
║  review_status: "confirmed"  ← ONLY NOW is it selectable                          ║
╚═══════════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════ USER SIDE (read path — per request) ═══════════════════════════╗
║                                                                                   ║
║  Requester Portal (Next.js)                                                       ║
║    "I want to apply for overseas leave"                                           ║
║        │                                                                          ║
║        ▼  POST /api/selection/sessions                                            ║
║  Embed query (same model, 1536 dims)                                              ║
║        │                                                                          ║
║        ▼                                                                          ║
║  Vector search → top-5 candidates  (+ alias exact-match boost)                     ║
║        │                                                                          ║
║        ▼                                                                          ║
║  SELECTOR LLM CALL (Azure OpenAI, structured output)                              ║
║        │                                                                          ║
║        ├── "matched"       → show the workflow plan preview → Submit              ║
║        ├── "ambiguous"     → ask ONE question → user answers                      ║
║        │                     → POST /api/selection/sessions/:id/answer            ║
║        │                     → re-decide over the SAME candidates (max 2 rounds)  ║
║        ├── "manual_choice" → after 2 rounds, show the candidate list              ║
║        └── "no_match"      → say so honestly, offer to list what exists           ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
```

### 0.3 Architectural decisions already made (do not re-litigate)

| Decision | Choice | Why |
|---|---|---|
| Repo layout | **Two sibling folders.** `UNBLOCK-AI/` (Express API, port 3000) and `unblock-ai-web/` (Next.js, port 3001). Frontend calls backend over HTTP. | Backend already works; rewriting it into Next.js route handlers is pure regression risk. |
| LLM provider | **Azure OpenAI** (the existing `AZURE_OPENAI_*` config) for extraction **and** the selector call. | Already wired, already tested, structured-output already proven. |
| Embedding provider | **Azure AI Foundry, `text-embedding-3-small`, 1536 dims.** Separate endpoint + key from the chat model. | User-specified. Credentials in §1.3. |
| Vector store | **MongoDB (local) + cosine similarity computed in Node.** Behind a `VectorStore` interface so Atlas `$vectorSearch` is a later drop-in. | <200 templates. O(n) over 1536-float arrays is sub-millisecond and works offline. |
| Chunking | **None.** 1 template = 1 vector. | See `WORKFLOW_SELECTION_PLAN.md` §2 — chunking is for policy PDFs, a different retrieval problem. |
| Auth | **Mock session** behind a `getSession()` seam. Real auth is a later phase. | Keeps focus on the selection pipeline; the seam makes swapping in NextAuth mechanical. |
| Admin editor | **Plain `<textarea>` + word count.** The formatting toolbar is rendered visually but inert. | Extraction consumes plain text; rich formatting is discarded downstream anyway. |
| Flowchart | **React Flow + dagre auto-layout**, driven by `workflow.steps[].depends_on`. | Arbitrary DAGs; hand-built CSS breaks on anything but the demo shape. |
| Requester scope | Live: jobs list, new-job chat, clarifying loop, plan preview, Submit. Static/mocked: the job-execution screens (Waiting, More info). | Execution engine is out of scope for this phase. |

### 0.4 Code quality rules that apply to every phase

These are not decoration. A reviewer will reject work that violates them.

1. **Single Responsibility.** One module = one reason to change. `embeddings.ts` knows about embedding APIs and nothing about MongoDB. `vectorStore.js` knows about ranking and nothing about LLMs.
2. **Dependency Inversion.** High-level code depends on interfaces, never concrete classes. Routes receive a `store`; they never `import { MongoWorkflowStore }`. This is already the pattern in `src/index.js:10-11` — follow it.
3. **DRY, enforced at one specific place.** `renderForEmbedding()` is called by *both* the save path and the backfill script. Never inline a second copy. Same for `l2normalize()`, same for the API client on the frontend.
4. **Open/Closed.** Adding `AtlasVectorSearch` must not require editing `InMemoryVectorSearch` or the selector. New behaviour = new class implementing the same interface.
5. **No magic values.** Every threshold, dimension, K, and model name is a named constant in a config module, never a literal buried in a function.
6. **Pure functions where possible.** `renderForEmbedding`, `cosineSimilarity`, `applyAliasBoost`, `buildPlanNodes` take data and return data — no I/O, no side effects. These are the parts that get unit-tested exhaustively.
7. **Errors are typed.** Extend `Error` with a named class (the repo already does this with `ExtractionError`). Never throw bare strings. Never swallow an error into a `null` return without logging.
8. **Frontend: server components by default.** `"use client"` only when the component needs state, effects, or event handlers. Data fetching lives in server components or route handlers, not in `useEffect`.
9. **One source of truth for types.** The workflow JSON shape is defined once in `unblock-ai-web/src/types/workflow.ts` and imported everywhere. Do not redeclare it per-component.

### 0.5 🔧 MANUAL SETUP CHECKLIST (do these before Phase 1)

Everything a human must do by hand is collected here and repeated inline where it is needed.

| # | Task | How |
|---|---|---|
| M1 | **Install MongoDB locally** | Option A (recommended): Docker — `docker run -d --name unblock-mongo -p 27017:27017 -v unblock-mongo-data:/data/db mongo:7`. Option B: [MongoDB Community Server](https://www.mongodb.com/try/download/community) installer, run as a Windows service. Verify: `mongosh --eval "db.adminCommand('ping')"` prints `{ ok: 1 }`. |
| M2 | **Confirm existing Azure OpenAI chat creds still work** | In `UNBLOCK-AI/`, run `npm run smoke-test:azure`. Must print `OK`. If not, fix `.env` before doing anything else. |
| M3 | **Add embedding credentials to `UNBLOCK-AI/.env`** | Paste the block in §1.3. These are *different* from the chat credentials — different endpoint, different key. |
| M4 | **Verify the embedding endpoint responds** | After Phase 3, run `npm run smoke-test:embeddings`. Must print a 1536-length vector norm of `1.000`. |
| M5 | **Create the Next.js app's env file** | After Phase 7, create `unblock-ai-web/.env.local` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api`. |
| M6 | **(Optional, later) MongoDB Atlas** | Only when the corpus exceeds ~200 templates. Covered in Phase 14. |

> ⚠️ **Security note on the embedding key.** The key in §1.3 was shared in plain text. Treat it as compromised-by-default: keep it only in `.env` (which is gitignored — verify with `git check-ignore .env`), never in `.env.example`, never in frontend code, and rotate it in the Azure portal before any real deployment.

### 0.6 Phase map

| Phase | Deliverable | Depends on | Est. |
|---|---|---|---|
| **1** | Config + env plumbing for Mongo & embeddings | — | S |
| **2** | `retrieval_summary` in schema, prompt, fixtures | 1 | M |
| **3** | Embedding client + `renderForEmbedding` + normalization | 1 | M |
| **4** | MongoDB layer: connection, `drafts`, `MongoWorkflowStore` | 1 | L |
| **5** | Vector store interface + in-memory cosine + alias boost | 3, 4 | M |
| **6** | Selector Agent: retrieve → decide → clarify loop | 5 | L |
| **7** | Backend HTTP surface: draft, template, selection endpoints | 4, 6 | M |
| **8** | Evaluation harness: Recall@5 + decision accuracy | 6 | M |
| **9** | Next.js scaffold, design tokens, shared UI primitives | — | M |
| **10** | Admin Portal: template list + empty state | 9, 7 | M |
| **11** | Admin Portal: editor (textarea + flowchart + generate) | 10 | L |
| **12** | Requester Portal: jobs list | 9, 7 | M |
| **13** | Requester Portal: chat + clarifying loop + plan preview | 12, 7 | L |
| **14** | Backfill script, Atlas swap, ops notes | 5 | S |

---

# PART A — BACKEND

---

## Phase 1 — Config & environment plumbing

**Goal:** every new credential and tunable is loaded, validated, and reachable through `config` before any code needs it. Nothing functional ships in this phase; it exists so no later phase hardcodes a value.

### 1.1 Why config comes first

`src/config/env.js` currently throws at startup if a required var is missing. That fail-fast behaviour is valuable and must be preserved. But if you add `MONGODB_URI` to `REQUIRED_VARS` now, the app refuses to boot until Mongo exists. So: **add the config entries now, but only promote a var into `REQUIRED_VARS` in the phase where its code path goes live.** Each phase below tells you when.

### 1.2 Files

| Action | Path |
|---|---|
| Modify | `src/config/env.js` |
| Modify | `.env.example` |
| Modify | `.env` (local, gitignored) |
| Create | `src/config/constants.js` |

### 1.3 🔧 MANUAL — append to `UNBLOCK-AI/.env`

```bash
# --- Embeddings (Azure AI Foundry - SEPARATE resource from the chat model) ---
AZURE_EMBEDDING_ENDPOINT=https://fyp-foundry.services.ai.azure.com
AZURE_EMBEDDING_API_KEY=<your-azure-embedding-key>
AZURE_EMBEDDING_DEPLOYMENT=text-embedding-3-small
AZURE_EMBEDDING_API_VERSION=2024-10-21
AZURE_EMBEDDING_DIM=1536

# --- Selector LLM (reuses the existing Azure OpenAI chat resource) ---
AZURE_SELECTOR_DEPLOYMENT=gpt-4o

# --- MongoDB ---
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=unblock_ai

# --- Retrieval tunables ---
RETRIEVAL_TOP_K=5
RETRIEVAL_ALIAS_BOOST=0.15
SELECTION_MAX_ROUNDS=2
```

And append the **same keys with empty/placeholder values** to `.env.example` — never the real key:

```bash
AZURE_EMBEDDING_ENDPOINT=https://<your-foundry>.services.ai.azure.com
AZURE_EMBEDDING_API_KEY=
AZURE_EMBEDDING_DEPLOYMENT=text-embedding-3-small
AZURE_EMBEDDING_API_VERSION=2024-10-21
AZURE_EMBEDDING_DIM=1536
AZURE_SELECTOR_DEPLOYMENT=gpt-4o
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=unblock_ai
RETRIEVAL_TOP_K=5
RETRIEVAL_ALIAS_BOOST=0.15
SELECTION_MAX_ROUNDS=2
```

### 1.4 Rewrite `src/config/env.js`

Keep the existing fail-fast helper. Add typed sub-objects and a numeric coercion helper so no caller ever does `Number(process.env.X)` inline.

```js
import "dotenv/config";

/**
 * Variables the process cannot start without.
 * Promote a variable into this list ONLY when the code path that reads it is live.
 * Phase 3 adds the AZURE_EMBEDDING_* vars. Phase 4 adds MONGODB_URI.
 */
const REQUIRED_VARS = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_API_VERSION",
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Coerce an env var to a number, falling back to a default. Never returns NaN. */
function numberEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be numeric, got: ${raw}`);
  }
  return parsed;
}

function loadConfig() {
  for (const name of REQUIRED_VARS) requireEnv(name);

  return {
    azure: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION,
      // Selector reuses the same resource; defaults to the extraction deployment.
      selectorDeployment:
        process.env.AZURE_SELECTOR_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT,
    },

    embeddings: {
      endpoint: process.env.AZURE_EMBEDDING_ENDPOINT,
      apiKey: process.env.AZURE_EMBEDDING_API_KEY,
      deployment: process.env.AZURE_EMBEDDING_DEPLOYMENT || "text-embedding-3-small",
      apiVersion: process.env.AZURE_EMBEDDING_API_VERSION || "2024-10-21",
      dim: numberEnv("AZURE_EMBEDDING_DIM", 1536),
    },

    mongo: {
      uri: process.env.MONGODB_URI || "mongodb://localhost:27017",
      db: process.env.MONGODB_DB || "unblock_ai",
    },

    retrieval: {
      topK: numberEnv("RETRIEVAL_TOP_K", 5),
      aliasBoost: numberEnv("RETRIEVAL_ALIAS_BOOST", 0.15),
      maxRounds: numberEnv("SELECTION_MAX_ROUNDS", 2),
    },

    port: numberEnv("PORT", 3000),
    knowledgeBankPath: process.env.KNOWLEDGE_BANK_PATH || "./data/workflows",
  };
}

export const config = loadConfig();
```

### 1.5 Create `src/config/constants.js`

Values that are *not* environment-dependent but must not be magic numbers.

```js
/** Collection names - used by every Mongo module. Change here, changes everywhere. */
export const COLLECTIONS = Object.freeze({
  DRAFTS: "drafts",
  TEMPLATES: "templates",
  SELECTION_SESSIONS: "selection_sessions",
});

/** Lifecycle of an admin draft. */
export const DRAFT_STATUS = Object.freeze({
  PENDING: "pending",
  EXTRACTED: "extracted",
  FAILED: "failed",
  REJECTED: "rejected",
});

/** Mirrors metadata.review_status in workflow.schema.json - keep in sync. */
export const REVIEW_STATUS = Object.freeze({
  PENDING: "pending_admin_review",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
});

/** The four verdicts the Selector Agent can return. */
export const SELECTION_DECISION = Object.freeze({
  MATCHED: "matched",
  AMBIGUOUS: "ambiguous",
  NO_MATCH: "no_match",
  MANUAL_CHOICE: "manual_choice", // produced by the loop, never by the LLM
});

/** How a selection session ended. */
export const SESSION_OUTCOME = Object.freeze({
  MATCHED: "matched",
  ABANDONED: "abandoned",
  NO_MATCH: "no_match",
});

/** The embedding model identity, recorded on every stored vector. */
export const EMBEDDING_MODEL_ID = "text-embedding-3-small";
```

> **Why `Object.freeze`?** These are shared objects imported across a dozen modules. Freezing turns "someone accidentally reassigned a status string at runtime" from a silent multi-hour bug into an immediate `TypeError`.

### 1.6 ✅ Verify Phase 1

```bash
cd UNBLOCK-AI
node -e "import('./src/config/env.js').then(m => console.log(JSON.stringify(m.config, null, 2)))"
```

**Done when:** the printed object contains populated `embeddings`, `mongo`, and `retrieval` sub-objects, `embeddings.dim === 1536`, and `npm test` still passes (4 suites, unchanged).

---

## Phase 2 — `retrieval_summary`: schema, prompt, fixtures

**Goal:** every workflow the LLM extracts carries a structured, retrieval-oriented description of itself. This is the text that gets embedded, and it is the single biggest lever on selection quality.

### 2.1 The idea in one paragraph

Embeddings are computed from *text*. If the only text you have is the workflow's `title` and `description`, then two overseas-leave workflows that differ only by faculty produce nearly identical vectors and cosine similarity cannot separate them. `retrieval_summary` fixes this by making the model write, at extraction time, a description **in the requester's vocabulary** — including a `not_for` list that explicitly names the sibling workflows this one is most likely to be confused with. Negative signal is what makes near-duplicates distinguishable.

### 2.2 Files

| Action | Path |
|---|---|
| Modify | `src/schema/workflow.schema.json` |
| Modify | `src/llm/prompts/systemPrompt.js` |
| Modify | `fixtures/expected/it_faculty_overseas_leave.json` |
| Modify | `fixtures/expected/departmental_event_workshop.json` |
| Modify | `tests/schema.test.js` (add assertions) |

> ⚠️ **The three-way consistency constraint.** The two files in `fixtures/expected/` serve *three* roles simultaneously: few-shot prompt examples (`src/llm/prompts/fewShot.js`), schema-validation test fixtures (`tests/schema.test.js`), and live extraction-accuracy gold data (`tests/live/extractionAccuracy.test.js`). Changing the schema without updating both fixtures breaks all three at once. Do all four edits in the same commit.

### 2.3 Schema change

In `src/schema/workflow.schema.json`:

**(a)** Add `"retrieval_summary"` to the top-level `required` array — immediately after `"description"`:

```json
"required": [
  "schema_version",
  "workflow_id",
  "title",
  "description",
  "retrieval_summary",
  "scope",
  "requester",
  "inputs",
  "computed",
  "steps",
  "completion",
  "metadata"
],
```

**(b)** Add to top-level `properties`, after `"description"`:

```json
"retrieval_summary": { "$ref": "#/$defs/retrieval_summary" },
```

**(c)** Add to `$defs`:

```json
"retrieval_summary": {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "one_liner",
    "aliases",
    "keywords",
    "requester_types",
    "triggers",
    "not_for"
  ],
  "properties": {
    "one_liner": { "type": "string" },
    "aliases": { "type": "array", "items": { "type": "string" } },
    "keywords": { "type": "array", "items": { "type": "string" } },
    "requester_types": { "type": "array", "items": { "type": "string" } },
    "triggers": { "type": "array", "items": { "type": "string" } },
    "not_for": { "type": "array", "items": { "type": "string" } }
  }
}
```

**Field meanings — write these into the prompt too:**

| Field | Contains | Example |
|---|---|---|
| `one_liner` | One sentence a requester would recognise. Plain language, zero jargon. | `"Apply for approval to travel overseas as an IT Faculty staff member."` |
| `aliases` | Exact names/codes people actually say. The **lexical escape hatch** — embeddings are bad at rare tokens like `"AR-7"` or `"Faculty of IT"`. | `["overseas leave", "IT faculty overseas leave", "foreign travel approval"]` |
| `keywords` | Everyday vocabulary including informal phrasings. | `["going abroad", "travel", "conference", "leave", "trip"]` |
| `requester_types` | Who this applies to, in words — mirrors `scope.applies_to`. | `["academic staff", "lecturers", "IT faculty staff"]` |
| `triggers` | Situations that should route here. | `["travelling abroad for a conference", "visiting an overseas lab"]` |
| `not_for` | **Negative signal — the highest-value field.** Names sibling workflows this is most likely confused with. | `["local leave", "student overseas travel", "engineering faculty staff travel"]` |

### 2.4 Prompt change

Append a new section to `SYSTEM_PROMPT` in `src/llm/prompts/systemPrompt.js`, placed **after** the "Data namespace" section and **before** "Structural rules":

```
## retrieval_summary - how this workflow will be found

Every workflow must include a retrieval_summary. It is not documentation for
administrators. It is the text a search system embeds so that a requester's
own words can find this workflow. Write it for the person making the request.

- one_liner: one sentence the requester would recognise. Plain language, no
  institutional jargon. Not the same as `description`, which is written for
  administrators.
- aliases: the exact names, codes, and phrases people actually say out loud
  for this process. Include the official name AND any abbreviation or code
  that appears in the source text. NEVER invent an alias that does not appear
  in the draft.
- keywords: everyday vocabulary, including informal phrasings. A student says
  "going abroad"; the policy says "overseas leave of absence". BOTH belong here.
  Aim for 6-12 keywords.
- requester_types: who this applies to, in words a person would use to
  describe themselves ("undergraduate students", "academic staff",
  "IT faculty lecturers"). Mirror scope.applies_to.
- triggers: concrete situations that should route to this workflow, phrased as
  the situation and not the process ("travelling abroad for a conference",
  "hosting an external speaker"). Aim for 3-6 triggers.
- not_for: situations and requester types that must NOT route here, especially
  the SIBLING WORKFLOWS this one is most likely to be confused with. If this
  workflow is scoped to one faculty, one requester type, or one leave category,
  name the neighbouring scopes explicitly. This field is what allows a selector
  to tell near-identical workflows apart, so it is never empty for a
  scope-restricted workflow. Aim for 2-5 entries.

Write for the requester's vocabulary, not the administrator's.
```

### 2.5 Fixture updates

Insert a `retrieval_summary` block after `"description"` in each gold fixture.

**`fixtures/expected/it_faculty_overseas_leave.json`:**

```json
"retrieval_summary": {
  "one_liner": "Apply for permission to travel overseas during the academic term as an IT Faculty undergraduate.",
  "aliases": [
    "overseas leave",
    "IT faculty overseas leave",
    "overseas leave approval",
    "foreign travel approval"
  ],
  "keywords": [
    "going abroad",
    "travel overseas",
    "leave the country",
    "foreign trip",
    "study tour",
    "conference abroad",
    "leave of absence",
    "travel permission"
  ],
  "requester_types": [
    "undergraduate students",
    "IT faculty students",
    "Information Technology undergraduates"
  ],
  "triggers": [
    "travelling abroad during the semester",
    "attending a conference in another country",
    "an overseas exchange or study tour",
    "leaving the country for more than a few days during term"
  ],
  "not_for": [
    "local leave or absence within the country",
    "staff or academic-staff overseas travel",
    "students from faculties other than Information Technology",
    "postgraduate students"
  ]
}
```

**`fixtures/expected/departmental_event_workshop.json`:**

```json
"retrieval_summary": {
  "one_liner": "Get approval to run a departmental event or workshop, including the hall booking and refreshments.",
  "aliases": [
    "event approval",
    "workshop approval",
    "departmental event organization",
    "hall booking for an event"
  ],
  "keywords": [
    "book a hall",
    "run a workshop",
    "organise an event",
    "seminar",
    "guest speaker",
    "refreshments",
    "catering",
    "auditorium",
    "venue"
  ],
  "requester_types": [
    "academic staff",
    "department coordinators",
    "student societies"
  ],
  "triggers": [
    "running a workshop for the department",
    "booking a hall for a seminar",
    "inviting an external speaker",
    "arranging refreshments for a departmental event"
  ],
  "not_for": [
    "personal or private venue bookings",
    "regular timetabled lectures",
    "events organised outside the department",
    "overnight or residential events"
  ]
}
```

> Match the **exact formatting style** of the surrounding fixture file (2-space indent, blank lines between top-level sections) — these files are read by humans during prompt debugging.

### 2.6 Test additions

In `tests/schema.test.js`, add a suite asserting the section is present and non-trivial:

```js
test("every gold fixture has a usable retrieval_summary", async () => {
  for (const fixture of await loadExpectedFixtures()) {
    const s = fixture.retrieval_summary;
    assert.ok(s, `${fixture.workflow_id} is missing retrieval_summary`);
    assert.ok(s.one_liner.length > 20, "one_liner must be a real sentence");
    assert.ok(s.aliases.length >= 2, "need at least 2 aliases");
    assert.ok(s.keywords.length >= 5, "need at least 5 keywords");
    assert.ok(s.triggers.length >= 2, "need at least 2 triggers");
    assert.ok(s.not_for.length >= 2, "not_for is the highest-value field - populate it");
  }
});
```

### 2.7 ✅ Verify Phase 2

```bash
npm test              # all offline suites pass, including the new assertions
npm run test:live     # extraction still produces valid workflows
```

Then a manual eyeball, which matters more than the automated check: start the server, POST `fixtures/input/lab_equipment_purchase_request.txt` to `/api/workflows/extract`, and read the returned `retrieval_summary`.

**Done when:** the `retrieval_summary` for that *unseen* input reads like a requester wrote it, and `not_for` names plausible sibling processes rather than being empty or generic.

---

## Phase 3 — Embeddings: client, rendering, normalization

**Goal:** turn a workflow into a single deterministic string, and turn any string into a normalized 1536-dimension vector.

### 3.1 Files

| Action | Path |
|---|---|
| Create | `src/retrieval/renderSummary.js` |
| Create | `src/retrieval/embeddingClient.js` |
| Create | `src/retrieval/embeddings.js` |
| Create | `src/retrieval/vectorMath.js` |
| Create | `scripts/smokeTestEmbeddings.js` |
| Create | `tests/renderSummary.test.js` |
| Create | `tests/vectorMath.test.js` |
| Modify | `package.json` (one script) |
| Modify | `src/config/env.js` (promote embedding vars to required) |

### 3.2 `src/retrieval/renderSummary.js` — the deterministic renderer

This is the **DRY-critical module** in the entire backend. It is called by the save path *and* the backfill script. If those two ever render differently, stored vectors and query vectors describe different things, and retrieval degrades silently with no error.

```js
/**
 * Renders a workflow's retrieval_summary into the exact string that gets embedded.
 *
 * INVARIANT: this is the ONE place a workflow becomes embedding text.
 * Both the save path and the backfill script call this function. Never inline
 * a second version - divergence produces silently degraded retrieval with no
 * error to catch it.
 *
 * Field order is deliberate: `title` first because it is the strongest single
 * signal, `not_for` last because it qualifies everything above it.
 */

/** Renders one labelled line, or null when the array is empty. */
function labelledLine(label, values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return `${label}: ${values.join(", ")}`;
}

export function renderForEmbedding(workflow) {
  const s = workflow?.retrieval_summary;
  if (!s) {
    throw new Error(
      `Workflow '${workflow?.workflow_id ?? "<unknown>"}' has no retrieval_summary; ` +
        `it cannot be embedded. Run scripts/backfillSummaries.js first.`
    );
  }

  return [
    workflow.title,
    s.one_liner,
    labelledLine("Also known as", s.aliases),
    labelledLine("Applies to", s.requester_types),
    labelledLine("Use when", s.triggers),
    labelledLine("Keywords", s.keywords),
    labelledLine("Not for", s.not_for),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Lowercased aliases, deduped - used for the exact-match lexical boost. */
export function renderAliasesLower(workflow) {
  const aliases = workflow?.retrieval_summary?.aliases ?? [];
  return [...new Set(aliases.map((a) => a.trim().toLowerCase()).filter(Boolean))];
}
```

Rendered output for the IT overseas-leave fixture looks like:

```
IT Faculty Overseas Leave Approval
Apply for permission to travel overseas during the academic term as an IT Faculty undergraduate.
Also known as: overseas leave, IT faculty overseas leave, overseas leave approval, foreign travel approval
Applies to: undergraduate students, IT faculty students, Information Technology undergraduates
Use when: travelling abroad during the semester, attending a conference in another country, ...
Keywords: going abroad, travel overseas, leave the country, foreign trip, ...
Not for: local leave or absence within the country, staff or academic-staff overseas travel, ...
```

### 3.3 `src/retrieval/vectorMath.js` — pure math, zero I/O

```js
/**
 * Pure vector operations. No I/O, no config, no async - every function here is
 * a total function of its arguments, which makes the module exhaustively
 * unit-testable and safe to call in hot loops.
 */

/**
 * L2-normalizes a vector so that ||v|| === 1.
 *
 * Why this matters: once every vector is unit length, cosine similarity reduces
 * to a plain dot product. Normalizing at write time and at query time means the
 * search path never has to compute magnitudes.
 *
 * Note: Math.hypot(...v) would spread 1536 arguments onto the stack. Use a loop.
 */
export function l2normalize(vector) {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;

  const norm = Math.sqrt(sumOfSquares);
  if (norm === 0) return vector.slice();

  return vector.map((value) => value / norm);
}

/** Dot product. Assumes equal length - the caller validates dimensions. */
export function dot(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

/**
 * Cosine similarity of two vectors that are ALREADY L2-normalized.
 * Result is in [-1, 1]; for text embeddings in practice roughly [0, 1].
 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  return dot(a, b);
}
```

### 3.4 `src/retrieval/embeddingClient.js` — the SDK client

The embedding resource is a **different** Azure resource from the chat one, so it needs its own client instance. Mirror the structure of the existing `src/llm/azureClient.js`.

```js
import { AzureOpenAI } from "openai";
import { config } from "../config/env.js";

/**
 * Client for the Azure AI Foundry embedding deployment.
 *
 * Deliberately separate from `azureClient` in src/llm/: different endpoint,
 * different key, different deployment. Sharing one client would couple two
 * independently-rotatable credentials.
 */
export const embeddingClient = new AzureOpenAI({
  endpoint: config.embeddings.endpoint,
  apiKey: config.embeddings.apiKey,
  apiVersion: config.embeddings.apiVersion,
  deployment: config.embeddings.deployment,
});
```

> **If the endpoint 404s:** Azure AI Foundry resources sometimes require the endpoint to include `/openai/v1` or to use the `*.openai.azure.com` form. Try, in order: (1) the URL exactly as given, (2) with `/openai` appended, (3) the `*.cognitiveservices.azure.com` variant shown in the Foundry portal's "Endpoint" panel. The smoke test in §3.6 tells you which works in under five seconds.

### 3.5 `src/retrieval/embeddings.js` — the public API

```js
import { embeddingClient } from "./embeddingClient.js";
import { config } from "../config/env.js";
import { l2normalize } from "./vectorMath.js";
import { EMBEDDING_MODEL_ID } from "../config/constants.js";
import { logger } from "../utils/logger.js";

export class EmbeddingError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = "EmbeddingError";
    if (cause) this.cause = cause;
  }
}

/**
 * Embeds a single string and returns a unit-length vector.
 *
 * On normalization: text-embedding-3-small returns normalized vectors at its
 * native 1536 dimensions, so this is belt-and-braces today. It becomes
 * load-bearing the moment anyone sets a smaller `dimensions` value (Matryoshka
 * truncation returns UNNORMALIZED vectors) or swaps the model. Normalizing
 * unconditionally costs microseconds and removes an entire class of
 * silent-degradation bug, so it is not optional.
 */
async function embed(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new EmbeddingError("Cannot embed empty text");
  }

  let response;
  try {
    response = await embeddingClient.embeddings.create({
      model: config.embeddings.deployment,
      input: text,
    });
  } catch (err) {
    throw new EmbeddingError(`Embedding request failed: ${err.message}`, { cause: err });
  }

  const vector = response.data?.[0]?.embedding;
  if (!Array.isArray(vector)) {
    throw new EmbeddingError("Embedding response contained no vector");
  }
  if (vector.length !== config.embeddings.dim) {
    throw new EmbeddingError(
      `Expected ${config.embeddings.dim} dimensions, got ${vector.length}. ` +
        `Check AZURE_EMBEDDING_DIM matches the deployed model.`
    );
  }

  return l2normalize(vector);
}

/** Embeds the descriptive text of a workflow template (the indexing side). */
export const embedDocument = (text) => embed(text);

/** Embeds a short user query (the search side). */
export const embedQuery = (text) => embed(text);

/**
 * Provenance stamped onto every stored vector.
 *
 * The day the model or dimension changes, every existing vector is invalid.
 * Storing this makes that detectable with a query instead of discoverable
 * through mysteriously worse results.
 */
export function embeddingMetadata() {
  return {
    model: EMBEDDING_MODEL_ID,
    dim: config.embeddings.dim,
    embedded_at: new Date().toISOString(),
  };
}

/** Embeds many texts sequentially. Used by the backfill script. */
export async function embedBatch(texts, { onProgress } = {}) {
  const vectors = [];
  for (const [index, text] of texts.entries()) {
    vectors.push(await embed(text));
    onProgress?.(index + 1, texts.length);
    logger.debug("embedded", { index: index + 1, total: texts.length });
  }
  return vectors;
}
```

> **Note on `embedDocument` vs `embedQuery`.** The Gemini-based draft plan used asymmetric `taskType` hints. OpenAI's `text-embedding-3-*` models have **no task-type parameter** — the same call serves both sides. The two exported names are kept anyway because they document intent at the call site and give you one place to add asymmetric handling if you ever switch providers.

### 3.6 🔧 MANUAL — smoke test the endpoint

Create `scripts/smokeTestEmbeddings.js`:

```js
import { embedQuery } from "../src/retrieval/embeddings.js";
import { dot } from "../src/retrieval/vectorMath.js";
import { config } from "../src/config/env.js";

const [a, b] = await Promise.all([
  embedQuery("I want to apply for overseas leave"),
  embedQuery("going abroad for a conference"),
]);

console.log(`endpoint     : ${config.embeddings.endpoint}`);
console.log(`deployment   : ${config.embeddings.deployment}`);
console.log(`dimensions   : ${a.length}  (expected ${config.embeddings.dim})`);
console.log(`unit length  : ${dot(a, a).toFixed(6)}  (expected 1.000000)`);
console.log(`related sim  : ${dot(a, b).toFixed(4)}  (expect > 0.4)`);
console.log(a.length === config.embeddings.dim ? "OK embeddings" : "FAIL dimension mismatch");
```

Add to `package.json` scripts:

```json
"smoke-test:embeddings": "node scripts/smokeTestEmbeddings.js"
```

Run it:

```bash
npm run smoke-test:embeddings
```

**Expected:** `dimensions : 1536`, `unit length : 1.000000`, `related sim` above `0.4`.
**If it fails:** try the endpoint variants listed in §3.4 before touching any other code.

### 3.7 Promote the embedding vars to required

Once the smoke test passes, add to `REQUIRED_VARS` in `src/config/env.js`:

```js
"AZURE_EMBEDDING_ENDPOINT",
"AZURE_EMBEDDING_API_KEY",
"AZURE_EMBEDDING_DEPLOYMENT",
```

### 3.8 Offline tests

`tests/vectorMath.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { l2normalize, cosineSimilarity } from "../src/retrieval/vectorMath.js";

test("l2normalize produces a unit vector", () => {
  const v = l2normalize([3, 4]);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-10);
  assert.deepEqual(v, [0.6, 0.8]);
});

test("l2normalize handles the zero vector without dividing by zero", () => {
  assert.deepEqual(l2normalize([0, 0, 0]), [0, 0, 0]);
});

test("cosine of identical unit vectors is 1", () => {
  const v = l2normalize([1, 2, 3]);
  assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-10);
});

test("cosine of orthogonal vectors is 0", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-10);
});

test("cosineSimilarity rejects mismatched dimensions", () => {
  assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]), /Dimension mismatch/);
});
```

`tests/renderSummary.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { renderForEmbedding, renderAliasesLower } from "../src/retrieval/renderSummary.js";

const workflow = {
  workflow_id: "demo",
  title: "Demo Workflow",
  retrieval_summary: {
    one_liner: "A one-line description.",
    aliases: ["Demo", "demo  ", "DEMO"],
    keywords: ["a", "b"],
    requester_types: ["students"],
    triggers: ["when demoing"],
    not_for: ["production"],
  },
};

test("title is the first line", () => {
  assert.equal(renderForEmbedding(workflow).split("\n")[0], "Demo Workflow");
});

test("empty arrays produce no line at all", () => {
  const sparse = {
    ...workflow,
    retrieval_summary: { ...workflow.retrieval_summary, not_for: [], keywords: [] },
  };
  const text = renderForEmbedding(sparse);
  assert.ok(!text.includes("Not for"));
  assert.ok(!text.includes("Keywords"));
});

test("rendering is deterministic", () => {
  assert.equal(renderForEmbedding(workflow), renderForEmbedding(workflow));
});

test("missing retrieval_summary throws a directive error", () => {
  assert.throws(() => renderForEmbedding({ workflow_id: "x", title: "X" }), /backfillSummaries/);
});

test("aliases are lowercased, trimmed, and deduped", () => {
  assert.deepEqual(renderAliasesLower(workflow), ["demo"]);
});
```

### 3.9 ✅ Verify Phase 3

**Done when:** `npm run smoke-test:embeddings` prints a unit-length 1536-vector, and `npm test` passes with the two new suites.

---

## Phase 4 — MongoDB: connection, drafts, and the template store

**Goal:** replace file-on-disk persistence with MongoDB, *without changing a single line of `src/api/routes.js`*. That is the test of whether the existing `WorkflowStore` abstraction was worth having.

### 4.1 The three collections

```js
// drafts - raw admin input, NEVER mutated after insert
{
  _id,
  raw_text,              // exactly what the admin typed
  text_sha256,           // dedupes re-submission of identical text
  title,                 // admin-supplied working title, may be null
  submitted_by,          // session user id (mock for now)
  status,                // pending | extracted | failed | rejected
  failure_reason,        // ExtractionError message when status === "failed"
  workflow_id,           // set once extraction succeeds
  created_at,
  updated_at
}

// templates - the durable record AND the vector index, in one document
{
  _id,
  workflow_id, version,        // NOT unique alone; unique TOGETHER
  draft_id,                    // links back to the originating draft
  title, description,
  institution_type,            // lifted out of scope for cheap filtering
  schema_version, review_status,
  document,                    // the COMPLETE workflow JSON, unmodified
  is_latest,                   // exactly one true per workflow_id

  retrieval: {
    text,                      // exactly what was embedded (debuggable)
    embedding: [ ...1536 ],
    aliases_lower: [ ... ],    // lowercased, for the exact-match boost
    model: "text-embedding-3-small",
    dim: 1536,
    embedded_at
  },
  created_at, updated_at
}

// selection_sessions - the clarifying-question loop + evaluation data
{
  _id,
  user_query,
  candidates: [{ workflow_id, title, score, one_liner }],
  rounds: [{ question, options, answer, asked_at, answered_at }],
  outcome,                     // matched | abandoned | no_match | null (in progress)
  selected_workflow_id,
  requester_context,           // { faculty, actor_type } from the session
  created_at, updated_at
}
```

**Why the vector lives on the template document** rather than in a separate collection: selection becomes a single query with no cross-store consistency problem. There is no scenario where a template exists and its vector does not, because they are written in the same insert.

**Why `is_latest` rather than computing max(version):** it turns "find the current version of every workflow" from an aggregation into an indexed equality match. The cost is one extra write (unsetting the flag on the previous version) inside the same save.

### 4.2 Files

| Action | Path |
|---|---|
| Create | `src/db/mongoClient.js` |
| Create | `src/db/indexes.js` |
| Create | `src/knowledgeBank/mongoStore.js` |
| Create | `src/knowledgeBank/draftStore.js` |
| Create | `src/utils/hash.js` |
| Create | `scripts/initDb.js` |
| Create | `tests/mongoStore.test.js` |
| Modify | `src/index.js` (choose the store) |
| Modify | `src/config/env.js` (promote `MONGODB_URI`) |
| Modify | `package.json` (add `mongodb`, add a script) |

### 4.3 🔧 MANUAL — install MongoDB and the driver

```bash
# 1. Start MongoDB (Docker is easiest on Windows)
docker run -d --name unblock-mongo -p 27017:27017 -v unblock-mongo-data:/data/db mongo:7

# 2. Verify it responds
docker exec unblock-mongo mongosh --quiet --eval "db.adminCommand({ping:1})"
#    expected: { ok: 1 }

# 3. Add the Node driver
cd UNBLOCK-AI
npm install mongodb
```

If you prefer a native install, download [MongoDB Community Server](https://www.mongodb.com/try/download/community), accept the "run as a Windows service" default, and verify with `mongosh --eval "db.adminCommand({ping:1})"`.

> **No authentication is configured on a default local Mongo.** That is fine for local development and wrong for anything else. When you deploy, create a user with `db.createUser(...)` and put the credentials in `MONGODB_URI`.

### 4.4 `src/db/mongoClient.js` — one connection for the process

```js
import { MongoClient } from "mongodb";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * A single MongoClient for the whole process.
 *
 * The driver maintains an internal connection pool, so creating one client per
 * request is both unnecessary and actively harmful (pool thrash, socket
 * exhaustion). This module owns the lifecycle; nothing else calls `new
 * MongoClient`.
 */
let client = null;
let db = null;

export async function getDb() {
  if (db) return db;

  client = new MongoClient(config.mongo.uri, {
    serverSelectionTimeoutMS: 5000,   // fail fast instead of hanging for 30s
  });

  await client.connect();
  db = client.db(config.mongo.db);

  logger.info("mongo connected", { db: config.mongo.db });
  return db;
}

/** Closes the connection. Call from tests and from shutdown handlers. */
export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

/** Convenience accessor so callers never repeat `(await getDb()).collection(x)`. */
export async function collection(name) {
  return (await getDb()).collection(name);
}
```

### 4.5 `src/db/indexes.js` — declarative, idempotent index creation

```js
import { COLLECTIONS } from "../config/constants.js";
import { getDb } from "./mongoClient.js";
import { logger } from "../utils/logger.js";

/**
 * Index definitions as data, not as a sequence of imperative calls.
 * `createIndex` is idempotent, so running this on every boot is safe and means
 * a fresh machine never has a missing-index performance cliff.
 */
const INDEX_SPECS = [
  {
    collection: COLLECTIONS.DRAFTS,
    keys: { text_sha256: 1 },
    options: { unique: true, name: "draft_text_sha256_unique" },
  },
  {
    collection: COLLECTIONS.DRAFTS,
    keys: { created_at: -1 },
    options: { name: "draft_created_desc" },
  },
  {
    collection: COLLECTIONS.TEMPLATES,
    keys: { workflow_id: 1, version: 1 },
    options: { unique: true, name: "template_id_version_unique" },
  },
  {
    collection: COLLECTIONS.TEMPLATES,
    keys: { workflow_id: 1, is_latest: 1 },
    options: { name: "template_latest" },
  },
  {
    // The exact shape of the retrieval filter - see Phase 5.
    collection: COLLECTIONS.TEMPLATES,
    keys: { is_latest: 1, review_status: 1, institution_type: 1 },
    options: { name: "template_retrieval_filter" },
  },
  {
    collection: COLLECTIONS.SELECTION_SESSIONS,
    keys: { created_at: -1 },
    options: { name: "session_created_desc" },
  },
];

export async function ensureIndexes() {
  const db = await getDb();
  for (const { collection, keys, options } of INDEX_SPECS) {
    await db.collection(collection).createIndex(keys, options);
  }
  logger.info("mongo indexes ensured", { count: INDEX_SPECS.length });
}
```

### 4.6 `src/utils/hash.js`

```js
import { createHash } from "node:crypto";

/**
 * Stable SHA-256 of a text blob.
 * Normalizes line endings and trims so that Windows CRLF vs Unix LF, and a
 * trailing newline, do not produce a "different" draft.
 */
export function sha256(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
```

### 4.7 `src/knowledgeBank/draftStore.js`

```js
import { collection } from "../db/mongoClient.js";
import { COLLECTIONS, DRAFT_STATUS } from "../config/constants.js";
import { sha256 } from "../utils/hash.js";
import { logger } from "../utils/logger.js";

/**
 * Persistence for raw admin drafts.
 *
 * The single rule: `raw_text` is written once and never modified. Everything an
 * admin typed survives, so "what exactly did the model see?" is always
 * answerable. Status transitions update sibling fields, never the text.
 */
export class DraftStore {
  async #collection() {
    return collection(COLLECTIONS.DRAFTS);
  }

  /**
   * Creates a draft, or returns the existing one when identical text was
   * already submitted. Idempotent by content hash - clicking "Save draft"
   * twice must not create two rows.
   */
  async create({ rawText, title = null, submittedBy = null }) {
    const drafts = await this.#collection();
    const textSha = sha256(rawText);
    const now = new Date();

    const existing = await drafts.findOne({ text_sha256: textSha });
    if (existing) {
      logger.debug("draft already exists", { id: existing._id.toString() });
      return existing;
    }

    const doc = {
      raw_text: rawText,
      text_sha256: textSha,
      title,
      submitted_by: submittedBy,
      status: DRAFT_STATUS.PENDING,
      failure_reason: null,
      workflow_id: null,
      created_at: now,
      updated_at: now,
    };

    const { insertedId } = await drafts.insertOne(doc);
    logger.info("draft created", { id: insertedId.toString() });
    return { ...doc, _id: insertedId };
  }

  async getById(id) {
    const drafts = await this.#collection();
    return drafts.findOne({ _id: toObjectId(id) });
  }

  async list({ limit = 50 } = {}) {
    const drafts = await this.#collection();
    return drafts.find({}).sort({ created_at: -1 }).limit(limit).toArray();
  }

  /** Records the outcome of an extraction attempt. Never touches raw_text. */
  async markExtracted(id, workflowId) {
    return this.#patch(id, {
      status: DRAFT_STATUS.EXTRACTED,
      workflow_id: workflowId,
      failure_reason: null,
    });
  }

  async markFailed(id, reason) {
    return this.#patch(id, {
      status: DRAFT_STATUS.FAILED,
      failure_reason: String(reason).slice(0, 2000),
    });
  }

  async markRejected(id, reason) {
    return this.#patch(id, {
      status: DRAFT_STATUS.REJECTED,
      failure_reason: String(reason).slice(0, 2000),
    });
  }

  async #patch(id, fields) {
    const drafts = await this.#collection();
    await drafts.updateOne(
      { _id: toObjectId(id) },
      { $set: { ...fields, updated_at: new Date() } }
    );
    return this.getById(id);
  }
}

/** Accepts either an ObjectId or its 24-char hex string. */
import { ObjectId } from "mongodb";
export function toObjectId(id) {
  return id instanceof ObjectId ? id : new ObjectId(String(id));
}
```

### 4.8 `src/knowledgeBank/mongoStore.js` — the drop-in replacement

This class implements **exactly** the `WorkflowStore` interface (`save`, `getById`, `list`, `search`, `update`) so `src/api/routes.js` needs no changes at all. It adds retrieval-specific methods on top.

```js
import { WorkflowStore } from "./store.js";
import { collection } from "../db/mongoClient.js";
import { COLLECTIONS, REVIEW_STATUS } from "../config/constants.js";
import { renderForEmbedding, renderAliasesLower } from "../retrieval/renderSummary.js";
import { embedDocument, embeddingMetadata } from "../retrieval/embeddings.js";
import { logger } from "../utils/logger.js";

function summarize(doc) {
  return {
    workflow_id: doc.workflow_id,
    title: doc.title,
    description: doc.description,
    version: doc.version,
    schema_version: doc.schema_version,
    review_status: doc.review_status,
    draft_id: doc.draft_id ? String(doc.draft_id) : null,
    updated_at: doc.updated_at?.toISOString?.() ?? doc.updated_at,
  };
}

export class MongoWorkflowStore extends WorkflowStore {
  async #collection() {
    return collection(COLLECTIONS.TEMPLATES);
  }

  /**
   * Saves a workflow as a NEW VERSION and embeds it in the same operation.
   *
   * Embedding inside save is deliberate. A new version means a new
   * retrieval_summary, which means the old vector is stale. Making embedding a
   * separate step someone has to remember guarantees that one day they will not,
   * and retrieval will quietly use a vector describing an older revision.
   */
  async save(workflow, { draftId = null } = {}) {
    const templates = await this.#collection();
    const workflowId = workflow.workflow_id;

    const latest = await templates.findOne(
      { workflow_id: workflowId },
      { sort: { version: -1 }, projection: { version: 1 } }
    );
    const version = (latest?.version ?? 0) + 1;

    // Render once, embed the rendered text, store both.
    const text = renderForEmbedding(workflow);
    const embedding = await embedDocument(text);

    const now = new Date();
    const doc = {
      workflow_id: workflowId,
      version,
      draft_id: draftId,
      title: workflow.title,
      description: workflow.description,
      institution_type: workflow.scope?.institution_type ?? null,
      schema_version: workflow.schema_version,
      review_status: workflow.metadata?.review_status ?? REVIEW_STATUS.PENDING,
      document: workflow,
      is_latest: true,
      retrieval: {
        text,
        embedding,
        aliases_lower: renderAliasesLower(workflow),
        ...embeddingMetadata(),
      },
      created_at: now,
      updated_at: now,
    };

    // Demote the previous latest, then insert. Order matters: if the insert
    // fails, we would rather have zero `is_latest` than two.
    await templates.updateMany(
      { workflow_id: workflowId, is_latest: true },
      { $set: { is_latest: false, updated_at: now } }
    );
    await templates.insertOne(doc);

    logger.info("template saved", { workflowId, version, embedded: true });
    return { id: workflowId, version };
  }

  async getById(workflowId, version) {
    const templates = await this.#collection();
    const query = version
      ? { workflow_id: workflowId, version: Number(version) }
      : { workflow_id: workflowId, is_latest: true };

    const doc = await templates.findOne(query);
    return doc?.document ?? null;
  }

  /** Returns the full stored row (not just `document`) - needed by the admin UI. */
  async getRecord(workflowId, version) {
    const templates = await this.#collection();
    const query = version
      ? { workflow_id: workflowId, version: Number(version) }
      : { workflow_id: workflowId, is_latest: true };
    return templates.findOne(query);
  }

  async list(filters = {}) {
    const templates = await this.#collection();
    const query = { is_latest: true };
    if (filters.institution_type) query.institution_type = filters.institution_type;
    if (filters.review_status) query.review_status = filters.review_status;

    const docs = await templates.find(query).sort({ updated_at: -1 }).toArray();
    return docs.map(summarize);
  }

  async search(query) {
    const templates = await this.#collection();
    const needle = query.trim();
    if (!needle) return [];

    // Case-insensitive substring over title + description, matching the
    // semantics of FileWorkflowStore.search so behaviour is unchanged.
    const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const docs = await templates
      .find({ is_latest: true, $or: [{ title: rx }, { description: rx }] })
      .toArray();
    return docs.map(summarize);
  }

  async update(workflowId, workflow, options = {}) {
    return this.save({ ...workflow, workflow_id: workflowId }, options);
  }

  /** Flips a template to `confirmed`, making it selectable. Admin "Publish". */
  async setReviewStatus(workflowId, version, reviewStatus) {
    const templates = await this.#collection();
    const result = await templates.findOneAndUpdate(
      { workflow_id: workflowId, version: Number(version) },
      {
        $set: {
          review_status: reviewStatus,
          "document.metadata.review_status": reviewStatus,
          updated_at: new Date(),
        },
      },
      { returnDocument: "after" }
    );
    return result ? summarize(result) : null;
  }

  /**
   * Loads every selectable candidate for in-memory vector search.
   * Projects ONLY the fields the ranker needs - pulling `document` for 50
   * templates would move megabytes per query for no reason.
   */
  async listForRetrieval({ institutionType } = {}) {
    const templates = await this.#collection();
    const query = { is_latest: true, review_status: REVIEW_STATUS.CONFIRMED };
    if (institutionType) query.institution_type = institutionType;

    return templates
      .find(query, {
        projection: {
          workflow_id: 1,
          version: 1,
          title: 1,
          description: 1,
          "retrieval.embedding": 1,
          "retrieval.aliases_lower": 1,
          "retrieval.text": 1,
          "document.retrieval_summary": 1,
        },
      })
      .toArray();
  }
}
```

> **Note on `update()`.** `FileWorkflowStore.update` is `save()` with the id forced, and `MongoWorkflowStore` keeps that exact semantic: *update means a new version, full history retained*. Nothing in the API layer notices the swap.

### 4.9 Wire it up in `src/index.js`

```js
import express from "express";
import { config } from "./config/env.js";
import { createRoutes } from "./api/routes.js";
import { MongoWorkflowStore } from "./knowledgeBank/mongoStore.js";
import { DraftStore } from "./knowledgeBank/draftStore.js";
import { ensureIndexes, } from "./db/indexes.js";
import { closeDb } from "./db/mongoClient.js";
import { logger } from "./utils/logger.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Composition root: the ONE place concrete implementations are chosen.
// Every other module receives them as arguments and depends only on the
// interface. Swapping MongoWorkflowStore for FileWorkflowStore is a one-line
// change here and nowhere else.
const store = new MongoWorkflowStore();
const draftStore = new DraftStore();

await ensureIndexes();

app.use("/api", createRoutes({ store, draftStore }));

const server = app.listen(config.port, () => {
  logger.info(`Server listening on port ${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    logger.info("shutting down", { signal });
    server.close();
    await closeDb();
    process.exit(0);
  });
}
```

> `createRoutes` now takes an **object** instead of a positional `store`. Update its signature to `export function createRoutes({ store, draftStore, selector })` — named dependencies stop the argument list from becoming positional soup as Phase 7 adds more.

### 4.10 🔧 MANUAL — `scripts/initDb.js` and first run

```js
import { ensureIndexes } from "../src/db/indexes.js";
import { closeDb, getDb } from "../src/db/mongoClient.js";
import { config } from "../src/config/env.js";

const db = await getDb();
await ensureIndexes();

console.log(`database   : ${config.mongo.db}`);
for (const c of await db.listCollections().toArray()) {
  const indexes = await db.collection(c.name).indexes();
  console.log(`  ${c.name.padEnd(20)} ${indexes.map((i) => i.name).join(", ")}`);
}
await closeDb();
```

Add to `package.json`: `"init-db": "node scripts/initDb.js"`, then run `npm run init-db`.

Also promote `MONGODB_URI` into `REQUIRED_VARS` now.

### 4.11 Tests

`tests/mongoStore.test.js` — mirror `tests/fileStore.test.js` case for case. Point `MONGODB_DB` at a throwaway database name in `before()` and drop it in `after()`. Stub the embedding call so the suite stays offline:

```js
import test, { before, after } from "node:test";
import assert from "node:assert/strict";

process.env.MONGODB_DB = `unblock_test_${Date.now()}`;

// Stub embeddings so this suite needs no network. Deterministic pseudo-vector
// keyed off the text so different inputs still rank differently.
const { default: embeddings } = await import("../src/retrieval/embeddings.js");
// (In practice: extract an injectable `embedder` parameter on MongoWorkflowStore's
//  constructor rather than monkey-patching a module. Dependency injection over
//  module mutation - see the SOLID rules in §0.4.)
```

> **Design correction worth making here.** Rather than stubbing the module, give `MongoWorkflowStore` an injectable embedder:
> ```js
> constructor({ embedder = embedDocument } = {}) { super(); this.embedder = embedder; }
> ```
> Then the test constructs `new MongoWorkflowStore({ embedder: fakeEmbedder })`. This is Dependency Inversion applied where it actually pays: the test is offline, fast, and deterministic, and production code is unchanged.

Cases to cover: save creates v1 → save again bumps to v2 and demotes `is_latest` → `getById` defaults to latest → `getById(id, 1)` returns v1 → `list` filters by `institution_type` → `search` is case-insensitive → `setReviewStatus` flips both the row and `document.metadata.review_status` → `listForRetrieval` excludes `pending_admin_review`.

### 4.12 ✅ Verify Phase 4

```bash
npm run init-db     # prints collections + index names
npm test            # fileStore suite AND the new mongoStore suite pass
npm start           # server boots, logs "mongo connected"
```

Then exercise the unchanged API against Mongo:

```bash
curl -s http://localhost:3000/api/workflows            # -> []
# POST a fixture workflow, then:
curl -s http://localhost:3000/api/workflows            # -> one summary
```

**Done when:** every endpoint in `src/api/routes.js` behaves identically to before, but data lands in Mongo. Confirm with `mongosh unblock_ai --eval "db.templates.countDocuments()"`.

---

## Phase 5 — Vector search: interface, in-memory ranking, alias boost

**Goal:** given a query string, return the top-K most relevant *confirmed* templates, with scores.

### 5.1 The design constraint

Local MongoDB has no vector search — `$vectorSearch` is Atlas-only. Below roughly 200 templates that genuinely does not matter: load the candidates and cosine-sort in Node. It is O(n) over a few hundred 1536-float arrays, which is sub-millisecond, and it keeps the whole system runnable offline.

The important part is that this is **hidden behind an interface**, so moving to Atlas later is a swap at the composition root and nothing else changes. This mirrors the existing `WorkflowStore` / `FileWorkflowStore` split.

### 5.2 Files

| Action | Path |
|---|---|
| Create | `src/retrieval/vectorStore.js` (abstract interface) |
| Create | `src/retrieval/inMemoryVectorStore.js` |
| Create | `src/retrieval/aliasBoost.js` |
| Create | `src/retrieval/retriever.js` (orchestrates embed → search → boost) |
| Create | `tests/vectorStore.test.js` |
| Create | `tests/aliasBoost.test.js` |

### 5.3 `src/retrieval/vectorStore.js` — the contract

```js
/**
 * The retrieval contract. Two implementations exist:
 *   - InMemoryVectorStore : cosine in Node, works with any MongoDB
 *   - AtlasVectorStore    : $vectorSearch aggregation (Phase 14)
 *
 * Both return the SAME shape, so the Selector Agent cannot tell them apart.
 * That is the entire point of this file existing.
 */
export class VectorStore {
  /**
   * @param {number[]} queryVector  L2-normalized query embedding
   * @param {object}   options
   * @param {number}   options.k                how many candidates to return
   * @param {string=}  options.institutionType  optional pre-filter
   * @returns {Promise<Candidate[]>} sorted by score, highest first
   */
  async search(queryVector, options) {
    throw new Error("Not implemented");
  }
}

/**
 * @typedef {object} Candidate
 * @property {string}   workflow_id
 * @property {number}   version
 * @property {string}   title
 * @property {number}   score            cosine similarity, 0..1
 * @property {string[]} aliases_lower
 * @property {object}   retrieval_summary  the full structured summary
 * @property {string}   retrieval_text     what was actually embedded
 */
```

### 5.4 `src/retrieval/inMemoryVectorStore.js`

```js
import { VectorStore } from "./vectorStore.js";
import { cosineSimilarity } from "./vectorMath.js";

/**
 * Exhaustive cosine search over every confirmed template.
 *
 * Complexity is O(n * d) - with n <= 200 templates and d = 1536 that is
 * ~300k float multiplications, well under a millisecond. When n grows past a
 * few hundred, swap in AtlasVectorStore; the interface does not change.
 */
export class InMemoryVectorStore extends VectorStore {
  /** @param {{ listForRetrieval: Function }} templateSource - the MongoWorkflowStore */
  constructor(templateSource) {
    super();
    this.templateSource = templateSource;
  }

  async search(queryVector, { k = 5, institutionType } = {}) {
    const rows = await this.templateSource.listForRetrieval({ institutionType });

    return rows
      .map((row) => ({
        workflow_id: row.workflow_id,
        version: row.version,
        title: row.title,
        description: row.description,
        score: cosineSimilarity(queryVector, row.retrieval.embedding),
        aliases_lower: row.retrieval.aliases_lower ?? [],
        retrieval_summary: row.document?.retrieval_summary ?? null,
        retrieval_text: row.retrieval.text,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
```

### 5.5 `src/retrieval/aliasBoost.js` — pure, testable, tunable

```js
import { config } from "../config/env.js";

/**
 * Lexical rescue for exact-token matches.
 *
 * Embeddings are weak on rare tokens - codes like "AR-7", proper nouns like
 * "Faculty of IT". If the user's query literally contains one of a template's
 * aliases, that is a strong signal that cosine similarity systematically
 * under-weights. A flat additive boost fixes it without a BM25 index.
 *
 * Why not BM25? At 2-50 templates a full lexical index is machinery you cannot
 * justify. The single failure it protects against is rare exact tokens, and
 * `aliases` addresses that directly. When the corpus grows, Atlas $rankFusion
 * combines $vectorSearch with text scoring in one query - an upgrade, not a
 * rewrite.
 *
 * PURE FUNCTION: no I/O. Exhaustively unit-testable.
 */
export function applyAliasBoost(candidates, userQuery, boost = config.retrieval.aliasBoost) {
  const haystack = userQuery.toLowerCase();

  return candidates
    .map((candidate) => {
      const matched = (candidate.aliases_lower ?? []).filter((alias) =>
        haystack.includes(alias)
      );

      return {
        ...candidate,
        score: candidate.score + (matched.length > 0 ? boost : 0),
        base_score: candidate.score,     // keep the raw value for debugging
        alias_hits: matched,             // WHY this candidate moved up
      };
    })
    .sort((a, b) => b.score - a.score);
}
```

> `base_score` and `alias_hits` are not decoration. When a selection goes wrong, the first question is always "why was this ranked first?" — and these two fields answer it without a re-run.

### 5.6 `src/retrieval/retriever.js` — the orchestrator

```js
import { embedQuery } from "./embeddings.js";
import { applyAliasBoost } from "./aliasBoost.js";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Turns a user query into a ranked candidate list.
 *
 * Composed of three single-purpose pieces (embed, search, boost), each
 * independently testable. This class only sequences them - it contains no
 * ranking logic of its own, so there is exactly one place each concern lives.
 */
export class Retriever {
  constructor(vectorStore, { k = config.retrieval.topK } = {}) {
    this.vectorStore = vectorStore;
    this.k = k;
  }

  async retrieve(userQuery, { institutionType } = {}) {
    const queryVector = await embedQuery(userQuery);

    // Over-fetch slightly so the alias boost has room to reorder meaningfully.
    const raw = await this.vectorStore.search(queryVector, {
      k: this.k + 2,
      institutionType,
    });

    const boosted = applyAliasBoost(raw, userQuery).slice(0, this.k);

    logger.debug("retrieved candidates", {
      query: userQuery.slice(0, 80),
      candidates: boosted.map((c) => ({
        id: c.workflow_id,
        score: Number(c.score.toFixed(4)),
        alias_hits: c.alias_hits,
      })),
    });

    return boosted;
  }
}
```

### 5.7 Tests

`tests/aliasBoost.test.js` — pure-function coverage, no Mongo, no network:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { applyAliasBoost } from "../src/retrieval/aliasBoost.js";

const candidates = [
  { workflow_id: "a", score: 0.70, aliases_lower: ["overseas leave"] },
  { workflow_id: "b", score: 0.75, aliases_lower: ["hall booking"] },
];

test("an alias hit can overtake a higher raw score", () => {
  const out = applyAliasBoost(candidates, "I need overseas leave", 0.15);
  assert.equal(out[0].workflow_id, "a");
  assert.ok(Math.abs(out[0].score - 0.85) < 1e-9);
  assert.deepEqual(out[0].alias_hits, ["overseas leave"]);
});

test("no alias hit leaves the ordering untouched", () => {
  const out = applyAliasBoost(candidates, "something unrelated", 0.15);
  assert.equal(out[0].workflow_id, "b");
  assert.deepEqual(out[0].alias_hits, []);
});

test("matching is case-insensitive", () => {
  const out = applyAliasBoost(candidates, "OVERSEAS LEAVE please", 0.15);
  assert.equal(out[0].workflow_id, "a");
});

test("base_score is preserved for debugging", () => {
  const out = applyAliasBoost(candidates, "overseas leave", 0.15);
  assert.equal(out[0].base_score, 0.70);
});

test("candidates without aliases do not crash", () => {
  const out = applyAliasBoost([{ workflow_id: "c", score: 0.5 }], "anything", 0.15);
  assert.equal(out[0].score, 0.5);
});
```

`tests/vectorStore.test.js` — feed `InMemoryVectorStore` a fake `templateSource` returning three hand-built 4-dimensional vectors and assert the ordering, the `k` cutoff, and that `listForRetrieval`'s filter arguments are passed through.

### 5.8 ✅ Verify Phase 5

Save two or three real templates through the API (so they get embedded), flip them to `confirmed`, then:

```bash
node -e "
import('./src/knowledgeBank/mongoStore.js').then(async ({ MongoWorkflowStore }) => {
  const { InMemoryVectorStore } = await import('./src/retrieval/inMemoryVectorStore.js');
  const { Retriever } = await import('./src/retrieval/retriever.js');
  const r = new Retriever(new InMemoryVectorStore(new MongoWorkflowStore()));
  console.table((await r.retrieve('I want to apply for overseas leave'))
    .map(c => ({ id: c.workflow_id, score: c.score.toFixed(4), hits: c.alias_hits.join('|') })));
  process.exit(0);
});"
```

**Done when:** the expected template appears in the top-5 with a score meaningfully above the unrelated ones (typically >0.35 for a genuine match, with a visible gap to noise).

---

## Phase 6 — The Selector Agent

**Goal:** given a user query and the retrieved candidates, decide which workflow they mean — or ask exactly one good clarifying question.

### 6.1 The one structural rule

> **Retrieval narrows, the LLM decides.**

Cosine similarity is an uncalibrated signal. A score of 0.62 means nothing on its own: it might be a perfect match in a corpus of dissimilar workflows or a near-miss in a corpus of similar ones. Never threshold on it to pick a workflow. Retrieval's job is to get the right answer *into a set of five*; the LLM's job is to choose within that set, using the structured summaries — especially `not_for`.

### 6.2 Files

| Action | Path |
|---|---|
| Create | `src/selector/selectorPrompt.js` |
| Create | `src/selector/decisionSchema.js` |
| Create | `src/selector/selectorAgent.js` |
| Create | `src/selector/selectionSessionStore.js` |
| Create | `src/selector/selectionService.js` |
| Create | `tests/selectorAgent.test.js` |

### 6.3 `src/selector/decisionSchema.js` — structured output contract

```js
/**
 * The Selector's output schema, enforced by Azure OpenAI structured output
 * (`strict: true`). Deliberately small and flat: strict mode requires every
 * property in `required` and `additionalProperties: false` throughout.
 *
 * Note `manual_choice` is NOT in this enum. The LLM never produces it - it is
 * produced by the loop in selectionService.js after the round cap is hit.
 * Keeping it out of the model's vocabulary stops it being emitted early.
 */
export const decisionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "workflow_id", "confidence", "question", "options", "reasoning"],
  properties: {
    decision: {
      type: "string",
      enum: ["matched", "ambiguous", "no_match"],
    },
    workflow_id: {
      type: ["string", "null"],
      description: "Set ONLY when decision is 'matched'. Must be one of the given candidate ids.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    question: {
      type: ["string", "null"],
      description: "Set ONLY when decision is 'ambiguous'. Exactly one question.",
    },
    options: {
      type: "array",
      items: { type: "string" },
      description: "User-facing answer options for `question`. Empty array when not ambiguous.",
    },
    reasoning: {
      type: "string",
      description: "Logged for debugging. NEVER shown to the user.",
    },
  },
};

export const DECISION_SCHEMA_NAME = "workflow_selection_decision";
```

### 6.4 `src/selector/selectorPrompt.js`

```js
export const SELECTOR_SYSTEM_PROMPT = `You help a person find the correct institutional workflow for what they are trying to do.

You are given the person's request and a short list of CANDIDATE workflows that a search system retrieved. Your job is to decide which candidate they mean, or to ask one clarifying question.

## Rules you must not break

1. You may ONLY choose a workflow_id that appears in the candidate list. Never invent one, never modify one, never combine two.

2. If two candidates differ on ONE attribute - faculty, requester type, staff vs student, local vs overseas - that attribute IS the question. Ask about the attribute, not about the workflow names.
   GOOD: "Which faculty are you attached to?"
   BAD:  "Did you mean 'IT Faculty Overseas Leave' or 'Engineering Faculty Overseas Leave'?"
   The person knows their own faculty. They do not know your workflow names.

3. Ask exactly ONE question at a time, and always supply concrete answer options.

4. Read the "Not for" line of every candidate carefully. It is the strongest disqualifying evidence you have. If the person's request matches something in a candidate's "Not for" list, that candidate is wrong even when its wording looks close.

5. If nothing genuinely fits, return "no_match". Do NOT stretch to the nearest option. A wrong workflow sends real approvals to the wrong people; an honest miss just asks the person to rephrase.

6. "matched" with "low" confidence is not allowed. If you are not at least moderately sure, return "ambiguous" and ask.

7. Use everything the person has already told you across the whole conversation, including answers to earlier clarifying questions.

## Output

Return only the structured object. `reasoning` is for engineers reading logs - be specific about which candidate attribute decided it. The person never sees `reasoning`.`;

/**
 * Renders candidates for the prompt.
 *
 * Give the model the FULL structured summary, not just the title. `not_for` is
 * the whole reason this works on near-identical workflows, and it is invisible
 * unless you print it.
 */
export function renderCandidates(candidates) {
  return candidates
    .map((c, i) => {
      const s = c.retrieval_summary ?? {};
      const line = (label, arr) => (arr?.length ? `\n   ${label}: ${arr.join(", ")}` : "");

      return [
        `${i + 1}. workflow_id: ${c.workflow_id}`,
        `   Title: ${c.title}`,
        `   What it is: ${s.one_liner ?? c.description ?? "(no summary)"}`,
        line("Also known as", s.aliases),
        line("Applies to", s.requester_types),
        line("Use when", s.triggers),
        line("NOT FOR", s.not_for),
        `\n   (retrieval score: ${c.score.toFixed(3)})`,
      ].join("");
    })
    .join("\n\n");
}

/**
 * Builds the message array.
 *
 * `transcript` carries the full conversation: the original request plus every
 * clarifying question and answer. Rebuilding it each round is what lets the
 * model use the person's answer without re-running retrieval.
 */
export function buildSelectorMessages({ candidates, transcript }) {
  const conversation = transcript
    .map((turn) => `${turn.role === "user" ? "Person" : "You asked"}: ${turn.text}`)
    .join("\n");

  return [
    { role: "system", content: SELECTOR_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "## Conversation so far",
        conversation,
        "",
        "## Candidate workflows",
        renderCandidates(candidates),
        "",
        "Decide now.",
      ].join("\n"),
    },
  ];
}
```

### 6.5 `src/selector/selectorAgent.js` — one call, validated output

```js
import { azureClient } from "../llm/azureClient.js";
import { config } from "../config/env.js";
import { buildSelectorMessages } from "./selectorPrompt.js";
import { decisionSchema, DECISION_SCHEMA_NAME } from "./decisionSchema.js";
import { SELECTION_DECISION } from "../config/constants.js";
import { logger } from "../utils/logger.js";

export class SelectionError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = "SelectionError";
    if (cause) this.cause = cause;
  }
}

const REASONING_MODEL_PATTERN = /^(o\d|gpt-5)/i;

/**
 * Makes exactly ONE model call to choose among candidates.
 *
 * This class does not retrieve, does not persist, and does not manage the
 * clarifying loop. It converts (candidates, transcript) into a decision. That
 * narrow responsibility is what makes it testable with a stubbed client.
 */
export class SelectorAgent {
  constructor({ client = azureClient, deployment = config.azure.selectorDeployment } = {}) {
    this.client = client;
    this.deployment = deployment;
  }

  async decide(candidates, transcript) {
    if (candidates.length === 0) {
      // No candidates means retrieval found nothing selectable. Do not spend a
      // model call to be told the obvious.
      return {
        decision: SELECTION_DECISION.NO_MATCH,
        workflow_id: null,
        confidence: "high",
        question: null,
        options: [],
        reasoning: "No confirmed templates were retrieved for this query.",
      };
    }

    const messages = buildSelectorMessages({ candidates, transcript });

    let raw;
    try {
      const response = await this.client.chat.completions.create({
        model: this.deployment,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: { name: DECISION_SCHEMA_NAME, schema: decisionSchema, strict: true },
        },
        ...(REASONING_MODEL_PATTERN.test(this.deployment) ? {} : { temperature: 0 }),
      });
      raw = JSON.parse(response.choices[0].message.content);
    } catch (err) {
      throw new SelectionError(`Selector call failed: ${err.message}`, { cause: err });
    }

    return this.#sanitize(raw, candidates);
  }

  /**
   * Enforces the invariants the prompt asks for but a model can still violate.
   * Structured output guarantees the SHAPE; it guarantees nothing about the
   * SEMANTICS. These three checks are cheap and prevent the two worst failures:
   * a hallucinated workflow_id, and a confident-sounding low-confidence match.
   */
  #sanitize(decision, candidates) {
    const validIds = new Set(candidates.map((c) => c.workflow_id));

    // 1. Never accept an id that was not offered.
    if (decision.decision === SELECTION_DECISION.MATCHED && !validIds.has(decision.workflow_id)) {
      logger.warn("selector hallucinated a workflow_id", {
        returned: decision.workflow_id,
        offered: [...validIds],
      });
      return {
        ...decision,
        decision: SELECTION_DECISION.AMBIGUOUS,
        workflow_id: null,
        question: decision.question ?? "Could you describe what you need in a bit more detail?",
        options: [],
      };
    }

    // 2. A low-confidence match is an ambiguity wearing a disguise.
    if (decision.decision === SELECTION_DECISION.MATCHED && decision.confidence === "low") {
      logger.info("downgrading low-confidence match to ambiguous", {
        workflow_id: decision.workflow_id,
      });
      return {
        ...decision,
        decision: SELECTION_DECISION.AMBIGUOUS,
        workflow_id: null,
        question: decision.question ?? "Which of these best describes your situation?",
        options: decision.options?.length ? decision.options : candidates.map((c) => c.title),
      };
    }

    // 3. An ambiguous verdict with no question is unusable.
    if (decision.decision === SELECTION_DECISION.AMBIGUOUS && !decision.question) {
      return {
        ...decision,
        question: "Which of these best describes what you need?",
        options: candidates.map((c) => c.title),
      };
    }

    return decision;
  }
}
```

### 6.6 `src/selector/selectionSessionStore.js`

```js
import { collection } from "../db/mongoClient.js";
import { COLLECTIONS } from "../config/constants.js";
import { toObjectId } from "../knowledgeBank/draftStore.js";

/**
 * Persists selection sessions.
 *
 * Two jobs, both important:
 *  1. Operational - holds the frozen candidate list between clarifying rounds.
 *  2. Evaluation  - after a few weeks of real traffic this collection IS your
 *     evaluation set, including the losing candidates and their scores.
 */
export class SelectionSessionStore {
  async #collection() {
    return collection(COLLECTIONS.SELECTION_SESSIONS);
  }

  async create({ userQuery, candidates, requesterContext = null }) {
    const sessions = await this.#collection();
    const now = new Date();

    const doc = {
      user_query: userQuery,
      // Store a SLIM projection - never the 1536-float embedding. Sessions are
      // written on every request; embeddings would bloat the collection for
      // data that is already on the template document.
      candidates: candidates.map((c) => ({
        workflow_id: c.workflow_id,
        version: c.version,
        title: c.title,
        score: c.score,
        base_score: c.base_score ?? c.score,
        alias_hits: c.alias_hits ?? [],
        retrieval_summary: c.retrieval_summary,
      })),
      rounds: [],
      outcome: null,
      selected_workflow_id: null,
      requester_context: requesterContext,
      created_at: now,
      updated_at: now,
    };

    const { insertedId } = await sessions.insertOne(doc);
    return { ...doc, _id: insertedId };
  }

  async getById(id) {
    const sessions = await this.#collection();
    return sessions.findOne({ _id: toObjectId(id) });
  }

  async appendQuestion(id, { question, options }) {
    const sessions = await this.#collection();
    await sessions.updateOne(
      { _id: toObjectId(id) },
      {
        $push: { rounds: { question, options, answer: null, asked_at: new Date(), answered_at: null } },
        $set: { updated_at: new Date() },
      }
    );
    return this.getById(id);
  }

  /** Fills in the answer to the most recent unanswered question. */
  async recordAnswer(id, answer) {
    const session = await this.getById(id);
    const index = session.rounds.findIndex((r) => r.answer === null);
    if (index === -1) throw new Error("No open question to answer on this session");

    const sessions = await this.#collection();
    await sessions.updateOne(
      { _id: toObjectId(id) },
      {
        $set: {
          [`rounds.${index}.answer`]: answer,
          [`rounds.${index}.answered_at`]: new Date(),
          updated_at: new Date(),
        },
      }
    );
    return this.getById(id);
  }

  async finalize(id, { outcome, selectedWorkflowId = null }) {
    const sessions = await this.#collection();
    await sessions.updateOne(
      { _id: toObjectId(id) },
      { $set: { outcome, selected_workflow_id: selectedWorkflowId, updated_at: new Date() } }
    );
    return this.getById(id);
  }
}
```

### 6.7 `src/selector/selectionService.js` — the clarifying loop

This is the piece the original draft plan had backwards. Read §6.8 before implementing.

```js
import { config } from "../config/env.js";
import { SELECTION_DECISION, SESSION_OUTCOME } from "../config/constants.js";
import { logger } from "../utils/logger.js";

/**
 * Orchestrates one selection conversation across multiple rounds.
 *
 * Dependencies are injected, not imported: the service depends on the
 * Retriever / SelectorAgent / SessionStore INTERFACES, never on their concrete
 * construction. That is what lets the whole loop be tested with three tiny
 * fakes and no network at all.
 */
export class SelectionService {
  constructor({ retriever, selectorAgent, sessionStore, maxRounds = config.retrieval.maxRounds }) {
    this.retriever = retriever;
    this.selectorAgent = selectorAgent;
    this.sessionStore = sessionStore;
    this.maxRounds = maxRounds;
  }

  /** Round 1: retrieve ONCE, decide, persist the session. */
  async start(userQuery, { requesterContext = null, institutionType = null } = {}) {
    const candidates = await this.retriever.retrieve(userQuery, { institutionType });
    const session = await this.sessionStore.create({ userQuery, candidates, requesterContext });

    const transcript = [{ role: "user", text: userQuery }];
    const decision = await this.selectorAgent.decide(candidates, transcript);

    return this.#apply(session, decision, candidates);
  }

  /**
   * Round 2+: the person answered a clarifying question.
   *
   * CRITICAL: this does NOT re-run retrieval. See the reasoning in the plan
   * document (Phase 6.8). The candidate set from round one is already correct;
   * the ambiguity is about choosing WITHIN it.
   */
  async answer(sessionId, answerText) {
    const session = await this.sessionStore.recordAnswer(sessionId, answerText);
    const candidates = session.candidates;

    // Rebuild the full conversation so the model sees the original request
    // AND every question/answer pair.
    const transcript = [
      { role: "user", text: session.user_query },
      ...session.rounds.flatMap((r) => [
        { role: "assistant", text: r.question },
        ...(r.answer ? [{ role: "user", text: r.answer }] : []),
      ]),
    ];

    const decision = await this.selectorAgent.decide(candidates, transcript);
    return this.#apply(session, decision, candidates);
  }

  /**
   * Maps a raw decision onto a persisted session state and a client response.
   * The round cap lives here, in exactly one place.
   */
  async #apply(session, decision, candidates) {
    const sessionId = session._id;
    const roundsUsed = session.rounds?.length ?? 0;

    if (decision.decision === SELECTION_DECISION.MATCHED) {
      await this.sessionStore.finalize(sessionId, {
        outcome: SESSION_OUTCOME.MATCHED,
        selectedWorkflowId: decision.workflow_id,
      });
      logger.info("selection matched", {
        sessionId: String(sessionId),
        workflow_id: decision.workflow_id,
        rounds: roundsUsed,
        reasoning: decision.reasoning,
      });
      return this.#response(sessionId, decision, candidates);
    }

    if (decision.decision === SELECTION_DECISION.NO_MATCH) {
      await this.sessionStore.finalize(sessionId, { outcome: SESSION_OUTCOME.NO_MATCH });
      return this.#response(sessionId, decision, candidates);
    }

    // Ambiguous. Have we already used our question budget?
    if (roundsUsed >= this.maxRounds) {
      logger.info("round cap reached, falling back to manual choice", {
        sessionId: String(sessionId),
        rounds: roundsUsed,
      });
      return this.#response(
        sessionId,
        {
          ...decision,
          decision: SELECTION_DECISION.MANUAL_CHOICE,
          question: "I could not narrow it down. Which of these do you want?",
          options: candidates.map((c) => c.title),
        },
        candidates
      );
    }

    await this.sessionStore.appendQuestion(sessionId, {
      question: decision.question,
      options: decision.options,
    });
    return this.#response(sessionId, decision, candidates);
  }

  /** The single response shape every entry point returns. `reasoning` is stripped. */
  #response(sessionId, decision, candidates) {
    return {
      session_id: String(sessionId),
      decision: decision.decision,
      workflow_id: decision.workflow_id ?? null,
      confidence: decision.confidence,
      question: decision.question ?? null,
      options: decision.options ?? [],
      candidates: candidates.map((c) => ({
        workflow_id: c.workflow_id,
        title: c.title,
        one_liner: c.retrieval_summary?.one_liner ?? c.description ?? null,
        score: Number(c.score.toFixed(4)),
      })),
    };
  }

  /** The person picked from the manual-choice list. Terminal. */
  async choose(sessionId, workflowId) {
    const session = await this.sessionStore.getById(sessionId);
    const chosen = session.candidates.find((c) => c.workflow_id === workflowId);
    if (!chosen) throw new Error(`'${workflowId}' was not among this session's candidates`);

    await this.sessionStore.finalize(sessionId, {
      outcome: SESSION_OUTCOME.MATCHED,
      selectedWorkflowId: workflowId,
    });
    return { session_id: String(sessionId), decision: SELECTION_DECISION.MATCHED, workflow_id: workflowId };
  }
}
```

### 6.8 Why the loop does NOT re-run retrieval

The draft plan re-ran similarity search after the person's answer. **That is wrong, and it is worth understanding why before you implement it differently by accident.**

Suppose the query is *"I want to apply for overseas leave"* and the answer to *"which faculty?"* is *"IT"*. If you concatenate them and re-embed:

1. **The signal barely moves.** Appending two characters to a 40-word query perturbs the embedding by a rounding error. You pay a full embedding round-trip for essentially the same vector.
2. **It can actively lose the answer.** Re-search returns a *fresh* top-5. There is no guarantee the correct candidate that round one found is still in it — a slightly-shifted vector can drop it below the cutoff. You would be discarding a correct result to re-derive it less reliably.
3. **It solves the wrong problem.** The person's answer is not new *search* information; it is *disambiguation* information. The right set is already on the table. What changed is which member of it applies.

So: **retrieve once, decide many times.** The candidate list is frozen on the session document at round one, and every subsequent round replays the growing transcript against that same fixed list.

**Cap at two rounds.** Three questions before a leave request even starts is worse UX than a list of five titles. After the cap, hand over the list and let the person point at one.

### 6.9 Tests

`tests/selectorAgent.test.js` — inject a fake client, no network:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { SelectorAgent } from "../src/selector/selectorAgent.js";

const fakeClient = (payload) => ({
  chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) } },
});

const candidates = [
  { workflow_id: "it_leave", title: "IT Overseas Leave", score: 0.8, retrieval_summary: { one_liner: "x" } },
  { workflow_id: "eng_leave", title: "Eng Overseas Leave", score: 0.79, retrieval_summary: { one_liner: "y" } },
];

test("a hallucinated workflow_id is downgraded to ambiguous", async () => {
  const agent = new SelectorAgent({
    client: fakeClient({ decision: "matched", workflow_id: "invented_id", confidence: "high", question: null, options: [], reasoning: "" }),
  });
  const out = await agent.decide(candidates, [{ role: "user", text: "leave" }]);
  assert.equal(out.decision, "ambiguous");
  assert.equal(out.workflow_id, null);
});

test("a low-confidence match is downgraded to ambiguous", async () => {
  const agent = new SelectorAgent({
    client: fakeClient({ decision: "matched", workflow_id: "it_leave", confidence: "low", question: null, options: [], reasoning: "" }),
  });
  const out = await agent.decide(candidates, [{ role: "user", text: "leave" }]);
  assert.equal(out.decision, "ambiguous");
  assert.ok(out.options.length > 0, "must offer options when falling back");
});

test("an ambiguous verdict without a question gets one", async () => {
  const agent = new SelectorAgent({
    client: fakeClient({ decision: "ambiguous", workflow_id: null, confidence: "medium", question: null, options: [], reasoning: "" }),
  });
  const out = await agent.decide(candidates, [{ role: "user", text: "leave" }]);
  assert.ok(out.question);
});

test("empty candidates short-circuit to no_match without a model call", async () => {
  let called = false;
  const agent = new SelectorAgent({
    client: { chat: { completions: { create: async () => { called = true; } } } },
  });
  const out = await agent.decide([], [{ role: "user", text: "anything" }]);
  assert.equal(out.decision, "no_match");
  assert.equal(called, false);
});
```

Add a `tests/selectionService.test.js` with fake retriever/agent/store covering: matched on round 1 finalizes the session; ambiguous appends a question; two ambiguous rounds produce `manual_choice`; and — the important one — **`answer()` never calls `retriever.retrieve`** (assert the fake's call count stays at 1).

### 6.10 ✅ Verify Phase 6

**Done when:** all offline selector tests pass, and a live end-to-end run against two deliberately-similar seeded templates (e.g. IT vs Engineering overseas leave) produces `ambiguous` with a question about *faculty*, not about workflow names.

---

## Phase 7 — Backend HTTP surface

**Goal:** expose drafts, template review, and selection over HTTP so the frontend has something to call.

### 7.1 Files

| Action | Path |
|---|---|
| Modify | `src/api/routes.js` (accept the dependency object; keep existing routes) |
| Create | `src/api/draftRoutes.js` |
| Create | `src/api/selectionRoutes.js` |
| Create | `src/api/middleware/asyncHandler.js` |
| Create | `src/api/middleware/errorHandler.js` |
| Create | `src/api/middleware/cors.js` |
| Modify | `tests/routes.test.js` |

### 7.2 Extract the shared middleware

`asyncHandler` is currently defined inline in `routes.js`. Three route files will need it, so move it out — this is the smallest possible DRY fix and it costs nothing.

`src/api/middleware/asyncHandler.js`:

```js
/** Routes rejected promises into Express's error pipeline instead of crashing. */
export const asyncHandler = (fn) => (req, res, next) => fn(req, res, next).catch(next);
```

`src/api/middleware/errorHandler.js` — one error policy for the whole API:

```js
import { ExtractionError } from "../../llm/extractWorkflow.js";
import { SelectionError } from "../../selector/selectorAgent.js";
import { EmbeddingError } from "../../retrieval/embeddings.js";
import { logger } from "../../utils/logger.js";

/**
 * Maps typed errors to HTTP status codes in ONE place.
 *
 * Adding a new error type is one entry here, not a try/catch in every handler.
 * Anything unrecognised is a 500 with a logged stack and a generic client
 * message - never leak internals to the client.
 */
const STATUS_BY_ERROR = new Map([
  [ExtractionError, 422],
  [SelectionError, 502],
  [EmbeddingError, 502],
]);

export function errorHandler(err, req, res, next) {
  for (const [ErrorType, status] of STATUS_BY_ERROR) {
    if (err instanceof ErrorType) {
      logger.warn("handled error", { type: err.name, message: err.message });
      return res.status(status).json({ error: err.message, details: err.cause ?? null });
    }
  }

  logger.error("unhandled route error", { message: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
}
```

`src/api/middleware/cors.js` — the Next.js app is on a different origin:

```js
/**
 * Minimal CORS for local development: Next.js on :3001 calling Express on :3000
 * is a cross-origin request and the browser will block it without these headers.
 *
 * PRODUCTION NOTE: replace the wildcard with the real frontend origin, or put
 * both behind one reverse proxy and delete this middleware entirely.
 */
export function cors(req, res, next) {
  res.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "http://localhost:3001");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}
```

Mount it in `src/index.js` with `app.use(cors)` **before** the routes.

### 7.3 `src/api/draftRoutes.js`

```js
import { Router } from "express";
import { asyncHandler } from "./middleware/asyncHandler.js";
import { extractWorkflow, validateWorkflow, ExtractionError } from "../llm/extractWorkflow.js";
import { REVIEW_STATUS } from "../config/constants.js";

/**
 * The admin write path: draft -> extract -> template -> publish.
 * Dependencies arrive as arguments; this module constructs nothing.
 */
export function createDraftRoutes({ store, draftStore }) {
  const router = Router();

  // Save (or return the existing) draft. Idempotent by content hash.
  router.post(
    "/drafts",
    asyncHandler(async (req, res) => {
      const { text, title = null } = req.body ?? {};
      if (typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ error: "Body must include a non-empty 'text' field" });
      }
      const draft = await draftStore.create({ rawText: text, title, submittedBy: req.user?.id ?? null });
      res.status(201).json(serializeDraft(draft));
    })
  );

  router.get(
    "/drafts",
    asyncHandler(async (req, res) => {
      res.json((await draftStore.list()).map(serializeDraft));
    })
  );

  router.get(
    "/drafts/:id",
    asyncHandler(async (req, res) => {
      const draft = await draftStore.getById(req.params.id);
      if (!draft) return res.status(404).json({ error: "Draft not found" });
      res.json(serializeDraft(draft));
    })
  );

  /**
   * The core admin action: "Generate template".
   * Extracts, validates, saves as a new version WITH its embedding, and links
   * the draft. Every failure mode is recorded ON the draft so the admin UI can
   * show what went wrong rather than a bare 500.
   */
  router.post(
    "/drafts/:id/extract",
    asyncHandler(async (req, res) => {
      const draft = await draftStore.getById(req.params.id);
      if (!draft) return res.status(404).json({ error: "Draft not found" });

      try {
        const { workflow, attempts } = await extractWorkflow(draft.raw_text);
        const saved = await store.save(workflow, { draftId: draft._id });
        await draftStore.markExtracted(draft._id, workflow.workflow_id);

        res.status(201).json({
          draft_id: String(draft._id),
          workflow_id: saved.id,
          version: saved.version,
          attempts,
          review_status: workflow.metadata.review_status,
          workflow,
        });
      } catch (err) {
        if (err instanceof ExtractionError) {
          const rejected = /does not describe a workflow/i.test(err.message);
          await (rejected
            ? draftStore.markRejected(draft._id, err.message)
            : draftStore.markFailed(draft._id, err.message));
        }
        throw err;   // errorHandler maps ExtractionError -> 422
      }
    })
  );

  /** Admin "Publish" - the ONLY thing that makes a template selectable. */
  router.patch(
    "/workflows/:id/review",
    asyncHandler(async (req, res) => {
      const { review_status, version } = req.body ?? {};
      if (!Object.values(REVIEW_STATUS).includes(review_status)) {
        return res.status(400).json({
          error: `review_status must be one of: ${Object.values(REVIEW_STATUS).join(", ")}`,
        });
      }
      const record = await store.getRecord(req.params.id, version);
      if (!record) return res.status(404).json({ error: "Workflow not found" });

      res.json(await store.setReviewStatus(req.params.id, record.version, review_status));
    })
  );

  return router;
}

/** ObjectId -> string at the boundary. Never leak BSON types to a JSON client. */
function serializeDraft(draft) {
  return {
    id: String(draft._id),
    title: draft.title,
    raw_text: draft.raw_text,
    status: draft.status,
    failure_reason: draft.failure_reason,
    workflow_id: draft.workflow_id,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
  };
}
```

### 7.4 `src/api/selectionRoutes.js`

```js
import { Router } from "express";
import { asyncHandler } from "./middleware/asyncHandler.js";

export function createSelectionRoutes({ selectionService, store }) {
  const router = Router();

  /** Round 1. Body: { query, requester_context? } */
  router.post(
    "/selection/sessions",
    asyncHandler(async (req, res) => {
      const { query, requester_context = null, institution_type = null } = req.body ?? {};
      if (typeof query !== "string" || query.trim().length === 0) {
        return res.status(400).json({ error: "Body must include a non-empty 'query' field" });
      }
      res.status(201).json(
        await selectionService.start(query, {
          requesterContext: requester_context,
          institutionType: institution_type,
        })
      );
    })
  );

  /** Round 2+. Body: { answer } */
  router.post(
    "/selection/sessions/:id/answer",
    asyncHandler(async (req, res) => {
      const { answer } = req.body ?? {};
      if (typeof answer !== "string" || answer.trim().length === 0) {
        return res.status(400).json({ error: "Body must include a non-empty 'answer' field" });
      }
      res.json(await selectionService.answer(req.params.id, answer));
    })
  );

  /** The person picked explicitly from the manual-choice list. */
  router.post(
    "/selection/sessions/:id/choose",
    asyncHandler(async (req, res) => {
      const { workflow_id } = req.body ?? {};
      if (!workflow_id) return res.status(400).json({ error: "Body must include 'workflow_id'" });
      res.json(await selectionService.choose(req.params.id, workflow_id));
    })
  );

  /** Full document for the matched workflow - drives the plan preview. */
  router.get(
    "/selection/sessions/:id/workflow",
    asyncHandler(async (req, res) => {
      const session = await selectionService.sessionStore.getById(req.params.id);
      if (!session?.selected_workflow_id) {
        return res.status(409).json({ error: "This session has not matched a workflow yet" });
      }
      const workflow = await store.getById(session.selected_workflow_id);
      if (!workflow) return res.status(404).json({ error: "Workflow not found" });
      res.json(workflow);
    })
  );

  return router;
}
```

### 7.5 The complete API contract (the frontend codes against this)

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/api/workflows` | — | `[{ workflow_id, title, description, version, review_status, updated_at }]` |
| `GET` | `/api/workflows/:id` | — | full workflow JSON |
| `POST` | `/api/workflows` | `{ workflow }` | `201 { id, version }` |
| `PUT` | `/api/workflows/:id` | `{ workflow }` | `{ id, version }` |
| `POST` | `/api/workflows/:id/validate` | `{ workflow }` | `{ valid, errors }` |
| `PATCH` | `/api/workflows/:id/review` | `{ review_status, version? }` | updated summary |
| `POST` | `/api/drafts` | `{ text, title? }` | `201 { id, status, ... }` |
| `GET` | `/api/drafts` | — | `[draft]` |
| `GET` | `/api/drafts/:id` | — | `draft` |
| `POST` | `/api/drafts/:id/extract` | — | `201 { workflow_id, version, attempts, workflow }` |
| `POST` | `/api/selection/sessions` | `{ query, requester_context? }` | `201 SelectionResponse` |
| `POST` | `/api/selection/sessions/:id/answer` | `{ answer }` | `SelectionResponse` |
| `POST` | `/api/selection/sessions/:id/choose` | `{ workflow_id }` | `{ decision: "matched", workflow_id }` |
| `GET` | `/api/selection/sessions/:id/workflow` | — | full workflow JSON |

**`SelectionResponse`** — the shape the requester UI branches on:

```jsonc
{
  "session_id": "665f...",
  "decision": "matched" | "ambiguous" | "no_match" | "manual_choice",
  "workflow_id": "it_faculty_overseas_leave" | null,
  "confidence": "high" | "medium" | "low",
  "question": "Which faculty are you attached to?" | null,
  "options": ["Information Technology", "Engineering", "Science"],
  "candidates": [{ "workflow_id": "...", "title": "...", "one_liner": "...", "score": 0.7412 }]
}
```

### 7.6 ✅ Verify Phase 7

Full manual walkthrough:

```bash
# 1. Create a draft
curl -s -X POST localhost:3000/api/drafts -H 'Content-Type: application/json' \
  -d '{"text":"Any academic staff member who intends to travel abroad must obtain approval..."}'

# 2. Extract it (slow - a real LLM call)
curl -s -X POST localhost:3000/api/drafts/<DRAFT_ID>/extract

# 3. Publish it
curl -s -X PATCH localhost:3000/api/workflows/<WORKFLOW_ID>/review \
  -H 'Content-Type: application/json' -d '{"review_status":"confirmed"}'

# 4. Select against it
curl -s -X POST localhost:3000/api/selection/sessions \
  -H 'Content-Type: application/json' -d '{"query":"I want to apply for overseas leave"}'
```

**Done when:** step 4 returns a `SelectionResponse` whose `candidates` include the template you published, and `decision` is a sensible verdict.

---

## Phase 8 — Evaluation harness

**Goal:** make selection quality a number, not a feeling.

### 8.1 Why this is not optional

Every prompt tweak, every `retrieval_summary` edit, and every threshold change silently shifts selection behaviour. Without a fixture set you are guessing, and — the specific danger here — a selector that always finds *something* looks great in a demo and is the single most damaging failure mode in production. Only `no_match` fixtures catch it.

### 8.2 Files

| Action | Path |
|---|---|
| Create | `fixtures/selection/queries.json` |
| Create | `scripts/evaluateSelection.js` |
| Create | `tests/live/selectionQuality.test.js` |
| Modify | `package.json` |

### 8.3 `fixtures/selection/queries.json`

```jsonc
[
  {
    "query": "I want to apply for overseas leave",
    "expect": "ambiguous",
    "expect_in_candidates": ["it_faculty_overseas_leave"],
    "note": "Bare request with no faculty - must ask, not guess."
  },
  {
    "query": "I'm in the IT faculty and going abroad for 2 weeks",
    "expect": "matched",
    "expect_workflow": "it_faculty_overseas_leave",
    "note": "Faculty stated up front - no question needed."
  },
  {
    "query": "need to book a hall for a workshop next month",
    "expect": "matched",
    "expect_workflow": "departmental_event_workshop",
    "note": "Informal phrasing; tests the keywords field."
  },
  {
    "query": "how do I reset my email password",
    "expect": "no_match",
    "note": "NEGATIVE CASE. A selector that answers this is broken."
  },
  {
    "query": "I need to buy a new oscilloscope for the electronics lab",
    "expect": "matched",
    "expect_workflow": "lab_equipment_purchase_request",
    "note": "Domain vocabulary the title does not contain."
  },
  {
    "query": "what's the weather like tomorrow",
    "expect": "no_match",
    "note": "NEGATIVE CASE. Completely off-domain."
  }
]
```

> Grow this file every time selection gets something wrong in real use. `selection_sessions` gives you real queries to harvest.

### 8.4 The two metrics — track them separately

They fail for different reasons and have different fixes. Collapsing them into one "accuracy" number destroys the diagnostic value.

| Metric | Question | When it's bad, fix |
|---|---|---|
| **Recall@5** | Is the right template anywhere in the candidates? | `retrieval_summary` content, or the embedding setup |
| **Decision accuracy** | Given good candidates, is the verdict right? | The selector prompt |

If Recall@5 is 100% and decision accuracy is 60%, do not touch embeddings. If Recall@5 is 60%, no prompt change can save you — the right answer never reached the model.

### 8.5 `scripts/evaluateSelection.js`

```js
import { readFile } from "node:fs/promises";
import { MongoWorkflowStore } from "../src/knowledgeBank/mongoStore.js";
import { InMemoryVectorStore } from "../src/retrieval/inMemoryVectorStore.js";
import { Retriever } from "../src/retrieval/retriever.js";
import { SelectorAgent } from "../src/selector/selectorAgent.js";
import { closeDb } from "../src/db/mongoClient.js";

const cases = JSON.parse(await readFile("fixtures/selection/queries.json", "utf8"));

const store = new MongoWorkflowStore();
const retriever = new Retriever(new InMemoryVectorStore(store));
const agent = new SelectorAgent();

let recallHits = 0, recallTotal = 0, decisionHits = 0;
const rows = [];

for (const c of cases) {
  const candidates = await retriever.retrieve(c.query);
  const ids = candidates.map((x) => x.workflow_id);

  // Recall is only meaningful when we know what SHOULD have been retrieved.
  const expectedIds = c.expect_workflow ? [c.expect_workflow] : (c.expect_in_candidates ?? []);
  let recall = "n/a";
  if (expectedIds.length) {
    recallTotal++;
    const hit = expectedIds.every((id) => ids.includes(id));
    if (hit) recallHits++;
    recall = hit ? "HIT" : "MISS";
  }

  const decision = await agent.decide(candidates, [{ role: "user", text: c.query }]);
  const correct =
    decision.decision === c.expect &&
    (!c.expect_workflow || decision.workflow_id === c.expect_workflow);
  if (correct) decisionHits++;

  rows.push({
    query: c.query.slice(0, 42),
    expected: c.expect,
    got: decision.decision,
    workflow: decision.workflow_id ?? "-",
    recall,
    ok: correct ? "PASS" : "FAIL",
  });
}

console.table(rows);
console.log(`\nRecall@5          : ${recallHits}/${recallTotal}  (${pct(recallHits, recallTotal)})`);
console.log(`Decision accuracy : ${decisionHits}/${cases.length}  (${pct(decisionHits, cases.length)})`);
console.log(`\nRecall bad  -> fix retrieval_summary / embeddings`);
console.log(`Decision bad -> fix the selector prompt`);

function pct(n, d) { return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(0)}%`; }
await closeDb();
```

Add `"evaluate:selection": "node scripts/evaluateSelection.js"` to `package.json`.

### 8.6 ✅ Verify Phase 8

Seed the fixtures as confirmed templates, then `npm run evaluate:selection`.

**Targets for this phase:** Recall@5 ≥ 90%, decision accuracy ≥ 80%, **and both `no_match` cases correct.** A run that misses a `no_match` case fails regardless of the other numbers.

---

# PART B — FRONTEND (Next.js + TypeScript)

---

## Phase 9 — Scaffold, design tokens, shared primitives

**Goal:** a running Next.js app with the mockups' exact visual language encoded once, as tokens and primitives, so no later phase writes a hex code by hand.

### 9.1 🔧 MANUAL — create the app

Run from `d:\Asentic project\UNBLOCK-AI APP` (the parent of `UNBLOCK-AI`):

```bash
npx create-next-app@latest unblock-ai-web \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --no-turbopack
cd unblock-ai-web
npm install @xyflow/react dagre swr clsx
npm install -D @types/dagre
```

| Package | Why |
|---|---|
| `@xyflow/react` | React Flow — the flowchart canvas in the admin editor |
| `dagre` | Directed-graph auto-layout; positions the flowchart nodes |
| `swr` | Data fetching with caching/revalidation; far less code than hand-rolled `useEffect` |
| `clsx` | Conditional class names without string concatenation |

Create `unblock-ai-web/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
```

> `NEXT_PUBLIC_` prefix means the value is inlined into the browser bundle. That is correct for a base URL and **wrong for anything secret** — no API keys ever get this prefix.

### 9.2 Target directory structure

```
unblock-ai-web/
├── .env.local
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # root: fonts, html shell
│   │   ├── page.tsx                      # redirects to /admin
│   │   ├── globals.css                   # tokens + Tailwind layers
│   │   ├── admin/
│   │   │   ├── layout.tsx                # admin top bar
│   │   │   ├── page.tsx                  # template list          (Phase 10)
│   │   │   └── templates/
│   │   │       ├── new/page.tsx          # blank editor           (Phase 11)
│   │   │       └── [id]/page.tsx         # existing editor        (Phase 11)
│   │   └── portal/
│   │       ├── layout.tsx                # requester shell
│   │       ├── page.tsx                  # jobs list              (Phase 12)
│   │       └── jobs/
│   │           ├── new/page.tsx          # chat + plan            (Phase 13)
│   │           └── [id]/page.tsx         # existing job (mocked)  (Phase 13)
│   ├── components/
│   │   ├── ui/                           # generic primitives      (Phase 9)
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── Spinner.tsx
│   │   │   └── SearchInput.tsx
│   │   ├── admin/                        # admin-only             (Phases 10-11)
│   │   │   ├── TopBar.tsx
│   │   │   ├── TemplateRow.tsx
│   │   │   ├── DraftEditor.tsx
│   │   │   ├── EditorToolbar.tsx
│   │   │   └── flowchart/
│   │   │       ├── WorkflowFlowchart.tsx
│   │   │       ├── nodes/                # one file per node type
│   │   │       └── layout.ts             # dagre positioning
│   │   └── portal/                       # requester-only         (Phases 12-13)
│   │       ├── JobRow.tsx
│   │       ├── ChatPanel.tsx
│   │       ├── ChatMessage.tsx
│   │       ├── ChatComposer.tsx
│   │       ├── PlanPanel.tsx
│   │       └── PlanNode.tsx
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts                 # the ONE fetch wrapper
│   │   │   ├── workflows.ts
│   │   │   ├── drafts.ts
│   │   │   └── selection.ts
│   │   ├── auth/session.ts               # mock session
│   │   ├── workflow/
│   │   │   ├── toFlowGraph.ts            # workflow -> React Flow
│   │   │   └── toPlanNodes.ts            # workflow -> requester plan
│   │   └── utils/
│   │       ├── cn.ts
│   │       ├── format.ts                 # relative dates, word count
│   │       └── constants.ts
│   └── types/
│       ├── workflow.ts                   # mirrors workflow.schema.json
│       ├── draft.ts
│       └── selection.ts
```

**The rule this structure encodes:** `components/ui/` knows nothing about workflows. `components/admin/` and `components/portal/` know nothing about each other. `lib/api/` is the only place `fetch` appears. Violating any of these means a change ripples where it should not.

### 9.3 Design tokens — read from the mockups

Both mockups use the same palette. Encode it once in `src/app/globals.css`; never write a hex literal in a component.

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#F8FAFC` | page background |
| `--surface` | `#FFFFFF` | cards, panels, rows |
| `--ink` | `#0F172A` | primary text, dark buttons, avatar |
| `--muted` | `#475569` | secondary text, labels, icons |
| `--faint` | `#94A3B8` | placeholder text |
| `--border` | `#E2E8F0` | card borders (portal) |
| `--border-admin` | `rgba(71,85,105,.18)` | card borders (admin) |
| `--accent` | `#4F46E5` | primary buttons |
| `--accent-hover` | `#4338CA` | primary button hover |
| `--warn` | `#F59E0B` | in-progress spinner, current step |
| `--warn-bg` | `#FFFBEB` | waiting-message background |
| `--warn-border` | `#FDE68A` | waiting-message border |
| `--warn-ink` | `#B45309` | "Current step" eyebrow text |
| `--success` | `#10B981` | completed check circles |
| `--danger` | `#EF4444` | rejected badge |
| `--radius-card` | `12px` | cards, panels |
| `--radius-control` | `10px` | buttons, inputs |
| `--radius-pill` | `999px` | pills, avatars |

```css
/* src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #F8FAFC;
  --surface: #FFFFFF;
  --ink: #0F172A;
  --muted: #475569;
  --faint: #94A3B8;
  --border: #E2E8F0;
  --border-admin: rgba(71, 85, 105, .18);
  --accent: #4F46E5;
  --accent-hover: #4338CA;
  --warn: #F59E0B;
  --warn-bg: #FFFBEB;
  --warn-border: #FDE68A;
  --warn-ink: #B45309;
  --success: #10B981;
  --danger: #EF4444;
}

body {
  background: var(--bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}

@keyframes ubspin { to { transform: rotate(360deg); } }
.animate-ubspin { animation: ubspin 1.1s linear infinite; }
```

Wire the tokens into Tailwind (`tailwind.config.ts`) so you write `bg-accent`, not `bg-[#4F46E5]`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        line: "var(--border)",
        "line-admin": "var(--border-admin)",
        accent: { DEFAULT: "var(--accent)", hover: "var(--accent-hover)" },
        warn: { DEFAULT: "var(--warn)", bg: "var(--warn-bg)", border: "var(--warn-border)", ink: "var(--warn-ink)" },
        success: "var(--success)",
        danger: "var(--danger)",
      },
      borderRadius: { card: "12px", control: "10px" },
      fontFamily: {
        admin: ["var(--font-public-sans)", "system-ui", "sans-serif"],
        portal: ["var(--font-ibm-plex)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
```

### 9.4 Fonts

The two portals use different typefaces — that is deliberate in the mockups and should be preserved. Load both with `next/font` (self-hosted, no layout shift, no external request):

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { Public_Sans, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "800"],
  variable: "--font-public-sans",
});

const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex",
});

export const metadata: Metadata = {
  title: "Unblock AI",
  description: "Plain English in, verified workflow out.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${publicSans.variable} ${ibmPlex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

Then `src/app/admin/layout.tsx` applies `font-admin` and `src/app/portal/layout.tsx` applies `font-portal`.

### 9.5 `src/lib/api/client.ts` — the single fetch wrapper

```ts
/**
 * The ONE place this application talks to the backend.
 *
 * Every feature module (workflows, drafts, selection) builds on this. Nothing
 * else in the codebase calls `fetch` directly - that is what makes it possible
 * to add auth headers, retries, or a base-URL change in exactly one edit.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

/** A failed request, carrying the status and the server's error payload. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",   // this data is never safe to serve stale
  });

  // 204 has no body; parsing it would throw.
  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? `Request failed with status ${response.status}`,
      response.status,
      payload?.details,
    );
  }

  return payload as T;
}

/** SWR's fetcher signature. Lets any component do `useSWR("/workflows", fetcher)`. */
export const fetcher = <T,>(path: string) => apiRequest<T>(path);
```

### 9.6 `src/types/workflow.ts` — one source of truth

Mirror `workflow.schema.json` exactly. Every component imports from here; nobody redeclares a workflow shape locally.

```ts
/**
 * TypeScript mirror of UNBLOCK-AI/src/schema/workflow.schema.json.
 *
 * WHEN THE SCHEMA CHANGES, CHANGE THIS FILE IN THE SAME COMMIT.
 * There is no codegen step; this is a hand-maintained contract, and a drifted
 * contract produces `undefined` at runtime with no compile error.
 */

export type ActorResolution = "dynamic" | "static" | "requester" | "system";

export interface Actor {
  resolution: ActorResolution;
  role: string | null;
  relative_to: string | null;
  directory_query: string | null;
  fallback_role: string | null;
  display_name: string | null;
}

export type StepType =
  | "approval"
  | "notification"
  | "data_collection"
  | "automated_action"
  | "review";

export interface Dependency {
  step_id: string;
  required_outcome: string;
}

export interface Condition {
  operator: string;
  left: string | number | boolean | null;
  right: string | number | boolean | null;
  clauses: Condition[];
  description: string | null;
}

export interface OutcomeEffect {
  action: "continue" | "terminate_workflow" | "reopen_input";
  notify: Actor[];
  include_reason: boolean | null;
  return_to_step: string | null;
  prompt_source: string | null;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  description: string | null;
  assignee: Actor;
  depends_on: Dependency[];
  initial_state: "auto" | "blocked";
  blocked_reason: string | null;
  condition: Condition | null;
  instructions_to_approver: string | null;
  response_fields: Array<{ id: string; label: string; type: string; required_on_outcome: string[] }>;
  context_from_steps: Array<{ step_id: string; field: string; as: string }>;
  outcomes: {
    approved: OutcomeEffect | null;
    rejected: OutcomeEffect | null;
    request_more_info: OutcomeEffect | null;
  };
  notifications: {
    on_assign: { channel: string; template: string } | null;
    on_outcome: { channel: string; template: string } | null;
  };
  sla: { reminder_after_hours: number | null; escalate_after_hours: number | null } | null;
}

export interface WorkflowInput {
  id: string;
  label: string;
  description: string | null;
  type: string;
  collected_from: Actor;
  required: boolean;
  validation: Record<string, unknown>;
  collection_hint: string | null;
}

/** Added in backend Phase 2. Drives all retrieval. */
export interface RetrievalSummary {
  one_liner: string;
  aliases: string[];
  keywords: string[];
  requester_types: string[];
  triggers: string[];
  not_for: string[];
}

export type ReviewStatus = "pending_admin_review" | "confirmed" | "rejected";

export interface Workflow {
  schema_version: string;
  workflow_id: string;
  title: string;
  description: string;
  retrieval_summary: RetrievalSummary;
  scope: {
    institution_type: string;
    applies_to: { actor_type: string; constraints: Array<Record<string, unknown>> };
  };
  requester: { actor_type: string; identifier_field: string };
  inputs: WorkflowInput[];
  computed: Array<{ id: string; description: string | null; operation: string; arguments: Record<string, unknown> }>;
  steps: WorkflowStep[];
  completion: { rule: string; required_steps: string[]; actions: Array<Record<string, unknown>> };
  metadata: {
    created_from: string;
    source_text_hash: string;
    extraction_model: string;
    extraction_timestamp: string;
    confidence: "high" | "medium" | "low";
    ambiguities: string[];
    unmapped_roles: string[];
    review_status: ReviewStatus;
  };
}

/** The list-endpoint projection - deliberately NOT the full document. */
export interface WorkflowSummary {
  workflow_id: string;
  title: string;
  description: string;
  version: number;
  schema_version: string;
  review_status: ReviewStatus;
  draft_id: string | null;
  updated_at: string;
}
```

Add `src/types/selection.ts`:

```ts
export type SelectionDecision = "matched" | "ambiguous" | "no_match" | "manual_choice";

export interface SelectionCandidate {
  workflow_id: string;
  title: string;
  one_liner: string | null;
  score: number;
}

export interface SelectionResponse {
  session_id: string;
  decision: SelectionDecision;
  workflow_id: string | null;
  confidence: "high" | "medium" | "low";
  question: string | null;
  options: string[];
  candidates: SelectionCandidate[];
}
```

And `src/types/draft.ts`:

```ts
export type DraftStatus = "pending" | "extracted" | "failed" | "rejected";

export interface Draft {
  id: string;
  title: string | null;
  raw_text: string;
  status: DraftStatus;
  failure_reason: string | null;
  workflow_id: string | null;
  created_at: string;
  updated_at: string;
}
```

### 9.7 API feature modules

`src/lib/api/workflows.ts`:

```ts
import { apiRequest } from "./client";
import type { Workflow, WorkflowSummary, ReviewStatus } from "@/types/workflow";

export const workflowsApi = {
  list: () => apiRequest<WorkflowSummary[]>("/workflows"),

  get: (id: string, version?: number) =>
    apiRequest<Workflow>(`/workflows/${id}${version ? `?version=${version}` : ""}`),

  setReviewStatus: (id: string, reviewStatus: ReviewStatus, version?: number) =>
    apiRequest<WorkflowSummary>(`/workflows/${id}/review`, {
      method: "PATCH",
      body: { review_status: reviewStatus, version },
    }),
};
```

`src/lib/api/drafts.ts`:

```ts
import { apiRequest } from "./client";
import type { Draft } from "@/types/draft";
import type { Workflow } from "@/types/workflow";

export interface ExtractResult {
  draft_id: string;
  workflow_id: string;
  version: number;
  attempts: number;
  review_status: string;
  workflow: Workflow;
}

export const draftsApi = {
  create: (text: string, title?: string) =>
    apiRequest<Draft>("/drafts", { method: "POST", body: { text, title } }),

  get: (id: string) => apiRequest<Draft>(`/drafts/${id}`),

  list: () => apiRequest<Draft[]>("/drafts"),

  /** The "Generate template" action. Slow - always show a loading state. */
  extract: (id: string) => apiRequest<ExtractResult>(`/drafts/${id}/extract`, { method: "POST" }),
};
```

`src/lib/api/selection.ts`:

```ts
import { apiRequest } from "./client";
import type { SelectionResponse } from "@/types/selection";
import type { Workflow } from "@/types/workflow";

export const selectionApi = {
  start: (query: string, requesterContext?: Record<string, unknown>) =>
    apiRequest<SelectionResponse>("/selection/sessions", {
      method: "POST",
      body: { query, requester_context: requesterContext },
    }),

  answer: (sessionId: string, answer: string) =>
    apiRequest<SelectionResponse>(`/selection/sessions/${sessionId}/answer`, {
      method: "POST",
      body: { answer },
    }),

  choose: (sessionId: string, workflowId: string) =>
    apiRequest<SelectionResponse>(`/selection/sessions/${sessionId}/choose`, {
      method: "POST",
      body: { workflow_id: workflowId },
    }),

  getWorkflow: (sessionId: string) =>
    apiRequest<Workflow>(`/selection/sessions/${sessionId}/workflow`),
};
```

### 9.8 `src/lib/auth/session.ts` — the mock session seam

```ts
/**
 * MOCK AUTHENTICATION - REPLACE BEFORE ANY DEPLOYMENT.
 *
 * This exists as a SEAM, not as a feature. Every component reads identity
 * through `getSession()`, so swapping in NextAuth later means rewriting this
 * one file and nothing else. The values match the mockups so screenshots and
 * the running app agree.
 */
export interface Session {
  id: string;
  name: string;
  initials: string;
  role: "admin" | "requester";
  department: string;
  organisation: string;
  faculty: string | null;
}

const MOCK_SESSIONS: Record<Session["role"], Session> = {
  admin: {
    id: "admin-1",
    name: "Nadeesha Perera",
    initials: "NP",
    role: "admin",
    department: "Registrar's Office",
    organisation: "University of Colombo School of Computing",
    faculty: null,
  },
  requester: {
    id: "user-1",
    name: "Chathura Silva",
    initials: "CS",
    role: "requester",
    department: "Department of Information Technology",
    organisation: "University of Colombo School of Computing",
    faculty: "Information Technology",
  },
};

export function getSession(role: Session["role"] = "admin"): Session {
  return MOCK_SESSIONS[role];
}

/**
 * Context handed to the selector so it can skip questions it can already answer.
 * When a requester's faculty is known, "Which faculty are you in?" is a question
 * the system should never have to ask.
 */
export function getRequesterContext(session: Session) {
  return { faculty: session.faculty, department: session.department, actor_type: "staff" };
}
```

### 9.9 UI primitives

Keep these **generic**. `Button` must not know what a workflow is.

```tsx
// src/components/ui/Button.tsx
"use client";
import { cn } from "@/lib/utils/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

/** Variant styles as data, not as an if/else chain. Adding one is one line. */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-sm hover:bg-accent-hover disabled:bg-slate-200 disabled:text-muted disabled:shadow-none",
  secondary:
    "bg-surface text-ink border border-line-admin hover:bg-bg disabled:text-faint",
  ghost: "bg-transparent text-muted hover:text-ink",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-10 px-5 text-[13.5px]",
};

export function Button({ variant = "primary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
```

```ts
// src/lib/utils/cn.ts
import clsx, { type ClassValue } from "clsx";
export const cn = (...inputs: ClassValue[]) => clsx(inputs);
```

Build `Card`, `Badge`, `Spinner`, `EmptyState`, and `SearchInput` on the same pattern — variants as lookup maps, no workflow knowledge, `className` passthrough for one-off adjustments.

```tsx
// src/components/ui/Spinner.tsx  - the amber ring used in both portals
export function Spinner({ size = 34 }: { size?: number }) {
  return (
    <div
      className="animate-ubspin flex-none rounded-full border-[2.5px] border-warn-border border-t-warn"
      style={{ width: size, height: size }}
      role="status"
      aria-label="In progress"
    />
  );
}
```

```tsx
// src/components/ui/EmptyState.tsx
import type { ReactNode } from "react";

interface EmptyStateProps {
  illustration?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  footer?: ReactNode;
}

export function EmptyState({ illustration, title, body, action, footer }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-card border border-line-admin bg-surface px-10 py-[72px] text-center">
      {illustration}
      <h2 className="mb-2.5 text-[19px] font-bold tracking-tight text-ink">{title}</h2>
      <p className="mb-[26px] max-w-[46ch] text-[13.5px] leading-relaxed text-muted">{body}</p>
      {action}
      {footer}
    </div>
  );
}
```

### 9.10 ✅ Verify Phase 9

```bash
cd unblock-ai-web
npm run dev          # http://localhost:3001
npx tsc --noEmit     # zero type errors
```

**Done when:** the app boots, `/admin` and `/portal` render placeholder pages with the correct background and fonts, and `tsc` is clean. Confirm the API wrapper reaches the backend from a server component:

```tsx
// temporary probe in src/app/admin/page.tsx
import { workflowsApi } from "@/lib/api/workflows";
export default async function Page() {
  const items = await workflowsApi.list();
  return <pre>{JSON.stringify(items, null, 2)}</pre>;
}
```

---

## Phase 10 — Admin Portal: template list

**Mockup reference:** `UI Mockups/admin portal/Unblock AI Admin Portal.dc.html`, the `isList` branch (lines 46–122). Two states: populated list and empty state.

### 10.1 Anatomy of the screen

```
┌──────────────────────────────────────────────────────────────────────┐
│ [U] Unblock AI │ Workflow administration      Org name   [NP] user ▾ │  60px sticky top bar
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Workflow templates                          [＋ Create new template] │  h1 26px + primary CTA
│  6 templates published across the faculty...                         │  13.5px muted, max 56ch
│                                                                      │
│  [⌕ Search templates...      ] [All|Published|Drafts] [Newest ▾]     │  38px filter row
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Title  [DRAFT]                    Owner      2 days ago     →  │  │  grid 1fr 190px 96px 28px
│  │ Description text, 13px, muted, line-height 1.5                 │  │  padding 18px 22px
│  ├────────────────────────────────────────────────────────────────┤  │  border-top between rows
│  │ ...                                                            │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Showing 6 of 6 templates                Last compiled 4 Aug, 09:12  │  12px muted, space-between
└──────────────────────────────────────────────────────────────────────┘
   max-width 1100px, padding 40px 32px 120px
```

### 10.2 Files

| Action | Path |
|---|---|
| Create | `src/app/admin/layout.tsx` |
| Create | `src/app/admin/page.tsx` |
| Create | `src/components/admin/TopBar.tsx` |
| Create | `src/components/admin/TemplateRow.tsx` |
| Create | `src/components/admin/TemplateFilters.tsx` |
| Create | `src/lib/utils/format.ts` |

### 10.3 `src/components/admin/TopBar.tsx`

Server component — it renders session data and has no interactivity beyond a static chevron.

```tsx
import { getSession } from "@/lib/auth/session";

export function TopBar() {
  const session = getSession("admin");

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-line-admin bg-surface px-8">
      <div className="flex items-center gap-3.5">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-ink text-xs font-bold text-white">
          U
        </div>
        <div className="text-[15.5px] font-bold tracking-tight">Unblock AI</div>
        <div className="h-5 w-px bg-line-admin" />
        <div className="text-[12.5px] text-muted">Workflow administration</div>
      </div>

      <div className="flex items-center gap-[18px]">
        <div className="text-[12.5px] text-muted">{session.organisation}</div>
        <div className="flex items-center gap-2.5 rounded-full border border-line-admin py-[5px] pl-1.5 pr-2.5">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
            {session.initials}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[12.5px] font-semibold">{session.name}</span>
            <span className="text-[10.5px] text-muted">{session.department} · Admin</span>
          </div>
          <span className="ml-0.5 text-[10px] text-muted">▾</span>
        </div>
      </div>
    </header>
  );
}
```

### 10.4 `src/lib/utils/format.ts`

```ts
/**
 * Presentation-only helpers. Pure functions of their inputs - no locale
 * detection, no Date.now() captured at module scope (which would freeze on the
 * server and drift from the client).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "2 days ago", "3 weeks ago" - matches the mockup's `updated` column. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(iso).getTime();

  if (elapsed < HOUR) return "just now";
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), "hour");
  const days = Math.floor(elapsed / DAY);
  if (days < 7) return plural(days, "day");
  if (days < 30) return plural(Math.floor(days / 7), "week");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

function plural(n: number, unit: string) {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/** Word count for the editor header. Collapses all whitespace runs. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** "4 Aug 2026, 09:12" */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
```

### 10.5 `src/components/admin/TemplateRow.tsx`

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { relativeTime } from "@/lib/utils/format";
import type { WorkflowSummary } from "@/types/workflow";

/**
 * One row of the template list.
 *
 * The grid template comes straight from the mockup: 1fr for the title/description
 * block, then fixed columns for owner, timestamp, and the chevron.
 */
export function TemplateRow({ template }: { template: WorkflowSummary }) {
  const isDraft = template.review_status !== "confirmed";

  return (
    <Link
      href={`/admin/templates/${template.workflow_id}`}
      className="grid cursor-pointer grid-cols-[1fr_190px_96px_28px] items-center gap-5 border-t border-line-admin/70 px-[22px] py-[18px] transition-colors first:border-t-0 hover:bg-bg"
    >
      <div className="min-w-0">
        <div className="mb-[5px] flex items-center gap-2.5">
          <span className="text-[15px] font-semibold tracking-tight">{template.title}</span>
          {isDraft && <Badge tone="warn">Draft</Badge>}
        </div>
        <div className="text-[13px] leading-normal text-muted">{template.description}</div>
      </div>

      {/* `owner` is not modelled on the backend yet - derive a stand-in from
          the workflow's scope rather than inventing a column. */}
      <div className="text-xs text-muted">—</div>
      <div className="text-right text-xs text-muted">{relativeTime(template.updated_at)}</div>
      <div className="text-right text-sm text-muted">→</div>
    </Link>
  );
}
```

> **Honesty about `owner`.** The mockup shows an owner column ("Bursar's Division", "Academic Branch"). The workflow schema has no owner field. Do **not** fabricate one — render `—` now, and if the column matters, add `owner_department` to the schema in a later phase. Inventing data in the UI to match a mockup is how a demo starts lying.

### 10.6 `src/app/admin/page.tsx`

Server component fetching at request time; the filter row is a small client island.

```tsx
import Link from "next/link";
import { workflowsApi } from "@/lib/api/workflows";
import { TemplateRow } from "@/components/admin/TemplateRow";
import { TemplateFilters } from "@/components/admin/TemplateFilters";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";   // always fetch fresh; never cache templates

export default async function AdminTemplatesPage() {
  const templates = await workflowsApi.list();
  const isEmpty = templates.length === 0;

  return (
    <div className="mx-auto max-w-[1100px] px-8 pb-[120px] pt-10">
      <div className="mb-7 flex items-start justify-between gap-8">
        <div>
          <h1 className="mb-2 text-[26px] font-bold tracking-tight">Workflow templates</h1>
          <p className="max-w-[56ch] text-[13.5px] text-muted">
            {isEmpty
              ? "No templates yet for this organisation."
              : `${templates.length} template${templates.length === 1 ? "" : "s"} published across the faculty. Open a template to review the plain-English definition and the compiled flowchart.`}
          </p>
        </div>

        <Link href="/admin/templates/new" className="flex-none">
          <Button size="md" className="h-[42px] px-5 text-sm">
            <span className="text-base font-normal leading-none">＋</span>
            Create new template
          </Button>
        </Link>
      </div>

      {isEmpty ? (
        <EmptyState
          illustration={<DashedPlaceholder />}
          title="Nothing here yet"
          body="Write your first approval workflow in plain English — for example how overseas leave is approved in your faculty — and Unblock AI will compile it into an executable flowchart you can verify."
          action={
            <Link href="/admin/templates/new">
              <Button className="h-[42px] px-5 text-sm">
                <span className="text-base font-normal leading-none">＋</span>
                Create new template
              </Button>
            </Link>
          }
          footer={
            <div className="mt-[34px] flex w-full max-w-[520px] justify-center gap-7 border-t border-line-admin pt-6 text-xs text-muted">
              <div>Plain English in</div>
              <div>→</div>
              <div>Verified flowchart out</div>
            </div>
          }
        />
      ) : (
        <>
          <TemplateFilters />
          <div className="overflow-hidden rounded-card border border-line-admin bg-surface">
            {templates.map((t) => (
              <TemplateRow key={t.workflow_id} template={t} />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted">
            <span>Showing {templates.length} of {templates.length} templates</span>
          </div>
        </>
      )}
    </div>
  );
}

function DashedPlaceholder() {
  return (
    <div className="mb-[26px] flex h-[104px] w-[180px] items-center justify-center rounded-lg border border-dashed border-line-admin bg-[repeating-linear-gradient(135deg,rgba(71,85,105,.05)_0_6px,transparent_6px_12px)]">
      <span className="font-mono text-[10px] tracking-wide text-muted">no templates</span>
    </div>
  );
}
```

> **Drop the "Last compiled 4 Aug 2026, 09:12" footer** unless you add a real timestamp to the list response. Same principle as `owner`: a hardcoded date in the UI is a lie with a long half-life.

### 10.7 `src/components/admin/TemplateFilters.tsx`

Client component — it holds the search and segment state. In this phase it filters the already-fetched list client-side; wiring it to `?q=` and `?review_status=` is a later refinement.

```tsx
"use client";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

const SEGMENTS = ["All", "Published", "Drafts"] as const;
type Segment = (typeof SEGMENTS)[number];

export function TemplateFilters({ onChange }: { onChange?: (s: { query: string; segment: Segment }) => void }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("All");

  function update(next: Partial<{ query: string; segment: Segment }>) {
    const merged = { query, segment, ...next };
    setQuery(merged.query);
    setSegment(merged.segment);
    onChange?.(merged);
  }

  return (
    <div className="mb-[18px] flex items-center gap-3">
      <div className="flex h-[38px] flex-1 items-center gap-2.5 rounded-control border border-line-admin bg-surface px-3.5">
        <span className="text-[13px] text-muted">⌕</span>
        <input
          value={query}
          onChange={(e) => update({ query: e.target.value })}
          placeholder="Search templates, departments or approvers"
          className="flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-muted"
        />
      </div>

      <div className="flex items-center overflow-hidden rounded-control border border-line-admin bg-surface">
        {SEGMENTS.map((s, i) => (
          <button
            key={s}
            onClick={() => update({ segment: s })}
            className={cn(
              "flex h-[38px] items-center px-3.5 text-[12.5px] transition-colors",
              i > 0 && "border-l border-line-admin",
              segment === s ? "bg-slate-100 font-semibold text-ink" : "text-muted hover:text-ink",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 10.8 ✅ Verify Phase 10

**Done when:** with zero templates in Mongo, `/admin` shows the empty state exactly as mocked; after publishing one template through the API, the row renders with its title, description, relative timestamp, and a `Draft` badge when `review_status !== "confirmed"`.

---

## Phase 11 — Admin Portal: the editor

**Mockup reference:** the `isEditor` branch (lines 124–363). This is the most involved screen in the app.

### 11.1 The four states the mockup demands

The mockup's `ed` state variable drives everything. Reproduce all four:

| State | Left panel | Right panel | Primary CTA |
|---|---|---|---|
| `empty` | placeholder text, `0 words` | dashed inert boxes, "will appear here once you write..." | **Generate template** (disabled) |
| `typed` | user's text, `248 words · draft not saved` | dashed inert boxes, "Nothing compiled yet..." | **Generate template** (enabled) |
| `generated` | user's text, `248 words` | the compiled flowchart | **Regenerate template** (disabled) |
| `edited` | text with the changed line highlighted amber, `279 words · unsaved edit` | flowchart + amber "Edit not yet compiled" banner | **Regenerate template** (enabled) |

The state machine is small enough to express directly:

```ts
// src/lib/workflow/editorState.ts
export type EditorState = "empty" | "typed" | "generated" | "edited";

/**
 * Derives the editor state from three facts. A single derived value beats four
 * booleans that can contradict each other - "generated AND empty" is not a
 * state this function can produce.
 */
export function deriveEditorState({
  text, hasCompiled, compiledFromText,
}: { text: string; hasCompiled: boolean; compiledFromText: string | null }): EditorState {
  if (text.trim() === "") return "empty";
  if (!hasCompiled) return "typed";
  return text === compiledFromText ? "generated" : "edited";
}

/** The CTA label and enabled-ness fall out of the state. */
export function ctaFor(state: EditorState) {
  switch (state) {
    case "empty":     return { label: "Generate template",   enabled: false };
    case "typed":     return { label: "Generate template",   enabled: true };
    case "generated": return { label: "Regenerate template", enabled: false };
    case "edited":    return { label: "Regenerate template", enabled: true };
  }
}
```

> **Why `compiledFromText` rather than a dirty flag:** comparing the current text against the text that produced the current flowchart makes "user edited then undid the edit" resolve correctly back to `generated`. A boolean flag would stay stuck on `edited`.

### 11.2 Files

| Action | Path |
|---|---|
| Create | `src/app/admin/templates/new/page.tsx` |
| Create | `src/app/admin/templates/[id]/page.tsx` |
| Create | `src/components/admin/TemplateEditor.tsx` (the client shell) |
| Create | `src/components/admin/DraftEditor.tsx` (left panel) |
| Create | `src/components/admin/EditorToolbar.tsx` |
| Create | `src/components/admin/flowchart/WorkflowFlowchart.tsx` |
| Create | `src/components/admin/flowchart/nodes/StepNode.tsx` |
| Create | `src/components/admin/flowchart/nodes/InputNode.tsx` |
| Create | `src/components/admin/flowchart/nodes/ConditionNode.tsx` |
| Create | `src/components/admin/flowchart/nodes/TerminalNode.tsx` |
| Create | `src/lib/workflow/toFlowGraph.ts` |
| Create | `src/lib/workflow/editorState.ts` |

### 11.3 `src/lib/workflow/toFlowGraph.ts` — the load-bearing transform

This converts a `Workflow` into React Flow's `nodes` + `edges`. Pure function, no React, fully unit-testable.

```ts
import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import type { Workflow, WorkflowStep } from "@/types/workflow";

const NODE_WIDTH = 340;
const NODE_HEIGHT = 92;
const TERMINAL_HEIGHT = 40;

export type FlowNodeKind = "terminal" | "input" | "step" | "condition";

export interface FlowNodeData extends Record<string, unknown> {
  kind: FlowNodeKind;
  label: string;
  eyebrow: string;
  detail: string | null;
  bullets: string[];
  isConditional: boolean;
  isBlocked: boolean;
}

/**
 * Converts a workflow document into a laid-out React Flow graph.
 *
 * Structure comes from the DAG, not from array order: `steps[].depends_on` is
 * the ONLY source of edges, which is what makes parallel branches, joins, and
 * conditional gates render correctly for any workflow rather than only the
 * demo one.
 *
 * PURE: no React, no DOM, no I/O. Unit-test it against both gold fixtures.
 */
export function toFlowGraph(workflow: Workflow): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const nodes: Node<FlowNodeData>[] = [];
  const edges: Edge[] = [];

  // 1. Start terminal.
  nodes.push(makeNode("__start", {
    kind: "terminal", label: "Request submitted", eyebrow: "", detail: null,
    bullets: [], isConditional: false, isBlocked: false,
  }));

  // 2. Requester-collected inputs as one grouped node (matches the mockup's
  //    "Input · from requester" card). Skip it entirely when there are none.
  const requesterInputs = workflow.inputs.filter((i) => i.collected_from.resolution === "requester");
  if (requesterInputs.length > 0) {
    nodes.push(makeNode("__inputs", {
      kind: "input",
      label: "Request details",
      eyebrow: "Input · from requester",
      detail: null,
      bullets: requesterInputs.map((i) => i.label),
      isConditional: false,
      isBlocked: false,
    }));
    edges.push(makeEdge("__start", "__inputs"));
  }

  const firstRealNode = requesterInputs.length > 0 ? "__inputs" : "__start";

  // 3. One node per step.
  workflow.steps.forEach((step, index) => {
    nodes.push(makeNode(step.id, {
      kind: step.condition ? "condition" : "step",
      label: step.name,
      eyebrow: `Step ${index + 1} · ${humanizeType(step.type)}`,
      detail: step.description,
      bullets: step.response_fields.map((f) => f.label),
      isConditional: Boolean(step.condition),
      isBlocked: step.initial_state === "blocked",
    }));
  });

  // 4. Edges from depends_on. Entry steps (no dependencies) hang off the inputs.
  for (const step of workflow.steps) {
    if (step.depends_on.length === 0) {
      edges.push(makeEdge(firstRealNode, step.id));
      continue;
    }
    for (const dep of step.depends_on) {
      edges.push(makeEdge(dep.step_id, step.id, dep.required_outcome));
    }
  }

  // 5. End terminal, fed by every step nothing else depends on.
  const hasDependents = new Set(workflow.steps.flatMap((s) => s.depends_on.map((d) => d.step_id)));
  const leaves = workflow.steps.filter((s) => !hasDependents.has(s.id));
  nodes.push(makeNode("__end", {
    kind: "terminal", label: "Completed", eyebrow: "", detail: null,
    bullets: [], isConditional: false, isBlocked: false,
  }));
  for (const leaf of leaves) edges.push(makeEdge(leaf.id, "__end"));

  return layout(nodes, edges);
}

function humanizeType(type: WorkflowStep["type"]): string {
  return {
    approval: "Approval",
    notification: "Notification",
    data_collection: "Input",
    automated_action: "System",
    review: "Review",
  }[type];
}

function makeNode(id: string, data: FlowNodeData): Node<FlowNodeData> {
  return { id, type: data.kind, position: { x: 0, y: 0 }, data };
}

function makeEdge(source: string, target: string, label?: string): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    // Only label non-obvious transitions. Labelling every edge "approved" is noise.
    label: label && label !== "approved" ? label : undefined,
    type: "smoothstep",
    style: { stroke: "rgba(71,85,105,.35)" },
  };
}

/**
 * Assigns coordinates with dagre.
 *
 * Top-to-bottom ranking reproduces the mockup's vertical flow, and dagre places
 * genuinely-parallel steps (same rank, no edge between them) side by side for
 * free - which is exactly the "Parallel/Join" visual, derived rather than
 * hardcoded.
 */
function layout(nodes: Node<FlowNodeData>[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 56, nodesep: 40, marginx: 20, marginy: 20 });

  for (const node of nodes) {
    const height = node.data.kind === "terminal" ? TERMINAL_HEIGHT : NODE_HEIGHT;
    g.setNode(node.id, { width: NODE_WIDTH, height });
  }
  for (const edge of edges) g.setEdge(edge.source, edge.target);

  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const { x, y } = g.node(node.id);
      const height = node.data.kind === "terminal" ? TERMINAL_HEIGHT : NODE_HEIGHT;
      // dagre returns centres; React Flow wants top-left.
      return { ...node, position: { x: x - NODE_WIDTH / 2, y: y - height / 2 } };
    }),
    edges,
  };
}
```

### 11.4 `src/components/admin/flowchart/WorkflowFlowchart.tsx`

```tsx
"use client";
import { useMemo } from "react";
import { ReactFlow, Background, Controls, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toFlowGraph } from "@/lib/workflow/toFlowGraph";
import { StepNode } from "./nodes/StepNode";
import { InputNode } from "./nodes/InputNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { TerminalNode } from "./nodes/TerminalNode";
import type { Workflow } from "@/types/workflow";

/**
 * Node type registry. Defined at MODULE scope, not inside the component -
 * React Flow re-mounts every node when this object's identity changes, so an
 * inline literal would remount the entire graph on every render.
 */
const NODE_TYPES: NodeTypes = {
  step: StepNode,
  input: InputNode,
  condition: ConditionNode,
  terminal: TerminalNode,
};

export function WorkflowFlowchart({ workflow }: { workflow: Workflow }) {
  const { nodes, edges } = useMemo(() => toFlowGraph(workflow), [workflow]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
      className="bg-[repeating-linear-gradient(135deg,rgba(71,85,105,.025)_0_8px,transparent_8px_16px)]"
    >
      <Background gap={0} color="transparent" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
```

`StepNode.tsx` — the card from the mockup (lines 258–262):

```tsx
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/workflow/toFlowGraph";

export function StepNode({ data }: NodeProps<{ data: FlowNodeData }>) {
  return (
    <div className="w-[340px] rounded-control border border-line-admin bg-surface px-[15px] py-[13px]">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <div className="mb-1 text-[9.5px] font-bold uppercase tracking-[.08em] text-muted">
        {data.eyebrow}
      </div>
      <div className="mb-[3px] text-sm font-semibold text-ink">{data.label}</div>
      {data.detail && <div className="text-xs leading-normal text-muted">{data.detail}</div>}
      {data.isBlocked && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-[11px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-warn" />
          Starts blocked
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  );
}
```

`ConditionNode` uses `border-dashed` and centres its label (mockup lines 295–298). `InputNode` renders `data.bullets` as the square-bulleted list (lines 249–254). `TerminalNode` is the pill (lines 241, 356).

### 11.5 `src/components/admin/TemplateEditor.tsx` — the client shell

```tsx
"use client";
import { useState, useTransition } from "react";
import { draftsApi } from "@/lib/api/drafts";
import { deriveEditorState, ctaFor } from "@/lib/workflow/editorState";
import { countWords } from "@/lib/utils/format";
import { DraftEditor } from "./DraftEditor";
import { WorkflowFlowchart } from "./flowchart/WorkflowFlowchart";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/client";
import type { Workflow } from "@/types/workflow";

interface Props {
  initialText?: string;
  initialWorkflow?: Workflow | null;
  initialDraftId?: string | null;
  documentTitle: string;
}

/**
 * Owns the editor's state machine and the generate action.
 *
 * Everything visual is delegated to child components; this file holds only
 * state and the one async operation. That separation is what keeps the state
 * machine readable.
 */
export function TemplateEditor({
  initialText = "", initialWorkflow = null, initialDraftId = null, documentTitle,
}: Props) {
  const [text, setText] = useState(initialText);
  const [workflow, setWorkflow] = useState<Workflow | null>(initialWorkflow);
  const [compiledFromText, setCompiledFromText] = useState<string | null>(
    initialWorkflow ? initialText : null,
  );
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();

  const state = deriveEditorState({ text, hasCompiled: workflow !== null, compiledFromText });
  const cta = ctaFor(state);

  async function generate() {
    setError(null);
    startGenerating(async () => {
      try {
        // Save the draft first so the raw text survives even if extraction fails.
        // `create` is idempotent by content hash, so re-generating identical
        // text does not pile up duplicate drafts.
        const draft = await draftsApi.create(text, documentTitle);
        setDraftId(draft.id);

        const result = await draftsApi.extract(draft.id);
        setWorkflow(result.workflow);
        setCompiledFromText(text);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong while compiling the template.",
        );
      }
    });
  }

  return (
    <div className="px-7 pt-5">
      <div className="mb-4 flex items-end justify-between gap-7">
        <div>
          <a href="/admin" className="mb-2.5 inline-flex items-center gap-[7px] text-[12.5px] text-muted hover:text-ink">
            <span className="text-[13px]">←</span>See other templates
          </a>
          <h1 className="text-[22px] font-bold tracking-tight">{documentTitle}</h1>
          <div className="mt-[7px] text-xs text-muted">
            {workflow ? `Compiled · ${workflow.steps.length} steps` : "Draft · not yet compiled"}
          </div>
        </div>

        <div className="flex items-center gap-3.5">
          {state === "edited" && (
            <span className="text-xs text-muted">Text edited since last compile</span>
          )}
          <Button variant="secondary" disabled={text.trim() === ""}>Save draft</Button>
          <Button onClick={generate} disabled={!cta.enabled || isGenerating}>
            {isGenerating ? "Compiling…" : cta.label}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-control border border-danger/40 bg-danger/5 px-4 py-3 text-[13px] text-ink">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 items-stretch gap-5">
        <DraftEditor value={text} onChange={setText} state={state} wordCount={countWords(text)} />

        <section className="flex h-[calc(100vh-200px)] min-h-[520px] flex-col overflow-hidden rounded-card border border-line-admin bg-surface">
          <header className="flex items-center justify-between border-b border-line-admin px-[18px] py-[13px]">
            <span className="text-[11px] font-bold uppercase tracking-[.07em] text-muted">
              What Unblock AI understood
            </span>
            <span className="text-[11.5px] text-muted">
              {workflow ? `Read-only · ${workflow.steps.length} steps` : "Read-only"}
            </span>
          </header>

          {workflow ? (
            <div className="relative flex-1">
              {state === "edited" && <StaleBanner />}
              <WorkflowFlowchart workflow={workflow} />
            </div>
          ) : (
            <InertPlaceholder hasText={text.trim() !== ""} />
          )}
        </section>
      </div>
    </div>
  );
}

function StaleBanner() {
  return (
    <div className="absolute left-1/2 top-4 z-10 max-w-[340px] -translate-x-1/2 rounded-control border border-dashed border-warn/60 bg-warn/10 px-[15px] py-[11px] text-center text-xs leading-normal text-muted">
      Edit not yet compiled — the flowchart still shows the previous version.
    </div>
  );
}

function InertPlaceholder({ hasText }: { hasText: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[18px] bg-[repeating-linear-gradient(135deg,rgba(71,85,105,.035)_0_8px,transparent_8px_16px)]">
      <div className="flex flex-col items-center gap-[9px] opacity-55">
        {[0, 1, 2].map((i) => (
          <div key={i} className="contents">
            <div className="h-[34px] w-[132px] rounded-[9px] border border-dashed border-line-admin" />
            {i < 2 && <div className="h-4 w-px bg-line-admin" />}
          </div>
        ))}
      </div>
      <p className="max-w-[34ch] text-center text-[12.5px] text-muted">
        {hasText
          ? "Nothing compiled yet. Generate the template to see how Unblock AI read your workflow."
          : "The compiled flowchart will appear here once you write your workflow and generate the template."}
      </p>
    </div>
  );
}
```

### 11.6 `src/components/admin/DraftEditor.tsx`

```tsx
"use client";
import { EditorToolbar } from "./EditorToolbar";
import type { EditorState } from "@/lib/workflow/editorState";

interface Props {
  value: string;
  onChange: (v: string) => void;
  state: EditorState;
  wordCount: number;
}

/** The left panel: header, inert toolbar, and the actual textarea. */
export function DraftEditor({ value, onChange, state, wordCount }: Props) {
  const meta = {
    empty: "0 words",
    typed: `${wordCount} words · draft not saved`,
    generated: `${wordCount} words`,
    edited: `${wordCount} words · unsaved edit`,
  }[state];

  return (
    <section className="flex h-[calc(100vh-200px)] min-h-[520px] flex-col overflow-hidden rounded-card border border-line-admin bg-surface">
      <header className="flex items-center justify-between border-b border-line-admin px-[18px] py-[13px]">
        <span className="text-[11px] font-bold uppercase tracking-[.07em] text-muted">
          What you wrote
        </span>
        <span className="text-[11.5px] text-muted">{meta}</span>
      </header>

      <EditorToolbar />

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your workflow in plain text"
        spellCheck
        className="flex-1 resize-none px-[30px] pb-10 pt-[26px] text-[15px] leading-[1.78] text-ink outline-none placeholder:text-muted/65"
      />
    </section>
  );
}
```

`EditorToolbar.tsx` renders the mockup's formatting controls as **inert, non-interactive** buttons with `aria-hidden` and `tabIndex={-1}`. A toolbar that looks clickable and does nothing is worse than one that is visibly decorative — add a `title="Rich text formatting is not yet supported"` so the intent is discoverable.

> **Why the toolbar is inert.** Extraction consumes plain text. Bold and italics are stripped before the LLM ever sees them, so implementing them would produce formatting that silently vanishes. Keeping the toolbar visual preserves the mockup's composition without shipping a lie.

### 11.7 The page routes

```tsx
// src/app/admin/templates/new/page.tsx
import { TemplateEditor } from "@/components/admin/TemplateEditor";

export default function NewTemplatePage() {
  return <TemplateEditor documentTitle="Untitled template" />;
}
```

```tsx
// src/app/admin/templates/[id]/page.tsx
import { notFound } from "next/navigation";
import { workflowsApi } from "@/lib/api/workflows";
import { draftsApi } from "@/lib/api/drafts";
import { TemplateEditor } from "@/components/admin/TemplateEditor";
import { ApiError } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let workflow;
  try {
    workflow = await workflowsApi.get(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // The originating draft carries the admin's ORIGINAL prose, which is what the
  // left panel must show - not a reconstruction from the workflow JSON.
  let originalText = "";
  const draftId = /* from the summary/record endpoint */ null;
  if (draftId) {
    originalText = (await draftsApi.get(draftId)).raw_text;
  }

  return (
    <TemplateEditor
      documentTitle={workflow.title}
      initialText={originalText}
      initialWorkflow={workflow}
      initialDraftId={draftId}
    />
  );
}
```

> **Backend dependency:** `GET /api/workflows/:id` returns only `document`. To populate the left panel you need `draft_id`. Either add `GET /api/workflows/:id/record` returning the full row, or include `draft_id` in the `GET /api/workflows/:id` response. Do this in backend Phase 7 — it is a two-line change to `MongoWorkflowStore.getRecord` plus one route.

### 11.8 ✅ Verify Phase 11

1. `/admin/templates/new` → empty state, CTA disabled.
2. Type text → CTA enables, word count updates, right panel message changes.
3. Click **Generate template** → spinner, then a flowchart whose node count matches `workflow.steps.length` + terminals.
4. Edit one character → CTA becomes **Regenerate template**, amber stale banner appears.
5. Open an existing template from the list → left panel shows the original prose, right panel shows the compiled chart.

Unit-test `toFlowGraph` against both gold fixtures: assert node count, that the `it_faculty_overseas_leave` conditional Dean step is rendered as a `condition` node, and that `departmental_event_workshop`'s two parallel branches receive the same dagre rank.

---

## Phase 12 — Requester Portal: jobs list

**Mockup reference:** `UI Mockups/Common user portal/Unblock AI - Requester Portal.dc.html`, the `isList` branch (lines 23–77).

### 12.1 Scope honesty

A "job" is a *running instance* of a workflow. The execution engine does not exist, so there is nothing real to list yet. Build the screen against a **clearly-labelled fixture module**, with the shape it will have once execution lands — so replacing the fixture with a `jobsApi.list()` call is a one-line change.

```ts
// src/lib/fixtures/jobs.ts
/**
 * PLACEHOLDER DATA - NOT A BACKEND CALL.
 *
 * The workflow execution engine is out of scope for this phase, so there are no
 * real job instances to list. These fixtures exist so the screen can be built
 * and reviewed now. The shape matches the eventual API response exactly:
 * replacing this module with `jobsApi.list()` should require no component changes.
 *
 * DELETE THIS FILE when the execution engine ships.
 */
export type JobStatus = "in_progress" | "completed" | "rejected";

export interface Job {
  id: string;
  title: string;
  description: string;
  status: JobStatus;
  statusLabel: string;
  workflow_id: string;
  current_step: string | null;
  updated_at: string;
}

export const PLACEHOLDER_JOBS: Job[] = [
  {
    id: "leave",
    title: "Overseas Leave — 45 Days, Japan",
    description: "Academic Advisor → Head of Department → Dean. Waiting on Academic Advisor.",
    status: "in_progress", statusLabel: "In progress",
    workflow_id: "it_faculty_overseas_leave",
    current_step: "advisor_approval",
    updated_at: "2026-07-28T09:00:00Z",
  },
  {
    id: "letter",
    title: "Verification Letter — Enrolment Status",
    description: "Registry Office. Issued 28 July 2026, ready to download.",
    status: "completed", statusLabel: "Completed",
    workflow_id: "student_verification_letter",
    current_step: null,
    updated_at: "2026-07-28T14:20:00Z",
  },
  {
    id: "event",
    title: "Event Permission — IT Week Hackathon",
    description: "Student Affairs → Dean. Declined by the Dean on 12 July 2026 — venue capacity.",
    status: "rejected", statusLabel: "Rejected",
    workflow_id: "departmental_event_workshop",
    current_step: null,
    updated_at: "2026-07-12T11:00:00Z",
  },
];
```

### 12.2 `src/components/portal/JobRow.tsx`

```tsx
"use client";
import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import type { Job } from "@/lib/fixtures/jobs";

/** Status indicator as a lookup, not a conditional chain. */
function StatusIcon({ status }: { status: Job["status"] }) {
  if (status === "in_progress") return <Spinner size={34} />;

  const isDone = status === "completed";
  return (
    <div
      className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full ${
        isDone ? "bg-success" : "bg-danger"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        {isDone ? (
          <path d="M3.5 8.4l3 3 6-6.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M4 4l8 8M12 4l-8 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}

export function JobRow({ job, onDelete }: { job: Job; onDelete?: (id: string) => void }) {
  return (
    <div className="flex items-center gap-5 rounded-card border border-line bg-surface px-6 py-[22px] transition-all hover:border-slate-300 hover:shadow-[0_2px_10px_rgba(15,23,42,.06)]">
      <StatusIcon status={job.status} />

      <Link href={`/portal/jobs/${job.id}`} className="min-w-0 flex-1">
        <div className="text-[16.5px] font-semibold tracking-tight">{job.title}</div>
        <div className="mt-[5px] text-sm leading-normal text-muted">{job.description}</div>
      </Link>

      <div className="flex-none text-xs font-medium uppercase tracking-[.08em] text-muted">
        {job.statusLabel}
      </div>

      <button
        onClick={() => onDelete?.(job.id)}
        aria-label={`Delete ${job.title}`}
        className="flex h-9 w-9 flex-none items-center justify-center rounded-control border border-transparent hover:border-line hover:bg-bg"
      >
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M3 4.5h12M7 4.5V3h4v1.5M4.5 4.5l.8 10a1 1 0 001 .9h5.4a1 1 0 001-.9l.8-10M7.5 7.5v5M10.5 7.5v5"
            stroke="#475569" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
```

> **Accessibility note the mockup gets wrong.** The mockup nests a delete `<button>` inside a clickable row `<div>` with `onClick`, and relies on `stopPropagation`. That is not keyboard-navigable. The version above makes the *title area* the link and leaves the delete button a sibling — same visual, correct semantics, no event-propagation trickery.

### 12.3 `src/app/portal/page.tsx`

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { JobRow } from "@/components/portal/JobRow";
import { Button } from "@/components/ui/Button";
import { PLACEHOLDER_JOBS, type Job } from "@/lib/fixtures/jobs";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>(PLACEHOLDER_JOBS);

  return (
    <div className="mx-auto max-w-[1440px] px-16 pb-[120px] pt-14">
      <div className="mb-10 flex items-start justify-between gap-8">
        <div>
          <div className="mb-2.5 text-xs font-medium uppercase tracking-[.14em] text-muted">
            Unblock AI
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Your jobs</h1>
          <p className="mt-2 max-w-[52ch] text-[15px] text-muted">
            Every request you have started, and exactly who it is waiting on.
          </p>
        </div>
        <Link href="/portal/jobs/new" className="flex-none">
          <Button className="h-[50px] rounded-card px-[22px] text-[15px] font-medium">
            Create New Job
          </Button>
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center rounded-card border border-line bg-surface px-10 py-20 text-center">
          <div className="mb-6 h-14 w-14 rounded-card border border-dashed border-slate-300" />
          <div className="text-xl font-semibold tracking-tight">Nothing in progress yet</div>
          <p className="mb-7 mt-2.5 max-w-[44ch] text-[15px] text-muted">
            Start by describing what you need — overseas leave, a verification letter, a hall booking.
            We'll work out who has to approve it.
          </p>
          <Link href="/portal/jobs/new">
            <Button className="h-[50px] rounded-card px-[22px] text-[15px] font-medium">
              Create New Job
            </Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onDelete={(id) => setJobs((j) => j.filter((x) => x.id !== id))} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 12.4 ✅ Verify Phase 12

**Done when:** `/portal` renders three rows matching the mockup (spinner/check/cross indicators correct), deleting the last row reveals the empty state, and the "Create New Job" CTA routes to `/portal/jobs/new`.

---

## Phase 13 — Requester Portal: chat, clarifying loop, plan preview

**This is where the whole system pays off.** The `isSplit` branch of the mockup (lines 79–241): 40% chat on the left, workflow plan on the right.

### 13.1 What the mockup's conversation actually demonstrates

Read `CHAT_BUILD` (mockup lines 287–294) carefully — it is a precise specification of the selection loop:

```
user   : "I want to apply for overseas leave."
system : "There is more than one overseas leave workflow at the university.
          Which faculty are you attached to?"              ← decision: "ambiguous"
user   : "IT."
system : "I'll use Overseas Leave — Faculty of Information
          Technology. I need three things: your destination,
          your travel dates, and the reason for the trip."  ← decision: "matched"
user   : "Japan, 3 September to 18 October 2026, ..."
system : "That's 45 days. Trips longer than 30 days need the
          Dean's endorsement..."                            ← input collection (next phase)
```

**The first four turns are exactly the selection pipeline this plan builds.** Turns 5–6 are input collection and condition evaluation, which belong to the execution phase. So:

| Turn | Backed by | Phase |
|---|---|---|
| 1–2 | `POST /selection/sessions` → `decision: "ambiguous"` | ✅ this phase |
| 3–4 | `POST /selection/sessions/:id/answer` → `decision: "matched"` | ✅ this phase |
| Plan panel | `GET /selection/sessions/:id/workflow` → render steps | ✅ this phase |
| 5–6 | input collection, `computed` evaluation, conditional step insertion | ⏭ next phase |

After the match, render the workflow's steps as the plan and stop. The Submit button is present and, for now, routes to the jobs list.

### 13.2 Files

| Action | Path |
|---|---|
| Create | `src/app/portal/jobs/new/page.tsx` |
| Create | `src/components/portal/SelectionChat.tsx` |
| Create | `src/components/portal/ChatMessage.tsx` |
| Create | `src/components/portal/ChatComposer.tsx` |
| Create | `src/components/portal/PlanPanel.tsx` |
| Create | `src/components/portal/PlanNode.tsx` |
| Create | `src/lib/workflow/toPlanNodes.ts` |
| Create | `src/lib/hooks/useSelectionSession.ts` |

### 13.3 `src/lib/hooks/useSelectionSession.ts` — the loop, as a hook

All conversational state lives here. The components stay presentational.

```ts
"use client";
import { useCallback, useState } from "react";
import { selectionApi } from "@/lib/api/selection";
import { getRequesterContext, getSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/client";
import type { SelectionResponse } from "@/types/selection";
import type { Workflow } from "@/types/workflow";

export interface ChatMessage {
  id: string;
  role: "user" | "system" | "waiting";
  text: string;
  options?: string[];
}

/**
 * Drives one selection conversation.
 *
 * Single source of truth for: the message list, the session id, the current
 * decision, and the matched workflow. Components render this state and call
 * `send`; they never talk to the API themselves.
 */
export function useSelectionSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [decision, setDecision] = useState<SelectionResponse | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const push = useCallback((message: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [...prev, { ...message, id: `${prev.length}-${message.role}` }]);
  }, []);

  /**
   * Translates a decision into what the person sees.
   *
   * The four branches here ARE the product. Each one is a deliberate UX choice
   * about how to handle uncertainty, and none of them may silently guess.
   */
  const handleDecision = useCallback(
    async (response: SelectionResponse) => {
      setSessionId(response.session_id);
      setDecision(response);

      switch (response.decision) {
        case "ambiguous":
          // Ask the ONE question, offering its options as quick replies.
          push({ role: "system", text: response.question!, options: response.options });
          break;

        case "manual_choice":
          // Two rounds spent. Stop guessing, show the list.
          push({
            role: "system",
            text: response.question ?? "I could not narrow it down. Which of these do you want?",
            options: response.candidates.map((c) => c.title),
          });
          break;

        case "no_match":
          // Say so honestly. Never stretch to the nearest option.
          push({
            role: "system",
            text: "I could not find a workflow that matches that. Could you describe what you need differently, or tell me which department handles it?",
          });
          break;

        case "matched": {
          const matched = await selectionApi.getWorkflow(response.session_id);
          setWorkflow(matched);
          push({
            role: "system",
            text: `I'll use ${matched.title}. Review the steps on the right and submit when you're ready.`,
          });
          break;
        }
      }
    },
    [push],
  );

  /** Handles both the first message and every subsequent answer. */
  const send = useCallback(
    async (text: string) => {
      push({ role: "user", text });
      setIsBusy(true);
      try {
        const response = sessionId
          ? await selectionApi.answer(sessionId, text)
          : await selectionApi.start(text, getRequesterContext(getSession("requester")));
        await handleDecision(response);
      } catch (err) {
        push({
          role: "system",
          text: err instanceof ApiError
            ? `Something went wrong: ${err.message}`
            : "Something went wrong. Please try again.",
        });
      } finally {
        setIsBusy(false);
      }
    },
    [sessionId, push, handleDecision],
  );

  /** Explicit pick from the manual-choice list. */
  const choose = useCallback(
    async (workflowId: string) => {
      if (!sessionId) return;
      setIsBusy(true);
      try {
        await selectionApi.choose(sessionId, workflowId);
        const matched = await selectionApi.getWorkflow(sessionId);
        setWorkflow(matched);
        push({ role: "system", text: `I'll use ${matched.title}. Review the steps on the right.` });
      } finally {
        setIsBusy(false);
      }
    },
    [sessionId, push],
  );

  return { messages, decision, workflow, isBusy, send, choose, hasStarted: messages.length > 0 };
}
```

> **Why the requester context is passed on `start`:** the mock session knows the person's faculty. Sending it lets the selector skip *"Which faculty are you attached to?"* — the best clarifying question is the one you never had to ask. The backend already accepts `requester_context`; wire the prompt to use it as a later refinement.

### 13.4 `src/lib/workflow/toPlanNodes.ts`

The requester's plan is **not** the admin's flowchart. It is a linear, human-readable checklist in the mockup, showing who does what — no branches, no technical vocabulary.

```ts
import type { Workflow, WorkflowStep } from "@/types/workflow";

export type PlanNodeStatus = "done" | "current" | "todo";

export interface PlanNode {
  id: string;
  label: string;
  sub: string;
  status: PlanNodeStatus;
  inputs: string[];
  note: string | null;
  meta: string;
}

/**
 * Flattens a workflow into the requester-facing plan.
 *
 * Deliberately LINEAR while the admin flowchart is a graph: a person reading
 * "what happens to my request" wants an ordered list of who touches it, not a
 * DAG. Parallel steps are listed in topological order; the fact that two of
 * them can run at once is not information the requester acts on.
 *
 * PURE FUNCTION - unit-test against both gold fixtures.
 */
export function toPlanNodes(workflow: Workflow): PlanNode[] {
  const nodes: PlanNode[] = [];

  // 1. The submit step.
  nodes.push({
    id: "__submit",
    label: `Submit ${workflow.title}`,
    sub: describeScope(workflow),
    status: "done",
    inputs: [],
    note: null,
    meta: "",
  });

  // 2. Everything the requester must provide, as one node.
  const requesterInputs = workflow.inputs.filter((i) => i.collected_from.resolution === "requester");
  if (requesterInputs.length > 0) {
    nodes.push({
      id: "__inputs",
      label: "Provide Details",
      sub: "Information required from you",
      status: "current",
      inputs: requesterInputs.map((i) => i.label),
      note: null,
      meta: "",
    });
  }

  // 3. Steps in dependency order.
  for (const step of topologicalOrder(workflow.steps)) {
    nodes.push({
      id: step.id,
      label: step.name,
      sub: describeActor(step),
      status: "todo",
      inputs: [],
      // A conditional step needs its condition explained in plain words,
      // otherwise it looks like an arbitrary extra hoop.
      note: step.condition?.description ?? null,
      meta: "",
    });
  }

  // 4. The outcome.
  nodes.push({
    id: "__complete",
    label: "Collect Authorized Document",
    sub: "Signed authorization, ready to download",
    status: "todo",
    inputs: [],
    note: null,
    meta: "",
  });

  return nodes;
}

/** Names the approver in words a requester recognises. Never a raw snake_case role. */
function describeActor(step: WorkflowStep): string {
  const { assignee } = step;
  if (assignee.display_name) return assignee.display_name;
  if (assignee.resolution === "requester") return "You";
  if (assignee.resolution === "system") return "Automatic";
  if (assignee.role) return titleCase(assignee.role);
  return "To be assigned";
}

function describeScope(workflow: Workflow): string {
  const faculty = workflow.scope.applies_to.constraints.find(
    (c) => (c as { attribute?: string }).attribute === "faculty",
  ) as { value?: string } | undefined;
  return faculty?.value ? `Faculty of ${faculty.value}` : workflow.scope.institution_type;
}

function titleCase(role: string): string {
  return role.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Kahn's algorithm over depends_on.
 *
 * The graph is guaranteed acyclic by the backend's graphValidator, so this
 * always terminates. The `remaining` fallback is defensive only - it keeps the
 * UI rendering rather than looping forever if an unvalidated document ever
 * reaches the client.
 */
function topologicalOrder(steps: WorkflowStep[]): WorkflowStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const ordered: WorkflowStep[] = [];

  let remaining = [...steps];
  while (remaining.length > 0) {
    const ready = remaining.filter((s) =>
      s.depends_on.every((d) => visited.has(d.step_id) || !byId.has(d.step_id)),
    );
    if (ready.length === 0) {
      ordered.push(...remaining);   // defensive: emit the rest rather than hang
      break;
    }
    for (const step of ready) {
      ordered.push(step);
      visited.add(step.id);
    }
    remaining = remaining.filter((s) => !visited.has(s.id));
  }

  return ordered;
}
```

### 13.5 `src/components/portal/ChatMessage.tsx`

```tsx
import { Spinner } from "@/components/ui/Spinner";
import type { ChatMessage as Message } from "@/lib/hooks/useSelectionSession";

interface Props {
  message: Message;
  onOptionClick?: (option: string) => void;
  disabled?: boolean;
}

export function ChatMessage({ message, onOptionClick, disabled }: Props) {
  if (message.role === "user") {
    return (
      <div className="max-w-[82%] self-end rounded-card bg-ink px-[15px] py-3 text-[14.5px] leading-normal text-white">
        {message.text}
      </div>
    );
  }

  if (message.role === "waiting") {
    return (
      <div className="flex max-w-[88%] items-center gap-[11px] self-start rounded-card border border-warn-border bg-warn-bg px-4 py-3">
        <Spinner size={18} />
        <div className="text-[14.5px] font-medium">{message.text}</div>
      </div>
    );
  }

  return (
    <div className="max-w-[88%] self-start">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[.12em] text-muted">
        Unblock AI
      </div>
      <div className="rounded-card border border-line bg-bg px-[15px] py-[13px] text-[14.5px] leading-relaxed">
        {message.text}
      </div>

      {/* Quick replies. Typing "IT" and clicking "Information Technology"
          must produce the same result - both call `send`. */}
      {message.options && message.options.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {message.options.map((option) => (
            <button
              key={option}
              disabled={disabled}
              onClick={() => onOptionClick?.(option)}
              className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13.5px] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 13.6 `src/components/portal/PlanPanel.tsx` and `PlanNode.tsx`

`PlanNode` renders the three visual states from the mockup (lines 162–219):

- **done** — white card, green check circle, green meta text
- **current** — white card, 2px amber border, amber glow shadow, spinner, "CURRENT STEP" eyebrow, optional bullet list and note
- **todo** — muted `bg-bg` card, hollow grey circle, faint text

Between nodes, the connector: a 26px vertical line plus a chevron SVG, rendered for every node except the last.

```tsx
// src/components/portal/PlanPanel.tsx
"use client";
import { useMemo } from "react";
import { PlanNode } from "./PlanNode";
import { Button } from "@/components/ui/Button";
import { toPlanNodes } from "@/lib/workflow/toPlanNodes";
import type { Workflow } from "@/types/workflow";

export function PlanPanel({ workflow, onSubmit }: { workflow: Workflow | null; onSubmit: () => void }) {
  const nodes = useMemo(() => (workflow ? toPlanNodes(workflow) : []), [workflow]);

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm">
      <header className="flex flex-none items-center justify-between gap-4 border-b border-line px-7 py-5">
        <div className="text-[15px] font-semibold tracking-tight">Workflow plan</div>
        <div className="text-[13px] text-muted">
          {workflow ? `${nodes.length} steps · not yet submitted` : "Waiting for your request"}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-10 pt-8">
        {!workflow ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-[22px] h-12 w-12 rounded-card border border-dashed border-slate-300" />
            <div className="text-base font-semibold">No plan yet</div>
            <p className="mt-2.5 max-w-[38ch] text-[14.5px] leading-relaxed text-muted">
              Once you describe your request, every approval step will be mapped out here before
              anything is sent to anyone.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[560px] flex-col">
            {nodes.map((node, i) => (
              <PlanNode key={node.id} node={node} isLast={i === nodes.length - 1} />
            ))}

            <div className="mt-8 flex items-center justify-between gap-5 border-t border-line pt-6">
              <div className="max-w-[34ch] text-[13.5px] leading-normal text-muted">
                Nothing is sent to any approver until you submit.
              </div>
              <Button onClick={onSubmit} className="h-[48px] flex-none rounded-card px-[22px] text-[15px] font-medium">
                Submit request
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
```

> **"Nothing is sent to any approver until you submit."** That line is not filler — it is the product's core trust promise, and it is why the plan is shown *before* anything happens. Keep it.

### 13.7 `src/app/portal/jobs/new/page.tsx`

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useSelectionSession } from "@/lib/hooks/useSelectionSession";
import { SelectionChat } from "@/components/portal/SelectionChat";
import { PlanPanel } from "@/components/portal/PlanPanel";
import Link from "next/link";

export default function NewJobPage() {
  const router = useRouter();
  const { messages, workflow, isBusy, send, hasStarted } = useSelectionSession();

  return (
    <div className="mx-auto flex h-screen max-w-[1440px] flex-col px-16 pb-7 pt-9">
      <div className="mb-6 flex flex-none items-start justify-between gap-8">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[.14em] text-muted">New job</div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workflow ? workflow.title : "Create a new job"}
          </h1>
        </div>
        <Link href="/portal" className="flex flex-none items-center gap-2.5 px-1 py-2.5 text-[14.5px] font-medium">
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M11 3.5L5.5 9l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          See other jobs
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 gap-[22px]">
        <SelectionChat messages={messages} isBusy={isBusy} hasStarted={hasStarted} onSend={send} />
        <PlanPanel workflow={workflow} onSubmit={() => router.push("/portal")} />
      </div>
    </div>
  );
}
```

`SelectionChat` renders the empty prompt ("Tell us what you want to do."), the message list, and `ChatComposer`. The composer disables its send button while `isBusy` and shows a subtle "Thinking…" indicator — an LLM round-trip is 1–3 seconds and an unresponsive input feels broken.

### 13.8 The end-to-end script to demo

This is the acceptance test for the entire plan:

1. **Admin** — `/admin/templates/new`, paste the IT-faculty overseas leave draft, **Generate template**, verify the flowchart, publish (`review_status: "confirmed"`).
2. **Admin** — repeat with an *Engineering* faculty overseas leave draft. Two near-identical templates now exist.
3. **Requester** — `/portal/jobs/new`, type *"I want to apply for overseas leave"*.
4. **Expect:** `decision: "ambiguous"`, and the question is **"Which faculty are you attached to?"** — about the attribute, not the workflow names.
5. Answer *"IT"* (or click the quick reply).
6. **Expect:** `decision: "matched"` on `it_faculty_overseas_leave`, plan panel populates with the approval chain, Submit becomes available.
7. Start a new job and type *"how do I reset my email password"*.
8. **Expect:** `no_match`, with an honest message and no plan.

**Step 4 and step 8 are the whole point.** Step 4 proves disambiguation works on near-identical templates; step 8 proves the system will say "I don't know" instead of routing a password reset into a leave-approval chain.

### 13.9 ✅ Verify Phase 13

**Done when:** the eight-step script above passes end to end against a live backend, and `toPlanNodes` unit tests pass on both gold fixtures.

---

## Phase 14 — Backfill, Atlas, and operational notes

### 14.1 The backfill problem

Making `retrieval_summary` required means **every template saved before Phase 2 now fails validation** — including anything already in `data/workflows/`. Run the backfill *before* flipping the schema to required, or you will have documents that can never be re-saved.

`scripts/backfillSummaries.js`:

```js
/**
 * One-off migration: adds retrieval_summary to templates that predate it.
 *
 * Strategy: ask the LLM for ONLY the summary section, given the existing
 * workflow document. Cheaper and far lower-risk than re-running full extraction,
 * which could change the step graph of an already-reviewed template.
 *
 * Idempotent: templates that already have a summary are skipped, so re-running
 * after a partial failure is safe.
 */
import { MongoWorkflowStore } from "../src/knowledgeBank/mongoStore.js";
import { azureClient } from "../src/llm/azureClient.js";
import { config } from "../src/config/env.js";
import { closeDb } from "../src/db/mongoClient.js";

const store = new MongoWorkflowStore();
const summaries = await store.list();

for (const summary of summaries) {
  const workflow = await store.getById(summary.workflow_id);
  if (workflow.retrieval_summary) {
    console.log(`skip   ${summary.workflow_id} (already has a summary)`);
    continue;
  }

  const response = await azureClient.chat.completions.create({
    model: config.azure.deployment,
    temperature: 0,
    messages: [
      { role: "system", content: RETRIEVAL_SUMMARY_ONLY_PROMPT },
      { role: "user", content: JSON.stringify(workflow) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "retrieval_summary", schema: retrievalSummarySchema, strict: true },
    },
  });

  workflow.retrieval_summary = JSON.parse(response.choices[0].message.content);

  // save() re-renders and re-embeds automatically - that is exactly why
  // embedding lives inside the save path.
  const saved = await store.save(workflow);
  console.log(`backfill ${summary.workflow_id} -> v${saved.version}`);
}

await closeDb();
```

Add `"backfill:summaries": "node scripts/backfillSummaries.js"`.

**Order of operations, and it matters:**

1. Add `retrieval_summary` to `$defs` and `properties` — but **not** to `required`.
2. Deploy. Existing templates still validate.
3. Run `npm run backfill:summaries`.
4. Verify: `mongosh unblock_ai --eval "db.templates.countDocuments({ is_latest: true, 'document.retrieval_summary': { \$exists: false } })"` returns `0`.
5. **Now** add `retrieval_summary` to `required` and redeploy.

### 14.2 Moving to Atlas (only when the corpus grows)

Do this when you pass roughly 200 templates or when in-memory search shows up in latency profiling — not before.

🔧 **MANUAL:**

1. Create a free M0 cluster at [cloud.mongodb.com](https://cloud.mongodb.com).
2. Network Access → add your IP (or `0.0.0.0/0` for development only).
3. Database Access → create a user; note the password.
4. Copy the connection string into `MONGODB_URI`.
5. Atlas UI → Search → Create Search Index → **JSON Editor** → `vectorSearch` type:

```json
{
  "fields": [
    { "type": "vector", "path": "retrieval.embedding", "numDimensions": 1536, "similarity": "cosine" },
    { "type": "filter", "path": "is_latest" },
    { "type": "filter", "path": "review_status" },
    { "type": "filter", "path": "institution_type" }
  ]
}
```

Name it `template_vector_index`. Index building takes a few minutes.

Then add `src/retrieval/atlasVectorStore.js`:

```js
import { VectorStore } from "./vectorStore.js";
import { collection } from "../db/mongoClient.js";
import { COLLECTIONS, REVIEW_STATUS } from "../config/constants.js";

/**
 * $vectorSearch-backed retrieval. Implements the SAME interface as
 * InMemoryVectorStore, so swapping it in is one line at the composition root.
 */
export class AtlasVectorStore extends VectorStore {
  async search(queryVector, { k = 5, institutionType } = {}) {
    const templates = await collection(COLLECTIONS.TEMPLATES);
    const filter = { is_latest: true, review_status: REVIEW_STATUS.CONFIRMED };
    if (institutionType) filter.institution_type = institutionType;

    const results = await templates
      .aggregate([
        {
          $vectorSearch: {
            index: "template_vector_index",
            path: "retrieval.embedding",
            queryVector,
            numCandidates: Math.max(100, k * 20),
            limit: k,
            filter,
          },
        },
        {
          $project: {
            workflow_id: 1, version: 1, title: 1, description: 1,
            "retrieval.aliases_lower": 1, "retrieval.text": 1,
            "document.retrieval_summary": 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ])
      .toArray();

    return results.map((row) => ({
      workflow_id: row.workflow_id,
      version: row.version,
      title: row.title,
      description: row.description,
      score: row.score,
      aliases_lower: row.retrieval.aliases_lower ?? [],
      retrieval_summary: row.document?.retrieval_summary ?? null,
      retrieval_text: row.retrieval.text,
    }));
  }
}
```

Select it in `src/index.js` with one env-driven line:

```js
const vectorStore =
  process.env.VECTOR_BACKEND === "atlas"
    ? new AtlasVectorStore()
    : new InMemoryVectorStore(store);
```

> `$vectorSearch` returns a normalized score in `[0,1]` rather than raw cosine in `[-1,1]`. The alias boost constant (`0.15`) may need retuning after the switch — re-run `npm run evaluate:selection` and compare.

### 14.3 Operational rules

| Rule | Why |
|---|---|
| **Only `confirmed` templates are selectable.** | An unreviewed extraction routing real approvals is precisely the trust failure the whole deterministic-engine design exists to prevent. `listForRetrieval` filters on this — never relax it. |
| **Re-embed on every save.** | New version → new summary → stale vector. Keep embedding inside `save()`, never as a step someone can forget. |
| **Store `retrieval.text` verbatim.** | When selection misbehaves the first question is always "what did we actually embed?" Without this you are guessing. |
| **Log every selection to `selection_sessions`, including losing candidates and scores.** | It is your debugging trail today and your real evaluation set in a month. |
| **Record `model` and `dim` on every vector.** | The day either changes, every existing vector is invalid. Make that detectable with a query instead of discoverable through bad results. |
| **Never expose `reasoning` to the user.** | It is engineer-facing. Showing it turns an internal deliberation into a promise you did not intend to make. |

---

## Appendix A — Complete file manifest

### Backend (`UNBLOCK-AI/`)

| Phase | Path | New/Mod |
|---|---|---|
| 1 | `src/config/env.js` | Mod |
| 1 | `src/config/constants.js` | New |
| 1 | `.env`, `.env.example` | Mod |
| 2 | `src/schema/workflow.schema.json` | Mod |
| 2 | `src/llm/prompts/systemPrompt.js` | Mod |
| 2 | `fixtures/expected/*.json` (both) | Mod |
| 3 | `src/retrieval/renderSummary.js` | New |
| 3 | `src/retrieval/vectorMath.js` | New |
| 3 | `src/retrieval/embeddingClient.js` | New |
| 3 | `src/retrieval/embeddings.js` | New |
| 3 | `scripts/smokeTestEmbeddings.js` | New |
| 4 | `src/db/mongoClient.js` | New |
| 4 | `src/db/indexes.js` | New |
| 4 | `src/utils/hash.js` | New |
| 4 | `src/knowledgeBank/draftStore.js` | New |
| 4 | `src/knowledgeBank/mongoStore.js` | New |
| 4 | `scripts/initDb.js` | New |
| 4 | `src/index.js` | Mod |
| 5 | `src/retrieval/vectorStore.js` | New |
| 5 | `src/retrieval/inMemoryVectorStore.js` | New |
| 5 | `src/retrieval/aliasBoost.js` | New |
| 5 | `src/retrieval/retriever.js` | New |
| 6 | `src/selector/decisionSchema.js` | New |
| 6 | `src/selector/selectorPrompt.js` | New |
| 6 | `src/selector/selectorAgent.js` | New |
| 6 | `src/selector/selectionSessionStore.js` | New |
| 6 | `src/selector/selectionService.js` | New |
| 7 | `src/api/middleware/*.js` (3 files) | New |
| 7 | `src/api/draftRoutes.js` | New |
| 7 | `src/api/selectionRoutes.js` | New |
| 7 | `src/api/routes.js` | Mod |
| 8 | `fixtures/selection/queries.json` | New |
| 8 | `scripts/evaluateSelection.js` | New |
| 14 | `scripts/backfillSummaries.js` | New |
| 14 | `src/retrieval/atlasVectorStore.js` | New |

Tests: `tests/vectorMath.test.js`, `tests/renderSummary.test.js`, `tests/aliasBoost.test.js`, `tests/vectorStore.test.js`, `tests/mongoStore.test.js`, `tests/selectorAgent.test.js`, `tests/selectionService.test.js`, `tests/live/selectionQuality.test.js`.

### Frontend (`unblock-ai-web/`)

Full tree in §9.2. Roughly 40 files; every one is listed in its phase's file table.

---

## Appendix B — Consolidated manual-setup checklist

| # | Phase | Action |
|---|---|---|
| M1 | 0 | Install/run MongoDB (`docker run -d --name unblock-mongo -p 27017:27017 mongo:7`) |
| M2 | 0 | `npm run smoke-test:azure` → must print `OK` |
| M3 | 1 | Append the embedding + Mongo + retrieval block to `UNBLOCK-AI/.env` (§1.3) |
| M4 | 1 | Append the same keys **without values** to `.env.example` |
| M5 | 3 | `npm run smoke-test:embeddings` → 1536 dims, unit length 1.000000 |
| M6 | 4 | `npm install mongodb`, then `npm run init-db` |
| M7 | 7 | Set `CORS_ORIGIN=http://localhost:3001` if the frontend port differs |
| M8 | 9 | `npx create-next-app@latest unblock-ai-web ...` (§9.1) |
| M9 | 9 | Create `unblock-ai-web/.env.local` with `NEXT_PUBLIC_API_BASE_URL` |
| M10 | 13 | Seed **two** near-identical templates (IT + Engineering overseas leave) to demo disambiguation |
| M11 | 14 | Run `npm run backfill:summaries` **before** making `retrieval_summary` required |
| M12 | 14 | *(Optional, later)* Atlas cluster + `template_vector_index` (§14.2) |
| M13 | — | **Rotate the embedding API key** before any deployment — it was shared in plain text |

---

## Appendix C — Running everything

```bash
# Terminal 1 — MongoDB
docker start unblock-mongo

# Terminal 2 — backend
cd "d:/Asentic project/UNBLOCK-AI APP/UNBLOCK-AI"
npm run dev                       # http://localhost:3000

# Terminal 3 — frontend
cd "d:/Asentic project/UNBLOCK-AI APP/unblock-ai-web"
npm run dev                       # http://localhost:3001
```

| URL | Screen |
|---|---|
| `http://localhost:3001/admin` | Template list |
| `http://localhost:3001/admin/templates/new` | Editor (blank) |
| `http://localhost:3001/portal` | Jobs list |
| `http://localhost:3001/portal/jobs/new` | Chat + plan — **the selection pipeline** |

```bash
# Quality gates
npm test                       # offline suites
npm run test:live              # live extraction accuracy
npm run evaluate:selection     # Recall@5 + decision accuracy
npx tsc --noEmit               # frontend types (in unblock-ai-web/)
```

---

## Appendix D — Explicitly out of scope

Stated so nobody builds it by accident, and so the gaps are visible when reviewing:

- **Workflow execution.** Nothing runs a saved workflow: no approver resolution against a real directory, no condition evaluation at runtime, no emails, no state machine. The requester portal stops at "here is the plan, submit it".
- **Real authentication.** `getSession()` returns hardcoded people. There is no login, no session cookie, no route protection, no authorization check on any backend endpoint.
- **The requester job-detail screens.** `/portal/jobs/[id]`, the "Waiting on approver" state, and the mid-workflow "more info requested" flow are built against `PLACEHOLDER_JOBS` and are not connected to anything.
- **Input collection.** Mockup chat turns 5–6 (collecting destination/dates, computing 45 days, inserting the Dean step) belong to the execution phase.
- **Policy-document RAG.** A genuinely different retrieval problem — chunked passages, consumed by a Planner Agent. See `WORKFLOW_SELECTION_PLAN.md` §2 for why conflating it with workflow selection would be a mistake.
- **Rich-text editing.** The admin toolbar is deliberately inert; extraction consumes plain text.
- **Multi-tenancy.** `institution_type` exists as a filter but there is no organisation model, and no data isolation between institutions.
