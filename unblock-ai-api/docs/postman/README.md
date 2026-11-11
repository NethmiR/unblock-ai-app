# Postman collection

Two files:

- `unblock-ai.postman_collection.json` — requests across 9 folders, run in order:
  **Health → Auth → Users → Drafts → Workflows → Selection → Tasks → Approvals → Error cases**.
- `unblock-ai.postman_environment.json` — just `baseUrl`. `loginEmail`, `loginPassword`,
  `authToken`, `secondAuthToken`, `otherUserSessionId`, `logoutToken`, `userId`, `draftId`,
  `workflowId`, `sessionId`, `templateVersion`, `selectionDecision`, `taskId`,
  `requirementKey`, `requirementType`, `requirementLabel`, `requirementValue`, and
  `approvalToken` live only as **collection** variables (declared on the collection
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
   `task:approve`, `user:manage`). Their password is `USER_DEFAULT_PASSWORD`.
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

- `workflow:manage` — Drafts, and every write on Workflows plus the deletion log.
- `workflow:manage` **or** `task:create` — `GET /workflows`, `GET /workflows/:id` and
  `GET /workflows/:id/record`.
- `task:create` — Selection and Tasks. A user only sees their own tasks; another
  user's task id answers `404`.
- `user:manage` — Users.
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

`POST /workflows/extract` and `POST /drafts/:id/extract` call Azure OpenAI and can take
10–60 seconds. Before running either request (or the whole collection), raise Postman's
request timeout: **Settings → General → Request timeout in ms** — set it to at least
`90000`. The default timeout will abort these requests as a false failure.

## Prerequisites

- MongoDB is running and reachable at the `MONGODB_URI` the server was started with.
- PostgreSQL is running and reachable at `POSTGRES_URL` — users and sessions live there.
- The server is running (`npm run dev` or `npm run build && npm start`), `npm run
  migrate:up` has been run to create the collections, indexes and tables, and `npm run
  seed:pg:run` has created the administrator you log in as (see *Auth*).
- At least one workflow template exists with `review_status: "confirmed"` before the
  **Selection** folder can find anything. The **Drafts** and **Workflows** folders each
  create and publish one — run one of them first, or run the whole collection with the
  Collection Runner so the ordering happens automatically.

## Running the whole collection

Use the **Collection Runner** (or `newman run unblock-ai.postman_collection.json -e
unblock-ai.postman_environment.json`) and select all 9 folders in their listed order.
Apart from `loginEmail` / `loginPassword` (see *Auth*), no manual variable entry is
required — every token and id (`authToken`, `userId`, `draftId`, `workflowId`,
`sessionId`, `templateVersion`, `taskId`) is written into a collection variable by a
`pm.test` script in an earlier request and read by a later one.

**`Delete workflow`** (in the Workflows folder) is **not** meant to run as part
of a routine full-collection pass — it permanently deletes `{{workflowId}}`, which every
later folder (Selection, Tasks) depends on. Leave it unchecked in the Collection Runner
and only run it by hand, against a scratch template you created for that purpose.

Two requests carry conditional logic in a pre-request script and call
`postman.setNextRequest(...)` to skip a step that does not apply to the current session:

- **Answer clarifying question (round 2+)** only runs if `Start session (round 1)`
  returned `decision: "ambiguous"`; otherwise it jumps to `Choose workflow manually`.
- **Choose workflow manually** only meaningfully runs if the decision was
  `"manual_choice"`; otherwise it jumps to `Get matched workflow document`.

Each pass of the **Selection** folder therefore takes a different path through those two
requests depending on what the Selector Agent decided — this is expected, not a failure.

## Tasks folder

Chains `sessionId` (from the **Selection** folder) into `POST /tasks`, then walks the
requirement list. `Get next requirement` and `Submit next requirement value` are meant
to be run in a loop until `next` reports `complete: true`.

The loop is **type-aware**, so it no longer needs hand-editing per requirement.
`POST /tasks/:id/values` coerces strictly by the requirement's `type`, and a single
`"example value"` string is rejected with a 400 by every non-string type — including
`requester_email`, the `type: "email"` input that every workflow now declares. So:

- `Get next requirement` stores `requirement.key` **and** `requirement.type` into
  `{{requirementKey}}` / `{{requirementType}}`.
- `Submit next requirement value` reads that type in a **pre-request** script and builds
  a matching sample into `{{requirementValue}}` — `jane.doe@example.com` for `email`,
  `{ "name": ..., "email": ... }` for a `person` (`source: "actor"`) requirement, `42`
  for `number`, `true` for `boolean`, a date 30 days out for `date`/`datetime`, and
  `"example value"` for the string-ish types.

The body interpolates that variable **unquoted** (`"value": {{requirementValue}}`) so
numbers, booleans, and objects arrive as their real JSON types rather than as strings.
To send a specific answer instead of a placeholder, set `{{requirementValue}}` yourself
as raw JSON (quote it if it is a string) or just edit the body directly.

`Finalize task` will 400 until every required requirement is filled. `Cancel task` is
terminal — only run it against a task you are done with.

## Error cases folder

One request per error class defined in `src/errors/`, asserting the `{ error, code,
details }` shape produced by `error-handler.middleware.ts`, including three auth cases:
login with an unregistered email (`401 INVALID_CREDENTIALS` — an unregistered email so it
never counts toward any account's lockout), `GET /users` with no token
(`401 AUTHENTICATION_REQUIRED`), and an unknown user id (`404 USER_NOT_FOUND`). These
requests are expected to fail with their documented status code — that is a passing test, not a bug in the
server.
