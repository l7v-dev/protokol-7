# P05-T07 — Reliability Telemetry ve Incident Runbook Review

**Program:** Scraping Platform  
**Milestone:** M5 — Reliability Controls Accepted  
**Task:** P05-T07  
**Durum:** In Review  
**Kapsam:** Backend-only; frontend/Control Center UI yoktur  
**Bağımlılık:** P05-T06 — review onaylı

## 1. Teslim özeti

P05-T07, reliability olaylarını backend içinde secret-safe metric counter ve bounded recent-event projection olarak toplar. Collector; success, failure, retry, budget exhaustion, strategy escalation ve circuit block olaylarını sabit metric isimleri ve enum label'larıyla yansıtır. Raw response, URL/query, cookie, authorization, credential, endpoint veya provider secret telemetry state'ine alınmaz.

HTTP reliability controller success/failure/circuit block olaylarını collector'a bağlar. HTTP worker retry budget ve strategy escalation kararlarını collector'a aktarır. Mevcut Phase 4 Proxy Intelligence operations runbook'una reliability telemetry, incident triage, alarm ve recovery prosedürleri eklenmiştir.

> **Operational guardrail:** Telemetry yalnız normalize edilmiş durum ve güvenli scope metadata'sı taşır; anti-bot, authentication veya policy block sonuçlarının bypass edilmesi için kullanılmaz.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/shared/metrics.ts` | Reliability metric counter isimleri |
| `src/http/telemetry.ts` | Typed event collector, safe code allowlist, bounded recent events ve metric projection |
| `src/http/reliability.ts` | Success/failure/circuit block event entegrasyonu |
| `src/workers/http-worker.ts` | Retry budget ve strategy escalation event entegrasyonu |
| `test/http/telemetry.test.ts` | Counter projection, bounded history, safe code ve validation testleri |
| `test/http/reliability.test.ts` | Controller telemetry integration testi |
| `docs/phase-4-proxy-intelligence-operations.md` | Reliability telemetry ve incident triage prosedürleri |
| `docs/phase-5-reliability-engine-task-board.md` | P05-T07 board durumu |

## 3. Metric contract

| Counter | Label biçimi | Operasyonel anlam |
|---|---|---|
| `reliability_events_total` | `strategy:outcome:accessClass` | Tüm normalize reliability olayları |
| `reliability_failures_total` | `strategy:accessClass` | Failure ve circuit block toplamı |
| `reliability_retries_total` | `strategy:retryOutcome` | Retry allowed veya retry budget exhausted |
| `reliability_escalations_total` | `strategy:escalationAction` | Strategy recommendation veya escalation exhaustion |
| `reliability_circuit_blocks_total` | `strategy:accessClass` | Circuit/quarantine nedeniyle durdurulan operation |

Metric label'ları caller tarafından serbest biçimde oluşturulmaz. Strategy, outcome, access class ve escalation action union'larıyla sınırlıdır. Tenant/job/task/attempt attribution recent event projection'ında bulunabilir; yüksek cardinality production metrics backend'ine doğrudan label olarak aktarılmamalı, trace/log correlation alanı olarak kullanılmalıdır.

## 4. Safe event projection

Collector recent event projection'ında `tenantId`, opsiyonel job/task/attempt/target/provider ID'leri, strategy, access class, outcome, allowlist'teki normalized code, bounded delay source, escalation action, rounded duration ve collector timestamp'i tutar. Ham Retry-After header, response body, URL, query, authorization, cookie veya secret material tutulmaz.

Bilinmeyen veya secret içerebilecek code değerleri metric counter'ı bozmaz; recent event projection'ında `code` alanı çıkarılır. Event input'ta geçersiz tenant, strategy, access class, outcome veya negatif/finite olmayan duration varsa kayıt reddedilir.

## 5. Controller ve worker entegrasyonu

`HttpReliabilityController` operation success'ini `SUCCESS`, classified HTTP/transport failure'ını `FAILURE` ve circuit preflight rejection'ını `CIRCUIT_BLOCKED` olarak kaydeder. Event'ler tenant/job/task/attempt/target scope'uyla correlation için güvenli metadata taşır. Circuit error operation çalıştırılmadan önce kaydedilir.

HTTP worker, retry budget tüketiminde `RETRY_ALLOWED` veya `RETRY_BUDGET_EXHAUSTED`; escalation recommendation üretiminde `STRATEGY_ESCALATION` veya `ESCALATION_BUDGET_EXHAUSTED` kaydeder. P05-T05 finite budget kuralı nedeniyle retry budget verilmemiş retryable HTTP failure implicit unlimited retry olarak kabul edilmez; terminal `RETRY_BUDGET_REQUIRED` sonucu üretilir.

