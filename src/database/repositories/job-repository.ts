import { createHash } from 'node:crypto';

import type { Database } from '../client.js';
import type { SchemaRecord } from './schema-repository.js';
import type { TargetRecord } from './target-repository.js';

export type JobStatus =
  | 'CREATED'
  | 'DISPATCH_PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'EXTRACTING'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'FAILED'
  | 'RETRYING'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED';

export type JobRecord = {
  id: string;
  tenantId: string;
  projectId: string;
  targetId: string;
  schemaId: string;
  status: JobStatus;
  triggerType: 'MANUAL' | 'SCHEDULED' | 'API' | 'RETRY';
  input: Record<string, unknown>;
  targetSnapshot: Record<string, unknown>;
  schemaSnapshot: Record<string, unknown>;
  strategySnapshot: Record<string, unknown>;
  progress: Record<string, unknown>;
  qualitySummary: Record<string, unknown>;
  costSummary: Record<string, unknown>;
  createdBy: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type CreateJobInput = {
  id: string;
  tenantId: string;
  projectId: string;
  targetId: string;
  schemaId: string;
  triggerType: JobRecord['triggerType'];
  input: Record<string, unknown>;
  targetSnapshot: TargetRecord;
  schemaSnapshot: SchemaRecord;
  createdBy: string;
  idempotencyKey: string;
  requestHash: string;
  correlationId: string;
};

export type JobCommandResult = {
  job: JobRecord;
  replayed: boolean;
};

export type JobStateCommandResult = {
  job: JobRecord;
  replayed: boolean;
  transitioned: boolean;
};

export class IdempotencyConflictError extends Error {
  public constructor() {
    super('Idempotency key was already used with a different request.');
    this.name = 'IdempotencyConflictError';
  }
}

type JobRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  target_id: string;
  schema_id: string;
  status: JobStatus;
  trigger_type: JobRecord['triggerType'];
  input_json: Record<string, unknown>;
  target_snapshot_json: Record<string, unknown>;
  schema_snapshot_json: Record<string, unknown>;
  strategy_snapshot_json: Record<string, unknown>;
  progress_json: Record<string, unknown>;
  quality_summary_json: Record<string, unknown>;
  cost_summary_json: Record<string, unknown>;
  created_by: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
};

function toJobRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    targetId: row.target_id,
    schemaId: row.schema_id,
    status: row.status,
    triggerType: row.trigger_type,
    input: row.input_json,
    targetSnapshot: row.target_snapshot_json,
    schemaSnapshot: row.schema_snapshot_json,
    strategySnapshot: row.strategy_snapshot_json,
    progress: row.progress_json,
    qualitySummary: row.quality_summary_json,
    costSummary: row.cost_summary_json,
    createdBy: row.created_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  };
}

const JOB_FIELDS = `
  id, tenant_id, project_id, target_id, schema_id, status, trigger_type,
  input_json, target_snapshot_json, schema_snapshot_json, strategy_snapshot_json,
  progress_json, quality_summary_json, cost_summary_json, created_by,
  created_at, started_at, finished_at
`;

function snapshotTarget(target: TargetRecord): Record<string, unknown> {
  return {
    id: target.id,
    projectId: target.projectId,
    name: target.name,
    seedUrl: target.seedUrl,
    host: target.host,
    allowedHosts: target.allowedHosts,
    allowedPorts: target.allowedPorts,
    executionPolicy: target.executionPolicy,
    crawlPolicy: target.crawlPolicy,
    accessPolicy: target.accessPolicy
  };
}

function snapshotSchema(schema: SchemaRecord): Record<string, unknown> {
  return {
    id: schema.id,
    projectId: schema.projectId,
    name: schema.name,
    version: schema.version,
    definition: schema.definition
  };
}

export function hashJobRequest(input: {
  projectId: string;
  targetId: string;
  schemaId: string;
  triggerType: JobRecord['triggerType'];
  jobInput: Record<string, unknown>;
}): string {
  return createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');
}

export class JobRepository {
  public constructor(private readonly database: Database) {}

