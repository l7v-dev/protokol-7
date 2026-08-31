# M13 — Observability Acceptance Gate

**Program:** Scraping Platform  
**Milestone / Phase:** M13 / Phase 13 — Observability  
**Kapsam:** P13-T01–P13-T08; P13-T05 dashboard/frontend kullanıcı talimatıyla Scope Excluded  
**Durum:** Accepted — kullanıcı onaylı, `CONDITIONAL GO`  
**Gate önerisi:** Açık koşullar korunmak üzere `CONDITIONAL GO`

## 1. Gate özeti

M13, backend-only observability reference contract'larını kapsar: OpenTelemetry-style trace context ve component binding, bounded operational metrics, secret-safe structured log projection, non-dispatching alert decisions, telemetry governance ve sentetik acceptance drill. Phase 13 task register, trace/metric/log/dashboard/alarm/completeness standartlarının uygulanmasını ve P13-T08 için sentetik incident'in doğru alarm/runbook aksiyonunu üretmesini hedefler.[1]

P13-T05 dashboard/frontend yüzeyi kullanıcı talimatıyla Scope Excluded durumundadır; `/home/ubuntu/scraping-platform-operations-site` bu programda değiştirilmemiş, deploy edilmemiş veya sunulmamıştır. Bu istisna Phase 13'ün backend reference-contract gate değerlendirmesinde açıkça korunur.

> M13'teki tüm kabul edilen paketler process-local ve deterministic reference contract niteliğindedir. Contract'lar secret/raw payload, URL, target/record value, credential, token, cookie, authorization veya raw error taşımaz; automatic instrumentation, external export/dispatch veya live operational action yapmaz.

## 2. P13 acceptance kanıtı

| Task | Contract / kanıt | Durum |
|---|---|---|
| P13-T01 | Safe trace context, carrier ve bounded span lifecycle | Accepted |
| P13-T02 | API/queue/worker/proxy/extraction/storage component trace binding | Accepted |
| P13-T03 | Platform/target/worker/extraction/quality metric aggregate | Accepted |
| P13-T04 | Structured log schema, redaction ve deterministic routing | Accepted |
| P13-T05 | Dashboard/frontend operasyon yüzeyi | Scope Excluded — kullanıcı talimatı |
| P13-T06 | Bounded alert rule, severity, on-call route ve runbook decision | Accepted |
| P13-T07 | Telemetry retention, role/scope access ve completeness decision | Accepted |
| P13-T08 | Sentetik observability acceptance ve incident drill gate | Accepted |

## 3. P13-T08 sentetik incident drill kanıtı

P13-T08, API root → worker child trace lineage'ını üretir, 4 worker success ve 1 worker failure metric aggregate'ini değerlendirir, sentetik secret-bearing log attribute'larını output dışında bırakır, `WORKER_FAILURE_RATE_HIGH` alarm kararını ve ilgili on-call/runbook identifier'larını üretir. Ardından trace, metric, structured log ve alert decision signal'ları için completeness/access kontrolü yapılır.

| Kontrol | Deterministic sonuç | Güvenlik/operasyon sınırı |
|---|---|---|
| Trace lineage | Root/child aynı trace-correlation zinciri | SDK/exporter/remote propagation yok |
| Metrics | Worker: 4 success / 1 failure | Process-local counter; telemetry backend yok |
| Log redaction | Authorization ve payload token output'a girmiyor | Raw value veya placeholder taşınmıyor |
| Alert decision | `CRITICAL` / `WORKER_PRIMARY` / `worker-recovery-v1` | Contact, dispatch veya remediation yok |
| Governance | Dört signal complete; SRE role/scope izinli | Session/RBAC enforcement veya data read yok |

`pnpm test:observability-gate` yalnız `P13-T08 PASS` niteliğinde deterministic sentetik smoke çıktısı üretir. Bu, gerçek incident, real on-call delivery veya distributed telemetry E2E anlamına gelmez.

## 4. Conditional GO açık koşulları

| Açık koşul | Neden gate dışında | Tamamlama kanıtı |
|---|---|---|
| Real OpenTelemetry SDK/OTLP trace/metric/log export | Contract katmanı exporter ve collector başlatmaz | TLS/authenticated collector, sampling, remote propagation ve trace backend E2E |
| Persistent telemetry store ve retention execution | Retention yalnız non-destructive review kararına indirgenmiştir | Durable store, retention scheduler, legal hold, purge receipt ve recovery evidence |
| Live RBAC/session enforcement | Access yalnız role/scope decision üretir | Authenticated identity, least-privilege authorization ve cross-tenant access tests |
| On-call notification delivery | P13-T06 external dispatch yapmaz | Approved contact management, rate-limit/dedup, ack/escalation, audit ve delivery receipt |
| Live incident/remediation | P13-T08 sentetik ve side-effect-free drill'dir | Controlled staging failure injection, human approval, runbook execution ve recovery evidence |
| Dashboard/frontend | P13-T05 kullanıcı talimatıyla Scope Excluded | Ayrı onaylı frontend/dashboard scope'u, access control ve UX/UAT kanıtı |
| Distributed service E2E | Sandbox bağımlılık/service doğrulaması içermez | Kontrollü Postgres/Redis/BullMQ/S3/provider/observability stack integration testleri |

## 5. Nihai kalite kapısı

| Komut | Sonuç | Kanıt niteliği |
|---|---|---|
| `pnpm test:observability-gate` | Başarılı — `P13-T08 PASS` | P13-T08 deterministic sentetik observability smoke gate |
| `pnpm lint && pnpm typecheck` | Başarılı | Static quality kapısı |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 89 dosya / 346 test | Final full regression/build |
| `pnpm test:integration` | Controlled `SKIPPED dependency unavailable.` | Sandbox'ta gerçek DB/queue/storage/provider E2E doğrulaması çalışmadı; PASS iddiası değildir |

## 6. Review kararı

P13-T01–P13-T04 ve P13-T06–P13-T08 kullanıcı tarafından onaylanmıştır. Nihai gate komutları başarılıdır; integration kontrolü kontrollü `SKIPPED dependency unavailable.` sonucundadır ve gerçek E2E PASS değildir. Kullanıcı onayı ile M13, bu belgede tanımlı açık koşullar ve P13-T05 Scope Excluded istisnası korunarak **`Accepted — CONDITIONAL GO`** olarak kapatılmıştır. Sıradaki uygulanabilir backend işi Phase 14 / P14-T01 — Usage Event Model & Cost Category Vocabulary olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 13 Observability — P13-T01–P13-T08"
