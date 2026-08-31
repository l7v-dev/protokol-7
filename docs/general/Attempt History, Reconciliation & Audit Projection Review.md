# P09-T06 — Run/Attempt History, Reconciliation & Audit Projection Review

**Program:** Scraping Platform  
**Milestone / Phase:** M9 / Phase 9 — Job Orchestration  
**Task:** P09-T06  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, deterministic read-model/reference contract

## 1. Amaç ve kabul sınırı

Bu paket, run ve attempt geçmişini **append-only** biçimde temsil eden, gözlemlenen orchestration farklarını yalnızca raporlayan ve mevcut safe event yüzeylerinden secret-safe audit projection üreten sınırlandırılmış bir contract sağlar. Attempt geçmişinde aynı task için retry yeni `attemptNo` ve `attemptId` ile temsil edilir; broker redelivery'nin yeni domain attempt olmadığı lifecycle sözleşmesindeki kural korunur.[1]

> Reconciliation çıktısı yalnız bir **dry-run** fark raporudur. `repairAllowed` alanı sabit olarak `false` kalır; otomatik onarım, replay, queue publish, state transition veya operatör onayı yerine geçmez.

| Contract yüzeyi | Sağlanan davranış | Güvenlik / determinism sınırı |
|---|---|---|
| `RunAttemptHistoryProjection` | Tenant/job-scoped run kaydı ile run'a bağlı attempt geçmişini kaydeder | `runId` ve `attemptId` tekrarları reddedilir; task attempt numarası ardışık olmak zorundadır |
| `snapshot` | Run zamanına göre sıralı, detached run/attempt read view döner | Çağıranın sonucu değiştirmesi process-local history'yi değiştirmez |
| `reconcile` | Planlanan, persisted, queued, dispatch-pending, lease ve outbox gözlemlerinden farkları üretir | Sonuç sabit `dryRun: true` ve `repairAllowed: false` ile sadece bulgudur |
| `auditView` | History, lifecycle, delivery, control ve progress safe eventlerini tek ordered view'da birleştirir | Tenant/job scope uyuşmazlığı fail-closed reddedilir; raw payload, URL, credential ve idempotency key yansıtılmaz |

## 2. Uygulanan contract

`src/orchestrator/history-projection.ts` eklendi. `recordRun` ilk run kaydını kabul eder, duplicate run'ı reddeder ve `RUN_RECORDED` audit olayı üretir. `appendAttempt` yalnız var olan bir run altında, daha önce kullanılmamış `attemptId` ile ve aynı task'ın önceki kayıt sayısına göre ardışık `attemptNo` değerinde çalışır. Bu yaklaşım mevcut lifecycle sözleşmesinin append-only execution history kuralıyla uyumludur.[1]

Snapshot, runları `recordedAt` sonra `runId` ile sıralar; her runın attempt listesini detached kopya olarak döner. Kayıtlar `taskId`, `attemptId`, statü, zaman, opsiyonel non-negative duration ve opsiyonel SHA-256 result checksum taşır. Request/response gövdesi, URL, selector, worker kimliği, credential, cookie, authorization header, session token, raw provider hatası veya artifact içeriği bu yüzeyde bulunmaz.

## 3. Reconciliation bulguları

Reconciliation, lifecycle sözleşmesinde tanımlı queue/database, dispatch, expired lease, orphan resource, unpublished outbox ve terminal job altında aktif work kontrol alanlarını **gözlem bazlı** olarak kapsar.[1] Bu paket gerçek queue veya PostgreSQL taraması yapmaz; güvenli ve doğrulanmış dış snapshot'u girdisi olarak alır. Rapor bulguları deterministik task/lease sırasıyla üretilir.

| Bulgu kodu | Koşul | Şiddet | Otomatik aksiyon |
|---|---|---|---|
| `PLANNED_TASK_WITHOUT_ATTEMPT` | Planlanan task için history attempt'i yok | Warning | Yok |
| `QUEUE_TASK_WITHOUT_PERSISTED_RECORD` | Queue task'ı persisted task kümesinde yok | Error | Yok |
| `DISPATCH_PENDING_TASK_NOT_QUEUED` | Dispatch-pending task queue kümesinde yok | Warning | Yok |
| `EXPIRED_ACTIVE_LEASE` | Active lease süresi observation anında bitmiş | Warning | Yok |
| `ORPHAN_ACTIVE_LEASE` | Active lease task'ı persisted task kümesinde yok | Error | Yok |
| `UNPUBLISHED_OUTBOX_TASK` | Outbox publish edilmemiş task gözlemi var | Warning | Yok |
| `TERMINAL_JOB_WITH_ACTIVE_LEASE` | Terminal job status altında active lease var | Error | Yok |

`reportId`, scope, observation zamanı ve canonicalize edilmiş observation içeriğinin SHA-256 özetinden üretilir. Bu yalnız traceability içindir; rapor herhangi bir işlem yetkisi taşımaz.

## 4. Secret-safe audit view

Audit projection, kaynak eventlerden sadece operasyonel açıdan gerekli ve güvenli alanları taşır: source, eventId, occurredAt, code, status, taskId, attemptId, leaseEpoch ve progress sequence. `DeliveryAuditEvent` içindeki `idempotencyKey` dahil edilmez. History, lifecycle, delivery, control veya progress kaynağında tenant/job scope farklıysa `HISTORY_SCOPE_MISMATCH` üretilir; event fail-open biçimde başka tenant'ın görünümüne katılmaz.

| Kaynak | Dahil edilen safe özet | Bilerek dışarıda bırakılan alanlar |
|---|---|---|
| History | Kaydetme tipi, run/attempt referansı ve status | Raw sonuç veya çalışma girdisi |
| Lifecycle | Transition code, hedef status, opsiyonel taskId | Causation/trace değerleri ve hata detayları |
| Delivery | Delivery event tipi, task/attempt, lease epoch | Idempotency key, owner, checksum, payload |
| Control | Control event tipi ve control status | Command body veya actor/credential |
| Progress | Safe type, status ve monotonik sequence | URL, selector, raw response ve webhook destination |

## 5. Doğrulama kanıtı

Dar kapsam test paketi `test/orchestrator/history-projection.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/orchestrator/history-projection.test.ts` | Başarılı — 1 dosya / 3 test | Append-only ve detached snapshot; dry-run reconciliation; safe audit merge ve fail-closed scope/input yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 66 dosya / 277 test | Lint, strict typecheck, tüm regression suite ve production build |

## 6. Bilinçli kapsam dışları

Bu paket bir production persistence veya reconciliation worker'ı değildir. Aşağıdakiler özellikle uygulanmamıştır:

1. PostgreSQL, Redis, BullMQ, outbox, queue veya provider'a gerçek bağlantı ve E2E fark taraması.
2. Run/attempt kayıtlarının durable saklanması, schema migration, query endpoint veya frontend/UI audit ekranı.
3. Otomatik repair, queue replay, DLQ replay, publish, state transition, lease revoke veya operator approval akışı.
4. Cross-node ordering, distributed cursor, history retention policy, pagination token veya durable reconciliation evidence store.
5. Raw request/response/artifact saklama, secret yönetimi, credential discovery ya da herhangi bir policy bypass.

## 7. Review kararı

P09-T06 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P09-T07 — DLQ Review, Replay & Operational Recovery olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/backend/phase-0-m0-lifecycle-contract.md "Phase 0 lifecycle contract — attempt append-only, transition metadata ve reconciliation"
