# P09-T03 — Idempotency, Lease, Heartbeat & Result Commit Review

**Program:** Scraping Platform  
**Phase:** 9 — Job Orchestration  
**Task:** P09-T03  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, process-local at-least-once delivery reference contract  
**Bağımlılık:** P09-T02 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P09-T03, tenant/job/task/attempt scope'tan derive edilen idempotency key ile task delivery ledger ekler. Ledger aynı delivery için active owner lease, bounded heartbeat extension, expired lease reclaim ve owner/epoch-guarded result commit davranışını modeler. Commit sonrası duplicate delivery aynı safe receipt'i `idempotent: true` ile döndürür; farklı result checksum ile ikinci commit reddedilir.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Derived idempotency key | `src/orchestrator/delivery-ledger.ts` | Tenant/job/task/attempt scope SHA-256 identity |
| Lease/heartbeat | `src/orchestrator/delivery-ledger.ts` | Owner + epoch guard, 1 sn–10 dk bounded lease |
| Expiry/reclaim | `src/orchestrator/delivery-ledger.ts` | Expired owner commit edemez; next owner epoch artırır |
| Result commit | `src/orchestrator/delivery-ledger.ts` | Tek safe commit receipt, duplicate receipt idempotent |
| Unit acceptance | `test/orchestrator/delivery-ledger.test.ts` | Commit idempotency, lease expiry/reclaim, scope/no-leakage rejects |

## 2. Delivery semantics

`acquire` aynı scope için derived key kullanır. Active ve süresi geçmemiş lease başka worker tarafından tekrar alınamaz. Lease expired olduğunda yeni worker aynı delivery identity üzerinde higher epoch ile reclaim edebilir. `heartbeat` ve first `commit` ancak active owner + same epoch tarafından uygulanır. Commit sonrası lease temizlenir ve aynı scope acquire çağrısı yeni work üretmek yerine idempotent receipt verir.

| Operation | Başarı koşulu | Fail-closed davranış |
|---|---|---|
| Acquire | First delivery veya expired lease | Active lease altında `LEASE_CONFLICT` |
| Heartbeat | Same owner + live epoch | Wrong owner/epoch veya expiry reject |
| Commit | Same owner + live epoch | Expired/conflicting lease reject |
| Duplicate acquire after commit | Same derived scope | Same receipt, `idempotent: true` |
| Duplicate commit | Same checksum | Idempotent receipt; different checksum reject |

## 3. Safe result ve audit surface

Receipt yalnız delivery ID, idempotency key, commit time, optional checksum ve idempotency bit'i taşır. Raw result payload, extraction value, cookie/header, credential, selector veya provider error içermez. Ledger audit event'i type, delivery/scope identity, epoch ve time ile sınırlıdır; result payload saklanmaz.

> **Process-local sınır:** Bu contract Redis/BullMQ visibility/ack ya da PostgreSQL unique key/transaction yerine geçmez. Process restart, multi-node lease fencing ve distributed clock ölçümü için production guarantee verilmez.

## 4. Acceptance kanıtı

Dar kapsam suite üç behavior grubunu doğrular: one-result-per-derived-key ve duplicate receipt; owner heartbeat, expiry sonrası reclaim ve higher epoch; malformed/cross-scope/conflicting checksum reject ve audit no-leakage. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **63 test dosyası / 268 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Redis/BullMQ consume/ack/visibility timeout | Actual queue worker integration gerekir |
| PostgreSQL idempotency key unique index/transaction | Durable persistence gerekir |
| Multi-worker fencing/distributed lease | Shared lease store/atomic primitive gerekir |
| Worker crash recovery/retry/DLQ | P09-T07 ve queue lifecycle sorumluluğu |
| Result persistence/reconciliation | P09-T06 sorumluluğu |
| Cancel/pause/drain lease propagation | P09-T04 sorumluluğu |

## 6. Review kararı talebi

P09-T03 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P09-T04 — Cancel, Pause/Resume & Graceful Drain olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P09 Job Orchestration task register"
[2]: ../src/queue/contracts.ts "Queue envelope context"
[3]: ../src/proxy/lease-manager.ts "Existing scoped lease pattern"
[4]: ./phase-9-job-orchestration-p09-t02-review.md "P09-T02 dependency planner"
[5]: ./phase-9-job-orchestration-task-board.md "Phase 9 task board"