  public async create(input: CreateJobInput): Promise<JobCommandResult> {
    return this.database.withTransaction(async (client) => {
      const idempotencyInsert = await client.query<{ resource_id: string | null }>(
        `
          INSERT INTO idempotency_keys (
            tenant_id, scope, idempotency_key, request_hash, status, resource_type, expires_at
          ) VALUES ($1, 'job.create', $2, $3, 'IN_PROGRESS', 'job', NOW() + INTERVAL '24 hours')
          ON CONFLICT (tenant_id, scope, idempotency_key) DO NOTHING
          RETURNING resource_id
        `,
        [input.tenantId, input.idempotencyKey, input.requestHash]
      );

      if (idempotencyInsert.rowCount === 0) {
        const existing = await client.query<{ request_hash: string; resource_id: string | null }>(
          `
            SELECT request_hash, resource_id
            FROM idempotency_keys
            WHERE tenant_id = $1 AND scope = 'job.create' AND idempotency_key = $2
          `,
          [input.tenantId, input.idempotencyKey]
        );
        const existingRow = existing.rows[0];

        if (!existingRow || existingRow.request_hash !== input.requestHash || !existingRow.resource_id) {
          throw new IdempotencyConflictError();
        }

        const replay = await client.query<JobRow>(
          `SELECT ${JOB_FIELDS} FROM jobs WHERE tenant_id = $1 AND id = $2`,
          [input.tenantId, existingRow.resource_id]
        );
        const replayRow = replay.rows[0];
        if (!replayRow) {
          throw new Error('Idempotency record references a missing job.');
        }

        return { job: toJobRecord(replayRow), replayed: true };
      }

      const jobResult = await client.query<JobRow>(
        `
          INSERT INTO jobs (
            id, tenant_id, project_id, target_id, schema_id, status, trigger_type,
            input_json, target_snapshot_json, schema_snapshot_json, strategy_snapshot_json,
            progress_json, quality_summary_json, cost_summary_json, created_by
          ) VALUES ($1, $2, $3, $4, $5, 'DISPATCH_PENDING', $6, $7::jsonb, $8::jsonb, $9::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, $10)
          RETURNING ${JOB_FIELDS}
        `,
        [
          input.id,
          input.tenantId,
          input.projectId,
          input.targetId,
          input.schemaId,
          input.triggerType,
          JSON.stringify(input.input),
          JSON.stringify(snapshotTarget(input.targetSnapshot)),
          JSON.stringify(snapshotSchema(input.schemaSnapshot)),
          input.createdBy
        ]
      );

      await client.query(
        `
          INSERT INTO runs (id, tenant_id, job_id, sequence_no, status)
          VALUES ($1, $2, $3, 1, 'CREATED')
        `,
        [`run_${input.id}`, input.tenantId, input.id]
      );

      await client.query(
        `
          INSERT INTO outbox_events (
            id, tenant_id, aggregate_type, aggregate_id, message_type, schema_version,
            payload_json, correlation_id, status
          ) VALUES ($1, $2, 'job', $3, 'job.create', 1, $4::jsonb, $5, 'PENDING')
        `,
        [
          `outbox_${input.id}`,
          input.tenantId,
          input.id,
          JSON.stringify({
            jobId: input.id,
            projectId: input.projectId,
            targetId: input.targetId,
            schemaId: input.schemaId,
            triggerType: input.triggerType
          }),
          input.correlationId
        ]
      );

      await client.query(
        `
          UPDATE idempotency_keys
          SET status = 'COMPLETED', resource_id = $3, response_status = 202
          WHERE tenant_id = $1 AND scope = 'job.create' AND idempotency_key = $2
        `,
        [input.tenantId, input.idempotencyKey, input.id]
      );

      const row = jobResult.rows[0];
      if (!row) {
        throw new Error('Job insert returned no row.');
      }

      return { job: toJobRecord(row), replayed: false };
    });
  }

  public async findById(tenantId: string, jobId: string): Promise<JobRecord | null> {
    const result = await this.database.query<JobRow>(
      `SELECT ${JOB_FIELDS} FROM jobs WHERE tenant_id = $1 AND id = $2`,
      [tenantId, jobId]
    );
    const row = result.rows[0];
    return row ? toJobRecord(row) : null;
  }

