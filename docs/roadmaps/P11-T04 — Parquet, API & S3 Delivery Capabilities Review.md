# P11-T04 — Parquet, API & S3 Delivery Capabilities Review

**Program:** Scraping Platform  
**Milestone / Phase:** M11 / Phase 11 — Dataset Platform  
**Task:** P11-T04  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, capability-gated, non-delivery reference contract

## 1. Amaç ve kabul sınırı

P11-T04, Parquet, authenticated API read ve S3-compatible delivery yüzeyleri için tek bir policy/capability değerlendirme sözleşmesi tanımlar. Program task register, bu yeteneklerde tenant yetkisi ve completion event beklemektedir.[1] Bu bounded pakette, gerçek serializer, route veya object storage delivery yerine güvenli intent ön koşulları modellenmiştir.

`src/dataset/delivery-capabilities.ts`, yalnız PUBLISHED dataset version, request scope ile birebir eşleşen authorization ve açık capability koşullarında `INTENT_READY` döndürür. Intent yine de external delivery/action izni vermez: `requiresExplicitApproval: true`, `allowExternalDelivery: false`, `allowWorkerAction: false` ve `allowBypass: false` sabittir.

| Delivery kind | Capability koşulu | Content type | Sınır |
|---|---|---|---|
| `PARQUET` | `parquetEnabled` + `dataset:export` | `application/vnd.apache.parquet` | Gerçek Parquet serialization/file write yok |
| `API` | `apiReadEnabled` + `dataset:read` | `application/json` | Gerçek HTTP route/pagination/auth middleware yok |
| `S3` | `s3DeliveryEnabled` + `dataset:export` + storage binding id | `application/octet-stream` | Bucket/endpoint/credential resolve veya write yok |

## 2. Authorization ve published-version gate

Request scope'u ve authorization tenant/project alanları birebir eşleşmelidir. API için `dataset:read`, Parquet/S3 için `dataset:export` izni aranır. `DRAFT` veya `ABORTED` dataset version her capability'den önce `DATASET_VERSION_NOT_PUBLISHED` olarak block edilir. Eksik izin, disabled capability veya S3 için absent binding id yine non-actionable `DELIVERY_BLOCKED` üretir.

| Block nedeni | Etki |
|---|---|
| `DATASET_VERSION_NOT_PUBLISHED` | Unpublished/aborted output delivery intent'i oluşmaz |
| `AUTHORIZATION_REQUIRED` | Cross-tenant/project veya missing permission delivery'yi kapatır |
| `CAPABILITY_DISABLED` | Kapalı format/delivery adapter yüzeyi açılmaz |
| `STORAGE_BINDING_REQUIRED` | S3 intent'i identity/reference olmadan ilerlemez |

## 3. Secret/data minimization ve no-external-action sınırı

S3 binding yalnız safe identifier olarak alınır ve output'a SHA-256 fingerprint biçiminde yazılır. Bucket URL'si, endpoint, region, access key, secret key, session token, signed URL, object key veya payload taşınmaz. Binding identifier dışarıdan resolve edilmez ve herhangi bir storage provider'a aktarılmaz.

> `INTENT_READY`, yayınlama veya external dispatch yetkisi değildir. Bu durum, yalnız ileride explicit approval ve ayrı gerçek adapter implementation'ı için precondition'ın sağlandığını ifade eder.

Contract Parquet file üretmez, API route eklemez, S3 write/read yapmaz, HTTP/network çağrısı başlatmaz, completion event/outbox üretmez, retry/DLQ/scheduler çalıştırmaz. Credential discovery, policy override, unsafe destination veya automatic bypass desteklenmez.

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/dataset/delivery-capabilities.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/dataset/delivery-capabilities.test.ts` | Başarılı — 1 dosya / 3 test | Parquet/API/S3 intent metadata/fingerprint/no-action flags; published/auth/capability/binding blocks; malformed scope/permission/binding fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 79 dosya / 316 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. Actual Parquet encoder, large-record streaming, file/compression/encryption veya format conformance E2E.
2. Real Fastify API endpoints, route-level RBAC/authentication, pagination, query/filter, HTTP response/download stream veya rate limiting.
3. Real S3/object-storage client, bucket/region/endpoint configuration, secrets/KMS, object write/read/delete, signed URL, encryption, lifecycle veya completion event.
4. Durable delivery state/outbox, idempotent external writes, retry/DLQ/reconciliation, worker/scheduler veya monitored operations.
5. Policy bypass, credential discovery, public bucket misconfiguration, unsafe network destination veya automatic external action.

## 6. Review kararı

P11-T04 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P11-T05 — Record Dedupe/Upsert & Lineage Integrity olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 11 Dataset Platform — P11-T04 kabul kriteri"
