# P11-T07 — Dataset/Record/Version Query & Export Control API Review

**Program:** Scraping Platform  
**Milestone / Phase:** M11 / Phase 11 — Dataset Platform  
**Task:** P11-T07  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, API-facing service contract, authorization-gated, non-delivery

## 1. Amaç ve kabul sınırı

P11-T07, dataset version ve merged record lineage projection'ını tenant-scoped authorization altında sorgulayan ve export delivery capability contract'ına kontrollü geçiş sağlayan API-facing service katmanını tanımlar. Program task register, API sonuçlarının version ve tenant kapsamında doğru dönmesini ve export kontrol uçlarının tamamlanmasını bekler.[1]

Bu bounded paket, Fastify route kaydetmez ve HTTP server'ı değiştirmez. `DatasetQueryExportApi`, mevcut `AuthContext` ve `hasScope` mekanizmasını kullanarak source interface üzerinden safe metadata projection döndürür. Raw record/artifact content, credentials, storage objects veya delivery response yüzeye eklenmez.

| API-facing işlem | Gerekli scope | Dönen yüzey | External action |
|---|---|---|---|
| `listVersions` | `dataset:read` | Safe dataset version + source job/schema/plan metadata | Yok |
| `getRecord` | `dataset:read` | Safe merged record fingerprint/checksum + lineage | Yok |
| `requestExportControl` (API) | `dataset:read` | Capability-gated non-delivery intent | Yok |
| `requestExportControl` (Parquet/S3) | `dataset:export` | Capability-gated non-delivery intent | Yok |

## 2. Authorization, tenant scope ve input validation

Her çağrıda `AuthContext` içindeki tenant id, source'a geçirilecek `DatasetScope` için tek yetkili tenant kaynağıdır. Project id request ile açıkça gelir ve safe identifier olarak doğrulanır. `dataset:read` veya `dataset:export` scope'u eksikse `DATASET_API_FORBIDDEN` üretilir; service `source` çağrısına veya delivery evaluator'a geçmez.

Query pagination limiti 1–200 ile bounded'dır; dataset/version id, cursor ve dedupe fingerprint input'ları güvenli pattern ile doğrulanır. Source'un döndürdüğü page de limit/cursor açısından validate edilir. Böylece adapter/source sınırı hatalı veya oversized query metadata ile sessizce genişlemez.

## 3. Export control sınırı

Export control, P11-T04 `evaluateDatasetDeliveryCapability` sözleşmesine yalnız auth context'ten türetilen safe scope/permission ile çağrı yapar. Sonuç `INTENT_READY` dahi olsa `requiresExplicitApproval: true`, `allowExternalDelivery: false`, `allowWorkerAction: false` ve `allowBypass: false` değerlerini korur.

S3 storage binding identifier output'ta görünmez; downstream capability layer yalnız fingerprint üretir. Bu paket gerçek Parquet serialization, HTTP download/API route, S3 write/read, object key/bucket/endpoint resolve, signed URL, completion event, queue/worker dispatch, retry veya persistence yapmaz.

> API-facing contract, uygulama içi service boundary'sidir; dışa açık HTTP endpoint değildir. Böylece route/RBAC/integration ayrıntıları uygulanmadan önce query ve export control semantiği test edilebilir tutulur.

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/dataset/query-export-api.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/dataset/query-export-api.test.ts` | Başarılı — 1 dosya / 3 test | Safe version/record lineage projection, capability-gated non-delivery S3 control intent, missing scope/invalid input fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 82 dosya / 325 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. Fastify HTTP route, request/response schema, auth middleware/session/API-key validation, OpenAPI, rate-limit veya endpoint integration.
2. Real repository/database query, source pagination/cursor persistence, cross-store consistency veya dataset PUBLISHED status resolve.
3. Raw dataset record/artifact value read, JSON/CSV/Parquet serialization/download, storage write/read veya S3/API delivery.
4. Completion event/outbox, retry/DLQ, audit persistence, worker dispatch, scheduling veya notification.
5. Credential discovery, secret export, authorization bypass, policy override veya automatic external action.

## 6. Review kararı

P11-T07 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P11-T08 — Dataset E2E, Format, Lineage & Retention Acceptance Gate olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 11 Dataset Platform — P11-T07 kabul kriteri"
