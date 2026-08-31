# Phase 4 Proxy Intelligence Backend Task Board

**Program:** Scraping Platform  
**Milestone:** M4 — Proxy Intelligence Ready  
**Kapsam:** Backend-only  
**Ön koşul:** GATE-P03-M3 — `CONDITIONAL GO`, kullanıcı onaylı  
**Board sahibi:** SRE/Platform Lead  
**Güncel durum:** M4 `CONDITIONAL GO` — kullanıcı onaylı

## Amaç

Phase 4, proxy provider abstraction, provider capability, secret-safe credential lifecycle, proxy catalog, geo/class policy, lease, sticky session, rotation, health score, cost signal ve açıklanabilir seçim altyapısını teslim eder. Gerçek provider onboarding'i adapter sözleşmesi ve kontrollü test doubles üzerinden yapılır; provider credential değeri hiçbir zaman database, queue, log, trace veya artifact'e yazılmaz.

Proxy Intelligence, HTTP ve Browser Engine'in üstünde policy-controlled access plan sağlayabilir. Provider veya proxy failure durumunda platform kontrolsüz retry, anti-bot bypass veya policy dışı failover yapmaz.

## Faz çıkış kriterleri

| Kriter | Beklenen kanıt |
|---|---|
| Provider contract | Adapter iş mantığından bağımsız conformance testleri |
| Capability model | Protocol, geo, class, sticky, bandwidth ve auth capability'leri |
| Credential lifecycle | Opaque reference, resolve/use/revoke/rotate ve raw secret redaction |
| Proxy catalog | Provider/proxy class/geo/status ve policy metadata |
| Lease lifecycle | Acquire, sticky bind, heartbeat/expiry, quarantine ve release |
| Selection | Health, geo, capability, cost ve policy input'larıyla deterministic karar |
| Health | Provider/proxy success, latency, failure ve quarantine sinyalleri |
| Cost | Request/GB/lease ölçümü ve attempt/job allocation |
| Failure handling | Provider failure bounded retry; unsafe failover yok |
| Operations | Provider onboarding, quota, rotation, incident ve rollback runbook |

## Task register

| ID | Workstream | Task | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P04-B01 | Proxy/Architecture | ProxyProvider ortak arayüzü ve capability modelini kesinleştir | Solution Architect | 4 | P03-M3 | Accepted | `docs/phase-4-proxy-intelligence-p04-b01-review.md` |
| P04-B02 | Security/Provider | Provider credential ve adapter lifecycle'ını geliştir | SRE/Platform Lead | 6 | P04-B01 | Accepted | `src/proxy/credentials.ts`, `src/proxy/contracts.ts`, `test/proxy/credentials.test.ts` |
| P04-B03 | Proxy/Policy | Proxy catalog, class/geo gereksinimi ve policy modelini oluştur | SRE/Platform Lead | 5 | P04-B02 | Accepted | `src/proxy/catalog.ts`, `test/proxy/catalog.test.ts` |
| P04-B04 | Proxy/Reliability | Lease, sticky session, rotation, expiry ve quarantine lifecycle'ını geliştir | Backend Lead | 6 | P04-B03 | Accepted | `src/proxy/lease-manager.ts`, `src/proxy/contracts.ts`, `test/proxy/lease-manager.test.ts` |
| P04-B05 | Observability | Provider/proxy health score ve başarı oranı hesaplamasını ekle | SRE/Platform Lead | 6 | P04-B04 | Accepted | `src/proxy/health.ts`, `test/proxy/health.test.ts` |
| P04-B06 | Strategy | Geo, health, capability ve maliyet temelli deterministic selection geliştir | SRE/Platform Lead | 6 | P04-B05 | Accepted | `docs/phase-4-proxy-intelligence-p04-b06-review.md`, `src/proxy/selection.ts`, `test/proxy/selection.test.ts` |
| P04-B07 | FinOps | Proxy request/GB/lease maliyet ölçümünü attempt/job seviyesine bağla | FinOps/Operations | 4 | P04-B06 | Accepted | `docs/phase-4-proxy-intelligence-p04-b07-review.md`, `src/proxy/cost.ts`, `test/proxy/cost.test.ts` |
| P04-B08 | Quality/Gate | Provider integration, failure injection ve M4 acceptance'ını yap | QA Lead | 7 | P04-B07 | Accepted — Conditional GO | `docs/phase-4-proxy-intelligence-m4-gate.md`, `docs/phase-4-proxy-intelligence-operations.md`, `src/proxy/fake-provider.ts`, `test/proxy/fake-provider.test.ts` |

## Değiştirilemez guardrail'ler

| Alan | Kural |
|---|---|
| Credential | Opaque reference only; raw provider secret persistence/log/queue/trace/artifact yok |
| Provider | Adapter contract dışı provider-specific logic core'a alınmaz |
| Egress | Proxy kullanımı target host/port/private-IP policy'yi bypass etmez |
| Lease | Lease attempt/task ile ilişkilidir; expiry/quarantine sonrası yeniden kullanılamaz |
| Sticky session | Tenant/target/job policy izin vermeden paylaşılmaz |
| Failover | Provider failure bounded ve açıklanabilir; anti-bot bypass veya sınırsız rotation yok |
| Geo | Country/region seçimi target policy ve provider capability ile doğrulanır |
| Cost | Provider/request/GB/lease maliyeti source ve unit ile ölçülür |
| Audit | Acquire, release, quarantine, rotate ve provider disable olayları audit metadata'sı üretir |
| Isolation | Tenant scope'u provider catalog, lease ve cost event'lerinde korunur |

## Review sırası

Önce P04-B01 provider/capability contract onaylanır. Sonra credential lifecycle ve catalog/policy; ardından lease/sticky/rotation, health/scoring, cost attribution ve failure injection uygulanır. Gerçek provider adapter onboarding'i ancak ortak contract ve M4 gate testleri hazır olduğunda başlatılır.

## References

[1]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[2]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Proxy Intelligence seviyesi"
[3]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 4 Proxy Intelligence task register"
[4]: ../phase-3-m3-browser-engine-gate.md "Phase 3 M3 Browser Engine gate"
