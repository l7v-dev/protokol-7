/**
 * Transactional Outbox Dispatcher — protokol-7
 *
 * Polls, claims, dispatches, and confirms published outbox events
 * adhering to at-least-once delivery and epoch fencing.
 */

import { randomUUID } from "node:crypto";
import type { LedgerRepository, OutboxEventRecord } from "../../../contracts/index.js";

export type OutboxEventHandler = (event: OutboxEventRecord) => Promise<void>;

export interface OutboxDispatcherOptions {
  repository: LedgerRepository;
  dispatcherId?: string;
  batchSize?: number;
  leaseSeconds?: number;
}

export class OutboxDispatcher {
  private readonly repo: LedgerRepository;
  private readonly dispatcherId: string;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private readonly handlers = new Map<string, OutboxEventHandler[]>();

  constructor(options: OutboxDispatcherOptions) {
    this.repo = options.repository;
    this.dispatcherId = options.dispatcherId || `dispatcher-${randomUUID().slice(0, 8)}`;
    this.batchSize = options.batchSize || 50;
    this.leaseSeconds = options.leaseSeconds || 60;
  }

  subscribe(eventType: string, handler: OutboxEventHandler): void {
    const list = this.handlers.get(eventType) || [];
    list.push(handler);
    this.handlers.set(eventType, list);
  }

  async dispatchOnce(): Promise<{ claimed: number; dispatched: number; failed: number }> {
    const events = await this.repo.claimOutboxEvents(
      this.dispatcherId,
      this.batchSize,
      this.leaseSeconds
    );

    let dispatched = 0;
    let failed = 0;

    for (const event of events) {
      try {
        const matchingHandlers = this.handlers.get(event.eventType) || [];
        const wildcardHandlers = this.handlers.get("*") || [];
        const allHandlers = [...matchingHandlers, ...wildcardHandlers];

        for (const handler of allHandlers) {
          await handler(event);
        }

        const published = await this.repo.markOutboxPublished(
          event.id,
          this.dispatcherId,
          event.dispatchEpoch
        );

        if (published) {
          dispatched += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
        // Event lease remains active until expiry; lease reaper will restore it for retry
      }
    }

    return {
      claimed: events.length,
      dispatched,
      failed,
    };
  }
}
