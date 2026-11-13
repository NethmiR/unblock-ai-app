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
| 22 | `GET`   | `/api/selection/catalogue`             | Published templates the caller is eligible for, no AI (§6.6) | `task:create` |
| 23 | `POST`  | `/api/selection/sessions`              | Start an assistant conversation with a first message (§6.1) | `task:create` |
| 24 | `GET`   | `/api/selection/sessions/:id`          | Restore a conversation (§6.2) | `task:create` + session owner |
| 25 | `POST`  | `/api/selection/sessions/:id/messages` | Send a follow-up message (§6.3) | `task:create` + session owner |
| 26 | `POST`  | `/api/selection/sessions/:id/choose`   | Pick an offered template manually, no AI (§6.4) | `task:create` + session owner |
| 27 | `DELETE` | `/api/selection/sessions/:id`         | Start over (§6.5) | `task:create` + session owner |
| 28 | `POST`  | `/api/tasks`                           | Create and start a task from a session or the catalogue (§7.1) | `task:create` |
| 29 | `GET`   | `/api/tasks`                           | List the caller's own tasks (§7.2) | `task:create` |
| 30 | `GET`   | `/api/tasks/:id`                       | Get one task with its steps and forms (§7.3) | `task:create` + owner |
| 31 | `GET`   | `/api/tasks/:id/workflow-definition`   | The pinned workflow definition (§7.4) | `task:create` + owner |
| 32 | `PUT`   | `/api/tasks/:id/forms/:formId/draft`   | Save a form draft (§7.5) | `task:create` + owner |
| 33 | `POST`  | `/api/tasks/:id/forms/:formId/submit`  | Submit a form and advance the task (§7.6) | `task:create` + owner |
| 34 | `POST`  | `/api/tasks/:id/cancel`                | Cancel a task in progress (§7.7) | `task:create` + owner |
| 35 | `DELETE` | `/api/tasks/:id`                      | Delete a task (§7.8) | `task:create` + owner |
| 36 | `GET`   | `/api/tasks/:id/transcript`            | Download the transcript PDF of a completed task (§7.9) | `task:create` + owner |
| 37 | `GET`   | `/api/approvals/:token`                | Approver view (§8.1) | none — the approval token IS the auth |
| 38 | `POST`  | `/api/approvals/:token/decision`       | Approve, reject or request more information (§8.2) | none — the approval token IS the auth |
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

> **+ session owner** is checked inside `SelectionService`: a session created by
> another user answers `404 SELECTION_SESSION_NOT_FOUND`, exactly like an expired one.

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
  `409 WORKFLOW_TEMPLATE_NOT_PUBLISHED` from `POST /tasks` (§7.1);
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
| `WORKFLOW_TEMPLATE_NOT_PUBLISHED` | 409 | §7.1 when the matched template is no longer published or has been archived |
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
endpoints that hand a definition to a runtime consumer — §7.4 — put the template's
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

## 6. Selection endpoints (assistant conversation)

`src/routes/selection.route.ts` → `SelectionController` → `SelectionService`.
Every route requires `task:create`. A selection session is **ephemeral and owned**:
it carries `created_by` and `expires_at` (`SELECTION_SESSION_TTL_HOURS`, default 24,
enforced by a Mongo TTL index). A session that is unknown, expired **or owned by
someone else** answers `404 SELECTION_SESSION_NOT_FOUND`. Starting a task from a
session (§7.1) copies its messages into the task and deletes the session.

**Where AI is spent.** Only the selector is an LLM call (`LlmOperation.workflow_selection`).

| Call | Embedding | LLM |
| --- | --- | --- |
| First message (`POST /selection/sessions`) | 1 | 0 if no candidate survives eligibility, otherwise 1 |
| Message after `ambiguous` or `matched` | 0 (frozen candidates) | 1, or 0 once `SELECTION_MAX_ROUNDS` is spent |
| Message after `no_match` | 1 (all requester messages joined) | 0 or 1 |
| `choose`, `catalogue` | 0 | 0 |

