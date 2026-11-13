# Running the App

UNBLOCK-AI has two parts you run separately:

| Part     | Folder            | Tech           | Default URL             |
| -------- | ----------------- | -------------- | ------------------------ |
| Backend  | `unblock-ai-api/` | Node.js/Express + TypeScript | http://localhost:3000     |
| Frontend | `unblock-ai-web/` | Next.js         | http://localhost:3001     |

Backend API is mounted under `/api`, e.g. http://localhost:3000/api. The backend's CORS is pinned to `http://localhost:3001` by default (`CORS_ORIGIN` env var), so the frontend must run on port **3001**, not Next's default of 3000.

You also need MongoDB reachable at the URI configured in `unblock-ai-api/.env` (`MONGODB_URI`, default `mongodb://localhost:27017`), and Azure OpenAI credentials (chat + embeddings) — there's no local mock for these.

---

## 1. Prerequisites

- Node.js 18+ and npm
- MongoDB, via **either**:
  - Docker (recommended, easiest), **or**
  - MongoDB Compass + a local/remote `mongod` instance
- Azure OpenAI access:
  - A chat-completions deployment (e.g. `gpt-4o` / `gpt-5-mini`)
  - A text-embedding deployment (e.g. `text-embedding-3-small`)

---

## 2. Set up MongoDB

Pick **one** of the two options below.

### Option A — MongoDB in Docker (recommended)

Run a local MongoDB container:

```bash
docker run -d --name unblock-ai-mongo -p 27017:27017 -v unblock-ai-mongo-data:/data/db mongo:7
```

- `-p 27017:27017` exposes MongoDB on `localhost:27017` (matches the default `MONGODB_URI`)
- `-v unblock-ai-mongo-data:/data/db` persists data across container restarts
- Change `mongo:7` to another tag if you need a specific version

Useful commands:

```bash
# Check it's running
docker ps

# Stop it
docker stop unblock-ai-mongo

# Start it again later
docker start unblock-ai-mongo

# View logs
docker logs -f unblock-ai-mongo

# Remove the container (data volume survives)
docker rm -f unblock-ai-mongo

# Remove the data volume too (irreversible)
docker volume rm unblock-ai-mongo-data

# Open a mongo shell inside the container
docker exec -it unblock-ai-mongo mongosh
```

If port `27017` is already taken on your machine, map to a different host port, e.g. `-p 27018:27017`, and set `MONGODB_URI=mongodb://localhost:27018` in `.env` accordingly.

With this setup, `.env` needs:

```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=unblock_ai
```

### Option B — MongoDB Community Server + Compass (GUI) — current local setup

This is what the dev machine uses. MongoDB Compass is a GUI **client**, not a database server — you
still need a `mongod` process for it to connect to (a local install, or a remote/Atlas cluster).

