# M7 — Schema Quality Gate Acceptance

**Program:** Scraping Platform  
**Milestone:** M7 — Schema Quality Gate Ready  
**Durum:** Accepted — `CONDITIONAL GO`  
**Karar:** `CONDITIONAL GO`, kullanıcı onaylı  
**Kapsam:** Backend-only  
**Ön koşul:** M6 Extraction Engine — `CONDITIONAL GO`, kullanıcı onaylı

## 1. Karar özeti

M7 için önerilen karar **`CONDITIONAL GO`**'dur. P07-T01–P07-T06 ile schema definition parser, process-local immutable version/compatibility reference contract, normalized record validator, secret-safe field diagnostics/quality score, publish eligibility policy ve tenant-scoped validation preview API tamamlanmıştır. P07-T08 acceptance harness'ı bu zinciri external database, queue, storage, model veya network call olmadan deterministic fixture'larda birlikte doğrular.

P07-T07 UI görevi, kullanıcının backend-only talimatıyla **Scope Excluded** durumundadır; hiçbir frontend/UI çalışması uygulanmamıştır. Bu nedenle M7, resmi full-stack exit gate'in değil, backend contract/gate tesliminin koşullu onayıdır. Bu karar production readiness, dataset publish, durable concurrency veya gerçek schema lifecycle E2E anlamına gelmez.[1] [2]

> **Gate sınırı:** `CONDITIONAL GO`, Phase 8 Crawler Engine tasarımının schema contract'ına güvenli biçimde bağımlı olabilmesine izin verir. Canlı record publish, provider/storage egress, UI sunumu veya automatic policy bypass yetkisi vermez.

## 2. M7 exit-criterion matrisi

| Criterion | P07 teslimi | Kanıt | Durum |
|---|---|---|---|
| Field type contract | Bounded primitive/object/array type parser | P07-T01 fixtures | Passed |
| Schema version contract | Sequential immutable version + compatibility policy | P07-T02 fixtures | Passed |
| Normalized validation | Field-level type/constraint/lineage validation | P07-T03 fixtures | Passed |
| Field quality | Deterministic score + safe diagnostics/evidence projection | P07-T04 fixtures | Passed |
| Publish eligibility | Full/partial/block decision without side effects | P07-T05 fixtures | Passed |
| Schema API | Canonical create + tenant-scoped validation preview | P07-T06 API fixtures | Passed |
| UI quality surface | Schema UI / quality display | P07-T07 | Scope Excluded — backend-only user direction |
| Acceptance regression | Fixture, compatibility, preview and full quality run | P07-T08 | Passed — 53 dosya / 238 test |

## 3. P07-T08 deterministic acceptance smoke

`pnpm test:schema-gate` tek bir deterministic harness'tır. Harness raw secret, selector, unknown field name veya record value yazdırmaz; yalnız PASS, check name ve schema fingerprint output'u verir. Gerçek Postgres, Redis, queue, storage, LLM/provider veya public network kullanmaz.

| Check | Beklenen kanıt |
|---|---|
| `schema-definition-canonicalization` | Typed field contract parse edilir; canonical persistence formunda derived fingerprint yazılmaz |
| `versioning-and-compatibility` | Compatible optional field eklenir; default breaking type change reddedilir; published v1 job snapshot korunur |
| `validation-no-value-leak` | Missing/unknown/constraint validation çalışır; report raw value veya unknown key taşımaz |
| `quality-and-publish-policy` | Invalid quality report ile publish eligibility block edilir; decision value sızdırmaz |
| `validation-preview-route` | Tenant-scoped API preview invalid record için safe response verir; raw value/unknown key response'ta yoktur |

Harness ilk çalıştırmada fixture semantic issue'ı (mevcut field'a max length eklenmesi breaking change) fark etmiş, fixture yeni optional field ekleme olarak düzeltilmiştir. İkinci assertion `unknownFieldCount` safe metadata'sını unknown input key ile karıştırdığı için daraltılmıştır. Final harness PASS’tir. Bu iki düzeltme, acceptance testinin policy semantics ve safe output surface'ini gerçekten doğruladığını gösterir; canlı sistem davranışı iddiası değildir.

