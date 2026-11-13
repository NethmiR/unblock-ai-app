# Error Handling

## The `BaseError` contract

`src/errors/base.error.ts` defines an abstract `BaseError extends Error` that every
typed error in the codebase extends:

| Field | Type | Meaning |
| --- | --- | --- |
| `statusCode` | `number` (abstract) | The HTTP status the error handler responds with. Each subclass sets its own. |
| `code` | `string` | A stable machine-readable identifier, e.g. `NOT_FOUND`. Defaults to the class name in `SCREAMING_SNAKE_CASE` (with a trailing `Error` stripped) unless overridden via the constructor options. |
| `details` | `unknown` | Optional extra context (e.g. a list of validation messages). `null` in the JSON body when absent. |
| `isOperational` | `boolean` | `true` for expected, handled failures; `false` for `ConfigurationError`, which represents a startup misconfiguration rather than a normal request-time failure. |
| `cause` | `unknown` (inherited from `Error`) | Set when the options object passes a `cause`. |

`BaseError#toJSON()` returns `{ error: message, code, details: details ?? null }` —
this is exactly what gets serialized into the HTTP response body.

## Subclasses

| Class | File | Status | `code` | Used for |
| --- | --- | --- | --- | --- |
| `ValidationError` | `src/errors/validation.error.ts` | 400 | `VALIDATION_ERROR` | Malformed or missing request bodies/fields; has `ValidationError.forField()` and `ValidationError.forObject()` factory helpers. |
| `NotFoundError` | `src/errors/not-found.error.ts` | 404 | `NOT_FOUND` | Missing workflow template, template version, selection session, task, form or approval link; has a `NotFoundError.of(resource, id)` factory helper. |
| `ConflictError` | `src/errors/conflict.error.ts` | 409 | `CONFLICT` | A request that is well-formed but conflicts with the current state (e.g. starting a task from a session that hasn't matched, submitting a form twice, a task revision conflict, or publishing a template that is already published). |
| `GoneError` | `src/errors/gone.error.ts` | 410 | `GONE` | A resource that existed but is no longer usable; raised as `APPROVAL_LINK_EXPIRED` for an expired approval link. |
| `WorkflowTemplateGenerationError` | `src/errors/workflow-template-generation.error.ts` | 422 | `WORKFLOW_TEMPLATE_GENERATION_FAILED` | Workflow template generation failed after all repair attempts (`details` lists the last validation errors). Raised with code `WORKFLOW_TEMPLATE_PROMPT_REJECTED` when the model flags the prompt as not describing a workflow (`details` lists the model's `metadata.ambiguities`). |
| `SelectionError` | `src/errors/selection.error.ts` | 502 | `SELECTION_ERROR` | The selector LLM call failed or returned an invalid shape; raised with code `SELECTION_FAILED` by `selection-session.error.ts`. |
| `EmbeddingError` | `src/errors/embedding.error.ts` | 502 | `EMBEDDING_ERROR` | The Azure embeddings call failed, or returned an unexpected dimension. |
| `DatabaseError` | `src/errors/database.error.ts` | 500 | `DATABASE_ERROR` | A MongoDB operation failed unexpectedly. |
| `ConfigurationError` | `src/errors/configuration.error.ts` | 500 | `CONFIGURATION_ERROR` | A required environment variable is missing or invalid at startup. `isOperational: false`. |

All of them are re-exported from the barrel `src/errors/index.error.ts` alongside `BaseError`.

Resource-specific errors are built by factory functions rather than new classes. For
example, `src/errors/workflow-template.error.ts` returns `NotFoundError` or
`ConflictError` instances with specific codes (`WORKFLOW_TEMPLATE_NOT_FOUND`,
`WORKFLOW_TEMPLATE_VERSION_NOT_FOUND`, `WORKFLOW_TEMPLATE_ARCHIVED`,
`WORKFLOW_TEMPLATE_NOT_ARCHIVED`, `WORKFLOW_TEMPLATE_NOT_GENERATED`,
`WORKFLOW_TEMPLATE_ALREADY_PUBLISHED`, `WORKFLOW_TEMPLATE_NOT_PUBLISHED`,
`WORKFLOW_TEMPLATE_NOT_ELIGIBLE`), defined in
`src/data/constants/workflow-template-error.constant.ts`. The task request flow follows the
same pattern: `selection-session.error.ts` (`SELECTION_*`), `task.error.ts` (`TASK_*`, with
`TASK_FORM_INVALID` carrying `details.issues`) and `approval.error.ts` (`APPROVAL_*`), with
their codes in `selection-error.constant.ts`, `task-error.constant.ts` and
`approval-error.constant.ts`.

## The error-handling middleware

`src/middlewares/error-handler.middleware.ts` is the last middleware mounted on the
Express app:

1. If `err instanceof BaseError`, it logs at `warn` level (type, code, message, request id) and responds `res.status(err.statusCode).json(err.toJSON())`.
2. Otherwise, it logs the error at `error` level with the full stack and responds `500` with a generic body: `{ "error": "Internal server error", "code": "INTERNAL_ERROR", "details": null }`. The real message and stack are never sent to the client — only logged.

Adding a new error type means adding a new file to `src/errors/`, extending `BaseError`,
and exporting it from `index.error.ts` — the error handler itself never needs to change,
because it reads `statusCode` and `toJSON()` off the error instance rather than
maintaining a status-code lookup table.

All route handlers are wrapped in `src/middlewares/async-handler.middleware.ts` so a
rejected promise from a controller reaches this middleware instead of crashing the
process.

See [../api/api-documentation.md](../api/api-documentation.md) §9 for the error response
shapes, and §6.7, §7.10 and §8.3 for the per-area codes.
