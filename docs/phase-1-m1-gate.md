# Phase 1 — M1 Core Platform MVP Gate

**Program:** Scraping Platform  
**Kapsam:** Backend-only  
**Gate ID:** GATE-P01-M1  
**Karar:** `CONDITIONAL GO` — kullanıcı onaylı

## 1. Gate amacı

Bu gate, Phase 1 backend temelinin M0'da onaylanan mimari ve güvenlik guardrail'leri üzerinde ilerleyebildiğini doğrular. Gate, production readiness anlamına gelmez. Gerçek PostgreSQL/Redis bağlantısı, gerçek provider onboarding'i, browser worker, crawler ve production hardening sonraki kabul noktalarının kapsamındadır.

## 2. Tamamlanan backend kapsamı

| Alan | Durum | Kanıt |
|---|---|---|
| Repository ve package scripts | Hazır | `package.json`, `tsconfig.json` |
| CI kalite workflow'u | Hazır | `.github/workflows/ci.yml` |
| Typed config ve production auth guard | Hazır | `src/config/env.ts` |
| Auth context/RBAC foundation | Hazır | `src/shared/auth.ts`, `src/plugins/auth.ts`, `src/shared/authz.ts` |
| Common error/correlation/observability | Hazır | `src/shared/http.ts`, `src/plugins/observability.ts` |
| PostgreSQL client/migration/schema | Hazır | `src/database/` |
| Redis/BullMQ/envelope/outbox | Hazır | `src/queue/` |
| Project/Target/Schema API | Hazır | `src/routes/resources.ts` |
| Job command API | Hazır | `src/routes/jobs.ts`, `src/services/job-service.ts` |
| Orchestrator/lifecycle/mock worker | Hazır | `src/orchestrator/`, `src/workers/` |
| Storage abstraction | Hazır | `src/storage/` |
| Security helpers | Hazır | `src/security/` |

## 3. Kalite kanıtı

| Kontrol | Sonuç |
|---|---|
| ESLint | Pass |
| TypeScript noEmit typecheck | Pass |
| Unit/foundation/security/smoke tests | Pass — son doğrulamada 15 dosya / 74 test |
| Production auth guard | Pass |
| Build | Pass |
| Migration asset copy | Pass |
| Root Fastify Database/Queue decorator scope | Pass — sibling encapsulation riski giderildi |
| Target/Schema Project parent precheck | Pass — FK/404 mapping eklendi |
| ACTIVE target / PUBLISHED schema job guard | Pass — service + unit test |
| Stale/foreign task result guard | Pass — tenant+task+attempt binding |
| Live PostgreSQL migration | Pending — sandbox ortamında servis yok |
| Live Redis publish/consume | Pending — sandbox ortamında servis yok |

## 4. Exit criteria

Gate'in `GO` veya `CONDITIONAL GO` olabilmesi için aşağıdaki koşullar sağlanmalıdır:

| ID | Kriter | Sonuç |
|---|---|---|
| M1-EC-01 | Lint, typecheck, test ve build başarılı | Pass |
| M1-EC-02 | Tenant scope API, repository, queue ve object key sınırında tanımlı | Pass — kod ve test seviyesi |
| M1-EC-03 | Raw secret response/log/queue/storage içine yazılmıyor | Pass — redaction/policy helper seviyesi |
| M1-EC-04 | Job create/cancel/retry idempotency sözleşmesine bağlı | Pass — kod ve unit test seviyesi |
| M1-EC-05 | Outbox publish failure kayıt kaybı oluşturmuyor | Pass — publisher unit test seviyesi |
| M1-EC-06 | Stale worker/result state'i ezemiyor | Pass — task+attempt ownership/status guard; live queue/DB E2E pending |
| M1-EC-07 | PostgreSQL migration staging'de uygulanıyor | Pending |
| M1-EC-08 | Redis/BullMQ gerçek publish/consume staging'de doğrulanıyor | Pending |
| M1-EC-09 | API → queue → orchestrator → mock worker → result smoke path staging'de çalışıyor | Pending — in-process smoke pass, real dependency pending |

## 5. Önerilen gate kararı

`CONDITIONAL GO` önerilir. Kod tabanının sonraki backend geliştirmesine geçmesi için yeterli temel ve otomatik kalite kanıtı vardır. Ancak staging dependency smoke tamamlanmadan production veya gerçek scraping/provider erişimi başlatılmaz. `pnpm test:integration` runner'ı hazırdır; sandbox doğrulamasında PostgreSQL `127.0.0.1:5432` bulunmadığı için kontrollü `SKIPPED` üretmiştir. `INTEGRATION_REQUIRED=true` ile aynı eksiklik fail-fast olarak raporlanmıştır.

Koşullar P01-B20 E2E smoke, P01-B21 operations runbook validation ve gerçek PostgreSQL/Redis staging bağlantısı ile kapatılmalıdır. Bu koşullar kapanmadan M1 gate `GO` olarak değiştirilmemelidir. Kullanıcı review paketi bu koşullu karar ile onaylamıştır.

## 6. Sonraki faza giriş task'ları

| Task | Açıklama | Owner |
|---|---|---|
| P01-B19 | Tenant, secret, SSRF ve policy negative testlerini genişlet | Security Lead |
| P01-B20 | Gerçek PostgreSQL/Redis staging E2E smoke suite | QA Lead |
| P01-B21 | Local/staging runbook validation ve rollback rehearsal | SRE/Platform Lead |
| P01-B22 | M1 gate review ve karar kaydı | Engineering Manager |

## 7. Sign-off

| Rol | İsim | Karar | Tarih |
|---|---|---|---|
| Engineering Manager | — | Conditional GO — accepted | 2026-08-26 |
| Backend Lead | — | Conditional GO — accepted | 2026-08-26 |
| Security Lead | — | Conditional GO — accepted | 2026-08-26 |
| SRE/Platform Lead | — | Conditional GO — accepted | 2026-08-26 |
| Business Owner / User | — | Onaylandı | 2026-08-26 |

## References

[1]: ./phase-1-backend-task-board.md "Phase 1 backend task board"
[2]: ./phase-1-backend-operations.md "Phase 1 backend operations runbook"
[3]: ../../scraping-platform-docs/docs/backend/phase-0-m0-gate-signoff.md "M0 architecture baseline gate"
[4]: ../../scraping-platform-docs/docs/backend/phase-0-m0-backend-security.md "M0 backend security baseline"
[5]: ../../scraping-platform-docs/docs/backend/phase-0-m0-queue-contract.md "M0 queue contract"
