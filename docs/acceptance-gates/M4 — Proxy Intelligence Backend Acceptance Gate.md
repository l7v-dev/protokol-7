# M4 — Proxy Intelligence Backend Acceptance Gate

**Program:** Scraping Platform  
**Kapsam:** Backend-only  
**Milestone:** M4 — Proxy Intelligence Ready  
**Durum:** Closed — user approved  
**Karar:** `CONDITIONAL GO` — kullanıcı onaylı

## 1. Gate amacı

Bu gate, provider-neutral Proxy Intelligence backend'inin provider contract, opaque credential lifecycle, catalog/capability/geo policy, lease/sticky/rotation/quarantine, health scoring, deterministic selection, request/GB/lease cost metering ve kontrollü failure response kapsamlarını değerlendirir.

Gate'in amacı production vendor onboarding'ini varsaymak değildir. Gerçek PostgreSQL/Redis servisleri ve canlı provider credential'ları sandbox'ta bulunmadığından distributed persistence, live vendor E2E ve production traffic readiness açık koşul olarak korunur.

> **M4 kararı:** Local contract, security ve deterministic behavior kanıtları ile backend hardening'e devam edilebilir; gerçek provider ve distributed infrastructure doğrulaması tamamlanmadan production proxy traffic başlatılamaz.

## 2. Exit criteria değerlendirmesi

| Exit criterion | Kanıt | Karar |
|---|---|---|
| Provider contract | `src/proxy/contracts.ts`, P04-B01 review | PASS — provider-neutral interface |
| Opaque credentials | `src/proxy/credentials.ts`, credential tests | PASS — raw secret platform state'ine yazılmıyor |
| Catalog/capability/geo policy | `src/proxy/catalog.ts`, catalog tests | PASS — eligibility selection öncesi uygulanıyor |
| Lease lifecycle | `src/proxy/lease-manager.ts`, lease tests | PASS — sticky, expiry, quarantine, rotation ve tenant scope |
| Health registry | `src/proxy/health.ts`, health tests | PASS — bounded rolling health score |
| Deterministic selection | `src/proxy/selection.ts`, selection tests | PASS — health/cost score, quarantine exclusion, proxyId tie-break |
| Cost metering | `src/proxy/cost.ts`, cost tests | PASS — request/GB/lease, tariff snapshot, attempt/job attribution |
| Fake provider conformance | `src/proxy/fake-provider.ts`, `test/proxy/fake-provider.test.ts` | PASS — contract double ve mutable state isolation |
| Failure injection | Fake provider `failNext`, conformance tests | PASS — bounded retryable failure ve deterministic recovery |
| Operations | `docs/phase-4-proxy-intelligence-operations.md` | PASS — onboarding, incident, quota, rollback runbook |
| Full DB/queue E2E | `scripts/integration-smoke.ts` | CONDITIONAL — Postgres/Redis sandbox'ta yok |
| Live provider vendor E2E | — | OPEN — gerçek provider kullanılmadı |
| Distributed catalog/lease/health | — | OPEN — process-local reference implementations |
| Production credential/vault/S3 | — | OPEN — gerçek secret provider ve S3 bağlanmadı |

## 3. Otomatik kalite kanıtı

Son tam çalıştırmada **35 test dosyası / 160 test** başarılıdır. `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` başarılıdır. Proxy-specific suite; catalog, credential, lease manager, health, selection, cost meter ve fake provider conformance testlerini kapsar.

Gerçek Chromium/Playwright browser fixture testi de tam regression içinde başarılıdır. Bu kanıt M3'ten devralınan browser runtime davranışını gösterir; BrowserWorker'ın gerçek PostgreSQL/Redis queue zincirine bağlandığını göstermez.

## 4. Security ve abuse guardrail değerlendirmesi

| Guardrail | Gate sonucu |
|---|---|
| Raw provider secret persistence/log/queue/trace/artifact | PASS — opaque reference boundary ve redaction testleri |
| Tenant isolation | PASS — credential, catalog, lease, health selection ve cost summary scope'ları |
| Private/loopback/metadata target | PASS — M1/M2/M3 egress policy devralındı |
| Capability/geo bypass | PASS — selection eligibility öncesi filtreleniyor |
| Lease expiry/quarantine reuse | PASS — inactive/quarantined lease yeni kullanım için dönmüyor |
| Automatic unsafe failover | PASS — policy error terminal; failover yalnız eligible candidate ile |
| CAPTCHA/anti-bot bypass | PASS — bypass/automation uygulanmıyor |
| Cost event secret metadata | PASS — secret isimleri validation'da reddediliyor |

