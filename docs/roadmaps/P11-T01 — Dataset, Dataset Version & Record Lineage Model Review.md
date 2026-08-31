# P11-T01 — Dataset, Dataset Version & Record Lineage Model Review

**Program:** Scraping Platform  
**Milestone / Phase:** M11 / Phase 11 — Dataset Platform  
**Task:** P11-T01  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, immutable metadata ve secret-safe lineage contract

## 1. Amaç ve kabul sınırı

P11-T01, tenant/project-scoped dataset metadata'sını, immutable/sıralı dataset version'larını ve her record için source job/schema/plan/artifact referanslarından oluşan lineage modelini tanımlar. Program task register'ın kabul kriterisi, dataset version'ın source job, schema ve plan bilgisiyle yeniden izlenebilmesidir.[1]

Bu paket yalnız metadata ve checksum/fingerprint tabanlı lineage saklar. Record değerleri, normalized data, raw response, artifact content, credential, cookie, authorization, URL, queue/worker payload veya storage object taşınmaz. Dataset publish/staging/abort transaction, database migration, export veya API bu paketin kapsamı dışındadır.

| Contract yüzeyi | Sağlanan davranış | Sınır |
|---|---|---|
| `createDataset` | Tenant/project scoped, named aktif dataset metadata'sı oluşturur | Dataset id farklı içerikle tekrar kullanılamaz |
| `createVersion` | Dataset için immutable, sequential `DRAFT` version ve source binding oluşturur | Version publish etmez, existing version değiştirmez |
| `appendRecordLineage` | Record id'yi version, source job/task/attempt ve checksum referanslarıyla bağlar | Record değerini veya artifact content'i saklamaz |
| Query surface | Safe version/lineage snapshot döner | UI/API/database query değildir |

## 2. Immutable dataset version ve source binding

`src/dataset/model.ts`, `dataset-model/v1` version'ını zorunlu tutar. Dataset version source binding'i `sourceJobId`, schema id/name/version/fingerprint ve plan id/version/fingerprint alanlarını içerir. Exact version draft tekrar edilirse aynı immutable version döner; farklı source binding ile yeni `versionNumber` üretilir. Her yeni version başlangıçta yalnız `DRAFT` durumundadır.

| Lineage alanı | İzlenebilirlik amacı |
|---|---|
| `sourceJobId` | Dataset version'ın kaynak job'ını bağlar |
| `schemaId`, `schemaName`, `schemaVersion`, `schemaFingerprintSha256` | Immutable schema definition referansını belirler |
| `planId`, `planVersion`, `planFingerprintSha256` | Immutable extraction plan referansını belirler |
| `sourceTaskId`, `sourceAttemptId` | Record'un job içindeki task/attempt kökenini belirler |
| `artifactChecksumSha256`, `recordChecksumSha256` | İçerik taşımadan doğrulanabilir referans sağlar |

Record lineage input'unun `sourceJobId` alanı dataset version source job'ıyla eşleşmelidir. Uyuşmazlık `DATASET_MODEL_LINEAGE_MISMATCH` ile fail-closed reddedilir. Aynı record id yalnız birebir aynı lineage ile idempotent kabul edilir; farklı checksum/task/attempt ile yeniden kullanılırsa conflict üretilir.

## 3. Tenant isolation ve gizlilik sınırı

Dataset ve dataset version anahtarları tenant/project scope'u içerir. Başka scope üzerinden dataset version'a erişim veya record lineage ekleme denemeleri `DATASET_MODEL_SCOPE_MISMATCH` ile reddedilir. ID/name/timestamp/version/fingerprint/checksum doğrulaması yapılır; malformed input `DATASET_MODEL_INVALID` hatası üretir.

> Lineage, içeriğin kendisi değil, içeriğe dair güvenli referanstır. Bu contract raw record/artifact değerlerini saklamadığı için source lineage görünümü secret veya raw scraping verisini raporlama yüzeyine taşımaz.

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/dataset/model.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/dataset/model.test.ts` | Başarılı — 1 dosya / 3 test | Immutable sequential versioning/source trace, idempotent safe record lineage ve source-job/cross-scope/malformed/conflict fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 76 dosya / 307 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. Staging/publish/abort transaction, atomic visibility, commit/recovery veya dataset lifecycle policy; P11-T02 kapsamı.
2. PostgreSQL persistence/migration, repository/API/UI, pagination, durable idempotency veya multi-node concurrency.
3. Raw record values, artifact storage retrieval, schema validation, dedupe/upsert, export, delivery veya retention/deletion.
4. Queue/worker dispatch, provider/model invocation, scheduling, retry/backoff veya automatic recovery.
5. CAPTCHA/challenge/WAF/anti-bot bypass, credential discovery, policy override veya secret export.

## 6. Review kararı

P11-T01 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P11-T02 — Staging, Publish & Abort Transaction Flow olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 11 Dataset Platform — P11-T01 kabul kriteri"
