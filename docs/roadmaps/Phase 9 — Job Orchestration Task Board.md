# Phase 9 — Job Orchestration Task Board

**Program:** Scraping Platform  
**Phase amacı:** Job/task lifecycle, dependency planning, idempotent worker delivery, graceful control ve reconciliation contract'larını güvenli orchestration sınırlarıyla geliştirmek.[1]

**Güncel durum:** P09-T08/M9 kullanıcı onaylı `CONDITIONAL GO`; P09-T01–P09-T08 Accepted

| ID | Workstream | Task | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P09-T01 | Orchestration | Job state machine ve transition guard’ları kesinleştir | Backend Lead | 6 | P08-T08 | Accepted | `docs/phase-9-job-orchestration-p09-t01-review.md`, `src/orchestrator/state-machine.ts`, `test/orchestrator/state-machine.test.ts` |
| P09-T02 | Orchestration | Task DAG/dependency ve dispatch planner’ı geliştir | Backend Lead | 8 | P09-T01 | Accepted | `docs/phase-9-job-orchestration-p09-t02-review.md`, `src/orchestrator/dispatch-planner.ts`, `test/orchestrator/dispatch-planner.test.ts` |
| P09-T03 | Reliability | Idempotency, lease, heartbeat ve result commit mekanizmasını tamamla | SRE/Platform Lead | 8 | P09-T02 | Accepted | `docs/phase-9-job-orchestration-p09-t03-review.md`, `src/orchestrator/delivery-ledger.ts`, `test/orchestrator/delivery-ledger.test.ts` |
| P09-T04 | Operations | Cancel, pause/resume ve graceful drain akışını uygula | SRE/Platform Lead | 6 | P09-T03 | Accepted | `docs/phase-9-job-orchestration-p09-t04-review.md`, `src/orchestrator/control-plane.ts`, `test/orchestrator/control-plane.test.ts` |
| P09-T05 | Observability | Progress event, WebSocket snapshot ve webhook event akışını tamamla | Backend Lead | 7 | P09-T04 | Accepted | `docs/phase-9-job-orchestration-p09-t05-review.md`, `src/orchestrator/progress-events.ts`, `test/orchestrator/progress-events.test.ts` |
| P09-T06 | Data | Run/attempt history, reconciliation ve audit görünümünü tamamla | Backend Lead | 6 | P09-T05 | Accepted | `docs/phase-9-job-orchestration-p09-t06-review.md`, `src/orchestrator/history-projection.ts`, `test/orchestrator/history-projection.test.ts` |
| P09-T07 | Reliability | DLQ review, replay ve operational recovery prosedürünü uygula | SRE/Platform Lead | 5 | P09-T06 | Accepted | `docs/phase-9-job-orchestration-p09-t07-review.md`, `src/orchestrator/dlq-recovery.ts`, `test/orchestrator/dlq-recovery.test.ts` |
| P09-T08 | Quality/Gate | Orchestration load, chaos-lite ve acceptance testini tamamla | QA Lead | 9 | P09-T07 | Accepted — CONDITIONAL GO | `docs/phase-9-job-orchestration-m9-gate.md`, `scripts/orchestration-gate-smoke.ts` |

## P09-T01 bounded scope

P09-T01 yalnız mevcut job/task transition tablosunu tenant/job scoped process-local registry üzerinden uygulanabilir hale getirir ve valid/invalid transition için secret-safe audit event üretir. Task DAG, dispatch planner, idempotent delivery/lease, pause/cancel, realtime event, durable audit/reconciliation ve DLQ bu taskın dışında kalır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P09 Job Orchestration task register"
[2]: ./phase-8-crawler-engine-m8-gate.md "M8 conditional gate"
