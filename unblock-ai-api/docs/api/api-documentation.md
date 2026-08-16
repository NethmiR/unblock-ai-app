# UNBLOCK-AI — API Documentation

Reference for every HTTP endpoint exposed by the Express server, written for
manual testing in Postman.

- **Server entry point:** `src/server.ts`
- **App builder:** `src/app.ts`
- **Route modules:** `src/routes/health.route.ts`, `src/routes/workflow.route.ts`, `src/routes/draft.route.ts`, `src/routes/selection.route.ts`, `src/routes/task.route.ts`

---

## 1. Getting started

### Base URL

Every route is mounted under the `/api` prefix (`src/routes/index.route.ts`).

```
http://localhost:3000/api
```

The port comes from the `PORT` environment variable and defaults to `3000`.

**Suggested Postman environment variables**

| Variable        | Example value               |
| --------------- | ---------------------------- |
| `baseUrl`       | `http://localhost:3000/api` |
| `draftId`       | (filled in from a response) |
| `workflowId`    | (filled in from a response) |
| `sessionId`     | (filled in from a response) |
| `taskId`        | (filled in from a response) |

The runnable Postman collection and environment ship at [../postman/](../postman/).

### Running the server

```bash
npm install
npm run init-db     # creates Mongo indexes
npm run dev          # tsx watch, or: npm run build && npm start
```

The process refuses to start unless the required variables are set — see
[../guides/configuration.md](../guides/configuration.md) for the full list, or
`src/config/env.config.ts` / `src/config/index.config.ts` for how they are read and validated.

### Headers

| Header         | Value              | When                             |
| -------------- | ------------------ | --------------------------------- |
| `Content-Type` | `application/json` | On every `POST`/`PUT`/`PATCH`    |

There is **no authentication** on any route. `src/middlewares/cors.middleware.ts` sends
an `Authorization` header in `Access-Control-Allow-Headers`, but no middleware
reads it — `req.user` is always `undefined`, so `submitted_by` on a draft is
always `null`.

Request bodies are capped at **1 MB** (`express.json({ limit: "1mb" })`, `src/middlewares/json-body.middleware.ts`).

### CORS

Allowed origin is `CORS_ORIGIN`, defaulting to `http://localhost:3001`. This
only affects browsers; Postman ignores it.

---

## 2. Endpoint index

| # | Method | Path | Purpose |
| - | ------ | ---- | ------- |
| 1 | `GET`    | `/api/health`                          | Liveness check |
| 2 | `POST`   | `/api/workflows/extract`               | Extract a workflow JSON from prose (does **not** save) |
| 3 | `POST`   | `/api/workflows`                       | Save a workflow document as a new version |
| 4 | `GET`    | `/api/workflows`                       | List latest workflow summaries |
| 5 | `GET`    | `/api/workflows/:id`                   | Get one workflow document |
| 6 | `PUT`    | `/api/workflows/:id`                   | Update a workflow (saves a new version) |
| 7 | `POST`   | `/api/workflows/:id/validate`          | Validate a workflow without saving |
| 8 | `POST`   | `/api/drafts`                          | Save raw prose as a draft (idempotent) |
| 9 | `GET`    | `/api/drafts`                          | List drafts |
| 10 | `GET`   | `/api/drafts/:id`                      | Get one draft |
| 11 | `POST`  | `/api/drafts/:id/extract`              | Generate + save a template from a draft |
| 12 | `GET`   | `/api/workflows/:id/record`            | Get the full stored row (admin editor) |
| 13 | `PATCH` | `/api/workflows/:id/review`            | Publish / reject a template |
| 14 | `POST`  | `/api/selection/sessions`              | Start a selection conversation (round 1) |
| 15 | `POST`  | `/api/selection/sessions/:id/answer`   | Answer a clarifying question (round 2+) |
| 16 | `POST`  | `/api/selection/sessions/:id/choose`   | Pick a workflow manually |
| 17 | `GET`   | `/api/selection/sessions/:id/workflow` | Get the matched workflow document |
| 18 | `POST`  | `/api/tasks`                           | Create a task from a matched selection session |
| 19 | `GET`   | `/api/tasks`                           | List tasks (filter by `session_id` / `status`) |
| 20 | `GET`   | `/api/tasks/:id`                       | Get one task |
| 21 | `GET`   | `/api/tasks/:id/next`                  | Get the next unfilled requirement |
| 22 | `POST`  | `/api/tasks/:id/values`                | Submit a value for a requirement |
| 23 | `POST`  | `/api/tasks/:id/finalize`              | Finalize a task once all required values are filled |
| 24 | `PATCH` | `/api/tasks/:id/status`                | Cancel a task |

25 total route bindings (24 original + health). There is **no** `DELETE` route
anywhere in the codebase; `DELETE` appears in the CORS allow-list only.

---

## 3. Health endpoint

### 3.1 `GET /api/health`

Liveness check — no dependencies (Mongo, Azure) are touched.

**200 OK**

```json
{ "status": "ok", "uptime": 123.456, "version": "1.0.0" }
```

`uptime` is `process.uptime()` in seconds; `version` is read from `package.json`.

---

## 4. Workflow endpoints

### 4.1 `POST /api/workflows/extract`

Sends prose to Azure OpenAI and returns the extracted workflow JSON. Nothing is
persisted — use this to preview extraction. It retries internally (up to
`config.azureOpenAI.maxExtractionAttempts`, default 3), feeding validation errors
back to the model as repair prompts.

**Request body**

| Field  | Type   | Required | Notes                    |
| ------ | ------ | -------- | ------------------------ |
| `text` | string | yes      | Must be non-empty after trimming |