## 5. Açık koşullar

| ID | Koşul | Sahip | Kapanış kriteri |
|---|---|---|---|
| C-M04-01 | Gerçek provider adapter ve staging conformance | Platform/SRE | Credential reference, capability, acquire/release/quarantine/health/rotate staging kanıtı |
| C-M04-02 | PostgreSQL usage event persistence | Backend/SRE | `usage_events` insert, `(tenant_id, idempotency_key, category)` conflict ve transaction E2E |
| C-M04-03 | Redis/BullMQ cost event flow | Backend/SRE | At-least-once event publish/consume ve duplicate-safe persistence |
| C-M04-04 | Distributed catalog/lease/health | SRE | Multi-worker atomic lease, expiry recovery ve health consistency |
| C-M04-05 | Job cost rollup | FinOps/Backend | Attempt event'lerinin transactional `jobs.cost_summary_json` rollup'ı |
| C-M04-06 | Provider quota/tariff registry | FinOps/SRE | Versioned tariff, quota alert, missing-rate fail-safe |
| C-M04-07 | Production secret provider and S3 | Security/Platform | Vault/secret manager, private artifact storage, DLP/rotation kabulü |
| C-M04-08 | Provider incident/rollback drill | SRE/QA | Disable, quarantine, rotate, rollback ve audit evidence |
| C-M04-09 | Inherited M1–M3 conditions | Backend/SRE | Full API → DB → outbox → queue → worker → DB E2E ve browser hooks |

## 6. Release kararı

P04-B08 için öneri **`CONDITIONAL GO`**'dur. Fake provider conformance ve failure injection kanıtları, provider adapter boundary'sinin ve bounded failure semantics'inin local seviyede çalıştığını gösterir. Operations runbook provider onboarding, credential, quota, health, quarantine, incident ve rollback kontrol noktalarını tanımlar.

Buna karşın canlı provider, gerçek credential vault, persistent/distributed catalog/lease/health, transactional usage events, Postgres/Redis E2E ve production alert/rollback drill henüz çalıştırılmamıştır. Bu nedenle M4, production-ready veya live vendor-ready olarak işaretlenemez.

M4 kapanışı için önce bu review paketi kullanıcı tarafından onaylanmalı, ardından açık koşullar provision edilerek yeniden gate çalıştırılmalıdır. Kullanıcı onayı yalnız mevcut backend hardening paketinin kabulüdür; canlı vendor veya production deployment onayı değildir.

## 7. Sign-off

| Rol | İsim | Karar | Tarih |
|---|---|---|---|
| Engineering Manager | — | Bekliyor | 2026-08-26 |
| Backend Lead | — | Öneri: Conditional GO | 2026-08-26 |
| Security Lead | — | Öneri: Conditional GO | 2026-08-26 |
| SRE/Platform Lead | — | Öneri: Conditional GO | 2026-08-26 |
| QA Lead | — | Öneri: Conditional GO | 2026-08-26 |
| Business Owner / User | — | Onaylandı — Conditional GO | 2026-08-26 |

## References

[1]: ./phase-4-proxy-intelligence-task-board.md "Phase 4 Proxy Intelligence task board"
[2]: ./phase-4-proxy-intelligence-p04-b01-review.md "P04-B01 provider contract"
[3]: ./phase-4-proxy-intelligence-p04-b02-review.md "P04-B02 credential lifecycle"
[4]: ./phase-4-proxy-intelligence-p04-b03-review.md "P04-B03 catalog ve geo/class policy"
[5]: ./phase-4-proxy-intelligence-p04-b04-review.md "P04-B04 lease lifecycle"
[6]: ./phase-4-proxy-intelligence-p04-b05-review.md "P04-B05 health registry"
[7]: ./phase-4-proxy-intelligence-p04-b06-review.md "P04-B06 deterministic selection"
[8]: ./phase-4-proxy-intelligence-p04-b07-review.md "P04-B07 cost metering"
[9]: ./phase-4-proxy-intelligence-operations.md "Phase 4 Proxy Intelligence operations runbook"
[10]: ./phase-3-m3-browser-engine-gate.md "Phase 3 Browser Engine gate"
[11]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[12]: ../../scraping-platform-docs/docs/09-deployment-operations.md "Deployment ve operasyon baseline"
[13]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP roadmap"
