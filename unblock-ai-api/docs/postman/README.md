# Postman collection

Two files:

- `unblock-ai.postman_collection.json` — requests across 11 folders, run in order:
  **Health → Auth → Users → Organisation → User affiliations → Workflow Templates → Task requests →
  Approver inbox → Approvals → Transcript → Error cases**.
- `unblock-ai.postman_environment.json` — just `baseUrl`. `loginEmail`, `loginPassword`,
  `authToken`, `secondAuthToken`, `otherUserSessionId`, `logoutToken`, `userId`,
  `facultyId`, `departmentId`, `designationId`, `workflowTemplateId`,
  `draftWorkflowTemplateId`, `templateVersion`, `requesterEmail`, `requesterToken`,
  `selectionMessage`, `sessionId`, `taskId`, `formId`, `formFields`, `draftValues`,
  `formValues`, `advisorName`, `advisorEmail`, `approverEmail`, `approverToken`, `approvalStepId`,
  `approvalUrl` and `approvalToken` live only as **collection** variables (declared on the collection
  itself, visible under the collection's *Variables* tab) so that
  `pm.collectionVariables.set(...)` in each request's test script is never shadowed by an
  empty same-named environment variable — Postman resolves environment variables first,
  so if these also existed in the environment with an empty value, the ids the tests
  capture would never be seen by later requests.

## Auth

### Getting a token

1. Set `USER_DEFAULT_PASSWORD`, `SEED_ADMINISTRATOR_EMAIL` and
   `SEED_ADMINISTRATOR_FULL_NAME` in `.env`.
2. Run `npm run migrate:up`, then `npm run seed:pg:run`. This creates the bootstrap
   administrator, who holds every permission (`workflow:manage`, `task:create`,
   `task:approve`, `user:manage`, `organisation:manage`). Their password is `USER_DEFAULT_PASSWORD`.
   Re-running the seed is safe; it skips an email that is already registered.
3. In the collection's *Variables* tab, set `loginEmail` to that
   `SEED_ADMINISTRATOR_EMAIL` and `loginPassword` to `USER_DEFAULT_PASSWORD`. The
   shipped values (`admin@example.edu` / `12345`) are placeholders.
4. Run **Auth → Login**. Its test script stores the returned token in `{{authToken}}`.

Every request inherits a **collection-level bearer auth** that reads `{{authToken}}`, so
every later request in every folder authenticates with no manual header entry. The
login requests themselves are set to `noauth`.

Tokens are opaque, server-side sessions. They expire `SESSION_TTL_HOURS` after login
(default 12 hours, not extended by use). If requests start returning
`401 AUTHENTICATION_REQUIRED`, run **Login** again.

### Auth folder

| Request | What it does |
| --- | --- |
| **Login** | `POST /auth/login` with `{{loginEmail}}` / `{{loginPassword}}` → `{{authToken}}` |
| **Get current user** | `GET /auth/me` → the user, their permissions, and the current session |
| **Login (second session)** | Logs in again → `{{secondAuthToken}}`, a second concurrent session to experiment on |
| **List sessions** | `GET /auth/sessions` → stores the newest non-current session id in `{{otherUserSessionId}}` |
| **Revoke one session** | `DELETE /auth/sessions/{{otherUserSessionId}}` → `204`; checks that `{{secondAuthToken}}` now gets `401` |
| **Revoke other sessions** | `DELETE /auth/sessions/others` → `{ revoked_count }` (sessions left over from earlier runs). Also signs out any web-app or other browser session of the same user |
| **Logout** | Its pre-request script logs in a throwaway session into `{{logoutToken}}`; the request logs that session out (`204`) and checks the token now gets `401` |

Logout and session revocation take effect immediately. That is why **Logout** never
uses `{{authToken}}`: logging that session out would make every later request in the
run answer `401`. If you log out of `{{authToken}}` by hand, run **Login** again.

### Users folder

Needs `user:manage`, which the seeded administrator has. **Create user** makes a user
with only `task:create` and a `{{$timestamp}}`-based email (so re-runs do not hit
`409 EMAIL_ALREADY_REGISTERED`) and stores its id in `{{userId}}`. **List users** and
**Get user by id** read it back. The new user's password is `USER_DEFAULT_PASSWORD`.

### Permissions

Each route is guarded by a permission rather than a user type:

- `workflow:manage` — every write in Workflow Templates (save draft, generate, rename,
  publish, archive, restore).
- `workflow:manage` **or** `task:create` — `GET /workflow-templates`,
  `GET /workflow-templates/:workflowTemplateId` and the two `…/versions` reads.
- `task:create` — Task requests and Transcript. A user only sees their own selection
  sessions and tasks; another user's task id answers `404`. These folders run as
  `{{requesterEmail}}` through `{{requesterToken}}`, not as the administrator.
- `task:approve` — Approver inbox. It runs as the approver the task is waiting on, through
  `{{approverToken}}`. An approver sees only the steps assigned to them, and never their own
  requests; any other step answers `404 APPROVAL_NOT_FOUND`.
- `user:manage` — Users.
- `organisation:manage` — writes in Organisation.
- Approvals and Health need no session.

A token without the needed permission gets `403 PERMISSION_DENIED`. To exercise that,
log in as the user from **Create user** (their email, `USER_DEFAULT_PASSWORD`) and
override a request's auth to that token from its *Authorization* tab. See
`docs/api/api-documentation.md` §1–§2 for the full route map, §12 for auth and sessions,
and §13 for users.

## Import

1. Postman → **Import** → select both JSON files (or drag them in).
2. Select the **UNBLOCK-AI Local** environment in the top-right environment picker.
3. Confirm `baseUrl` matches your running server (default `http://localhost:3000/api`).

## Required timeout setting

`POST /workflow-templates/generate` and `POST /workflow-templates/:workflowTemplateId/generate`
call the configured LLM provider and can take 10–60 seconds. Before running them (or the
whole collection), raise Postman's
request timeout: **Settings → General → Request timeout in ms** — set it to at least
`90000`. The default timeout will abort these requests as a false failure.

## Prerequisites

- MongoDB is running and reachable at the `MONGODB_URI` the server was started with.
- PostgreSQL is running and reachable at `POSTGRES_URL` — users and sessions live there.
- The server is running (`npm run dev` or `npm run build && npm start`), `npm run
  migrate:up` has been run to create the collections, indexes and tables, and `npm run
  seed:pg:run` has created the administrator you log in as (see *Auth*).
- Sample users are seeded (`SEED_SAMPLE_USERS=true`, then `npm run seed:pg:run`). The Task
  requests folder logs in as `{{requesterEmail}}`, default `u17@u.c` (Kavindu, a student in
  the Department of Information Technology), with `{{loginPassword}}`.
- A **published** template the requester is eligible for and that matches
  `{{selectionMessage}}` exists. The default message asks for overseas leave, so generate and
  publish `src/data/samples/demo-drafts/it_overseas_leave.txt` first (from the web app,
  or by pointing **Generate workflow template** at it). The Workflow Templates folder's own
  workshop template is not offered to Kavindu if its audience excludes his department.
- `MAIL_TRANSPORT=console`, so approval URLs are printed to the API's stdout. Only the
  Approvals folder needs them; the Approver inbox folder works with mail off.

## Running the whole collection

Use the **Collection Runner** (or `newman run unblock-ai.postman_collection.json -e
unblock-ai.postman_environment.json`) and select all 11 folders in their listed order.
Apart from `loginEmail` / `loginPassword` (see *Auth*) and `{{approvalUrl}}` (see
*Approvals folder*), no manual variable entry is required — every token and id
(`authToken`, `requesterToken`, `approverEmail`, `approverToken`, `approvalStepId`, `userId`,
`workflowTemplateId`, `draftWorkflowTemplateId`, `templateVersion`, `sessionId`, `taskId`,
`formId`) is written into a collection variable by a
`pm.test` script in an earlier request and read by a later one.

## Workflow Templates folder

**Generate workflow template** creates a template and its version 1 and stores the id in
`{{workflowTemplateId}}` (and `current_version` in `{{templateVersion}}`). The rest of
the folder renames it and saves a prompt edit (**PATCH**), publishes it, regenerates it
(the template stays published and version 2 goes live at once), reads the version
history, then archives and restores it — restore brings it back as published. **Save draft workflow template** saves a title and
prompt without generating and stores that id in `{{draftWorkflowTemplateId}}`, which the
Error cases folder uses to show `409 WORKFLOW_TEMPLATE_NOT_GENERATED`.

There is no delete endpoint; each run leaves its templates behind. Archive the ones you
no longer want from the web app or with **Archive workflow template**.

## Task requests folder

Runs as the requester (folder-level bearer auth on `{{requesterToken}}`):

1. **Login as requester** → `{{requesterToken}}`.
2. **Get catalogue** — templates the requester may start; no AI.
3. **Start selection session** — sends `{{selectionMessage}}` and expects a `matched` (or
   `start_requested`) assistant message; stores `{{sessionId}}`. One LLM call.
4. **Get selection session** — restores the conversation.
5. **Create task from session** — compiles and starts the task; stores `{{taskId}}`, the
   submittable form in `{{formId}}` and its fields in `{{formFields}}`.
6. **Get task**, **List tasks**, **Get pinned workflow definition**.
7. **Save form draft** — a pre-request script saves only the first editable field.
8. **Submit form** — a pre-request script fills every editable field with a sample for its
   control (text, a 40-day number, dates 40 days apart so later dates follow earlier ones,
   `advisor@example.edu`, `+94 77 123 4567`, the first select option, and a person
   `{ name: {{advisorName}}, email: {{advisorEmail}} }`) into `{{formValues}}`. The person
   defaults to the seeded Ishara Bandara as `U6@U.C`, in mixed case on purpose, so the first
   approval lands in a real approver's inbox and the email normalisation is exercised. Set
   `{{formValues}}` by hand (raw JSON) for specific answers. On success the console prints
   the first approval email.
9. **Submit form again (409)** — `TASK_FORM_ALREADY_SUBMITTED`.

## Approver inbox folder

The signed-in approver path. No email is involved, so this folder works with mail off.
Folder-level bearer auth uses `{{approverToken}}`:

1. **Find current approver** (requester token) — reads `GET /tasks/{{taskId}}` and stores the
   `awaiting_approver` step's assignee email in `{{approverEmail}}`.
2. **Login as approver** — `{{approverEmail}}` with `{{loginPassword}}` → `{{approverToken}}`.
   The approver needs `task:approve`. The seeded Ishara, Dinesh and Sunethra all hold it.
3. **Pending count** — `GET /approver/approvals/summary`, `pending` ≥ 1.
4. **List pending approvals** — finds this task's row and stores its `step_id` in
   `{{approvalStepId}}`.
5. **Open approval** — the same approver view as the emailed page.
6. **Request more information without comment (400)** — `APPROVAL_COMMENT_REQUIRED`.
7. **Approve in the app**, then **Approve again (409)** — `APPROVAL_ALREADY_DECIDED`.
8. **Open approval after deciding** — `decided` set, `allowed_decisions` empty.
9. **List history** — `?decision=approved`; this row has `decided_via: "app"`.
10. **Pending count after deciding**.
11. **Requester has no inbox (403)** (requester token) — `PERMISSION_DENIED`.
12. **Unknown step (404)** — `APPROVAL_NOT_FOUND`.

Re-run the folder to decide each later approval in the app as well: step 1 picks up the next
approver every time.

## Approvals folder

No session. The Approver inbox folder has already decided the first approval, so copy the URL
of the **next** approval email from the API's stdout into the `{{approvalUrl}}` collection
variable (a bare token works too); the folder's pre-request script extracts
`{{approvalToken}}`. Then **Get approver view**, **Request more information without comment
(400)**, **Approve**, **Approve again (409)** and **Get approver view after deciding**. Repeat
paste → view → approve for each approval step until the task completes. The link of a step
already decided in the app opens as decided. To exercise the information request loop, send
`request_more_info` with a comment instead, re-run **Get task** and **Submit form** for the
inserted step, then use the new link.

## Transcript folder

**Download transcript** returns `application/pdf` once the task is completed and
`409 TASK_TRANSCRIPT_UNAVAILABLE` before. **Cancel task** (200, or 409 once finished) and
**Delete task** clean up.

## Error cases folder

One request per error class defined in `src/errors/`, asserting the `{ error, code,
details }` shape produced by `error-handler.middleware.ts`, including three auth cases:
login with an unregistered email (`401 INVALID_CREDENTIALS` — an unregistered email so it
never counts toward any account's lockout), `GET /users` with no token
(`401 AUTHENTICATION_REQUIRED`), and an unknown user id (`404 USER_NOT_FOUND`). The
workflow template cases cover a missing prompt (`400`), an unknown and a non-UUID
`workflowTemplateId` (`404 WORKFLOW_TEMPLATE_NOT_FOUND`, `400`), publishing a draft or an
already-published template (`409`), a selection session already used by a task
(`404 SELECTION_SESSION_NOT_FOUND`), a malformed task create (`400`), a deleted task
(`404 TASK_NOT_FOUND`), a garbage approval token (`404 APPROVAL_LINK_INVALID`), an unknown
decision (`400`), and a prompt that is not a workflow
(`422 WORKFLOW_TEMPLATE_PROMPT_REJECTED` — decided by the model, so it can be flaky). These
requests are expected to fail with their documented status code — that is a passing test, not a bug in the
server.