1. **Install MongoDB Community Server** (the actual database engine). On Windows, winget is the
   least fiddly route — it installs `mongod` as an auto-starting Windows service on `localhost:27017`:

   ```powershell
   winget install --id MongoDB.Server --exact --scope machine
   ```

   Or download the MSI from https://www.mongodb.com/try/download/community and keep the
   "Install as a Service" option checked (the installer's default).

2. **Install `mongosh`** (the shell — no longer bundled with the server MSI), for CLI checks:

   ```powershell
   winget install --id MongoDB.Shell --exact
   ```

   It installs to `%LOCALAPPDATA%\Programs\mongosh\mongosh.exe`. Open a **new** terminal afterwards
   so the updated `PATH` is picked up.

3. **Install MongoDB Compass**:
   - Download from https://www.mongodb.com/try/download/compass
   - Open Compass and connect using the connection string `mongodb://localhost:27017`

4. **Verify the server is up** before starting the app:

   ```powershell
   Get-Service MongoDB                  # expect Status=Running, StartType=Automatic
   mongosh --quiet --eval "db.version()"
   ```

   In Compass you should see the default `admin`, `local`, `config` databases. The `unblock_ai`
   database appears once you run `npm run migrate:mongo:up` (see below).

5. Set in `.env`:

```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=unblock_ai
```

If instead you're pointing at **MongoDB Atlas** (cloud) or another remote instance, use the connection string Atlas gives you (starts with `mongodb+srv://...`) as `MONGODB_URI`, and use Compass with that same connection string to inspect data visually.

### Apply database migrations

Once MongoDB and PostgreSQL are reachable, run this from `unblock-ai-api/`:

```bash
npm run migrate:up
```

This applies every pending Postgres migration (users, permissions, user sessions and the organisational structure) and Mongo migration (collections and indexes). Re-running it applies nothing new. Check where each database stands with `npm run migrate:status`.

Expected output on a fresh database:

```
[postgres] applied  20261111000000_initial-schema
[postgres] applied  20261111015501_unified-users-permissions-and-sessions
[mongo] applied  20261111000000_initial-schema
```

See [database-migrations.md](./database-migrations.md) for rolling back, writing new migrations and every migration command.

### Seed the bootstrap administrator

Set `SEED_ADMINISTRATOR_EMAIL`, `SEED_ADMINISTRATOR_FULL_NAME` and `USER_DEFAULT_PASSWORD` in `.env`, then run:

```bash
npm run seed:pg:run
```

```
[postgres] 20261111021734_administrator-user user admin@example.com -> created
```

This creates one user holding all four permissions. Sign in with that email and `USER_DEFAULT_PASSWORD`; further users are created through `POST /api/users`. Re-running the command reports `skipped`. See [database-seeding.md](./database-seeding.md).

### Inspecting the data in Compass

Connect Compass to `mongodb://localhost:27017` and open the **`unblock_ai`** database. The
collections map to the app as follows:

| Collection           | Holds                                                              |
| -------------------- | ------------------------------------------------------------------ |
| `workflow_templates` | One document per workflow template: title, status, current version, retrieval embedding |
| `workflow_template_versions` | Immutable generated versions: the prompt and the generated definition |
| `selection_sessions` | Selector-agent conversation sessions                                |
| `tasks`              | Approval requests and their step state                              |
| `counters`           | Per-year sequence for task references                               |
| `audit_logs`         | Append-only log of destructive actions                              |
| `migrations`         | Applied Mongo migrations (`migrations_lock` holds the run lock)     |

Vector search runs in-process (`InMemoryVectorStore`, cosine similarity in Node), so **no Atlas
Search index is needed** — plain Community Server is sufficient. The `VECTOR_BACKEND=atlas` env var
opts into `$vectorSearch` instead, which *does* require Atlas.

---

## 3. Configure environment variables

### Backend (`unblock-ai-api/.env`)

Copy the example file and fill in your Azure credentials:

```bash
cd "unblock-ai-api"
cp .example.env .env
```

Edit `.env`:

```env
# Runtime environment
NODE_ENV=development

# Server
PORT=3000
CORS_ORIGIN=http://localhost:3001

# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=unblock_ai

# LLM provider for every generation task: azure-openai | gemini
LLM_PROVIDER=azure-openai
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4o
GEMINI_API_KEY=<your-google-ai-studio-key>
GEMINI_CHAT_MODEL=gemini-3.8-flash
WORKFLOW_TEMPLATE_GENERATION_MAX_ATTEMPTS=3

# Embedding provider: azure-openai | gemini | voyage-ai (switching requires re-embedding stored templates)
EMBEDDING_PROVIDER=azure-openai
AZURE_OPENAI_EMBEDDING_ENDPOINT=https://<your-foundry>.services.ai.azure.com
AZURE_OPENAI_EMBEDDING_API_KEY=<your-key>
AZURE_OPENAI_EMBEDDING_API_VERSION=2024-10-21
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
VOYAGE_AI_EMBEDDING_ENDPOINT=https://ai.mongodb.com/v1
VOYAGE_AI_EMBEDDING_API_KEY=<your-voyage-ai-key>
VOYAGE_AI_EMBEDDING_MODEL=voyage-4
EMBEDDING_DIMENSIONS=1536

# Retrieval tuning (defaults shown)
RETRIEVAL_TOP_K=5
RETRIEVAL_ALIAS_BOOST=0.15
SELECTION_MAX_ROUNDS=2
VECTOR_BACKEND=memory
ATLAS_VECTOR_INDEX=template_vector_index
```

`.example.env` lists every variable the app reads, in the order [src/config/](../../src/config/) expects — see [configuration.md](./configuration.md) for the full reference table. There is no longer a `KNOWLEDGE_BANK_PATH` variable; it was removed as dead configuration during the restructure.

### Frontend (`unblock-ai-web/.env.local`)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
```

This should already point at the backend's `/api` base URL from step above.

---

## 4. Install dependencies

From each folder:

```bash
cd "unblock-ai-api"
npm install

cd "../unblock-ai-web"
npm install
```

---

## 5. Run the app

Open **two terminals** (backend and frontend run at the same time).

### Terminal 1 — Backend

```bash
cd "unblock-ai-api"
npm run dev
```

Runs with `tsx watch` (auto-restarts on file changes, no separate build step needed) on http://localhost:3000.

For a production-style run, build first, then start the compiled output:

```bash
npm run build   # tsc -> dist/
npm start       # node dist/src/server.js
```

### Terminal 2 — Frontend

```bash
cd "unblock-ai-web"
npm run dev -- -p 3001
```

Next's default dev port is 3000, which collides with the backend — pass `-p 3001` explicitly so it matches `CORS_ORIGIN`. Runs on http://localhost:3001.

### Open the app

- Frontend UI: http://localhost:3001
- Backend API base: http://localhost:3000/api
- Backend health check: http://localhost:3000/api/health

---

## 6. Other useful backend scripts

Run from `unblock-ai-api/`:

```bash
npm run typecheck               # tsc --noEmit
npm test                        # unit + integration tests (tests/unit, tests/integration)
npm run test:live               # tests that hit live Azure/Mongo services (tests/live)
npm run smoke-test:llm          # sanity-check the configured LLM provider
npm run smoke-test:embeddings   # sanity-check the configured embedding provider
npm run evaluate:selection      # evaluate the selector agent
```

---

## 7. Quick troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Backend fails at startup with `Missing required environment variable` | A var required by the selected `LLM_PROVIDER` / `EMBEDDING_PROVIDER` (or Mongo) is empty — check `AZURE_OPENAI_*`, `GEMINI_*`, `VOYAGE_AI_*`, `MONGODB_URI` |
| Backend can't connect to Mongo (`ECONNREFUSED 27017`) | MongoDB isn't running — start the Windows service (`Start-Service MongoDB`, or `net start MongoDB` from an admin prompt) or the Docker container (`docker start unblock-ai-mongo`) |
| Compass connects fine but the app sees no data | Compass may be pointed at a different database — check you're in `unblock_ai`, matching `MONGODB_DB` in `.env` |
| `mongosh` not recognised after installing | Reopen the terminal so the updated `PATH` loads, or call it directly at `%LOCALAPPDATA%\Programs\mongosh\mongosh.exe` |
| Frontend requests fail with a CORS error in the browser console | Frontend isn't running on the port set in `CORS_ORIGIN` (default `3001`) — start it with `-p 3001`, or update `CORS_ORIGIN` in `.env` to match |
| `npm run dev` on the frontend opens on port 3000 and conflicts with the backend | Pass `-p 3001` as shown in step 5 |
| `EADDRINUSE` on port 3000 | Something else already bound to that port — stop it, or change `PORT` in `unblock-ai-api/.env` (and update `NEXT_PUBLIC_API_BASE_URL` in the frontend to match) |
| `npx tsc --noEmit` fails after pulling changes | Run `npm install` — a new phase may have added a dependency or type package |

See also: [../api/api-documentation.md](../api/api-documentation.md) for the full API reference.
