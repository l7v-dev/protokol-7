# Phase 5 Reliability Engine Backend Task Board

**Program:** Scraping Platform  
**Milestone:** M5 — Reliability Controls Accepted  
**Kapsam:** Backend-only  
**Ön koşul:** M4 Proxy Intelligence — `CONDITIONAL GO`, kullanıcı onaylı  
**Board sahibi:** SRE/Platform Lead  
**Güncel durum:** M5 Reliability Engine — CONDITIONAL GO / koşullu kapanış

## Amaç

Phase 5, saldırgan anti-bot aşma davranışı yerine deterministik hata sınıflandırması, uyumlu erişim kontrolü, Retry-After/backoff, circuit breaker, provider/target quarantine, retry budget ve güvenli strategy escalation altyapısını teslim eder. Policy violation, authentication barrier, CAPTCHA/anti-bot barrier, private target ve benzeri durumlar terminal veya açıkça sınıflandırılmış sonuç olarak ele alınır; otomatik bypass uygulanmaz.

## Faz çıkış kriterleri

| Kriter | Beklenen kanıt |
|---|---|
| Response taxonomy | HTTP/provider/browser sonucu aynı anlamlı sınıflara map edilir |
| Compliance guardrail | CAPTCHA, anti-bot, authentication ve policy barrier bypass edilmez |
| Retry/backoff | Retry-After, exponential backoff, jitter ve budget sınırları |
| Circuit breaker | Provider/target hata eşiğinde trafik kontrollü durur |
| Quarantine | Unsafe provider/target state'i yeniden denemeyi engeller |
| Escalation | Yalnız izinli strategy ve sınırlı attempt ile çalışır |
| Cost control | Retry/escalation maliyeti budget ile sınırlıdır |
| Operations | Incident, degradation ve recovery runbook'u |

## Task register

| ID | Workstream | Task | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P05-T01 | Reliability | Response classifier ve erişim sonucu taxonomy'sini geliştir | SRE/Platform Lead | 6 | P04-B08 | Accepted | `docs/phase-5-reliability-engine-p05-t01-review.md`, `src/http/reliability.ts`, `test/http/reliability.test.ts` |
| P05-T02 | Compliance | Uyumlu erişim ve anti-bot guardrail policy'sini onayla | Compliance/Legal | 4 | P05-T01 | Accepted | `docs/phase-5-reliability-engine-p05-t02-review.md`, `src/security/compliance-policy.ts`, `src/browser/fallback.ts`, `test/security/compliance-policy.test.ts`, `test/browser/fallback.test.ts` |
| P05-T03 | Reliability | Exponential backoff, jitter ve Retry-After desteğini uygula | SRE/Platform Lead | 5 | P05-T02 | Accepted | `docs/phase-5-reliability-engine-p05-t03-review.md`, `src/http/reliability.ts`, `src/http/http-client.ts`, `src/workers/http-worker.ts`, `test/http/reliability.test.ts`, `test/http/http-worker.test.ts` |
| P05-T04 | Reliability | Circuit breaker ve provider/target quarantine mekanizmasını kur | SRE/Platform Lead | 6 | P05-T03 | Accepted | `docs/phase-5-reliability-engine-p05-t04-review.md`, `src/http/circuit-breaker.ts`, `src/http/reliability.ts`, `test/http/circuit-breaker.test.ts`, `test/http/reliability.test.ts` |
| P05-T05 | Cost Control | Job/task retry budget ve escalation budget uygula | Product Owner | 5 | P05-T04 | Accepted | `docs/phase-5-reliability-engine-p05-t05-review.md`, `src/http/budget.ts`, `src/http/http-client.ts`, `src/http/reliability.ts`, `src/workers/http-worker.ts`, `test/http/budget.test.ts`, `test/http/http-worker.test.ts` |
| P05-T06 | Strategy | Güvenli strategy escalation akışını tamamla | Solution Architect | 5 | P05-T05 | Accepted | `docs/phase-5-reliability-engine-p05-t06-review.md`, `src/http/strategy-escalation.ts`, `src/http/http-client.ts`, `src/workers/http-worker.ts`, `test/http/strategy-escalation.test.ts`, `test/http/http-worker.test.ts` |
| P05-T07 | Operations | Reliability dashboard ve incident runbook güncelle | SRE/Platform Lead | 4 | P05-T06 | Accepted | `docs/phase-5-reliability-engine-p05-t07-review.md`, `src/shared/metrics.ts`, `src/http/telemetry.ts`, `src/http/reliability.ts`, `src/workers/http-worker.ts`, `docs/phase-4-proxy-intelligence-operations.md`, `test/http/telemetry.test.ts`, `test/http/reliability.test.ts` |
| P05-T08 | Quality/Gate | Failure injection, load ve regression kabulünü yap | QA Lead | 8 | P05-T07 | Accepted — CONDITIONAL GO | `docs/phase-5-reliability-engine-m5-gate.md`, `scripts/reliability-gate-smoke.ts`, `package.json` (`test:reliability-gate`) |

## Değiştirilemez guardrail'ler

| Alan | Kural |
|---|---|
| Policy | Policy violation terminaldir; otomatik retry veya bypass yoktur |
| Anti-bot | CAPTCHA, challenge veya anti-bot barrier aşılmaz |
| Authentication | Yetkisiz credential/session denemesi yapılmaz |
| Egress | Private, loopback, metadata veya policy dışı hedefe retry yoktur |
| Retry | Yalnız retryable sınıflar ve açık budget içinde tekrar edilir |
| Quarantine | Provider/target quarantine sonrası otomatik unsafe failover yoktur |
| Tenant | Error, budget, quarantine ve telemetry tenant scope'unda tutulur |
| Secret | Raw credential, cookie, authorization ve response secret loglanmaz |

## Review sırası

Önce P05-T01 response taxonomy onaylanır. Sonra compliance guardrail, backoff/jitter, circuit breaker/quarantine, retry budget ve strategy escalation sırasıyla ele alınır. P05-T08 gate'i; P04 M4 açık koşulları ve M1–M3 distributed integration koşulları kapanmadan production readiness anlamına gelmez.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 5 task register"
[2]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP roadmap ve faz planı"
[3]: ../phase-4-proxy-intelligence-m4-gate.md "Phase 4 Proxy Intelligence M4 gate"
[4]: ../phase-2-http-engine-p02-b06-b07-review.md "HTTP reliability baseline"
[5]: ../phase-3-m3-browser-engine-gate.md "Browser Engine gate ve inherited koşullar"
