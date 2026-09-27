# src/api/ — HTTP API Layer

HTTP server, REST router handlers, ACID persistence, and shared type contracts.
Previously `src/core/`. Renamed to reflect actual responsibility.

## Module Map

| File | Export | Responsibility |
|---|---|---|
| `server.ts` | `startServer`, `handleRequest` | Native Node.js HTTP server. Routes all incoming requests to domain routers. Entry point for `npm run start`. |
| `registry-database.ts` | `RegistryDatabase`, `getDefaultRegistryDatabase` | ACID SQLite persistence via native `node:sqlite`. Tracks actor runs, pipeline executions, scheduled jobs, dataset shards, and storage replicas. WAL mode; in-memory mode for tests. |
| `run-registry.ts` | `RunRegistry`, `globalRunRegistry` | In-memory run tracking with SSE event emission + ACID cross-restart persistence via `RegistryDatabase`. |
| `openapi-spec.ts` | `OPENAPI_SPECIFICATION`, `renderDocsHtml` | OpenAPI 3.1.0 spec definition and zero-dependency HTML documentation renderer. Served at `GET /api/v1/docs`. |
| `context-guard.ts` | `ContextGuard` | LLM token estimation, context window budget enforcement, and hierarchical semantic truncation. |
| `types.ts` | `ScrapedPageResult`, `ActorTask`, `IActor`, `ActorType`, ... | Shared TypeScript interface contracts used across all modules. Single source of type truth. |
| `index.ts` | API Barrel | Re-exports all of the above plus all routers. |

## Routers (`src/api/routers/`)

Each router handles one resource domain under `/api/v1/`.

| File | Class | Routes |
|---|---|---|
| `store-router.ts` | `StoreRouter` | `GET /api/v1/actors`, `POST /api/v1/<actor-type>`, `GET /api/v1/runs/:id/logs` (SSE) |
| `pipeline-router.ts` | `PipelineRouter` | `POST /api/v1/pipelines/run`, `GET /api/v1/pipelines/runs`, `GET /api/v1/pipelines/templates` |
| `dataset-router.ts` | `DatasetRouter` | `POST /api/v1/datasets/publish`, `GET /api/v1/datasets`, `GET /api/v1/datasets/:name/manifest` |
| `job-router.ts` | `JobRouter` | `POST /api/v1/jobs/schedule`, `GET /api/v1/jobs`, `DELETE /api/v1/jobs/:id` |
| `vault-router.ts` | `VaultRouter` | `POST /api/v1/vault/export`, `POST /api/v1/vault/verify`, `GET /api/v1/vault/inspect` |

## Auth

MCP endpoints (`/mcp`, `/mcp/events`) require a `Bearer` token matching `MCP_API_TOKEN` env var.
REST actor endpoints have no auth by default — add a reverse proxy layer for production.

## Interactive Docs

Start the server and open `http://localhost:4000/api/v1/docs` for the Swagger UI.

```bash
npm run dev
open http://localhost:4000/api/v1/docs
```

## Database Schema

See [`context/schema.sql`](../../context/schema.sql) for the full ANSI/SQLite DDL.
Tables: `actor_runs`, `event_log`, `pipeline_runs`, `scheduled_jobs`, `dataset_snapshots`, `dataset_shards`, `storage_replicas`, `verification_audit`.