## 6. Incident triage ve alarm prosedürü

| Sinyal | Öncelikli inceleme | Guardrail |
|---|---|---|
| Failure spike | Access class, target/provider scope, classifier ve egress policy | Raw response loglama yok |
| Retry spike | Retry-After source, delay cap, retry budget remaining | Sınırsız requeue yok |
| Circuit block spike | Failure threshold, quarantine source, expiry, half-open probe | Otomatik unsafe rotation yok |
| Escalation spike | Browser/proxy recommendation, escalation budget ve target policy | Recommendation tek başına icra edilmez |
| Anti-bot/policy spike | `ANTI_BOT_BARRIER`, `POLICY_BLOCKED`, bypass sinyali | Terminal sonucu koru; bypass yok |
| Secret leak şüphesi | Log/artifact erişimini kısıtla ve credential reference'ı rotate et | SEV-1 security incident |

Circuit block veya budget exhaustion alarmı geldiğinde önce tenant/target/provider scope'u ayrıştırılır. Operatör expiry ve quarantine kaynağını inceler; manual clear veya re-enable kararı audit reason ile verilir. Yeni provider/engine denemesi policy, lease, circuit ve escalation budget doğrulanmadan çalıştırılmaz.

## 7. Runbook ve recovery sınırı

Phase 4 operations runbook'una reliability telemetry ve incident triage bölümü eklenmiştir. Runbook, metric counter'ların production'da merkezi backend'e yönlendirilmesi gerektiğini ve process-local collector'ın restart sonrasında geçmiş state'i korumadığını açıkça belirtir.

Retry/escalation budget exhaustion sonrası yeni job/attempt başlatılabilir; ancak eski attempt'in cost/audit correlation'ı silinmez. Proxy cost event'leri immutable kalır. Counter reset, manual quarantine clear, tariff correction ve rollback operasyonları yeni audit/adjustment event sözleşmesiyle yapılmalıdır.

## 8. Test kanıtı

`test/http/telemetry.test.ts` içinde **3 test** bulunmaktadır. Testler safe counter projection, recent event boundedness, unknown code redaction, escalation/circuit counter'ları ve invalid event validation davranışlarını doğrular.

`test/http/reliability.test.ts` içinde controller success, failure ve circuit block olaylarının metric'e yansıması doğrulanır. Son tam backend regression sonucu **40 test dosyası / 193 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 9. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Dashboard UI | Özellikle eklenmedi | Kullanıcı talebi dışında kapsam dışı |
| Metrics backend | Process-local `MetricsRegistry` | Postgres/Redis/Prometheus adapter |
| Recent event durability | Bounded in-memory | Durable event/audit pipeline |
| High-cardinality policy | ID'ler event projection'ında, counter label'ında değil | Production observability design |
| Provider/proxy health dashboard | Safe counter contract var; live dashboard yok | P05-T08 |
| Alert routing | Runbook tanımlı; central alert system yok | P05-T08 |
| Load/chaos | Deterministic local tests | P05-T08 |
| Postgres/Redis E2E | Sandbox'ta dependency yok | M5 gate inherited condition |

## 10. Review kararı talebi

P05-T07 backend reliability telemetry ve incident runbook paketi review'a sunulmuştur. Kullanıcı onayı sonrasında P05-T08 failure injection, load/regression acceptance ve M5 gate paketine geçilecektir. Bu paketin onayı canlı dashboard, merkezi alerting veya production observability altyapısının kurulduğu anlamına gelmez.

## References

[1]: ./phase-5-reliability-engine-task-board.md "Phase 5 Reliability Engine task board"
[2]: ./phase-5-reliability-engine-p05-t01-review.md "P05-T01 response classifier"
[3]: ./phase-5-reliability-engine-p05-t02-review.md "P05-T02 compliance guardrail policy"
[4]: ./phase-5-reliability-engine-p05-t03-review.md "P05-T03 backoff/jitter/Retry-After"
[5]: ./phase-5-reliability-engine-p05-t04-review.md "P05-T04 circuit breaker/quarantine"
[6]: ./phase-5-reliability-engine-p05-t05-review.md "P05-T05 retry/escalation budget"
[7]: ./phase-5-reliability-engine-p05-t06-review.md "P05-T06 strategy escalation"
[8]: ./phase-4-proxy-intelligence-operations.md "Proxy Intelligence operations runbook"
[9]: ./phase-4-proxy-intelligence-m4-gate.md "Proxy Intelligence M4 gate"
[10]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP roadmap ve faz planı"
[11]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 5 task register"
