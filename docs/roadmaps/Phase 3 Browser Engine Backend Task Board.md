# Phase 3 Browser Engine Backend Task Board

**Program:** Scraping Platform  
**Milestone:** M3 — Browser Engine Accepted  
**Kapsam:** Backend-only  
**Ön koşul:** GATE-P02-M2 — `CONDITIONAL GO`, kullanıcı onaylı  
**Board sahibi:** Backend Lead  
**Güncel durum:** P03-B08 M3 Browser Engine gate review

## Amaç

Phase 3, HTTP Engine'ın yetersiz kaldığı policy-allowed hedeflerde izole Playwright/Chromium yürütmesini teslim eder. Browser worker; tenant/job/task/attempt scope'unda browser context açar, yalnız deklaratif page actions çalıştırır, network/resource policy uygular ve artifact metadata üretir. Bu fazda serbest kullanıcı JavaScript'i, CAPTCHA/anti-bot bypass, paylaşılan session state ve kontrolsüz dosya/network erişimi yapılmayacaktır.

## Faz çıkış kriterleri

| Kriter | Beklenen kanıt |
|---|---|
| Browser runtime | Playwright/Chromium temiz ortamda açılıp kapanır; version ve health görünür |
| Pool/capacity | Browser/context/page concurrency sınırları korunur; crash sonrası lease recovery vardır |
| Tenant isolation | Her job/attempt ephemeral context kullanır; cookie/storage state cross-tenant görünmez |
| Declarative actions | Goto, waitForSelector, scroll, click/form gibi allowlisted actions çalışır; script eval yoktur |
| Network policy | Navigation, subresource host/content type/size ve redirect policy ile kontrol edilir |
| Artifacts | Screenshot/DOM/PDF/network metadata tenant-scoped private storage'a yazılır |
| Fallback | HTTP başarısızlığında yalnız target policy ve budget izin veriyorsa browser denenir |
| Reliability | Timeout, cancellation, worker loss ve artifact failure sınıflandırılır; retry finite kalır |
| Observability | Browser duration, pages, actions, blocked resources, artifact bytes ve result class görünür |
| Operations | Browser worker runbook, resource limits, cleanup ve rollback kanıtı bulunur |

## Task register

| ID | Workstream | Task | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P03-B01 | Browser/Security | Playwright runtime, browser context ve worker lifecycle sözleşmesini kesinleştir | Backend Lead | 6 | P02-M2 | Accepted | `docs/phase-3-browser-engine-p03-b01-review.md` |
| P03-B02 | Browser/Reliability | Browser pool, concurrency, capacity ve crash recovery mekanizmasını geliştir | Backend Lead | 8 | P03-B01 | Accepted | `src/browser/pool.ts`, `test/browser/pool.test.ts` |
| P03-B03 | Security/Isolation | Tenant-isolated context, session state ve credential reference yönetimini geliştir | Security Lead | 7 | P03-B02 | Accepted | `src/browser/session.ts`, `src/browser/pool.ts`, `test/browser/session.test.ts` |
| P03-B04 | Browser | Declarative page action DSL ve timeout sınırlarını geliştir | Backend Lead | 8 | P03-B03 | Accepted | `src/browser/actions.ts`, `test/browser/actions.test.ts` |
| P03-B05 | Network/Security | Network interception, resource/redirect policy ve content limitlerini ekle | Backend Lead | 6 | P03-B04 | Accepted | `src/browser/network-policy.ts`, `test/browser/network-policy.test.ts` |
| P03-B06 | Artifacts | Screenshot, DOM, PDF ve network artifact metadata akışını geliştir | Backend Lead | 5 | P03-B05 | Accepted | `src/browser/artifacts.ts`, `test/browser/artifacts.test.ts` |
| P03-B07 | Strategy | HTTP-to-browser fallback kararını orkestrasyona bağla | Solution Architect | 5 | P03-B06 | Accepted | `src/browser/fallback.ts`, `src/orchestrator/orchestrator.ts`, `test/browser/fallback.test.ts`, `test/orchestrator/orchestrator.test.ts` |
| P03-B08 | Quality/Gate | Browser Engine performance, security, failure injection ve E2E kabulünü yap | QA Lead | 8 | P03-B07 | In Review | `test/browser/playwright-runtime.integration.test.ts`, `docs/phase-3-browser-engine-operations.md`, `docs/phase-3-m3-browser-engine-gate.md` |

## Değiştirilemez guardrail'ler

| Alan | Kural |
|---|---|
| Uyum | Yalnız authorized ve policy-allowed collection; CAPTCHA/anti-bot bypass yok |
| Isolation | Her tenant/job/attempt için ayrı BrowserContext; context veya cookie state paylaşımı yok |
| Execution | Kullanıcı serbest JavaScript'i, eval, shell ve ayrıcalıklı browser protocol erişimi yok |
| Egress | Navigation ve her subresource HTTP/HTTPS, host/port/IP/resource policy'den geçer |
| Session | Credential/session raw değerleri queue, log, trace veya artifact içinde tutulmaz |
| Resource | Browser/page/action/navigation/response/artifact CPU, memory, time ve byte limitiyle çevrilidir |
| Lifecycle | Worker authoritative job state mutasyonu yapmaz; yalnız result envelope üretir |
| Cleanup | Context/page/browser her başarı, hata, timeout ve cancellation yolunda kapatılır |

## Review sırası

Önce P03-B01 runtime/context/worker contract'ı onaylanır. Sonra pool/capacity ve tenant isolation; ardından declarative actions, network policy ve artifact akışı implement edilir. HTTP fallback ve Browser Engine gate yalnız bu kanıtlar toplandıktan sonra review'a alınır.

## References

[1]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[2]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Browser Engine kabul seviyesi"
[3]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 3 Browser Engine task register"
[4]: ../phase-2-m2-http-engine-gate.md "Phase 2 M2 HTTP Engine gate"
