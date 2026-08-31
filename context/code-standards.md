# Code Standards & Conventions

## TypeScript & Code Quality

- Strict mode enabled (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`).
- Use `.js` extension in relative ESM imports (e.g. `import { foo } from './bar.js'`).
- Prefer `type` imports (`import type { ... } from '...'`) for type-only dependencies.

## Error Handling & Taxonomy

- Use custom domain errors extending `Error` (e.g., `ApiError`, `ProxyProviderError`, `ExtractionError`).
- Every domain error carries a machine-readable `code`, user message, and `retryable` boolean flag.

## Naming & API Conventions

- **Technical & Simple Naming:** Avoid buzzwords (e.g. `enterprise_...`). Use clean technical identifiers (`002_auth_schema.sql`, `auth-api.test.ts`, `user-repository.ts`).
- **RESTful Endpoints:** Singular primary paths (`/api/v1/auth/*`, `/api/v1/models`, `/api/v1/chats`) with dual route compatibility aliases (`/api/v1/auths/*`) for client SDKs.
- **Multi-Tenancy:** Explicit `tenant_id` foreign keys, tenant filtering on all repository queries, and audit log generation.

## Testing Standards

- Test runner: Vitest (`npm run test`).
- Test files mirror `src/` hierarchy under `test/` (e.g., `src/http/access-plan.ts` -> `test/http/access-plan.test.ts`).
- Smoke & Gate tests sit in `scripts/` (e.g., `scripts/extraction-gate-smoke.ts`).

## Verification Before Commit

1. `npm run typecheck`
2. `npm run test`
3. `npm run build`
