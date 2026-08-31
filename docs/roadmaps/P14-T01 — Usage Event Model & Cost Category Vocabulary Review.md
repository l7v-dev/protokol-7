# P14-T01 — Usage Event Model & Cost Category Vocabulary Review

**Program:** Scraping Platform  
**Milestone / Phase:** M14 / Phase 14 — Cost Intelligence  
**Task:** P14-T01  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, immutable, secret-safe, bounded usage event reference contract

## 1. Amaç ve kabul sınırı

P14-T01, maliyet attribution'ın temelini oluşturan usage event modelini ve cost category sözlüğünü `usage-event/v1` contract'ında tanımlar. Phase 14 backlog'u, tüm kategori, unit, source ve currency alanlarının tanımlı olmasını kabul kriteri olarak belirtir.[1] Bu bounded paket, source alanını serbest string veya provider detail olarak değil, category/unit eşleşmesi üzerinden kapalı vocabulary olarak tanımlar; currency/tariff/price hesaplamasını P14-T02'ye bırakır.

`src/finops/usage-events.ts`, event'i tenant/project/job/task/attempt scope, usage ID, idempotency key, category, unit, quantity ve zaman ile sınırlar. Event'te price, currency, tariff, provider ID, URL, hostname, raw payload, extraction record, prompt, model response, credential, token, cookie, authorization, metadata veya raw error için alan yoktur.

| Cost category | Unit | Kaynak yüzeyi |
|---|---|---|
| `HTTP_REQUEST` | `request` | HTTP execution |
| `BROWSER_MINUTE` | `minute` | Browser runtime |
| `PROXY_REQUEST` | `request` | Proxy request |
| `PROXY_GB` | `GB` | Proxy trafik hacmi |
| `AI_INPUT_TOKEN` | `token` | AI budget input token |
| `AI_OUTPUT_TOKEN` | `token` | AI budget output token |
| `STORAGE_GB_MONTH` | `GB-month` | Storage kapasite ölçümü |
| `COMPUTE_SECOND` | `second` | Compute tüketimi |
| `RETRY_ATTEMPT` | `attempt` | Retry/fallback sayımı |

## 2. İmmutability, idempotency ve veri minimizasyonu

Registry, `tenantId:projectId:jobId:taskId:attemptId:idempotencyKey:category` idempotency sınırında process-local event saklar. Aynı content hash'e sahip tekrar güvenli olarak mevcut event'i döndürür; aynı key/category altında farklı content `USAGE_EVENT_CONFLICT` ile reddedilir. Event fingerprint'i normalleştirilmiş safe input üzerinden SHA-256 ile üretilir ve caller'a yalnız fingerprint döner.

Scope identifier'ları 128 karakterlik safe ID formatıyla, quantity ise 0–10.000.000 finite aralığıyla bounded tutulur. Category/unit eşleşmesi compile-time union ve runtime closed dictionary ile doğrulanır.

| Fail-closed koşul | Sonuç |
|---|---|
| Sözlükte olmayan category | `USAGE_EVENT_INVALID` |
| Category ile uyumsuz unit | `USAGE_EVENT_INVALID` |
| Geçersiz scope, usage ID, idempotency key veya zaman | `USAGE_EVENT_INVALID` |
| Negatif, sonsuz veya 10.000.000 üzeri quantity | `USAGE_EVENT_INVALID` |
| Aynı idempotency sınırında farklı event content | `USAGE_EVENT_CONFLICT` |

> P14-T01 usage ölçüm contract'ıdır; para birimi, fiyat, tarife, faturalama, tahsilat veya finansal karar/öneri üretmez. Bu alanlar P14-T02 ve sonraki explicit review paketlerinin kapsamındadır.

## 3. Doğrulama kanıtı

Dar kapsam test paketi `test/finops/usage-events.test.ts`, fixed category/unit sözlüğünü, SHA-256 fingerprint'li immutable projection'ı, idempotent tekrar/scope isolation ve invalid/conflict red yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/finops/usage-events.test.ts` | Başarılı — 1 dosya / 3 test | Vocabulary, immutable/idempotent event, scope isolation ve fail-closed validation |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 90 dosya / 349 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Tariff/pricing configuration, currency conversion, estimated/actual cost calculation, cost-per-record, invoice, billing, charge, payment veya finansal tavsiye/karar.
2. Database/Redis/S3 persistence, distributed idempotency/atomicity, external provider meter import, real usage collection veya production billing reconciliation.
3. Dashboard, API/CSV finance export, alert dispatch, budget enforcement, UI veya frontend çalışması.
4. Provider/target URL, hostname, raw payload, record, prompt/model content, credential, token, cookie, authorization, raw error veya serbest metadata capture.
5. Policy/auth/anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, policy override veya automatic bypass retry.

## 5. Review kararı

P14-T01 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic reference contract ve sandbox regression/build doğrulamasını kanıtlar; gerçek tarife/fiyat/currency conversion, provider meter import, billing/charge/payment, persistent store veya distributed service E2E doğrulaması ya da production readiness iddiası değildir. Sıradaki bounded paket P14-T02 — Provider Tariff & Pricing Configuration olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 14 Cost Intelligence — P14-T01 kabul kriteri"
