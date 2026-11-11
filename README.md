# Unblock AI

Turns a plain-English description of an institutional approval workflow into a structured,
machine-readable workflow graph, then lets requesters find the right workflow by chatting,
fill in what it needs, and run the approval chain end to end.

Two applications run side by side:

| App | Folder | Stack | URL |
|---|---|---|---|
| Backend API | [unblock-ai-api/](unblock-ai-api/) | Node.js + Express 5 + TypeScript | http://localhost:3000 |
| Frontend | [unblock-ai-web/](unblock-ai-web/) | Next.js 16 + React 19 | http://localhost:3001 |

---

## 1. Prerequisites

Install these before starting:

| Requirement | Notes |
|---|---|
| **Node.js 18+** and npm | `node -v` to check |
| **MongoDB 7** | Local server or Docker — stores workflows, drafts, tasks |
| **PostgreSQL 17** | Stores users, sessions and template-deletion audit rows |
| **Azure AI Foundry account** | Needed for the chat model and the embedding model (section 3) |
| Git | To clone the repository |

There is no offline mock for the Azure models — the extraction and retrieval features
require real deployments.

---

## 2. Clone and install

```bash
git clone https://github.com/NethmiR/unblock-ai-app.git
cd unblock-ai-app

# backend
cd unblock-ai-api
npm install

# frontend
cd ../unblock-ai-web
npm install
```

---

## 3. Get the Azure AI Foundry models and API keys

The project uses **two separate model deployments**:

| Purpose | Model used | Env prefix |
|---|---|---|
| Workflow extraction + selector agent (the LLM) | `gpt-4o` | `AZURE_OPENAI_*` / `AZURE_SELECTOR_*` |
| Template retrieval vectors (the embedding model) | `text-embedding-3-small` (1536 dimensions) | `AZURE_EMBEDDING_*` |

### 3.1 Create the Foundry project

1. Go to **https://ai.azure.com** and sign in with an Azure account that has an active
   subscription.
2. Click **+ Create** → **AI Foundry resource** (or open an existing project).
3. Give it a name, pick a subscription, resource group and a region that offers both models
   (e.g. *East US*, *East US 2*, *Sweden Central*), then **Create**.

### 3.2 Deploy the chat model (LLM)

1. In your project, open **Model catalog** in the left sidebar.
2. Search for **`gpt-4o`** and click **Use this model** / **Deploy**.
3. Set the **Deployment name** — copy it exactly, it becomes `AZURE_OPENAI_DEPLOYMENT`.
   Using `gpt-4o` as the deployment name keeps things simple.
4. Choose a deployment type (Global Standard is fine) and confirm.

### 3.3 Deploy the embedding model

1. Back in **Model catalog**, search for **`text-embedding-3-small`** and deploy it the same way.
2. The deployment name becomes `AZURE_EMBEDDING_DEPLOYMENT`.
3. This model outputs **1536-dimension** vectors, which is what `AZURE_EMBEDDING_DIM` expects.
   If you deploy `text-embedding-3-large` instead, set `AZURE_EMBEDDING_DIM=3072`.

### 3.4 Copy the endpoints and keys