```json
{
  "text": "Any undergraduate student of the Faculty of Information Technology who intends to travel overseas during the academic term must obtain prior approval before leaving the country. The student submits a request stating their full name, index number, the destination country, the departure date, the return date, and the reason for the trip. The request first goes to the student's Academic Advisor for approval. Once the Academic Advisor approves, it goes to the Head of the Department of Information Technology."
}
```

**200 OK**

```json
{
  "workflow": {
    "schema_version": "1.0",
    "workflow_id": "it_faculty_overseas_leave",
    "title": "IT Faculty Overseas Leave Approval",
    "description": "...",
    "retrieval_summary": { "...": "..." },
    "scope": { "...": "..." },
    "requester": { "...": "..." },
    "inputs": [],
    "computed": [],
    "steps": [],
    "completion": { "...": "..." },
    "metadata": { "...": "..." }
  },
  "validation": { "valid": true, "errors": [] },
  "attempts": 1
}
```

`attempts` is how many model calls it took. `validation` is always
`{ valid: true, errors: [] }` here, because an invalid result throws instead of
returning.

**Errors**

| Status | Cause |
| ------ | ----- |
| `400`  | `text` missing, not a string, or blank |
| `422`  | Extraction failed after all attempts, or the text does not describe a workflow |
| `500`  | Unhandled error (e.g. Azure network failure) |

422 body:

```json
{
  "error": "Source text does not describe a workflow",
  "code": "EXTRACTION_ERROR",
  "details": ["The text is a menu, not a process."]
}
```

**Note:** this call is slow — expect **10–60 seconds**. Raise the Postman
request timeout before testing it.

---

### 4.2 `POST /api/workflows`

Validates a full workflow document and saves it as a **new version**. Version
numbers auto-increment per `workflow_id`; the previous latest is demoted
(`is_latest: false`). An embedding is generated during the save.

**Request body**

| Field      | Type   | Required | Notes |
| ---------- | ------ | -------- | ----- |
| `workflow` | object | yes      | Must satisfy `src/data/schemas/workflow.schema.json` and the graph rules |

```json
{
  "workflow": {
    "schema_version": "1.0",
    "workflow_id": "departmental_event_workshop",
    "title": "Departmental Event & Workshop Organization",
    "description": "Approval process for departments organizing an event or workshop.",
    "retrieval_summary": {
      "one_liner": "Get approval to run a departmental event or workshop.",
      "aliases": ["event approval", "workshop approval"],
      "keywords": ["book a hall", "run a workshop", "seminar"],
      "requester_types": ["academic staff"],
      "triggers": ["running a workshop for the department"],
      "not_for": ["personal or private venue bookings"]
    },
    "scope": {
      "institution_type": "university",
      "applies_to": { "actor_type": "staff", "constraints": [] }
    },
    "requester": { "actor_type": "staff", "identifier_field": "department_id" },
    "inputs": [
      {
        "id": "event_name",
        "label": "Event Name",
        "description": "Name of the event or workshop.",
        "type": "string",
        "collected_from": { "resolution": "requester", "role": null, "relative_to": null, "directory_query": null, "fallback_role": null, "display_name": null },
        "required": true,
        "validation": { "min_length": null, "max_length": null, "min": null, "max": null, "not_before": null, "not_after": null, "not_before_field": null, "not_after_field": null, "pattern": null },
        "collection_hint": null
      }
    ],
    "computed": [],
    "steps": [
      {
        "id": "hall_booking",
        "name": "Hall Booking Approval",
        "type": "approval",
        "description": "Approval of the venue booking for the event.",
        "assignee": { "resolution": "static", "role": "venue_admin", "relative_to": null, "directory_query": null, "fallback_role": null, "display_name": "Hall Warden" },
        "depends_on": [],
        "initial_state": "auto",
        "blocked_reason": null,
        "condition": null,
        "instructions_to_approver": "Confirm venue availability and capacity.",
        "response_fields": [
          { "id": "venue_name", "label": "Assigned Venue", "type": "string", "required_on_outcome": ["approved"] }
        ],
        "context_from_steps": [],
        "outcomes": {
          "approved": { "action": "continue", "notify": [], "include_reason": null, "return_to_step": null, "prompt_source": null },
          "rejected": { "action": "terminate_workflow", "notify": [], "include_reason": true, "return_to_step": null, "prompt_source": null },
          "request_more_info": null
        },
        "notifications": {
          "on_assign": { "channel": "email", "template": "approval_request" },
          "on_outcome": { "channel": "email", "template": "approval_result" }
        },
        "sla": { "reminder_after_hours": 48, "escalate_after_hours": 120 }
      }
    ],
    "completion": {
      "rule": "all_required_steps_complete",
      "required_steps": ["hall_booking"],
      "actions": []
    },
    "metadata": {
      "created_from": "plain_text",
      "source_text_hash": "sha256:placeholder",
      "extraction_model": "gpt-4o-2024-08-06",
      "extraction_timestamp": "2026-07-30T10:00:00Z",
      "confidence": "medium",
      "ambiguities": [],
      "unmapped_roles": [],
      "review_status": "pending_admin_review"
    }
  }
}
```

> The schema uses `"additionalProperties": false` and lists **every** field as
> required — including the nullable ones. You cannot omit `blocked_reason`,
> `condition`, or the `validation` sub-object; send them as `null` / all-null.
> A complete working example lives at
> `src/data/samples/expected/departmental_event_workshop.json`.

**201 Created**

```json
{ "id": "departmental_event_workshop", "version": 1 }
```

**Errors**

