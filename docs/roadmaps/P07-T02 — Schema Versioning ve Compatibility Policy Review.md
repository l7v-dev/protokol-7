# P07-T02 — Schema Versioning ve Compatibility Policy Review

**Program:** Scraping Platform  
**Phase:** 7 — Schema Engine  
**Task:** P07-T02  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, process-local version registry  
**Bağımlılık:** P07-T01 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P07-T02, P07-T01’in typed schema definition contract'ını immutable, sıralı version’lar olarak kaydeden bir registry ve açık compatibility policy ekler. Her schema family tenant, project ve logical name ile scope edilir; version numarası registry tarafından monotonik üretilir. Aynı logical family için farklı `schemaId` ile yeni version oluşturma reddedilir.

Bu paket **process-local bir contract/reference implementation** sağlar. PostgreSQL repository, migration veya Schema CRUD route'u değişmemiştir; kalıcı persistence entegrasyonu ayrı platform çalışması olarak kalır. Mevcut schema tablosunun `(project_id, name, version)` unique constraint'i bu registry’nin tasarım yönüyle uyumludur.[1]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Immutable registry | `src/schema/versioning.ts` | Tenant/project/name-scoped sequential version |
| Compatibility report | `src/schema/versioning.ts` | Safe veya breaking change'leri path/code ile sınıflandırır |
| Policy gate | `src/schema/versioning.ts` | Default backward-compatible; breaking için explicit `ALLOW_BREAKING` |
| Job binding | `src/schema/versioning.ts` | Sadece `PUBLISHED` version bind edilir; rebind drift reddedilir |
| Unit acceptance | `test/schema/versioning.test.ts` | Version, compatibility, snapshot binding, tenant isolation |

## 2. Version ve snapshot contract'ı

Registry’de yeni schema draft'ı parse edildikten sonra version atanır ve stored copy clone edilerek dış mutasyondan korunur. `publish` yalnızca `DRAFT` version için geçerlidir. `bindJob`, yalnızca `PUBLISHED` schema version ile çalışır ve `(tenantId, jobId)` bağlamında idempotent'tir; aynı job farklı schema version'a bağlanmaya çalışırsa `SCHEMA_VERSION_BINDING_CONFLICT` döner.

> **Snapshot garantisi:** Bir job, published schema ID, name, version ve definition fingerprint'iyle bağlanır. Daha sonra yeni bir compatible schema version oluşturulması, ilk job binding'ini değiştirmez.

| Durum | İzin verilen işlem | Güvenlik sonucu |
|---|---|---|
| `DRAFT` | Publish | Version definition değiştirilemez; yalnız status transition uygulanır |
| `PUBLISHED` | Job bind | Job exact version/fingerprint snapshot'ı taşır |
| `PUBLISHED` | Tekrar publish | Reddedilir — immutable status transition |
| Job binding mevcut | Aynı schema version rebind | Idempotent başarı |
| Job binding mevcut | Farklı schema version rebind | Reddedilir — drift önlenir |

## 3. Compatibility policy

Varsayılan policy `REQUIRE_BACKWARD_COMPATIBLE`'dır. Breaking change tespit edilirse registry, caller explicit olarak `ALLOW_BREAKING` seçmediği sürece yeni version oluşturmaz. `ALLOW_BREAKING` bir version numarası override'ı veya silent approval değildir; rapordaki breaking path/code'ları saklanmış contract output olarak döner.

| Change | Sınıflandırma |
|---|---|
| Optional field ekleme | Compatible |
| Required field ekleme | Breaking |
| Field silme veya field type değişimi | Breaking |
| Optional alanı required yapma | Breaking |
| Nullable alanı non-nullable yapma | Breaking |
| String min length artırma veya max length azaltma | Breaking |
| Yeni string pattern ekleme/değiştirme | Breaking |
| Number minimum artırma veya maximum azaltma | Breaking |
| `additionalProperties: true → false` | Breaking |

Bu policy record validation yapmaz; yalnız iki schema definition contract'ının structural compatibility değerlendirmesini üretir. Actual normalized record validity, field-level errors ve quality score P07-T03/P07-T04 sorumluluğundadır.[2]

## 4. Acceptance kanıtı

Dar kapsam testleri dört ana davranışı kapsar: compatible optional field ekleme ve immutable clone, explicit policy olmadan breaking change reddi, published v1 job binding + v2 sonrası rebind drift reddi, deterministic constraint-change raporu ile tenant isolation. Dar kapsam sonucu `1 test file / 4 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **49 test dosyası / 223 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Durable registry / Postgres transaction | Process-local registry production persistence değildir |
| Concurrent writer control | DB unique constraint + transaction/retry E2E gerektirir |
| Existing API route integration | P07-T06 sorumluluğu |
| Normalized value validation | P07-T03 sorumluluğu |
| Quality score/publish decision | P07-T04/P07-T05 sorumluluğu |
| Existing job orchestration snapshot wiring | Phase 9 responsibility; bu paket contract binding sağlar |
| DB/Redis/storage E2E | Önceki milestone'lardan devralınan açık koşul |

## 6. Review kararı talebi

P07-T02 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P07-T03 — Schema Validator & Normalized Value Controls olacaktır.

## References

[1]: ../src/database/migrations/001_core_schema.sql "Schema persistence unique constraint"
[2]: ../../scraping-platform-docs/docs/13-task-register.md "P07 task sıralaması"
[3]: ../../scraping-platform-docs/docs/backend/phase-0-m0-core-domain.md "Schema ve job snapshot invariant'ları"
[4]: ./phase-7-schema-engine-p07-t01-review.md "P07-T01 schema definition contract"
[5]: ./phase-7-schema-engine-task-board.md "Phase 7 task board"
