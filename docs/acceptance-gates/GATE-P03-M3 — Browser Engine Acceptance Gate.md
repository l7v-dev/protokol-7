# GATE-P03-M3 — Browser Engine Acceptance Gate

**Program:** Scraping Platform  
**Kapsam:** Backend-only  
**Milestone:** M3 — Browser Engine Accepted  
**Durum:** Closed — user approved  
**Karar:** `CONDITIONAL GO` — kullanıcı onaylı

## 1. Gate amacı

Bu gate, policy-allowed hedeflerde Playwright/Chromium browser runtime, tenant-isolated context/session, declarative actions, network/resource policy, artifact capture ve HTTP-to-browser fallback karar sınırlarının Phase 3 kapsamını karşıladığını değerlendirir. Gate, production proxy/provider, distributed capacity veya tüm PostgreSQL/Redis queue zincirinin tamamlandığı anlamına gelmez.

## 2. Kapsam ve kanıtlar

| Alan | Durum | Kanıt |
|---|---|---|
| Browser runtime abstraction | Tamamlandı | `src/browser/pool.ts`, `src/browser/playwright-runtime.ts` |
| Browser pool/context/page capacity | Tamamlandı, distributed koşullu | Pool implementation ve tests |
| Tenant session isolation | Tamamlandı, gerçek provider koşullu | `src/browser/session.ts`, session tests |
| Declarative page actions | Tamamlandı | `src/browser/actions.ts`, actions tests |
| Network/resource policy | Tamamlandı, real route hook koşullu | `src/browser/network-policy.ts`, network tests |
| Browser artifacts | Tamamlandı, real production storage koşullu | `src/browser/artifacts.ts`, artifact tests |
| HTTP-to-browser fallback | Tamamlandı, full replan koşullu | `src/browser/fallback.ts`, fallback tests |
| Real Chromium launch | PASS | `test/browser/playwright-runtime.integration.test.ts` |
| Browser page actions | PASS | Real Chromium integration: goto, selector wait, fill, click, scroll |
| Screenshot/DOM/PDF capture | PASS | Real Chromium integration ve artifact writer |
| Security negative tests | PASS | Egress, session, action ve network policy suites |
| Operations | Hazır | `docs/phase-3-browser-engine-operations.md` |
| Full PostgreSQL/Redis E2E | Açık koşul | Sandbox'ta dependency servisleri yok |

## 3. Otomatik kalite sonucu

Son doğrulamada **28 test dosyasında 130 test** başarılıdır. `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` başarılıdır. Ayrı gerçek browser suite'i `pnpm exec vitest run test/browser/playwright-runtime.integration.test.ts` ile sistem Chromium (`/usr/bin/chromium`) üzerinde başarılı olmuştur. Bu test; ephemeral local HTTP fixture, Playwright launch, page navigation, selector wait, fill, click, scroll, DOM content, screenshot, PDF, artifact metadata ve pool cleanup akışını doğrular.

## 4. Exit criteria değerlendirmesi

| Exit criterion | Karar | Açıklama |
|---|---|---|
| Playwright/Chromium launch/close | PASS | Gerçek Chromium integration |
| Browser/context/page bounded capacity | PASS | Pool unit/contract suite |
| Tenant/session isolation contract | PASS | Scope mismatch, cookie/header policy ve rollback testleri |
| Declarative action allowlist | PASS | Eval/CDP/shell/restricted action denial |
| Action/navigation/total timeout | PASS | Executor timeout/cancellation suite |
| Network host/port/private/resource policy | PASS | Network policy suite; runtime hook koşullu |
| Redirect revalidation | PASS | Per-hop policy and count guard |
| Content/response byte limit | PASS | Policy unit; wire-level compressed metering koşullu |
| Screenshot/DOM/PDF artifact | PASS | Real Chromium + artifact writer |
| Network artifact sanitization | PASS | Credential/query/hash sanitization suite |
| HTTP fallback anti-bypass | PASS | 401/403/429/CAPTCHA/policy terminal rules |
| Full API → DB → outbox → Redis → browser worker → DB E2E | CONDITIONAL | PostgreSQL/Redis ve BrowserWorker consumer chain açık |

## 5. Açık koşullar

| ID | Koşul | Sahip | Kapanış kriteri |
|---|---|---|---|
| C-P03-01 | BrowserWorker'ın gerçek queue consumer ve result chain'e bağlanması | Backend/SRE | `BROWSER_FETCH` task'ı Redis/BullMQ üzerinden gerçek Chromium worker'a gider ve result DB'de commit edilir |
| C-P03-02 | PostgreSQL/Redis full integration E2E | Backend/SRE | Migration, API, outbox, queue, browser worker ve completion chain geçer |
| C-P03-03 | Playwright network route/response event hook | Backend/Security | Her navigation/subresource policy tarafından allow/abort edilir |
| C-P03-04 | DNS post-resolution/socket address pinning | Security/Backend | A/AAAA resolve ve gerçek socket destination egress policy'den geçer |
| C-P03-05 | Distributed browser capacity/session/budget | SRE | Multi-worker atomic capacity, lease recovery ve budget testleri geçer |
| C-P03-06 | Production credential/session provider ve S3 | Security/Platform | Opaque reference, revocation, audit, private object storage ve DLP kabulü |

## 6. Release kararı

`CONDITIONAL GO` ile Browser Engine backend hardening'ine devam edilebilir. Gerçek Chromium local fixture kanıtı nedeniyle runtime abstraction ve page/artifact davranışı için gate evidence vardır. Ancak browser worker'ın PostgreSQL/Redis orchestrator zincirine gerçek bağlanması, production network hooks, secret provider, S3 ve distributed capacity olmadan production traffic başlatılamaz.

Policy violation, private resource, authentication barrier, CAPTCHA, 401/403/429, credential error veya forbidden action browser fallback ile aşılmaz. Raw cookie, authorization, session value, form secret, page body veya artifact body queue/log/trace'e yazılmaz.

## 7. Sign-off

| Rol | İsim | Karar | Tarih |
|---|---|---|---|
| Engineering Manager | — | Conditional GO — accepted | 2026-08-26 |
| Backend Lead | — | Conditional GO — accepted | 2026-08-26 |
| Security Lead | — | Conditional GO — accepted | 2026-08-26 |
| SRE/Platform Lead | — | Conditional GO — accepted | 2026-08-26 |
| QA Lead | — | Conditional GO — accepted | 2026-08-26 |
| Business Owner / User | — | Onaylandı | 2026-08-26 |

## References

[1]: ./phase-3-browser-engine-task-board.md "Phase 3 Browser Engine task board"
[2]: ./phase-3-browser-engine-operations.md "Phase 3 Browser Engine operations runbook"
[3]: ./phase-3-browser-engine-p03-b07-review.md "P03-B07 HTTP-to-browser fallback strategy"
[4]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[5]: ../../scraping-platform-docs/docs/09-deployment-operations.md "Deployment ve operasyon baseline"
[6]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Browser Engine kabul seviyesi"
[7]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 3 Browser Engine task register"
