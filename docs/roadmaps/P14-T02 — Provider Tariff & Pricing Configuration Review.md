# P14-T02 — Provider Tariff & Pricing Configuration Review

**Program:** Scraping Platform  
**Milestone / Phase:** M14 / Phase 14 — Cost Intelligence  
**Task:** P14-T02  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, immutable, secret-safe, non-billing provider tariff configuration reference contract

## 1. Amaç ve kabul sınırı

P14-T02, P14-T01 kapalı usage category/unit sözlüğü üzerinde provider tariff ve pricing configuration yönetimini `tariff-configuration/v1` contract'ı ile tanımlar. Phase 14 backlog kabul kriterisi, tarife değişikliğinin geçmiş maliyetleri geriye dönük değiştirmemesidir.[1]

`src/finops/tariffs.ts`, tarifeleri tenant/project/provider/effective-date sınırında immutable kaydeder. Bir usage zamanı için `resolve`, yalnız aynı scope/provider içindeki `effectiveFrom <= occurredAt` koşulunu sağlayan en güncel tarifeyi seçer. Yeni effective-date'li tarifeler önceki tarifeyi değiştirmez; bu sayede tarihi usage event, o zamanda etkin olan tariff version'a bağlanır.

| Tariff alanı | Bounded contract | Güvenlik sınırı |
|---|---|---|
| Scope | `tenantId`, `projectId` | Tenant/project dışı çözüm yok |
| Provider | Safe `providerId` identifier | Credential, endpoint veya provider account detayı yok |
| Currency | `USD` veya `EUR` | Currency conversion yok |
| Rate | P14-T01 fixed category/unit ve integer `unitPriceMicros` | Serbest unit/price object yok |
| Version | `tariffId`, `effectiveFrom`, SHA-256 fingerprint | Update/delete veya geriye dönük değişim yok |

## 2. İmmutability ve historical pricing davranışı

Tariff kayıt anahtarı `tenantId:projectId:providerId:effectiveFrom` biçimindedir. Aynı anahtar altında aynı fingerprint ile yapılan tekrar idempotenttir. Farklı içerik gönderilirse `TARIFF_CONFIGURATION_CONFLICT` ile fail-closed reddedilir. Rate listesi 1–9 arası, her category yalnız bir kez ve P14-T01 unit dictionary ile tam eşleşecek şekilde kabul edilir.

| Fail-closed koşul | Sonuç |
|---|---|
| Bilinmeyen currency/provider/tariff/scope identifier veya effective time | `TARIFF_CONFIGURATION_INVALID` |
| Category-unit uyumsuzluğu, duplicate rate veya invalid micro-price | `TARIFF_CONFIGURATION_INVALID` |
| Aynı provider/effective-date altında farklı tariff content | `TARIFF_CONFIGURATION_CONFLICT` |
| Usage zamanı için etkin tariff/rate bulunmaması | `TARIFF_CONFIGURATION_NOT_FOUND` |

> Bu paket yalnız immutable configuration ve historical rate resolution sağlar. Gerçek provider fiyatı çekmez, currency convert etmez, toplam maliyet/fatura üretmez, charge/payment yapmaz ve finansal tavsiye vermez.

## 3. Doğrulama kanıtı

Dar kapsam test paketi `test/finops/tariffs.test.ts`, iki effective-date'li tarifeyle geçmiş/future usage resolve davranışını, idempotent yeniden kaydı, tenant isolation ve invalid/conflict red yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/finops/tariffs.test.ts` | Başarılı — 1 dosya / 3 test | Historical tariff version resolve, idempotency/scope isolation ve fail-closed validation |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 91 dosya / 352 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Live provider tariff API/import, provider credential/account/endpoint, price scraping, real-time price update veya external configuration sync.
2. Currency conversion, tax, discount, minimum commitment, invoice, billing, charge, payment veya finansal tavsiye/karar.
3. Usage event maliyet hesaplama, job aggregation, cost-per-record, budget enforcement, alert dispatch, finance export veya dashboard/UI.
4. Database/Redis/S3 persistence, distributed config locking, event-sourced audit, production migration veya real provider metering E2E.
5. Raw provider/target URL, payload, record, credential, token, cookie, authorization, raw error veya serbest metadata capture.

## 5. Review kararı

P14-T02 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic reference contract ve sandbox regression/build doğrulamasını kanıtlar; gerçek provider tariff API/import, currency conversion, billing/charge/payment, persistent store veya distributed service E2E doğrulaması ya da production readiness iddiası değildir. Sıradaki bounded paket P14-T03 — Multi-Source Metering olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 14 Cost Intelligence — P14-T02 kabul kriteri"
