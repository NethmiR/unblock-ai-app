# Configuration

Every environment variable the app reads, in the order listed in `.example.env`. All
of them are read exactly once, in `src/config/env.config.ts` (the only file in the
repo permitted to reference `process.env`), and validated by the domain-specific
config module that owns them. `src/config/index.config.ts` composes the domain
configs into a single frozen `config` object that every other module imports.

| Variable | Required | Default | Owning module | Consumed by |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `src/config/server.config.ts` | `config.server.nodeEnv` |
| `PORT` | no | `3000` | `src/config/server.config.ts` | `config.server.port` — HTTP listen port |
| `CORS_ORIGIN` | no | `http://localhost:3001` | `src/config/server.config.ts` | `config.server.corsOrigins` (comma-separated) — `src/middlewares/cors.middleware.ts`; ignored when `NODE_ENV=development`, which allows any origin |
| `MONGODB_URI` | **yes** | — | `src/config/db.config.ts` | `config.db.uri` — `src/db/mongo.client.ts` |
| `MONGODB_DB` | no | `unblock_ai` | `src/config/db.config.ts` | `config.db.dbName` |
| `POSTGRES_URL` | \*\* | — | `src/config/postgres.config.ts` | `config.postgres.url` — `src/db/postgres.client.ts`; **required when `POSTGRES_REPOSITORY_BACKEND=postgres`** |
| `POSTGRES_POOL_MAX` | no | `10` | `src/config/postgres.config.ts` | `config.postgres.poolMax` — max pooled connections |
| `POSTGRES_CONNECTION_TIMEOUT_MS` | no | `5000` | `src/config/postgres.config.ts` | `config.postgres.connectionTimeoutMs` |
| `POSTGRES_REPOSITORY_BACKEND` | no | `postgres` | `src/config/postgres.config.ts` | `config.postgres.repositoryBackend` — `postgres` \| `memory`, selects the user, user-session and template-deletion repositories at composition root |
| `SEED_ADMINISTRATOR_EMAIL` | seed only | — | `src/config/seed.config.ts` | `loadSeedConfig().administratorEmail` — read only by `npm run seed:pg:run`; never loaded by the server |
| `SEED_ADMINISTRATOR_FULL_NAME` | seed only | — | `src/config/seed.config.ts` | `loadSeedConfig().administratorFullName` — read only by `npm run seed:pg:run` |
| `SESSION_TTL_HOURS` | no | `12` | `src/config/auth.config.ts` | `config.auth.sessionTtlHours` — absolute lifetime of a user session |
| `AUTH_MAX_FAILED_ATTEMPTS` | no | `0` | `src/config/auth.config.ts` | `config.auth.maxFailedAttempts` — failed logins before the account locks; `0` disables lockout (failures are still counted) |
| `AUTH_LOCKOUT_DURATION_MINUTES` | no | `15` | `src/config/auth.config.ts` | `config.auth.lockoutDurationMinutes` — how long a lockout lasts after the last failed attempt |
| `USER_DEFAULT_PASSWORD` | **yes** | — | `src/config/user.config.ts` | `config.user.defaultPassword` — initial password of every created user (`UserService.createUser`); never logged or returned |
| `LLM_PROVIDER` | no | `azure-openai` | `src/config/llm.config.ts` | `config.llm.provider` — `azure-openai` \| `gemini`, selects the `ILlmAdapter` used for every generation task (extraction, retrieval summaries, selection) |
| `AZURE_OPENAI_ENDPOINT` | \*\* | — | `src/config/llm.config.ts` | `config.llm.azureOpenAI.endpoint` — **required when `LLM_PROVIDER=azure-openai`** |
| `AZURE_OPENAI_API_KEY` | \*\* | — | `src/config/llm.config.ts` | `config.llm.azureOpenAI.apiKey` — **required when `LLM_PROVIDER=azure-openai`** |
| `AZURE_OPENAI_API_VERSION` | \*\* | — | `src/config/llm.config.ts` | `config.llm.azureOpenAI.apiVersion` — **required when `LLM_PROVIDER=azure-openai`** |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | \*\* | — | `src/config/llm.config.ts` | `config.llm.azureOpenAI.deployment` — **required when `LLM_PROVIDER=azure-openai`** |
| `GEMINI_API_KEY` | \*\* | — | `src/config/llm.config.ts`, `src/config/embedding.config.ts` | `config.llm.gemini.apiKey` / `config.embedding.gemini.apiKey` — Google AI Studio key; **required when `LLM_PROVIDER` or `EMBEDDING_PROVIDER` is `gemini`** |
| `GEMINI_CHAT_MODEL` | \*\* | — | `src/config/llm.config.ts` | `config.llm.gemini.model` — **required when `LLM_PROVIDER=gemini`** |
| `EXTRACTION_MAX_ATTEMPTS` | no | `3` | `src/config/extraction.config.ts` | `config.extraction.maxAttempts` — extraction repair-loop cap |
| `EMBEDDING_PROVIDER` | no | `azure-openai` | `src/config/embedding.config.ts` | `config.embedding.provider` — `azure-openai` \| `gemini`, selects the `IEmbeddingAdapter`. Changing it (or the embedding model) requires re-embedding every stored template |
| `AZURE_OPENAI_EMBEDDING_ENDPOINT` | \*\* | — | `src/config/embedding.config.ts` | `config.embedding.azureOpenAI.endpoint` — **required when `EMBEDDING_PROVIDER=azure-openai`** |
| `AZURE_OPENAI_EMBEDDING_API_KEY` | \*\* | — | `src/config/embedding.config.ts` | `config.embedding.azureOpenAI.apiKey` — **required when `EMBEDDING_PROVIDER=azure-openai`** |
| `AZURE_OPENAI_EMBEDDING_API_VERSION` | \*\* | — | `src/config/embedding.config.ts` | `config.embedding.azureOpenAI.apiVersion` — **required when `EMBEDDING_PROVIDER=azure-openai`** |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | \*\* | — | `src/config/embedding.config.ts` | `config.embedding.azureOpenAI.deployment` — **required when `EMBEDDING_PROVIDER=azure-openai`** |
| `GEMINI_EMBEDDING_MODEL` | \*\* | — | `src/config/embedding.config.ts` | `config.embedding.gemini.model` — **required when `EMBEDDING_PROVIDER=gemini`** |
| `EMBEDDING_DIMENSIONS` | no | `1536` | `src/config/embedding.config.ts` | `config.embedding.dimensions` — requested from the provider and validated against the returned vector length; must match the vector index |
| `RETRIEVAL_TOP_K` | no | `5` | `src/config/retrieval.config.ts` | `config.retrieval.topK` — max candidates returned by retrieval |
| `RETRIEVAL_ALIAS_BOOST` | no | `0.15` | `src/config/retrieval.config.ts` | `config.retrieval.aliasBoost` — additive score boost for exact alias matches |
| `SELECTION_MAX_ROUNDS` | no | `2` | `src/config/retrieval.config.ts` | `config.retrieval.maxSelectionRounds` — clarifying-question round cap |
| `VECTOR_BACKEND` | no | `memory` | `src/config/retrieval.config.ts` | `config.retrieval.vectorBackend` — selects `InMemoryVectorStore` or `AtlasVectorStore` at composition root |
| `ATLAS_VECTOR_INDEX` | no | `template_vector_index` | `src/config/retrieval.config.ts` | `config.retrieval.atlasIndexName` — only used when `VECTOR_BACKEND=atlas` |
| `MAIL_TRANSPORT` | no | `console` | `src/config/mail.config.ts` | `config.mail.transport` — `console` \| `brevo`, selects `IMailer` at composition root |
| `MAIL_FROM` | no | `Unblock AI <noreply@localhost>` | `src/config/mail.config.ts` | `config.mail.from` — `From` header on outgoing approval mail, parsed into Brevo's `{name, email}` sender shape |
| `BREVO_API_KEY` | \*\* | `""` | `src/config/mail.config.ts` | `config.mail.brevoApiKey` — sent as the `api-key` header to Brevo's transactional email HTTP API (`https://api.brevo.com/v3/smtp/email`); **required when `MAIL_TRANSPORT=brevo`**, throwing `ConfigurationError` at startup |
| `APP_PUBLIC_URL` | no | `http://localhost:3001` | `src/config/mail.config.ts` | `config.mail.appPublicUrl` — base URL used to build `/approvals/:token` links in emails |
| `APPROVAL_TOKEN_SECRET` | \*\* | `""` | `src/config/mail.config.ts` | `config.mail.tokenSecret` — HMAC-SHA256 signing key for approval tokens (`token.util.ts`); **required when `MAIL_TRANSPORT=brevo`**, throwing `ConfigurationError` at startup — an empty dev default is otherwise tolerated |
| `APPROVAL_TOKEN_TTL_DAYS` | no | `14` | `src/config/mail.config.ts` | `config.mail.tokenTtlDays` — approval token lifetime, in days |
| `DOCUMENT_ENABLED` | no | `true` | `src/config/document.config.ts` | `config.document.enabled` — generate a completion-document record at all; `false` reproduces pre-feature behaviour exactly |
| `DOCUMENT_ATTACH_TO_EMAIL` | no | `true` | `src/config/document.config.ts` | `config.document.attachToEmail` — attach the rendered record to the completion email, in addition to the portal download |
| `DOCUMENT_FORMAT` | no | `pdf` | `src/config/document.config.ts` | `config.document.format` — `pdf` \| `text`, selects `IDocumentRenderer` at composition root |
| `DOCUMENT_INSTITUTION_NAME` | no | `Unblock AI` | `src/config/document.config.ts` | `config.document.institutionName` — printed in the record's footer |
| `DOCUMENT_MAX_ATTACHMENT_BYTES` | no | `5000000` | `src/config/document.config.ts` | `config.document.maxAttachmentBytes` — above this size the record is download-only, dropped from the email attachment |

