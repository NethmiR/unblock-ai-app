# UNBLOCK-AI API — Documentation Index

## Architecture

| Document | Description |
| --- | --- |
| [architecture/project-overview.md](./architecture/project-overview.md) | What the project does, tech stack, directory structure, the workflow schema, extraction pipeline, persistence, and test suite — a read-through of the current codebase. |
| [architecture/folder-structure.md](./architecture/folder-structure.md) | The complete target `src/` tree and what each folder is responsible for. |
| [architecture/error-handling.md](./architecture/error-handling.md) | The `BaseError` hierarchy, its subclasses and status codes, and how the error middleware works. |
| [architecture/rag-implementation-guide.md](./architecture/rag-implementation-guide.md) | Historical design guide for the RAG/retrieval pipeline on Postgres + pgvector. |
| [architecture/rag-mongodb-azure-search.md](./architecture/rag-mongodb-azure-search.md) | Historical companion document: the same RAG pipeline on MongoDB + Azure AI Search. |

## Guides

| Document | Description |
| --- | --- |
| [guides/running-the-app.md](./guides/running-the-app.md) | Full local setup: MongoDB, environment variables, installing dependencies, running backend and frontend together, troubleshooting. |
| [guides/configuration.md](./guides/configuration.md) | Every environment variable, its default, whether it's required, and which config module owns it. |

## API reference

| Document | Description |
| --- | --- |
| [api/api-documentation.md](./api/api-documentation.md) | Every HTTP endpoint: request/response bodies, status codes, error shapes, and a suggested Postman test order. |

## Plans (historical)

| Document | Description |
| --- | --- |
| [plans/restructure-implementation-plan.md](./plans/restructure-implementation-plan.md) | The phased plan that drove the TypeScript restructure (this repository's own build plan). |
| [plans/original-implementation-plan.md](./plans/original-implementation-plan.md) | The original MVP implementation plan for Phase 1 (plain text → structured JSON → knowledge bank). Predates the restructure. |
| [plans/workflow-selection-plan.md](./plans/workflow-selection-plan.md) | The original design for the draft → template → retrieval → selector pipeline. Predates the restructure. |
| [plans/workflow-selection-implementation-plan.md](./plans/workflow-selection-implementation-plan.md) | The detailed end-to-end implementation plan for the selection feature. Predates the restructure. |

## Postman

| Location | Description |
| --- | --- |
| [postman/](./postman/) | The Postman collection and environment for manually exercising every endpoint. |

---

Historical planning documents under `plans/` and `architecture/rag-*.md` carry a
banner noting that their paths and file names predate the TypeScript restructure —
treat [architecture/folder-structure.md](./architecture/folder-structure.md) as the
current source of truth for layout.
