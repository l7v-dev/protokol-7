import { createHash } from 'node:crypto';

export type TaskDeliveryScope = {
  tenantId: string;
  jobId: string;
  taskId: string;
  attemptId: string;
};

export type TaskDeliveryLease = {
  deliveryId: string;
  idempotencyKey: string;
  ownerId: string;
  leaseEpoch: number;
  expiresAt: string;
};

export type TaskCommitReceipt = {
  deliveryId: string;
  idempotencyKey: string;
  committedAt: string;
  resultChecksumSha256?: string;
  idempotent: boolean;
};

export type DeliveryAuditEvent = {
  type: 'LEASE_ACQUIRED' | 'HEARTBEAT' | 'LEASE_RECLAIMED' | 'RESULT_COMMITTED' | 'COMMIT_IDEMPOTENT';
  deliveryId: string;
  idempotencyKey: string;
  tenantId: string;
  jobId: string;
  taskId: string;
  attemptId: string;
  leaseEpoch: number;
  occurredAt: string;
};

type StoredDelivery = {
  scope: TaskDeliveryScope;
  deliveryId: string;
  idempotencyKey: string;
  ownerId?: string;
  leaseEpoch: number;
  expiresAt?: Date;
  committedAt?: Date;
  resultChecksumSha256?: string;
};

