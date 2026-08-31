# P07-T04 — Field Diagnostics ve Quality Score Review

**Program:** Scraping Platform  
**Phase:** 7 — Schema Engine  
**Task:** P07-T04  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, deterministic quality projection  
**Bağımlılık:** P07-T03 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P07-T04, P07-T03 schema validation result'ını ve varsa P06 extraction diagnostics evidence'ini tek bir deterministic quality projection içinde birleştirir. Field outcome'ları `VALID`, `OPTIONAL_MISSING`, `INVALID`, `EXTRACTION_ERROR` veya `REDACTED` olarak sınıflandırılır. Report yalnız güvenli schema identity/fingerprint, safe field key, score/weight, status, error code, aggregate count ve safe evidence fingerprint'lerini taşır; source/raw/normalized value, selector veya storage key taşımaz.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Quality projection | `src/schema/quality.ts` | Deterministic field score ve quality percentage |
| Diagnostics merge | `src/schema/quality.ts` | Validation ile extraction error/redaction outcome birleştirme |
| Field weights | `src/schema/quality.ts` | Bounded caller-supplied weight: 0.1–10; safe field keys ile sınırlı |
| Evidence projection | `src/schema/quality.ts` | Attempt ID, plan fingerprint, artifact checksum; selector/key/value yok |
| Unit acceptance | `test/schema/quality.test.ts` | Score, no-leakage, error/redaction priority, tenant/weight guardrail |

## 2. Quality score contract

Her field için score; `VALID = 1`, `OPTIONAL_MISSING = 0.5`, `INVALID = 0`, `EXTRACTION_ERROR = 0` ve `REDACTED = 0` olarak hesaplanır. Varsayılan ağırlık required-missing failure görülen field için `2`, diğer field için `1`’dir; caller yalnız declared top-level field için 0.1–10 aralığında explicit ağırlık verebilir.

> **Formül:** `qualityScorePercent = round((Σ(weight × score) / Σ(weight)) × 100, 2)`. Validation result invalid ise score hesaplanmaya devam eder, ancak `validationValid` kesin olarak `false` kalır. P07-T05 publish policy hem score hem validation state üzerinden karar vermelidir; bu paket publish kararı vermez.

| Outcome | Score | Öncelik | Açıklama |
|---|---:|---:|---|
| `REDACTED` | 0 | 1 | Sensitive/redacted extraction sonucu diğer valid state’in önündedir |
| `EXTRACTION_ERROR` | 0 | 2 | Selector/extraction error evidence’i field score’u sıfırlar |
| `INVALID` | 0 | 3 | Schema type/constraint/lineage validation başarısız |
| `OPTIONAL_MISSING` | 0.5 | 4 | Required olmayan, görünmeyen field |
| `VALID` | 1 | 5 | Schema validation başarısı |

## 3. Evidence ve no-leakage davranışı

Extraction evidence verildiğinde tenant scope doğrulanır. Quality report’a yalnız attempt ID, plan fingerprint ve artifact checksum alınır. Extraction `ERROR` veya `REDACTED` state’i, validator field valid olsa bile score sonucunda önceliklidir. Buna karşılık validation report dışındaki extraction metadata veya source content okunmaz.

| Report’ta bulunur | Report’ta bulunmaz |
|---|---|
| Schema ID/name/version/fingerprint | Raw veya normalized record value |
| Safe schema field key ve safe error code | Unknown input field name |
| Weight, score, status ve aggregate count | CSS/XPath/JSONPath selector |
| Attempt ID, plan/artifact SHA-256 | Artifact storage key veya source body |

Bu contract `qualityScorePercent` üretir, ancak threshold uygulamaz ve dataset publish etmez. Publish threshold, minimum valid record, partial-result policy ve audit decision P07-T05’in ayrı sorumluluğudur.[3]

## 4. Acceptance kanıtı

Dar kapsam suite’i üç behavior grubunu doğrular: weighted valid/invalid/optional-missing score ile no-value-leakage, extraction error ve redaction status önceliği ile safe evidence projection, tenant mismatch ve undeclared/out-of-bounds field weight reject path’leri. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **51 test dosyası / 230 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Publish threshold ve partial result decision | P07-T05 sorumluluğu |
| Quality config persistence/API | P07-T05/P07-T06 sorumluluğu |
| Dataset staging/publish | Phase 11 sorumluluğu |
| Multi-record aggregation | P07-T05 policy veya Dataset phase sorumluluğu |
| Extraction → validation worker lifecycle | Phase 9 orchestration sorumluluğu |
| Durable/distributed diagnostics registry | Önceki milestone'lardan devralınan platform koşulu |
| UI quality surface | Kullanıcının seçtiği backend-only scope dışında |

## 6. Review kararı talebi

P07-T04 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P07-T05 — Publish Threshold & Partial Result Policy olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/06-extraction-schema-crawler.md "Quality score tasarımı"
[2]: ../src/extraction/diagnostics.ts "Extraction diagnostics evidence sınırı"
[3]: ../../scraping-platform-docs/docs/13-task-register.md "P07 task sıralaması"
[4]: ./phase-7-schema-engine-p07-t03-review.md "P07-T03 validation result contract"
[5]: ./phase-7-schema-engine-task-board.md "Phase 7 task board"
