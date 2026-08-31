# Phase 11 — Dataset Platform Task Board

**Program:** Scraping Platform  
**Phase amacı:** Versioned dataset, record lineage, export ve retention işlevlerini backend-only contract'larla ilerletmek.[1]  
**Güncel durum:** P11-T01–P11-T08 Accepted; M11 `CONDITIONAL GO`; Phase 12 backend-only kapsam doğrulaması bekleniyor

| ID | Workstream | Task | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P11-T01 | Dataset | Dataset/dataset version/record veri modelini kesinleştir | Data/Extraction Lead | 6 | P10-T08 | Accepted | `docs/phase-11-dataset-platform-p11-t01-review.md`, `src/dataset/model.ts`, `test/dataset/model.test.ts` |
| P11-T02 | Dataset | Staging, publish ve abort transaction akışını geliştir | Backend Lead | 8 | P11-T01 | Accepted | `docs/phase-11-dataset-platform-p11-t02-review.md`, `src/dataset/staging-transaction.ts`, `test/dataset/staging-transaction.test.ts` |
| P11-T03 | Export | JSON, JSONL ve CSV export adapter’larını geliştir | Backend Lead | 6 | P11-T02 | Accepted | `docs/phase-11-dataset-platform-p11-t03-review.md`, `src/dataset/export-adapters.ts`, `test/dataset/export-adapters.test.ts` |
| P11-T04 | Export | Parquet, API ve S3 delivery yeteneklerini ekle | Backend Lead | 8 | P11-T03 | Accepted | `docs/phase-11-dataset-platform-p11-t04-review.md`, `src/dataset/delivery-capabilities.ts`, `test/dataset/delivery-capabilities.test.ts` |
| P11-T05 | Data Quality | Record dedupe/upsert ve lineage bilgisini uygula | Data/Extraction Lead | 6 | P11-T04 | Accepted | `docs/phase-11-dataset-platform-p11-t05-review.md`, `src/dataset/dedupe-upsert.ts`, `test/dataset/dedupe-upsert.test.ts` |
| P11-T06 | Governance | Dataset retention, deletion ve legal hold kontrollerini uygula | Security Lead | 5 | P11-T05 | Accepted | `docs/phase-11-dataset-platform-p11-t06-review.md`, `src/dataset/retention-governance.ts`, `test/dataset/retention-governance.test.ts` |
| P11-T07 | API | Dataset/record/version sorgu ve export kontrol uçlarını tamamla | Backend Lead | 6 | P11-T06 | Accepted | `docs/phase-11-dataset-platform-p11-t07-review.md`, `src/dataset/query-export-api.ts`, `test/dataset/query-export-api.test.ts` |
| P11-T08 | Quality/Gate | Dataset E2E, format, lineage ve retention acceptance’ını yap | QA Lead | 8 | P11-T07 | Accepted | `docs/phase-11-dataset-platform-m11-gate.md`, `scripts/dataset-gate-smoke.ts` |

## P11-T01 bounded scope

P11-T01 yalnız tenant/project-scoped dataset metadata, immutable sequential `DRAFT` dataset version, source job/schema/plan binding ve value-free record lineage sağlar. Staging/publish/abort, database persistence, raw record/artifact storage, export, dedupe/upsert, retention/deletion, API/UI ve real E2E bu paketin dışındadır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 11 Dataset Platform task register"