**Eligibility runs before the LLM.** Candidates whose
`scope.applies_to.organisational_unit_codes` do not include one of the requester's
units (or a unit's parent), or whose `scope.applies_to.actor_type` does not fit the
requester's designations, are dropped and reported in the `trace`. They are never sent
to the selector. The selector receives the requester's numbered profile facts
(`P1`, `P2`, …) and returns the ids it relied on, which come back as `match.matched_facts`.

### Shared shapes

```jsonc
// SelectionSessionDto
{
  "id": "6734f0c2a1b2c3d4e5f60718",
  "status": "open" | "matched" | "no_match",
  "messages": [ /* SelectionMessageDto, oldest first */ ],
  "expires_at": "2026-11-14T09:00:00.000Z"
}

// requester message
{ "id": "m1", "role": "requester", "text": "I want to take 1 month overseas leave…", "sent_at": "…" }

// assistant message
{
  "id": "m2",
  "role": "assistant",
  "decision": "matched" | "ambiguous" | "no_match" | "manual_choice" | "start_requested",
  "question": null,                 // set only for "ambiguous" (the only LLM free text shown to users)
  "options": [],                    // [{ id, label, workflow_template_id | null }] for "ambiguous" and "manual_choice"
  "match": {                        // set for "matched" and "start_requested", null otherwise
    "overview": { /* WorkflowOverviewDto */ },
    "matched_facts": [ { "id": "P1", "kind": "member_of_unit", "unit": { … }, "parent": { … }, "designation": null } ]
  },
  "trace": [ { "step": "profile_read" | "candidates_retrieved" | "candidates_reused" | "excluded_by_audience" | "excluded_by_requester_type" | "selector_consulted" | "selector_not_needed" | "round_limit_reached", "count": 2, "workflow_template_titles": ["…"] } ],
  "sent_at": "…"
}

// WorkflowOverviewDto — deterministic, no LLM
{
  "workflow_template_id": "uuid",
  "title": "Overseas Leave – Faculty of IT",
  "one_liner": "…",
  "description": "…",
  "steps": [ { "id": "hod_approval", "name": "Head of Department approval", "kind": "approval",
               "assignee": { "source": "directory", "label": "Head of Department" }, "is_conditional": false } ],
  "information_needed": ["Destination", "Departure date", "…"],
  "requires_approver_details": true
}
```

The API never sends assistant wording. The web app composes every sentence from
`decision`, `trace` and `match`. `assignee.source` is `directory` (label = designation
title), `requester_supplied` (label = title-cased role), `requester` or `system` (label `null`).

### 6.1 `POST /api/selection/sessions`

Body `{ "message": string }` (trimmed, 1–1000 characters). Reads the requester profile,
embeds the message once, filters by eligibility and consults the selector.
**201** `SelectionSessionDto` with one requester and one assistant message.

### 6.2 `GET /api/selection/sessions/:id`

**200** `SelectionSessionDto`. Used to restore the chat after a refresh.

### 6.3 `POST /api/selection/sessions/:id/messages`

Body `{ "message": string }`. A clarification answer, a refinement, or a confirmation
such as "Start the task" (which the selector answers with `start_requested`; the web app
then calls §7.1). **200** `SelectionSessionDto`.
`409 SELECTION_SESSION_LIMIT_REACHED` once the session holds 20 messages — start over.

### 6.4 `POST /api/selection/sessions/:id/choose`

Body `{ "workflow_template_id": uuid }`. Picks one of the session's eligible candidates
(manual choice). No LLM call. **200** `SelectionSessionDto` ending in a `matched` message.
`400 SELECTION_OPTION_NOT_OFFERED` for a template that is not an eligible candidate.

### 6.5 `DELETE /api/selection/sessions/:id`

**Start over.** **204**.

### 6.6 `GET /api/selection/catalogue`

**200** `{ "workflow_templates": WorkflowOverviewDto[] }` — every published, non-archived
template the caller is eligible for. No embedding and no LLM call. Backs the web
**See what Unblock can do** drawer, which starts tasks with `source: "catalogue"`.

### 6.7 Error codes

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Missing, blank or over-long `message`; malformed `workflow_template_id` |
| `SELECTION_OPTION_NOT_OFFERED` | 400 | §6.4 with a template the session did not offer |
| `SELECTION_SESSION_NOT_FOUND` | 404 | Unknown, expired or not owned by the caller |
| `SELECTION_SESSION_LIMIT_REACHED` | 409 | 20 messages reached |
| `SELECTION_FAILED` | 502 | The selector call failed or returned an invalid shape |
| `EMBEDDING_ERROR` | 502 | The embedding provider failed |

---

## 7. Task endpoints (task plan and forms)

`src/routes/task.route.ts` → `TaskController` / `TaskFormController` → `TaskService`,
`TaskFormService`, `TaskPlanService`, `TaskEngineService` (pure) and
`TaskEffectExecutorService`. Every route requires `task:create`; every `/tasks/:id*`
route also runs the ownership guard, so another user's task is a `404 TASK_NOT_FOUND`.

**Model.** Creating a task compiles a complete plan from the version-pinned workflow
definition: ordered steps, one stored form per form step, approvers resolved from the
directory, and requester details prefilled and locked. Nothing after creation calls an
LLM. Writes use an optimistic `revision`; a lost race is `409 TASK_REVISION_CONFLICT`
(refetch and retry).

| Concept | Values |
| --- | --- |
| Task `status` | `in_progress`, `completed`, `rejected`, `cancelled` |
| Step `kind` | `form`, `approval`, `information_request`, `notification`, `automated_action` |
| Step `origin` | `workflow`, `entry_form` (synthesised first form), `information_request`, `approval_repeat` |
| Step `status` | `upcoming`, `awaiting_requester`, `awaiting_approver`, `completed`, `skipped`, `cancelled` |
| Step `outcome` | `completed`, `approved`, `rejected`, `request_more_info`, `skipped` |
| Assignee `source` | `directory`, `requester_choice` (select field), `requester_supplied` (person field), `requester`, `system` |

**Field ids** are namespace paths: `inputs.<input_id>`, `requester.<attribute>`,
`assignees.<step_id>`, `responses.<step_id>`. Form ids are `<step_id>__form`.

### Shared shapes

```jsonc
// TaskDto
{
  "id": "6734f…",
  "reference": "TASK-2026-00123",
  "title": "Overseas Leave – Faculty of IT",
  "status": "in_progress",
  "creation_source": "selection_session" | "catalogue",
  "workflow_template_id": "uuid",
  "workflow_template_version": 3,
  "requester": { "full_name": "…", "email": "…", "units": [ { "code": "IT", "name": "…", "unit_type": "department", "parent_name": "…", "designation_titles": ["Student"] } ] },
  "conversation": [ { "role": "requester" | "assistant", "text": "…", "sent_at": "…" } ],
  "steps": [ {
    "id": "entry_form", "position": 1, "kind": "form", "origin": "entry_form",
    "name": "Your request", "description": null,
    "status": "awaiting_requester", "outcome": null, "is_conditional": false,
    "form_id": "entry_form__form",
    "assignee": { "source": "requester", "full_name": "…", "email": "…", "designation_title": null, "organisational_unit_name": null, "note": null },
    "approval": null,               // { decision, comment, decided_at, notified_at } on approval steps
    "information_request": null,    // { requested_by_step_id, question } on inserted steps
    "activated_at": "…", "completed_at": null
  } ],
  "forms": [ {
    "id": "entry_form__form", "step_id": "entry_form", "title": "Your request", "status": "draft" | "submitted",
    "sections": [ { "id": "…", "kind": "requester_details" | "request_details" | "approver_details" | "information_response", "title": "Your details",
      "fields": [ { "id": "requester.full_name", "label": "Full name", "description": null,
        "control": "text" | "textarea" | "number" | "date" | "datetime" | "email" | "phone" | "switch" | "select" | "person",
        "width": "half" | "full", "required": true, "locked": true,
        "value_source": "requester" | "requester_profile" | "directory",
        "validation": null, "options": [], "value": "Kavindu Jayawardena" } ] } ],
    "saved_at": null, "submitted_at": null,
    "editable": true,       // not submitted and the task is not terminal
    "submittable": true     // editable and the step is awaiting_requester
  } ],
  "unsupported_inputs": [ { "input_id": "invitation_letter", "label": "Invitation letter" } ],
  "progress": { "completed": 0, "total": 4, "current_step_ids": ["entry_form"] },
  "available_actions": { "can_cancel": true, "can_delete": true, "can_download_transcript": false },
  "created_at": "…", "updated_at": "…", "completed_at": null
}
```

No requester DTO contains an approval token or its hash. `progress.total` counts steps
that are neither `skipped` nor `cancelled`. `file` inputs are not collected online; they
are listed in `unsupported_inputs`.

### 7.1 `POST /api/tasks`

Body, one of:

```json
{ "source": "selection_session", "selection_session_id": "6734f0c2a1b2c3d4e5f60718" }
{ "source": "catalogue", "workflow_template_id": "0b9f…uuid" }
```

Re-checks eligibility, resolves every assignee from the directory, compiles the plan,
starts the engine (usually activating the entry form) and deletes the selection session.
**201** `TaskDto`.
Errors: `SELECTION_SESSION_NOT_FOUND` (404), `SELECTION_SESSION_NOT_MATCHED` (409),
`WORKFLOW_TEMPLATE_NOT_ELIGIBLE` (403), `WORKFLOW_TEMPLATE_NOT_PUBLISHED` (409, catalogue source).

### 7.2 `GET /api/tasks`

Query: `status?` (a task status), `search?` (reference or title, ≤ 200 characters),
`limit?` (1–100, default 20), `offset?` (≥ 0). The caller's own tasks, most recently
updated first. **200**:

```json
{
  "tasks": [ { "id": "…", "reference": "…", "title": "…", "status": "in_progress",
    "current_steps": [ { "id": "hod_approval", "name": "Head of Department approval", "status": "awaiting_approver" } ],
    "progress": { "completed": 1, "total": 4, "current_step_ids": ["hod_approval"] },
    "created_at": "…", "updated_at": "…" } ],
  "page": { "total": 1, "limit": 20, "offset": 0 }
}
```

### 7.3 `GET /api/tasks/:id`

**200** `TaskDto`. The web workspace polls it while any step is `awaiting_approver`.

### 7.4 `GET /api/tasks/:id/workflow-definition`

**200** `{ "definition": WorkflowDefinition }` — the version the task is pinned to, for
the plan drawer's flowchart.

### 7.5 `PUT /api/tasks/:id/forms/:formId/draft`

Body `{ "values": { "<field_id>": value | null } }`. Allowed on any unsubmitted form of
a task that is not terminal, **even when its step is still `upcoming`**. Validates the
type and format of each non-empty value and ignores `required`. Locked fields can never
be written. **200** `TaskDto`.

Value shapes: strings for text, email, phone, date (`YYYY-MM-DD`), datetime
(`YYYY-MM-DDTHH:mm`) and select (the chosen option `value`); numbers for number; booleans
for switch; `{ "name", "email" }` for person.

### 7.6 `POST /api/tasks/:id/forms/:formId/submit`

Same body. Merges the values, validates in submit mode (`required` plus cross-field rules
such as `not_before_field`) against the task-wide value map, marks the form submitted and
advances the engine, which may dispatch approval emails. **200** `TaskDto`.

`400 TASK_FORM_INVALID` carries the field issues:

```json
{
  "error": "Some fields need attention",
  "code": "TASK_FORM_INVALID",
  "details": { "issues": [ { "field_id": "inputs.return_date", "code": "before_earliest_date", "limit": "inputs.departure_date" } ] }
}
```

Issue codes: `required`, `unknown_field`, `locked`, `invalid_type`, `invalid_email`,
`invalid_date`, `invalid_phone`, `too_short`, `too_long`, `below_minimum`,
`above_maximum`, `before_earliest_date`, `after_latest_date`, `pattern_mismatch`,
`not_an_option`.

### 7.7 `POST /api/tasks/:id/cancel`

Cancels open steps and revokes every outstanding approval link. **200** `TaskDto`.
`409 TASK_NOT_ACTIVE` on a terminal task.

### 7.8 `DELETE /api/tasks/:id`

**204**. `409 TASK_NOT_DELETABLE` while the task is in progress with a dispatched
approval — cancel it first. The deletion is written to the audit log.

### 7.9 `GET /api/tasks/:id/transcript`

Renders the transcript PDF on demand from the task and its pinned definition; it is never
stored. **200** `application/pdf` with `Content-Disposition: attachment`.
`409 TASK_TRANSCRIPT_UNAVAILABLE` unless the task is `completed` and rendering is enabled
(`DOCUMENT_ENABLED`). The same render is attached to the completion email when
`DOCUMENT_ATTACH_TO_EMAIL` is on.

The transcript holds the header, requester details, the requester's conversation messages,
every submitted form section in step order, information request questions and answers,
the approval trail (step, approver, designation, decision, comment, time), skipped steps
marked "Not required", and computed values.

### 7.10 Error codes

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Malformed body, query or id |
| `TASK_FORM_INVALID` | 400 | Field issues (`details.issues`) |
| `WORKFLOW_TEMPLATE_NOT_ELIGIBLE` | 403 | The requester is outside the template's audience or requester type |
| `TASK_NOT_FOUND` | 404 | Unknown task, or not owned by the caller |
| `TASK_FORM_NOT_FOUND` | 404 | Unknown form id on the task |
| `SELECTION_SESSION_NOT_FOUND` | 404 | §7.1 with an unknown, expired or foreign session |
| `TASK_NOT_ACTIVE` | 409 | A mutation on a terminal task |
| `TASK_NOT_DELETABLE` | 409 | Delete while an approval is in progress |
| `TASK_REVISION_CONFLICT` | 409 | Optimistic concurrency loss |
| `TASK_FORM_ALREADY_SUBMITTED` | 409 | Draft or submit on a submitted form |
| `TASK_FORM_NOT_AWAITING_INPUT` | 409 | Submit while the form's step is not `awaiting_requester` |
| `SELECTION_SESSION_NOT_MATCHED` | 409 | §7.1 from a session without a matched template |
| `TASK_TRANSCRIPT_UNAVAILABLE` | 409 | Transcript for a task that is not completed, or rendering is off |

---

## 8. Approval endpoints (approver decision path)

`src/routes/approval.route.ts` → `ApprovalController` → `ApprovalService`. **No session.**
The token in the emailed link is the credential. Only `sha256(token)` is stored on the step;
the raw token exists only in the email. Tokens expire after `APPROVAL_TOKEN_TTL_DAYS` and are
invalidated on decision and on cancel.

The approval email links to the web page `${APP_PUBLIC_URL}/approvals/<token>`, which calls
these routes. With `MAIL_TRANSPORT=console` the whole email, including that URL, is printed to
the API's stdout.

### 8.1 `GET /api/approvals/:token`

**200** `ApproverViewDto`:

```jsonc
{
  "task": { "reference": "…", "title": "…", "submitted_at": "…", "requester": { /* RequesterSnapshotDto */ } },
  "step": { "id": "advisor_approval", "name": "Academic advisor approval", "description": null,
            "instructions_to_approver": "Confirm the research visit…", "is_repeat": false },
  "approver": { /* TaskAssigneeDto */ },
  "sections": [ { "title": "Request details", "fields": [ { "label": "Destination", "value": "Japan" } ] } ],
  "computed": [ { "label": "Leave duration (days)", "value": "40" } ],
  "information_exchanges": [ { "asked_by": "…", "question": "…", "answer": "…", "asked_at": "…", "answered_at": "…" } ],
  "history": [ { "step_name": "…", "actor_name": "…", "decision": "approved", "outcome": "approved", "comment": null, "at": "…" } ],
  "plan": [ { "name": "…", "kind": "approval", "status": "awaiting_approver", "assignee": { … }, "is_current": true } ],
  "allowed_decisions": ["approved", "rejected", "request_more_info"],
  "comment_required_decisions": ["rejected", "request_more_info"],
  "decided": null                 // { decision, comment, decided_at } once decided
}
```

A decided link keeps working for this route: it returns `decided` and an empty
`allowed_decisions`. `request_more_info` is left out of `allowed_decisions` when the step's
definition does not offer it or after `TASK_MAX_INFORMATION_REQUESTS_PER_STEP` requests.

### 8.2 `POST /api/approvals/:token/decision`

Body `{ "decision": "approved" | "rejected" | "request_more_info", "comment": string | null }`.
The comment is required for `rejected` and `request_more_info` and at most 2000 characters.

- `approved` advances the task, dispatching the next approvals or completing it (the
  requester is emailed the transcript).
- `rejected` ends the task as `rejected`, cancels open steps and revokes the other links.
- `request_more_info` completes this approval with that outcome, inserts an
  `information_request` step for the requester (one required text-area field labelled with
  your comment) and a repeat of the same approval after it. The requester is emailed; once
  they answer, a fresh link is sent to the same approver.

**200** `{ "decision": "approved", "task_status": "in_progress", "next_step_name": "Head of Department approval" }`.

### 8.3 Error codes

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Unknown `decision`, or a comment over 2000 characters |
| `APPROVAL_COMMENT_REQUIRED` | 400 | No comment on `rejected` or `request_more_info` |
| `APPROVAL_DECISION_NOT_ALLOWED` | 400 | A decision the step does not offer, including `request_more_info` past the cap |
| `APPROVAL_LINK_INVALID` | 404 | Bad signature, unknown hash, the step no longer holds that token, or the task was cancelled |
| `APPROVAL_ALREADY_DECIDED` | 409 | §8.2 on a step that already has a decision |
| `APPROVAL_LINK_EXPIRED` | 410 | `token_expires_at` has passed |

---

## 9. Error responses

All errors are JSON. `src/middlewares/error-handler.middleware.ts` reads the
status and body straight off any `BaseError` subclass (see
[../architecture/error-handling.md](../architecture/error-handling.md) for the full
hierarchy) instead of maintaining a separate status lookup table:

| Status | Shape | Raised by |
| ------ | ----- | --------- |
| `400`  | `{ "error", "code": "VALIDATION_ERROR" \| "TASK_FORM_INVALID" \| "SELECTION_OPTION_NOT_OFFERED" \| "APPROVAL_*", "details" }` | `ValidationError` — per-route body checks, form field issues (§7.6), decisions (§8.3) |
| `401`  | `{ "error", "code": "AUTHENTICATION_REQUIRED" \| "INVALID_CREDENTIALS", "details": null }` | `UnauthorizedError` — no usable session on a guarded route (§1), or a bad login (§12.1) |
| `403`  | `{ "error", "code": "PERMISSION_DENIED" \| "ACCOUNT_LOCKED" \| "ACCOUNT_DISABLED" \| "WORKFLOW_TEMPLATE_NOT_ELIGIBLE", "details": null }` | `ForbiddenError` — missing permission, a refused login (§12.1), or a template outside the requester's audience (§7.1) |
| `404`  | `{ "error", "code": "NOT_FOUND" \| "WORKFLOW_TEMPLATE_*_NOT_FOUND" \| "SELECTION_SESSION_NOT_FOUND" \| "TASK_NOT_FOUND" \| "TASK_FORM_NOT_FOUND" \| "APPROVAL_LINK_INVALID" \| "USER_NOT_FOUND" \| "USER_SESSION_NOT_FOUND", "details" }` | `NotFoundError` |
| `409`  | `{ "error", "code": "CONFLICT" \| "WORKFLOW_TEMPLATE_*" \| "SELECTION_SESSION_*" \| "TASK_*" \| "APPROVAL_ALREADY_DECIDED" \| "EMAIL_ALREADY_REGISTERED", "details" }` | `ConflictError` — lifecycle rules (§4.12, §6.7, §7.10, §8.3), duplicate email (§13.1) |
| `410`  | `{ "error", "code": "APPROVAL_LINK_EXPIRED", "details": null }` | `GoneError` — an expired approval link (§8) |
| `422`  | `{ "error", "code": "WORKFLOW_TEMPLATE_GENERATION_FAILED" \| "WORKFLOW_TEMPLATE_PROMPT_REJECTED", "details": <errors\|null> }` | `WorkflowTemplateGenerationError` only — the model could not produce a valid workflow template (§4.3, §4.6) |
| `500`  | `{ "error": "Internal server error", "code": "INTERNAL_ERROR", "details": null }` | Anything untyped — details are logged, never returned |
| `502`  | `{ "error", "code": "SELECTION_FAILED" \| "EMBEDDING_ERROR", "details": <cause\|null> }` | The selector or the embedding provider failed |

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

### 9.1 Malformed ObjectId parameters

`/tasks/:id*` routes validate the id in the ownership guard before any lookup, so a
malformed task id returns `400` with `{ "error": "'<id>' is not a valid id", "code": "VALIDATION_ERROR" }`.
`/selection/sessions/:id*` routes treat a malformed id like an unknown one: `404
SELECTION_SESSION_NOT_FOUND`. `/approvals/:token*` never parses an ObjectId — a bad token
is a clean `404 APPROVAL_LINK_INVALID`. Workflow template routes take a UUID, validated
before any lookup (§4.4).

---

## 10. Suggested Postman test order

Run these folders in sequence — later calls depend on ids produced by earlier ones.
The runnable collection at [../postman/](../postman/) automates this order with
`pm.test` scripts that write the ids into collection variables, so a Collection Runner
pass needs manual input only for the approval link (pasted from the console mailer).

| Folder | Call | Capture |
| --- | ---- | ------- |
| Health | `GET /health` | confirm `status: "ok"` |
| Auth | `POST /auth/login` with `{{loginEmail}}` / `{{loginPassword}}` (the seeded administrator, §12.1) | `token` → `{{authToken}}` |
| Auth | the remaining session calls (§12) | see the collection |
| Users | `POST /users`, `GET /users`, `GET /users/{{userId}}` | `user.id` → `{{userId}}` |
| Workflow Templates | `POST /workflow-templates/generate` with a demo prompt from `src/data/samples/demo-drafts/`, then `…/publish` | `{{workflowTemplateId}}`; `status: "published"` (slow) |
| Task requests | `POST /auth/login` as the requester (`{{requesterEmail}}`, default the seeded Kavindu, `u17@u.c`) | `token` → `{{requesterToken}}`; every Task requests call sends it |
| Task requests | `GET /selection/catalogue` | the templates Kavindu may start |
| Task requests | `POST /selection/sessions` with an overseas-leave request | `id` → `{{sessionId}}`; expect a `matched` assistant message |
| Task requests | `GET /selection/sessions/{{sessionId}}` | the same conversation |
| Task requests | `POST /tasks` with `{ source: "selection_session", selection_session_id: {{sessionId}} }` | `id` → `{{taskId}}`; the entry form's id → `{{formId}}` |
| Task requests | `PUT /tasks/{{taskId}}/forms/{{formId}}/draft` with some values | `saved_at` set, `status: "draft"` |
| Task requests | `POST /tasks/{{taskId}}/forms/{{formId}}/submit` with every required value | the next step is `awaiting_approver`; the console prints the approval URL |
| Task requests | `GET /tasks` and `GET /tasks/{{taskId}}/workflow-definition` | the task in the list; the pinned definition |
| Approvals | paste the console URL (or the token) into `{{approvalUrl}}` | a pre-request script extracts `{{approvalToken}}` |
| Approvals | `GET /approvals/{{approvalToken}}` | `allowed_decisions`, `decided: null` |
| Approvals | `POST /approvals/{{approvalToken}}/decision` with `request_more_info` and no comment | `400 APPROVAL_COMMENT_REQUIRED` |
| Approvals | `POST /approvals/{{approvalToken}}/decision` with `approved` | `task_status`, `next_step_name`; repeat paste → get → decide for each approval |
| Approvals | the same decision again | `409 APPROVAL_ALREADY_DECIDED` |
| Transcript | `GET /tasks/{{taskId}}/transcript` (requester token) | `200 application/pdf` once the task is `completed`; `409` before |
| Task requests | `POST /tasks/{{taskId}}/cancel` on a scratch task, then `DELETE /tasks/{{taskId}}` | `status: "cancelled"`; `204` |
| Error cases | one request per error class | asserts `{ error, code, details }` |

The administrator token drives the admin folders; the requester token drives everything
from Task requests on, because tasks are visible only to the user who created them (§7)
and selection depends on the caller's affiliations. Sample users' password is
`USER_DEFAULT_PASSWORD`.

**Do not log out of `{{authToken}}` mid-run.** Logout really revokes the session, so
every later admin request would answer `401`. The collection's Logout request logs in a
throwaway session first and logs that one out instead.

**Postman scripting** — the collection uses `pm.collectionVariables.set(...)` in each
request's *Tests* tab, so the chain works with or without an environment selected. For
example, `POST /tasks`:

```javascript
var json = pm.response.json();
pm.collectionVariables.set("taskId", json.id);
var form = json.forms.find(function (f) { return f.submittable; }) || json.forms[0];
if (form) pm.collectionVariables.set("formId", form.id);
```

and the approval token, extracted from whatever you pasted:

```javascript
var pasted = pm.collectionVariables.get("approvalUrl") || "";
pm.collectionVariables.set("approvalToken", decodeURIComponent(pasted.split("/approvals/").pop().trim()));
```

---

## 11. Things worth knowing before you test

- **LLM routes are slow, and only two exist.** Template generation (§4.3, §4.6) and
  selection (§6.1, §6.3). Task creation, forms, approvals and transcripts never call an
  LLM. Each call logs one `llm completion usage` line with its `operation`
  (`workflow_template_generation` or `workflow_selection`).
- **Nothing is selectable until it is published**, and only to eligible requesters.
  Retrieval considers templates with `status: "published"` and no `archived_at`, then drops
  those whose audience or requester type excludes the caller (§6).
- **Selection depends on who you are.** Log in as a sample user with affiliations (for
  example `u17@u.c`, a student in the Department of Information Technology). The
  administrator has no affiliations, so audience-scoped templates are not offered to them.
- **Generating always makes a new version.** Versions are never edited in place. On a
  published template the new version goes live immediately. Tasks keep the version they
  were started with.
- **Definitions cannot be hand-edited through the API.** Change the prompt and
  regenerate. Complete example definitions live in `src/data/samples/expected/`.
- **A task starts the moment it is created.** Its first active step is usually the entry
  form. There is no separate finalize or start call.
- **Drafts any time, submit when active.** A later step's form can be drafted early; its
  submit answers `409 TASK_FORM_NOT_AWAITING_INPUT` until the step is reached.
- **Approval links live in the console log, not the API response.** With
  `MAIL_TRANSPORT=console` the mailer prints the subject, recipient and full approval URL
  to stdout.
- **Expired is 410, reused is 409, unknown is 404.** `GET /approvals/:token` keeps working
  on a decided link and returns `decided`. Set `APPROVAL_TOKEN_TTL_DAYS=0` (and restart) to
  see a 410.
- **More information inserts steps.** `request_more_info` adds an `information_request`
  step and a repeat approval to `steps`; the requester answers through the inserted step's
  form (§7.6). Capped at `TASK_MAX_INFORMATION_REQUESTS_PER_STEP` (default 3) per approval.
- **The transcript PDF is rendered on demand, never stored** (§7.9).
- **To wipe test data**, drop it directly in MongoDB (collections `workflow_templates`,
  `workflow_template_versions`, `selection_sessions`, `tasks`). Sessions also expire on
  their own. `legacy_tasks` holds pre-revamp tasks and is never read.

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
