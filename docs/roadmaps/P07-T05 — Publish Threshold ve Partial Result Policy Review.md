# P07-T05 — Publish Threshold ve Partial Result Policy Review

**Program:** Scraping Platform  
**Phase:** 7 — Schema Engine  
**Task:** P07-T05  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, deterministic publication eligibility decision  
**Bağımlılık:** P07-T04 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P07-T05, P07-T04 quality report setini side-effect içermeyen bir policy evaluator üzerinden değerlendirir. Evaluator, aynı immutable schema snapshot'a ait report’ların valid-record sayısını, invalid ratio’sunu, ortalama quality score’unu ve minimum quality threshold üzerindeki valid record sayısını hesaplar. Çıktı yalnız `PUBLISH_ALLOWED`, `PARTIAL_ALLOWED` veya `PUBLISH_BLOCKED` kararı ile safe reason code ve aggregate count taşır; record/field value, raw artifact veya publish sonucu üretmez.[1]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Policy contract | `src/schema/publish-policy.ts` | Minimum quality, valid record, invalid ratio, partial flag |
| Decision evaluator | `src/schema/publish-policy.ts` | Deterministic allow / partial / block kararı |
| Snapshot guard | `src/schema/publish-policy.ts` | Aynı tenant/project/schema/version/fingerprint zorunluluğu |
| Safe reason codes | `src/schema/publish-policy.ts` | Threshold/ratio/count reason'ları; record içerik yok |
| Unit acceptance | `test/schema/publish-policy.test.ts` | Full allow, partial, block, empty/invalid input/snapshot mismatch |

## 2. Policy contract ve karar matrisi

Policy dört explicit alandan oluşur: `minimumQualityScorePercent` (0–100), `minimumValidRecords` (1–1.000.000), `maxInvalidRatioPercent` (0–100) ve `allowPartialResults` (boolean). Quality threshold, **her bir valid record** için uygulanır; sadece yüksek ortalama, düşük kaliteli bir record'u gizleyemez.

| Koşul | Karar | Reason code |
|---|---|---|
| Boş report seti | `PUBLISH_BLOCKED` | `NO_RECORDS` |
| Valid count ≥ minimum, invalid ratio ≤ max, threshold-qualified valid count ≥ minimum | `PUBLISH_ALLOWED` | — |
| Blocking ratio var; partial açık ve yeterli valid/high-quality record var | `PARTIAL_ALLOWED` | İlgili blocking reason korunur |
| Valid veya quality count minimumun altında | `PUBLISH_BLOCKED` | `MINIMUM_VALID_RECORDS_NOT_MET`, `QUALITY_BELOW_THRESHOLD` |
| Partial sonuç kapalı | `PUBLISH_BLOCKED` | `PARTIAL_RESULTS_DISABLED` |

> **Karar sınırı:** `PARTIAL_ALLOWED`, dataset publish yan etkisi değildir; sadece downstream staging/publish flow’unun partial state'i açıkça işlemesine izin veren güvenli eligibility output'tur.

## 3. Snapshot ve no-leakage sınırı

Evaluator; bütün input report’ların aynı `tenantId`, `projectId`, `schemaId`, `schemaName`, `schemaVersion` ve definition fingerprint'ine sahip olmasını zorunlu kılar. Farklı schema snapshot'ları birleştirilemez. Böylece score aggregate'i farklı schema semantics'e ait kayıtları yanlışlıkla aynı policy kararına sokmaz.

| Decision output'ta bulunur | Decision output'ta bulunmaz |
|---|---|
| Schema identity/version/fingerprint | Record, field, raw veya normalized value |
| Valid/invalid/threshold count | Selector, artifact storage key veya source body |
| Invalid ratio ve average score | Unknown input field name |
| Safe decision status/reason code | Database write, queue message veya publish side effect |

## 4. Acceptance kanıtı

Dar kapsam testleri four behavior grubunu kapsar: tüm gate’ler geçince full allow, explicit partial policy ile labeled partial allow, empty/insufficient/policy-disabled block ve invalid policy/snapshot mismatch reject path’i. Dar kapsam sonucu `1 test file / 4 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **52 test dosyası / 234 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Dataset staging/persist/publish transaction | Phase 11 Dataset Platform sorumluluğu |
| Publish attempt/job orchestration | Phase 9 sorumluluğu |
| Policy persistence, CRUD, preview API | P07-T06 sorumluluğu |
| Multi-run/window aggregate policy | Dataset/Operations tasarımında genişletilecek |
| Audit/outbox event emission | Platform/Phase 9 sorumluluğu |
| DB/Redis/storage E2E | Devralınan platform açık koşulu |
| UI policy yönetimi | Kullanıcının seçtiği backend-only scope dışında |

## 6. Review kararı talebi

P07-T05 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P07-T06 — Schema CRUD & Validation Preview API olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/06-extraction-schema-crawler.md "Quality ve job acceptance policy"
[2]: ../../scraping-platform-docs/docs/13-task-register.md "P07 task sıralaması"
[3]: ./phase-7-schema-engine-p07-t04-review.md "P07-T04 quality report contract"
[4]: ./phase-7-schema-engine-task-board.md "Phase 7 task board"
