# P06-T05 — Normalize Transform Kütüphanesi Review

**Program:** Scraping Platform  
**Milestone:** M6 — Extraction Engine Accepted  
**Task:** P06-T05  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P06-T04 — kullanıcı onaylı

## 1. Teslim özeti

P06-T05, extraction value'ları için whitelist tabanlı, deterministic ve idempotent normalize transform kütüphanesini ekler. Transform tanımı `ExtractionPlan` field'ına bağlanabilir; registry transform listesini plan version ile birlikte deep-copy ederek immutable hale getirir. `ExtractionNormalizer`, raw value, normalized value, sıralı step trace ve redaction bilgisini tek sonuç sözleşmesinde üretir.

Kütüphane arbitrary expression, kullanıcı regex'i, locale inference veya kod yürütme kabul etmez. Böylece normalization davranışı aynı input ve aynı ordered transform chain için tekrar üretilebilir ve izlenebilir kalır.

> **Lineage kuralı:** Sensitive raw input, transform trace'e dahi açık değer olarak girmez. `rawValue`, `normalizedValue` ve step listesi `[REDACTED]` sınırında tutulur.

## 2. İzinli transform sözleşmesi

| Transform | Davranış | İdempotence |
|---|---|---|
| `TRIM` | Baş/son whitespace temizler | Evet |
| `COLLAPSE_WHITESPACE` | İç whitespace'i tek boşluğa indirger ve trim yapar | Evet |
| `LOWERCASE` | Küçük harfe dönüştürür | Evet |
| `UPPERCASE` | Büyük harfe dönüştürür | Evet |
| `REMOVE_CURRENCY_SYMBOL` | Unicode currency sembollerini kaldırır | Evet |
| `NORMALIZE_DECIMAL` | Güvenli numeric string'lerde ayırıcıları canonical decimal formata taşır | Evet |

Transform chain maksimum 10 adımdır. Plan registration veya normalizer çağrısında whitelist dışında bir kind gelirse terminal `EXTRACTION_PLAN_INVALID` ya da `NORMALIZATION_TRANSFORM_INVALID` döner. Tüm transformlar output'u üzerinde çalıştığından chained ve single run idempotence korunur.

## 3. Raw/normalized lineage

Her `NormalizedExtractionValue` aşağıdaki alanları döndürür:

| Alan | Anlam |
|---|---|
| `rawValue` | Extraction engine'den gelen input; secret-like ise maskeli |
| `normalizedValue` | Ordered transform chain sonrasındaki değer |
| `steps` | Her transform için kind/input/output trace'i |
| `redacted` | Sensitive input/value maskelendiğini gösterir |
| `transformFingerprint` | Ordered transform kind chain veya `IDENTITY` |

Field plan transform listesi plan version'a dahil edildiğinden, P06-T01 fingerprint output'u transform değişiminde de değişir. Result consumer bu fingerprint ile hangi normalization policy'nin kullanıldığını plan version üzerinden izleyebilir.

## 4. Safety ve limitler

| Kontrol | Davranış |
|---|---|
| Arbitrary transform | Reddedilir; expression/script/regex API'si yoktur |
| Chain limit | En fazla 10 transform |
| Input tipi | String dışı direct normalizer input'u terminal reddedilir |
| Secret-like value | Raw, normalized ve trace yerine `[REDACTED]` |
| Redacted transform | Transform uygulanmaz; trace boş kalır |
| Plan immutability | Transform listesi registration/resolution output'unda copy edilir |

Bu paket P06-T06 field diagnostics'in yerini almaz. Step trace normalizer'ın local açıklama verisidir; durable evidence storage, attempt/job persistence ve audit projection sonraki task ve entegrasyon kapsamındadır.

## 5. Test kanıtı

`test/extraction/normalize.test.ts` dört deterministik senaryo içerir. İlk senaryo whitespace/currency/decimal chain ile raw-to-normalized step trace'i; ikinci senaryo chain idempotence'ını; üçüncü senaryo sensitive value redaction ve invalid transform reddini; dördüncü senaryo plan transform listesi immutability'sini doğrular.

P06-T05 değişiklikleri sonrası tam backend regression sonucu **45 test dosyası / 209 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 6. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| CSS/XPath extraction | P06-T02'de mevcut, normalizer wiring yok | Extraction orchestration |
| JSONPath extraction | P06-T03'te mevcut, normalizer wiring yok | Extraction orchestration |
| Cleaner | P06-T04'te mevcut | P06-T04 |
| Field evidence/diagnostics | Normalizer trace ile sınırlı | P06-T06 |
| Custom/locale transform | Bilinçli olarak yok | Yeni policy/task kararı |
| AI extraction | Yok | P06-T07 |
| Persistence/queue wiring | Process-local | M6 open condition |
| Live DB/Redis/storage E2E | Sandbox dependency yok | M6 open condition |

## 7. Review kararı talebi

P06-T05 normalize transform paketi review'a sunulmuştur. Kullanıcı onayı sonrasında P06-T06 extraction evidence ve field diagnostics modeli hazırlanacaktır. Bu paket dataset validation/publish veya production persistence başarısı iddia etmez.

## References

[1]: ./phase-6-extraction-engine-task-board.md "Phase 6 task board"
[2]: ./phase-6-extraction-engine-p06-t01-review.md "P06-T01 extraction plan versioning"
[3]: ./phase-6-extraction-engine-p06-t02-review.md "P06-T02 CSS/XPath extraction"
[4]: ./phase-6-extraction-engine-p06-t03-review.md "P06-T03 JSONPath/API extraction"
[5]: ./phase-6-extraction-engine-p06-t04-review.md "P06-T04 HTML/DOM cleaner"
[6]: ../../scraping-platform-docs/docs/13-task-register.md "P06-T05 task register"
[7]: ./phase-5-reliability-engine-p05-t02-review.md "Compliance guardrail policy"
