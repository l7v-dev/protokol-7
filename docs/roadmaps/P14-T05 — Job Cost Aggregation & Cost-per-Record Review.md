# P14-T05 — Job Cost Aggregation & Cost-per-Record Review

**Program:** Scraping Platform  
**Milestone / Phase:** M14 / Phase 14 — Cost Intelligence  
**Task:** P14-T05  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, deterministic, secret-safe, non-billing job cost aggregation reference contract

## 1. Amaç ve kabul sınırı

P14-T05, P14-T04 allocation projection'ları ile P14-T02 resolved tariff rate quote'larını job scope'unda birleştirerek total cost ve published record başına cost projection'ı üretir. Phase 14 backlog'u job total ve cost/record değerlerinin dashboard/API ile tutarlı olmasını kabul kriteri olarak tanımlar.[1]

`src/finops/job-cost-aggregation.ts`, yalnız caller tarafından sunulmuş immutable allocation ve resolved rate kanıtını işler. Her satırın micro-cost değeri `round(quantity × unitPriceMicros)` formülüyle hesaplanır. Job total, tüm rated usage satırlarının güvenli integer toplamıdır; cost-per-published-record değeri `totalCostMicros / publishedRecordCount` formülüyle altı ondalık basamağa yuvarlanır. Published record sayısı `0` ise değer fail-open olarak tahmin edilmez ve `null` döner.

| Aggregate output | Deterministic anlamı |
|---|---|
| `totalCostMicros` | Aynı job/currency içindeki tüm rated allocation micro-cost toplamı |
| `costPerPublishedRecordMicros` | `totalCostMicros / publishedRecordCount`; count 0 ise `null` |
| `byCategoryMicros` | P14-T01 fixed category bazında total |
| `byAllocationBucketMicros` | `PRIMARY_ATTEMPT`, `RETRY_ATTEMPT`, `FALLBACK_ATTEMPT` bazında total |
| `currency` | Tek currency; boş rated usage için `null` |

## 2. Scope, currency ve overflow koruması

Her rated allocation'ın tenant/project/job scope'u aggregate request scope'uyla birebir eşleşmelidir. Rate quote category/unit alanı source allocation ile eşleşmek zorundadır. Bir job aggregate içinde farklı `USD` ve `EUR` rate'lerinin karıştırılması `JOB_COST_AGGREGATION_CURRENCY_MISMATCH` ile reddedilir; currency conversion bu paket dışında bırakılmıştır.

Quantity × unitPriceMicros çarpımı ve tüm toplama adımları `Number.MAX_SAFE_INTEGER` sınırına karşı doğrulanır. Geçersiz veya overflow üreten input fail-closed sonuçlanır.

| Fail-closed koşul | Sonuç |
|---|---|
| Scope, allocation, rate veya P14-T04 contract uyumsuzluğu | `JOB_COST_AGGREGATION_INVALID` |
| Allocation category/unit ile rate quote uyuşmazlığı | `JOB_COST_AGGREGATION_INVALID` |
| Aynı job içinde currency uyuşmazlığı | `JOB_COST_AGGREGATION_CURRENCY_MISMATCH` |
| Micro-cost çarpımı veya total safe integer overflow'u | `JOB_COST_AGGREGATION_OVERFLOW` |

> P14-T05, yalnız internal attribution projection'ı üretir. Tariff fetch etmez, currency convert etmez, gerçek provider usage import etmez, persistent ledger'a yazmaz, invoice/billing/charge/payment gerçekleştirmez ve finansal tavsiye veya karar vermez.

## 3. Doğrulama kanıtı

Dar kapsam test paketi `test/finops/job-cost-aggregation.test.ts`, category/bucket total'lerini, 0 published-record için `null` davranışını, currency/scope/rate mismatch red yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/finops/job-cost-aggregation.test.ts` | Başarılı — 1 dosya / 3 test | Job total, cost-per-record, category/bucket aggregation ve validation red yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 94 dosya / 361 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Tariff/pricing fetch, currency conversion, tax/discount/commitment, invoice, billing, charge, payment veya finansal tavsiye/karar.
2. Real provider usage import, runtime metering, database/Redis/S3 persistence, distributed aggregation/atomicity veya production reconciliation.
3. Budget enforcement, alert dispatch, dashboard/API/CSV finance export veya frontend/UI.
4. Raw provider/target URL, payload, record, prompt/model content, credential, token, cookie, authorization, raw error veya serbest metadata capture.
5. Retry/fallback selection/execution, policy bypass veya automatic remediation.

## 5. Review kararı

P14-T05 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız P14-T01/P14-T02 reference verileri üzerinde process-local, deterministic projection ve sandbox regression/build doğrulamasını kanıtlar; gerçek tariff fetch, currency conversion, provider meter import, billing/payment, persistent store veya distributed service E2E doğrulaması ya da production readiness iddiası değildir. Sıradaki bounded paket P14-T06 — Budget Cap & Cost Alert olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 14 Cost Intelligence — P14-T05 kabul kriteri"
