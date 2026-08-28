# UNBLOCK-AI — API Documentation

Reference for every HTTP endpoint exposed by the Express server, written for
manual testing in Postman.

- **Server entry point:** `src/server.ts`
- **App builder:** `src/app.ts`
- **Route modules:** `src/routes/health.route.ts`, `src/routes/auth.route.ts`, `src/routes/workflow.route.ts`, `src/routes/draft.route.ts`, `src/routes/selection.route.ts`, `src/routes/task.route.ts`, `src/routes/approval.route.ts`

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
| `adminToken`    | (filled in from `POST /auth/login`, audience `admin`) |
| `portalToken`   | (filled in from `POST /auth/login`, audience `portal`) |
| `draftId`       | (filled in from a response) |
| `workflowId`    | (filled in from a response) |
| `sessionId`     | (filled in from a response) |
| `taskId`        | (filled in from a response) |
| `approvalToken` | (read from the console mailer's stdout log) |

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

| Header          | Value               | When                                                    |
| --------------- | ------------------- | -------------------------------------------------------- |
| `Content-Type`  | `application/json`  | On every `POST`/`PUT`/`PATCH`                            |
| `Authorization` | `Bearer <token>`    | On every route below marked `auth` or `admin` in §2      |

Most routes require a bearer session token, obtained from `POST /api/auth/login`
(see §12). `src/middlewares/authenticate.middleware.ts` parses the token and
populates `req.user` when present, but never rejects by itself; the per-route
guards in `src/middlewares/require-auth.middleware.ts` do the rejecting:

| Guard | Requires | Failure |
| --- | --- | --- |
| `requireAuth()` | any valid session, either audience | `401` with no/invalid token |
| `requireRole("admin")` | a valid session with `audience: "admin"` | `401` with no/invalid token, `403` for a `portal` token |

`/api/health` and all of `/api/approvals/*` have **no** guard — approval links
are authenticated by their own per-step token (§8), not a session, and must
keep working for an approver with no account at all.

Without a valid token, `req.user` is `undefined` and `submitted_by` on a draft
stays `null` regardless of guard — nothing currently reads `req.user` to
populate it (tracked as a follow-on, not part of this slice).

Request bodies are capped at **1 MB** (`express.json({ limit: "1mb" })`, `src/middlewares/json-body.middleware.ts`).

### CORS

Allowed origin is `CORS_ORIGIN`, defaulting to `http://localhost:3001`. This
only affects browsers; Postman ignores it.

---

## 2. Endpoint index

| # | Method | Path | Purpose | Auth |
| - | ------ | ---- | ------- | ---- |
| 1 | `GET`    | `/api/health`                          | Liveness check | none |
| 2 | `POST`   | `/api/auth/login`                      | Log in, either audience — returns a bearer token (§12.1) | none |
| 3 | `GET`    | `/api/auth/me`                         | Get the caller's own identity from their token (§12.2) | `requireAuth()` |
| 4 | `POST`   | `/api/auth/logout`                     | No-op `204` — sessions are stateless (§12.3) | none |
| 5 | `POST`   | `/api/workflows/extract`               | Extract a workflow JSON from prose (does **not** save) | `admin` |
| 6 | `POST`   | `/api/workflows`                       | Save a workflow document as a new version | `admin` |
| 7 | `GET`    | `/api/workflows`                       | List latest workflow summaries | `requireAuth()` |
| 8 | `GET`    | `/api/workflows/:id`                   | Get one workflow document | `requireAuth()` |
| 9 | `PUT`    | `/api/workflows/:id`                   | Update a workflow (saves a new version) | `admin` |
| 10 | `POST`  | `/api/workflows/:id/validate`          | Validate a workflow without saving | `admin` |
| 11 | `DELETE` | `/api/workflows/:id`                  | Permanently delete a template; logs the deleting admin (§4.7) | `admin` |
| 12 | `GET`   | `/api/workflows/deletions`             | The template deletion log, newest first (§4.8) | `admin` |
| 13 | `POST`  | `/api/drafts`                          | Save raw prose as a draft (idempotent) | `admin` |
| 14 | `GET`   | `/api/drafts`                          | List drafts | `admin` |
| 15 | `GET`   | `/api/drafts/:id`                      | Get one draft | `admin` |
| 16 | `POST`  | `/api/drafts/:id/extract`              | Generate + save a template from a draft | `admin` |
| 17 | `GET`   | `/api/workflows/:id/record`            | Get the full stored row (admin editor) | `requireAuth()` |
| 18 | `PATCH` | `/api/workflows/:id/review`            | Publish / reject a template | `admin` |
| 19 | `POST`  | `/api/selection/sessions`              | Start a selection conversation (round 1) | `requireAuth()` |
| 20 | `POST`  | `/api/selection/sessions/:id/answer`   | Answer a clarifying question (round 2+) | `requireAuth()` |
| 21 | `POST`  | `/api/selection/sessions/:id/choose`   | Pick a workflow manually | `requireAuth()` |
| 22 | `GET`   | `/api/selection/sessions/:id/workflow` | Get the matched workflow document | `requireAuth()` |
| 23 | `POST`  | `/api/tasks`                           | Create a task from a matched selection session | `requireAuth()` |
| 24 | `GET`   | `/api/tasks`                           | List tasks (filter by `session_id` / `status`) | `requireAuth()` |
| 25 | `GET`   | `/api/tasks/:id`                       | Get one task | `requireAuth()` |
| 26 | `GET`   | `/api/tasks/:id/next`                  | Get the next unfilled requirement | `requireAuth()` |
| 27 | `POST`  | `/api/tasks/:id/values`                | Submit a value for a requirement | `requireAuth()` |
| 28 | `POST`  | `/api/tasks/:id/finalize`              | Finalize a task once all required values are filled | `requireAuth()` |
| 29 | `PATCH` | `/api/tasks/:id/status`                | Cancel a task | `requireAuth()` |
| 30 | `POST`  | `/api/tasks/:id/start`                 | Start the approval chain — dispatches the first step(s) and sends email | `requireAuth()` |
| 31 | `GET`   | `/api/tasks/:id/status`                | Requester-facing status timeline | `requireAuth()` |
| 32 | `GET`   | `/api/tasks/:id/document`              | Download the completion-document PDF record (§7.10) | `requireAuth()` |
| 33 | `GET`   | `/api/approvals/:token`                | Approver view — the decision page's data | none — the approval token IS the auth |
| 34 | `POST`  | `/api/approvals/:token/decision`       | Submit an approve / reject / request-more-info decision | none — the approval token IS the auth |

34 total route bindings. `admin` means `requireRole("admin")` — a `portal`
token gets `403`, no token gets `401`. `requireAuth()` accepts either
audience. See §1 for what each guard means in practice.

> `GET /api/tasks/:id/status` and `GET /api/tasks/:id/document` are both
> registered **before** the bare `GET /api/tasks/:id` pattern in
> `task.route.ts`, so neither suffix is ever swallowed as an `:id` value.

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

### 4.7 `DELETE /api/workflows/:id`

Permanently deletes every version of a template and writes a `template_deletions`
row (Postgres) naming which admin did it. `admin` only — a `portal` token gets
`403`.

Deliberately gated on a **typed confirmation**, re-checked server-side so the
guard survives a caller that skips the admin UI:

```json
{ "confirmation": "delete", "confirm_title": "Overseas Leave Request" }
```

| Field           | Required | Notes |
| --------------- | -------- | ----- |
| `confirmation`  | yes      | Must be the literal word `delete` (case-insensitive) |
| `confirm_title` | yes      | Must match the template's current title, case- and whitespace-insensitive |

**204 No Content** — deleted. No body.

**400 Bad Request** — wrong confirmation word or a title that doesn't match:

```json
{ "error": "confirm_title must exactly match the template title", "code": "VALIDATION_ERROR", "details": null }
```

**404 Not Found** — no template with that `workflow_id`.

**409 Conflict** — the template still has requests in `collecting` / `ready` /
`in_progress`:

```json
{ "error": "Template 'overseas_leave' has 2 requests still in progress - wait for them to finish or cancel them before deleting it", "code": "CONFLICT", "details": null }
```

> The deletion log row is written **before** the Mongo delete runs, not after.
> If the row exists but `versions_removed` still reads `0`, the delete itself
> failed after the log landed — see §4.8. This ordering is deliberate so a
> failed delete still leaves a visible trail instead of a silent gap.

---

### 4.8 `GET /api/workflows/deletions`

The template deletion log, newest first. `admin` only.

| Parameter     | In    | Required | Notes |
| ------------- | ----- | -------- | ----- |
| `limit`       | query | no       | Positive integer, defaults to `50` |
| `workflow_id` | query | no       | Filter to one template's deletion history |

`GET {{baseUrl}}/workflows/deletions?limit=20`

**200 OK**

```json
[
  {
    "id": "14",
    "workflow_id": "overseas_leave",
    "template_title": "Overseas Leave Request",
    "latest_version": 3,
    "versions_removed": 3,
    "institution_type": "faculty",
    "review_status": "confirmed",
    "deleted_by_admin_id": "3f9a1e2b-...",
    "deleted_by_username": "admin",
    "reason": null,
    "request_id": null,
    "snapshot": { "title": "Overseas Leave Request", "latest_version": 3 },
    "deleted_at": "2026-08-20T11:02:31.000Z"
  }
]
```

`deleted_by_username` is denormalised onto the row at delete time, so the log
stays readable even if the admin account is later renamed.

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
> [§9.1](#91-malformed-objectid-parameters-return-500), which covers drafts too.

---

## 7. Task endpoints (requirement collection)

A task walks a requester through supplying the values a matched workflow needs, then
finalizes into a runnable plan. It is created from a **matched** selection session
(§6), and moves through a small status machine:

| `status` | Meaning |
| --------- | ------- |
| `collecting` | Values are still being gathered. Only status in which `values` can change. |
| `ready` | Finalized — every required value is filled and steps have their initial states. |
| `in_progress` | Approval chain running — set by §7.8 `POST /tasks/:id/start`. |
| `completed` | Every `completion.required_steps` step reached its required outcome. |
| `rejected` | A step's outcome resolved to `terminate_workflow`; every non-terminal step became `skipped`. |
| `cancelled` | Terminal. Set via §7.7. |

Starting a task (§7.8) dispatches its entry step(s) to `pending_approval`, issues each
one a signed approval token, and emails the assignee via the approver link
(`POST /approvals/:token/decision`, §8). Each decision advances the graph
(`ExecutionService.advance`) until the task completes, terminates, or is waiting on
further approvals. There is **no LLM question phrasing** — `GET /tasks/:id/next`
returns a requirement's `label` and `collection_hint` as plain strings; the caller
renders the prompt.

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
      "key": "requester_email",
      "source": "input",
      "ref": "requester_email",
      "label": "Your Email Address",
      "description": "Email address for approval and outcome notifications.",
      "type": "email",
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
      "approval_token": null,
      "token_expires_at": null,
      "token_used_at": null,
      "notified_at": null,
      "reopen_count": 0
    }
  ],
  "audit": [
    { "type": "task_created", "detail": null, "created_at": "2026-08-10T09:30:00.000Z" }
  ],
  "created_at": "2026-08-10T09:30:00.000Z",
  "updated_at": "2026-08-10T09:30:00.000Z"
}
```

Each `requirement.key` is either an input id (`source: "input"`), `"actor:" +
step_id` (`source: "actor"`, `type: "person"`), or — after a "request more info"
decision (§8) reopens a step — `"followup:" + step_id + ":" + reopen_count`
(`source: "input"`, `type: "text"`, its `label` the approver's question). Input
requirements come first, in declaration order; actor requirements follow, in
topological step order, one per distinct `role`/`relative_to` pair (two steps
needing the same approver share one requirement); follow-up requirements are
appended as they are generated. `values` is keyed by `requirement.key`; a `person`
value is `{ "name": string, "email": string }`.

> **Approver email is requester-supplied and untrusted.** For an `actor:*`
> requirement, the requester types in their own approver's name and email — there is
> no directory lookup in this slice. See the code comment in
> `requirement-builder.util.ts` at the point of capture.

> **`requester_email` is a standard input, declared last among inputs on every
> workflow.** It is what lets `notification.service.ts` email the requester
> approval outcomes, rejections, and more-info requests. Like approver email, it is
> self-asserted by the requester, not verified. Workflows saved before this input
> existed do not have it — their tasks simply skip the requester-notification send
> (`notification.service.ts` no-ops when the requirement is absent) and stay
> pull-only via `GET /tasks/:id/status` (§7.9).

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

The `requester_email` input (`type: "email"`, present on every workflow extracted since
that input was added — see §7):

```json
{ "key": "requester_email", "value": "jane.doe@example.com" }
```

`value` is **not** validated in the controller — it is polymorphic by design, and
`value-validator.util.ts` owns that judgement. The controller only asserts the `key`
field is present and non-empty. Coercion is strict, and it is per-`type`:

| Requirement `type` | Accepted `value` | Rejected with a 400 |
| --- | --- | --- |
| `string`, `text`, `phone`, `enum`, `file` | Any JSON string | Any non-string |
| `email` | A string matching `user@host.tld` | `"example value"`, or any non-string |
| `number` | A finite number; a non-empty numeric **string** is coerced to one | `NaN`, `Infinity`, non-numeric text |
| `boolean` | `true` / `false` | The strings `"true"` / `"false"` |
| `date`, `datetime` | `"YYYY-MM-DD"` that also parses as a real date | `"2026-13-01"`, any other format |
| `person` | `{ "name": <non-empty string>, "email": <valid address> }` | A bare string, or either field missing/invalid |

`enum` is **not** checked against a list of allowed values, and `file` expects a plain
string — neither type does more than the string check in this slice.

> Sending `"example value"` for every requirement therefore stops working as soon as a
> workflow declares a typed input. `requester_email` is the one every workflow now has,
> so a fill loop must branch on `type` from `GET /tasks/:id/next` (§7.4). The Postman
> collection's *Submit next requirement value* request does this in a pre-request script.

**200 OK** — the updated `TaskDto`, with that requirement's `status: "filled"` and
`values[key]` set to the coerced value.

**Errors**

| Status | Cause |
| ------ | ----- |
| `400`  | `{ "error": "Body must include a non-empty 'key' field", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | `{ "error": "Task '<id>' has no requirement with key '<key>'", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | Value fails type coercion or validation — the message names the requirement key, e.g. `{ "error": "Requirement 'requester_email' expects a valid email address", "code": "VALIDATION_ERROR", "details": null }` or `{ "error": "Requirement 'return_date' must not be before 'inputs.departure_date'", "code": "VALIDATION_ERROR", "details": null }` |
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

### 7.8 `POST /api/tasks/:id/start`

Starts the approval chain. Rejects unless `status === "ready"` (i.e. §7.6 has run).
Loads the version-pinned workflow, runs `ExecutionService.advance()` to compute which
step(s) become `pending_approval`, issues each a fresh signed approval token
(`token_expires_at` = now + `APPROVAL_TOKEN_TTL_DAYS`), persists steps and status
together, then emails each dispatched step's assignee. `status` moves to
`in_progress`.

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | Task id |

**Request body:** none.

**200 OK** — the updated `TaskDto`: `status: "in_progress"`, the entry step(s) have a
non-null `approval_token` and `token_expires_at`, `notified_at` set if the email send
succeeded.

A failed email send is **not** an error — `notification.service.ts` never throws.
`notified_at` stays `null` for that step, and the task still moves to `in_progress`
with a live token. Re-fetch the task (§7.2) to check.

**Errors**

| Status | Cause |
| ------ | ----- |
| `404`  | Unknown task id |
| `409`  | `{ "error": "Task '<id>' is not ready to start (status: <status>)", "code": "CONFLICT", "details": null }` |

> **Console mailer.** With `MAIL_TRANSPORT=console` (the default), the approval
> email is not actually sent — it is logged to the server's stdout, full approval
> URL included: `${APP_PUBLIC_URL}/approvals/<token>`. Copy the token out of that
> log line into `{{approvalToken}}` to drive §8 from Postman.

---

### 7.9 `GET /api/tasks/:id/status`

The requester-facing timeline — what to show someone tracking their own request.
Distinct from §7.2 (`GET /api/tasks/:id`), which returns the full internal document;
this endpoint returns a smaller, presentation-oriented shape.

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | Task id |

**200 OK**

```json
{
  "status": "in_progress",
  "reference": "TASK-2026-00042",
  "workflow_title": "IT Faculty Overseas Leave Approval",
  "current_steps": ["hod_review"],
  "rejected_at_step": null,
  "rejected_by": null,
  "reason": null,
  "timeline": [
    {
      "step": "Academic Advisor Approval",
      "outcome": "approved",
      "reason": null,
      "at": "2026-08-15T09:00:00.000Z"
    }
  ]
}
```

`current_steps` lists the names of steps currently `pending_approval`. `timeline` is
every step with a non-null `outcome`, oldest first. On a `rejected` task,
`rejected_at_step` / `rejected_by` / `reason` are lifted from the step whose outcome
resolved to `terminate_workflow` — this is what lets a requester see **who** rejected
their request, **where**, and **why**. On any other status they are all `null`.

**404 Not Found** — same shape as §7.2.

---

### 7.10 `GET /api/tasks/:id/document`

Downloads a PDF record of the whole completed request — every value the requester
supplied, in the order the workflow template declares it, followed by the approval
trail (who approved each step, their designation, and their email address). The same
record is emailed as an attachment on the completion notice sent when the last
required step is approved (§8.2); this endpoint exists so a lost or never-sent
attachment is not a lost document.

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | Task id |

**200 OK** — binary body, not JSON:

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="TASK-2026-00042-record.pdf"
Content-Length: 48213
```

The task is **immutable** once completed and its workflow is **version-pinned**
(`task.workflow_id` + `task.version`), so the document is regenerated on every
request rather than stored — this route is a pure function of data that already
exists. A task that completed before this feature existed, or whose generation
failed at completion time, has `completion_document: null`; this route generates
one on the fly and backfills it rather than erroring. If a fresh render's hash
differs from a previously stored one (a code change to the builder or layout since
the record was issued), the drift is logged as a warning and the fresh copy is
served anyway — the stored `sha256` exists to make that drift visible, not to block
the download.

**Errors**

| Status | Cause |
| ------ | ----- |
| `404`  | Unknown task id — same shape as §7.2 |
| `409`  | `{ "error": "A record is only issued once every step is approved", "code": "CONFLICT", "details": null }` — task status is not `completed` |
| `409`  | `{ "error": "Task '<id>' has no record available for download", "code": "CONFLICT", "details": null }` — `DOCUMENT_ENABLED=false`, or rendering failed both at completion time and again on this request |

> **Feature flags.** `DOCUMENT_ENABLED` (default `true`) gates generation
> entirely; `DOCUMENT_ATTACH_TO_EMAIL` (default `true`) controls only whether the
> completion email carries the PDF as an attachment — this download route is
> unaffected by it. See [../guides/configuration.md](../guides/configuration.md)
> for the full `DOCUMENT_*` list.

---

## 8. Approval endpoints (approver decision path)

Token-authenticated, not session-authenticated — a different mechanism from the rest
of the API (which has no auth at all). The token is the credential; anyone holding the
link in an approval email can act as that approver. `src/controllers/approval.controller.ts`
+ `src/routes/approval.route.ts`.

The token is opaque: `base64url(payload) + "." + base64url(HMAC-SHA256(payload, secret))`,
where `payload` encodes `{ task_id, step_id, nonce }` (`src/utils/approval/token.util.ts`).
It proves authenticity only — whether it is still *usable* (unexpired, unused, and its
step still `pending_approval`) is a separate check made on every request.

### 8.1 `GET /api/approvals/:token`

The approver's decision-page data — everything needed to render the approval form
without a second round trip.

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `token`   | path | yes      | From an approval email, or the console mailer's stdout log |

**200 OK**

```json
{
  "task_reference": "TASK-2026-00042",
  "workflow_title": "IT Faculty Overseas Leave Approval",
  "step": {
    "step_id": "advisor_review",
    "name": "Academic Advisor Approval",
    "instructions_to_approver": "Confirm the student is in good standing.",
    "response_fields": []
  },
  "approver": { "name": "Dr. Perera", "email": "perera@university.edu" },
  "requester_answers": [
    { "label": "Destination Country", "value": "United Kingdom" }
  ],
  "computed": [],
  "prior_decisions": [],
  "allowed_outcomes": ["approved", "rejected"],
  "already_decided": false,
  "decided_outcome": null,
  "decided_at": null
}
```

`allowed_outcomes` reflects only the outcomes this **specific step** declares
(`workflow.steps[].outcomes`, non-null entries) — never a hardcoded
approve/reject/more-info list. A step whose schema omits `request_more_info` will
never show that option here.

**A re-clicked link on an already-decided step is not an error.** The response comes
back `200` with `already_decided: true` and `decided_outcome` / `decided_at` filled
in, so the page can render "already approved on 15 Aug" instead of failing.

**Errors**

| Status | Cause |
| ------ | ----- |
| `404`  | `{ "error": "Approval token '<token>' not found", "code": "NOT_FOUND", "details": null }` — malformed, tampered, or unrecognized token. Deliberately **404, not 401** — the response does not confirm or deny that a token of that shape ever existed. |

---

### 8.2 `POST /api/approvals/:token/decision`

Records the approver's decision and advances the workflow. This is the one endpoint
in the whole API that can send email as a direct side effect of the call.

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `token`   | path | yes      | Same token as §8.1 |

**Request body**

| Field     | Type           | Required | Notes |
| --------- | -------------- | -------- | ----- |
| `outcome` | string         | yes      | One of `approved`, `rejected`, `request_more_info` |
| `reason`  | string \| null | no       | Required (non-empty after trimming) when the step's outcome config sets `include_reason: true` — driven by the workflow, not hardcoded per outcome name |

```json
{ "outcome": "rejected", "reason": "Missing signed advisor endorsement letter." }
```

**200 OK**

```json
{
  "task_id": "6710fa11b2c3d4e5f6078912",
  "step_id": "advisor_review",
  "outcome": "rejected",
  "status": "rejected",
  "completed": false,
  "terminated": true
}
```

The step is persisted **before** any notification is sent, so a failed email never
rolls back a recorded decision. What happens next depends on the step's declared
`action` for that outcome:

| `action` | Effect |
| --- | --- |
| `continue` | Step → `approved`; the engine advances — any newly-`ready` step is dispatched with a fresh token and an approval-request email |
| `terminate_workflow` | Step → `rejected`; every other non-terminal step → `skipped`; task `status` → `rejected`; a rejection notice emails the requester |
| `reopen_input` | Step → `ready` with a cleared token (the next dispatch issues a new one); `reopen_count` on that step increments (capped at 3); a `followup:<step_id>:<n>` requirement is appended, task `status` → `collecting`, and a more-info notice emails the requester |

If this decision satisfies `workflow.completion.required_steps`, `status` becomes
`completed` and a completion notice emails the requester instead.

**Errors**

| Status | Cause |
| ------ | ----- |
| `400`  | `{ "error": "outcome must be one of: approved, rejected, request_more_info", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | `{ "error": "A reason is required for outcome '<outcome>' on step '<step_id>'", "code": "VALIDATION_ERROR", "details": null }` — reason missing or whitespace-only when the step requires one |
| `404`  | Invalid or unrecognized token — same as §8.1 |
| `409`  | `{ "error": "Approval token has already been used for step '<step_id>'", "code": "CONFLICT", "details": null }` — replay of a used token |

> **Approver identity is requester-supplied and untrusted.** The email a decision is
> sent to comes from whatever the requester typed into an `actor:*` task requirement
> (§7) — there is no directory lookup. This slice trusts that address with real
> approval authority; see the comment in `notification.service.ts` at the dispatch
> site.

---

## 9. Error responses

All errors are JSON. `src/middlewares/error-handler.middleware.ts` reads the
status and body straight off any `BaseError` subclass (see
[../architecture/error-handling.md](../architecture/error-handling.md) for the full
hierarchy) instead of maintaining a separate status lookup table:

| Status | Shape | Raised by |
| ------ | ----- | --------- |
| `400`  | `{ "error", "code": "VALIDATION_ERROR", "details" }` | `ValidationError` — per-route body checks |
| `401`  | `{ "error", "code": "UNAUTHORIZED", "details": null }` | `UnauthorizedError` — no/invalid token on a guarded route, or a bad login (§12.1) |
| `403`  | `{ "error", "code": "FORBIDDEN", "details": null }` | `ForbiddenError` — right token, wrong audience for `requireRole("admin")`; also a disabled account or a locked-out login |
| `404`  | `{ "error", "code": "NOT_FOUND", "details" }` | `NotFoundError` — missing draft, workflow, or session |
| `409`  | `{ "error", "code": "CONFLICT", "details" }` | `ConflictError` — §6.4 on an unmatched session, §4.7 on an in-progress-requests delete |
| `422`  | `{ "error", "code": "EXTRACTION_ERROR", "details": <errors\|null> }` | `ExtractionError` only — the model could not produce a valid workflow |
| `500`  | `{ "error": "Internal server error", "code": "INTERNAL_ERROR", "details": null }` | Anything untyped — details are logged, never returned |
| `502`  | `{ "error", "code": "SELECTION_ERROR" \| "EMBEDDING_ERROR", "details": <cause\|null> }` | `SelectionError`, `EmbeddingError` — upstream Azure failure |

`ConflictError` also covers the task status-machine rejections in §7 (§7.1, §7.5,
§7.6, §7.7, §7.10) alongside the §6.4 unmatched-session case.

A `401`/`403` from a guarded route (see §1 and §2's Auth column) is thrown by
the route guard itself, before the controller ever runs — so it carries no
`details` regardless of what the request body contained.

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

### 9.1 Malformed ObjectId parameters return 500

Routes whose `:id` is a **MongoDB ObjectId** — every `/drafts/:id*` route, every
`/selection/sessions/:id*` route, and every `/tasks/:id*` route — behave differently
depending on *how* the id is wrong. `/approvals/:token*` is unaffected — the token is
not an ObjectId, and an invalid one is a clean 404 (§8.1) rather than a 500:

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

## 10. Suggested Postman test order

Run these folders in sequence — later calls depend on ids produced by earlier ones.
The runnable collection at [../postman/](../postman/) automates this order with
`pm.test` scripts that write the ids into collection variables automatically, so a full
Collection Runner pass needs no manual variable entry.

| Folder | Call | Capture |
| --- | ---- | ------- |
| Health | `GET /health` | confirm `status: "ok"` |
| Auth | `POST /auth/login` with `audience: "admin"` (seeded credentials, §12.1) | `token` → `{{adminToken}}` |
| Auth | `POST /auth/login` with `audience: "portal"` | `token` → `{{portalToken}}` |
| Auth | `GET /auth/me` with `Authorization: Bearer {{adminToken}}` | confirm the token round-trips to the right `user` |
| Drafts | `POST /drafts` with prose from `src/data/samples/demo-drafts/it_overseas_leave.txt` (send `Authorization: Bearer {{adminToken}}` — every remaining `admin`-guarded call below does the same) | `id` → `{{draftId}}` |
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
| Tasks | `POST /tasks/{{taskId}}/values` for each requirement returned by `next` | repeat until `GET /tasks/{{taskId}}/next` returns `complete: true`. The value must match the requirement's `type` (§7.5) — `requester_email` needs a real address |
| Tasks | `POST /tasks/{{taskId}}/finalize` | confirm `status: "ready"` and step states |
| Tasks | `GET /tasks?session_id={{sessionId}}` | the task appears in the list |
| Tasks | `POST /tasks/{{taskId}}/start` | `status: "in_progress"`; watch stdout for the approval email (console mailer) |
| Approvals | copy the token out of the stdout log into `{{approvalToken}}` | — |
| Approvals | `GET /approvals/{{approvalToken}}` | confirm `already_decided: false` and `allowed_outcomes` |
| Approvals | `POST /approvals/{{approvalToken}}/decision` with `{"outcome":"approved"}` | confirm `status`; repeat the start→copy→get→decide loop for each subsequent step until `completed: true` |
| Tasks | `GET /tasks/{{taskId}}/status` | confirm the timeline reflects every decision made |
| Tasks | `GET /tasks/{{taskId}}/document` | 200, `Content-Type: application/pdf`, body starts with `%PDF-` — only once `status` is `completed` |
| Tasks | `GET /tasks?session_id={{sessionId}}` | the task appears in the list |
| Tasks | `PATCH /tasks/{{taskId}}/status` with `{"status":"cancelled"}` | only on a scratch task **before** `start` — this is terminal |
| Error cases | one request per error class (400, 404, 409, 422) | asserts `{ error, code, details }` |

Selection, Tasks, and the `GET /workflows*` rows above all accept either
`{{adminToken}}` or `{{portalToken}}` (`requireAuth()`, §1) — use
`{{portalToken}}` for those to exercise the requester-facing audience; every
`POST/PUT/PATCH/DELETE /workflows*` and every `/drafts*` row needs
`{{adminToken}}` specifically, or it 403s.

Repeat the Drafts/Workflows folders with a second template
(`src/data/samples/demo-drafts/workshop_event.txt`) so the selector has something to
disambiguate between — with one candidate it will rarely return `ambiguous`.

**Postman scripting** — the collection uses `pm.collectionVariables.set(...)` in each
request's *Tests* tab rather than environment variables, so the chain works the same way
whether or not an environment is selected. For example, `POST /auth/login` (audience
`admin`):

```javascript
pm.collectionVariables.set("adminToken", pm.response.json().token);
```

and `POST /drafts`:

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

The requirement-fill loop needs the requirement's **type**, not just its key, because
`POST /tasks/:id/values` coerces per type (§7.5). `GET /tasks/:id/next` captures both:

```javascript
if (json.requirement) {
    pm.collectionVariables.set("requirementKey", json.requirement.key);
    pm.collectionVariables.set("requirementType", json.requirement.type);
}
```

and *Submit next requirement value* turns that type into a valid sample in a
**pre-request** script, writing raw JSON into `{{requirementValue}}` — which the body
interpolates unquoted as `"value": {{requirementValue}}`, so non-string types stay
numbers, booleans, and objects:

```javascript
switch (pm.collectionVariables.get("requirementType")) {
    case "email":  value = "jane.doe@example.com"; break;
    case "person": value = { name: "Dr. Perera", email: "perera@university.edu" }; break;
    case "number": value = 42; break;
    // ...date, boolean, string default
}
pm.collectionVariables.set("requirementValue", JSON.stringify(value));
```

That makes a Collection Runner pass over `next` → `values` fill every requirement
unattended, including `requester_email`. Override `{{requirementValue}}` by hand (as raw
JSON) when you want a specific answer rather than a placeholder.

---

## 11. Things worth knowing before you test

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
- **Every workflow now collects `requester_email`.** It is declared last among the
  inputs, so it is the last `source: "input"` requirement `GET /tasks/:id/next` hands
  back before the `actor:*` ones. It is `type: "email"` and required — a placeholder
  string is a 400 (§7.5). Templates saved before this input existed do not have it.
- **Task values can only change while `status: "collecting"`.** `POST
  /tasks/:id/values` and `POST /tasks/:id/finalize` both 409 once the task is
  `ready` or `cancelled`.
- **The approval chain only moves on `POST /tasks/:id/start` and
  `POST /approvals/:token/decision`.** Finalizing (§7.6) only computes initial step
  states — nothing is dispatched, tokened, or emailed until §7.8 starts the task.
- **Approval tokens live in the console log, not the API response.** With the
  default `MAIL_TRANSPORT=console`, no email provider is involved — the mailer logs
  the subject, recipient, and full approval URL to the server's stdout. Read the
  token from there for manual testing.
- **A used or expired token is a 409, not a 404 or 500.** A malformed/unknown
  token is 404 (§8); a syntactically valid token whose step already has
  `token_used_at` set, or whose `token_expires_at` has passed, is a 409 from
  `POST /approvals/:token/decision`. `GET /approvals/:token` instead renders
  `already_decided: true` for the used case — it never errors on a stale-but-valid
  link.
- **A `request_more_info` decision reopens collection.** No new endpoint —
  `status` returns to `collecting` and a `followup:<step_id>:<n>` requirement is
  appended, answered through the existing `POST /tasks/:id/values` (§7.5). Reopens
  on the same step are capped at 3 (`reopen_count`); a 4th is a 409.
- **The completion-document PDF is regenerated, never stored.** `GET
  /tasks/:id/document` (§7.10) re-renders it from the task and its version-pinned
  workflow on every call — only a small metadata record (`filename`, `byte_size`,
  `sha256`, `emailed_to`/`emailed_at`) is persisted on the task. It 409s until
  `status` is `completed`. The same PDF is attached to the completion email
  (`DOCUMENT_ATTACH_TO_EMAIL`, default `true`), so this endpoint is the fallback
  when that email or its attachment never arrived.

---

## 12. Auth endpoints

Two independent user populations — `admin_users` and `portal_users` in
PostgreSQL — sharing one login shape. Sessions are stateless HMAC-signed
bearer tokens (no `sessions` table, no server-side revocation): `POST
/auth/login` returns a token, every other route checks it via the
`Authorization: Bearer <token>` header, and `POST /auth/logout` is a `204`
no-op because there is nothing server-side to invalidate.

### 12.1 `POST /api/auth/login`

No auth required — this is how you get a token.

**Request body**

```json
{ "audience": "admin", "username": "admin", "password": "Admin@12345" }
```

| Field      | Required | Notes |
| ---------- | -------- | ----- |
| `audience` | yes      | `"admin"` or `"portal"` — selects which table is checked |
| `username` | yes      | Case-insensitive |
| `password` | yes      | Checked against a scrypt hash |

**200 OK**

```json
{
  "token": "eyJzdWIiOi...ZTIn.9f2a...",
  "expires_at": "2026-08-28T21:00:00.000Z",
  "user": {
    "id": "3f9a1e2b-...",
    "audience": "admin",
    "username": "admin",
    "email": "admin@unblock-ai.local",
    "full_name": "Nadeesha Perera",
    "department": "Registrar's Office",
    "organisation": null,
    "faculty": null
  }
}
```

Save `{{adminToken}}` / `{{portalToken}}` from `token` here — a Postman test
script on this request can do it automatically (§10).

**401 Unauthorized** — wrong password **or** unknown username, same status and
same message either way (so a caller can't use the response to enumerate
valid usernames):

```json
{ "error": "Invalid username or password", "code": "UNAUTHORIZED", "details": null }
```

A wrong password against a *known* username also increments that account's
`failed_attempt_count` and stamps `last_failed_attempt_at` — visible only via
direct DB inspection, not in this response. A wrong password against an
*unknown* username increments nothing (there is no row to increment).

**403 Forbidden** — the account exists and the password is right, but:

- the account is disabled (`is_active = false`), or
- `AUTH_MAX_FAILED_ATTEMPTS > 0` and this account just hit the limit.

`AUTH_MAX_FAILED_ATTEMPTS` defaults to `0` (tracked, not enforced) — see the
root [phase plan](../../../docs/auth-and-deletion-tracking-phase-plan.md), D-7.

**400 Bad Request** — missing/blank `audience`, `username`, or `password`, or
an `audience` outside `"admin" | "portal"`.

---

### 12.2 `GET /api/auth/me`

Returns the caller's own identity from their token. Useful for confirming a
saved `{{adminToken}}` / `{{portalToken}}` is still valid before running the
rest of a Postman folder.

`GET {{baseUrl}}/auth/me` with `Authorization: Bearer {{adminToken}}`

**200 OK** — `{ "user": { ... } }`, same `user` shape as §12.1.

**401 Unauthorized** — missing, malformed, expired, or tampered token:

```json
{ "error": "Invalid or expired session", "code": "UNAUTHORIZED", "details": null }
```

---

### 12.3 `POST /api/auth/logout`

**204 No Content**, always — no body, no auth required. Sessions are
stateless (no `sessions` table to delete a row from), so this exists only for
API symmetry; the actual "log out" is the caller discarding its token. The web
app additionally clears its own httpOnly cookie on this path (`unblock-ai-web/src/app/api/auth/logout/route.ts`) —
see the root [phase plan](../../../docs/auth-and-deletion-tracking-phase-plan.md), D-4, for the cookie flow.
