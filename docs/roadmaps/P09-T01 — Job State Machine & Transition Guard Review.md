# P09-T01 — Job State Machine & Transition Guard Review

**Program:** Scraping Platform  
**Phase:** 9 — Job Orchestration  
**Task:** P09-T01  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, process-local state transition ve safe audit contract  
**Bağımlılık:** P08-T08/M8 `Accepted — CONDITIONAL GO`, kullanıcı onaylı

## 1. Teslim özeti

P09-T01, mevcut job/task lifecycle transition tablosunu `OrchestrationStateRegistry` üzerinden tenant/job scoped process-local state contract'a bağlar. Registry, initialization, valid transition, invalid transition audit, scope-bound status read ve immutable audit event snapshot davranışını kapsar. Geçersiz transition current state'i değiştirmez, `409 / INVALID_STATE_TRANSITION` ile reddedilir ve terminal safe audit event üretir.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Existing lifecycle table | `src/orchestrator/lifecycle.ts` | Job/task transition allowlist |
| State registry | `src/orchestrator/state-machine.ts` | Tenant/job scoped job/task state surface |
| Audit contract | `src/orchestrator/state-machine.ts` | Valid/invalid transition için safe event |
| Unit acceptance | `test/orchestrator/state-machine.test.ts` | Valid, invalid/audit, isolation/conflict paths |

## 2. Transition ve audit contract

Registry transition kararını `lifecycle.ts` içindeki allowlist üzerinden alır. Job örnekleri `CREATED → DISPATCH_PENDING`, `RUNNING → EXTRACTING` ve `CANCEL_REQUESTED → CANCELLED`; task örnekleri `PENDING → CLAIMED`, `CLAIMED → RUNNING` ve `RUNNING → SUCCEEDED` akışlarını kullanır. Terminal veya tanımsız bir state'e geri dönüş reject edilir.

| Outcome | State etkisi | Audit event |
|---|---|---|
| Valid transition | Target status uygulanır | `TRANSITIONED / STATE_TRANSITIONED` |
| Invalid transition | Current status korunur | `REJECTED / INVALID_STATE_TRANSITION` |
| Scope/state bulunamadı | Değişiklik yok, `404` | Event üretmez |
| Invalid scope | Değişiklik yok, `400` | Event üretmez |

Audit event yalnız event ID, timestamp, tenant/job, entity class, safe task ID, from/to status, outcome ve code içerir. Request body, selector, raw URL, extracted value, credential/header/cookie veya error detail içermez.

> **Audit durability sınırı:** Bu event listesi process memory'dedir. Durable immutable audit chain, outbox, retention, query API, signature ve reconciliation P09-T06/P13/P15 kapsamındadır.

## 3. Tenant scope ve immutability

Job/task/audit key'i tenant + job identity ile ayrılır. Farklı tenant/job scope için state okunamaz. `auditEvents()` event clone'ları döndürür; caller'ın response objesinde yaptığı değişiklik registry state’ini değiştiremez. Initialize aynı state için idempotent, farklı initial state için conflict'tir.

## 4. Acceptance kanıtı

Dar kapsam suite üç behavior grubunu doğrular: valid job/task transition ve safe audit; invalid job transition reject'i ve rejected audit; cross-tenant state isolation, conflicting initialization ve malformed ID reject. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **61 test dosyası / 262 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Task DAG/dependency & dispatch plan | P09-T02 sorumluluğu |
| Delivery idempotency/lease/heartbeat/result commit | P09-T03 sorumluluğu |
| Cancel/pause/resume/graceful drain | P09-T04 sorumluluğu |
| Durable audit/history/reconciliation | P09-T06 sorumluluğu |
| DLQ/replay recovery | P09-T07 sorumluluğu |
| Postgres transaction/outbox/Redis queue wiring | Actual infrastructure integration gerekir |
| Multi-worker locking/fencing | Distributed coordination contract’ı gerekir |

## 6. Review kararı talebi

P09-T01 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P09-T02 — Task DAG/Dependency & Dispatch Planner olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P09 Job Orchestration task register"
[2]: ../src/orchestrator/lifecycle.ts "Existing lifecycle transition guard"
[3]: ./phase-8-crawler-engine-m8-gate.md "M8 conditional gate"
[4]: ./phase-9-job-orchestration-task-board.md "Phase 9 task board"
