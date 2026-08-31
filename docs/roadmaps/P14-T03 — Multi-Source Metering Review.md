# P14-T03 — Multi-Source Metering Review

**Program:** Scraping Platform  
**Milestone / Phase:** M14 / Phase 14 — Cost Intelligence  
**Task:** P14-T03  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, secret-safe, bounded, non-collecting metering projection contract

## 1. Amaç ve kabul sınırı

P14-T03, HTTP, browser, proxy, AI, storage ve compute tüketimini P14-T01 `usage-event/v1` sözlüğüne dönüştüren `multi-source-metering/v1` projection contract'ını ekler. Phase 14 backlog'u kaynak tüketiminin ilgili attempt/job ile ilişkilendirilmesini kabul kriteri olarak belirtir.[1]

`src/finops/metering.ts`, caller tarafından sağlanan yalnız sayısal ölçümleri tenant/project/job/task/attempt scope'unda 0–8 adet usage event'e dönüştürür. Contract kendi başına HTTP, browser, proxy, AI, storage veya compute runtime'ına bağlanmaz; hiçbir provider çağrısı, runtime collection, kalıcılık, fiyat hesaplama veya charge/payment çalıştırmaz.

| Kaynak ölçümü | Üretilen P14-T01 category | Unit | Dönüşüm |
|---|---|---|---|
| `httpRequests` | `HTTP_REQUEST` | `request` | Doğrudan |
| `browserRuntimeSeconds` | `BROWSER_MINUTE` | `minute` | Saniye / 60 |
| `proxyRequests` | `PROXY_REQUEST` | `request` | Doğrudan |
| `proxyBytes` | `PROXY_GB` | `GB` | Byte / 1.073.741.824 |
| `aiInputTokens` | `AI_INPUT_TOKEN` | `token` | Doğrudan |
| `aiOutputTokens` | `AI_OUTPUT_TOKEN` | `token` | Doğrudan |
| `storageGigabyteMonths` | `STORAGE_GB_MONTH` | `GB-month` | Doğrudan |
| `computeSeconds` | `COMPUTE_SECOND` | `second` | Doğrudan |

## 2. Bounded projection ve data minimization

Sıfır olan kaynaklar output event üretmez. Pozitif ölçümler, `meterId` ve category üzerinden deterministic `usageId`/`idempotencyKey` üretir. Genel ölçümler 0–10.000.000 aralığıyla, proxy byte ölçümü ise açık 10.000 GB üst limitiyle bounded tutulur. Decimal dönüşümler altı ondalık basamağa yuvarlanır.

| Güvenlik/validation sınırı | Davranış |
|---|---|
| Scope ve `meterId` | 128 karakterli safe identifier zorunlu |
| Zaman | Geçerli ISO zaman zorunlu |
| Ölçüm | Negative, non-finite veya upper-bound dışı değer fail-closed reddedilir |
| Output | Yalnız P14-T01 usage event alanları; serbest metadata yok |
| Veri minimizasyonu | URL, provider detail, payload, record, prompt/model output, credential, token, cookie, authorization ve raw error alanı yok |

> Metering contract bir **projection** üretir. Live runtime'tan ölçüm toplamaz; hiçbir raw operational data, fiyat/tarife, currency, cost total, billing veya financial decision output'u taşımaz.

## 3. Doğrulama kanıtı

Dar kapsam test paketi `test/finops/metering.test.ts`, sekiz category/unit dönüşümünü, zero-value omission davranışını, scope/time/data-minimization sınırlarını ve invalid measurement fail-closed yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/finops/metering.test.ts` | Başarılı — 1 dosya / 3 test | Fixed projection, zero omission ve invalid input red yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 92 dosya / 355 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. HTTP/browser/proxy/AI/storage/compute runtime'a gerçek instrumentation injection veya live usage collection.
2. Provider tariff çözümü, price/currency conversion, estimated/actual cost, cost-per-record, billing, charge, payment veya finansal tavsiye/karar.
3. Database/Redis/S3 persistence, distributed event deduplication/atomicity, provider meter import veya production reconciliation.
4. Retry/fallback allocation; bu P14-T04'ün ayrı bounded kapsamıdır.
5. Dashboard, finance export, alert dispatch, budget enforcement veya frontend/UI.
6. Raw URL, payload, record, prompt/model output, credential, token, cookie, authorization, raw error veya serbest metadata capture.

## 5. Review kararı

P14-T03 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic reference contract ve sandbox regression/build doğrulamasını kanıtlar; gerçek runtime metering, provider meter import, persistent usage store, currency/pricing/billing/payment veya distributed service E2E doğrulaması ya da production readiness iddiası değildir. Sıradaki bounded paket P14-T04 — Retry & Fallback Cost Allocation olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 14 Cost Intelligence — P14-T03 kabul kriteri"
