# M11 — Dataset Platform Acceptance Gate

**Program:** Scraping Platform  
**Milestone / Phase:** M11 / Phase 11 — Dataset Platform  
**Kapsam:** P11-T01–P11-T08  
**Durum:** Accepted — kullanıcı onaylı, `CONDITIONAL GO`  
**Gate önerisi:** Açık koşullar korunmak üzere `CONDITIONAL GO`

## 1. Gate özeti

M11, tenant/project-scoped dataset metadata, immutable source lineage, staging/publish görünürlüğü, streaming JSON/JSONL/CSV export, Parquet/API/S3 capability control, dedupe/upsert, retention/legal hold governance ve API-facing projection contract'larını backend-only olarak kapsar. Phase 11 task register, dataset E2E, format, lineage ve retention acceptance'ının tamamlanmasını bekler.[1]

P11-T08 deterministic acceptance harness'ı, gerçek storage/database/network kullanmadan bu contract'ların kritik birleşim yüzeylerini doğrular. P11-T08 sonucunda `P11-T08 PASS` yalnız process-local contract davranışını ifade eder; real dataset E2E veya external delivery/silme gerçekleştiği anlamına gelmez.

> M11 contract'ları raw record/artifact content, credential, bucket/endpoint, authorization token veya external delivery command taşımaz. Intent/receipt yüzeyleri explicit approval ve no-external-action sınırlarını korur.

## 2. P11-T08 acceptance kanıtı

| Kontrol | Deterministic fixture sonucu | Güvenlik/operasyon sınırı |
|---|---:|---|
| Immutable source lineage | Dataset version kaynak job/schema/plan fingerprint'leri bağlı | Raw extraction content yok |
| Dedupe/upsert | Insert → idempotent tekrar → newer-sequence update, stable merged id | Same/older sequence conflict |
| Publish visibility | 2 staged reference, publish öncesi görünmez; publish sonrası atomik görünür | Database transaction değildir |
| Format export | JSON/JSONL/CSV ile 2 record serialization | Source iterable fixture; real storage/download yok |
| Retention/legal hold | Active hold deletion review'i block eder; release sonrası non-destructive intent | Gerçek delete yok |
| Export control | S3 capability intent hazır; external delivery/worker action kapalı | Bucket/credential/network yok |

`pnpm test:dataset-gate` harness çıktısı 6 kritik kontrolün tamamı için `true`, staged record count `2` ve exported record count `2` üretir. Harness sabit, value-safe test fixture kullanır; customer data veya real provider artifact kullanmaz.

## 3. M11 contract kabul yüzeyi

| Task | Kanıt | Durum |
|---|---|---|
| P11-T01 | Dataset/dataset version/value-free record lineage model | Accepted |
| P11-T02 | Staging, atomic visibility publish ve abort transaction reference | Accepted |
| P11-T03 | Bounded streaming JSON/JSONL/CSV adapter | Accepted |
| P11-T04 | Capability-gated Parquet/API/S3 non-delivery intent | Accepted |
| P11-T05 | Deterministic fingerprint dedupe/upsert ve source-lineage integrity | Accepted |
| P11-T06 | Retention, legal hold ve non-destructive deletion intent | Accepted |
| P11-T07 | Authorization-gated API-facing query/export control service | Accepted |
| P11-T08 | Dataset contract acceptance harness ve M11 gate | Accepted |

## 4. Conditional GO açık koşulları

| Açık koşul | Neden gate dışında | Tamamlama kanıtı |
|---|---|---|
| PostgreSQL schema/repository transaction | Registry'ler process-local reference'tır | Migration, transaction/isolation, tenant query ve crash recovery testleri |
| Durable staging/publish/abort | Atomik visibility yalnız in-memory method sınırında modellenir | Persistent status, commit/rollback/idempotency/reconciliation evidence |
| Real record/artifact storage | M11 raw content taşımaz | Encrypted storage, access policy ve data lifecycle E2E |
| Real Parquet, API ve S3 delivery | P11-T04 intent only; P11-T03 text serialization only | Encoder/HTTP/API/RBAC, S3 adapter/secrets/encryption/idempotent write/retry tests |
| Production deletion/retention sweep | P11-T06 non-destructive governance only | Signed authorization, storage/database/backup deletion receipt ve legal hold audit evidence |
| Distributed dedupe/upsert | Local registry provides deterministic precedence only | DB unique index, concurrency/fencing, migration and collision/reconciliation tests |
| Real dataset format/lineage/retention E2E | Sandbox lacks persistent dependency/service validation | Controlled integration environment, representative data and operational runbook evidence |

## 5. Nihai kalite kapısı

| Komut | Sonuç | Kanıt niteliği |
|---|---|---|
| `pnpm test:dataset-gate` | Başarılı | P11-T08 deterministic process-local contract smoke |
| `pnpm lint && pnpm typecheck` | Başarılı | Static quality kapısı |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 82 dosya / 325 test | Final full regression/build |
| `pnpm test:integration` | Controlled `SKIPPED dependency unavailable.` | Sandbox'ta gerçek storage/DB/queue E2E yoktur; PASS iddiası değildir |

## 6. Review kararı

P11-T08 ve M11 kullanıcı tarafından onaylanmıştır. M11, bu belgede tanımlı gerçek persistent/delivery/operational doğrulama açık koşulları korunarak `Accepted — CONDITIONAL GO` olarak kapatılmıştır. Sıradaki iş, kullanıcı frontend kapsamını hariç tuttuğundan Phase 12'nin backend-only uygulanabilir ilk bounded paketi olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 11 Dataset Platform — P11-T01–P11-T08"