Open **Deployments** (or the project's **Overview → Endpoints** / **Keys and Endpoint** panel)
and copy the values:

| From the portal | Goes into `.env` as |
|---|---|
| Azure OpenAI endpoint, e.g. `https://<your-resource>.openai.azure.com/` | `AZURE_OPENAI_ENDPOINT` |
| Key 1 for that resource | `AZURE_OPENAI_API_KEY` |
| Chat deployment name | `AZURE_OPENAI_DEPLOYMENT` and `AZURE_SELECTOR_DEPLOYMENT` |
| Foundry/services endpoint, e.g. `https://<your-foundry>.services.ai.azure.com` | `AZURE_EMBEDDING_ENDPOINT` |
| Key for the embedding resource | `AZURE_EMBEDDING_API_KEY` |
| Embedding deployment name | `AZURE_EMBEDDING_DEPLOYMENT` |

Notes:

- The chat and embedding endpoints are **different hosts** and are configured separately.
  If both models live on the same resource, use that resource's endpoint and key for both.
- Keep `AZURE_OPENAI_API_VERSION` and `AZURE_EMBEDDING_API_VERSION` at `2024-10-21` unless
  your deployment requires a newer one.
- The chat call uses OpenAI **structured outputs** (`json_schema`, `strict: true`), so the
  deployed model version must support it — `gpt-4o` (2024-08-06 or later) does.

---

## 4. Set up the databases

### 4.1 MongoDB

**Option A — Docker (quickest):**

```bash
docker run -d --name unblock-ai-mongo -p 27017:27017 -v unblock-ai-mongo-data:/data/db mongo:7
```

**Option B — MongoDB Community Server (Windows):**

```powershell
winget install --id MongoDB.Server --exact --scope machine   # installs mongod as an auto-start service
winget install --id MongoDB.Shell  --exact                   # mongosh, for CLI checks
```

Verify it is reachable:

```bash
mongosh --quiet --eval "db.version()"
```

No Atlas Search index is required — vector search runs in-process by default
(`VECTOR_BACKEND=memory`). Set `VECTOR_BACKEND=atlas` only if you are pointing
`MONGODB_URI` at an Atlas cluster with a `$vectorSearch` index.

### 4.2 PostgreSQL

Install PostgreSQL 17 (download the installer from
https://www.enterprisedb.com/downloads/postgres-postgresql-downloads — winget is blocked by
EDB). During install, set a password for the `postgres` superuser and keep port `5432`.

Then create the application database and its own least-privilege role. Open a terminal and
run `psql` as the superuser:

```bash
psql -U postgres
```

```sql
CREATE ROLE unblock_app WITH LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE unblock_ai_auth WITH OWNER unblock_app ENCODING 'UTF8';
\q
```

The app connects as `unblock_app`, never as `postgres`. Because `unblock_app` owns the
database it already has the rights the migrations need — no extra `GRANT`s, and no
`pgcrypto` extension (`gen_random_uuid()` is built in on PostgreSQL 13+).

Verify:

```bash
psql "postgresql://unblock_app:choose-a-password@localhost:5432/unblock_ai_auth" -c "SELECT 1"
```

---

## 5. Configure environment variables

### 5.1 Backend — `unblock-ai-api/.env`

```bash
cd unblock-ai-api
cp .example.env .env
```

`.example.env` documents every variable the app reads. At minimum, fill these in:

```env
# Server
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:3001

# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=unblock_ai

# PostgreSQL (from section 4.2)
POSTGRES_URL=postgresql://unblock_app:choose-a-password@localhost:5432/unblock_ai_auth
POSTGRES_REPOSITORY_BACKEND=postgres

# Azure chat model (from section 3.4)
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_SELECTOR_DEPLOYMENT=gpt-4o

# Azure embedding model (from section 3.4)
AZURE_EMBEDDING_ENDPOINT=https://<your-foundry>.services.ai.azure.com
AZURE_EMBEDDING_API_KEY=<your-key>
AZURE_EMBEDDING_DEPLOYMENT=text-embedding-3-small
AZURE_EMBEDDING_API_VERSION=2024-10-21
AZURE_EMBEDDING_DIM=1536

# Signs approval links (required when real mail is sent)
APPROVAL_TOKEN_SECRET=<random 32+ char string>

# Users and sessions
USER_DEFAULT_PASSWORD=12345         # initial password of every new user
SESSION_TTL_HOURS=12                # absolute session lifetime
AUTH_MAX_FAILED_ATTEMPTS=0          # failed logins before lockout; 0 disables lockout
AUTH_LOCKOUT_DURATION_MINUTES=15

# Bootstrap administrator created by `npm run seed:pg:run` (section 6)
SEED_ADMINISTRATOR_EMAIL=admin@example.com
SEED_ADMINISTRATOR_FULL_NAME=System Administrator
```

Generate the approval secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Required at startup** (the server refuses to boot without them): `MONGODB_URI`,
`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`,
`AZURE_OPENAI_API_VERSION`, `AZURE_EMBEDDING_ENDPOINT`, `AZURE_EMBEDDING_API_KEY`,
`USER_DEFAULT_PASSWORD`, and `POSTGRES_URL` (when `POSTGRES_REPOSITORY_BACKEND=postgres`, the
default). Sessions are stored in PostgreSQL, so they survive API restarts and need no signing
secret. `SEED_ADMINISTRATOR_EMAIL` and `SEED_ADMINISTRATOR_FULL_NAME` are read only by the
seed command, never by the server.

**Email is optional.** The default `MAIL_TRANSPORT=console` prints approval emails —
including the full approval link — to the API's stdout, so the whole approval chain is
demonstrable with no email account. To send real mail, set `MAIL_TRANSPORT=smtp` and fill in
`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`; `APPROVAL_TOKEN_SECRET` becomes
mandatory in that mode.

### 5.2 Frontend — `unblock-ai-web/.env.local`

Create the file with:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
```

That is the only variable the frontend needs (see `unblock-ai-web/.example.env`). The web app
holds no auth secret: it stores the API's opaque session token in an httpOnly cookie and the
API validates it on every call.

---

## 6. Initialise the databases

Run both from `unblock-ai-api/`. Each is safe to re-run.

```bash
cd unblock-ai-api

# 6.1 Apply PostgreSQL + MongoDB migrations (tables, collections, indexes)
npm run migrate:up

# 6.2 Create the bootstrap administrator
npm run seed:pg:run
```

`npm run migrate:status` shows which migrations each database has applied. Rolling back,
writing new migrations and every per-database command are covered in
[unblock-ai-api/docs/guides/database-migrations.md](unblock-ai-api/docs/guides/database-migrations.md).

`npm run seed:pg:run` creates the administrator from `SEED_ADMINISTRATOR_EMAIL` /
`SEED_ADMINISTRATOR_FULL_NAME` with all four permissions and the password in
`USER_DEFAULT_PASSWORD`. Seeders are idempotent: an existing user is skipped, never
overwritten. `npm run seed:pg:list` lists the seeders and `npm run seed:pg:create -- <name>`
scaffolds a new one — see
[unblock-ai-api/docs/guides/database-seeding.md](unblock-ai-api/docs/guides/database-seeding.md).

---

## 7. Run the app

Two terminals — the backend and frontend run at the same time.

**Terminal 1 — backend**

```bash
cd unblock-ai-api
npm run dev            # tsx watch, http://localhost:3000
```

**Terminal 2 — frontend**

```bash
cd unblock-ai-web
npm run dev            # port 3001 is already fixed in package.json
```

Then open:

- App: **http://localhost:3001**
- Login (every user): **http://localhost:3001/login** — after sign-in you land on `/account`
- Template authoring dashboard: **http://localhost:3001/admin** (reachable by URL, not linked yet)
- Requester dashboard: **http://localhost:3001/portal** (reachable by URL, not linked yet)
- API health check: **http://localhost:3000/api/health**

The frontend **must** run on port 3001 — it is the backend's default `CORS_ORIGIN`. If you
change one, change the other.

### Production-style run

```bash
cd unblock-ai-api && npm run build && npm start    # tsc -> dist/, then node dist/src/server.js
cd unblock-ai-web && npm run build && npm start
```

---

## 8. Users and test credentials

Everyone signs in at `/login` with **email + password**. There are no roles; each user holds
one or more permissions:

| Permission | Allows |
|---|---|
| `workflow:manage` | Author, edit, publish and delete workflow templates; drafts; the deletion log |
| `task:create` | Read published workflows, chat with the selector, create and run **their own** requests |
| `task:approve` | Grantable, but gates nothing yet (approvals still use emailed links) |
| `user:manage` | Create, list and view users |

**Bootstrap administrator** — created by `npm run seed:pg:run` with all four permissions.
With the suggested `.env` in section 5.1 that is `admin@example.com` / `12345`.

**Other users** are created by a `user:manage` holder through the API. Every new user gets the
password in `USER_DEFAULT_PASSWORD`:

```bash
# 1. Log in and copy "token" from the response
curl -s http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"12345"}'

