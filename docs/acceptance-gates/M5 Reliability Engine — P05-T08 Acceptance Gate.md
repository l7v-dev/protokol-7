# M5 Reliability Engine — P05-T08 Acceptance Gate

**Program:** Scraping Platform  
**Milestone:** M5 — Reliability Controls Accepted  
**Task:** P05-T08  
**Kapsam:** Backend-only  
**Gate durumu:** Kullanıcı onaylı — `CONDITIONAL GO` / koşullu kapanış  
**Ön koşullar:** P05-T01–P05-T07 kullanıcı onaylı

## 1. Gate kararı özeti

M5 Reliability Engine backend paketi, deterministik failure handling ve local acceptance kanıtları açısından `CONDITIONAL GO` seviyesindedir. Response classifier, compliance guardrail, bounded Retry-After/backoff/jitter, circuit breaker/quarantine, job/task budget, strategy escalation recommendation, secret-safe telemetry ve incident runbook tamamlanmıştır.

Bu karar production-ready, distributed-ready veya live vendor-ready anlamına gelmez. PostgreSQL ve Redis/BullMQ servisleri sandbox'ta mevcut olmadığı için persistence, atomic distributed budget/circuit state, durable telemetry, outbox/event chain ve gerçek deployment rollback doğrulaması açık koşul olarak kalır.

> **Release restriction:** Gerçek provider trafiği, production proxy rotation veya anti-bot challenge üzerinde otomatik strategy escalation; gerçek distributed persistence ve operator rollback drill tamamlanmadan açılmamalıdır.

## 2. Exit criteria matrisi

| Exit criterion | Kanıt | Durum |
|---|---|---|
| Deterministic response taxonomy | P05-T01 classifier + tests | Pass |
| Compliance/anti-bot no-bypass | P05-T02 policy + negative matrix | Pass |
| Bounded Retry-After/backoff/jitter | P05-T03 calculator + worker test | Pass |
| Provider/target circuit breaker | P05-T04 state machine + transport/status integration | Pass |
| Retry/escalation budget | P05-T05 scoped registry + worker exhaustion | Pass |
| Safe strategy recommendation | P05-T06 terminal/fallback/rotation matrix | Pass |
| Secret-safe telemetry | P05-T07 allowlist + bounded recent events | Pass |
| Incident runbook | Updated Proxy Intelligence operations runbook | Pass |
| Controlled provider failure injection | Fake provider `failNext` count and recovery | Pass |
| Circuit recovery smoke | Threshold → open/quarantine → half-open → success | Pass |
| Escalation budget smoke | Two allowed recommendations then exhaustion | Pass |
| Bounded telemetry load smoke | 500 events, bounded recent projection of 50 | Pass |
| Full regression | Lint/typecheck/test/build | Pass; exact result below |
| Real PostgreSQL/Redis E2E | Integration smoke | Open; controlled `SKIPPED` |
| Durable/distributed state | Not provisioned | Open |
| Live provider/vault/S3 | Not provisioned | Open |
| Production alert/rollback drill | Not run | Open |

## 3. P05-T08 smoke kanıtı

`pnpm test:reliability-gate` deterministic harness'ı gerçek vendor credential veya canlı provider çağrısı yapmadan şu kontrolleri gerçekleştirir:

| Kontrol | Sonuç |
|---|---|
| Fake provider acquire failure injection | İlk 2 acquire kontrollü retryable failure, 3. acquire recovery |
| Circuit recovery | Threshold sonrası block, reset sonrası tek half-open probe, success ile close |
| Escalation budget | 2 recommendation, 3. çağrıda `BUDGET_EXHAUSTED` |
| Telemetry projection | 500 event input, bounded 50 recent events |
| Secret surface | Harness raw secret/credential kullanmaz |

Harness çıktısı `gate: P05-T08`, `status: PASS`, dört kontrolün true olduğu JSON raporudur. Bu smoke bir load test cluster'ı, gerçek network chaos veya distributed failover testi değildir.

## 4. Tam regression ve browser kanıtı

