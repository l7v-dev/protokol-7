# Phase 6 — Extraction Engine Çalışma Panosu

**Program:** Scraping Platform  
**Milestone / Phase:** M6 / Phase 6 — Extraction Engine  
**Kapsam:** Backend-only extraction plan, bounded extraction engines, normalization, diagnostics, controlled AI reference ve acceptance gate  
**Güncel durum:** P06-T01–P06-T08 Accepted; M6 `Accepted — CONDITIONAL NO-GO` olarak kapatıldı

> **Çalışma ilkesi:** Her bounded paket source, test, Türkçe review belgesi ve nihai kalite kapısından sonra explicit kullanıcı `onaylandı` kararıyla kapanır. Hiçbir paket live target fetch, provider call, credential/account erişimi, automatic bypass veya production aktivasyonu başlatmaz.

| ID | Workstream | Görev | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P06-T01 | Extraction | Immutable extraction plan ve versioning modeli | Data/Extraction Lead | 5 | P05-T08 | Accepted | `docs/phase-06-extraction-engine-p06-t01-review.md`, `src/extraction/plan.ts`, `test/extraction/plan.test.ts` |
| P06-T02 | Extraction | Bounded CSS/XPath extraction motoru | Data/Extraction Lead | 8 | P06-T01 | Accepted | `docs/phase-06-extraction-engine-p06-t02-review.md`, `src/extraction/html-selector-engine.ts`, `test/extraction/html-selector-engine.test.ts` |
| P06-T03 | Extraction | Bounded JSONPath/API extraction motoru | Data/Extraction Lead | 7 | P06-T02 | Accepted | `docs/phase-06-extraction-engine-p06-t03-review.md`, `src/extraction/jsonpath-engine.ts`, `test/extraction/jsonpath-engine.test.ts` |
| P06-T04 | Extraction | Bounded HTML/DOM cleaner ve raw artifact referanslı parse pipeline | Data/Extraction Lead | 5 | P06-T03 | Accepted | `docs/phase-06-extraction-engine-p06-t04-review.md`, `src/extraction/html-cleaner.ts`, `test/extraction/html-cleaner.test.ts` |
| P06-T05 | Data | İdempotent normalize transform kütüphanesi | Data/Extraction Lead | 6 | P06-T04 | Accepted | `docs/phase-06-extraction-engine-p06-t05-review.md`, `src/extraction/normalize.ts`, `test/extraction/normalize.test.ts` |
| P06-T06 | Quality | Extraction evidence ve field-level diagnostics | Data/Extraction Lead | 5 | P06-T05 | Accepted | `docs/phase-06-extraction-engine-p06-t06-review.md`, `src/extraction/diagnostics.ts`, `test/extraction/diagnostics.test.ts` |
| P06-T07 | AI | Controlled AI extraction adapter ve schema-gated structured output | Data/Extraction Lead | 8 | P06-T06 | Accepted | `docs/phase-06-extraction-engine-p06-t07-review.md`, `src/extraction/ai-extraction.ts`, `test/extraction/ai-extraction.test.ts` |
| P06-T08 | Quality | Extraction fixture, drift/regression acceptance ve M6 gate | QA Lead | 7 | P06-T07 | Accepted | `docs/phase-06-extraction-engine-p06-t08-review.md`, `docs/phase-06-extraction-engine-m6-gate.md`, `src/extraction/acceptance-gate.ts`, `test/extraction/acceptance-gate.test.ts`, `scripts/extraction-gate-smoke.ts` |

## Kapsam dışı

Real provider, storage, queue, browser, target veya model integration; credential/account access; live target fetch; automatic dispatch/retry/bypass; anti-bot/CAPTCHA/WAF bypass; production release/deployment ve frontend/UI bu phase kapsamı dışındadır. M15 `Accepted — CONDITIONAL NO-GO` güvenlik sınırı değişmez.
