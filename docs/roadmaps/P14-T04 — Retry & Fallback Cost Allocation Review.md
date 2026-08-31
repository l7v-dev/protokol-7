# P14-T04 — Retry & Fallback Cost Allocation Review

**Program:** Scraping Platform  
**Milestone / Phase:** M14 / Phase 14 — Cost Intelligence  
**Task:** P14-T04  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, deterministic, secret-safe, non-billing retry/fallback allocation reference contract

## 1. Amaç ve kabul sınırı

P14-T04, P14-T01 immutable usage event'lerini retry ve fallback bağlamında açıklanabilir allocation bucket'larına atayan `retry-fallback-allocation/v1` contract'ını ekler. Phase 14 backlog'u maliyet dağılımının açıklanabilir ve tekrar hesaplanabilir olmasını kabul kriteri olarak belirtir.[1]

`src/finops/retry-fallback-allocation.ts`, source usage event'e bir ücret eklemez ve source event'i değiştirmez. Sadece `PRIMARY`, `RETRY`, `FALLBACK_BROWSER` veya `FALLBACK_PROXY` kind'i ile kararın hangi immutable attempt usage'ına bağlı olduğunu ifade eder. Allocation sonucu root attempt, allocated attempt, category/unit/quantity, source usage fingerprint ve allocation fingerprint içerir.

| Allocation kind | Bucket | Kullanım sınırı |
|---|---|---|
| `PRIMARY` | `PRIMARY_ATTEMPT` | İlk attempt'e bağlı usage projection |
| `RETRY` | `RETRY_ATTEMPT` | Caller tarafından zaten kararlaştırılmış retry attempt usage projection |
| `FALLBACK_BROWSER` | `FALLBACK_ATTEMPT` | Caller tarafından zaten policy-gated olarak kararlaştırılmış browser fallback usage projection |
| `FALLBACK_PROXY` | `FALLBACK_ATTEMPT` | Caller tarafından zaten policy-gated olarak kararlaştırılmış proxy fallback usage projection |

## 2. Determinism, idempotency ve safety

Allocation registry anahtarı tenant/project/job/task, root attempt ve source usage fingerprint üzerinden oluşur. Aynı input yeniden gönderildiğinde aynı projection dönülür; aynı immutable usage kanıtını başka kind veya başka content ile yeniden sınıflandırma girişimi `RETRY_FALLBACK_ALLOCATION_CONFLICT` ile fail-closed reddedilir. Bu sayede retry/fallback attribution, source usage kanıtından bağımsız veya tekrarsız biçimde değiştirilemez.

Contract, P14-T01 usage event contract version'ını, safe scope/identifier'ları, source fingerprint formatını, bounded quantity'yi ve occurred time'ı doğrular. Para birimi, tarifeyi çözme, cost amount, currency conversion, invoice, billing, charge/payment veya finansal karar üretilmez.

| Fail-closed koşul | Sonuç |
|---|---|
| Geçersiz allocation/root attempt ID veya unknown allocation kind | `RETRY_FALLBACK_ALLOCATION_INVALID` |
| Geçersiz P14-T01 contract, scope, fingerprint, quantity veya time | `RETRY_FALLBACK_ALLOCATION_INVALID` |
| Aynı source usage kanıtına farklı allocation content bağlama | `RETRY_FALLBACK_ALLOCATION_CONFLICT` |

> P14-T04 retry/fallback'i **seçmez veya çalıştırmaz**. P05/P10 reliability ve strategy policy'lerinin bounded kararına bağlı, non-executing allocation projection'ı üretir; policy bypass veya automatic retry/fallback tetiklemez.

## 3. Doğrulama kanıtı

Dar kapsam test paketi `test/finops/retry-fallback-allocation.test.ts`, primary/retry/fallback bucket mapping'ini, immutable usage source binding/idempotency'yi ve invalid/conflicting input red yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/finops/retry-fallback-allocation.test.ts` | Başarılı — 1 dosya / 3 test | Bucket mapping, idempotency/source integrity ve fail-closed validation |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 93 dosya / 358 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Retry, browser fallback veya proxy rotation seçimi/dispatch'i, retry budget mutation, policy change veya automatic fallback execution.
2. Tariff/pricing resolve, currency conversion, monetary cost, cost-per-record, invoice, billing, charge/payment veya finansal tavsiye/karar.
3. Database/Redis/S3 persistence, distributed idempotency/atomicity, provider meter import veya production reconciliation.
4. Budget enforcement, alert dispatch, dashboard, finance export veya frontend/UI.
5. Raw URL, payload, provider detail, record, prompt/model output, credential, token, cookie, authorization, raw error veya serbest metadata capture.

## 5. Review kararı

P14-T04 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic reference contract ve sandbox regression/build doğrulamasını kanıtlar; gerçek retry/fallback execution, tariff/currency/cost calculation, billing/payment, persistent store veya distributed service E2E doğrulaması ya da production readiness iddiası değildir. Sıradaki bounded paket P14-T05 — Job Cost Aggregation & Cost-per-Record olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 14 Cost Intelligence — P14-T04 kabul kriteri"
