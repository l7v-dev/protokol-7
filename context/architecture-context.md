# Architecture Context

## Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Runtime | Node.js (>=22) + TypeScript (strict) | Enterprise backend engine |
| API Framework | Fastify v5 | High-performance REST gateway & plugins |
| Database | PostgreSQL 16 + `pg` | Relational storage for projects, targets, jobs, schemas, and datasets |
| Queue / Messaging | Redis + BullMQ | Job dispatching, attempt retries, worker queues |
| Browser Engine | Playwright / Chromium | Headless browser execution & artifact capture |
| Extraction | Cheerio, JSONPath-Plus, XPath | Deterministic HTML/JSON parsing |
| Observability | Pino + OpenTelemetry | Structured logging, metrics, and trace context |

## System Boundaries

- `src/routes/` — Fastify request handlers: route validation, auth resolution, REST responses.
- `src/services/` — Core domain services: `JobService`, `ResourceService`.
- `src/database/` — Client connection, migrations (`001_core_schema.sql`), and repositories.
- `src/queue/` — BullMQ queue runtime, outbox publisher, plugin.
- `src/orchestrator/` — State machine, lifecycle guards, control plane.
- `src/workers/` — HTTP & Browser task execution workers.
- `src/proxy/` — Proxy catalog, health registry, lease manager, selection policy.
- `src/extraction/` — Extraction plan, DOM cleaner, selectors, normalizers, AI adapter.
- `src/dataset/` — Dataset versioning, deduplication, export adapters.

## Invariants

1. HTTP request threads must not execute long-running scrapers or browser sessions — offload to BullMQ.
2. Metadata and raw content artifacts (HTML/PDF/screenshots) are separated: metadata in PostgreSQL, raw artifacts in Object Storage / filesystem.
3. Every API request and queue payload carries tenant context (`tenantId`).
4. Strict TypeScript casing and type checking are enforced (`exactOptionalPropertyTypes: true`).
