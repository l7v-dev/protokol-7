# P11-T05 — Record Dedupe/Upsert & Lineage Integrity Review

**Program:** Scraping Platform  
**Milestone / Phase:** M11 / Phase 11 — Dataset Platform  
**Task:** P11-T05  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, deterministic, value-minimizing dedupe/upsert reference contract

## 1. Amaç ve kabul sınırı

P11-T05, dataset version içindeki eşdeğer record'ları raw record value görmeden caller-provided dedupe-key fingerprint'i üzerinden birleştirir ve kaynak lineage'ını korur. Program task register'ın kabul kriterisi, aynı record'un policy'ye uygun birleşmesi ve kaynak lineage'ın kaybolmamasıdır.[1]

`src/dataset/dedupe-upsert.ts` yalnız SHA-256 fingerprint/checksum, safe identifier, source task/attempt ve numeric source sequence taşır. Raw record field'ları, normalized values, artifact content, URL, credential, cookie, authorization, prompt, worker payload veya dataset export content'i saklanmaz.

| Contract yüzeyi | Sağlanan davranış | Sınır |
|---|---|---|
| `bindDatasetVersion` | Dataset version için immutable source job binding kurar | P11-T01 registry/database ile runtime resolve yapmaz |
| `upsert` | Dedupe fingerprint üzerinden inserted/idempotent/updated receipt üretir | Raw value merge veya field-level conflict resolution yapmaz |
| `get` | Safe merged record + lineage metadata döner | API/UI/export/persistence yüzeyi değildir |

## 2. Deterministic dedupe ve upsert kuralı

Dedupe identity, tenant/project/datasetVersionId/dedupeKeyFingerprint kombinasyonudur. İlk geçerli record `INSERTED` olarak revision `1` ile kaydedilir. Birebir aynı checksum ve lineage tekrarında `IDEMPOTENT` dönüşü alınır; duplicate kayıt veya revision artışı gerçekleşmez.

Farklı record checksum'ı için update yalnız incoming `sourceSequence`, mevcut lineage sequence değerinden **kesin olarak büyükse** izinlidir. Bu durumda stable `mergedRecordId` korunur, revision artar ve güncel source job/task/attempt/artifact lineage'ı kayda bağlanır. Aynı veya eski sequence ile farklı içerik geldiğinde conflict üretilir; sessiz last-write-wins davranışı yoktur.

| Girdi ilişkisi | Receipt | Lineage etkisi |
|---|---|---|
| İlk dedupe key | `INSERTED` | İlk safe source lineage kaydedilir |
| Exact checksum + exact lineage | `IDEMPOTENT` | Mevcut revision/lineage korunur |
| Farklı checksum + strictly newer sequence | `UPDATED` | Revision artar; stable record id korunur |
| Farklı checksum + same/older sequence | `DATASET_DEDUPE_CONFLICT` | Mevcut merged record değişmez |

## 3. Lineage integrity, tenant isolation ve minimization

Her dataset version önce immutable `sourceJobId` ile bind edilir. Upsert input'unun `sourceJobId` alanı bu binding ile eşleşmezse `DATASET_DEDUPE_LINEAGE_MISMATCH` ile fail-closed reddedilir. Cross-tenant/project dataset version erişimi `DATASET_DEDUPE_SCOPE_MISMATCH` üretir. Invalid id, hash, timestamp veya sequence de yine fail-closed geçersizdir.

Receipt, record content yerine lineage fingerprint'i taşır. Böylece upsert sonucu source trace sağlayabilir ancak raw extraction sonucu, kişisel/sensitive field veya secret değeri dataset metadata görünümüne eklenmez.

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/dataset/dedupe-upsert.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/dataset/dedupe-upsert.test.ts` | Başarılı — 1 dosya / 3 test | Deterministic insert/idempotency, newer-sequence update/stable id/revision ve stale/source-job/cross-scope/malformed fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 80 dosya / 319 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. Database unique index/transaction, distributed concurrency/locking, durable idempotency veya crash reconciliation.
2. Raw record storage ve field-level merge policy, schema-aware comparison, fuzzy matching, similarity model veya user-defined merge rules.
3. P11-T01/P11-T02 registry integration, staged/published dataset state, full lineage graph veya legacy record migration.
4. Export, S3/API delivery, retention/deletion, API/UI, event/outbox, worker dispatch veya background automation.
5. Credential discovery, secret export, policy bypass veya automatic external action.

## 6. Review kararı

P11-T05 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P11-T06 — Dataset Retention, Deletion & Legal Hold Controls olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 11 Dataset Platform — P11-T05 kabul kriteri"
