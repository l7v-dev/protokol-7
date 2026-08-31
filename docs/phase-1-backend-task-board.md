# Phase 1 Backend Task Board

**Program:** Scraping Platform  
**Milestone:** M1 — Core Platform MVP  
**Kapsam:** Backend-only  
**Baseline:** GATE-P00-M0 — GO WITH CONDITIONS  
**Board sahibi:** Engineering Manager  
**Güncel durum:** Accepted — conditional M1 gate

## Durum sözlüğü

| Durum | Anlam |
|---|---|
| `Not Started` | Bağımlılık bekliyor |
| `In Progress` | Aktif geliştirme |
| `In Review` | Kod/test/karar incelemesi bekliyor |
| `Accepted` | Kabul kriterleri ve kalite kapıları geçti |
| `Blocked` | Açık blocker var |
| `Deferred` | Daha ileri faza ertelendi |

## Task register

| ID | Workstream | Task | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P01-B01 | Repository | Backend monorepo ve workspace yapısını kur | Engineering Manager | 2 | M0 gate | Accepted | `package.json`, `tsconfig.json`, `src/`, `test/` |
| P01-B02 | CI | Lint, typecheck, unit test, build ve dependency scan pipeline'ını kur | SRE/Platform Lead | 3 | P01-B01 | Accepted | `.github/workflows/ci.yml` |
| P01-B03 | Config | Validated config schema ve environment ayrımını kur | SRE/Platform Lead | 3 | P01-B01 | Accepted | `src/config/env.ts`, `.env.example` |
| P01-B04 | Auth | Provider-agnostic auth context ve test identity adapter'ı oluştur | Backend Lead | 4 | P00-B12 | Accepted | `src/shared/auth.ts`, `src/plugins/auth.ts` |
| P01-B05 | Database | PostgreSQL client, migration ve connection health'i kur | Backend Lead | 3 | P01-B03 | Accepted | `src/database/client.ts`, `src/database/migrator.ts`, `src/database/plugin.ts`, `src/database/cli.ts` |
| P01-B06 | Database | Core domain tablolarını oluştur | Backend Lead | 8 | P01-B05, P00-B05 | Accepted | `src/database/migrations/001_core_schema.sql` |
| P01-B07 | Database | Idempotency, outbox, audit ve usage event tablolarını oluştur | Backend Lead | 6 | P01-B06, P00-B08 | Accepted | `src/database/migrations/001_core_schema.sql` |
| P01-B08 | Queue | Redis connection, queue prefix, producer/consumer helper'larını kur | Backend Lead | 4 | P01-B03, P00-B09 | Accepted | `src/queue/runtime.ts`, `src/queue/plugin.ts`, `src/config/env.ts` |
| P01-B09 | Queue | Message envelope, schema validation ve queue routing'i uygula | Backend Lead | 5 | P01-B08, P00-B09 | Accepted | `src/queue/contracts.ts`, `test/queue/contracts.test.ts` |
| P01-B10 | Queue | Outbox publisher ve publish retry/reconcile mekanizmasını kur | SRE/Platform Lead | 6 | P01-B07, P01-B09 | Accepted | `src/database/repositories/outbox-repository.ts`, `src/queue/outbox-publisher.ts`, `test/queue/outbox-publisher.test.ts` |
| P01-B11 | API Foundation | RequestId, correlation/trace baseline, error mapping ve pagination middleware'ini kur | Backend Lead | 5 | P01-B03, P00-B07, P00-B15 | Accepted | `src/app.ts`, `src/shared/http.ts`, `src/plugins/observability.ts` |
| P01-B12 | API | Project, Target ve Schema endpoint'lerini geliştir | Backend Lead | 8 | P01-B06, P01-B11 | Accepted | `src/routes/resources.ts`, `src/services/resource-service.ts`, tenant-scoped repositories, `test/resources.test.ts` |
| P01-B13 | API | Job create/detail/cancel/retry endpoint'lerini geliştir | Backend Lead | 8 | P01-B06, P01-B09, P01-B11 | Accepted | `src/database/repositories/job-repository.ts`, `src/services/job-service.ts`, `src/routes/jobs.ts`, `test/jobs.test.ts` |
| P01-B14 | Orchestrator | Job command consumer ve initial task planner'ı geliştir | Backend Lead | 8 | P01-B09, P01-B13 | Accepted | `src/orchestrator/orchestrator.ts`, `src/database/repositories/task-repository.ts`, `test/orchestrator/orchestrator.test.ts` |
| P01-B15 | Orchestrator | Lifecycle transition, optimistic lock ve result consumer'ı geliştir | Backend Lead | 8 | P01-B06, P00-B10 | Accepted | `src/orchestrator/lifecycle.ts`, `src/orchestrator/orchestrator.ts`, lifecycle tests |
| P01-B16 | Worker | Deterministic mock worker handler ve result correlation akışını oluştur | Backend Lead | 6 | P01-B09, P01-B14 | Accepted with condition | `src/workers/mock-worker.ts`; gerçek lease/heartbeat runtime'ı sonraki worker hardening koşuludur |
| P01-B17 | Storage | S3-compatible/local test storage adapter ve artifact metadata'yı kur | SRE/Platform Lead | 5 | P01-B03, P00-B17 | Accepted | `src/storage/provider.ts`, `src/storage/filesystem-provider.ts`, `src/storage/factory.ts`, `test/storage/provider.test.ts` |
| P01-B18 | Observability | Structured logger, correlation/request metric baseline'ını kur; exporter sınırını belgelemek | SRE/Platform Lead | 5 | P01-B11, P00-B15 | Accepted with condition | `src/plugins/observability.ts`, `src/shared/metrics.ts`; Phase 1'de harici OTel exporter yok |
| P01-B19 | Security | Tenant negative test, secret redaction ve SSRF policy test'lerini ekle | Security Lead | 6 | P01-B04, P01-B12, P01-B16 | Accepted | `test/security/egress-policy.test.ts`, `test/security/redaction.test.ts`, `test/database/repository.test.ts`, `test/resources.test.ts`, `src/security/` |
| P01-B20 | QA | API/queue/orchestrator/mock worker/storage E2E smoke suite | QA Lead | 8 | P01-B10, P01-B15, P01-B17, P01-B18 | Accepted with condition | `test/e2e-smoke.test.ts` in-process; `scripts/integration-smoke.ts` real dependency runner; live run pending |
| P01-B21 | Operations | Local/staging runbook, health/readiness ve rollback planı | SRE/Platform Lead | 4 | P01-B18, P01-B20 | Accepted | `docs/phase-1-backend-operations.md`, `infra/docker-compose.yml` |
| P01-B22 | Gate | Phase 1 Core Platform MVP gate review | Engineering Manager | 2 | P01-B20, P01-B21 | Accepted — CONDITIONAL GO | `docs/phase-1-m1-gate.md`; öneri `CONDITIONAL GO` |

