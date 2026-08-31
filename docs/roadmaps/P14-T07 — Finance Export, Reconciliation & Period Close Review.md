# P14-T07 — Finance Export, Reconciliation & Period Close Review

**Program:** Scraping Platform  
**Milestone / Phase:** M14 / Phase 14 — Cost Intelligence  
**Task:** P14-T07  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, secret-safe, bounded, non-dispatching finance reporting reference contract

## 1. Amaç ve kabul sınırı

P14-T07, caller-supplied P14-T05 safe job cost aggregate'lerinden period-scope finance export projection'ı, internal reconciliation ve non-persisting period-close decision'ı üretir. Phase 14 backlog'u export/reconciliation/period-close raporunun kontrollü ve tutarlı olmasını kabul kriteri olarak tanımlar.[1]

`src/finops/finance-reporting.ts`, bir tenant/project/period için 1–1.000 adet job aggregate kabul eder. Bu input'tan job ID'ye göre deterministik sıralanmış internal export row'ları oluşturur. Export output'unda yalnız scope, currency, total micro-cost, published record count ve cost-per-record alanları bulunur; file oluşturulmaz ve dış sistem/finance API'sine gönderim yapılmaz.

| Report output | Deterministic kural |
|---|---|
| Export projection | `jobId` artan sırası; yalnız safe aggregate alanları |
| Aggregated total | Tüm export row `totalCostMicros` değerlerinin safe-integer toplamı |
| Reconciliation | `varianceMicros = expectedTotalMicros − aggregatedTotalMicros` |
| Period close | Variance `0` → `CLOSED`; aksi → `REVIEW_REQUIRED` |
| Side-effect flags | `allowsPersistence: false`; `allowsExternalExport: false` |

## 2. Period, scope ve currency kontrolü

Period ID safe identifier olmalı, başlangıç/bitiş zamanı geçerli olmalı, bitiş başlangıçtan sonra gelmeli ve period en fazla 31 gün sürmelidir. Her aggregate'ın P14-T05 contract version'ı, tenant/project scope'u ve job ID'si doğrulanır. Duplicate job kabul edilmez.

Report tek currency ile çalışır. `USD` ve `EUR` aggregate'lerinin aynı period raporunda karıştırılması `FINANCE_REPORTING_CURRENCY_MISMATCH` ile fail-closed reddedilir; currency conversion bu pakette yoktur. Expected/aggregate total veya variance safe-integer aralığını aşarsa `FINANCE_REPORTING_OVERFLOW` üretilir.

| Fail-closed koşul | Sonuç |
|---|---|
| Geçersiz period/scope/expected total veya 1–1.000 aralığı dışı aggregate listesi | `FINANCE_REPORTING_INVALID` |
| P14-T05 contract, tenant/project scope veya duplicate job uyumsuzluğu | `FINANCE_REPORTING_INVALID` |
| Aynı report içinde currency uyuşmazlığı | `FINANCE_REPORTING_CURRENCY_MISMATCH` |
| Toplama ya da variance safe-integer overflow'u | `FINANCE_REPORTING_OVERFLOW` |

> P14-T07 internal reporting contract'ıdır. Gerçek accounting period'u kapatmaz, dosya/API export etmez, ledger'a yazmaz, invoice/billing/charge/payment gerçekleştirmez ve finansal tavsiye veya karar üretmez.

## 3. Doğrulama kanıtı

Dar kapsam test paketi `test/finops/finance-reporting.test.ts`, deterministik sorted export row'larını, exact reconciliation/`CLOSED` sonucunu, mismatch/`REVIEW_REQUIRED` sonucunu ve period/scope/job/currency validation red yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/finops/finance-reporting.test.ts` | Başarılı — 1 dosya / 3 test | Export projection, exact/mismatch reconciliation, close decision ve fail-closed validation |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 96 dosya / 367 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Real finance/accounting system, ledger persistence, month-end close execution, external file/API/CSV export, audit attestation veya notification dispatch.
2. Tariff fetch, currency conversion, tax/discount, invoice, billing, charge/payment veya finansal tavsiye/karar.
3. Runtime metering/provider meter import, database/Redis/S3 persistence, distributed reconciliation consistency veya production finance-system E2E.
4. Budget enforcement, job/worker stop, retry/fallback execution, dashboard veya frontend/UI.
5. Raw provider/target URL, payload, record, prompt/model content, credential, token, cookie, authorization, raw error veya serbest metadata capture.

## 5. Review kararı

P14-T07 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız caller-supplied internal reference inputs üzerinde process-local, deterministic projection ve sandbox regression/build doğrulamasını kanıtlar; gerçek accounting close/export, provider meter import, currency conversion, billing/payment, persistent store veya distributed service E2E doğrulaması ya da production readiness iddiası değildir. Sıradaki bounded paket P14-T08 — Cost Attribution Completeness & Acceptance olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 14 Cost Intelligence — P14-T07 kabul kriteri"
