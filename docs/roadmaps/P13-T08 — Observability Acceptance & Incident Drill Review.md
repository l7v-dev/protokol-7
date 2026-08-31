# P13-T08 — Observability Acceptance & Incident Drill Review

**Program:** Scraping Platform  
**Milestone / Phase:** M13 / Phase 13 — Observability  
**Task:** P13-T08  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, deterministic, secret-safe, non-dispatching observability acceptance gate

## 1. Amaç ve kabul sınırı

P13-T08, Phase 13'teki trace, metrics, structured logging, alerting ve telemetry governance contract'larını tek sentetik worker-failure drill'ünde doğrulayan `observability-acceptance/v1` gate'ini ekler. Authoritative backlog kabul kriterisi, sentetik incident'in doğru alarm ve runbook aksiyonu üretmesidir.[1] Bu paket, dış alarm göndermeden doğru severity, on-call route ve runbook identifier içeren safe decision üretir.

`src/observability/acceptance-gate.ts`, P13-T01–P13-T07 public contract'larını çağırır. Drill, API root ile WORKER child span arasında lineage kurar; worker failure sayacını üretir; secret-bearing attribute denemesi içeren structured log'u redacted projection'a indirger; worker failure rule'unu değerlendirir ve dört telemetry signal için completeness/access kontrolünü tamamlar.

| Acceptance kontrolü | Beklenen deterministic kanıt |
|---|---|
| Trace lineage | API root ve worker child aynı trace/correlation zincirinde; parent span bağı korunur |
| Metric projection | `workerTasksSucceededTotal = 4`, `workerTasksFailedTotal = 1` |
| Structured log redaction | Authorization/payload token girişleri output'a girmez; iki attribute drop kanıtı oluşur |
| Alert decision | `WORKER_FAILURE_RATE_HIGH`, `CRITICAL`, `WORKER_PRIMARY`, `worker-recovery-v1` |
| Governance | Dört signal complete; `SRE_OPERATOR` `ALERT_DECISION` erişiminde scope/role olarak izinli |

## 2. Incident drill ve güvenlik sınırı

Drill sentetiktir: scope ve zaman dışındaki girdileri sabit, source-code içi değerlerdir. Worker failure, canlı bir worker veya dependency hatasından değil P13-T03 process-local metric registry'ye yazılan bounded event'lerden oluşur. `runSyntheticObservabilityAcceptanceDrill` sonucu yalnız boolean check'ler ile rule/severity/route/runbook identifier'larını döndürür.

| Güvenlik sınırı | Contract davranışı |
|---|---|
| Secret/payload denemesi | Structured log output'undan düşürülür; raw değer veya `[REDACTED]` placeholder sonuçta taşınmaz |
| Bildirim | `allowNotificationDispatch: false` |
| Otomatik remediation | `allowAutomaticRemediation: false` |
| On-call/action | Contact veya action içermez; yalnız kapalı `WORKER_PRIMARY` ve `worker-recovery-v1` identifier'ı döner |
| Validation | Geçersiz scope veya time input'u `OBSERVABILITY_ACCEPTANCE_INVALID` ile fail-closed reddedilir |

> P13-T08 gate, gerçek bir incident oluşturmaz. PagerDuty/Opsgenie/e-posta/SMS/webhook, queue dispatch, network I/O, telemetry sink, database/Redis/S3 write, external provider erişimi veya prod remediation yapılmaz.

## 3. Doğrulama kanıtı

`test/observability/acceptance-gate.test.ts`, sentetik drill pass zincirini, secret/contact/payload non-leak koşulunu ve invalid input fail-closed davranışını kapsar. `scripts/observability-gate-smoke.ts`, test suite dışında tekrar edilebilir P13-T08 smoke gate çıktısını üretir.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/observability/acceptance-gate.test.ts` | Başarılı — 1 dosya / 3 test | Trace, metric, redaction, alert, governance zinciri; raw data non-leak; invalid input red yolları |
| `pnpm test:observability-gate` | Başarılı — `P13-T08 PASS` | Deterministic process-local sentetik worker-failure acceptance drill |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 89 dosya / 346 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Gerçek incident oluşturma, live worker/dependency/provider failure injection, production traffic veya distributed observability E2E.
2. PagerDuty/Opsgenie/SMS/e-posta/webhook/queue dispatch, actual on-call contact, ack/silence, escalation, retry veya automatic remediation.
3. Telemetry/log sink, collector/exporter, database/Redis/S3 storage, network I/O, durable alert state, dashboard veya frontend/UI.
4. Raw URL, payload, header, cookie, credential, token, session, authorization, storage key, record value, raw error/message/stack veya serbest route/runbook/contact capture.
5. Policy/auth/anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, policy override veya automatic bypass retry.

## 5. Review kararı

P13-T08 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic reference contract ve sandbox regression/build doğrulamasını kanıtlar; gerçek incident, PagerDuty/Opsgenie/e-posta/SMS/webhook dispatch, on-call action, remediation, telemetry sink, database/Redis/S3/provider veya distributed service E2E doğrulaması ya da production readiness iddiası değildir. Bu kullanıcı onayı M13 / Phase 13 exit gate değerlendirmesinin ön koşulunu karşılar.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 13 — Observability, P13-T08 kabul kriteri"
