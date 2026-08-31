# P09-T02 — Task DAG, Dependency & Dispatch Planner Review

**Program:** Scraping Platform  
**Phase:** 9 — Job Orchestration  
**Task:** P09-T02  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, side-effect-free dependency graph ve dispatch decision contract  
**Bağımlılık:** P09-T01 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P09-T02, task dependency graph'ını bounded ve immutable bir DAG contract olarak derler. Graph yalnız known, unique ve self-reference içermeyen predecessor identity'leri kabul eder; cycle reject edilir. Dispatch planner, task snapshot'larını graph fingerprint'i ile doğrular ve yalnız `PENDING` olup bütün predecessor'ları `SUCCEEDED` olan task'ları ready olarak döndürür. Planner queue publish, status transition, lease veya retry davranışı üretmez.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| DAG compiler | `src/orchestrator/dispatch-planner.ts` | Bounded nodes, predecessor validation, cycle reject, topological order |
| Graph integrity | `src/orchestrator/dispatch-planner.ts` | Fingerprint ve snapshot-graph equality guard |
| Dispatch decision | `src/orchestrator/dispatch-planner.ts` | Ready, waiting, terminal-blocked task identity listeleri |
| Unit acceptance | `test/orchestrator/dispatch-planner.test.ts` | Predecessor completion, unfinished/failed block, invalid graph/snapshot |

## 2. DAG validation contract

Task graph maksimum 500 node içerir. Her task identity unique ve safe identifier olmalı; predecessor listesi yalnız graph içindeki task'lara referans verebilir, duplicate ya da self dependency içeremez. Depth-first topological compilation cycle bulursa `TASK_DAG_CYCLE`, diğer graph contract ihlallerinde `TASK_DAG_INVALID` döner.

| Input durumu | Sonuç |
|---|---|
| Valid acyclic predecessor graph | Stable topological order + fingerprint |
| Unknown/self/duplicate predecessor | `TASK_DAG_INVALID` |
| Dependency cycle | `TASK_DAG_CYCLE` |
| Altered/forged graph fingerprint | `TASK_DAG_INVALID` |
| Incomplete/foreign snapshot | `TASK_SNAPSHOT_INVALID` |

## 3. Dispatch decision semantics

Planner only `PENDING` task'ları karar surface'ine dahil eder. Tüm predecessor `SUCCEEDED` ise ready; en az bir predecessor non-terminal unfinished ise waiting; predecessorlardan en az biri `FAILED` veya `CANCELLED` ise terminal-blocked olur. Bu ayrım downstream orchestration layer’ın explicit operator/retry/cancel policy seçmesini sağlar; planner kendisi hiçbir task'ı state değiştirmez.

> **No-dispatch sınırı:** `readyTaskIds`, queue message veya worker claim değildir. P09-T03 idempotent delivery/lease/heartbeat/result commit zinciri olmadan plan sonucu gerçek executor’a gönderilmemelidir.

## 4. Determinism ve no-leakage

Topological order caller node order ve declared dependency relation üzerinden sabittir. Ready/waiting/blocked lists bu order'ı korur. Planner yalnız safe task identity ve lifecycle status kullanır; request body, target URL, selector, extracted value, credential, cookie veya raw error ayrıntısı taşımaz.

## 5. Acceptance kanıtı

Dar kapsam suite üç behavior grubunu doğrular: successful predecessor sonrası deterministic ready release; running/failed predecessor altında no-dispatch behavior; unknown/self/duplicate/cycle graph, forged fingerprint ve incomplete snapshot reject. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **62 test dosyası / 265 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 6. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Ready task queue publish | P09-T03 delivery/lease integration sorumluluğu |
| Idempotent delivery & result commit | P09-T03 sorumluluğu |
| Worker heartbeat/lease expiration | P09-T03 sorumluluğu |
| Cancel/pause/drain propagation | P09-T04 sorumluluğu |
| Durable DAG/policy/revision storage | PostgreSQL transaction/persistence gerekir |
| Real concurrency/queue integration | Redis/BullMQ worker ortamı gerekir |

## 7. Review kararı talebi

P09-T02 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P09-T03 — Idempotency, Lease, Heartbeat & Result Commit olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P09 Job Orchestration task register"
[2]: ./phase-9-job-orchestration-p09-t01-review.md "P09-T01 state transition contract"
[3]: ./phase-9-job-orchestration-task-board.md "Phase 9 task board"
