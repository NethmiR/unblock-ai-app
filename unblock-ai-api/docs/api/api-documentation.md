# UNBLOCK-AI — API Documentation

Reference for every HTTP endpoint exposed by the Express server, written for
manual testing in Postman.

- **Server entry point:** `src/server.ts`
- **App builder:** `src/app.ts`
- **Route modules:** `src/routes/health.route.ts`, `src/routes/auth.route.ts`, `src/routes/user-session.route.ts`, `src/routes/user.route.ts`, `src/routes/workflow-template.route.ts`, `src/routes/selection.route.ts`, `src/routes/task.route.ts`, `src/routes/approval.route.ts`

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
| `loginEmail`    | the seeded administrator's email (`SEED_ADMINISTRATOR_EMAIL`) |
| `loginPassword` | `USER_DEFAULT_PASSWORD` from `.env` |
| `authToken`     | (filled in from `POST /auth/login`) |
| `userId`        | (filled in from `POST /users`) |
| `workflowTemplateId` | (filled in from a response) |
| `draftWorkflowTemplateId` | (filled in from a response) |
| `sessionId`     | (filled in from a response) |
| `taskId`        | (filled in from a response) |
| `approvalToken` | (read from the console mailer's stdout log) |

The runnable Postman collection and environment ship at [../postman/](../postman/).

### Running the server

```bash
npm install
npm run migrate:up   # applies pending Postgres + Mongo migrations
npm run seed:pg:run  # creates the bootstrap administrator (safe to re-run)
npm run dev          # tsx watch, or: npm run build && npm start
```

`npm run seed:pg:run` creates one user from `SEED_ADMINISTRATOR_EMAIL` /
`SEED_ADMINISTRATOR_FULL_NAME` holding **every** permission (§1 *Permissions*).
Its password is `USER_DEFAULT_PASSWORD`, the same initial password every user
created through `POST /api/users` (§13.1) gets. Re-running it skips the user
when that email is already registered. See
[../guides/database-seeding.md](../guides/database-seeding.md).

The process refuses to start unless the required variables are set
(`USER_DEFAULT_PASSWORD` among them) — see
[../guides/configuration.md](../guides/configuration.md) for the full list, or
`src/config/env.config.ts` / `src/config/index.config.ts` for how they are read and validated.

### Headers

| Header          | Value               | When                                                    |
| --------------- | ------------------- | -------------------------------------------------------- |
| `Content-Type`  | `application/json`  | On every `POST`/`PUT`/`PATCH`                            |
| `Authorization` | `Bearer <token>`    | On every route whose Auth column in §2 is not `none`     |
| `User-Agent`    | any                 | Optional; recorded on the session created by `POST /api/auth/login` |

Most routes require a bearer session token, obtained from `POST /api/auth/login`
(§12). `src/middlewares/authenticate.middleware.ts` looks the token up and
populates `req.auth` (the user plus the session) when it belongs to an active
session of an active user, but never rejects by itself. The per-route guards
do the rejecting:

| Guard | Source | Requires | Failure |
| --- | --- | --- | --- |
| `requireAuthentication()` | `require-authentication.middleware.ts` | any active session | `401 AUTHENTICATION_REQUIRED` |
| `requireAnyPermission(...)` | `require-permission.middleware.ts` | an active session whose user holds **at least one** of the listed permissions | `401 AUTHENTICATION_REQUIRED` with no usable token; `403 PERMISSION_DENIED` when the user holds none of them |
| task ownership | `require-task-ownership.middleware.ts` | the caller created the task named by `:id` | `404 NOT_FOUND` — identical to a missing task (§7) |

A missing, malformed, unknown, expired or revoked token is never an error on
its own; it simply leaves `req.auth` unset, so a guarded route answers
`401 AUTHENTICATION_REQUIRED`. The same is true of a still-unexpired session
whose user has since been disabled.

`/api/health` and all of `/api/approvals/*` have **no** guard — approval links
are authenticated by their own per-step token (§8), not a session, and must
keep working for an approver with no account at all.

**Permissions.** Every user holds one or more of these (never zero):

| Permission | Grants |
| --- | --- |
| `workflow:manage` | Create, generate, publish and archive workflow templates (§4) |
| `task:create` | Find a workflow template (selection) and create, complete and manage **their own** tasks |
| `task:approve` | Can be granted, but currently gates no endpoint — approvers act through approval links (§8) |
| `user:manage` | Create and view users and their permissions (§13) |
| `organisation:manage` | Configure faculties, departments, divisions and designations (§14–§15) |

A user with several permissions passes any guard that lists one of them. The
bootstrap administrator from `npm run seed:pg:run` holds all five.

Every workflow template write (§4) records the authenticated user's id as the
template's `updated_by` (and `created_by` on create); responses resolve both to
the user's name and email.

Request bodies are capped at **1 MB** (`express.json({ limit: "1mb" })`, `src/middlewares/json-body.middleware.ts`).

### CORS

Allowed origin is `CORS_ORIGIN`, defaulting to `http://localhost:3001`. This
only affects browsers; Postman ignores it.

---

## 2. Endpoint index

| # | Method | Path | Purpose | Auth |
| - | ------ | ---- | ------- | ---- |
| 1 | `GET`    | `/api/health`                          | Liveness check | none |
| 2 | `POST`   | `/api/auth/login`                      | Log in with email + password — returns a bearer token (§12.1) | none |
| 3 | `GET`    | `/api/auth/me`                         | The caller's user and current session (§12.2) | authenticated |
| 4 | `POST`   | `/api/auth/logout`                     | Revoke the current session (§12.3) | authenticated |
| 5 | `GET`    | `/api/auth/sessions`                   | List the caller's active sessions (§12.4) | authenticated |
| 6 | `DELETE` | `/api/auth/sessions/others`            | Revoke every session except the current one (§12.5) | authenticated |
| 7 | `DELETE` | `/api/auth/sessions/:sessionId`        | Revoke one of the caller's sessions (§12.6) | authenticated |
| 8 | `POST`   | `/api/users`                           | Create a user (§13.1) | `user:manage` |
| 9 | `GET`    | `/api/users`                           | List users (§13.2) | `user:manage` |
| 10 | `GET`   | `/api/users/:userId`                   | Get one user (§13.3) | `user:manage` |
| 11 | `GET`   | `/api/workflow-templates`              | List workflow templates (§4.1) | `workflow:manage` or `task:create` |
| 12 | `POST`  | `/api/workflow-templates`              | Save a draft template — title + prompt, nothing generated (§4.2) | `workflow:manage` |
| 13 | `POST`  | `/api/workflow-templates/generate`     | Create a template and generate version 1 (§4.3) | `workflow:manage` |
| 14 | `GET`   | `/api/workflow-templates/:workflowTemplateId` | Get one template with its current version (§4.4) | `workflow:manage` or `task:create` |
| 15 | `PATCH` | `/api/workflow-templates/:workflowTemplateId` | Rename and/or save prompt edits (§4.5) | `workflow:manage` |
| 16 | `POST`  | `/api/workflow-templates/:workflowTemplateId/generate` | Generate a new version from a prompt (§4.6) | `workflow:manage` |
| 17 | `POST`  | `/api/workflow-templates/:workflowTemplateId/publish` | Offer the template to requesters (§4.7) | `workflow:manage` |
| 18 | `POST`  | `/api/workflow-templates/:workflowTemplateId/archive` | Archive a template (§4.8) | `workflow:manage` |
| 19 | `POST`  | `/api/workflow-templates/:workflowTemplateId/restore` | Restore an archived template (§4.9) | `workflow:manage` |
| 20 | `GET`   | `/api/workflow-templates/:workflowTemplateId/versions` | Version history, newest first (§4.10) | `workflow:manage` or `task:create` |
| 21 | `GET`   | `/api/workflow-templates/:workflowTemplateId/versions/:version` | One version with its prompt and definition (§4.11) | `workflow:manage` or `task:create` |
| 22 | `POST`  | `/api/selection/sessions`              | Start a selection conversation (round 1) | `task:create` |
| 23 | `POST`  | `/api/selection/sessions/:id/answer`   | Answer a clarifying question (round 2+) | `task:create` |
| 24 | `POST`  | `/api/selection/sessions/:id/choose`   | Pick a workflow template manually | `task:create` |
| 25 | `GET`   | `/api/selection/sessions/:id/workflow-template` | Get the matched template's published definition | `task:create` |
| 26 | `POST`  | `/api/tasks`                           | Create a task from a matched selection session | `task:create` |
| 27 | `GET`   | `/api/tasks`                           | List the caller's own tasks (filter by `session_id` / `status`) | `task:create` |
| 28 | `GET`   | `/api/tasks/:id`                       | Get one task | `task:create` + owner |
| 29 | `GET`   | `/api/tasks/:id/next`                  | Get the next unfilled requirement | `task:create` + owner |
| 30 | `POST`  | `/api/tasks/:id/values`                | Submit a value for a requirement | `task:create` + owner |
| 31 | `POST`  | `/api/tasks/:id/finalize`              | Finalize a task once all required values are filled | `task:create` + owner |
| 32 | `PATCH` | `/api/tasks/:id/status`                | Cancel a task | `task:create` + owner |
| 33 | `POST`  | `/api/tasks/:id/start`                 | Start the approval chain — dispatches the first step(s) and sends email | `task:create` + owner |
| 34 | `GET`   | `/api/tasks/:id/status`                | Requester-facing status timeline | `task:create` + owner |
| 35 | `GET`   | `/api/tasks/:id/document`              | Download the completion-document PDF record (§7.10) | `task:create` + owner |
| 36 | `DELETE` | `/api/tasks/:id`                      | Permanently delete a finished or never-started task | `task:create` + owner |
| 37 | `GET`   | `/api/approvals/:token`                | Approver view — the decision page's data | none — the approval token IS the auth |
| 38 | `POST`  | `/api/approvals/:token/decision`       | Submit an approve / reject / request-more-info decision | none — the approval token IS the auth |
| 39 | `GET`   | `/api/organisational-units`            | List faculties, departments and divisions (§14.1) | authenticated |
| 40 | `POST`  | `/api/organisational-units`            | Create an organisational unit (§14.2) | `organisation:manage` |
| 41 | `GET`   | `/api/organisational-units/:unitId`    | Get one organisational unit (§14.3) | authenticated |
| 42 | `PATCH` | `/api/organisational-units/:unitId`    | Rename, re-parent or describe a unit (§14.4) | `organisation:manage` |
| 43 | `POST`  | `/api/organisational-units/:unitId/archive` | Archive a unit (§14.5) | `organisation:manage` |
| 44 | `POST`  | `/api/organisational-units/:unitId/restore` | Restore an archived unit (§14.5) | `organisation:manage` |
| 45 | `DELETE` | `/api/organisational-units/:unitId`   | Delete an unused unit (§14.6) | `organisation:manage` |
| 46 | `GET`   | `/api/organisational-units/:unitId/members` | Members of a unit with their designations there (§16.4) | `user:manage` or `organisation:manage` |
| 47 | `GET`   | `/api/designations`                    | List designations (§15.1) | authenticated |
| 48 | `POST`  | `/api/designations`                    | Create a designation (§15.2) | `organisation:manage` |
| 49 | `GET`   | `/api/designations/:designationId`     | Get one designation (§15.3) | authenticated |
| 50 | `PATCH` | `/api/designations/:designationId`     | Update a designation (§15.4) | `organisation:manage` |
| 51 | `POST`  | `/api/designations/:designationId/archive` | Archive a designation (§15.5) | `organisation:manage` |
| 52 | `POST`  | `/api/designations/:designationId/restore` | Restore an archived designation (§15.5) | `organisation:manage` |
| 53 | `DELETE` | `/api/designations/:designationId`    | Delete a designation nobody holds (§15.6) | `organisation:manage` |
| 54 | `GET`   | `/api/users/:userId/affiliations`      | A user's memberships and designations (§16.1) | `user:manage` |
| 55 | `PUT`   | `/api/users/:userId/affiliations`      | Replace a user's affiliations (§16.2) | `user:manage` |
| 56 | `GET`   | `/api/auth/me/affiliations`            | The caller's own affiliations (§16.3) | authenticated |

56 route bindings. **authenticated** means `requireAuthentication()` — any
active session, whatever its permissions. A permission name means
`requireAnyPermission(...)`; "`workflow:manage` or `task:create`" passes with
either. **+ owner** adds the task-ownership guard: a task created by another
user answers `404`, exactly like one that does not exist. See §1 for what each
guard returns on failure.

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

## 4. Workflow template endpoints

`src/routes/workflow-template.route.ts` + `src/controllers/workflow-template.controller.ts`,
backed by `WorkflowTemplateService` (`src/services/workflow-template.service.ts`).

A workflow template is authored from a plain-language **prompt**. The model turns the
prompt into a workflow definition (§5); each generation is stored as a new, immutable
**version**. Two Mongo collections hold the data:

- `workflow_templates` — one document per template, keyed by a string UUID `_id`. Holds
  the `title`, `status`, `current_version`, `draft_prompt`, `archived_at`,
  `created_by` / `updated_by`, and the `retrieval` block (text, embedding, aliases,
  `retrieval_summary` and `institution_type`) of the current version.
- `workflow_template_versions` — one document per generated version: the `prompt` it was
  generated from, the generated `definition`, and `generation_attempts`. Never updated
  or deleted.

**Lifecycle**

| `status` | Meaning | Reached by |
| -------- | ------- | ---------- |
| `draft` | Title and prompt saved; nothing generated yet. No versions. | `POST /workflow-templates` (§4.2) |
| `unpublished` | Generated at least once; not offered to requesters. | `POST /workflow-templates/generate` (§4.3), or the first `POST …/:id/generate` (§4.6) on a draft |
| `published` | The current version is offered to requesters through selection (§6). | `POST …/:id/publish` (§4.7) |

- **Regenerating creates a new version.** Versions number from 1 per template, and
  `current_version` always points to the newest. On a **published** template the new
  version is live immediately — the status stays `published` and there is no
  re-publish step. Older versions stay stored, so tasks pinned to them (§7) keep
  working.
- **The title lives on the template, not on a version.** Renaming (§4.5) never creates
  a version. Every read of a definition — including the task status page, the approver
  view and emails for tasks pinned to older versions — shows the template's current
  title.
- **Pending prompt edits.** `draft_prompt` holds a prompt that has been saved but not
  generated. On a `draft` template it *is* the prompt. On a generated template a
  non-null `draft_prompt` means edits that have not been generated yet, reported as
  `has_ungenerated_changes: true`; generating clears it.
- **Archive replaces delete.** There is no delete endpoint. Archiving (§4.8) keeps the
  status but hides the template from the default list, takes it out of selection, and
  makes it read-only until it is restored (§4.9).
- **Only published, non-archived templates are retrievable** by selection (§6).
- **Who changed it.** `created_by` and `updated_by` store user ids; responses resolve
  them to `{ "id", "full_name", "email" }`, or `null` when the user no longer exists.
  Every write sets `updated_by` to the caller.

**Permissions.** The `GET` routes accept `workflow:manage` **or** `task:create`;
every other route requires `workflow:manage`. A caller without `workflow:manage` only
ever sees **published** templates: drafts and unpublished templates are left out of the
list and return `404 WORKFLOW_TEMPLATE_NOT_FOUND` from the single-template and version
routes. Archived published templates stay readable (with `include_archived=true` on the
list) so older tasks can still resolve their template.

**The template object.** Every single-template response is wrapped as
`{ "workflow_template": { ... } }` (`serializeWorkflowTemplate`,
`src/utils/http/workflow-template-serializer.util.ts`):

```json
{
  "workflow_template": {
    "id": "3b2f6c1e-8a4d-4f0b-9c7e-2d1a5e6f7a8b",
    "title": "IT Faculty Overseas Leave Approval",
    "description": "Approval process for IT undergraduates travelling overseas during term.",
    "status": "published",
    "current_version": 2,
    "has_ungenerated_changes": false,
    "is_archived": false,
    "archived_at": null,
    "created_by": { "id": "0f6d2a52-6b1c-4d3e-9a8f-1b2c3d4e5f60", "full_name": "Ops Lead", "email": "ops.lead@example.edu" },
    "updated_by": { "id": "0f6d2a52-6b1c-4d3e-9a8f-1b2c3d4e5f60", "full_name": "Ops Lead", "email": "ops.lead@example.edu" },
    "created_at": "2026-11-11T09:10:00.000Z",
    "updated_at": "2026-11-11T09:40:12.511Z",
    "draft_prompt": null,
    "current": {
      "version": 2,
      "generation_attempts": 1,
      "created_by": { "id": "0f6d2a52-6b1c-4d3e-9a8f-1b2c3d4e5f60", "full_name": "Ops Lead", "email": "ops.lead@example.edu" },
      "created_at": "2026-11-11T09:40:12.511Z",
      "prompt": "Any undergraduate student of the Faculty of Information Technology who intends to travel overseas ...",
      "definition": { "schema_version": "1.0", "description": "...", "retrieval_summary": { "...": "..." }, "...": "see §5" }
    }
  }
}
```

| Field | Notes |
| ----- | ----- |
| `id` | String UUID — the `{{workflowTemplateId}}` used in every path below |
| `description` | Copied from the current version's definition; `null` until generated |
| `status` | `draft` \| `unpublished` \| `published` |
| `current_version` | Newest version number; `null` on a draft |
| `has_ungenerated_changes` | `true` when a generated template has a saved `draft_prompt`; always `false` on a draft |
| `is_archived` / `archived_at` | `archived_at` is the ISO time it was archived, or `null` |
| `draft_prompt` | The saved, not-yet-generated prompt (see *Pending prompt edits*) |
| `current` | The current version with its `prompt` and `definition`; `null` on a draft |

The list (§4.1) returns the **summary** shape: the same fields without `draft_prompt`
and `current`.

### 4.1 `GET /api/workflow-templates`

Lists templates, newest `updated_at` first.

| Parameter | In | Required | Notes |
| --------- | -- | -------- | ----- |
| `include_archived` | query | no | `true` or `false` (default `false`). `false` returns only non-archived templates; `true` returns all of them. Any other value is a 400 |

`GET {{baseUrl}}/workflow-templates?include_archived=true`

**200 OK**

```json
{
  "workflow_templates": [
    {
      "id": "3b2f6c1e-8a4d-4f0b-9c7e-2d1a5e6f7a8b",
      "title": "IT Faculty Overseas Leave Approval",
      "description": "Approval process for IT undergraduates travelling overseas during term.",
      "status": "published",
      "current_version": 2,
      "has_ungenerated_changes": false,
      "is_archived": false,
      "archived_at": null,
      "created_by": { "id": "0f6d2a52-...", "full_name": "Ops Lead", "email": "ops.lead@example.edu" },
      "updated_by": { "id": "0f6d2a52-...", "full_name": "Ops Lead", "email": "ops.lead@example.edu" },
      "created_at": "2026-11-11T09:10:00.000Z",
      "updated_at": "2026-11-11T09:40:12.511Z"
    }
  ]
}
```

There is no status, search or "archived only" filter on the server; the web app's
search box and Active/Archived/All filter work on the client over this list.

**400 Bad Request** — `{ "error": "include_archived must be 'true' or 'false'", "code": "VALIDATION_ERROR", "details": null }`

---

### 4.2 `POST /api/workflow-templates`

Saves a **draft**: a title and a prompt, with nothing generated. No model call.

**Request body**

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `title` | string | yes | Whitespace is collapsed; at most 200 characters |
| `prompt` | string | yes | Trimmed; at most 20,000 characters |

```json
{
  "title": "IT Faculty Overseas Leave Approval",
  "prompt": "Any undergraduate student of the Faculty of Information Technology who intends to travel overseas during the academic term must obtain prior approval before leaving the country. The student submits a request stating their full name, index number, the destination country, the departure date, the return date, and the reason for the trip. The request first goes to the student's Academic Advisor for approval. Once the Academic Advisor approves, it goes to the Head of the Department of Information Technology."
}
```

**201 Created** — the template object with `status: "draft"`, `current_version: null`,
`current: null`, `description: null` and `draft_prompt` set to the prompt.

**400 Bad Request**

```json
{ "error": "Body must include a non-empty 'title' field", "code": "VALIDATION_ERROR", "details": null }
```

```json
{ "error": "Workflow template title must be 200 characters or fewer", "code": "VALIDATION_ERROR", "details": { "field": "title" } }
```

---

### 4.3 `POST /api/workflow-templates/generate`

Creates a template and generates version 1 in one call. The result is `unpublished`.

**Request body**

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `prompt` | string | yes | Same rules as §4.2 |
| `title` | string | no | Same rules as §4.2. When omitted, the title the model generated is used (whitespace collapsed, cut to 200 characters) |

```json
{ "prompt": "Any undergraduate student of the Faculty of Information Technology who intends to travel overseas ..." }
```

**201 Created** — the template object with `status: "unpublished"`,
`current_version: 1` and `current` holding version 1.

**Errors**

| Status | Cause |
| ------ | ----- |
| `400` | `prompt` missing or blank, or `title`/`prompt` over its limit |
| `422` | `WORKFLOW_TEMPLATE_PROMPT_REJECTED` — the prompt does not describe a workflow; `details` lists the model's reasons |
| `422` | `WORKFLOW_TEMPLATE_GENERATION_FAILED` — no valid definition after every attempt (`details` holds the last validation errors), or the model returned invalid JSON |
| `502` | `EMBEDDING_ERROR` — the embedding call failed |

```json
{
  "error": "The prompt does not describe a workflow",
  "code": "WORKFLOW_TEMPLATE_PROMPT_REJECTED",
  "details": ["The text is a menu, not a process."]
}
```

Nothing is stored when generation fails.

**Note:** generation is slow — expect **10–60 seconds**. Raise the Postman request
timeout before testing it. The same applies to §4.6.

---

### 4.4 `GET /api/workflow-templates/:workflowTemplateId`

| Parameter | In | Required | Notes |
| --------- | -- | -------- | ----- |
| `workflowTemplateId` | path | yes | The template's UUID |

**200 OK** — `{ "workflow_template": { ... } }`. Archived templates are returned too.

**Errors**

| Status | Body |
| ------ | ---- |
| `400` | `{ "error": "workflowTemplateId must be a valid UUID", "code": "VALIDATION_ERROR", "details": null }` |
| `404` | `{ "error": "Workflow template '<id>' not found", "code": "WORKFLOW_TEMPLATE_NOT_FOUND", "details": null }` |

---

### 4.5 `PATCH /api/workflow-templates/:workflowTemplateId`

Renames the template and/or saves prompt edits without generating. Both fields are
optional; send only what changes.

**Request body**

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `title` | string | no | Same rules as §4.2. Never creates a version. On a generated template the retrieval text is rebuilt and re-embedded with the new title |
| `draft_prompt` | string \| null | no | A string saves an edited prompt (same rules as `prompt`). A prompt identical to the current version's prompt is stored as `null`. `null` discards pending edits — not allowed on a `draft`, which must keep its prompt |

```json
{ "title": "Overseas Travel Approval (IT Faculty)", "draft_prompt": "Any undergraduate student ... must also notify the Dean." }
```

**200 OK** — `{ "workflow_template": { ... } }`. When nothing actually changes, the
template is returned as-is and `updated_at` / `updated_by` are not touched.

**Errors**

| Status | Body |
| ------ | ---- |
| `400` | `{ "error": "A draft workflow template must keep its prompt", "code": "VALIDATION_ERROR", "details": { "field": "draft_prompt" } }` |
| `400` | A blank or over-long `title`, or `draft_prompt` that is not a string or `null` |
| `404` | `WORKFLOW_TEMPLATE_NOT_FOUND` |
| `409` | `{ "error": "The workflow template is archived; restore it before changing it", "code": "WORKFLOW_TEMPLATE_ARCHIVED", "details": null }` |
| `502` | `EMBEDDING_ERROR` — re-embedding after a rename failed |

---

### 4.6 `POST /api/workflow-templates/:workflowTemplateId/generate`

Generates (or regenerates) from a prompt and stores the result as version
`current_version + 1`.

**Request body**

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `prompt` | string | yes | Same rules as §4.2. Usually the editor's current prompt (`draft_prompt` if set, else `current.prompt`) |
| `title` | string | no | Renames the template in the same request; applied only if generation succeeds. Omit to keep the current title (the model's suggested title is ignored) |

```json
{ "prompt": "Any undergraduate student ... must also notify the Dean." }
```

**201 Created** — `{ "workflow_template": { ... } }` with the new version in `current`
and `draft_prompt: null`. Status after the call:

| Before | After |
| ------ | ----- |
| `draft` | `unpublished` |
| `unpublished` | `unpublished` |
| `published` | `published` — the new version is offered to requesters immediately |

**Errors** — as §4.3, plus `404 WORKFLOW_TEMPLATE_NOT_FOUND` and
`409 WORKFLOW_TEMPLATE_ARCHIVED`. A failed generation creates no version and leaves
the template, including its title and `draft_prompt`, unchanged.

---

### 4.7 `POST /api/workflow-templates/:workflowTemplateId/publish`

Offers the current version to requesters. **Request body:** none.

**200 OK** — `{ "workflow_template": { ... } }` with `status: "published"`.

**Errors**

| Status | Body |
| ------ | ---- |
| `404` | `WORKFLOW_TEMPLATE_NOT_FOUND` |
| `409` | `{ "error": "Generate the workflow template before publishing it", "code": "WORKFLOW_TEMPLATE_NOT_GENERATED", "details": null }` — still a `draft` |
| `409` | `{ "error": "The workflow template is already published", "code": "WORKFLOW_TEMPLATE_ALREADY_PUBLISHED", "details": null }` |
| `409` | `WORKFLOW_TEMPLATE_ARCHIVED` |

There is no unpublish endpoint. To take a template out of selection, archive it.

---

### 4.8 `POST /api/workflow-templates/:workflowTemplateId/archive`

**Request body:** none.

**200 OK** — `{ "workflow_template": { ... } }` with `is_archived: true` and
`archived_at` set. `status` is unchanged.

An archived template:

- is left out of §4.1 unless `include_archived=true`;
- is never a selection candidate (§6);
- cannot start new tasks — a session already matched to it gets
  `409 WORKFLOW_TEMPLATE_NOT_PUBLISHED` from §6.4 and `POST /tasks` (§7.1);
- rejects §4.5, §4.6 and §4.7 with `409 WORKFLOW_TEMPLATE_ARCHIVED`.

Tasks already created from it keep running against their pinned version.

**Errors** — `404 WORKFLOW_TEMPLATE_NOT_FOUND`; `409 WORKFLOW_TEMPLATE_ARCHIVED` when it
is already archived.

---

### 4.9 `POST /api/workflow-templates/:workflowTemplateId/restore`

**Request body:** none.

**200 OK** — `{ "workflow_template": { ... } }` with `is_archived: false`. The template
returns with the status it had; a restored `published` template is selectable again.

**Errors** — `404 WORKFLOW_TEMPLATE_NOT_FOUND`;
`409 { "error": "The workflow template is not archived", "code": "WORKFLOW_TEMPLATE_NOT_ARCHIVED", "details": null }`.

---

### 4.10 `GET /api/workflow-templates/:workflowTemplateId/versions`

The version history, newest first, without prompts or definitions.

**200 OK**

```json
{
  "versions": [
    { "version": 2, "generation_attempts": 1, "created_by": { "id": "0f6d2a52-...", "full_name": "Ops Lead", "email": "ops.lead@example.edu" }, "created_at": "2026-11-11T09:40:12.511Z" },
    { "version": 1, "generation_attempts": 2, "created_by": { "id": "0f6d2a52-...", "full_name": "Ops Lead", "email": "ops.lead@example.edu" }, "created_at": "2026-11-11T09:12:44.301Z" }
  ]
}
```

A draft returns `{ "versions": [] }`.

**Errors** — `400` non-UUID id; `404 WORKFLOW_TEMPLATE_NOT_FOUND`.

---

### 4.11 `GET /api/workflow-templates/:workflowTemplateId/versions/:version`

One version in full — this is what the editor's read-only historic view
(`?version=N`) shows.

| Parameter | In | Required | Notes |
| --------- | -- | -------- | ----- |
| `workflowTemplateId` | path | yes | The template's UUID |
| `version` | path | yes | Positive integer |

**200 OK**

```json
{
  "version": {
    "version": 1,
    "generation_attempts": 2,
    "created_by": { "id": "0f6d2a52-...", "full_name": "Ops Lead", "email": "ops.lead@example.edu" },
    "created_at": "2026-11-11T09:12:44.301Z",
    "prompt": "Any undergraduate student of the Faculty of Information Technology ...",
    "definition": { "schema_version": "1.0", "...": "see §5" }
  }
}
```

**Errors**

| Status | Body |
| ------ | ---- |
| `400` | `{ "error": "version must be a positive integer", "code": "VALIDATION_ERROR", "details": null }` |
| `404` | `WORKFLOW_TEMPLATE_NOT_FOUND` |
| `404` | `{ "error": "Workflow template '<id>' has no version 3", "code": "WORKFLOW_TEMPLATE_VERSION_NOT_FOUND", "details": null }` |

---

### 4.12 Error codes

`src/data/constants/workflow-template-error.constant.ts`:

| Code | Status | Raised by |
| ---- | ------ | --------- |
| `WORKFLOW_TEMPLATE_NOT_FOUND` | 404 | Any `:workflowTemplateId` route with an unknown id |
| `WORKFLOW_TEMPLATE_VERSION_NOT_FOUND` | 404 | §4.11 with an unknown version |
| `WORKFLOW_TEMPLATE_ARCHIVED` | 409 | §4.5, §4.6, §4.7 on an archived template; §4.8 when already archived |
| `WORKFLOW_TEMPLATE_NOT_ARCHIVED` | 409 | §4.9 on a template that is not archived |
| `WORKFLOW_TEMPLATE_NOT_GENERATED` | 409 | §4.7 on a draft |
| `WORKFLOW_TEMPLATE_ALREADY_PUBLISHED` | 409 | §4.7 on a published template |
| `WORKFLOW_TEMPLATE_NOT_PUBLISHED` | 409 | §6.4 and §7.1 when the matched template is no longer published or has been archived |
| `WORKFLOW_TEMPLATE_GENERATION_FAILED` | 422 | §4.3, §4.6 — no valid definition after every attempt, or unparseable model output |
| `WORKFLOW_TEMPLATE_PROMPT_REJECTED` | 422 | §4.3, §4.6 — the model judged the prompt not to be a workflow |

---

## 5. The workflow definition

`current.definition` (§4) and `version.definition` (§4.11) hold the generated
definition, which must satisfy `src/data/schemas/workflow.schema.json` and the graph
rules in `ValidationService`. The schema uses `"additionalProperties": false` and
lists **every** field as required — including the nullable ones. Complete examples
live in `src/data/samples/expected/`.

**How generation works.** `WorkflowTemplateGenerationService`
(`src/services/workflow-template-generation.service.ts`) sends the prompt to the
configured LLM provider and validates the reply. Invalid output is sent back to the
model with the validation errors as a repair prompt, up to
`WORKFLOW_TEMPLATE_GENERATION_MAX_ATTEMPTS` model calls in total (default 3).
`generation_attempts` on the version records how many it took. If
`metadata.is_workflow` comes back `false`, the call fails with
`422 WORKFLOW_TEMPLATE_PROMPT_REJECTED` and `metadata.ambiguities` as `details`.

**What is stored.** The model returns a `title` along with the definition. The title
is moved onto the template (§4) and is **not** stored in the version's `definition`;
endpoints that hand a definition to a runtime consumer — §6.4 — put the template's
current title back. The definition has no id of its own: a template is identified by
its UUID and a version number.

```json
{
  "schema_version": "1.0",
  "description": "Approval process for departments organizing an event or workshop.",
  "retrieval_summary": {
    "one_liner": "Get approval to run a departmental event or workshop.",
    "aliases": ["event approval", "workshop approval"],
    "keywords": ["book a hall", "run a workshop", "seminar"],
    "requester_types": ["academic staff"],
    "triggers": ["running a workshop for the department"],
    "not_for": ["personal or private venue bookings"]
  },
  "scope": { "institution_type": "university", "applies_to": { "actor_type": "staff", "constraints": [] } },
  "requester": { "...": "..." },
  "inputs": [],
  "computed": [],
  "steps": [],
  "completion": { "rule": "all_required_steps_complete", "required_steps": ["hall_booking"], "actions": [] },
  "metadata": {
    "confidence": "medium",
    "ambiguities": [],
    "unmapped_roles": [],
    "is_workflow": true
  }
}
```

`retrieval_summary` is what selection searches on: the template's title plus this
summary is rendered into the `retrieval.text` that gets embedded, and
`scope.institution_type` becomes `retrieval.institution_type` (the
`institution_type` filter in §6.1). Definitions cannot be edited directly through the
API — change the prompt and regenerate (§4.6).

---

## 6. Selection endpoints (end-user read path)

Every route in this section requires `task:create`.

A multi-round conversation that maps a plain-language request onto one
published template. The agent returns one of four decisions:

| `decision`      | Meaning |
| --------------- | ------- |
| `matched`       | One template chosen; `workflow_template_id` is set. Terminal. |
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
  "workflow_template_id": "8c1d4e2f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  "confidence": "high",
  "question": null,
  "options": [],
  "candidates": [
    {
      "workflow_template_id": "8c1d4e2f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
      "title": "Departmental Event & Workshop Organization",
      "one_liner": "Get approval to run a departmental event or workshop.",
      "score": 0.8471
    },
    {
      "workflow_template_id": "3b2f6c1e-8a4d-4f0b-9c7e-2d1a5e6f7a8b",
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
  "workflow_template_id": null,
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
  "workflow_template_id": null,
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
> that no template has been published. Publish one with §4.7 first. Only
> published, non-archived templates are candidates.

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
  "workflow_template_id": null,
  "confidence": "low",
  "question": "I could not narrow it down. Which of these do you want?",
  "options": ["Departmental Event & Workshop Organization", "IT Faculty Overseas Leave Approval"],
  "candidates": [ "..." ]
}
```

`options` then holds candidate **titles**, but §6.3 expects a `workflow_template_id` —
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
| `workflow_template_id` | string | yes      | A UUID; must be one of this session's `candidates` |

```json
{ "workflow_template_id": "8c1d4e2f-5a6b-4c7d-8e9f-0a1b2c3d4e5f" }
```

**200 OK** — a short body; there is no `candidates` array here:

```json
{
  "session_id": "6710f9c0a1b2c3d4e5f60789",
  "decision": "matched",
  "workflow_template_id": "8c1d4e2f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
}
```

**Errors**

| Status | Cause |
| ------ | ----- |
| `400`  | `{ "error": "workflow_template_id must be a valid UUID", "code": "VALIDATION_ERROR", "details": null }` — missing or not a UUID |
| `400`  | `{ "error": "'<workflow_template_id>' was not among this session's candidates", "code": "VALIDATION_ERROR", "details": null }` |
| `404`  | `{ "error": "Selection session '<id>' not found", "code": "NOT_FOUND", "details": null }` |
| `500`  | The `:id` is not a 24-character hex ObjectId — see the note in §6.4 |

---

### 6.4 `GET /api/selection/sessions/:id/workflow-template`

The published definition of the matched workflow template — this drives the plan
preview. It always returns the template's **current** version, with the template's
title put back into the definition (§5).

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `id`      | path | yes      | `session_id` |

**200 OK**

```json
{
  "workflow_template_version": 2,
  "definition": { "schema_version": "1.0", "title": "Departmental Event & Workshop Organization", "description": "...", "...": "see §5" }
}
```

`POST /api/tasks` (§7.1) pins the version that is current at that moment, which may be
newer than the one previewed if the template was regenerated in between.

**Errors**

| Status | Body | Cause |
| ------ | ---- | ----- |
| `409`  | `{ "error": "This session has not matched a workflow template yet", "code": "CONFLICT", "details": null }` | Session is still ambiguous or ended in `no_match` |
| `404`  | `{ "error": "Selection session '<id>' not found", "code": "NOT_FOUND", "details": null }` | The session id is unknown |
| `409`  | `{ "error": "Workflow template '<id>' is not available to requesters", "code": "WORKFLOW_TEMPLATE_NOT_PUBLISHED", "details": null }` | The matched template has since been archived (or is otherwise not published) |
| `404`  | `{ "error": "Workflow template '<id>' not found", "code": "WORKFLOW_TEMPLATE_NOT_FOUND", "details": null }` | The session matched an id that no longer exists |
| `500`  | `{ "error": "Failed to look up selection session", "code": "DATABASE_ERROR", "details": null }` | The `:id` is not a valid ObjectId |

> **Known rough edge.** A `session_id` that is not a 24-character hex ObjectId
> surfaces as a **500 `DATABASE_ERROR`** rather than a 400 — see
> [§9.1](#91-malformed-objectid-parameters-return-500), which covers tasks too.

---

## 7. Task endpoints (requirement collection)

Every route in this section requires `task:create`. A task belongs to the user
who created it (`POST /api/tasks` stores the caller's id as its creator), and
only that user can see or act on it:

- `GET /api/tasks` (§7.3) always returns only the caller's own tasks.
- Every `/api/tasks/:id*` route first checks that the caller created the task.
  A task created by someone else answers `404 NOT_FOUND` ("Task '<id>' not
  found"), exactly like a task that does not exist, so the response never
  reveals that another user's task id is real.

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
  "workflow_template_id": "3b2f6c1e-8a4d-4f0b-9c7e-2d1a5e6f7a8b",
  "workflow_template_version": 1,
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

Creates a task from a matched selection session. Pins the matched template's
**current** version (`workflow_template_id` + `workflow_template_version`), compiles requirements and step states (`PlannerService.compile`), assigns a
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
| `409`  | `{ "error": "This session has not matched a workflow template yet", "code": "CONFLICT", "details": null }` — same rule as §6.4 |
| `409`  | `WORKFLOW_TEMPLATE_NOT_PUBLISHED` — the matched template was archived after the match (§4.8) |

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

Only ever returns tasks the caller created. There is no parameter to list
another user's tasks.

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

The `requester_email` input (`type: "email"`, present on every workflow template generated since
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
  "workflow_template_title": "IT Faculty Overseas Leave Approval",
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

`workflow_template_title` is the template's current title, even when the task is
pinned to an older version (§4). `current_steps` lists the names of steps currently `pending_approval`. `timeline` is
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
(`task.workflow_template_id` + `task.workflow_template_version`), so the document is regenerated on every
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
of the API (which uses bearer sessions, §1). The token is the credential; anyone holding the
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
  "workflow_template_title": "IT Faculty Overseas Leave Approval",
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

`workflow_template_title` is the template's current title; the step itself comes from
the version the task is pinned to.

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
| `401`  | `{ "error", "code": "AUTHENTICATION_REQUIRED" \| "INVALID_CREDENTIALS", "details": null }` | `UnauthorizedError` — no usable session on a guarded route (§1), or a bad login (§12.1) |
| `403`  | `{ "error", "code": "PERMISSION_DENIED" \| "ACCOUNT_LOCKED" \| "ACCOUNT_DISABLED", "details": null }` | `ForbiddenError` — authenticated but missing every permission the route accepts; or a login refused for a locked or disabled account (§12.1) |
| `404`  | `{ "error", "code": "NOT_FOUND" \| "WORKFLOW_TEMPLATE_NOT_FOUND" \| "WORKFLOW_TEMPLATE_VERSION_NOT_FOUND" \| "USER_NOT_FOUND" \| "USER_SESSION_NOT_FOUND", "details" }` | `NotFoundError` — missing workflow template or version (§4), selection session or task (including another user's task, §7); unknown user (§13.3); a session id that is not one of the caller's active sessions (§12.6) |
| `409`  | `{ "error", "code": "CONFLICT" \| "WORKFLOW_TEMPLATE_*" \| "EMAIL_ALREADY_REGISTERED", "details" }` | `ConflictError` — §6.4 on an unmatched session, the workflow template lifecycle rules (§4.12), §13.1 on a duplicate email |
| `422`  | `{ "error", "code": "WORKFLOW_TEMPLATE_GENERATION_FAILED" \| "WORKFLOW_TEMPLATE_PROMPT_REJECTED", "details": <errors\|null> }` | `WorkflowTemplateGenerationError` only — the model could not produce a valid workflow template (§4.3, §4.6) |
| `500`  | `{ "error": "Internal server error", "code": "INTERNAL_ERROR", "details": null }` | Anything untyped — details are logged, never returned |
| `502`  | `{ "error", "code": "SELECTION_ERROR" \| "EMBEDDING_ERROR", "details": <cause\|null> }` | `SelectionError`, `EmbeddingError` — upstream Azure failure |

`ConflictError` also covers the task status-machine rejections in §7 (§7.1, §7.5,
§7.6, §7.7, §7.10) alongside the §6.4 unmatched-session case.

A `401`/`403` from a guarded route (see §1 and §2's Auth column) is thrown by
the route guard itself, before the controller ever runs — so it carries no
`details` regardless of what the request body contained.

`details` is `null` unless the error carried one explicitly. Every handled error
uses the same three keys — there is no separate `errors` key on any response. A
failed generation is a **422** carrying the last validation errors in `details`:

```json
{
  "error": "Failed to generate a valid workflow template after 3 attempts",
  "code": "WORKFLOW_TEMPLATE_GENERATION_FAILED",
  "details": ["/steps/0: must have required property 'sla'"]
}
```

The split is deliberate: **400** means the request you sent is wrong, **422** means
the model could not build a workflow template from your prompt. Both are client-visible
failures, but only the second implies the LLM was involved.

### 9.1 Malformed ObjectId parameters return 500

Routes whose `:id` is a **MongoDB ObjectId** — every
`/selection/sessions/:id*` route, and every `/tasks/:id*` route — behave differently
depending on *how* the id is wrong. `/approvals/:token*` is unaffected — the token is
not an ObjectId, and an invalid one is a clean 404 (§8.1) rather than a 500:

| `:id` you send | Status | Body |
| -------------- | ------ | ---- |
| 24 hex chars, no matching row | `404` | `{ "error": "Selection session '<id>' not found", "code": "NOT_FOUND" }` |
| Anything else (`not-an-objectid`, `123`) | `500` | `{ "error": "Failed to look up selection session", "code": "DATABASE_ERROR" }` |

`/tasks/:id*` routes are the exception: the ownership guard (§1) validates the id
before any lookup, so a malformed task id returns `400` with
`{ "error": "'<id>' is not a valid id", "code": "VALIDATION_ERROR" }`.

The malformed case fails inside the driver before any not-found check runs, so it is
reported as a database fault rather than the 400 the input actually deserves. Nothing
sensitive leaks — the generic message is all the client sees — but when testing, read a
500 from these routes as **"check the id format first"** rather than as a server bug.

Workflow template routes are unaffected: `/workflow-templates/:workflowTemplateId` takes a
UUID, validated before any lookup — a malformed id is a clean 400 and an unknown one a
404 (§4.4).

---

## 10. Suggested Postman test order

Run these folders in sequence — later calls depend on ids produced by earlier ones.
The runnable collection at [../postman/](../postman/) automates this order with
`pm.test` scripts that write the ids into collection variables automatically, so a full
Collection Runner pass needs no manual variable entry.

| Folder | Call | Capture |
| --- | ---- | ------- |
| Health | `GET /health` | confirm `status: "ok"` |
| Auth | `POST /auth/login` with `{{loginEmail}}` / `{{loginPassword}}` (the seeded administrator, §12.1) | `token` → `{{authToken}}` |
| Auth | `GET /auth/me` with `Authorization: Bearer {{authToken}}` | confirm the `user` and its `permissions` |
| Auth | `POST /auth/login` again | `token` → `{{secondAuthToken}}` — a second concurrent session |
| Auth | `GET /auth/sessions` | the newest session with `is_current: false` → `{{otherUserSessionId}}` |
| Auth | `DELETE /auth/sessions/{{otherUserSessionId}}` | `204`; `{{secondAuthToken}}` now gets `401` |
| Auth | `DELETE /auth/sessions/others` | `revoked_count` (sessions left over from earlier runs) |
| Auth | `POST /auth/logout` with a throwaway session | `204`; that token now gets `401` — `{{authToken}}` is untouched |
| Users | `POST /users` with a unique email | `user.id` → `{{userId}}` |
| Users | `GET /users` | the new user appears in the list |
| Users | `GET /users/{{userId}}` | the same `UserDto` |
| Workflow Templates | `POST /workflow-templates/generate` with the prompt from `src/data/samples/demo-drafts/workshop_event.txt` (send `Authorization: Bearer {{authToken}}` — every call below does the same) | `workflow_template.id` → `{{workflowTemplateId}}`, `current_version` → `{{templateVersion}}`; `status: "unpublished"` (slow) |
| Workflow Templates | `GET /workflow-templates` | the template appears in the list |
| Workflow Templates | `GET /workflow-templates?include_archived=true` | archived templates included |
| Workflow Templates | `GET /workflow-templates/{{workflowTemplateId}}` | `current` holds version 1 |
| Workflow Templates | `PATCH /workflow-templates/{{workflowTemplateId}}` with a new `title` and `draft_prompt` | `current_version` unchanged, `has_ungenerated_changes: true` |
| Workflow Templates | `POST /workflow-templates/{{workflowTemplateId}}/publish` | `status: "published"` — now selectable |
| Workflow Templates | `POST /workflow-templates/{{workflowTemplateId}}/generate` with the edited prompt | `current_version` 2, still `published` (slow) |
| Workflow Templates | `GET /workflow-templates/{{workflowTemplateId}}/versions` | two versions, newest first |
| Workflow Templates | `GET /workflow-templates/{{workflowTemplateId}}/versions/1` | version 1's `prompt` and `definition` |
| Workflow Templates | `POST /workflow-templates/{{workflowTemplateId}}/archive`, then `…/restore` | `is_archived` true, then false; status stays `published` |
| Workflow Templates | `POST /workflow-templates` with a title and prompt | `workflow_template.id` → `{{draftWorkflowTemplateId}}`; `status: "draft"` |
| Selection | `POST /selection/sessions` with a matching query | `session_id` → `{{sessionId}}` |
| Selection | `POST /selection/sessions/{{sessionId}}/answer` | only if `decision` was `ambiguous` |
| Selection | `POST /selection/sessions/{{sessionId}}/choose` | only if `decision` was `manual_choice` |
| Selection | `GET /selection/sessions/{{sessionId}}/workflow-template` | `workflow_template_version` and the published `definition` |
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
| Error cases | one request per error class (400, 401, 404, 409, 422) | asserts `{ error, code, details }` |

The seeded administrator holds every permission, so one `{{authToken}}` drives
the whole sequence. To exercise the permission guards, create a user with only
`task:create` (§13.1), log in as them (their password is
`USER_DEFAULT_PASSWORD`), and use that token: Selection, Tasks and the
`GET /workflow-templates*` rows still pass, while every
`POST/PATCH /workflow-templates*` and every `/users*` row
answers `403 PERMISSION_DENIED`. Tasks are visible only to the user who created
them (§7), so switch tokens before creating a task, not halfway through one.

**Do not log out of `{{authToken}}` mid-run.** Logout (and revoking the current
session through §12.6) really revokes the session, so every later request would
answer `401`. The collection's Logout request logs in a throwaway session first
and logs that one out instead.

Generate and publish a second template (for example from
`src/data/samples/demo-drafts/it_overseas_leave.txt`) so the selector has something to
disambiguate between — with one candidate it will rarely return `ambiguous`.

**Postman scripting** — the collection uses `pm.collectionVariables.set(...)` in each
request's *Tests* tab rather than environment variables, so the chain works the same way
whether or not an environment is selected. For example, `POST /auth/login`:

```javascript
pm.collectionVariables.set("authToken", pm.response.json().token);
```

The collection-level auth is `Bearer {{authToken}}`, so every request after
Login authenticates without a manual header.

and `POST /workflow-templates/generate`:

```javascript
var json = pm.response.json();
pm.collectionVariables.set("workflowTemplateId", json.workflow_template.id);
pm.collectionVariables.set("templateVersion", json.workflow_template.current_version);
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

- **LLM routes are slow.** `POST /workflow-templates/generate` and
  `POST /workflow-templates/:workflowTemplateId/generate` make up to
  `WORKFLOW_TEMPLATE_GENERATION_MAX_ATTEMPTS` model calls. Set the Postman timeout well
  above the default.
- **Nothing is selectable until it is published.** Retrieval only considers templates
  with `status: "published"` and no `archived_at`.
- **Generating always makes a new version.** Versions are never edited in place. On a
  published template the new version goes live immediately. A rename changes only the
  template and re-embeds; it never makes a version.
- **There is no delete.** Archive templates you no longer want (§4.8). To wipe test
  data, drop it directly in MongoDB (`unblock_ai` database, collections
  `workflow_templates`, `workflow_template_versions`, `selection_sessions`, `tasks`).
- **Definitions cannot be hand-edited through the API.** Change the prompt and
  regenerate. Complete example definitions live in `src/data/samples/expected/`.
- **Retrieval backend is switchable.** `VECTOR_BACKEND=atlas` uses Atlas vector
  search; anything else uses the in-memory store. This changes `score` values
  but not the response shape.
- **A task can only be created from a matched session.** Run the Selection folder
  through to a `matched` decision (§6) before `POST /tasks`.
- **Every workflow now collects `requester_email`.** It is declared last among the
  inputs, so it is the last `source: "input"` requirement `GET /tasks/:id/next` hands
  back before the `actor:*` ones. It is `type: "email"` and required — a placeholder
  string is a 400 (§7.5).
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
  workflow template on every call — only a small metadata record (`filename`, `byte_size`,
  `sha256`, `emailed_to`/`emailed_at`) is persisted on the task. It 409s until
  `status` is `completed`. The same PDF is attached to the completion email
  (`DOCUMENT_ATTACH_TO_EMAIL`, default `true`), so this endpoint is the fallback
  when that email or its attachment never arrived.

---

## 12. Auth endpoints

`src/routes/auth.route.ts` (login, me, logout) and
`src/routes/user-session.route.ts` (session management).

**Users.** There is one `users` table in PostgreSQL. A user signs in with their
email, which is stored trimmed and lower-cased and is unique regardless of
case. Each user has a `status` (`active` or `disabled`) and holds one or more
permissions (§1). Users are created through §13 or, for the first
administrator, by `npm run seed:pg:run` (§1).

**Sessions.** Sessions are server-side rows in the `user_sessions` table:

- `POST /auth/login` issues an opaque random token: 32 random bytes, base64url
  encoded, so 43 characters. Only its SHA-256 hash is stored, so the token
  itself is shown exactly once, in the login response.
- Send it on every guarded request as `Authorization: Bearer <token>`.
- A session expires `SESSION_TTL_HOURS` (default `12`) after login. This is an
  absolute lifetime: using the session does **not** extend it.
- A user can hold many sessions at once, for example one per browser or device.
- `POST /auth/logout` and the revoke endpoints (§12.5, §12.6) revoke a session
  immediately. The very next request with that token answers
  `401 AUTHENTICATION_REQUIRED`.
- Each session records the login request's `User-Agent`, `created_at`,
  `expires_at` and `last_seen_at`. `last_seen_at` is refreshed at most once
  every 5 minutes.
- Each successful login also deletes that user's already-expired sessions.

**Lockout.** Every wrong password against a registered email increments the
user's `failed_login_count` and stamps `last_failed_login_at`. If the previous
failure is older than `AUTH_LOCKOUT_DURATION_MINUTES` (default `15`), the count
restarts at 1. A successful login resets both. An unknown email changes
nothing, because there is no row to update.

When `AUTH_MAX_FAILED_ATTEMPTS` is greater than `0`:

- The failed attempt that reaches the limit answers `403 ACCOUNT_LOCKED`.
- Every login attempt for that account answers `403 ACCOUNT_LOCKED` until
  `AUTH_LOCKOUT_DURATION_MINUTES` have passed since the last failure. This
  includes attempts with the **correct** password.

`AUTH_MAX_FAILED_ATTEMPTS` defaults to `0`. At `0`, failures are still counted
but nothing is ever locked.

All auth errors use the standard body `{ "error", "code", "details": null }`
(§9). The codes are:

| Status | `code` | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Missing or blank login fields; a `:sessionId` that is not a UUID |
| `401` | `INVALID_CREDENTIALS` | Unknown email or wrong password |
| `401` | `AUTHENTICATION_REQUIRED` | No usable session on a guarded route |
| `403` | `ACCOUNT_LOCKED` | Login refused by the lockout above |
| `403` | `ACCOUNT_DISABLED` | Correct password, but the account's `status` is `disabled` |
| `403` | `PERMISSION_DENIED` | Authenticated, but the user holds none of the permissions the route accepts |
| `404` | `USER_SESSION_NOT_FOUND` | §12.6 with a session id that does not exist, belongs to another user, or is already revoked or expired |

### 12.1 `POST /api/auth/login`

No auth required — this is how you get a token. The request's `User-Agent`
header, if any, is stored on the new session.

**Request body**

```json
{ "email": "ops.lead@example.edu", "password": "your-password" }
```

| Field      | Type   | Required | Notes |
| ---------- | ------ | -------- | ----- |
| `email`    | string | yes      | Non-blank. Trimmed and lower-cased before lookup, so case does not matter |
| `password` | string | yes      | Non-blank. Checked against a scrypt hash |

**200 OK**

```json
{
  "token": "q3Zt0mR8Yc1vN5pW2xH7kL9sD4fG6jB0aE3uT8oI1yQ",
  "expires_at": "2026-11-11T21:00:00.000Z",
  "user": {
    "id": "3f9a1e2b-7c4d-4e5f-8a6b-1c2d3e4f5a6b",
    "email": "ops.lead@example.edu",
    "full_name": "Nadeesha Perera",
    "permissions": ["workflow:manage", "task:create", "task:approve", "user:manage"]
  }
}
```

`expires_at` is the session's absolute expiry (login time plus
`SESSION_TTL_HOURS`). Save `token` into `{{authToken}}`; the collection's Login
request does this automatically (§10).

**Errors**

| Status | Body |
| ------ | ---- |
| `400`  | `{ "error": "Body must include a non-empty 'email' field", "code": "VALIDATION_ERROR", "details": null }` (or `'password'`) |
| `401`  | `{ "error": "Invalid email or password", "code": "INVALID_CREDENTIALS", "details": null }` |
| `403`  | `{ "error": "Account locked after too many failed attempts", "code": "ACCOUNT_LOCKED", "details": null }` |
| `403`  | `{ "error": "Account is disabled", "code": "ACCOUNT_DISABLED", "details": null }` |

An unknown email and a wrong password get the same `401` with the same message,
so the response cannot be used to find out which emails are registered.

The checks run in this order:

1. The password is always verified first, so response timing does not reveal
   whether an account is locked.
2. A locked account answers `ACCOUNT_LOCKED`, whether or not the password
   matched.
3. A wrong password answers `INVALID_CREDENTIALS` and counts toward the
   lockout. This applies to disabled accounts too.
4. A correct password on a disabled account answers `ACCOUNT_DISABLED`.

---

### 12.2 `GET /api/auth/me`

Requires an active session. Returns the caller's user and current session.
Useful for confirming a saved `{{authToken}}` is still valid before running the
rest of a Postman folder.

`GET {{baseUrl}}/auth/me` with `Authorization: Bearer {{authToken}}`

**200 OK**

```json
{
  "user": {
    "id": "3f9a1e2b-7c4d-4e5f-8a6b-1c2d3e4f5a6b",
    "email": "ops.lead@example.edu",
    "full_name": "Nadeesha Perera",
    "permissions": ["workflow:manage", "task:create", "task:approve", "user:manage"]
  },
  "session": {
    "id": "8b1c2d3e-4f5a-4b6c-9d7e-0f1a2b3c4d5e",
    "expires_at": "2026-11-11T21:00:00.000Z"
  }
}
```

`user` has the same shape as in §12.1. `permissions` is read fresh on every
request, so a change to the user's permissions shows up here without logging in
again.

**401 Unauthorized** — no token, or one that is unknown, expired or revoked, or
whose user is now disabled:

```json
{ "error": "Authentication required", "code": "AUTHENTICATION_REQUIRED", "details": null }
```

---

### 12.3 `POST /api/auth/logout`

Requires an active session. Revokes the session the request was made with. The
token stops working immediately. Other sessions of the same user are not
affected.

**204 No Content** — no body.

**401 Unauthorized** — `AUTHENTICATION_REQUIRED`, as in §12.2. Calling logout
twice with the same token therefore gets `204` and then `401`.

---

### 12.4 `GET /api/auth/sessions`

Requires an active session. Lists the caller's active sessions (not revoked,
not expired), newest `created_at` first. The session the request was made with
has `is_current: true`.

**200 OK**

```json
{
  "sessions": [
    {
      "id": "8b1c2d3e-4f5a-4b6c-9d7e-0f1a2b3c4d5e",
      "user_agent": "PostmanRuntime/7.39.0",
      "created_at": "2026-11-11T09:00:00.000Z",
      "last_seen_at": "2026-11-11T09:40:12.000Z",
      "expires_at": "2026-11-11T21:00:00.000Z",
      "is_current": true
    },
    {
      "id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      "user_agent": null,
      "created_at": "2026-11-11T07:15:00.000Z",
      "last_seen_at": "2026-11-11T07:15:00.000Z",
      "expires_at": "2026-11-11T19:15:00.000Z",
      "is_current": false
    }
  ]
}
```

`user_agent` is `null` when the login request sent no `User-Agent` header. The
token itself is never returned here.

**401 Unauthorized** — `AUTHENTICATION_REQUIRED`.

---

### 12.5 `DELETE /api/auth/sessions/others`

Requires an active session. Revokes every other active session of the caller
and keeps the current one, for example to "sign out everywhere else". This
includes sessions in other browsers or devices, such as the web app.

**200 OK**

```json
{ "revoked_count": 2 }
```

`revoked_count` is `0` when there was nothing else to revoke.

**401 Unauthorized** — `AUTHENTICATION_REQUIRED`.

---

### 12.6 `DELETE /api/auth/sessions/:sessionId`

Requires an active session. Revokes one of the caller's own sessions, taken from
§12.4. Revoking the current session is allowed and behaves exactly like logout
(§12.3).

| Parameter   | In   | Required | Notes |
| ----------- | ---- | -------- | ----- |
| `sessionId` | path | yes      | A session `id` (UUID) |

**204 No Content** — revoked. No body.

**Errors**

| Status | Body |
| ------ | ---- |
| `400`  | `{ "error": "sessionId must be a valid UUID", "code": "VALIDATION_ERROR", "details": null }` |
| `401`  | `AUTHENTICATION_REQUIRED` |
| `404`  | `{ "error": "User session '<id>' not found", "code": "USER_SESSION_NOT_FOUND", "details": null }` — no such session, a session that belongs to another user, or one that is already revoked or expired |

A session belonging to another user answers the same `404` as one that does not
exist, so the response never confirms that another user's session id is real.

---

## 13. User endpoints

`src/routes/user.route.ts`. Every route here requires the `user:manage`
permission:

- No usable session answers `401 AUTHENTICATION_REQUIRED`.
- A user without `user:manage` answers
  `{ "error": "Insufficient permissions", "code": "PERMISSION_DENIED", "details": null }`
  with status `403`.

Each user is returned as a `UserDto`:

```json
{
  "id": "5d6e7f80-1a2b-4c3d-8e9f-a0b1c2d3e4f5",
  "email": "kasun.silva@example.edu",
  "full_name": "Kasun Silva",
  "status": "active",
  "permissions": ["task:create"],
  "last_login_at": null,
  "created_by_user_id": "3f9a1e2b-7c4d-4e5f-8a6b-1c2d3e4f5a6b",
  "created_at": "2026-11-11T10:05:00.000Z",
  "updated_at": "2026-11-11T10:05:00.000Z"
}
```

| Field | Notes |
| --- | --- |
| `status` | `active` or `disabled`. A disabled user cannot log in (§12.1), and their existing sessions stop authenticating |
| `permissions` | One or more of `workflow:manage`, `task:create`, `task:approve`, `user:manage`, `organisation:manage` (§1). Never empty |
| `last_login_at` | Time of the last successful login; `null` until the first one |
| `created_by_user_id` | The user who created this one through §13.1; `null` for the seeded administrator |

The password hash, failed-login counters and sessions are never part of a
`UserDto`.

### 13.1 `POST /api/users`

Creates a user. Their initial password is the server's `USER_DEFAULT_PASSWORD`.
Share it with them out of band. The response never contains it.

**Request body**

| Field         | Type     | Required | Notes |
| ------------- | -------- | -------- | ----- |
| `email`       | string   | yes      | Trimmed and lower-cased. Must be a valid address of at most 254 characters, and not already registered (case-insensitive) |
| `full_name`   | string   | yes      | Trimmed. 1–200 characters |
| `permissions` | string[] | yes      | Non-empty, each a known permission (§1), no duplicates |

```json
{
  "email": "Kasun.Silva@example.edu",
  "full_name": "Kasun Silva",
  "permissions": ["task:create"]
}
```

**201 Created** — `{ "user": UserDto }`, with the email stored lower-cased
(`kasun.silva@example.edu`) and `created_by_user_id` set to the caller.

**Errors**

| Status | Body |
| ------ | ---- |
| `400`  | `{ "error": "Body must include a non-empty 'email' field", "code": "VALIDATION_ERROR", "details": null }` (likewise `'full_name'`) |
| `400`  | `{ "error": "Body must include a 'permissions' array of strings", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | `{ "error": "email must be a valid address of at most 254 characters", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | `{ "error": "full_name must contain between 1 and 200 characters", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | `{ "error": "permissions must contain at least one permission", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | `{ "error": "permissions contains unknown values: <values>", "code": "VALIDATION_ERROR", "details": null }` |
| `400`  | `{ "error": "permissions must not contain duplicates", "code": "VALIDATION_ERROR", "details": null }` |
| `401`  | `AUTHENTICATION_REQUIRED` |
| `403`  | `PERMISSION_DENIED` |
| `409`  | `{ "error": "A user with email '<email>' already exists", "code": "EMAIL_ALREADY_REGISTERED", "details": null }` |

---

### 13.2 `GET /api/users`

Lists users one page at a time, ordered by `full_name` (case-insensitive).

| Parameter | In | Required | Notes |
| --------- | -- | -------- | ----- |
| `search` | query | no | Matches `full_name` or `email`, case-insensitive, up to 100 characters. Blank means no search |
| `organisational_unit_id` | query | no | Only members of this unit **or of its direct child units** — filtering by a faculty includes its departments' members |
| `limit` | query | no | 1–100, default `25` |
| `offset` | query | no | 0 or more, default `0` |

**200 OK**

```json
{
  "users": [
    {
      "id": "5d6e7f80-1a2b-4c3d-8e9f-a0b1c2d3e4f5",
      "email": "u4@u.c",
      "full_name": "Chamari Gunawardena",
      "status": "active",
      "permissions": ["task:approve", "task:create", "workflow:manage"],
      "last_login_at": null,
      "created_by_user_id": null,
      "created_at": "2026-11-11T06:57:12.000Z",
      "updated_at": "2026-11-11T06:57:12.000Z",
      "organisational_units": [
        { "id": "…", "code": "CSE", "name": "Department of Computer Science & Engineering", "unit_type": "department", "is_archived": false }
      ]
    }
  ],
  "page": { "total": 18, "limit": 25, "offset": 0 }
}
```

Each item is a `UserDto` plus `organisational_units`: the units the user is a
member of, ordered by faculty, then unit type, then name.

**Errors** — `400 VALIDATION_ERROR` for an out-of-range `limit` / `offset`, a
non-UUID `organisational_unit_id` or an overlong `search`;
`401 AUTHENTICATION_REQUIRED`; `403 PERMISSION_DENIED`.

---

### 13.3 `GET /api/users/:userId`

| Parameter | In   | Required | Notes |
| --------- | ---- | -------- | ----- |
| `userId`  | path | yes      | A user `id` (UUID) |

**200 OK** — `{ "user": UserDto }`

**Errors**

| Status | Body |
| ------ | ---- |
| `400`  | `{ "error": "userId must be a valid UUID", "code": "VALIDATION_ERROR", "details": null }` |
| `401`  | `AUTHENTICATION_REQUIRED` |
| `403`  | `PERMISSION_DENIED` |
| `404`  | `{ "error": "User '<id>' not found", "code": "USER_NOT_FOUND", "details": null }` |

---

## 14. Organisational unit endpoints

`src/routes/organisational-unit.route.ts`. Faculties, departments and divisions
live in one `organisational_units` table, distinguished by `unit_type`:

| `unit_type` | Parent |
| --- | --- |
| `faculty` | none |
| `department` | exactly one `faculty` |
| `division` | none (university-level) or one `faculty` |

Reads need any signed-in user; writes need `organisation:manage`. Every unit is
returned as an `OrganisationalUnitSummaryDto`:

```json
{
  "id": "9c4583aa-385f-49b1-aca5-9c7337ff3660",
  "code": "CSE",
  "name": "Department of Computer Science & Engineering",
  "unit_type": "department",
  "is_archived": false,
  "parent": { "id": "…", "code": "FOE", "name": "Faculty of Engineering", "unit_type": "faculty", "is_archived": false },
  "description": null,
  "archived_at": null,
  "created_at": "2026-11-11T06:57:00.000Z",
  "updated_at": "2026-11-11T06:57:00.000Z",
  "member_count": 4,
  "child_count": 0,
  "active_child_count": 0
}
```

| Field | Notes |
| --- | --- |
| `code` | Permanent, unique, upper-case letters and digits in hyphen-separated segments, at most 24 characters (`FOE`, `FOE-UGSD`) |
| `name` | 1–200 characters, unique among units of the same type under the same parent (case-insensitive) |
| `member_count` | Users who are members of this unit itself |
| `child_count` / `active_child_count` | All / non-archived units whose parent is this unit |

### 14.1 `GET /api/organisational-units`

| Parameter | In | Notes |
| --- | --- | --- |
| `unit_type` | query | `faculty`, `department` or `division` |
| `parent_id` | query | Only children of this unit |
| `root_only` | query | `true` returns units without a parent. Cannot be combined with `parent_id` |
| `include_archived` | query | `true` includes archived units (default `false`) |

**200 OK** — `{ "organisational_units": [OrganisationalUnitSummaryDto, ...] }`,
ordered by effective faculty, then unit type, then name.

### 14.2 `POST /api/organisational-units`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `code` | string | yes | Normalised to upper case |
| `name` | string | yes | Trimmed; inner whitespace collapsed |
| `unit_type` | string | yes | `faculty`, `department` or `division` |
| `parent_id` | UUID \| null | per type | Must be an active faculty. Required for departments, optional for divisions, forbidden for faculties |
| `description` | string \| null | no | At most 1000 characters; blank becomes `null` |

**201 Created** — `{ "organisational_unit": OrganisationalUnitSummaryDto }`

### 14.3 `GET /api/organisational-units/:unitId`

**200 OK** — `{ "organisational_unit": OrganisationalUnitSummaryDto }`

### 14.4 `PATCH /api/organisational-units/:unitId`

Any of `name`, `parent_id` (`null` moves a division to university level) and
`description`. `code` and `unit_type` cannot change. Moving a unit never touches
its memberships. Because every member of a department must also be a member of
its faculty, a department that has members cannot be moved to another faculty;
remove its members first. **200 OK** — `{ "organisational_unit": OrganisationalUnitSummaryDto }`

### 14.5 `POST …/:unitId/archive` and `POST …/:unitId/restore`

Archiving hides a unit from pickers and blocks new memberships; existing
memberships stay. Both calls are idempotent. A unit with active children cannot
be archived; a unit whose parent is archived cannot be restored.

### 14.6 `DELETE /api/organisational-units/:unitId`

Allowed only when the unit has no members and no child units. **204 No Content**.

**Errors (all of §14)**

| Status | `code` | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Malformed field; `details.field` names it |
| `400` | `ORGANISATIONAL_UNIT_PARENT_INVALID` | Missing, forbidden, unknown or wrong-type parent |
| `404` | `ORGANISATIONAL_UNIT_NOT_FOUND` | Unknown `unitId` |
| `409` | `ORGANISATIONAL_UNIT_CODE_TAKEN` / `ORGANISATIONAL_UNIT_NAME_TAKEN` | Duplicate code / sibling name |
| `409` | `ORGANISATIONAL_UNIT_PARENT_ARCHIVED` | The chosen or current parent is archived |
| `409` | `ORGANISATIONAL_UNIT_HAS_ACTIVE_CHILDREN` | Archive blocked; `details.active_child_count` |
| `409` | `ORGANISATIONAL_UNIT_IN_USE` | Delete blocked; `details.member_count`, `details.child_count` |
| `409` | `ORGANISATIONAL_UNIT_HAS_MEMBERS` | Moving a department that has members to another faculty; `details.field` is `parent_id`, `details.member_count` |

---

## 15. Designation endpoints

`src/routes/designation.route.ts`. A designation (Dean, Head of Department,
Lecturer, Student, …) is defined once and lists the unit types it can be held in.
Reads need any signed-in user; writes need `organisation:manage`.

```json
{
  "id": "…",
  "code": "head_of_department",
  "title": "Head of Department",
  "category": "leadership",
  "display_order": 70,
  "is_archived": false,
  "applicable_unit_types": ["department"],
  "single_holder_per_unit": true,
  "archived_at": null,
  "created_at": "…",
  "updated_at": "…",
  "holder_count": 2
}
```

| Field | Notes |
| --- | --- |
| `code` | Permanent, unique, lower-case snake case, at most 64 characters. Matches workflow actor role slugs where one exists |
| `title` | 1–120 characters, unique (case-insensitive) |
| `category` | `leadership`, `academic`, `academic_support`, `administrative`, `non_academic` or `student` |
| `applicable_unit_types` | At least one of `faculty`, `department`, `division` |
| `single_holder_per_unit` | At most one person may hold it in any one unit |
| `display_order` | 0–9999; lists sort by it, then title |

### 15.1 `GET /api/designations`

`include_archived=true` includes archived designations.
**200 OK** — `{ "designations": [DesignationSummaryDto, ...] }`

### 15.2 `POST /api/designations`

Body: `code`, `title`, `category`, `applicable_unit_types`,
`single_holder_per_unit` (boolean) and `display_order` (integer), all required.
**201 Created** — `{ "designation": DesignationSummaryDto }`

### 15.3 `GET /api/designations/:designationId`

**200 OK** — `{ "designation": DesignationSummaryDto }`

### 15.4 `PATCH /api/designations/:designationId`

Any create field except `code`. Removing a unit type that people hold the
designation in, or switching on `single_holder_per_unit` while a unit has
several holders, is refused.

### 15.5 `POST …/archive` and `POST …/restore`

Archived designations cannot be newly assigned; existing assignments stay.

### 15.6 `DELETE /api/designations/:designationId`

Allowed only when nobody holds the designation. **204 No Content**.

**Errors (all of §15)**

| Status | `code` | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Malformed field; `details.field` names it |
| `404` | `DESIGNATION_NOT_FOUND` | Unknown `designationId` |
| `409` | `DESIGNATION_CODE_TAKEN` / `DESIGNATION_TITLE_TAKEN` | Duplicate code / title |
| `409` | `DESIGNATION_UNIT_TYPE_IN_USE` | `details.unit_type`, `details.holder_count` |
| `409` | `DESIGNATION_SINGLE_HOLDER_VIOLATED` | `details.organisational_unit_ids` with more than one holder |
| `409` | `DESIGNATION_IN_USE` | Delete blocked; `details.holder_count` |

---

## 16. User affiliation endpoints

`src/routes/user-affiliation.route.ts`. A user may be a member of any number of
units, and may hold designations only within units they are a member of.
A member of a department must also be an explicit member of the department's
faculty. Membership of a faculty-level division implies affiliation with its
faculty without storing it. Both are reported as *effective faculties*.

`UserAffiliationsDto`:

```json
{
  "memberships": [
    {
      "organisational_unit": { "id": "…", "code": "CSE", "name": "…", "unit_type": "department", "is_archived": false, "parent": { "…": "…" }, "description": null, "archived_at": null, "created_at": "…", "updated_at": "…" },
      "designations": [
        { "id": "…", "code": "head_of_department", "title": "Head of Department", "category": "leadership", "display_order": 70, "is_archived": false }
      ],
      "assigned_at": "2026-11-11T06:57:13.000Z"
    }
  ],
  "effective_faculties": [
    { "id": "…", "code": "FOE", "name": "Faculty of Engineering", "unit_type": "faculty", "is_archived": false }
  ]
}
```

### 16.1 `GET /api/users/:userId/affiliations`

`user:manage`. **200 OK** — `{ "affiliations": UserAffiliationsDto }`

### 16.2 `PUT /api/users/:userId/affiliations`

`user:manage`. The body is the **complete** desired state; an empty list removes
every affiliation. Unchanged rows keep their original `assigned_at`.

```json
{
  "memberships": [
    { "organisational_unit_id": "…", "designation_ids": ["…", "…"] }
  ]
}
```

Rules: units unique; designation ids unique per unit; at most 50 memberships and
10 designations per membership; every department membership needs a membership of
that department's faculty in the same request; new memberships need an active unit; new
assignments need an active designation applicable to the unit type; a
single-holder designation already held by someone else in that unit is refused.

**200 OK** — `{ "affiliations": UserAffiliationsDto }`

| Status | `code` | `details` |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Malformed body, e.g. `memberships[0].organisational_unit_id must be a valid UUID` |
| `400` | `USER_AFFILIATIONS_INVALID` | `{ "issues": [{ "code", "organisational_unit_id", "designation_id" }] }`, every breach at once. Issue codes: `DUPLICATE_ORGANISATIONAL_UNIT`, `DUPLICATE_DESIGNATION`, `ORGANISATIONAL_UNIT_NOT_FOUND`, `ORGANISATIONAL_UNIT_ARCHIVED`, `DESIGNATION_NOT_FOUND`, `DESIGNATION_ARCHIVED`, `DESIGNATION_NOT_APPLICABLE`, `FACULTY_MEMBERSHIP_REQUIRED` (on the department whose faculty is missing), `TOO_MANY_MEMBERSHIPS`, `TOO_MANY_DESIGNATIONS` |
| `404` | `USER_NOT_FOUND` | — |
| `409` | `DESIGNATION_HOLDER_CONFLICT` | `{ "conflicts": [{ "designation_id", "organisational_unit_id", "holder": { "id", "full_name", "email" } }] }` |

### 16.3 `GET /api/auth/me/affiliations`

Any signed-in user; always the caller's own affiliations.
**200 OK** — `{ "affiliations": UserAffiliationsDto }`

### 16.4 `GET /api/organisational-units/:unitId/members`

`user:manage` or `organisation:manage`. Members ordered by name, each with the
designations they hold in this unit.

**200 OK** — `{ "members": [{ "user": { "id", "full_name", "email" }, "designations": [DesignationReferenceDto], "assigned_at" }] }`