46 variables total (\* = required, throws at startup if missing/empty; \*\* =
conditionally required: `POSTGRES_URL` only when `POSTGRES_REPOSITORY_BACKEND=postgres`;
`APPROVAL_TOKEN_SECRET` and `BREVO_API_KEY` only
when `MAIL_TRANSPORT=brevo` — both throw `ConfigurationError` at startup in that
case, in `src/config/mail.config.ts`. The two `SEED_ADMINISTRATOR_*` variables are
required only by the seed command, which throws if either is empty). A misconfigured Brevo API key that is merely
non-empty but wrong still only surfaces as a send failure, caught and logged by
`notification.service.ts` rather than crashing the process. The `AZURE_OPENAI_*` and
`GEMINI_*` provider variables are likewise conditionally required: only the keys of
the provider selected by `LLM_PROVIDER` / `EMBEDDING_PROVIDER` are validated, in
`src/config/llm.config.ts` and `src/config/embedding.config.ts`.

To switch providers, change `LLM_PROVIDER` and/or `EMBEDDING_PROVIDER` and fill in that
provider's keys — no code changes are needed. Switching the embedding provider (or
embedding model) makes previously stored template vectors incomparable with new query
vectors, so every stored template must be re-embedded before retrieval is reliable.

`KNOWLEDGE_BANK_PATH` was **removed** during the restructure. It was read into
the pre-restructure config but consumed by nothing after the migration to MongoDB —
see [../plans/restructure-implementation-plan.md](../plans/restructure-implementation-plan.md)
§1.2 Problem 5 for the original finding.

## Parsing helpers

`src/utils/shared/env-parse.util.ts` exports five pure functions used by every
config module above; none of them read `process.env` themselves — they take the raw
value as an argument, which is why `env.config.ts` is the only file that touches
`process.env` directly:

- `requireString(name, raw)` — throws `ConfigurationError` if empty/undefined.
- `optionalString(name, raw, fallback)`
- `parseNumber(name, raw, fallback)` — throws if present but non-numeric.
- `parseBoolean(name, raw, fallback)` — throws if present but not `"true"`/`"false"`.
- `parseEnum(name, raw, allowed, fallback)` — throws if present but not one of `allowed`.

`mail.config.ts` adds one check of its own, outside these four helpers: after
building the frozen `mail` object, it throws `ConfigurationError` if
`transport === "smtp"` and `tokenSecret === ""`. A dev default that leaves approval
tokens unsigned is fine; a production SMTP deployment silently doing the same is not.

## Two config files, two purposes

| File | Contains | Git-ignored |
| --- | --- | --- |
| `.env` | Real secrets for the local machine | yes |
| `.example.env` | Every variable above, in the same order, with a placeholder value and a one-line comment | no |

Never put a real secret in `.example.env`.