# 2. Create a requester
curl -s http://localhost:3000/api/users -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"email":"requester@example.com","full_name":"Test Requester","permissions":["task:create"]}'
```

There is no self-registration, password reset, or password change yet — every account keeps
`USER_DEFAULT_PASSWORD`. Use a different value before any non-local use.

The `/account` page shows your profile, permissions and active sessions; you can revoke a
single session, sign out of all other sessions, or sign out.

Approvers do not have accounts. An approver receives an emailed link containing a signed
approval token, and that token is the authentication — with `MAIL_TRANSPORT=console` the link
is printed in the backend terminal.

---

## 9. Verify the setup

```bash
cd unblock-ai-api

npm run smoke-test:azure        # chat deployment reachable?
npm run smoke-test:embeddings   # embedding deployment reachable + right dimensions?
npm run smoke-test:mail         # mail transport works?
npm run smoke-test:document     # completion-document PDF renders?

npm run typecheck               # tsc --noEmit
npm test                        # unit + integration tests (in-memory Mongo + fake models,
                                # no network calls to Azure/Mongo/Postgres)
```

Frontend checks: `npm run typecheck`, `npm run lint`, `npm test` from `unblock-ai-web/`.

A typical end-to-end walkthrough: sign in as the bootstrap administrator → open `/admin` →
create a template from prose → Generate → Publish → create a `task:create` user (section 8) →
sign out → sign in as that user → open `/portal` → start a new job → describe the request in
chat → fill in the requirements → submit → copy the approval link from the backend terminal →
approve.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing required environment variable: X` at startup | Fill `X` in `unblock-ai-api/.env` — see the required list in 5.1 |
| `ECONNREFUSED 27017` | MongoDB is not running — `docker start unblock-ai-mongo`, or `Start-Service MongoDB` |
| Postgres connection/timeout errors at startup | The service is down, or `POSTGRES_URL` has the wrong password/database. Test it with the `psql` command in 4.2 |
| `password authentication failed for user "unblock_app"` | Role password does not match `POSTGRES_URL` — `ALTER ROLE unblock_app WITH PASSWORD '...'` |
| `relation "users" does not exist` | `npm run migrate:pg:up` has not been run |
| `Missing required environment variable: SEED_ADMINISTRATOR_EMAIL` from `seed:pg:run` | Set `SEED_ADMINISTRATOR_EMAIL` and `SEED_ADMINISTRATOR_FULL_NAME` in `unblock-ai-api/.env` |
| Login returns `ACCOUNT_LOCKED` | Too many failed attempts with `AUTH_MAX_FAILED_ATTEMPTS > 0`; wait `AUTH_LOCKOUT_DURATION_MINUTES` |
| Login succeeds then immediately bounces back to the login page | The session was rejected by the API (expired, revoked, or the API is unreachable from the web app) — check `NEXT_PUBLIC_API_BASE_URL` and the API logs |
| `403 PERMISSION_DENIED` from the API | The signed-in user lacks the permission that route needs (section 8) |
| CORS errors in the browser console | The frontend is not on the port in `CORS_ORIGIN` (default 3001) |
| `EADDRINUSE` on port 3000 | Something else holds the port — free it, or change `PORT` and `NEXT_PUBLIC_API_BASE_URL` together |
| Extraction returns 422 | The model rejected the prose as not a workflow, or failed validation after `EXTRACTION_MAX_ATTEMPTS` retries — check the backend logs |
| Embedding errors / dimension mismatch | `AZURE_EMBEDDING_DIM` does not match the deployed model (1536 for `text-embedding-3-small`, 3072 for `-large`) |
| Nothing found when searching for a template | The template is not published — retrieval only sees templates with `review_status: confirmed`. Publish it from the admin editor |

---

## 11. Further documentation

| Document | Covers |
|---|---|
| [docs/overview.md](docs/overview.md) | Full architecture and design-decision reference |
| [unblock-ai-api/docs/api/api-documentation.md](unblock-ai-api/docs/api/api-documentation.md) | Every endpoint, with request/response bodies and auth |
| [unblock-ai-api/docs/guides/configuration.md](unblock-ai-api/docs/guides/configuration.md) | Full environment-variable reference |
| [unblock-ai-api/docs/guides/running-the-app.md](unblock-ai-api/docs/guides/running-the-app.md) | Longer-form run guide |
| [unblock-ai-api/docs/guides/database-seeding.md](unblock-ai-api/docs/guides/database-seeding.md) | The Postgres seed pack and the bootstrap administrator |
| [docs/user-access-and-session-management-phase-plan.md](docs/user-access-and-session-management-phase-plan.md) | Design of users, permissions and server-side sessions |
| [unblock-ai-api/docs/postman/](unblock-ai-api/docs/postman/) | Postman collection that chains ids automatically |