Nihai kalite kapısı `pnpm test:schema-gate && pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` ile tamamlanmış; **53 test dosyası / 238 test başarılı** bulunmuştur. Local Chromium/Playwright fixture da bu regression suite içinde geçmiştir. `pnpm test:integration` ayrıca çalıştırılmış ve sandbox'ta uygun database/queue dependency bulunmadığı için kontrollü **`SKIPPED dependency unavailable`** sonucu vermiştir; bu sonuç PASS veya gerçek DB/Redis E2E kanıtı değildir.

## 4. Security ve compliance acceptance

| Kontrol | M7 davranışı |
|---|---|
| Tenant scope | Version binding, quality evidence ve preview lookup tenant scoped |
| Schema field surface | Secret/credential-shaped field key’ler parser’da reddedilir |
| Unknown input | `UNKNOWN_FIELD` code ile raporlanır; input key/value echo edilmez |
| Normalized lineage | Redacted veya mismatch lineage fail closed |
| Pattern execution | Runtime unsafe pattern evaluation öncesi reddedilir |
| Publish policy | Karar saf function; repository/queue/storage side effect yok |
| API preview | `schema:write` scope; body limits; network/provider çağrısı yok |
| UI | Kullanıcı talimatıyla uygulanmadı; backend-only scope korunuyor |

## 5. Açık koşullar ve M7 sonrası zorunlu doğrulamalar

| Açık koşul | Risk | Kapatma sahibi/bağımlılık |
|---|---|---|
| Postgres schema lifecycle E2E | Process-local version registry restart/concurrency-safe değildir | Backend/Data persistence |
| API compatibility enforcement | Create endpoint P07-T02 reference registry'sine durable transaction ile bağlı değildir | Backend/API hardening |
| Redis/outbox/worker wiring | Schema/quality/policy output worker lifecycle'ına entegre değildir | Phase 9 Orchestration |
| Dataset staging/publish transaction | `PUBLISH_ALLOWED`/`PARTIAL_ALLOWED` kararı gerçek publish değildir | Phase 11 Dataset Platform |
| Quality/policy persistence | Weight/policy configuration DB/API ile yönetilmez | Data/API productization |
| UI task P07-T07 | Schema yönetimi/quality görünümü uygulanmadı | Explicit future scope decision |
| Production drill | Rollback, retention, concurrency, load ve incident test edilmedi | SRE/Operations |
| Inherited platform E2E | DB/Redis/storage/provider gerçek entegrasyonları yok | M1–M6 açık koşulları |

## 6. Gate sign-off

P07-T08 ve M7 backend acceptance gate kullanıcı tarafından onaylanmıştır. P07-T08 `Accepted — CONDITIONAL GO` olarak işaretlenmiştir. Sıradaki backend milestone olan **Phase 8 — Crawler Engine / P08-T01** ayrı bounded review döngüsüyle başlatılabilir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P07 Schema Engine task register"
[2]: ./phase-7-schema-engine-task-board.md "Phase 7 task board"
[3]: ./phase-7-schema-engine-p07-t01-review.md "P07-T01 schema definition contract"
[4]: ./phase-7-schema-engine-p07-t02-review.md "P07-T02 versioning/compatibility"
[5]: ./phase-7-schema-engine-p07-t03-review.md "P07-T03 validator"
[6]: ./phase-7-schema-engine-p07-t04-review.md "P07-T04 quality"
[7]: ./phase-7-schema-engine-p07-t05-review.md "P07-T05 publish policy"
[8]: ./phase-7-schema-engine-p07-t06-review.md "P07-T06 API preview"
[9]: ./phase-6-extraction-engine-m6-gate.md "M6 Extraction Engine gate"
