# P13-T06 — Alert Rules, Severity, On-Call Routing & Runbook Review

**Program:** Scraping Platform  
**Milestone / Phase:** M13 / Phase 13 — Observability  
**Task:** P13-T06  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, secret-safe, bounded, non-dispatching alerting reference contract

## 1. Amaç ve kabul sınırı

P13-T06, P13-T03 `operational-metrics/v1` snapshot'ını kapalı bir alarm sözlüğüyle değerlendiren `alerting/v1` contract'ını ekler. Phase 13 backlog'u alarm kuralları, severity, on-call routing ve runbook linklerini tanımlama hedefini içerir; kabul ölçütü alarmın sahip ve aksiyon içermesi, gereksiz gürültü üretmemesidir.[1]

`src/observability/alerting.ts`, dış bildirim göndermeyen saf bir evaluator'dır. Her karar, serbest e-posta/telefon/webhook URL'si yerine kapalı `onCallRoute` ve `runbookId` identifier'ları döndürür. Böylece caller, ayrıca onaylanmış bir delivery katmanı varsa kararları tüketebilir; bu paket hiçbir on-call sistemi, webhook, e-posta, SMS, queue veya network çağrısı yapmaz.

| Rule | Severity | On-call route | Runbook ID | Trigger sınırı |
|---|---|---|---|---|
| `PLATFORM_FAILURE_RATE_HIGH` | `CRITICAL` | `PLATFORM_PRIMARY` | `platform-reliability-v1` | En az 10 request'te failure rate ≥ %20 |
| `TARGET_POLICY_BLOCK_RATE_HIGH` | `WARNING` | `SECURITY_POLICY` | `target-policy-v1` | En az 10 target decision'da block rate ≥ %50 |
| `WORKER_FAILURE_RATE_HIGH` | `CRITICAL` | `WORKER_PRIMARY` | `worker-recovery-v1` | En az 5 terminal worker task'ta failure rate ≥ %20 |
| `EXTRACTION_FAILURE_COUNT_HIGH` | `WARNING` | `DATA_QUALITY` | `extraction-quality-v1` | En az 5 extraction failure |
| `QUALITY_SCORE_DEGRADED` | `WARNING` | `DATA_QUALITY` | `extraction-quality-v1` | En az 10 quality evaluation'da score ≤ %70 |

## 2. Gürültü azaltma, scope ve veri minimizasyonu

Her rule minimum sample size kullanır. Eşik üzerinde görünse dahi yeterli örneği olmayan snapshot için `triggered: false` döner. Bu yaklaşım, az sayıda ölçümden doğan deterministik false-positive alarm kararlarını azaltır; karar üretimi reproducible kalır. Rate'ler integer basis point olarak hesaplanır ve threshold'lar source-code içindeki değişmez rule sözlüğündedir.

Alert decision yalnız tenant/project scope, evaluated time, rule/severity/route/runbook identifier, trigger boolean ve sayısal evidence taşır. Raw metric event, URL/host, job/task/attempt id, trace payload, request/response, extraction record, storage key, credential, token, cookie, authorization, raw error veya iletişim adresi saklanmaz ya da output'a girmez.

| Fail-closed koşul | Sonuç |
|---|---|
| P13-T03 contract version uyuşmaz | `ALERTING_INVALID` |
| Geçersiz tenant/project safe identifier | `ALERTING_INVALID` |
| Negatif veya güvenli olmayan integer counter | `ALERTING_INVALID` |
| 0–10.000 dışında ya da integer olmayan quality basis point | `ALERTING_INVALID` |
| Geçersiz evaluated time | `ALERTING_INVALID` |

> Bu paket bir **decision contract** üretir, alarm dispatch etmez. On-call route ve runbook ID, kişisel iletişim bilgisi, API secret'ı veya canlı aksiyon değildir.

## 3. Doğrulama kanıtı

Dar kapsam test paketi `test/observability/alerting.test.ts` ile rule tetikleme, kapalı severity/route/runbook projection, low-sample/under-threshold suppression ve malformed snapshot/time red yolları doğrulanmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/observability/alerting.test.ts` | Başarılı — 1 dosya / 3 test | Beş rule'un deterministic decision'ı, noise suppression ve fail-closed validation |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 87 dosya / 340 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. PagerDuty/Opsgenie/SMS/e-posta/webhook/queue dispatch, gerçek on-call escalation, ack/silence, retry veya automatic remediation.
2. Alert state persistence, deduplication, grouping, inhibition, rate limit, time window state, alert history/retention veya distributed evaluation.
3. Grafana/dashboard, UI, alert delivery endpoint, secret/contact management veya operational runbook içeriği. P13-T05 dashboard/frontend işi Scope Excluded olarak kalır.
4. Target URL/host, raw metrics/event/payload, job/task/attempt id, request/response, record value, credential, token, cookie, authorization, raw error veya serbest route/runbook/contact capture.
5. Policy/auth/anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, policy override veya automatic bypass retry.

## 5. Review kararı

P13-T06 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic reference contract ve sandbox regression/build doğrulamasını kanıtlar; gerçek PagerDuty/Opsgenie/e-posta/SMS/webhook dispatch, log sink, Postgres/Redis/BullMQ/S3/provider veya distributed service E2E doğrulaması ya da production readiness iddiası değildir. Sıradaki bounded paket P13-T07 — Telemetry Governance olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 13 — Observability, P13-T06 kabul kriteri"
