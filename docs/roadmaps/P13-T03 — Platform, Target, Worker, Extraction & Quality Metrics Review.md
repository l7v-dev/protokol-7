# P13-T03 — Platform, Target, Worker, Extraction & Quality Metrics Review

**Program:** Scraping Platform  
**Milestone / Phase:** M13 / Phase 13 — Observability  
**Task:** P13-T03  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, secret-safe, bounded operational metrics reference contract

## 1. Amaç ve kabul sınırı

P13-T03, platform, target, worker, extraction ve quality olaylarını tenant/project scope'unda, sorgulanabilir sabit sayaçlar ve quality ortalaması halinde toplar. Phase 13 backlog'undaki hedef, KPI metriklerinin dashboard sorgularıyla üretilebilir olmasıdır.[1] Bu paket dashboard veya kullanıcı arayüzü üretmez; kullanıcı talimatı doğrultusunda bu tür frontend/UI kapsamı dışarıda bırakılmıştır.

`src/observability/operational-metrics.ts`, `operational-metrics/v1` adında kapalı bir metric sözlüğü tanımlar. Registry yalnız sayısal aggregate saklar; event geçmişi, serbest label, raw payload veya kimlik bilgisi kabul etmez. Bu sayede ölçüm yüzeyi bounded kalır ve snapshot'lar sadece çağıranın yetkili olduğu tenant/project scope'u için alınır.

| Alan | Kabul edilen metric olayı | Deterministic aggregate |
|---|---|---|
| Platform | `REQUEST`: `SUCCESS`, `FAILURE`, `BLOCKED` | Toplam istek, failure ve block sayaçları |
| Target | `ACCESS_DECISION`: `ALLOWED`, `BLOCKED` | Allowed / blocked karar sayaçları |
| Worker | `TASK`: `STARTED`, `SUCCEEDED`, `FAILED`, `CANCELLED` | Task yaşam döngüsü sayaçları |
| Extraction | `RECORDS`: `SUCCESS`, `PARTIAL`, `FAILURE` | Kayıt toplamı, partial ve failure sayaçları |
| Quality | `EVALUATION`: `VALID`, `PARTIAL`, `INVALID` | Değerlendirme/outcome sayaçları ve basis-point kalite ortalaması |

## 2. Bounded sorgu ve veri minimizasyonu

Registry key'i `tenantId:projectId` biçiminde doğrulanmış ve sabit uzunlukta safe identifier'lardan oluşur. Snapshot, contract sürümü, echo edilen scope, sabit counter nesnesi ve `averageScoreBasisPoints` dışında alan içermez. Toplanabilir quality score `0`–`10.000` basis point, extraction kayıt sayısı ise her olayda `0`–`100.000` ile sınırlıdır; overflow fail-closed reddedilir.

| Red koşulu | Fail-closed sonuç |
|---|---|
| Geçersiz tenant/project scope veya geçersiz ISO zamanı | `OPERATIONAL_METRICS_INVALID` |
| Sözlükte olmayan category, metric veya outcome | `OPERATIONAL_METRICS_INVALID` |
| Sınır dışı extraction count veya quality basis point | `OPERATIONAL_METRICS_INVALID` |
| Güvenli integer sayaç limitini aşan artış | `OPERATIONAL_METRICS_OVERFLOW` |

> Contract yalnız caller tarafından source-code içinde oluşturulan discriminated event tiplerini işler. Raw URL, HTTP body, hedef adresi, proxy credential, authorization/cookie/token, queue payload, extraction input/output, storage key, record value veya raw hata mesajı için alan tanımlamaz.

Mevcut `src/shared/metrics.ts` düşük seviyeli generic counter registry'si ve `src/schema/quality.ts` quality score modeli değiştirilmemiştir. P13-T03 yeni registry ile metric vocabulary ve scope izolasyonunu belirler; production metrics backend ile export/entegrasyon daha sonraki, açıkça onaylı bir paket gerektirir.

## 3. Doğrulama kanıtı

Dar kapsam test paketi `test/observability/operational-metrics.test.ts` ile uygulanmıştır. Testler beş component yüzeyindeki deterministic projection'ı; tenant/project izolasyonunu; serbest/arbitrary metric, malformed scope/time ve numeric bound ihlallerinin fail-closed reddini kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/observability/operational-metrics.test.ts` | Başarılı — 1 dosya / 3 test | Beş metric alanının aggregate'i, scope izolasyonu, data-minimization ve invalid-input red yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 85 dosya / 334 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Prometheus, OpenTelemetry Metrics SDK, OTLP exporter, collector endpoint, HTTP metrics endpoint veya remote telemetry backend.
2. Dashboard, chart, alert rule, alert dispatch, SLO burn-rate, notification veya frontend/UI. P13-T05 bu programda Scope Excluded olarak kalır.
3. Kalıcı database/Redis metrics store, distributed aggregation, cross-process atomiklik, retention, compaction veya high-availability.
4. Otomatik HTTP/queue/worker/proxy/extraction/storage instrumentation injection ya da real provider/service E2E telemetry.
5. Serbest/custom label, target URL/host, job/task/attempt id, raw error, request/response, payload, record değeri, credential veya secret capture.
6. Policy/auth/anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, policy override veya automatic bypass retry.

## 5. Review kararı

P13-T03 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic reference contract ve sandbox regression/build doğrulamasını kanıtlar; gerçek Postgres/Redis/BullMQ/S3/provider/distributed metrics servisi E2E doğrulaması veya production readiness iddiası değildir. Sıradaki bounded paket P13-T04 — Structured Log Schema, Redaction & Routing olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 13 — Observability, P13-T03 kabul kriteri"
