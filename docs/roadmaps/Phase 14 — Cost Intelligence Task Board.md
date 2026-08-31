# Phase 14 — Cost Intelligence Task Board

**Program:** Scraping Platform  
**Phase:** 14 — Cost Intelligence  
**Milestone:** M14 — Cost Attribution Accepted  
**Güncel durum:** M14 Accepted — CONDITIONAL GO; P14-T01–P14-T08 Accepted

| ID | Workstream | Task | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P14-T01 | FinOps | Usage event modelini ve cost category sözlüğünü kesinleştir | FinOps/Operations | 4 | P13-T08 | Accepted | `docs/phase-14-cost-intelligence-p14-t01-review.md`, `src/finops/usage-events.ts`, `test/finops/usage-events.test.ts` |
| P14-T02 | FinOps | Provider tariff ve pricing configuration yönetimini kur | FinOps/Operations | 5 | P14-T01 | Accepted | `docs/phase-14-cost-intelligence-p14-t02-review.md`, `src/finops/tariffs.ts`, `test/finops/tariffs.test.ts` |
| P14-T03 | Metering | HTTP, browser, proxy, LLM, storage ve compute meter'larını ekle | SRE/Platform Lead | 8 | P14-T02 | Accepted | `docs/phase-14-cost-intelligence-p14-t03-review.md`, `src/finops/metering.ts`, `test/finops/metering.test.ts` |
| P14-T04 | FinOps | Retry ve fallback maliyet allocation kuralını uygula | FinOps/Operations | 5 | P14-T03 | Accepted | `docs/phase-14-cost-intelligence-p14-t04-review.md`, `src/finops/retry-fallback-allocation.ts`, `test/finops/retry-fallback-allocation.test.ts` |
| P14-T05 | FinOps | Job cost aggregation ve cost-per-record hesaplamasını geliştir | FinOps/Operations | 6 | P14-T04 | Accepted | `docs/phase-14-cost-intelligence-p14-t05-review.md`, `src/finops/job-cost-aggregation.ts`, `test/finops/job-cost-aggregation.test.ts` |
| P14-T06 | FinOps | Tenant/project/job budget cap ve cost alert mekanizmasını ekle | Product Owner | 5 | P14-T05 | Accepted | `docs/phase-14-cost-intelligence-p14-t06-review.md`, `src/finops/cost-budgets.ts`, `test/finops/cost-budgets.test.ts` |
| P14-T07 | Reporting | Finance export, reconciliation ve period close raporunu oluştur | FinOps/Operations | 6 | P14-T06 | Accepted | `docs/phase-14-cost-intelligence-p14-t07-review.md`, `src/finops/finance-reporting.ts`, `test/finops/finance-reporting.test.ts` |
| P14-T08 | Quality | Cost attribution completeness ve acceptance testini tamamla | QA Lead | 6 | P14-T07 | Accepted | `docs/phase-14-cost-intelligence-p14-t08-review.md`, `src/finops/acceptance-gate.ts`, `test/finops/acceptance-gate.test.ts`, `scripts/finops-gate-smoke.ts` |

> **Bağımlılık notu:** Phase 14 workstream'i backend-only ve explicit review kapılarıyla ilerler. Tariff/pricing, external billing, payment, dashboard/UI veya gerçek provider metering bağlantısı, ilgili bounded paketin açık onayı olmadan başlatılmaz.

> **M14 karar notu:** Kullanıcı onayıyla M14, açık live-metering/tariff-source/ledger/enforcement/export/accounting/billing/distributed-E2E koşulları korunarak `Accepted — CONDITIONAL GO` olarak kapatılmıştır. Ayrıntı: `docs/phase-14-cost-intelligence-m14-gate.md`.
