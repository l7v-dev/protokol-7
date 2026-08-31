# M9 — Job Orchestration Acceptance Gate

**Program:** Scraping Platform  
**Milestone:** M9 — Job Orchestration Accepted  
**Durum:** Accepted — kullanıcı onaylı  
**Karar:** `CONDITIONAL GO`  
**Kapsam:** Backend-only deterministic contract, bounded load ve chaos-lite acceptance

## 1. Gate özeti

Phase 9, job/task lifecycle, dependency planning, idempotent delivery, graceful control, progress snapshots, reconciliation ve DLQ recovery contract'larını kapsar.[1] P09-T01–P09-T07 kullanıcı onayıyla `Accepted` durumundadır. P09-T08 ise bu bounded contract'ları, gerçek bağımlılıklara erişmeden tek deterministic harness altında sınar.

Önerilen karar, **`CONDITIONAL GO`** niteliğindedir. Bu karar; process-local reference contract'ların, deterministic load/chaos-lite harness'ın ve regression suite'in kanıtını ifade eder. PostgreSQL/Redis/BullMQ/queue/provider üzerinde gerçek load, gerçek failure recovery veya production readiness iddiası değildir.

| Alan | Gate kanıtı | Durum |
|---|---|---|
| Lifecycle | Invalid job transition reddi ve safe rejected audit | PASS — process-local |
| DAG / dispatch | 500-task bounded chain, tek root ready ve 499 waiting decision | PASS — no dispatch |
| Delivery / lease | Tek commit, idempotent duplicate receipt ve expired lease rejection | PASS — no queue/DB |
| Pause / drain | In-flight delivery drain sonrası pause ve dispatch block | PASS — process-local |
| Progress / reconnect | 1,005 event sonrası bounded cursor snapshot delta | PASS — no WebSocket/SSE |
| History / reconciliation | Dry-run discrepancy report, no repair authority | PASS — caller-supplied observation |
| DLQ / recovery | Operator-approved idempotent intent; anti-bot replay block | PASS — no broker operation |

## 2. P09-T08 acceptance harness

`pnpm test:orchestration-gate`, 500 task ile upper bounded DAG load senaryosu yürütür. Harness, initial snapshot'ta yalnız root task'ın `ready` olmasını ve diğer 499 task'ın `waiting` kalmasını doğrular. Böylece immutable DAG compiler ve planner için bounded capacity sınırı aşılmadan load karakteristiği sınanır.

Chaos-lite bölümü, geçersiz lifecycle transition, lease expiry, pause/drain sonrası dispatch denemesi ve terminal anti-bot failure class için replay intent talebini kontrol eder. Her senaryoda contract fail-closed kalır; bypass, retry, otomatik recovery veya outbound action çalıştırılmaz. Progress bölümünde 1,005 event üretilir; 1,000 event retention sınırı altında reconnect cursor sonrası yalnız son 5 delta event görünür.

> **Harness sınırı:** Acceptance kanıtı deterministic module integration'ıdır. Ağ, DNS, HTTP/browser fetch, WebSocket/SSE, PostgreSQL, Redis/BullMQ, outbox, real dead-letter queue, storage, provider veya real worker side effect üretmez.

| Harness kontrolü | Beklenen kanıt | Sonuç |
|---|---|---|
| `boundedDagLoad` | 500 task topological order; root-only dispatch eligibility | PASS |
| `invalidLifecycleRejected` | Invalid transition mutasyon olmadan reddedilir | PASS |
| `idempotentCommitAndLeaseExpiry` | Duplicate commit idempotent; expired lease commit edilemez | PASS |
| `gracefulDrainBlocksDispatch` | Pause drain sonrası future dispatch engellenir | PASS |
| `boundedReconnectProjection` | Monotonik cursor ve bounded event delta | PASS |
| `readOnlyReconciliation` | Fark raporu `dryRun: true`, `repairAllowed: false` | PASS |
| `approvalGatedDlqReplay` | Approval-gated intent idempotent; anti-bot replay reddedilir | PASS |

## 3. P09 exit criteria traceability