  public async requestCancel(
    tenantId: string,
    jobId: string,
    correlationId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<JobStateCommandResult | null> {
    return this.commandTransition(tenantId, jobId, 'CANCEL_REQUESTED', 'job.cancel', correlationId, idempotencyKey, requestHash, [
      'DISPATCH_PENDING',
      'QUEUED',
      'RUNNING',
      'EXTRACTING',
      'VALIDATING',
      'RETRYING'
    ]);
  }

  public async requestRetry(
    tenantId: string,
    jobId: string,
    correlationId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<JobStateCommandResult | null> {
    return this.commandTransition(tenantId, jobId, 'RETRYING', 'job.retry', correlationId, idempotencyKey, requestHash, [
      'FAILED',
      'COMPLETED_WITH_ERRORS'
    ]);
  }

  private async commandTransition(
    tenantId: string,
    jobId: string,
    nextStatus: JobStatus,
    messageType: 'job.cancel' | 'job.retry',
    correlationId: string,
    idempotencyKey: string,
    requestHash: string,
    allowedStatuses: JobStatus[]
  ): Promise<JobStateCommandResult | null> {
    return this.database.withTransaction(async (client) => {
      const idempotencyInsert = await client.query<{ resource_id: string | null }>(
        `
          INSERT INTO idempotency_keys (
            tenant_id, scope, idempotency_key, request_hash, status, resource_type, expires_at
          ) VALUES ($1, $2, $3, $4, 'IN_PROGRESS', 'job', NOW() + INTERVAL '24 hours')
          ON CONFLICT (tenant_id, scope, idempotency_key) DO NOTHING
          RETURNING resource_id
        `,
        [tenantId, messageType, idempotencyKey, requestHash]
      );

      if (idempotencyInsert.rowCount === 0) {
        const existingIdempotency = await client.query<{
          request_hash: string;
          resource_id: string | null;
          status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
          response_status: number | null;
        }>(
          `
            SELECT request_hash, resource_id, status, response_status
            FROM idempotency_keys
            WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3
          `,
          [tenantId, messageType, idempotencyKey]
        );
        const existingIdempotencyRow = existingIdempotency.rows[0];

        if (!existingIdempotencyRow || existingIdempotencyRow.request_hash !== requestHash) {
          throw new IdempotencyConflictError();
        }

        if (existingIdempotencyRow.status === 'FAILED' && existingIdempotencyRow.response_status === 404 && !existingIdempotencyRow.resource_id) {
          return null;
        }

        if (!existingIdempotencyRow.resource_id) {
          throw new IdempotencyConflictError();
        }

        const replay = await client.query<JobRow>(
          `SELECT ${JOB_FIELDS} FROM jobs WHERE tenant_id = $1 AND id = $2`,
          [tenantId, existingIdempotencyRow.resource_id]
        );
        const replayRow = replay.rows[0];
        if (!replayRow) {
          throw new Error('Idempotency record references a missing job.');
        }

        return {
          job: toJobRecord(replayRow),
          replayed: true,
          transitioned: existingIdempotencyRow.response_status === 202
        };
      }

      const result = await client.query<JobRow>(
        `
          UPDATE jobs
          SET status = $3, updated_at = NOW()
          WHERE tenant_id = $1 AND id = $2 AND status = ANY($4::text[])
          RETURNING ${JOB_FIELDS}
        `,
        [tenantId, jobId, nextStatus, allowedStatuses]
      );
      const row = result.rows[0];

      if (!row) {
        const existing = await client.query<JobRow>(
          `SELECT ${JOB_FIELDS} FROM jobs WHERE tenant_id = $1 AND id = $2`,
          [tenantId, jobId]
        );
        const existingRow = existing.rows[0];
        if (!existingRow) {
          await client.query(
            `
              UPDATE idempotency_keys
              SET status = 'FAILED', response_status = 404
              WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3
            `,
            [tenantId, messageType, idempotencyKey]
          );
          return null;
        }

        await client.query(
          `
            UPDATE idempotency_keys
            SET status = 'FAILED', resource_id = $4, response_status = 409
            WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3
          `,
          [tenantId, messageType, idempotencyKey, jobId]
        );
        return { job: toJobRecord(existingRow), replayed: false, transitioned: false };
      }

      await client.query(
        `
          INSERT INTO outbox_events (
            id, tenant_id, aggregate_type, aggregate_id, message_type, schema_version,
            payload_json, correlation_id, status
          ) VALUES ($1, $2, 'job', $3, $4, 1, $5::jsonb, $6, 'PENDING')
          ON CONFLICT (id) DO NOTHING
        `,
        [
          `outbox_${messageType.replace('.', '_')}_${jobId}_${requestHash.slice(0, 16)}`,
          tenantId,
          jobId,
          messageType,
          JSON.stringify({ jobId, requestedStatus: nextStatus }),
          correlationId
        ]
      );

      await client.query(
        `
          UPDATE idempotency_keys
          SET status = 'COMPLETED', resource_id = $4, response_status = 202
          WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3
        `,
        [tenantId, messageType, idempotencyKey, jobId]
      );

      return { job: toJobRecord(row), replayed: false, transitioned: true };
    });
  }
}
