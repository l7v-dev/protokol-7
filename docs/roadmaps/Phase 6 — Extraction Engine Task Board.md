# Phase 6 — Extraction Engine Task Board

**Program:** Scraping Platform  
**Milestone:** M6 — Extraction Engine Accepted  
**Kapsam:** Backend-only  
**Ön koşul:** M5 Reliability Engine — `CONDITIONAL GO`, kullanıcı onaylı  
**Board sahibi:** Data/Extraction Lead  
**Güncel durum:** M6 `CONDITIONAL GO` — kullanıcı onaylı; Phase 7 başlangıcı bekliyor

## Amaç

Phase 6; raw HTTP veya browser artifact'inden CSS/XPath/JSONPath yoluyla deterministik extraction, normalize transform, evidence ve field diagnostic üretmeyi hedefler. Plan, job/attempt ile immutable ilişkilendirilecek; raw artifact, plan version ve evidence bilgisi tenant sınırları içinde izlenebilir tutulacaktır. Controlled AI extraction, deterministic plan/evidence sınırı oluşturulduktan sonra ayrı task'ta ele alınacaktır.

> **Değiştirilemez guardrail:** Extraction engine raw credential, cookie, authorization, session veya secret değerlerini plan, queue, audit, telemetry ya da evidence state'ine yazmaz. Anti-bot/CAPTCHA bypass, serbest kod çalıştırma ve untrusted selector script execution kapsam dışıdır.

## Task matrisi

| ID | Workstream | Task | Owner | Efor (pd) | Dependency | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P06-T01 | Extraction | Extraction plan modelini ve versioning yapısını oluştur | Data/Extraction Lead | 5 | P05-T08 | Accepted | `docs/phase-6-extraction-engine-p06-t01-review.md`, `src/extraction/plan.ts`, `test/extraction/plan.test.ts` |
| P06-T02 | Extraction | CSS/XPath extraction motorunu geliştir | Data/Extraction Lead | 8 | P06-T01 | Accepted | `docs/phase-6-extraction-engine-p06-t02-review.md`, `src/extraction/html-selector-engine.ts`, `src/types/xpath.d.ts`, `test/extraction/html-selector-engine.test.ts` |
| P06-T03 | Extraction | JSONPath/API extraction motorunu geliştir | Data/Extraction Lead | 7 | P06-T02 | Accepted | `docs/phase-6-extraction-engine-p06-t03-review.md`, `src/extraction/jsonpath-engine.ts`, `test/extraction/jsonpath-engine.test.ts` |
| P06-T04 | Extraction | HTML/DOM cleaner ve parse pipeline'ını geliştir | Data/Extraction Lead | 5 | P06-T03 | Accepted | `docs/phase-6-extraction-engine-p06-t04-review.md`, `src/extraction/html-cleaner.ts`, `test/extraction/html-cleaner.test.ts` |
| P06-T05 | Data | Normalize transform kütüphanesini geliştir | Data/Extraction Lead | 6 | P06-T04 | Accepted | `docs/phase-6-extraction-engine-p06-t05-review.md`, `src/extraction/normalize.ts`, `test/extraction/normalize.test.ts` |
| P06-T06 | Quality | Extraction evidence ve field diagnostics modelini ekle | Data/Extraction Lead | 5 | P06-T05 | Accepted | `docs/phase-6-extraction-engine-p06-t06-review.md`, `src/extraction/diagnostics.ts`, `test/extraction/diagnostics.test.ts` |
| P06-T07 | AI | Kontrollü AI extraction adapter ve structured output akışını ekle | Data/Extraction Lead | 8 | P06-T06 | Accepted | `docs/phase-6-extraction-engine-p06-t07-review.md`, `src/extraction/ai-extraction.ts`, `test/extraction/ai-extraction.test.ts` |
| P06-T08 | Quality/Gate | Extraction fixture, drift ve regression kabulünü tamamla | QA Lead | 7 | P06-T07 | Accepted — CONDITIONAL GO | `docs/phase-6-extraction-engine-m6-gate.md`, `scripts/extraction-gate-smoke.ts`, `package.json` |

## M6 acceptance sınırları

| Alan | M6 için gerekli kanıt | Mevcut durum |
|---|---|---|
| Plan immutability | Plan version, SHA-256 fingerprint ve attempt binding | P06-T01 |
| Selector execution | CSS/XPath/JSONPath deterministic fixtures | P06-T02/P06-T03 |
| Raw preservation | Cleaner sonrası raw artifact referansı korunur | P06-T04 |
| Transform traceability | Raw/normalized value ve transform chain izlenir | P06-T05 |
| Field diagnostics | Evidence, empty/error reason ve selector provenance | P06-T06 |
| AI safety | Structured output, schema validation, data minimization | P06-T07 |
| Gate | Fixture/drift/regression + operasyon notu | P06-T08 |

## References

[1]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP roadmap"
[2]: ../../scraping-platform-docs/docs/13-task-register.md "Kurumsal task register"
[3]: ./phase-5-reliability-engine-m5-gate.md "M5 Reliability Engine gate"
[4]: ./phase-5-reliability-engine-task-board.md "Phase 5 task board"
[5]: ./phase-4-proxy-intelligence-operations.md "Operations runbook"