## Foundation kalite kanıtı

Son doğrulamada aşağıdaki kontroller başarıyla tamamlanmıştır:

| Kontrol | Sonuç |
|---|---|
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test --run` | Pass — 15 test dosyası, 73 test |
| `pnpm test:smoke` | Pass — 3 in-process backend smoke senaryosu |
| `pnpm test:integration` | Kontrollü skip — PostgreSQL `127.0.0.1:5432` mevcut değil; `INTEGRATION_REQUIRED=true` ile fail-fast |
| `pnpm build` | Pass |
| Migration asset copy | Pass — `dist/database/migrations/001_core_schema.sql` |
| Production auth guard | Pass — production `AUTH_MODE=external` zorunlu |
| Header auth test adapter | Pass |
| Health/readiness endpoint'leri | Pass — live dependency readiness staging'de ayrıca doğrulanacak |
| Request ID/API version header | Pass |
| Structured request log ve düşük cardinality metric | Pass — exporter Phase 1 dışında |

## Açık koşullar ve risk kaydı

| Risk/koşul | Etki | Kapatma kriteri | Durum |
|---|---|---|---|
| Gerçek PostgreSQL migration ve API persistence çalıştırılmadı | M1 live E2E kanıtı eksik | PostgreSQL ile `pnpm test:integration` başarılı | Open |
| Gerçek Redis/BullMQ publish/consume çalıştırılmadı | Queue delivery kanıtı eksik | Redis ile integration runner başarılı | Open |
| Mock worker lease/heartbeat runtime'ı yok | Worker lost/recovery davranışı ertelenmiş | Worker registry, lease renewal ve heartbeat testleri | Open / next hardening |
| DNS hostname'in private IP'ye çözülmesi policy katmanında yapılmıyor | SSRF savunmasının worker egress katmanında tamamlanması gerekiyor | HTTP worker'da DNS resolution ve post-resolution IP policy | Open / HTTP worker phase |
| S3 provider adapter'ı uygulanmadı | Production artifact persistence ertelenmiş | S3-compatible provider contract/E2E | Deferred |
| Harici trace exporter yok | Distributed trace backend'e export yok | OTel/no-op trace abstraction ve exporter kararı | Open / observability hardening |

## Kullanıcı onayı ve M1 review notu

Kullanıcı tarafından review paketi **onaylandı**. Kod tabanı ve in-process kalite kanıtı M1 Core Platform temelinin review edilmesini desteklemektedir. Bununla birlikte sandbox ortamında PostgreSQL ve Redis servisi bulunmadığı için gerçek DB/queue E2E henüz çalıştırılmamıştır. Bu nedenle gate dokümanında `GO` değil, açık koşulları bulunan `CONDITIONAL GO` önerilmektedir.

## References

[1]: ../../scraping-platform-docs/docs/backend/phase-0-m0-phase1-handover.md "Phase 1 backend handover"
[2]: ../../scraping-platform-docs/docs/backend/phase-0-m0-gate-signoff.md "M0 gate sign-off"
[3]: ../../scraping-platform-docs/docs/backend/phase-0-m0-core-domain.md "Core domain model"
[4]: ../../scraping-platform-docs/docs/backend/phase-0-m0-api-contract.md "Backend API contract"
[5]: ../../scraping-platform-docs/docs/backend/phase-0-m0-queue-contract.md "Queue contract"
