# System Architecture & Governance (Protokol-7)

> **Context:** This repository (`/home/l7v/dev/workspaces/protokol-7`) manages the **Protokol-7 Enterprise Scraping Platform Backend**, built on Fastify, TypeScript, PostgreSQL, Redis, BullMQ, Playwright, and OpenTelemetry.

---

## 🛡️ Governance & Architecture Invariants

1. **HTTP-First, Browser-When-Needed:**
   - Static/HTTP request endpoints must never initialize Chromium/Playwright browsers unless JS rendering, interaction, or session-level browser behavior is strictly required.

2. **Clean Architecture & Boundary Scoping:**
   - All source code lives in `src/` organized by domain (`config`, `plugins`, `shared`, `routes`, `services`, `database`, `queue`, `orchestrator`, `workers`, `storage`, `security`, `http`, `browser`, `proxy`, `reliability`, `extraction`, `schema`, `crawler`, `orchestration`, `strategy`, `dataset`, `observability`, `finops`).
   - Request handlers (`src/routes/`) must only validate input, check auth, trigger orchestrations/tasks, and return HTTP envelopes. No heavy processing in HTTP request threads.

3. **Technical & Clean Naming Conventions:**
   - File, table, migration, and test naming must remain strictly technical, simple, and clean (e.g., `002_auth_schema.sql`, `auth-api.test.ts`, `user-repository.ts`). No marketing buzzwords, fluff, or arbitrary prefixes (e.g. do not use `enterprise_auth`).

4. **Technical REST API & Dual Compatibility:**
   - Primary API endpoints must follow standard REST conventions with singular noun resources (e.g., `/api/v1/auth/*`, `/api/v1/models`, `/api/v1/chats`, `/api/v1/config`).
   - Where client SDKs / frontends require plural paths (e.g., `/api/v1/auths/*`), dual-route alias binding must be maintained for seamless interoperability.

5. **Enterprise Multi-Tenancy & Integrity:**
   - All persistence tables and operational datasets must maintain strict multi-tenant scoping (`tenant_id REFERENCES tenants(id)`), audit logging, explicit status checks, and rate-limiting/lockout policies.

6. **Verification Before Delivery:**
   - Always validate changes via `npm run typecheck`, `npm run test`, and the corresponding phase gate script before completing a task.

---

## 📂 Application Building Context

Read the following context files in order before making architectural or feature changes:

1. `context/project-overview.md` — platform scope, HTTP-first principle, worker boundaries
2. `context/architecture-context.md` — system layers, PostgreSQL/Redis storage model, queues, invariants
3. `context/code-standards.md` — TypeScript strict rules, Fastify error taxonomy, idempotency standards
4. `context/ai-workflow-rules.md` — incremental development workflow, gate testing, doc synchronization
5. `context/progress-tracker.md` — completion status of milestones (M0-M16), active tasks, open questions

Update `context/progress-tracker.md` after completing any feature or milestone update.

---

## ⚙️ Standard Commands

- **Type Check:** `npm run typecheck`
- **Build:** `npm run build`
- **Run Tests:** `npm run test`
- **Run Smoke Test:** `npm run test:smoke`
- **Run Phase Gates:** `npm run test:<phase>-gate` (e.g. `test:extraction-gate`, `test:schema-gate`, `test:reliability-gate`)
