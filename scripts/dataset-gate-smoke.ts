import assert from 'node:assert/strict';

import { DatasetDedupeUpsertRegistry } from '../src/dataset/dedupe-upsert.js';
import { evaluateDatasetDeliveryCapability } from '../src/dataset/delivery-capabilities.js';
import { streamDatasetExport } from '../src/dataset/export-adapters.js';
import { DATASET_MODEL_CONTRACT_VERSION, DatasetModelRegistry } from '../src/dataset/model.js';
import { DatasetRetentionGovernanceRegistry } from '../src/dataset/retention-governance.js';
import { DATASET_STAGING_TRANSACTION_VERSION, DatasetStagingTransactionRegistry } from '../src/dataset/staging-transaction.js';

const scope = { tenantId: 'tenant_dataset_gate', projectId: 'project_dataset_gate' };
const now = '2026-08-27T00:00:00.000Z';

async function main(): Promise<void> {
  const checks: Record<string, boolean> = {};
  const models = new DatasetModelRegistry();
  models.createDataset(scope, { contractVersion: DATASET_MODEL_CONTRACT_VERSION, datasetId: 'dataset_gate', name: 'catalog', createdAt: now });
  const version = models.createVersion(scope, {
    contractVersion: DATASET_MODEL_CONTRACT_VERSION,
    datasetId: 'dataset_gate',
    source: {
      sourceJobId: 'job_gate',
      schema: { schemaId: 'schema_gate', schemaName: 'product', schemaVersion: 1, schemaFingerprintSha256: 'a'.repeat(64) },
      plan: { planId: 'plan_gate', planVersion: 1, planFingerprintSha256: 'b'.repeat(64) },
      boundAt: now
    },
    createdAt: now
  });
  assert.equal(version.versionNumber, 1);
  assert.equal(version.source.sourceJobId, 'job_gate');
  assert.equal(version.source.schema.schemaFingerprintSha256, 'a'.repeat(64));
  assert.equal(version.source.plan.planFingerprintSha256, 'b'.repeat(64));
  checks.immutableSourceLineage = true;

  const dedupe = new DatasetDedupeUpsertRegistry();
  dedupe.bindDatasetVersion(scope, { datasetVersionId: version.datasetVersionId, sourceJobId: 'job_gate', boundAt: now });
  const recordInput = {
    contractVersion: 'dataset-dedupe-upsert/v1' as const,
    datasetVersionId: version.datasetVersionId,
    incomingRecordId: 'incoming_gate_1',
    dedupeKeyFingerprintSha256: 'c'.repeat(64),
    recordChecksumSha256: 'd'.repeat(64),
    sourceJobId: 'job_gate', sourceTaskId: 'task_gate_1', sourceAttemptId: 'attempt_gate_1', artifactChecksumSha256: 'e'.repeat(64), sourceSequence: 1, observedAt: now
  };
  const first = dedupe.upsert(scope, recordInput);
  const repeated = dedupe.upsert(scope, recordInput);
  const updated = dedupe.upsert(scope, { ...recordInput, incomingRecordId: 'incoming_gate_2', recordChecksumSha256: 'f'.repeat(64), sourceTaskId: 'task_gate_2', sourceAttemptId: 'attempt_gate_2', artifactChecksumSha256: '0'.repeat(64), sourceSequence: 2 });
  assert.equal(first.action, 'INSERTED');
  assert.equal(repeated.action, 'IDEMPOTENT');
  assert.equal(updated.action, 'UPDATED');
  assert.equal(updated.record.mergedRecordId, first.record.mergedRecordId);
  assert.equal(updated.record.revision, 2);
  checks.deterministicDedupeAndLineage = true;

  const staging = new DatasetStagingTransactionRegistry();
  staging.open(scope, { contractVersion: DATASET_STAGING_TRANSACTION_VERSION, transactionId: 'transaction_gate', datasetVersionId: version.datasetVersionId, openedAt: now });
  staging.stage(scope, 'transaction_gate', { recordId: 'record_gate_1', datasetVersionId: version.datasetVersionId, recordChecksumSha256: 'f'.repeat(64), stagedAt: now });
  staging.stage(scope, 'transaction_gate', { recordId: 'record_gate_2', datasetVersionId: version.datasetVersionId, recordChecksumSha256: '1'.repeat(64), stagedAt: now });
  assert.deepEqual(staging.visibleRecords(scope, 'transaction_gate'), []);
  const published = staging.publish(scope, 'transaction_gate', '2026-08-27T00:01:00.000Z');
  assert.equal(published.visibility, 'ATOMIC_VISIBLE');
  assert.equal(staging.visibleRecords(scope, 'transaction_gate').length, 2);
  checks.atomicPublishVisibility = true;

  async function* records() {
    yield { name: 'first', price: 10, active: true };
    yield { name: 'second, "quoted"', price: 20, active: false };
  }
  const exportRequest = { exportId: 'export_gate', scope, datasetVersionId: version.datasetVersionId, columns: ['name', 'price', 'active'], maxRecords: 10 };
  const json = await collect(streamDatasetExport({ ...exportRequest, format: 'JSON' }, records()));
  const jsonl = await collect(streamDatasetExport({ ...exportRequest, format: 'JSONL' }, records()));
  const csv = await collect(streamDatasetExport({ ...exportRequest, format: 'CSV' }, records()));
  assert.equal(JSON.parse(json).length, 2);
  assert.equal(jsonl.trim().split('\n').length, 2);
  assert.ok(csv.includes('"second, ""quoted"""'));
  checks.formatStreaming = true;

  const retention = new DatasetRetentionGovernanceRegistry();
  retention.configurePolicy(scope, { retentionDays: 30, configuredAt: now });
  retention.registerSubject(scope, { datasetVersionId: version.datasetVersionId, retentionStartedAt: '2026-01-01T00:00:00.000Z' });
  retention.applyLegalHold(scope, { holdId: 'hold_gate', datasetVersionId: version.datasetVersionId, reasonCode: 'LEGAL_REVIEW', appliedAt: now });
  const review = { deletionId: 'deletion_gate', datasetVersionId: version.datasetVersionId, reviewedAt: now, authorization: { ...scope, permissions: ['dataset:delete'] as const } };
  assert.equal(retention.reviewDeletion(scope, review, new Date('2026-03-01T00:00:00.000Z')).reason, 'LEGAL_HOLD_ACTIVE');
  retention.releaseLegalHold(scope, version.datasetVersionId, 'hold_gate', '2026-03-01T00:01:00.000Z', 'REVIEW_COMPLETE');
  const intent = retention.reviewDeletion(scope, review, new Date('2026-03-01T00:02:00.000Z'));
  assert.equal(intent.status, 'DELETION_INTENT_READY');
  assert.equal(intent.allowDestructiveAction, false);
  checks.legalHoldBlocksNonDestructiveDeletion = true;

  const delivery = evaluateDatasetDeliveryCapability({
    contractVersion: 'dataset-delivery/v1', deliveryId: 'delivery_gate', scope, datasetVersionId: version.datasetVersionId, datasetVersionStatus: 'PUBLISHED', kind: 'S3', authorization: { ...scope, permissions: ['dataset:export'] }, storageBindingId: 'binding_gate'
  }, { parquetEnabled: true, apiReadEnabled: true, s3DeliveryEnabled: true });
  assert.equal(delivery.status, 'INTENT_READY');
  assert.equal(delivery.allowExternalDelivery, false);
  assert.equal(delivery.allowWorkerAction, false);
  checks.exportControlNonDelivery = true;

  console.log(JSON.stringify({
    gate: 'P11-T08',
    status: 'PASS',
    checks,
    stagedRecordCount: published.stagedRecordCount,
    exportedRecordCount: JSON.parse(json).length,
    note: 'deterministic process-local contract smoke; no database/storage/network/S3/API/queue/worker delivery, actual deletion, or external provider side effects'
  }, null, 2));
}

async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let output = '';
  for await (const chunk of chunks) output += chunk;
  return output;
}

await main();
