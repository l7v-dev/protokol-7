/**
 * Download Job Handler — protokol-7
 *
 * Fetches remote content using SSRF-guarded HTTP requests, commits immutable objects
 * to ObjectStore, computes SHA-256 receipts, and creates child extraction jobs.
 * Conforms to RFC 03 (Workers, Transaction and Control Plane).
 */

import { createHash } from "node:crypto";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher.js";
import { recordWorkerProvenance } from "../../storage/producer-provenance.js";
import { TerminalJobError } from "../task-worker.js";
import type { JobHandler, TaskExecutionContext, TaskExecutionResult } from "../types.js";

export interface DownloadJobInput {
  url: string;
  sourceId?: string;
  sourceRecordId?: string;
  container?: string;
  objectKey?: string;
  providerId?: string;
  nextOperation?: string;
  transformVersion?: string;
  allowLocalNetwork?: boolean;
}

export function createDownloadJobHandler(): JobHandler {
  return async (ctx: TaskExecutionContext): Promise<TaskExecutionResult> => {
    const input = ctx.job.input as unknown as DownloadJobInput;
    if (!input.url) {
      throw new TerminalJobError("Missing required parameter: url");
    }

    const container = input.container || "raw";
    const providerId = input.providerId || "local";
    const transformVersion = input.transformVersion || "raw-v1";
    const allowLocalNetwork = input.allowLocalNetwork ?? false;

    const res = await safeRedirectFetch(input.url, {
      signal: ctx.signal,
      allowLocalNetwork,
      timeoutMs: 30000,
    });

    if (res.status === 404 || res.status === 410) {
      throw new TerminalJobError(`HTTP ${res.status}: Target resource does not exist`);
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Download failed for ${input.url}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const sizeBytes = buffer.length;
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const mimeType =
      res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";

    const objectKey = input.objectKey || `blobs/${sha256.slice(0, 2)}/${sha256}`;

    if (ctx.objectStore) {
      async function* streamFromBuffer(b: Buffer): AsyncIterable<Uint8Array> {
        yield b;
      }
      await ctx.objectStore.putStream(objectKey, streamFromBuffer(buffer));
    }

    if (ctx.objectStore)
      recordWorkerProvenance({
        sha256,
        size: sizeBytes,
        storageUri: `object-store://${providerId}/${container}/${objectKey}`,
        sourceUri: input.url,
        sourceId: input.sourceId || "task-worker",
        sourceRecordId: input.sourceRecordId || ctx.job.documentId || ctx.job.id,
        runId: ctx.job.id,
        acquiredAt: new Date().toISOString(),
      });

    const artifacts = [
      {
        sha256,
        sizeBytes,
        mimeType,
        providerId,
        container,
        objectKey,
        transformVersion,
        metadata: {
          sourceUrl: input.url,
          statusCode: res.status,
          downloadedAt: new Date().toISOString(),
        },
      },
    ];

    const childJobs = [];
    const nextOperation = input.nextOperation || "extract";
    if (nextOperation !== "none") {
      childJobs.push({
        documentId: ctx.job.documentId ?? undefined,
        operation: nextOperation,
        idempotencyKey: `${ctx.job.idempotencyKey}:${nextOperation}:${sha256.slice(0, 8)}`,
        input: {
          container,
          objectKey,
          sha256,
          mimeType,
          providerId,
          sourceUri: input.url,
          sourceId: input.sourceId || "task-worker",
          sourceRecordId: input.sourceRecordId || ctx.job.documentId || ctx.job.id,
          provenanceRunId: ctx.job.id,
          acquiredAt: new Date().toISOString(),
        },
      });
    }

    return {
      artifacts,
      childJobs,
    };
  };
}
