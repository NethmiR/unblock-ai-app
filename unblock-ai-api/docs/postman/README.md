# Postman collection

Two files:

- `unblock-ai.postman_collection.json` — requests across 6 folders, run in order:
  **Health → Drafts → Workflows → Selection → Tasks → Error cases**.
- `unblock-ai.postman_environment.json` — just `baseUrl`. `draftId`, `workflowId`,
  `sessionId`, `templateVersion`, `selectionDecision`, `taskId`, and `requirementKey`
  live only as **collection** variables (declared on the collection itself, visible
  under the collection's *Variables* tab) so that `pm.collectionVariables.set(...)` in
  each request's test script is never shadowed by an empty same-named environment
  variable — Postman resolves environment variables first, so if these also existed in
  the environment with an empty value, the ids the tests capture would never be seen by
  later requests.

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
- The server is running (`npm run dev` or `npm run build && npm start`) and `npm run
  init-db` has been run at least once to create indexes.
- At least one workflow template exists with `review_status: "confirmed"` before the
  **Selection** folder can find anything. The **Drafts** and **Workflows** folders each
  create and publish one — run one of them first, or run the whole collection with the
  Collection Runner so the ordering happens automatically.

## Running the whole collection

Use the **Collection Runner** (or `newman run unblock-ai.postman_collection.json -e
unblock-ai.postman_environment.json`) and select all 6 folders in their listed order.
No manual variable entry is required — every id (`draftId`, `workflowId`, `sessionId`,
`templateVersion`, `taskId`) is written into a collection variable by a `pm.test` script
in an earlier request and read by a later one.

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
to be run in a loop until `next` reports `complete: true` — this is the one manual step
in the collection: `Submit next requirement value`'s body is a placeholder
(`"example value"`) that you must edit per requirement, since a `person` requirement
(`source: "actor"`) expects `{ "name": ..., "email": ... }` rather than a scalar.
`Finalize task` will 400 until every required requirement is filled. `Cancel task` is
terminal — only run it against a task you are done with.

## Error cases folder

One request per error class defined in `src/errors/`, asserting the `{ error, code,
details }` shape produced by `error-handler.middleware.ts`. These requests are expected
to fail with their documented status code — that is a passing test, not a bug in the
server.
