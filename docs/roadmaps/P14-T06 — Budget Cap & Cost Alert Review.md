# P14-T06 — Budget Cap & Cost Alert Review

**Program:** Scraping Platform  
**Milestone / Phase:** M14 / Phase 14 — Cost Intelligence  
**Task:** P14-T06  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, deterministic, secret-safe, non-dispatching scoped cost budget reference contract

## 1. Amaç ve kabul sınırı

P14-T06, tenant/project/job micro-cost cap'lerini ve cost alert kararını `cost-budget/v1` contract'ı ile ekler. Phase 14 backlog'u budget aşımında kontrollü stop veya uyarı üretilmesini kabul kriteri olarak tanımlar.[1] Bu paket, stop veya uyarıyı **çalıştırmaz**; yalnız caller'ın güvenli biçimde tüketebileceği bounded decision üretir.

`src/finops/cost-budgets.ts`, caller-supplied cap ve spent total'lerini aynı currency bağlamında tenant, project ve job düzeyinde değerlendirir. Her scope için `utilizationBasisPoints = floor(spentMicros × 10.000 / capMicros)` hesaplanır. `%80` ve üzeri fakat cap altındaki kullanım `WARNING`; cap'e eşit veya üstü kullanım `BLOCKED`; altındaki kullanım `ALLOW` döner. Zero cap de yeni maliyetli işi izinli varsaymak yerine `BLOCKED` olarak sonuçlanır.

| Status | Eşik | Alert decision | New costly work kararı |
|---|---|---|---|
| `ALLOW` | Utilization < %80 | Alert yok | `true` |
| `WARNING` | %80 ≤ utilization < %100 | `WARNING` / `FINOPS_REVIEW` / `cost-budget-v1` | `true` |
| `BLOCKED` | Utilization ≥ %100 veya cap = 0 | `CRITICAL` / `FINOPS_REVIEW` / `cost-budget-v1` | `false` |

## 2. Scope, data minimization ve side-effect sınırı

Output yalnız tenant/project/job safe identifier, currency, cap/spent micro-cost, utilization basis point ve kapalı alert/runbook identifier'ı taşır. Tariff detail, provider/target, URL, raw usage event, allocation fingerprint, record, prompt/model content, credential, token, cookie, authorization, metadata, contact veya ham hata alanı yoktur.

Decision içindeki `allowNewCostlyWork: false`, caller için policy signalidir. Contract'ın kendisinde `allowNotificationDispatch: false` ve `allowAutomaticStop: false` sabittir; job stop, worker/retry değişimi, alert delivery veya remediation gerçekleşmez.

| Fail-closed koşul | Sonuç |
|---|---|
| Geçersiz tenant/project/job scope veya evaluated time | `COST_BUDGET_INVALID` |
| `USD`/`EUR` dışında currency | `COST_BUDGET_INVALID` |
| Negatif veya safe-integer dışı cap/spend | `COST_BUDGET_INVALID` |

> P14-T06 internal FinOps policy decision contract'ıdır; gerçek money movement, invoice/billing/charge/payment, finansal tavsiye veya yatırım/harcama kararı üretmez.

## 3. Doğrulama kanıtı

Dar kapsam test paketi `test/finops/cost-budgets.test.ts`, üç scope için deterministic allow/warning/block eşiklerini, zero-cap fail-closed davranışını, non-dispatching flags'i ve invalid input red yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/finops/cost-budgets.test.ts` | Başarılı — 1 dosya / 3 test | Threshold, alert reference, zero-cap davranışı ve invalid input red yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 95 dosya / 364 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Budget persistence, actual spend collection, distributed atomicity, concurrent cap reservation veya worker/retry/job stop execution.
2. PagerDuty/Opsgenie/e-posta/SMS/webhook/queue alert dispatch, on-call contact, ack/silence/escalation veya automatic remediation.
3. Tariff/pricing fetch, currency conversion, tax/discount, invoice, billing, charge/payment veya finansal tavsiye/karar.
4. Dashboard, finance API/CSV export veya frontend/UI.
5. Raw provider/target URL, payload, usage event, record, credential, token, cookie, authorization, raw error veya serbest metadata capture.

## 5. Review kararı

P14-T06 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic reference contract ve sandbox regression/build doğrulamasını kanıtlar; gerçek budget persistence/reservation, job stop, alert dispatch, tariff/currency/billing/payment, persistent store veya distributed service E2E doğrulaması ya da production readiness iddiası değildir. Sıradaki bounded paket P14-T07 — Finance Export, Reconciliation & Period Close olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 14 Cost Intelligence — P14-T06 kabul kriteri"