| Status | Body |
| ------ | ---- |
| `400`  | `{ "error": "Body must include a 'workflow' object", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | `{ "error": "Workflow failed validation", "code": "VALIDATION_ERROR", "details": ["/steps/0: must have required property 'sla'"] }` |
| `502`  | `{ "error": "...", "code": "EMBEDDING_ERROR", "details": null }` — embedding service failure |

A schema- or graph-invalid workflow is a **400**, not a 422: `ValidationService.assertValid`
throws `ValidationError`, and the failing rules arrive in `details` as a string array.
422 is reserved for `ExtractionError` — the model failing to produce a workflow — so the
status distinguishes "your document is wrong" from "we could not build one from your prose".

---

### 4.3 `GET /api/workflows`

Lists the latest version of every workflow, newest `updated_at` first.

**Query parameters**

| Name               | Type   | Required | Notes |
| ------------------ | ------ | -------- | ----- |
| `institution_type` | string | no       | One of `university`, `school`, `company`, `hospital`, `government`, `other` |

`GET {{baseUrl}}/workflows?institution_type=university`

**200 OK** — an array (empty array when nothing matches, not a 404):

```json
[
  {
    "workflow_id": "departmental_event_workshop",
    "title": "Departmental Event & Workshop Organization",
    "description": "Approval process for departments organizing an event or workshop.",
    "version": 2,
    "schema_version": "1.0",
    "review_status": "confirmed",
    "draft_id": "6710f1a2b3c4d5e6f7089abc",
    "updated_at": "2026-08-10T09:12:44.301Z"
  }
]
```

> The route only forwards `institution_type`. The store also understands a
> `review_status` filter, but no route passes it, so `?review_status=` is ignored.

---

### 4.4 `GET /api/workflows/:id`

Returns the bare workflow **document** — no storage metadata. This is what the
selector preview consumes.

| Parameter | In    | Required | Notes |
| --------- | ----- | -------- | ----- |
| `id`      | path  | yes      | The `workflow_id`, e.g. `departmental_event_workshop` |
| `version` | query | no       | A specific version number; omit for the latest |

`GET {{baseUrl}}/workflows/departmental_event_workshop?version=1`

**200 OK** — the full workflow object (same shape as `workflow` in §4.1).

**400 Bad Request** — `version` was present but not a positive integer. An empty
`?version=` is treated as absent (latest), so a Postman param left blank is harmless:

```json
{ "error": "version must be a positive integer", "code": "VALIDATION_ERROR", "details": null }
```

**404 Not Found**

```json
{ "error": "Workflow 'unknown_id' not found", "code": "NOT_FOUND", "details": null }
```

---

### 4.5 `PUT /api/workflows/:id`

Validates and saves a new version. `workflow_id` in the body is overridden by
the `:id` path parameter, so the two can differ without error — the path wins.

This is **not** a partial update: send the entire document, exactly as in §4.2.

**Request body** — identical to `POST /api/workflows`.

**200 OK** (note: 200, not 201)

```json
{ "id": "departmental_event_workshop", "version": 3 }
```

**Errors:** `400`, `502` — same as §4.2 (a validation failure is a 400, not a 422).

> Calling `PUT` against an `:id` that has never been saved does not 404. It
> creates version 1 of that id.

---

### 4.6 `POST /api/workflows/:id/validate`

Runs schema + graph validation and reports the result. Nothing is saved, and
the `:id` path parameter is **not used** by the handler — any value works.

**Request body** — same `{ "workflow": { ... } }` envelope as §4.2.

**200 OK** — valid:

```json
{ "valid": true, "errors": [] }
```

**200 OK** — invalid (still 200; check the `valid` flag):

```json
{
  "valid": false,
  "errors": [
    "/steps/0/depends_on/0/step_id: references unknown step 'missing_step'",
    "/metadata: must have required property 'confidence'"
  ]
}
```

**400 Bad Request** — `{ "error": "Body must include a 'workflow' object", "code": "VALIDATION_ERROR", "details": null }`

---

## 5. Draft endpoints (admin write path)

The admin flow is: **save draft → extract → review → publish.**

### 5.1 `POST /api/drafts`

Stores raw prose. **Idempotent by SHA-256 of the text** — submitting identical
text twice returns the original draft (still with status `201`), it does not
create a second row.

**Request body**

| Field   | Type           | Required | Default | Notes |
| ------- | -------------- | -------- | ------- | ----- |
| `text`  | string         | yes      | —       | Non-empty after trimming; stored as `raw_text` and never modified |
| `title` | string \| null | no       | `null`  | Display label |

```json
{
  "title": "IT Faculty Overseas Leave",
  "text": "Any undergraduate student of the Faculty of Information Technology who intends to travel overseas during the academic term must obtain prior approval before leaving the country. The student submits a request stating their full name, index number, the destination country, the departure date, the return date, and the reason for the trip. The request first goes to the student's Academic Advisor for approval. Once the Academic Advisor approves, it goes to the Head of the Department of Information Technology."
}
```

**201 Created**

```json
{
  "id": "6710f1a2b3c4d5e6f7089abc",
  "title": "IT Faculty Overseas Leave",
  "raw_text": "Any undergraduate student of the Faculty ...",
  "status": "pending",
  "failure_reason": null,
  "workflow_id": null,
  "created_at": "2026-08-10T09:10:00.000Z",
  "updated_at": "2026-08-10T09:10:00.000Z"
}
```

`status` is one of `pending`, `extracted`, `failed`, `rejected`.

Save `id` into `{{draftId}}` — the next call needs it.

**400 Bad Request** — `{ "error": "Body must include a non-empty 'text' field", "code": "VALIDATION_ERROR", "details": null }`

---

### 5.2 `GET /api/drafts`

Lists drafts, newest `created_at` first, **capped at 50** (not configurable via
query string — the limit is a store default).

**200 OK** — array of the same objects as §5.1. Empty array when there are none.

---

### 5.3 `GET /api/drafts/:id`

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | 24-character hex Mongo ObjectId |

**200 OK** — one draft object (same shape as §5.1).

**404 Not Found** — `{ "error": "Draft not found", "code": "NOT_FOUND", "details": null }`

> A malformed id (not 24-hex) throws inside the ObjectId constructor and
> surfaces as **500**, not 404.

---

### 5.4 `POST /api/drafts/:id/extract`

The core admin action, "Generate template". It extracts the workflow from the
draft's `raw_text`, saves it as a new version with its embedding, and links the
draft to the resulting `workflow_id`.

**Request body:** none.

**201 Created**

```json
{
  "draft_id": "6710f1a2b3c4d5e6f7089abc",
  "workflow_id": "it_faculty_overseas_leave",
  "version": 1,
  "attempts": 1,
  "review_status": "pending_admin_review",
  "workflow": { "...": "the full extracted document" }
}
```

The new template is saved with `review_status: "pending_admin_review"`, which
means it is **not yet selectable** by the selection endpoints. Publish it via
§5.6 first.

**Errors**

| Status | Cause |
| ------ | ----- |
| `404`  | `{ "error": "Draft not found", "code": "NOT_FOUND", "details": null }` |
| `422`  | Extraction failed or the text is not a workflow |
| `500`  | Unhandled failure |

On a 422 the draft is updated as a side effect before the error is returned:
`status` becomes `rejected` when the text does not describe a workflow, and
`failed` otherwise — with the reason in `failure_reason`. Re-fetch the draft
(§5.3) to see it.

Same latency caveat as §4.1 — allow up to a minute.

---

### 5.5 `GET /api/workflows/:id/record`

The full stored row rather than the bare document. The admin editor needs
`draft_id` so it can load the original prose beside the generated template.

| Parameter | In    | Required | Notes |
| --------- | ----- | -------- | ----- |
| `id`      | path  | yes      | The `workflow_id` |
| `version` | query | no       | Defaults to the latest |

**200 OK**

```json
{
  "workflow_id": "it_faculty_overseas_leave",
  "version": 1,
  "draft_id": "6710f1a2b3c4d5e6f7089abc",
  "review_status": "pending_admin_review",
  "document": { "...": "the full workflow" },
  "updated_at": "2026-08-10T09:12:44.301Z"
}
```

**404 Not Found** — `{ "error": "Workflow 'unknown_id' not found", "code": "NOT_FOUND", "details": null }`

---

### 5.6 `PATCH /api/workflows/:id/review`

**The only thing that makes a template selectable.** Retrieval considers a
template a candidate only when `review_status` is `confirmed`.

**Request body**

| Field           | Type   | Required | Notes |
| --------------- | ------ | -------- | ----- |
| `review_status` | string | yes      | `pending_admin_review` \| `confirmed` \| `rejected` |
| `version`       | number | no       | Defaults to the latest version |

```json
{ "review_status": "confirmed" }
```

**200 OK** — the updated summary:

```json
{
  "workflow_id": "it_faculty_overseas_leave",
  "title": "IT Faculty Overseas Leave Approval",
  "description": "...",
  "version": 1,
  "schema_version": "1.0",
  "review_status": "confirmed",
  "draft_id": "6710f1a2b3c4d5e6f7089abc",
  "updated_at": "2026-08-10T09:20:11.884Z"
}
```

This writes the status in two places: the row's `review_status` and the
document's `metadata.review_status`.

**Errors**

| Status | Body |
| ------ | ---- |
| `400`  | `{ "error": "review_status must be one of: pending_admin_review, confirmed, rejected", "code": "VALIDATION_ERROR", "details": null }` |
| `404`  | `{ "error": "Workflow not found", "code": "NOT_FOUND", "details": null }` |

---

## 6. Selection endpoints (end-user read path)

A multi-round conversation that maps a plain-language request onto one
confirmed template. The agent returns one of four decisions:

| `decision`      | Meaning |
| --------------- | ------- |
| `matched`       | One template chosen; `workflow_id` is set. Terminal. |
| `ambiguous`     | A clarifying question is being asked; answer it via §6.2 |
| `no_match`      | Nothing suitable. Terminal. |
| `manual_choice` | The round budget ran out; the user must pick from `options`. Produced by the service loop, never by the model. |

The round cap is `SELECTION_MAX_ROUNDS`, default **2**.

### 6.1 `POST /api/selection/sessions`

Round 1. Retrieves candidates (this is the **only** retrieval in the whole
conversation), asks the selector agent to decide, and persists the session.

**Request body**

| Field               | Type           | Required | Default | Notes |
| ------------------- | -------------- | -------- | ------- | ----- |
| `query`             | string         | yes      | —       | Non-empty after trimming; the user's request in plain language |
| `requester_context` | object \| null | no       | `null`  | Stored on the session; passed through, not used for filtering |
| `institution_type`  | string \| null | no       | `null`  | Restricts candidates to that institution type |

```json
{
  "query": "I want to book a hall for a workshop next month",
  "institution_type": "university",
  "requester_context": { "actor_type": "staff", "department": "Information Technology" }
}
```

**201 Created** — `matched`:

```json
{
  "session_id": "6710f9c0a1b2c3d4e5f60789",
  "decision": "matched",
  "workflow_id": "departmental_event_workshop",
  "confidence": "high",
  "question": null,
  "options": [],
  "candidates": [
    {
      "workflow_id": "departmental_event_workshop",
      "title": "Departmental Event & Workshop Organization",
      "one_liner": "Get approval to run a departmental event or workshop.",
      "score": 0.8471
    },
    {
      "workflow_id": "it_faculty_overseas_leave",
      "title": "IT Faculty Overseas Leave Approval",
      "one_liner": "Get approval before travelling overseas during term.",
      "score": 0.4113
    }
  ]
}
```

**201 Created** — `ambiguous`:

```json
{
  "session_id": "6710f9c0a1b2c3d4e5f60789",
  "decision": "ambiguous",
  "workflow_id": null,
  "confidence": "medium",
  "question": "Is this an academic workshop for your department, or a private booking?",
  "options": ["Departmental workshop", "Private booking"],
  "candidates": [ "..." ]
}
```

**201 Created** — `no_match` (also what you get when nothing is published):

```json
{
  "session_id": "6710f9c0a1b2c3d4e5f60789",
  "decision": "no_match",
  "workflow_id": null,
  "confidence": "high",
  "question": null,
  "options": [],
  "candidates": []
}
```

The response shape is identical across all four decisions; only the fields'
values change. `score` is the retrieval similarity rounded to 4 decimals, and
`candidates` is capped by `RETRIEVAL_TOP_K` (default 5). The agent's internal
`reasoning` is deliberately stripped from the response.

**Errors**

| Status | Cause |
| ------ | ----- |
| `400`  | `{ "error": "Body must include a non-empty 'query' field", "code": "VALIDATION_ERROR", "details": null }` |
| `502`  | Selector or embedding call failed — `{ "error": "Selector call failed: ...", "code": "SELECTION_ERROR", "details": null }` |

> If you get `no_match` with an empty `candidates` array, the usual cause is
> that no template has been published. Run §5.6 with `"confirmed"` first.

---

### 6.2 `POST /api/selection/sessions/:id/answer`

Round 2+. Records the answer, replays the full transcript to the agent, and
decides again. **Retrieval is deliberately not re-run** — the candidate set from
round 1 is reused; the ambiguity is about choosing within it.

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | `session_id` from §6.1 |

**Request body**

| Field    | Type   | Required | Notes |
| -------- | ------ | -------- | ----- |
| `answer` | string | yes      | Non-empty after trimming; free text, not restricted to `options` |

```json
{ "answer": "It's a departmental workshop for our students" }
```

**200 OK** — same shape as §6.1 (note: 200, not 201).

Once the round budget is exhausted, an ambiguous verdict is converted to:

```json
{
  "session_id": "6710f9c0a1b2c3d4e5f60789",
  "decision": "manual_choice",
  "workflow_id": null,
  "confidence": "low",
  "question": "I could not narrow it down. Which of these do you want?",
  "options": ["Departmental Event & Workshop Organization", "IT Faculty Overseas Leave Approval"],
  "candidates": [ "..." ]
}
```

`options` then holds candidate **titles**, but §6.3 expects a `workflow_id` —
map the chosen title back through the `candidates` array to get its id.

**Errors**

| Status | Cause |
| ------ | ----- |
| `400`  | `{ "error": "Body must include a non-empty 'answer' field", "code": "VALIDATION_ERROR", "details": null }` |
| `404`  | Unknown session id |
| `502`  | Selector call failed |

---

### 6.3 `POST /api/selection/sessions/:id/choose`

The user picked explicitly from a `manual_choice` list. Terminal — it finalizes
the session as `matched`.

**Request body**

| Field         | Type   | Required | Notes |
| ------------- | ------ | -------- | ----- |
| `workflow_id` | string | yes      | Must be one of this session's `candidates` |

```json
{ "workflow_id": "departmental_event_workshop" }
```

**200 OK** — a short body; there is no `candidates` array here:

```json
{
  "session_id": "6710f9c0a1b2c3d4e5f60789",
  "decision": "matched",
  "workflow_id": "departmental_event_workshop"
}
```

**Errors**

| Status | Cause |
| ------ | ----- |
| `400`  | `{ "error": "Body must include a non-empty 'workflow_id' field", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | `{ "error": "'<workflow_id>' was not among this session's candidates", "code": "VALIDATION_ERROR", "details": null }` |
| `404`  | `{ "error": "Selection session '<id>' not found", "code": "NOT_FOUND", "details": null }` |
| `500`  | The `:id` is not a 24-character hex ObjectId — see the note in §6.4 |

---

### 6.4 `GET /api/selection/sessions/:id/workflow`

The full document for the matched workflow — this drives the plan preview.

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | `session_id` |

**200 OK** — the full workflow document (same shape as §4.4).

**Errors**

| Status | Body | Cause |
| ------ | ---- | ----- |
| `409`  | `{ "error": "This session has not matched a workflow yet", "code": "CONFLICT", "details": null }` | Session is still ambiguous or ended in `no_match` |
| `404`  | `{ "error": "Selection session '<id>' not found", "code": "NOT_FOUND", "details": null }` | The session id is unknown |
| `404`  | `{ "error": "Workflow '<id>' not found", "code": "NOT_FOUND", "details": null }` | The session matched an id that no longer exists |
| `500`  | `{ "error": "Failed to look up selection session", "code": "DATABASE_ERROR", "details": null }` | The `:id` is not a valid ObjectId |

> **Known rough edge.** A `session_id` that is not a 24-character hex ObjectId
> surfaces as a **500 `DATABASE_ERROR`** rather than a 400 — see
> [§7.1](#71-malformed-objectid-parameters-return-500), which covers drafts too.

---

## 7. Task endpoints (requirement collection)

A task walks a requester through supplying the values a matched workflow needs, then
finalizes into a runnable plan. It is created from a **matched** selection session
(§6), and moves through a small status machine:

| `status` | Meaning |
| --------- | ------- |
| `collecting` | Values are still being gathered. Only status in which `values` can change. |
| `ready` | Finalized — every required value is filled and steps have their initial states. |
| `in_progress` | Reserved for execution (not driven by any endpoint in this slice). |
| `completed` | Reserved for execution. |
| `rejected` | Reserved for execution. |
| `cancelled` | Terminal. Set via §7.6. |

There is **no email dispatch, no approval tokens, no approver page** in this slice —
`steps[].approval_token` and `steps[].reason` exist on the task document and are
always `null`. There is **no LLM question phrasing** — `GET /tasks/:id/next` returns a
requirement's `label` and `collection_hint` as plain strings; the caller renders the
prompt.

A `TaskDto` (the shape returned by every endpoint below except §7.4) looks like:

```json
{
  "id": "6710fa11b2c3d4e5f6078912",
  "reference": "TASK-2026-00042",
  "session_id": "6710f9c0a1b2c3d4e5f60789",
  "workflow_id": "it_faculty_overseas_leave",
  "version": 1,
  "status": "collecting",
  "requirements": [
    {
      "key": "destination_country",
      "source": "input",
      "ref": "destination_country",
      "label": "Destination Country",
      "description": "Country the student is travelling to.",
      "type": "string",
      "required": true,
      "validation": { "min_length": null, "max_length": null, "min": null, "max": null, "not_before": null, "not_after": null, "not_before_field": null, "not_after_field": null, "pattern": null },
      "collection_hint": null,
      "status": "pending"
    },
    {
      "key": "actor:advisor_review",
      "source": "actor",
      "ref": "advisor_review",
      "label": "Academic Advisor",
      "description": null,
      "type": "person",
      "required": true,
      "validation": null,
      "collection_hint": "Name and email address of your Academic Advisor.",
      "status": "pending"
    }
  ],
  "values": {},
  "steps": [
    {
      "step_id": "advisor_review",
      "name": "Academic Advisor Approval",
      "type": "approval",
      "depends_on": [],
      "state": "blocked",
      "assignee": null,
      "outcome": null,
      "reason": null,
      "responded_at": null,
      "approval_token": null
    }
  ],
  "audit": [
    { "type": "task_created", "detail": null, "created_at": "2026-08-10T09:30:00.000Z" }
  ],
  "created_at": "2026-08-10T09:30:00.000Z",
  "updated_at": "2026-08-10T09:30:00.000Z"
}
```

Each `requirement.key` is either an input id (`source: "input"`) or `"actor:" +
step_id` (`source: "actor"`, `type: "person"`). Input requirements come first, in
declaration order; actor requirements follow, in topological step order, one per
distinct `role`/`relative_to` pair (two steps needing the same approver share one
requirement). `values` is keyed by `requirement.key`; a `person` value is
`{ "name": string, "email": string }`.

> **Approver email is requester-supplied and untrusted.** For an `actor:*`
> requirement, the requester types in their own approver's name and email — there is
> no directory lookup in this slice. See the code comment in
> `requirement-builder.util.ts` at the point of capture.

### 7.1 `POST /api/tasks`

Creates a task from a matched selection session. Resolves the pinned workflow
version, compiles requirements and step states (`PlannerService.compile`), assigns a
sequential human-readable `reference`, and inserts with `status: "collecting"`.

**Request body**

| Field        | Type   | Required | Notes |
| ------------ | ------ | -------- | ----- |
| `session_id` | string | yes      | Non-empty; must be a session that has `matched` (§6.1–§6.3) |

```json
{ "session_id": "6710f9c0a1b2c3d4e5f60789" }
```

**201 Created** — a `TaskDto` (see above), `status: "collecting"`, `values: {}`,
`audit` containing one `task_created` entry.

Save `id` into `{{taskId}}`.

**Errors**

| Status | Cause |
| ------ | ----- |
| `400`  | `{ "error": "Body must include a non-empty 'session_id' field", "code": "VALIDATION_ERROR", "details": null }` |
| `404`  | Unknown session id |
| `409`  | `{ "error": "This session has not matched a workflow yet", "code": "CONFLICT", "details": null }` — same rule as §6.4 |

---

### 7.2 `GET /api/tasks/:id`

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | Task id (24-character hex Mongo ObjectId) |

**200 OK** — a `TaskDto`.

**404 Not Found** — `{ "error": "Task '<id>' not found", "code": "NOT_FOUND", "details": null }`

> Same rough edge as elsewhere in the API: a malformed (non-24-hex) `:id` fails
> inside the Mongo driver and surfaces as **500**, not 404 — see §8.1.

---

### 7.3 `GET /api/tasks` (list)

**Query parameters**

| Name         | Type   | Required | Notes |
| ------------ | ------ | -------- | ----- |
| `session_id` | string | no       | Exact match |
| `status`     | string | no       | One of the `TaskStatus` values above; unrecognized values are silently ignored (no filter applied) |

`GET {{baseUrl}}/tasks?session_id=6710f9c0a1b2c3d4e5f60789`

**200 OK** — an array of `TaskDto`, newest `created_at` first. Empty array when
nothing matches, not a 404.

---

### 7.4 `GET /api/tasks/:id/next`

Returns the next requirement the caller should collect: the first `pending` +
`required` requirement, in list order; if none, the first `pending` optional
requirement; if none at all, `complete: true`.

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | Task id |

**200 OK** — a requirement still pending:

```json
{
  "requirement": {
    "key": "destination_country",
    "source": "input",
    "ref": "destination_country",
    "label": "Destination Country",
    "description": "Country the student is travelling to.",
    "type": "string",
    "required": true,
    "validation": { "...": "null-filled" },
    "collection_hint": null,
    "status": "pending"
  },
  "complete": false
}
```

**200 OK** — nothing left to collect:

```json
{ "requirement": null, "complete": true }
```

**404 Not Found** — same shape as §7.2.

---

### 7.5 `POST /api/tasks/:id/values`

Submits one value against one requirement. Rejects unless the task is still
`collecting`. Validates and coerces the value against the requirement's `type` and
`validation` rules — including cross-field checks (`not_before_field` /
`not_after_field`) evaluated against every value collected so far — then flips that
requirement's `status` to `filled` and appends a `value_captured` audit entry.

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | Task id |

**Request body**

| Field   | Type                        | Required | Notes |
| ------- | --------------------------- | -------- | ----- |
| `key`   | string                      | yes      | Must match a `requirements[].key` on the task |
| `value` | string \| number \| boolean \| object \| null | no | Polymorphic — shape depends on the requirement's `type`. Defaults to `null` when omitted. |

```json
{ "key": "destination_country", "value": "United Kingdom" }
```

A `person` requirement (actor collection):

```json
{ "key": "actor:advisor_review", "value": { "name": "Dr. Perera", "email": "perera@university.edu" } }
```

`value` is **not** validated in the controller — it is polymorphic by design, and
`value-validator.util.ts` owns that judgement. The controller only asserts the `key`
field is present and non-empty.

**200 OK** — the updated `TaskDto`, with that requirement's `status: "filled"` and
`values[key]` set to the coerced value.

**Errors**

| Status | Cause |
| ------ | ----- |
| `400`  | `{ "error": "Body must include a non-empty 'key' field", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | `{ "error": "Task '<id>' has no requirement with key '<key>'", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | Value fails type coercion or validation, e.g. `{ "error": "return date must not be before departure_date", "code": "VALIDATION_ERROR", "details": null }` |
| `404`  | Unknown task id |
| `409`  | `{ "error": "Task '<id>' is not collecting values (status: <status>)", "code": "CONFLICT", "details": null }` |

---

### 7.6 `POST /api/tasks/:id/finalize`

Closes out collection. Rejects unless every `required` requirement is `filled`;
otherwise names the missing keys. On success, attaches each collected `actor:*`
person value onto the matching step(s)' `assignee` (steps sharing a de-duplicated
actor requirement all receive the same person), initializes step states — steps
with an empty `depends_on` become `ready`, all others `blocked` — sets
`status: "ready"`, and appends a `task_finalized` audit entry.

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | Task id |

**Request body:** none.

**200 OK** — the finalized `TaskDto`: `status: "ready"`, `steps[]` carry resolved
`assignee` and `state`.

**Errors**

| Status | Cause |
| ------ | ----- |
| `400`  | `{ "error": "Task '<id>' is missing required values: <key1>, <key2>", "code": "VALIDATION_ERROR", "details": null }` |
| `404`  | Unknown task id |
| `409`  | `{ "error": "Task '<id>' is not collecting values (status: <status>)", "code": "CONFLICT", "details": null }` — already finalized or cancelled |

---

### 7.7 `PATCH /api/tasks/:id/status`

Cancels a task. The only transition this route allows.

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | Task id |

**Request body**

| Field    | Type   | Required | Notes |
| -------- | ------ | -------- | ----- |
| `status` | string | yes      | Must be exactly `"cancelled"` — no other value is accepted here |

```json
{ "status": "cancelled" }
```

**200 OK** — the updated `TaskDto`, `status: "cancelled"`, with a `task_cancelled`
audit entry appended.

**Errors**

| Status | Cause |
| ------ | ----- |
| `400`  | `{ "error": "status must be one of: cancelled", "code": "VALIDATION_ERROR", "details": null }` |
| `404`  | Unknown task id |
| `409`  | `{ "error": "Task '<id>' is already in a terminal status (<status>)", "code": "CONFLICT", "details": null }` — task is `completed`, `rejected`, or already `cancelled` |

---

## 8. Error responses

All errors are JSON. `src/middlewares/error-handler.middleware.ts` reads the
status and body straight off any `BaseError` subclass (see
[../architecture/error-handling.md](../architecture/error-handling.md) for the full
hierarchy) instead of maintaining a separate status lookup table:

| Status | Shape | Raised by |
| ------ | ----- | --------- |
| `400`  | `{ "error", "code": "VALIDATION_ERROR", "details" }` | `ValidationError` — per-route body checks |
| `404`  | `{ "error", "code": "NOT_FOUND", "details" }` | `NotFoundError` — missing draft, workflow, or session |
| `409`  | `{ "error", "code": "CONFLICT", "details" }` | `ConflictError` — §6.4 on an unmatched session |
| `422`  | `{ "error", "code": "EXTRACTION_ERROR", "details": <errors\|null> }` | `ExtractionError` only — the model could not produce a valid workflow |
| `500`  | `{ "error": "Internal server error", "code": "INTERNAL_ERROR", "details": null }` | Anything untyped — details are logged, never returned |
| `502`  | `{ "error", "code": "SELECTION_ERROR" \| "EMBEDDING_ERROR", "details": <cause\|null> }` | `SelectionError`, `EmbeddingError` — upstream Azure failure |

`ConflictError` also covers the task status-machine rejections in §7 (§7.1, §7.5,
§7.6, §7.7) alongside the §6.4 unmatched-session case.

`details` is `null` unless the error carried one explicitly. Every handled error
uses the same three keys — there is no separate `errors` key on any response. A
workflow validation failure is a **400** carrying the failing rules in `details`:

```json
{
  "error": "Workflow failed validation",
  "code": "VALIDATION_ERROR",
  "details": ["/steps/0: must have required property 'sla'"]
}
```

The split is deliberate: **400** means the document you sent is wrong, **422** means
extraction could not build one from your prose. Both are client-visible failures, but
only the second implies the LLM was involved.

### 8.1 Malformed ObjectId parameters return 500

Routes whose `:id` is a **MongoDB ObjectId** — every `/drafts/:id*` route, every
`/selection/sessions/:id*` route, and every `/tasks/:id*` route — behave differently
depending on *how* the id is wrong:

| `:id` you send | Status | Body |
| -------------- | ------ | ---- |
| 24 hex chars, no matching row | `404` | `{ "error": "Draft '<id>' not found", "code": "NOT_FOUND" }` |
| Anything else (`not-an-objectid`, `123`) | `500` | `{ "error": "Failed to look up draft by id", "code": "DATABASE_ERROR" }` |

The malformed case fails inside the driver before any not-found check runs, so it is
reported as a database fault rather than the 400 the input actually deserves. Nothing
sensitive leaks — the generic message is all the client sees — but when testing, read a
500 from these routes as **"check the id format first"** rather than as a server bug.

Workflow routes are unaffected: `/workflows/:id` takes a human-readable `workflow_id`
string (`departmental_event_workshop`), not an ObjectId, so any unknown value is a clean 404.

---

## 9. Suggested Postman test order

Run these folders in sequence — later calls depend on ids produced by earlier ones.
The runnable collection at [../postman/](../postman/) automates this order with
`pm.test` scripts that write the ids into collection variables automatically, so a full
Collection Runner pass needs no manual variable entry.

| Folder | Call | Capture |
| --- | ---- | ------- |
| Health | `GET /health` | confirm `status: "ok"` |
| Drafts | `POST /drafts` with prose from `src/data/samples/demo-drafts/it_overseas_leave.txt` | `id` → `{{draftId}}` |
| Drafts | `GET /drafts` | confirm the array includes the new draft |
| Drafts | `GET /drafts/{{draftId}}` | confirm `status: "pending"` |
| Drafts | `POST /drafts/{{draftId}}/extract` | `workflow_id` → `{{workflowId}}`, `version` → `{{templateVersion}}` (slow) |
| Workflows | `POST /workflows/extract` | preview only, does not persist |
| Workflows | `POST /workflows` | `id` → `{{workflowId}}`, `version` → `{{templateVersion}}` |
| Workflows | `GET /workflows` | the template appears in the list |
| Workflows | `GET /workflows/{{workflowId}}` | the bare workflow document |
| Workflows | `PUT /workflows/{{workflowId}}` | new `version` → `{{templateVersion}}` |
| Workflows | `POST /workflows/any-id/validate` | `{ valid, errors }` |
| Workflows | `GET /workflows/{{workflowId}}/record` | confirm `review_status: "pending_admin_review"` |
| Workflows | `PATCH /workflows/{{workflowId}}/review` with `{"review_status":"confirmed"}` | now selectable |
| Selection | `POST /selection/sessions` with a matching query | `session_id` → `{{sessionId}}` |
| Selection | `POST /selection/sessions/{{sessionId}}/answer` | only if `decision` was `ambiguous` |
| Selection | `POST /selection/sessions/{{sessionId}}/choose` | only if `decision` was `manual_choice` |
| Selection | `GET /selection/sessions/{{sessionId}}/workflow` | the full plan document |
| Tasks | `POST /tasks` with `{{sessionId}}` | `id` → `{{taskId}}`, confirm `status: "collecting"` |
| Tasks | `GET /tasks/{{taskId}}/next` | confirm a requirement comes back |
| Tasks | `POST /tasks/{{taskId}}/values` for each requirement returned by `next` | repeat until `GET /tasks/{{taskId}}/next` returns `complete: true` |
| Tasks | `POST /tasks/{{taskId}}/finalize` | confirm `status: "ready"` and step states |
| Tasks | `GET /tasks?session_id={{sessionId}}` | the task appears in the list |
| Tasks | `PATCH /tasks/{{taskId}}/status` with `{"status":"cancelled"}` | only on a scratch task — this is terminal |
| Error cases | one request per error class (400, 404, 422, 409) | asserts `{ error, code, details }` |

Repeat the Drafts/Workflows folders with a second template
(`src/data/samples/demo-drafts/workshop_event.txt`) so the selector has something to
disambiguate between — with one candidate it will rarely return `ambiguous`.

**Postman scripting** — the collection uses `pm.collectionVariables.set(...)` in each
request's *Tests* tab rather than environment variables, so the chain works the same way
whether or not an environment is selected. For example, `POST /drafts`:

```javascript
pm.collectionVariables.set("draftId", pm.response.json().id);
```

and `POST /drafts/{{draftId}}/extract`:

```javascript
var json = pm.response.json();
pm.collectionVariables.set("workflowId", json.workflow_id);
pm.collectionVariables.set("templateVersion", json.version);
```

and `POST /selection/sessions`:

```javascript
pm.collectionVariables.set("sessionId", pm.response.json().session_id);
```

---

## 10. Things worth knowing before you test

- **LLM routes are slow.** `POST /workflows/extract` and `POST /drafts/:id/extract`
  make up to `EXTRACTION_MAX_ATTEMPTS` Azure calls. Set the Postman timeout well
  above the default.
- **Nothing is selectable until it is published.** Retrieval filters on
  `review_status: "confirmed"` and `is_latest: true`.
- **Saves are versioned, never in-place.** `POST /workflows`, `PUT /workflows/:id`,
  and `POST /drafts/:id/extract` each create a new version and re-embed.
- **Drafts are deduplicated by content hash.** Change the text if you want a
  genuinely new draft row.
- **No delete endpoint exists.** Clean up test data directly in MongoDB
  (`unblock_ai` database, collections `drafts`, `templates`, `selection_sessions`).
- **Every schema field is required, including nullable ones**, and
  `additionalProperties` is `false`. Hand-writing a workflow body is error-prone
  — start from `src/data/samples/expected/departmental_event_workshop.json`.
- **Retrieval backend is switchable.** `VECTOR_BACKEND=atlas` uses Atlas vector
  search; anything else uses the in-memory store. This changes `score` values
  but not the response shape.
- **A task can only be created from a matched session.** Run the Selection folder
  through to a `matched` decision (§6) before `POST /tasks`.
- **Task values can only change while `status: "collecting"`.** `POST
  /tasks/:id/values` and `POST /tasks/:id/finalize` both 409 once the task is
  `ready` or `cancelled`.
- **No execution engine.** Finalizing a task (§7.6) only computes initial step
  states (`ready` / `blocked`) — nothing progresses a step, sends a notification,
  or issues an approval token after that. `in_progress`, `completed`, and
  `rejected` are reserved statuses with no endpoint that sets them yet.
