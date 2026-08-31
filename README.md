# Scraping Platform Backend

**Ürün:** Scraping Platform  
**Kapsam:** Backend-only  
**Milestone:** M1 — Core Platform MVP  
**Güncel faz:** Phase 1 — Core Platform Backend  
**Gate durumu:** `CONDITIONAL GO` adayı; gerçek PostgreSQL/Redis E2E bekliyor

## 1. Proje durumu

Bu repository, M0 Architecture Baseline'da onaylanan backend kararlarının uygulama temelidir. Mevcut sürüm; typed runtime config, Fastify server factory, request/correlation context, provider-agnostic auth resolver, ortak error envelope, liveness/readiness endpoint'leri, structured request logging ve düşük cardinality in-memory metric registry içerir.

PostgreSQL domain schema, Redis/BullMQ queue, transactional outbox, Project/Target/Schema API, asynchronous Job command API, Orchestrator, deterministic mock worker ve memory/filesystem storage adapter'ları uygulanmıştır. S3 provider, gerçek dış auth provider, gerçek HTTP/browser worker ve harici trace exporter sonraki hardening/adapter kapsamındadır.

## 2. Gereksinimler

- Node.js 22 veya üzeri
- pnpm 11
- Gerçek integration için PostgreSQL 16+ ve Redis 7+
- Local dependency bootstrap için Docker Compose (opsiyonel)

## 3. Kurulum

```bash
pnpm install
cp .env.example .env
```

`AUTH_MODE=test` yalnızca local/test amaçlıdır. `production` ortamı `AUTH_MODE=external` olmadan başlatılamaz. `STORAGE_MODE=s3` seçildiğinde henüz implemented provider fallback'i yapılmaz; explicit unsupported error üretilir.

## 4. Local dependency ve çalıştırma

