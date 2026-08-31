# P07-T01 — Schema Definition Contract ve Field Type System Review

**Program:** Scraping Platform  
**Phase:** 7 — Schema Engine  
**Task:** P07-T01  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, deterministic contract parsing  
**Bağımlılık:** M6 `CONDITIONAL GO`, kullanıcı onaylı

## 1. Teslim özeti

P07-T01, extraction sonucu için ilk defa açık ve fail-closed bir **schema definition contract** ekler. Yeni parser, geçerli tanımı typed/immutable-dışı dış girdiden kontrollü bir `SchemaDefinition` nesnesine dönüştürür; canonical field sıralaması üzerinden SHA-256 fingerprint üretir. Bu fingerprint bir schema version veya persisted record değildir; P07-T02’de tasarlanacak version/compatibility katmanı için deterministic contract evidence sağlar.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Field type modeli | `src/schema/definition.ts` | `string`, `number`, `boolean`, `object`, `array` |
| Constraint modeli | `src/schema/definition.ts` | String length/pattern; number min/max; object/array structure |
| Security boundary | `src/schema/definition.ts` | Sensitive field key reddi, unknown-key reddi, nesting/field bounds |
| Deterministic contract trace | `src/schema/definition.ts` | Canonical SHA-256 fingerprint |
| Unit acceptance | `test/schema/definition.test.ts` | Valid/invalid/nested structure fixture'ları |

## 2. Contract davranışı

Parser top-level `fields` nesnesi ile isteğe bağlı `additionalProperties` flag'ini kabul eder. Her field, `type` ve açık `required` boolean değerini taşır; `nullable` verilmezse fail-closed varsayılanı `false` olur. Unknown key'ler kabul edilmez; böylece typo veya daha sonra desteklenecek constraint'ler sessizce ignored olmaz.

| Field tipi | Kabul edilen constraint | Bounded guardrail |
|---|---|---|
| `string` | `minLength`, `maxLength`, `pattern` | 0–10.000 length, regex ≤256 karakter, lookaround/backreference reddi |
| `number` | `minimum`, `maximum` | Finite number, `minimum ≤ maximum` |
| `boolean` | Yalnız common flags | Type-specific constraint reddi |
| `object` | Nested `fields`, `additionalProperties` | Object başına 1–100 field, maksimum 5 seviye |
| `array` | Tek `items` field contract'ı | Missing item/extra property reddi; maksimum 5 seviye |

Secret/credential gibi verileri schema düzeyinde modellemek için `authorization`, `cookie`, `credential`, `password`, `secret`, `token`, `session` ve `api_key` sınıfı alan adları reddedilir. Bu guardrail raw value inspection veya masking yerine, güvenli olmayan output surface'in oluşmasını önlemeyi amaçlar.

## 3. Acceptance kanıtı

Paket testi valid nested product contract, object/array recursive field system, canonical fingerprint stabilitesi, unsupported type, sensitive key, invalid constraint, unknown property ve depth overflow senaryolarını kapsar. Dar kapsam doğrulama sonucu `1 test file / 3 tests passed` olmuştur. Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **48 test dosyası / 219 test başarılı** bulunmuştur.

> **Kapsam notu:** Parser bir kaydı validate etmez, normalized extraction value okumaz, schema CRUD endpoint'ini değiştirmez, database'e yazmaz ve dataset publish etmez. Bunlar sırasıyla P07-T03, P07-T06 ve P07-T05 sorumluluklarıdır.[3]

## 4. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Schema versioning/compatibility | P07-T02'nin bağımsız acceptance kriteri |
| Normalized record validator | P07-T03'nin bağımsız acceptance kriteri |
| Quality score/diagnostic aggregation | P07-T04'ün bağımsız acceptance kriteri |
| Publish/partial policy | P07-T05'in bağımsız acceptance kriteri |
| CRUD ve preview API | P07-T06'nın bağımsız acceptance kriteri |
| Persistent schema store/DB E2E | Önceki milestone'lardan devralınan platform koşulu |
| UI | Kullanıcının seçtiği backend-only scope dışında |

## 5. Review kararı talebi

P07-T01 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P07-T02 — Schema Versioning & Compatibility olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/06-extraction-schema-crawler.md "Schema sözleşmesi tasarımı"
[2]: ../../scraping-platform-docs/docs/backend/phase-0-m0-core-domain.md "Schema domain invariant'ları"
[3]: ../../scraping-platform-docs/docs/13-task-register.md "P07 task sıralaması"
[4]: ./phase-7-schema-engine-task-board.md "Phase 7 task board"
