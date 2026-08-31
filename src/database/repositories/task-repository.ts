import type { Database } from '../client.js';

export type TaskType = 'HTTP_FETCH' | 'BROWSER_FETCH' | 'CRAWL_DISCOVERY' | 'EXTRACT' | 'VALIDATE' | 'PUBLISH' | 'EXPORT';
export type TaskStatus = 'PENDING' | 'BLOCKED' | 'CLAIMED' | 'RUNNING' | 'SUCCEEDED' | 'RETRYABLE_FAILED' | 'FAILED' | 'TIMEOUT' | 'CANCEL_REQUESTED' | 'CANCELLED';

export type TaskRecord = {
  id: string;
  tenantId: string;
  jobId: string;
  runId: string;
  taskKey: string;
  taskType: TaskType;
  status: TaskStatus;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PlanInitialTaskInput = {
  taskId: string;
  attemptId: string;
  tenantId: string;
  jobId: string;
  runId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  correlationId: string;
};

type TaskRow = {
  id: string;
  tenant_id: string;
  job_id: string;
  run_id: string;
  task_key: string;
  task_type: TaskType;
  status: TaskStatus;
  payload_json: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  created_at: Date;
  updated_at: Date;
};

function toTaskRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jobId: row.job_id,
    runId: row.run_id,
    taskKey: row.task_key,
    taskType: row.task_type,
    status: row.status,
    payload: row.payload_json,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const TASK_FIELDS = `
  id, tenant_id, job_id, run_id, task_key, task_type, status,
  payload_json, attempt_count, max_attempts, created_at, updated_at
`;

export class TaskRepository {
  public constructor(private readonly database: Database) {}

  public async planInitialTask(input: PlanInitialTaskInput): Promise<TaskRecord> {
    return this.database.withTransaction(async (client) => {
      const taskResult = await client.query<TaskRow>(
        `
          INSERT INTO tasks (
            id, tenant_id, job_id, run_id, task_key, task_type, status, payload_json, max_attempts
          ) VALUES ($1, $2, $3, $4, 'initial-fetch', $5, 'PENDING', $6::jsonb, 3)
          ON CONFLICT (job_id, task_key) DO NOTHING
          RETURNING ${TASK_FIELDS}
        `,
        [
          input.taskId,
          input.tenantId,
          input.jobId,
          input.runId,
          input.taskType,
          JSON.stringify(input.payload)
        ]
      );

      let taskRow = taskResult.rows[0];
      if (!taskRow) {
        const existing = await client.query<TaskRow>(
          `SELECT ${TASK_FIELDS} FROM tasks WHERE tenant_id = $1 AND job_id = $2 AND task_key = 'initial-fetch'`,
          [input.tenantId, input.jobId]
        );
        taskRow = existing.rows[0];
      }

      if (!taskRow) {
        throw new Error('Initial task insert returned no row.');
      }

      await client.query(
        `
          INSERT INTO attempts (id, tenant_id, task_id, attempt_no, status)
          VALUES ($1, $2, $3, 1, 'CREATED')
          ON CONFLICT (task_id, attempt_no) DO NOTHING
        `,
        [input.attemptId, input.tenantId, taskRow.id]
      );

      await client.query(
        `
          UPDATE jobs
          SET status = 'QUEUED', updated_at = NOW()
          WHERE tenant_id = $1 AND id = $2 AND status IN ('CREATED', 'DISPATCH_PENDING', 'RETRYING')
        `,
        [input.tenantId, input.jobId]
      );

      if ((taskResult.rowCount ?? 0) > 0) {
        await client.query(
          `
            INSERT INTO outbox_events (
              id, tenant_id, aggregate_type, aggregate_id, message_type, schema_version,
              payload_json, correlation_id, status
            ) VALUES ($1, $2, 'task', $3, 'task.execute', 1, $4::jsonb, $5, 'PENDING')
            ON CONFLICT (id) DO NOTHING
          `,
          [
            `outbox_task_execute_${input.taskId}`,
            input.tenantId,
            input.taskId,
            JSON.stringify({
              jobId: input.jobId,
              runId: input.runId,
              taskId: input.taskId,
              attemptId: input.attemptId,
              taskType: input.taskType,
              payload: input.payload
            }),
            input.correlationId
          ]
        );
      }

      return toTaskRecord(taskRow);
    });
  }

  public async markSucceeded(tenantId: string, taskId: string, attemptId: string, resultRef: Record<string, unknown>): Promise<TaskRecord | null> {
    return this.database.withTransaction(async (client) => {
      const attempt = await client.query<{ id: string }>(
        `
          SELECT id
          FROM attempts
          WHERE tenant_id = $1 AND id = $2 AND task_id = $3
            AND status IN ('CREATED', 'CLAIMED', 'RUNNING')
        `,
        [tenantId, attemptId, taskId]
      );
      if (!attempt.rows[0]) {
        return null;
      }

      const result = await client.query<TaskRow>(
        `
          UPDATE tasks
          SET status = 'SUCCEEDED', updated_at = NOW()
          WHERE tenant_id = $1 AND id = $2 AND status IN ('RUNNING', 'CLAIMED', 'PENDING')
          RETURNING ${TASK_FIELDS}
        `,
        [tenantId, taskId]
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      await client.query(
        `
          UPDATE attempts
          SET status = 'SUCCEEDED', result_ref_json = $4::jsonb, finished_at = NOW()
          WHERE tenant_id = $1 AND id = $2 AND task_id = $3
            AND status IN ('CREATED', 'CLAIMED', 'RUNNING')
        `,
        [tenantId, attemptId, taskId, JSON.stringify(resultRef)]
      );

      await client.query(
        `
          UPDATE jobs
          SET status = 'COMPLETED', progress_json = '{"completed": 1, "total": 1}'::jsonb,
              finished_at = NOW(), updated_at = NOW()
          WHERE tenant_id = $1 AND id = $2 AND status NOT IN ('CANCELLED', 'COMPLETED')
        `,
        [tenantId, row.job_id]
      );

      return toTaskRecord(row);
    });
  }

  public async markFailed(tenantId: string, taskId: string, attemptId: string, errorCode: string, retryable: boolean): Promise<TaskRecord | null> {
    const nextStatus: TaskStatus = retryable ? 'RETRYABLE_FAILED' : 'FAILED';
    return this.database.withTransaction(async (client) => {
      const attempt = await client.query<{ id: string }>(
        `
          SELECT id
          FROM attempts
          WHERE tenant_id = $1 AND id = $2 AND task_id = $3
            AND status IN ('CREATED', 'CLAIMED', 'RUNNING')
        `,
        [tenantId, attemptId, taskId]
      );
      if (!attempt.rows[0]) {
        return null;
      }

      const result = await client.query<TaskRow>(
        `
          UPDATE tasks
          SET status = $3, updated_at = NOW()
          WHERE tenant_id = $1 AND id = $2 AND status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED')
          RETURNING ${TASK_FIELDS}
        `,
        [tenantId, taskId, nextStatus]
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      await client.query(
        `
          UPDATE attempts
          SET status = 'FAILED', error_code = $4, finished_at = NOW()
          WHERE tenant_id = $1 AND id = $2 AND task_id = $3
            AND status IN ('CREATED', 'CLAIMED', 'RUNNING')
        `,
        [tenantId, attemptId, taskId, errorCode]
      );

      if (!retryable) {
        await client.query(
          `
            UPDATE jobs
            SET status = 'FAILED', finished_at = NOW(), updated_at = NOW()
            WHERE tenant_id = $1 AND id = $2 AND status NOT IN ('CANCELLED', 'COMPLETED')
          `,
          [tenantId, row.job_id]
        );
      }

      return toTaskRecord(row);
    });
  }
}