Docker mevcutsa PostgreSQL ve Redis'i başlatın:

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm db:migrate
pnpm dev
```

Docker mevcut değilse aynı portlarda çalışan PostgreSQL ve Redis servislerini dışarıdan sağlamanız gerekir. Uygulama database/queue olmadan liveness sunabilir; gerçek kaynak yazımı ve queue akışı dependency bağlantısı gerektirir.

Varsayılan adresler:

| Endpoint | Amaç |
|---|---|
| `GET /health/live` | Process liveness |
| `GET /health/ready` | Baseline readiness |
| `GET /api/v1/health/live` | API scope liveness |
| `GET /api/v1/health/ready` | API scope readiness |
| `GET /api/v1/auth/context` | Auth context smoke endpoint'i |
| `GET /health/database` | PostgreSQL bağlantı health check'i |
| `GET /health/queue` | Redis/BullMQ bağlantı health check'i |

`AUTH_MODE=header` ile API scope test etmek için aşağıdaki header'lar kullanılabilir:

```text
X-Actor-Id: actor_1
X-Tenant-Id: tenant_1
X-Roles: operator,viewer
X-Scopes: job:create,job:read
```

Header auth yalnız local/staging development adapter'ıdır; production auth provider yerine geçmez.

## 5. Database migration

Local veya staging PostgreSQL hazır olduğunda core schema migration'ını şu komutla çalıştırın:

```bash
pnpm db:migrate
```

Migration; Tenant, Project, Target, Schema, Job, Run, Task, Attempt, idempotency, outbox, audit ve usage event tablolarını oluşturur. Migration version kayıtları `schema_migrations` tablosunda tutulur ve aynı migration tekrar uygulanmaz.

## 6. Kalite kapıları ve smoke

```bash
pnpm lint
pnpm typecheck
pnpm test --run
pnpm test:smoke
pnpm build
```

Gerçek PostgreSQL/Redis zincirini çalıştırmak için:

```bash
INTEGRATION_REQUIRED=true pnpm test:integration
```

Integration runner; authenticated test API ile Project → Target → Schema → publish → Job create adımlarını, ardından outbox publish, BullMQ consume, Orchestrator initial task, mock worker result ve `COMPLETED` job read adımlarını doğrular. Dependency yoksa varsayılan davranış kontrollü `SKIPPED` çıktısıdır; `INTEGRATION_REQUIRED=true` ile test fail-fast olur. Sandbox doğrulamasında PostgreSQL `127.0.0.1:5432` bulunmadığı için gerçek E2E `SKIPPED` kalmıştır.

GitHub Actions workflow'u pull request ve `main`/`develop` push'larında lint, typecheck, test ve build kapılarını çalıştırır.

## 7. Kaynak yapısı

| Dizin | Sorumluluk |
|---|---|
| `src/config` | Runtime config schema ve typed config |
| `src/database` | PostgreSQL client, migration ve repository'ler |
| `src/queue` | BullMQ runtime, envelope ve transactional outbox publisher |
| `src/orchestrator` | Job/task lifecycle ve command/result consumer'ları |
| `src/workers` | Network-free deterministic mock worker |
| `src/security` | Secret redaction ve outbound egress policy |
| `src/plugins` | Fastify auth/observability middleware'leri |
| `src/routes` | HTTP route registration |
| `src/shared` | Auth, error, metrics ve ortak tipler |
| `test` | Unit, contract, security ve in-process smoke testleri |
| `scripts` | Gerçek dependency integration smoke runner |
| `infra` | Local infrastructure manifestleri |
| `docs` | Implementation kararları, task board ve operations runbook'ları |

## 8. M1 koşulları ve kapsam sınırları

M1 kod ve in-process kalite kapısından geçmiştir: son doğrulamada **15 test dosyasında 73 test** başarılıdır. Buna rağmen gerçek PostgreSQL migration/persistence ve Redis/BullMQ publish/consume sandbox'ta çalıştırılamadığı için M1 gate kararı koşulludur.

Mock worker result-only ownership, tenant scope, idempotency, outbox duplicate safety, secret redaction, private/loopback/link-local/metadata egress blocking ve lifecycle invalid transition guard'ları korunur. Gerçek worker lease/heartbeat, resolved-IP SSRF kontrolü, S3 adapter ve external trace exporter sonraki hardening/adapter task'larıdır.

## 9. M0 bağlantısı

Uygulama kararları aşağıdaki M0 dokümanlarına bağlıdır:

- `phase-0-m0-backend-baseline.md`
- `phase-0-m0-backend-requirements.md`
- `phase-0-m0-backend-architecture.md`
- `phase-0-m0-service-ownership.md`
- `phase-0-m0-core-domain.md`
- `phase-0-m0-api-contract.md`
- `phase-0-m0-queue-contract.md`
- `phase-0-m0-lifecycle-contract.md`
- `phase-0-m0-backend-security.md`
- `phase-0-m0-observability-standard.md`
- `phase-0-m0-phase1-handover.md`

## 10. Güvenlik notu

Bu backend, yalnız yetkili ve policy tarafından izin verilmiş hedeflere erişim sağlayacak şekilde geliştirilecektir. Raw credential, cookie, session state, authorization header veya provider secret'ı persistence, queue, log, trace veya response içine koymayın. Hedef URL, redirect, port ve resolve edilmiş IP policy katmanında doğrulanmadan dış çağrı yapılmamalıdır. Phase 1 route policy hostname düzeyinde private/metadata hedeflerini engeller; DNS post-resolution kontrolü gerçek HTTP worker egress katmanında tamamlanmalıdır.

## References

[1]: ./docs/phase-1-backend-task-board.md "Phase 1 backend task board"
[2]: ./docs/phase-1-backend-operations.md "Phase 1 backend operations runbook"
[3]: ./docs/phase-1-m1-gate.md "Phase 1 M1 gate"
[4]: ../scraping-platform-docs/docs/backend/phase-0-m0-gate-signoff.md "M0 gate sign-off"
[5]: ../scraping-platform-docs/docs/backend/phase-0-m0-phase1-handover.md "Phase 1 backend handover"
[6]: ../scraping-platform-docs/docs/backend/phase-0-m0-backend-security.md "Backend security baseline"
[7]: ../scraping-platform-docs/docs/backend/phase-0-m0-observability-standard.md "Observability standardı"
