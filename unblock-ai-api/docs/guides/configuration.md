# Configuration

Every environment variable the app reads, in the order listed in `.example.env`. All
of them are read exactly once, in `src/config/env.config.ts` (the only file in the
repo permitted to reference `process.env`), and validated by the domain-specific
config module that owns them. `src/config/index.config.ts` composes the five domain
configs into a single frozen `config` object that every other module imports.

| Variable | Required | Default | Owning module | Consumed by |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `src/config/server.config.ts` | `config.server.nodeEnv` |
| `PORT` | no | `3000` | `src/config/server.config.ts` | `config.server.port` — HTTP listen port |
| `CORS_ORIGIN` | no | `http://localhost:3001` | `src/config/server.config.ts` | `config.server.corsOrigin` — `src/middlewares/cors.middleware.ts` |
| `MONGODB_URI` | **yes** | — | `src/config/db.config.ts` | `config.db.uri` — `src/db/mongo.client.ts` |
| `MONGODB_DB` | no | `unblock_ai` | `src/config/db.config.ts` | `config.db.dbName` |
| `AZURE_OPENAI_ENDPOINT` | **yes** | — | `src/config/azure-openai.config.ts` | `config.azureOpenAI.endpoint` — chat client |
| `AZURE_OPENAI_API_KEY` | **yes** | — | `src/config/azure-openai.config.ts` | `config.azureOpenAI.apiKey` |
| `AZURE_OPENAI_DEPLOYMENT` | **yes** | — | `src/config/azure-openai.config.ts` | `config.azureOpenAI.deployment` — extraction model |
| `AZURE_OPENAI_API_VERSION` | **yes** | — | `src/config/azure-openai.config.ts` | `config.azureOpenAI.apiVersion` |
| `AZURE_SELECTOR_DEPLOYMENT` | no | falls back to `AZURE_OPENAI_DEPLOYMENT` | `src/config/azure-openai.config.ts` | `config.azureOpenAI.selectorDeployment` — selector agent model |
| `EXTRACTION_MAX_ATTEMPTS` | no | `3` | `src/config/azure-openai.config.ts` | `config.azureOpenAI.maxExtractionAttempts` — extraction repair-loop cap |
| `AZURE_EMBEDDING_ENDPOINT` | **yes** | — | `src/config/azure-embedding.config.ts` | `config.azureEmbedding.endpoint` |
| `AZURE_EMBEDDING_API_KEY` | **yes** | — | `src/config/azure-embedding.config.ts` | `config.azureEmbedding.apiKey` |
| `AZURE_EMBEDDING_DEPLOYMENT` | no | `text-embedding-3-small` | `src/config/azure-embedding.config.ts` | `config.azureEmbedding.deployment` |
| `AZURE_EMBEDDING_API_VERSION` | no | `2024-10-21` | `src/config/azure-embedding.config.ts` | `config.azureEmbedding.apiVersion` |
| `AZURE_EMBEDDING_DIM` | no | `1536` | `src/config/azure-embedding.config.ts` | `config.azureEmbedding.dimensions` — validated against the actual returned vector length |
| `RETRIEVAL_TOP_K` | no | `5` | `src/config/retrieval.config.ts` | `config.retrieval.topK` — max candidates returned by retrieval |
| `RETRIEVAL_ALIAS_BOOST` | no | `0.15` | `src/config/retrieval.config.ts` | `config.retrieval.aliasBoost` — additive score boost for exact alias matches |
| `SELECTION_MAX_ROUNDS` | no | `2` | `src/config/retrieval.config.ts` | `config.retrieval.maxSelectionRounds` — clarifying-question round cap |
| `VECTOR_BACKEND` | no | `memory` | `src/config/retrieval.config.ts` | `config.retrieval.vectorBackend` — selects `InMemoryVectorStore` or `AtlasVectorStore` at composition root |
| `ATLAS_VECTOR_INDEX` | no | `template_vector_index` | `src/config/retrieval.config.ts` | `config.retrieval.atlasIndexName` — only used when `VECTOR_BACKEND=atlas` |
| `MAIL_TRANSPORT` | no | `console` | `src/config/mail.config.ts` | `config.mail.transport` — `console` \| `smtp`, selects `IMailer` at composition root |
| `MAIL_FROM` | no | `Unblock AI <noreply@localhost>` | `src/config/mail.config.ts` | `config.mail.from` — `From` header on outgoing approval mail |
| `SMTP_HOST` | no | `""` | `src/config/mail.config.ts` | `config.mail.smtpHost` — passed to `nodemailer.createTransport`; not validated at startup, so an empty host only surfaces as a send failure once `MAIL_TRANSPORT=smtp` actually sends |
| `SMTP_PORT` | no | `587` | `src/config/mail.config.ts` | `config.mail.smtpPort` — `465` selects implicit TLS (`secure: true`) |
| `SMTP_USER` | no | `""` | `src/config/mail.config.ts` | `config.mail.smtpUser` — omitted from transporter `auth` entirely when empty |
| `SMTP_PASS` | no | `""` | `src/config/mail.config.ts` | `config.mail.smtpPass` |
| `APP_PUBLIC_URL` | no | `http://localhost:3001` | `src/config/mail.config.ts` | `config.mail.appPublicUrl` — base URL used to build `/approvals/:token` links in emails |
| `APPROVAL_TOKEN_SECRET` | \*\* | `""` | `src/config/mail.config.ts` | `config.mail.tokenSecret` — HMAC-SHA256 signing key for approval tokens (`token.util.ts`); **required when `MAIL_TRANSPORT=smtp`**, throwing `ConfigurationError` at startup — an empty dev default is otherwise tolerated |
| `APPROVAL_TOKEN_TTL_DAYS` | no | `14` | `src/config/mail.config.ts` | `config.mail.tokenTtlDays` — approval token lifetime, in days |

31 variables total (\* = required, throws at startup if missing/empty; \*\* = only
`APPROVAL_TOKEN_SECRET` is conditionally required, when `MAIL_TRANSPORT=smtp` — see
below. The four `SMTP_*` vars are not validated at startup at all; a misconfigured
SMTP transport fails at send time instead, caught and logged by
`notification.service.ts` rather than crashing the process).

`KNOWLEDGE_BANK_PATH` was **removed** during the restructure. It was read into
the pre-restructure config but consumed by nothing after the migration to MongoDB —
see [../plans/restructure-implementation-plan.md](../plans/restructure-implementation-plan.md)
§1.2 Problem 5 for the original finding.

## Parsing helpers

`src/utils/shared/env-parse.util.ts` exports four pure functions used by every
config module above; none of them read `process.env` themselves — they take the raw
value as an argument, which is why `env.config.ts` is the only file that touches
`process.env` directly:

- `requireString(name, raw)` — throws `ConfigurationError` if empty/undefined.
- `optionalString(name, raw, fallback)`
- `parseNumber(name, raw, fallback)` — throws if present but non-numeric.
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