P05-T08 değişiklikleri sonrası son tam backend kalite çalışması:

```text
pnpm lint       PASS
pnpm typecheck  PASS
pnpm test --run PASS — 40 test dosyası / 193 test
pnpm build      PASS
```

Gerçek local Chromium/Playwright fixture testi regression içinde başarılıdır. Gerçek PostgreSQL/Redis integration runner sandbox'ta dependency bulunmadığı için önceki kontrollü davranış olan `SKIPPED` durumunu korur; bu sonuç Pass olarak sayılmaz.

## 5. Security ve uyum gate'i

| Guardrail | Gate yorumu |
|---|---|
| Tenant isolation | Local scope registry, plan ve telemetry testleri geçmiştir; distributed DB/Redis isolation açık |
| Secret safety | Raw credential/cookie/auth/response body persistence ve telemetry projection'a alınmaz |
| Private target | HTTP/browser egress policy terminal block uygular |
| CAPTCHA/anti-bot | Terminal block; solve, bypass, fingerprint evasion veya hidden retry yok |
| Retry safety | Retry budget, delay cap ve circuit threshold local olarak bounded |
| Strategy safety | Recommendation execution'dan ayrıdır; caller policy/lease doğrulaması yapmalıdır |
| Cost safety | P04-B07 immutable event model korunur; retry/escalation event rollup persistence yok |
| Audit safety | Safe metadata vardır; durable audit chain henüz yok |

## 6. Production öncesi açık koşullar

M5'ten production proxy traffic'e geçmeden önce gerçek PostgreSQL ve Redis/BullMQ provision edilmelidir. Scoped budget/circuit/quarantine state'leri atomic ve durable hale getirilmeli; usage, audit ve telemetry event'leri outbox/idempotency zinciriyle doğrulanmalıdır. En az bir staging provider contract/conformance, opaque credential rotation, lease expiry, cost metering, alert routing ve rollback drill çalıştırılmalıdır.

M5 gate, gerçek provider veya canlı anti-bot davranışını test etmeyi şart koşmaz; aksine anti-bot bypass yapılmadan terminal handling kanıtı ister. Provider staging'de yalnız yetkili, policy-compliant ve test kapsamına alınmış hedeflerde kontrollü traffic kullanılmalıdır.

## 7. Review kararı talebi

P05-T08 / M5 Reliability Engine gate paketi kullanıcı onayıyla `CONDITIONAL GO` olarak koşullu kapatılmıştır. Phase 5 task board'u M5 koşullu kapanış durumuna güncellenmiştir. P05-T08 onayı açık distributed/live-provider koşullarını kapatmaz; bu koşullar ayrı deployment readiness gate'inde takip edilmelidir.

## References

[1]: ./phase-5-reliability-engine-task-board.md "Phase 5 Reliability Engine task board"
[2]: ./phase-5-reliability-engine-p05-t01-review.md "P05-T01 response classifier"
[3]: ./phase-5-reliability-engine-p05-t02-review.md "P05-T02 compliance guardrail policy"
[4]: ./phase-5-reliability-engine-p05-t03-review.md "P05-T03 backoff/jitter/Retry-After"
[5]: ./phase-5-reliability-engine-p05-t04-review.md "P05-T04 circuit breaker/quarantine"
[6]: ./phase-5-reliability-engine-p05-t05-review.md "P05-T05 retry/escalation budget"
[7]: ./phase-5-reliability-engine-p05-t06-review.md "P05-T06 strategy escalation"
[8]: ./phase-5-reliability-engine-p05-t07-review.md "P05-T07 telemetry/runbook"
[9]: ./phase-4-proxy-intelligence-m4-gate.md "M4 Proxy Intelligence gate"
[10]: ./phase-4-proxy-intelligence-operations.md "Proxy Intelligence operations runbook"
[11]: ../scripts/reliability-gate-smoke.ts "P05-T08 deterministic gate smoke harness"
[12]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP roadmap ve faz planı"
[13]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 5 task register"
