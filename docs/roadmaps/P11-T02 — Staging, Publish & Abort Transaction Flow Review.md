# P11-T02 — Staging, Publish & Abort Transaction Flow Review

**Program:** Scraping Platform  
**Milestone / Phase:** M11 / Phase 11 — Dataset Platform  
**Task:** P11-T02  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, value-free atomic-visibility transaction reference

## 1. Amaç ve kabul sınırı

P11-T02, P11-T01 dataset version metadata'sını değiştirmeden safe record reference'ları için staging, atomic publish visibility ve abort akışını tanımlar. Program task register'ın kabul kriterisi, yarım çıktının published görünmemesi ve publish'in atomic metadata ile yapılmasıdır.[1]

Bu paket process-local bir reference contract'tır. PostgreSQL transaction, durable storage, raw record/artifact value, cross-process lock, dataset-version status mutation, queue/outbox publish veya gerçek dataset E2E içermez.

> `STAGING` durumundaki record reference'ları `visibleRecords` yüzeyinde daima boş döner. Yalnız başarılı `publish` ardından tüm staged set tek seferde `ATOMIC_VISIBLE` olarak görünür.

| Contract yüzeyi | Sağlanan davranış | Fail-closed sınır |
|---|---|---|
| `open` | Tenant/project + datasetVersion scoped staging transaction açar | Transaction id farklı input ile yeniden kullanılamaz |
| `stage` | Value-free record id/checksum reference'ı ekler | Yalnız `STAGING`; version mismatch/duplicate conflict reddedilir |
| `publish` | Boş olmayan staged set için atomic visibility receipt üretir | `STAGING` dışı veya empty set publish edilemez |
| `abort` | Staging'i terminal abort durumuna getirir ve partial references'ı siler | Published transaction abort edilemez; different abort tekrarları conflict |
| `visibleRecords` | Sadece PUBLISHED transaction'ın tam staged setini döner | STAGING/ABORTED için partial visibility yoktur |

## 2. Staging, publish ve abort lifecycle

`src/dataset/staging-transaction.ts` `dataset-staging-transaction/v1` ile açılır. Transaction, tenant/project scope ve immutable `datasetVersionId` binding'i taşır. `stage` çağrıları sadece `recordId`, dataset version id, record checksum ve timestamp kabul eder; record value, raw response, URL veya artifact content kabul edilmez.

Publish, staged reference seti boş değilse tek `DatasetPublishReceipt` üretir. İlk receipt sonrası tekrar publish çağrısı aynı receipt'i idempotent döndürür; transaction status `PUBLISHED` kalır. Abort ise yalnız `STAGING` durumunda izinlidir, staged references'ı registry'den kaldırır ve `ABORTED` transaction'ı görünmez tutar.

| Başlangıç durum | İşlem | Son durum | Visible record sonucu |
|---|---|---|---|
| `STAGING` | `stage` | `STAGING` | Boş |
| `STAGING` + en az bir record | `publish` | `PUBLISHED` | Tam staged set, `ATOMIC_VISIBLE` |
| `STAGING` | `abort` | `ABORTED` | Boş |
| `PUBLISHED` | `abort` / yeni `stage` | Reddedilir | Önceden yayımlanan tam set korunur |
| `ABORTED` | `publish` / yeni `stage` | Reddedilir | Boş |

## 3. Tenant isolation, integrity ve data minimization

Transaction anahtarı tenant/project/transaction id ile scope'lanır. Başka tenant veya project'ten aynı transaction id'ye erişim `DATASET_TRANSACTION_SCOPE_MISMATCH` ile reddedilir. Her staged record transaction'ın `datasetVersionId` değeriyle birebir eşleşmelidir; aksi halde `DATASET_TRANSACTION_RECORD_MISMATCH` üretilir.

Staged record idempotency yalnız exact `recordId`, version id, SHA-256 checksum ve timestamp için geçerlidir. Farklı checksum içeren tekrar conflict üretir. Tüm id/timestamp/checksum doğrulanır; oversize record seti bounded tutulur. Contract raw record/artifact değerlerini taşımaz, bu nedenle staging/publish yüzeyi secret veya scraping output içeriğini raporlamaz.

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/dataset/staging-transaction.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/dataset/staging-transaction.test.ts` | Başarılı — 1 dosya / 3 test | Publish öncesi görünmezlik, atomic full-set receipt/idempotent publish, abort partial cleanup ve empty/cross-scope/version-mismatch/duplicate fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 77 dosya / 310 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. Durable database transaction/isolation, commit/rollback, migration, crash recovery, multi-node concurrency veya lock/fencing.
2. P11-T01 dataset model registry ile runtime integration, dataset version status update veya published metadata persistence.
3. Raw record/artifact storage, staging table, object storage, raw content validation veya lineage generation.
4. Dataset export, S3/API delivery, dedupe/upsert, retention/deletion, API/UI veya notification.
5. Queue/worker execution, provider/model invocation, retry/backoff, scheduling, policy bypass veya credential handling.

## 6. Review kararı

P11-T02 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P11-T03 — JSON, JSONL & CSV Export Adapters olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 11 Dataset Platform — P11-T02 kabul kriteri"
