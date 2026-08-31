import type { Database } from '../client.js';

export type OutboxStatus = 'PENDING' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';

export type OutboxRecord = {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  messageType: string;
  schemaVersion: number;
  payload: unknown;
  correlationId: string;
  causationId: string | null;
  status: OutboxStatus;
  attempts: number;
  availableAt: Date;
  claimedAt: Date | null;
  publishedAt: Date | null;
  lastErrorCode: string | null;
  createdAt: Date;
};

type OutboxRow = {
  id: string;
  tenant_id: string;
  aggregate_type: string;
  aggregate_id: string;
  message_type: string;
  schema_version: number;
  payload_json: unknown;
  correlation_id: string;
  causation_id: string | null;
  status: OutboxStatus;
  attempts: number;
  available_at: Date;
  claimed_at: Date | null;
  published_at: Date | null;
  last_error_code: string | null;
  created_at: Date;
};

function toOutboxRecord(row: OutboxRow): OutboxRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    messageType: row.message_type,
    schemaVersion: row.schema_version,
    payload: row.payload_json,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    status: row.status,
    attempts: row.attempts,
    availableAt: row.available_at,
    claimedAt: row.claimed_at,
    publishedAt: row.published_at,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at
  };
}

const OUTBOX_FIELDS = `
  id, tenant_id, aggregate_type, aggregate_id, message_type, schema_version,
  payload_json, correlation_id, causation_id, status, attempts, available_at,
  claimed_at, published_at, last_error_code, created_at
`;

export class OutboxRepository {
  public constructor(private readonly database: Database) {}

  public async listPendingIds(limit = 50): Promise<string[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 500);
    const result = await this.database.query<{ id: string }>(
      `
        SELECT id
        FROM outbox_events
        WHERE status = 'PENDING' AND available_at <= NOW()
        ORDER BY available_at ASC, created_at ASC, id ASC
        LIMIT $1
      `,
      [boundedLimit]
    );

    return result.rows.map((row) => row.id);
  }

  public async claim(id: string): Promise<OutboxRecord | null> {
    const result = await this.database.query<OutboxRow>(
      `
        UPDATE outbox_events
        SET status = 'PUBLISHING', attempts = attempts + 1, claimed_at = NOW()
        WHERE id = $1 AND status = 'PENDING' AND available_at <= NOW()
        RETURNING ${OUTBOX_FIELDS}
      `,
      [id]
    );

    const row = result.rows[0];
    return row ? toOutboxRecord(row) : null;
  }

  public async markPublished(id: string): Promise<void> {
    await this.database.query(
      `
        UPDATE outbox_events
        SET status = 'PUBLISHED', published_at = NOW(), claimed_at = NULL
        WHERE id = $1 AND status = 'PUBLISHING'
      `,
      [id]
    );
  }

  public async markFailed(id: string, errorCode: string, retryAt: Date): Promise<void> {
    await this.database.query(
      `
        UPDATE outbox_events
        SET status = 'PENDING', available_at = $2, claimed_at = NULL, last_error_code = $3
        WHERE id = $1 AND status = 'PUBLISHING'
      `,
      [id, retryAt, errorCode]
    );
  }

  public async requeueStalePublishing(staleBefore: Date): Promise<number> {
    const result = await this.database.query<{ id: string }>(
      `
        UPDATE outbox_events
        SET status = 'PENDING', available_at = NOW(), claimed_at = NULL,
            last_error_code = 'OUTBOX_PUBLISHER_LOST'
        WHERE status = 'PUBLISHING' AND claimed_at < $1
        RETURNING id
      `,
      [staleBefore]
    );

    return result.rowCount ?? 0;
  }
}
