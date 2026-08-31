import assert from 'node:assert/strict';

import { JobControlRegistry } from '../src/orchestrator/control-plane.js';
import { TaskDeliveryLedger } from '../src/orchestrator/delivery-ledger.js';
import { DlqRecoveryError, DlqRecoveryRegistry } from '../src/orchestrator/dlq-recovery.js';
import { compileTaskDependencyGraph, planDispatch } from '../src/orchestrator/dispatch-planner.js';
import { RunAttemptHistoryProjection } from '../src/orchestrator/history-projection.js';
import { JobProgressEventRegistry } from '../src/orchestrator/progress-events.js';
import { OrchestrationStateRegistry } from '../src/orchestrator/state-machine.js';

const scope = { tenantId: 'tenant_gate', jobId: 'job_gate' };
let nowMs = Date.parse('2026-08-27T00:00:00.000Z');
const clock = (): Date => new Date(nowMs);

async function main(): Promise<void> {
  const checks: Record<string, boolean> = {};

  // Bounded load: a 500-task DAG must remain ordered and only its root is dispatch-ready.
  const nodes = Array.from({ length: 500 }, (_, index) => ({
    taskId: `task_${index + 1}`,
    ...(index === 0 ? {} : { dependsOn: [`task_${index}`] })
  }));
  const graph = compileTaskDependencyGraph(nodes);
  const initialPlan = planDispatch(graph, graph.taskIds.map((taskId) => ({ taskId, status: 'PENDING' as const })));
  assert.equal(graph.topologicalTaskIds.length, 500);
  assert.deepEqual(initialPlan.readyTaskIds, ['task_1']);
  assert.equal(initialPlan.waitingTaskIds.length, 499);
  checks.boundedDagLoad = true;

  // Chaos-lite: invalid lifecycle transition is rejected and does not silently mutate state.
  const lifecycle = new OrchestrationStateRegistry(clock);
  lifecycle.initializeJob(scope);
  assert.throws(() => lifecycle.transitionJob(scope, 'COMPLETED'));
  assert.equal(lifecycle.jobStatus(scope), 'CREATED');
  assert.equal(lifecycle.auditEvents(scope)[0]?.outcome, 'REJECTED');
  checks.invalidLifecycleRejected = true;

  // Duplicate result commit resolves to a single idempotent receipt; expired lease cannot commit.
  const ledger = new TaskDeliveryLedger(clock);
  const deliveryScope = { ...scope, taskId: 'task_1', attemptId: 'attempt_1' };
  const lease = ledger.acquire(deliveryScope, 'worker_gate', 1_000);
  assert.ok('leaseEpoch' in lease);
  const committed = ledger.commit(deliveryScope, 'worker_gate', lease.leaseEpoch, 'a'.repeat(64));
  const duplicate = ledger.commit(deliveryScope, 'worker_gate', lease.leaseEpoch, 'a'.repeat(64));
  assert.equal(committed.idempotent, false);
  assert.equal(duplicate.idempotent, true);
  const expiredScope = { ...scope, taskId: 'task_2', attemptId: 'attempt_2' };
  const expiringLease = ledger.acquire(expiredScope, 'worker_gate', 1_000);
  assert.ok('leaseEpoch' in expiringLease);
  nowMs += 1_001;
  assert.throws(() => ledger.commit(expiredScope, 'worker_gate', expiringLease.leaseEpoch));
  checks.idempotentCommitAndLeaseExpiry = true;

  // Control chaos-lite: an in-flight delivery drains to PAUSED and subsequent dispatch is blocked.
  const controls = new JobControlRegistry(clock);
  controls.initialize(scope);
  controls.admitDispatch(scope);
  controls.requestPause(scope);
  const paused = controls.settleDelivery(scope);
  assert.equal(paused.status, 'PAUSED');
  assert.equal(paused.dispatchAllowed, false);
  assert.throws(() => controls.admitDispatch(scope));
  checks.gracefulDrainBlocksDispatch = true;

  // Reconnect load: event storage is bounded while latest sequence and delta cursor remain correct.
  const progress = new JobProgressEventRegistry(clock);
  for (let sequence = 1; sequence <= 1_005; sequence += 1) {
    progress.emit(scope, { type: 'TASK_PROGRESS', completedTaskCount: sequence, totalTaskCount: 2_000 });
  }
  const reconnect = progress.snapshot(scope, 1_000);
  assert.equal(reconnect.lastSequence, 1_005);
  assert.equal(reconnect.recentEvents.length, 5);
  assert.equal(reconnect.recentEvents[0]?.sequence, 1_001);
  checks.boundedReconnectProjection = true;

  // Reconciliation remains read-only and reports observed inconsistencies.
  const history = new RunAttemptHistoryProjection(clock);
  history.recordRun(scope, { runId: 'run_gate', status: 'RUNNING', recordedAt: clock().toISOString() });
  history.appendAttempt(scope, 'run_gate', { attemptId: 'attempt_1', taskId: 'task_1', attemptNo: 1, status: 'SUCCEEDED', recordedAt: clock().toISOString() });
  const reconciliation = history.reconcile(scope, {
    plannedTaskIds: ['task_1', 'task_missing'],
    persistedTaskIds: ['task_1'],
    queuedTaskIds: ['task_queue_orphan'],
    dispatchPendingTaskIds: ['task_pending'],
    activeLeases: [{ taskId: 'task_orphan', leaseEpoch: 1, expiresAt: '2026-08-27T00:00:00.000Z' }],
    unpublishedOutboxTaskIds: ['task_outbox'],
    jobStatus: 'COMPLETED'
  });
  assert.equal(reconciliation.dryRun, true);
  assert.equal(reconciliation.repairAllowed, false);
  assert.ok(reconciliation.findings.some((finding) => finding.code === 'QUEUE_TASK_WITHOUT_PERSISTED_RECORD'));
  assert.ok(reconciliation.findings.some((finding) => finding.code === 'TERMINAL_JOB_WITH_ACTIVE_LEASE'));
  checks.readOnlyReconciliation = true;

  // DLQ policy: approved transient record is idempotent; anti-bot records cannot be replayed.
  const dlq = new DlqRecoveryRegistry(clock);
  const transient = {
    deadLetterId: 'dlq_transient', originalMessageId: 'message_transient', messageType: 'task.execute' as const,
    taskId: 'task_1', attemptId: 'attempt_1', failureClass: 'TRANSIENT' as const, failureCode: 'UPSTREAM_TIMEOUT', failedAt: clock().toISOString()
  };
  dlq.register(scope, transient);
  const approval = { operatorId: 'operator_gate', reasonCode: 'RECOVERY_REVIEWED', approvedAt: clock().toISOString() };
  const firstIntent = dlq.createReplayIntent(scope, transient.deadLetterId, approval);
  const secondIntent = dlq.createReplayIntent(scope, transient.deadLetterId, approval);
  assert.equal(firstIntent.replayId, secondIntent.replayId);
  assert.equal(firstIntent.dispatchAllowed, false);
  dlq.register(scope, { ...transient, deadLetterId: 'dlq_challenge', originalMessageId: 'message_challenge', failureClass: 'ANTI_BOT' });
  assert.throws(() => dlq.createReplayIntent(scope, 'dlq_challenge', approval), DlqRecoveryError);
  checks.approvalGatedDlqReplay = true;

  console.log(JSON.stringify({
    gate: 'P09-T08',
    status: 'PASS',
    checks,
    boundedTaskCount: graph.taskIds.length,
    retainedProgressEvents: reconnect.recentEvents.length,
    reconciliationFindingCount: reconciliation.findings.length,
    note: 'deterministic process-local contract smoke; no network, DB, Redis/BullMQ, queue, storage or provider side effects'
  }, null, 2));
}

await main();
