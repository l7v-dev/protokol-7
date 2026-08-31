# P14-T08 — Cost Attribution Completeness & Acceptance Review

**Program:** Scraping Platform  
**Milestone / Phase:** M14 / Phase 14 — Cost Intelligence  
**Task:** P14-T08  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, deterministic, secret-safe, non-dispatching cost attribution acceptance gate

## 1. Amaç ve kabul sınırı

P14-T08, P14-T01–P14-T07 contract'larını sentetik bir cost attribution drill'inde birleştirir. Phase 14 backlog'u tüm metering source'larının ve cost attribution zincirinin acceptance testinde doğrulanmasını kabul kriteri olarak tanımlar.[1]

`src/finops/acceptance-gate.ts`, sabit in-memory bir scope/time senaryosuyla usage vocabulary, effective tariff resolve, retry/fallback allocation, job aggregation, budget decision ve period-close reconciliation kontrolünü çalıştırır. `scripts/finops-gate-smoke.ts`, bu senaryo için deterministic gate komutunu sağlar.

| Acceptance kontrolü | Deterministic sonuç |
|---|---|
| Fixed usage vocabulary | 9 P14-T01 category'nin tamamı üretildi |
| Effective tariff resolution | Tüm rate quote'lar aynı synthetic `USD` tariff version'ından çözüldü |
| Retry/fallback attribution | Retry, browser fallback ve proxy fallback bucket'ları üretildi |
| Job aggregation | 9 rated usage, 1.400 micro-cost total, 2 published record için 700 micro-cost/record |
| Budget decision | Job cap'te `BLOCKED` decision; dispatch/automatic stop yok |
| Period close | Exact reconciliation ile `RECONCILED` ve non-persisting `CLOSED` decision |

## 2. Güvenlik ve side-effect sınırı

Gate yalnız safe tenant/project/job scope, sabit numeric measurements, fixed category/unit sözlüğü, synthetic rate quote ve bounded aggregate alanlarını output'a taşır. Provider tariff ID, target/URL, payload, record, prompt/model output, credential, token, cookie, authorization, raw error, contact veya real money data output'a girmez.

| Flag | Sabit değer | Anlamı |
|---|---:|---|
| `allowExternalExport` | `false` | Finance file/API export yok |
| `allowBillingOrPayment` | `false` | Invoice, billing, charge veya payment yok |
| `allowAutomaticStop` | `false` | Job/worker stop veya remediation yok |

> P14-T08 sentetik acceptance evidence üretir. Live runtime usage toplamaz, provider tariff import etmez, gerçek accounting period kapatmaz, ledger/persistence yazmaz, dış alert göndermez ve herhangi bir para hareketi gerçekleştirmez.

## 3. Doğrulama kanıtı

Dar kapsam Vitest paketi chain'in PASS senaryosunu, aynı scope/time için deterministic output'u, raw/financial secret minimization'ı ve invalid input fail-closed yollarını kapsar. `pnpm test:finops-gate`, aynı sentetik drill'i `P14-T08 PASS` ile doğrular.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/finops/acceptance-gate.test.ts` | Başarılı — 1 dosya / 3 test | Full chain, deterministic output/data minimization ve invalid scope/time |
| `pnpm test:finops-gate` | Başarılı — `P14-T08 PASS` | Deterministic sentetik Cost Intelligence smoke gate |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 97 dosya / 370 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Live runtime metering, provider tariff API/import, real usage collection, database/Redis/S3 ledger persistence veya distributed atomic attribution.
2. External finance/file/API/CSV export, accounting close execution, reconciliation with a real ledger, finance system integration veya audit attestation.
3. Currency conversion, tax/discount, invoice, billing, charge/payment veya finansal tavsiye/karar.
4. Budget reservation/enforcement, job/worker/retry stop, alert/on-call dispatch, automatic remediation, dashboard veya frontend/UI.
5. Raw provider/target URL, payload, record, prompt/model content, credential, token, cookie, authorization, raw error veya serbest metadata capture.

## 5. Review kararı

P14-T08 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic reference contract ve sandbox regression/build doğrulamasını kanıtlar; gerçek runtime metering, provider tariff import, external finance export/accounting close, billing/payment, persistence veya distributed service E2E doğrulaması ya da production readiness iddiası değildir. Bu kullanıcı onayı M14 / Phase 14 exit gate değerlendirmesinin ön koşulunu karşılar.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 14 Cost Intelligence — P14-T08 kabul kriteri"
