# P07-T03 — Schema Validator ve Normalized Value Controls Review

**Program:** Scraping Platform  
**Phase:** 7 — Schema Engine  
**Task:** P07-T03  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, deterministic normalized record validation  
**Bağımlılık:** P07-T02 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P07-T03, P07-T02’nin resolved schema version contract'ını alır ve normalized extraction kaydını fail-closed olarak değerlendirir. Validator raw extraction output, normalizer trace veya record values döndürmez; yalnız schema identity/fingerprint, safe field path, status, deterministic error code, lineage-check flag ve unknown-field count üretir. Böylece record acceptance kararının field seviyesinde açıklanabilirliği sağlanırken secret/value leakage yüzeyi korunur.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Record validator | `src/schema/validator.ts` | `string`, `number`, `boolean`, `object`, `array`, required/nullable/constraint kontrolü |
| Nested validation | `src/schema/validator.ts` | Nested object/array path sonuçları, max depth ve item limit |
| Lineage controls | `src/schema/validator.ts` | Normalized string lineage eşleşmesi ve redacted lineage fail-closed reddi |
| Safe diagnostics | `src/schema/validator.ts` | No input/raw/normalized value in report |
| Unit acceptance | `test/schema/validator.test.ts` | Valid/invalid/nested/unknown/lineage/unsafe-pattern fixture'ları |

## 2. Validation behavior contract

Validator, `SchemaVersion` scope (`tenantId`, `projectId`, schema identity, version, definition fingerprint) ile çağrılır. Record top-level nesne olmalıdır. Her declared field için result üretilir; required olmayan ve bulunmayan field `MISSING` status ile valid kabul edilir, required missing field ise `MISSING_REQUIRED` ile invalid olur. `additionalProperties: false` tanımında unknown input field adı report'a yazılmaz, yalnız root path (`$`) ve `UNKNOWN_FIELD` kodu üretilir.

| Kontrol | Başarı / red davranışı |
|---|---|
| Primitive type | Beklenen type ve finite number kontrolü |
| String constraints | Min/max length ve safe pattern match |
| Number constraints | Minimum/maximum sınırı |
| Nullability | `null` yalnız `nullable: true` olduğunda geçerli |
| Object | Nested declared keys, unknown-key policy ve child field sonuçları |
| Array | Homogeneous item contract, en fazla 1.000 item |
| Record depth | En fazla 8 runtime validation seviyesi |
| Sensitive value | Credential/authorization-shaped veya `[REDACTED]` value fail closed |
| Unsafe runtime pattern | Match edilmeden `SCHEMA_PATTERN_UNSAFE` ile fail closed |

## 3. Lineage ve no-leakage sınırı

Normalizer yalnız string input için raw/normalized lineage üretir. Bu paket, top-level string schema field'ında supply edilen lineage'ın redacted olmadığını ve record'daki normalized string ile aynı olduğunu doğrular. Farklı value, redacted lineage veya string olmayan record value sırasıyla `LINEAGE_VALUE_MISMATCH`, `LINEAGE_REDACTED` ve `LINEAGE_TYPE_MISMATCH` üretir.

> **No-leakage garantisi:** `SchemaValidationReport` raw record, input value, normalized value, normalizer step, unknown field name veya secret text taşımaz. Report sadece schema metadata, safe path/status/code ve count içerir.

Bu paket normalizer'ın parsing dönüştürümünü yapmaz; numeric parse, URL normalization ve transformer genişletmeleri extraction normalize sorumluluğunda kalır. Validator daha önce hazırlanmış normalized record'u type/constraint açısından kontrol eder.[3]

## 4. Acceptance kanıtı

Dar kapsam suite’i dört behavior grubunu doğrular: typed valid normalized record ile no-value-leakage, missing/type/nested/array/unknown invalid reason'ları, redacted veya mismatch lineage reject path'leri ve ReDoS riskini önlemek için unsafe runtime pattern'in evaluation öncesi red edilmesi. Dar kapsam sonucu `1 test file / 4 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **50 test dosyası / 227 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Quality score aggregation | P07-T04 sorumluluğu |
| Publish threshold / partial decision | P07-T05 sorumluluğu |
| Schema CRUD + validation preview | P07-T06 sorumluluğu |
| P07-T01 pattern parse hardening | Runtime guard mevcuttur; parser policy revizyonu ayrı bounded change gerektirir |
| Schema registry durability/concurrency | P07-T02’nin process-local sınırlaması; Postgres E2E gerekir |
| Actual extraction worker lifecycle | Phase 9 orchestration responsibility |
| Database/Redis/storage integration | Devralınan platform açık koşulu |

## 6. Review kararı talebi

P07-T03 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P07-T04 — Field Diagnostics & Quality Score olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/06-extraction-schema-crawler.md "Schema validation ve quality tasarımı"
[2]: ./phase-7-schema-engine-p07-t02-review.md "P07-T02 schema versioning ve snapshot contract"
[3]: ../../scraping-platform-docs/docs/13-task-register.md "P07 task sıralaması"
[4]: ../src/extraction/normalize.ts "Normalized extraction value contract"
[5]: ./phase-7-schema-engine-task-board.md "Phase 7 task board"
