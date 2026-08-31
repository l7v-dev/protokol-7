# P06-T06 — Extraction Evidence ve Field Diagnostics Review

**Program:** Scraping Platform  
**Milestone:** M6 — Extraction Engine Accepted  
**Task:** P06-T06  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P06-T05 — kullanıcı onaylı

## 1. Teslim özeti

P06-T06, selector ve normalization output'larını raw value saklamadan field-level evidence/diagnostics projection'a dönüştürür. `ExtractionDiagnosticsRegistry`, bir extraction attempt için plan, artifact checksum, selector fingerprint, transform fingerprint, status ve count bilgilerini deterministic report olarak üretir. Aynı tenant/attempt için aynı report idempotent döner; farklı içerikle ikinci kayıt terminal conflict olur.

Diagnostics report, `ExtractionPlan` field setinin tamamını zorunlu kılar. Plan dışı field, duplicate field, unsafe error code veya planla uyuşmayan transform fingerprint reddedilir. Bu kural incomplete veya drift olmuş extraction açıklamalarının job/attempt lifecycle'ına yazılmasını önler.

> **Evidence kuralı:** Diagnostics yalnız artifact checksum ve selector fingerprint taşır; raw artifact storage key, raw/normalized field value, selector string, credential ve response body hiçbir report alanında tutulmaz.

## 2. Report ve evidence sözleşmesi

| Alan | İçerik | Raw content/sensitive veri |
|---|---|---|
| Scope | Tenant, job, task, attempt ID | Güvenli identifier ile sınırlı |
| Plan | Plan ID, version, plan SHA-256 fingerprint | Plan field selector'ı yok |
| Artifact | Type, content type, size, SHA-256 | Storage key yok |
| Field status | `EXTRACTED`, `EMPTY`, `ERROR`, `REDACTED` | Field value yok |
| Field count | Selected, normalized, redacted count | Value seti yok |
| Error code | Safe uppercase machine code | Error message/selector/source yok |
| Evidence | Source kind, artifact/source checksum, selector kind/fingerprint, transform fingerprint | Selector ve source içerikleri yok |
| Summary | Field status toplamlari | Raw value yok |

`selectorFingerprintSha256`, `selectorKind:selector` stringinden hesaplanır. Bu sayede aynı selector provenance için correlation sağlanırken selector'ın kendisi report'a eklenmez. Report ID tüm safe projection'ın SHA-256 hash'idir; aynı semantic input aynı report ID üretir.

## 3. Field-level diagnostic davranışı

| Durum | Diagnostics davranışı |
|---|---|
| Extraction başarılı | Selected/normalized count ve selector/transform fingerprint kaydı |
| Optional empty | `EMPTY` status ve sıfır count |
| Required missing | `ERROR` + `REQUIRED_FIELD_MISSING` + summary sayacı |
| Selector/limit error | `ERROR` + safe code, value/source yok |
| Normalizer redaction | `REDACTED`; redacted normalized count |
| Selector redaction | `REDACTED`; selector output countı kadar redaction |
| Aynı attempt aynı input | İdempotent aynı report |
| Aynı attempt farklı input | `EXTRACTION_DIAGNOSTICS_CONFLICT` |

Redaction count normalizer output'u bulunduğunda normalization state'inden, bulunmadığında selector state'inden alınır. Böylece bir field aynı sensitive value için iki kez sayılmaz.

## 4. Tenant ve data-safety

Registry anahtarı `tenantId + attemptId`'dir. Başka tenant aynı attempt ID ile report okuyamaz. Artifact scope/storage key input validation içinde referans olarak alınsa bile output report'a storage key kopyalanmaz. Checksum ve size metadata'sı tenant job/task/attempt context'i ile tek yönlü provenance sağlar; raw content retrieval API'si değildir.

P06-T06 local in-memory projection'dır. Durable audit/event persistence, metric emission, UI veya query API eklemez. Centralized diagnostic store veya cross-process idempotency üretim entegrasyonu sonraki persistence/orchestration kapsamındadır.

## 5. Test kanıtı

`test/extraction/diagnostics.test.ts` üç deterministik senaryo içerir. İlk senaryo extraction/normalization provenance ve raw selector/value/storage key leakage yokluğunu; ikinci senaryo normalization/selector redaction, idempotent write, conflict ve tenant isolation'ı; üçüncü senaryo unknown field, transform mismatch ve unsafe input rejection'ını doğrular.

P06-T06 değişiklikleri sonrası tam backend regression sonucu **46 test dosyası / 212 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 6. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| CSS/XPath/JSONPath output wiring | Diagnostics input contract var; worker wiring yok | Extraction orchestration |
| Raw artifact retrieval | Bilinçli olarak yok; only reference metadata | Storage/service API |
| Normalization | P06-T05 local trace ile mevcut | P06-T05 |
| Durable diagnostics store | Process-local registry | DB/outbox integration |
| Dashboard/query API | Yok | Observability/Control Center |
| AI extraction | Yok | P06-T07 |
| Live DB/Redis/storage E2E | Sandbox dependency yok | M6 open condition |

## 7. Review kararı talebi

P06-T06 extraction evidence ve field diagnostics paketi review'a sunulmuştur. Kullanıcı onayı sonrasında P06-T07 kontrollü AI extraction adapter ve structured output paketi hazırlanacaktır. Bu paket raw artifact erişimi, schema validation/publish veya production distributed evidence store başarısı iddia etmez.

## References

[1]: ./phase-6-extraction-engine-task-board.md "Phase 6 task board"
[2]: ./phase-6-extraction-engine-p06-t01-review.md "P06-T01 extraction plan versioning"
[3]: ./phase-6-extraction-engine-p06-t04-review.md "P06-T04 HTML/DOM cleaner"
[4]: ./phase-6-extraction-engine-p06-t05-review.md "P06-T05 normalize transform"
[5]: ../../scraping-platform-docs/docs/13-task-register.md "P06-T06 task register"
[6]: ./phase-5-reliability-engine-p05-t07-review.md "Reliability telemetry/runbook"