export class DeliveryLedgerError extends Error {
  public constructor(public readonly code: 'DELIVERY_INVALID' | 'LEASE_CONFLICT' | 'LEASE_EXPIRED' | 'DELIVERY_SCOPE_MISMATCH', message: string) {
    super(message);
    this.name = 'DeliveryLedgerError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const LEASE_MIN_MS = 1_000;
const LEASE_MAX_MS = 10 * 60_000;

/**
 * Process-local reference for at-least-once delivery semantics. It does not
 * publish/consume queue messages or provide durable distributed leases.
 */
export class TaskDeliveryLedger {
  private readonly deliveries = new Map<string, StoredDelivery>();
  private readonly audit: DeliveryAuditEvent[] = [];

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public acquire(scope: TaskDeliveryScope, ownerId: string, leaseDurationMs: number): TaskDeliveryLease | TaskCommitReceipt {
    validateScope(scope);
    validateOwnerAndDuration(ownerId, leaseDurationMs);
    const idempotencyKey = deliveryKey(scope);
    const existing = this.deliveries.get(idempotencyKey);
    if (existing?.committedAt) return receipt(existing, true);
    const now = this.now();
    if (existing?.expiresAt && existing.expiresAt.getTime() > now.getTime()) {
      throw new DeliveryLedgerError('LEASE_CONFLICT', 'Task delivery aktif bir worker lease altında.');
    }
    const next: StoredDelivery = existing ?? {
      scope: { ...scope },
      deliveryId: `delivery_${idempotencyKey.slice(0, 24)}`,
      idempotencyKey,
      leaseEpoch: 0
    };
    next.ownerId = ownerId;
    next.leaseEpoch += 1;
    next.expiresAt = new Date(now.getTime() + leaseDurationMs);
    this.deliveries.set(idempotencyKey, next);
    this.record(existing ? 'LEASE_RECLAIMED' : 'LEASE_ACQUIRED', next);
    return lease(next);
  }

  public heartbeat(scope: TaskDeliveryScope, ownerId: string, leaseEpoch: number, leaseDurationMs: number): TaskDeliveryLease {
    const delivery = this.requireActive(scope, ownerId, leaseEpoch);
    validateOwnerAndDuration(ownerId, leaseDurationMs);
    delivery.expiresAt = new Date(this.now().getTime() + leaseDurationMs);
    this.record('HEARTBEAT', delivery);
    return lease(delivery);
  }

  public commit(scope: TaskDeliveryScope, ownerId: string, leaseEpoch: number, resultChecksumSha256?: string): TaskCommitReceipt {
    validateScope(scope);
    if (!SAFE_ID.test(ownerId) || !Number.isInteger(leaseEpoch) || leaseEpoch < 1 || resultChecksumSha256 !== undefined && !/^[a-f0-9]{64}$/i.test(resultChecksumSha256)) {
      throw new DeliveryLedgerError('DELIVERY_INVALID', 'Task delivery commit input geçerli değil.');
    }
    const key = deliveryKey(scope);
    const delivery = this.deliveries.get(key);
    if (!delivery) throw new DeliveryLedgerError('DELIVERY_SCOPE_MISMATCH', 'Task delivery scope bulunamadı.');
    if (delivery.committedAt) {
      if (delivery.resultChecksumSha256 !== resultChecksumSha256) throw new DeliveryLedgerError('DELIVERY_SCOPE_MISMATCH', 'Idempotent task result checksum eşleşmiyor.');
      this.record('COMMIT_IDEMPOTENT', delivery);
      return receipt(delivery, true);
    }
    this.assertOwnerAndLiveLease(delivery, ownerId, leaseEpoch);
    delivery.committedAt = this.now();
    if (resultChecksumSha256 === undefined) delete delivery.resultChecksumSha256;
    else delivery.resultChecksumSha256 = resultChecksumSha256;
    delete delivery.ownerId;
    delete delivery.expiresAt;
    this.record('RESULT_COMMITTED', delivery);
    return receipt(delivery, false);
  }

  public auditEvents(scope: TaskDeliveryScope): ReadonlyArray<DeliveryAuditEvent> {
    validateScope(scope);
    const key = deliveryKey(scope);
    return this.audit.filter((event) => event.idempotencyKey === key).map((event) => ({ ...event }));
  }

  private requireActive(scope: TaskDeliveryScope, ownerId: string, leaseEpoch: number): StoredDelivery {
    validateScope(scope);
    if (!SAFE_ID.test(ownerId) || !Number.isInteger(leaseEpoch) || leaseEpoch < 1) {
      throw new DeliveryLedgerError('DELIVERY_INVALID', 'Task delivery lease input geçerli değil.');
    }
    const delivery = this.deliveries.get(deliveryKey(scope));
    if (!delivery) throw new DeliveryLedgerError('DELIVERY_SCOPE_MISMATCH', 'Task delivery scope bulunamadı.');
    this.assertOwnerAndLiveLease(delivery, ownerId, leaseEpoch);
    return delivery;
  }

  private assertOwnerAndLiveLease(delivery: StoredDelivery, ownerId: string, leaseEpoch: number): void {
    if (delivery.ownerId !== ownerId || delivery.leaseEpoch !== leaseEpoch) {
      throw new DeliveryLedgerError('LEASE_CONFLICT', 'Task delivery lease owner veya epoch eşleşmiyor.');
    }
    if (!delivery.expiresAt || delivery.expiresAt.getTime() <= this.now().getTime()) {
      throw new DeliveryLedgerError('LEASE_EXPIRED', 'Task delivery lease süresi dolmuş.');
    }
  }

  private record(type: DeliveryAuditEvent['type'], delivery: StoredDelivery): void {
    this.audit.push({
      type,
      deliveryId: delivery.deliveryId,
      idempotencyKey: delivery.idempotencyKey,
      tenantId: delivery.scope.tenantId,
      jobId: delivery.scope.jobId,
      taskId: delivery.scope.taskId,
      attemptId: delivery.scope.attemptId,
      leaseEpoch: delivery.leaseEpoch,
      occurredAt: this.now().toISOString()
    });
  }
}

function validateScope(scope: TaskDeliveryScope): void {
  if (![scope.tenantId, scope.jobId, scope.taskId, scope.attemptId].every((value) => SAFE_ID.test(value))) {
    throw new DeliveryLedgerError('DELIVERY_INVALID', 'Task delivery scope geçerli değil.');
  }
}

function validateOwnerAndDuration(ownerId: string, leaseDurationMs: number): void {
  if (!SAFE_ID.test(ownerId) || !Number.isInteger(leaseDurationMs) || leaseDurationMs < LEASE_MIN_MS || leaseDurationMs > LEASE_MAX_MS) {
    throw new DeliveryLedgerError('DELIVERY_INVALID', 'Task delivery lease input geçerli değil.');
  }
}

function deliveryKey(scope: TaskDeliveryScope): string {
  return createHash('sha256').update(`${scope.tenantId}:${scope.jobId}:${scope.taskId}:${scope.attemptId}`).digest('hex');
}

function lease(delivery: StoredDelivery): TaskDeliveryLease {
  if (!delivery.ownerId || !delivery.expiresAt) throw new DeliveryLedgerError('LEASE_CONFLICT', 'Task delivery aktif lease içermiyor.');
  return { deliveryId: delivery.deliveryId, idempotencyKey: delivery.idempotencyKey, ownerId: delivery.ownerId, leaseEpoch: delivery.leaseEpoch, expiresAt: delivery.expiresAt.toISOString() };
}

function receipt(delivery: StoredDelivery, idempotent: boolean): TaskCommitReceipt {
  if (!delivery.committedAt) throw new DeliveryLedgerError('LEASE_CONFLICT', 'Task delivery henüz commit edilmedi.');
  return {
    deliveryId: delivery.deliveryId,
    idempotencyKey: delivery.idempotencyKey,
    committedAt: delivery.committedAt.toISOString(),
    ...(delivery.resultChecksumSha256 === undefined ? {} : { resultChecksumSha256: delivery.resultChecksumSha256 }),
    idempotent
  };
}