| Task | Kabul odağı | Kanıt | Durum |
|---|---|---|---|
| P09-T01 | Job/task state guard ve audit | [P09-T01 review][3] | Accepted |
| P09-T02 | DAG ve deterministic dispatch | [P09-T02 review][4] | Accepted |
| P09-T03 | Idempotency, lease, heartbeat, commit | [P09-T03 review][5] | Accepted |
| P09-T04 | Cancel/pause/resume/drain | [P09-T04 review][6] | Accepted |
| P09-T05 | Progress/reconnect/webhook intent | [P09-T05 review][7] | Accepted |
| P09-T06 | Run/attempt history/reconciliation/audit | [P09-T06 review][8] | Accepted |
| P09-T07 | DLQ/replay/recovery intent | [P09-T07 review][9] | Accepted |
| P09-T08 | Bounded load, chaos-lite, regression acceptance | `scripts/orchestration-gate-smoke.ts` | In Review |

## 4. Quality evidence

| Komut | Amaç | Durum |
|---|---|---|
| `pnpm test:orchestration-gate` | Deterministic bounded-load ve chaos-lite harness | PASS |
| `pnpm lint` | Static quality | PASS |
| `pnpm typecheck` | Strict TypeScript contract | PASS |
| `pnpm test --run` | Full regression suite | PASS — 67 test dosyası / 280 test |
| `pnpm build` | Production compilation | PASS |
| `pnpm test:integration` | DB/Redis integration smoke | Controlled SKIPPED — dependency unavailable |

Nihai kalite zinciri `pnpm test:orchestration-gate && pnpm lint && pnpm typecheck && pnpm test --run && pnpm build && pnpm test:integration` ile tamamlanmıştır. Integration smoke'un `SKIPPED` sonucu gerçek PostgreSQL/Redis integration PASS kanıtı olarak sunulmamaktadır.

## 5. Açık koşullar

M9 ancak aşağıdaki açık koşullar korunarak `CONDITIONAL GO` kabul edilebilir.

| Açık koşul | Neden M9 full production close değildir |
|---|---|
| PostgreSQL source-of-truth / durable history | P09 registries, ledger, history ve DLQ contract'ları process-local referanstır |
| Redis/BullMQ queue / DLQ E2E | Gerçek enqueue, consume, dead-letter read/write, replay dispatch veya retry yoktur |
| Distributed concurrency / fencing | Multi-worker lock, lease epoch persistence, out-of-order and duplicate message E2E doğrulanmadı |
| Real recovery operations | Auto repair/replay/lease revoke veya operator-authorized action yürütülmedi |
| Realtime / outbound transport | Actual WebSocket/SSE, webhook dispatch, redirect/signing/secret management yoktur |
| Production load / chaos | 500-task deterministic local DAG smoke; throughput, saturation, network fault ve latency SLA yoktur |
| Observability / incident operations | Central logs, metrics, alerts, tracing, dashboard ve incident drill yoktur |
| Data lifecycle | Retention, pagination, archival, reconciliation evidence persistence veya disaster recovery yoktur |

## 6. Sign-off talebi

P09-T08 ve M9 gate kullanıcı tarafından onaylanmıştır. P09-T08 `Accepted — CONDITIONAL GO` olarak işaretlenmiş ve M9 koşullu kapatılmıştır. Sonraki bounded backend paketi roadmap'te doğrulanacak Phase 10 başlangıç taskı olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 9 Job Orchestration task register"
[2]: ./phase-9-job-orchestration-task-board.md "Phase 9 task board"
[3]: ./phase-9-job-orchestration-p09-t01-review.md "P09-T01 review"
[4]: ./phase-9-job-orchestration-p09-t02-review.md "P09-T02 review"
[5]: ./phase-9-job-orchestration-p09-t03-review.md "P09-T03 review"
[6]: ./phase-9-job-orchestration-p09-t04-review.md "P09-T04 review"
[7]: ./phase-9-job-orchestration-p09-t05-review.md "P09-T05 review"
[8]: ./phase-9-job-orchestration-p09-t06-review.md "P09-T06 review"
[9]: ./phase-9-job-orchestration-p09-t07-review.md "P09-T07 review"
