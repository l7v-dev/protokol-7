# Phase 7 — Schema Engine Task Board

**Program:** Scraping Platform  
**Milestone:** M7 — Schema Quality Gate Ready  
**Kapsam:** Backend-only  
**Ön koşul:** M6 Extraction Engine — `CONDITIONAL GO`, kullanıcı onaylı  
**Board sahibi:** Data/Extraction Lead  
**Güncel durum:** M7 `CONDITIONAL GO` — kullanıcı onaylı; P07-T07 kullanıcı talebiyle scope dışı, Phase 8 başlangıcı bekliyor

## Amaç

Phase 7; extraction çıktılarının hangi alanları, tipleri ve sınırları taşıyabileceğini açık bir data contract ile tanımlamayı; izleyen paketlerde version/compatibility, normalized-value validation, quality score ve publish threshold kontrollerini eklemeyi hedefler. Schema definition, extraction planından bağımsızdır; plan veriyi nasıl çıkaracağını, schema ise çıkarılan kaydın kabul edilebilir yapısını belirler.[1]

> **Değiştirilemez guardrail:** Schema contract secret/credential-shaped alan adlarını kabul etmez. Parser serbest script, executable validation, unbounded pattern veya data publish işlemi yapmaz. Tenant/project identity ve schema version persistence katmanı P07-T02 ile, record validation P07-T03 ile ele alınacaktır.

## Task matrisi

| ID | Workstream | Task | Owner | Efor (pd) | Dependency | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P07-T01 | Schema | Schema definition contract ve field type sistemini kesinleştir | Data/Extraction Lead | 5 | P06-T08 | Accepted | `docs/phase-7-schema-engine-p07-t01-review.md`, `src/schema/definition.ts`, `test/schema/definition.test.ts` |
| P07-T02 | Schema | Schema versioning ve compatibility politikasını uygula | Backend Lead | 5 | P07-T01 | Accepted | `docs/phase-7-schema-engine-p07-t02-review.md`, `src/schema/versioning.ts`, `test/schema/versioning.test.ts` |
| P07-T03 | Validation | Schema validator ve normalized value kontrollerini geliştir | Data/Extraction Lead | 8 | P07-T02 | Accepted | `docs/phase-7-schema-engine-p07-t03-review.md`, `src/schema/validator.ts`, `test/schema/validator.test.ts` |
| P07-T04 | Quality | Field diagnostics ve quality score motorunu geliştir | Data/Extraction Lead | 6 | P07-T03 | Accepted | `docs/phase-7-schema-engine-p07-t04-review.md`, `src/schema/quality.ts`, `test/schema/quality.test.ts` |
| P07-T05 | Quality | Publish threshold ve partial result policy’sini uygula | Product Owner | 4 | P07-T04 | Accepted | `docs/phase-7-schema-engine-p07-t05-review.md`, `src/schema/publish-policy.ts`, `test/schema/publish-policy.test.ts` |
| P07-T06 | API | Schema CRUD ve validation preview uçlarını tamamla | Backend Lead | 5 | P07-T05 | Accepted | `docs/phase-7-schema-engine-p07-t06-review.md`, `src/routes/resources.ts`, `test/schema-api-preview.test.ts` |
| P07-T07 | UI | Schema yönetim ekranı ve alan kalite görünümünü hazırla | Frontend Lead | 6 | P07-T06 | Scope Excluded — kullanıcı backend-only talimatı | UI uygulanmayacak; M7 backend gate bağımlılık istisnası kayıtlı |
| P07-T08 | Quality/Gate | Schema acceptance, compatibility ve regression gate’ini tamamla | QA Lead | 6 | P07-T06 (backend-only scope) | Accepted — CONDITIONAL GO | `docs/phase-7-schema-engine-m7-gate.md`, `scripts/schema-gate-smoke.ts`, `package.json` |

## P07-T01 contract sınırı

| Contract alanı | P07-T01 davranışı | Sonraki paket sahibi |
|---|---|---|
| Primitive types | `string`, `number`, `boolean` | P07-T03 record validator |
| Composite types | Bounded nested `object` ve homogeneous `array` | P07-T03 record validator |
| Field constraints | String length/pattern; number minimum/maximum; object additional-properties policy | P07-T03 enforcement |
| Nullability/required | Açık required; opt-in nullable | P07-T03 record validator |
| Parser result | Canonical SHA-256 fingerprint; stable contract artifact | P07-T02 version/compatibility |
| Persistence/API | Bu pakette yok | P07-T02/P07-T06 |
| Quality/publish | Bu pakette yok | P07-T04/P07-T05 |

## References

[1]: ../../scraping-platform-docs/docs/06-extraction-schema-crawler.md "Extraction, Schema ve Crawler Motoru"
[2]: ../../scraping-platform-docs/docs/13-task-register.md "Kurumsal task register — Phase 7"
[3]: ../../scraping-platform-docs/docs/backend/phase-0-m0-core-domain.md "Core domain Schema invariant'ları"
[4]: ./phase-6-extraction-engine-m6-gate.md "M6 Extraction Engine gate"
