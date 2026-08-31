# P06-T01 — Extraction Plan Modeli ve Versioning Review

**Program:** Scraping Platform  
**Milestone:** M6 — Extraction Engine Accepted  
**Task:** P06-T01  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** M5 Reliability Engine — `CONDITIONAL GO`, kullanıcı onaylı

## 1. Teslim özeti

P06-T01, extraction motorundan önce planın kendisini versioned ve immutable bir backend sözleşmesine dönüştürür. `ExtractionPlanRegistry`, HTML/JSON/TEXT kaynak türü, CSS/XPath/JSONPath selector field'ları, plan version, canonical SHA-256 fingerprint ve attempt binding bilgisini process-local referans state'inde saklar.

Planın yeni kaydı önceki version'ı değiştirmez; aynı `tenantId + planId` altında yeni version üretir. Attempt, ilk resolve edilen plan version ve fingerprint'e idempotent biçimde bağlanır. Aynı attempt daha sonra farklı bir plan version'a yönlendirilmek istenirse terminal `EXTRACTION_PLAN_BINDING_CONFLICT` üretilir.

> **Kapsam sınırı:** Bu paket selector yürütmez, extraction record üretmez, raw artifact okumaz ve AI çağrısı yapmaz. Bu işler P06-T02–P06-T07 kapsamındadır.

## 2. Uygulanan sözleşme

| Alan | Davranış |
|---|---|
| Source kind | `HTML`, `JSON`, `TEXT` enum'u |
| Selector kind | `CSS`, `XPATH`, `JSONPATH` enum'u |
| Field plan | `fieldId`, `outputKey`, selector, required ve multiple davranışı |
| Version | Aynı tenant/plan altında monoton artan pozitif integer |
| Fingerprint | Canonical field sırası ve immutable plan metadata'sından SHA-256 |
| Attempt binding | Tenant/job/task/attempt ile resolved plan version ve fingerprint ilişkisi |
| Retry/idempotency | Aynı binding tekrar çağrıldığında aynı kayıt geri döner |
| Drift koruması | Farklı version/fingerprint ile ikinci binding terminal olarak reddedilir |

Canonical fingerprint, aynı semantic field seti farklı input sırasında verilse bile field ID sıralamasına göre stabilize edilir. Plan veya resolve output'u çağıran tarafından mutate edilirse registry state'i değişmez; output clone olarak döner.

## 3. Tenant ve secret safety

Plan resolve, `tenantId + planId + version` anahtarıyla yapılır. Başka tenant aynı plan ID'sini kullanarak kayıt okuyamaz; `EXTRACTION_PLAN_NOT_FOUND` alır. Attempt binding anahtarı da tenant kapsamındadır.

`fieldId`, `outputKey`, plan/project/tenant/user ID'leri güvenli identifier formatıyla sınırlandırılmıştır. `outputKey` içinde authorization, cookie, password, secret, token veya session isimleri; selector içinde `javascript:`, `<script` ya da `eval()` kalıpları reddedilir. Bu kontrol bir credential discovery veya script sandbox yerine geçmez; bunun amacı extraction plan contract'ının raw secret toplama ve executable selector yüzeyi haline gelmesini engellemektir.

## 4. Validation matrisi

| Kontrol | Sonuç |
|---|---|
| 1–100 arası field | Geçersiz sayıda field terminal reddedilir |
| Benzersiz `fieldId` ve `outputKey` | Duplicate plan alanı terminal reddedilir |
| Selector uzunluğu | 1–1024 karakter sınırı |
| Source/selector enum | Tanımsız tür terminal reddedilir |
| Güvenli output key | Secret/cookie/auth isimleri reddedilir |
| Güvenli selector yüzeyi | Script/eval/javascript pseudo-selector reddedilir |
| Version resolve | Olmayan version `EXTRACTION_PLAN_NOT_FOUND` |
| Attempt rebinding | Farklı plan drift'i `EXTRACTION_PLAN_BINDING_CONFLICT` |

## 5. Test kanıtı

`test/extraction/plan.test.ts` içinde üç deterministik senaryo bulunmaktadır. İlk senaryo immutable version ve canonical fingerprint davranışını, ikinci senaryo idempotent attempt binding ile plan drift reddini, üçüncü senaryo tenant isolation ve secret/unsafe selector guardrail'lerini doğrular.

Son tam backend regression sonucu **41 test dosyası / 196 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 6. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| CSS/XPath execution | Henüz yok | P06-T02 |
| JSONPath execution | Henüz yok | P06-T03 |
| DOM cleaner/raw artifact pipeline | Henüz yok | P06-T04 |
| Normalization | Henüz yok | P06-T05 |
| Evidence/diagnostics | Plan fingerprint/binding ile sınırlı | P06-T06 |
| AI extraction | Özellikle yok | P06-T07 |
| Persistence | Process-local registry | Postgres repository/migration |
| Queue binding | Reference API var; job worker wiring yok | Orchestration integration |
| Live DB/Redis E2E | Sandbox dependency yok | M6 open condition |

## 7. Review kararı talebi

P06-T01 extraction plan model/versioning paketi review'a sunulmuştur. Kullanıcı onayı sonrasında P06-T02 CSS/XPath extraction motoru paketi hazırlanacaktır. Bu onay immutable plan contract'ını kapsar; selector execution veya production persistence başarısı iddiası değildir.

## References

[1]: ./phase-6-extraction-engine-task-board.md "Phase 6 Extraction Engine task board"
[2]: ../../scraping-platform-docs/docs/13-task-register.md "P06-T01 task register"
[3]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP roadmap"
[4]: ./phase-5-reliability-engine-m5-gate.md "M5 Reliability gate"
[5]: ./phase-5-reliability-engine-p05-t02-review.md "Compliance guardrail policy"
[6]: ./phase-5-reliability-engine-p05-t05-review.md "Retry/escalation budget"
[7]: ./phase-4-proxy-intelligence-operations.md "Operations runbook"
