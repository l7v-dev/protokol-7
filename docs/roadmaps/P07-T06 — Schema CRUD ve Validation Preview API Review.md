# P07-T06 — Schema CRUD ve Validation Preview API Review

**Program:** Scraping Platform  
**Phase:** 7 — Schema Engine  
**Task:** P07-T06  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, tenant-scoped REST contract  
**Bağımlılık:** P07-T05 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P07-T06, mevcut Schema resource API yüzeyini P07-T01 semantic schema parser'ı ile sıkılaştırır ve tenant-scoped validation preview endpoint'i ekler. Schema create çağrısı artık parser’dan geçer; geçerli contract canonical persistence formuna dönüştürülür ve derived `fingerprintSha256` database definition JSON’una yazılmaz. Preview çağrısı stored schema definition’ını yeniden parse eder, P07-T03 validator’ı çalıştırır ve secret-safe validation report döndürür.[1] [2]

| API yüzeyi | Yetki | Davranış |
|---|---|---|
| `POST /projects/:projectId/schemas` | `schema:write` | Semantic field contract validation ve canonical create |
| `GET /projects/:projectId/schemas` | `schema:read` | Tenant-scoped listeleme — mevcut endpoint |
| `GET /schemas/:schemaId` | `schema:read` | Tenant-scoped detail — mevcut endpoint |
| `POST /schemas/:schemaId/publish` | `schema:publish` | DRAFT → PUBLISHED state transition — mevcut endpoint |
| `POST /schemas/:schemaId/validation-preview` | `schema:write` | Side-effect-free normalized record validation preview |

## 2. Create ve persistence contract

Create body `name`, optional positive `version`, `fields` ve optional `additionalProperties` kabul eder. Body unknown top-level key’leri reddeder. Semantic parser; supported field type, explicit `required`, nested object/array shape, bounded constraint ve sensitive field key kurallarını uygular. Parser failure, database çağrısından önce `400 / SCHEMA_DEFINITION_INVALID` olarak döner.

P07-T01 parser output'u contract fingerprint taşır; persistence serializer yalnız canonical definition data’yı (`fields`, `additionalProperties`, type/constraint/nullability) depolar. Bu ayrım derived evidence’in persisted user definition olarak yanlış yorumlanmasını önler. Mevcut SQL `schemas` tablosundaki `(project_id, name, version)` uniqueness guardrail'i korunur.[3]

> **P07-T02 entegrasyon sınırı:** API create endpoint'i process-local `SchemaVersionRegistry` ile bağlanmaz. Registry’nin compatibility policy’si reference contract olarak testlidir; durable transaction, concurrency control ve API-level compatibility enforcement ayrı persistence hardening çalışması gerektirir.

## 3. Validation preview contract

Preview endpoint, `record` nesnesi ve isteğe bağlı bounded normalized lineage kabul eder. Resource `tenantId` ile aranır; başka tenant’taki ya da mevcut olmayan schema için `404 / RESOURCE_NOT_FOUND` döner. Schema kaydı bulunduktan sonra runtime semantic parse ve validator çağrısı yapılır.

| Güvenlik kontrolü | Davranış |
|---|---|
| Authentication/authorization | `schema:write` scope zorunlu |
| Tenant isolation | `service.getSchema(context.tenantId, schemaId)` kullanılır |
| Body bound | Record en fazla 100 top-level key; lineage value en fazla 10.000 karakter |
| Unknown input | Validator report'ta name yerine root path + `UNKNOWN_FIELD` code |
| Value/secret leakage | Preview output P07-T03 safe report surface'ini aynen kullanır |
| Side effect | DB write, publish, queue, storage veya external call yok |

## 4. Acceptance kanıtı

API-level testler aşağıdaki davranışları kapsar: semantic olmayan create field contract’ının persistence öncesi red edilmesi; valid create tanımının canonical formda, fingerprint olmadan service katmanına iletilmesi; tenant-scoped preview response’ta field-level codes ve no-value-leakage; malformed preview body ile missing/cross-tenant resource response’ları. İlgili dar kapsam suite sonucu `3 test files / 14 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **53 test dosyası / 238 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Update/delete lifecycle | Immutable version policy nedeniyle ayrı explicit API sözleşmesi gerektirir |
| Durable compatibility enforcement | P07-T02 registry process-local; DB transaction/concurrency E2E yok |
| Policy CRUD/persistence | P07-T05 policy contract’ın API surface’i yok |
| Multi-record validation preview | Tek record preview bu pakette; batch preview ayrı scoped change ister |
| Quality/publish execution | Preview score/publish side effect üretmez |
| Dataset staging/publish transaction | Phase 11 sorumluluğu |
| Postgres/Redis integration E2E | Devralınan platform açık koşulu |

## 6. Review kararı talebi

P07-T06 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Backend-only scope için P07-T01–P07-T06 tamamlanmıştır. Phase 7 gate hazırlığı, backend acceptance/regression ve M7 `CONDITIONAL GO` önerisi olarak ayrı P07-T08 quality paketinde ele alınacaktır. P07-T07 UI görevi kullanıcı kararıyla scope dışındadır.[4]

## References

[1]: ./phase-7-schema-engine-p07-t01-review.md "P07-T01 schema definition contract"
[2]: ./phase-7-schema-engine-p07-t03-review.md "P07-T03 validation result contract"
[3]: ../src/database/migrations/001_core_schema.sql "Schema persistence unique constraint"
[4]: ../../scraping-platform-docs/docs/13-task-register.md "P07 task sıralaması"
[5]: ./phase-7-schema-engine-task-board.md "Phase 7 task board"
