/**
 * Extract Job Handler — protokol-7
 *
 * Reads raw artifacts from ObjectStore, extracts text or structured markdown,
 * stores extracted artifacts, and emits transactional outbox notifications.
 * Conforms to RFC 03 (Workers, Transaction and Control Plane).
 */

import { createHash } from "node:crypto";
import type { StorageRef } from "../../../contracts/index.js";
import { recordWorkerProvenance } from "../../storage/producer-provenance.js";
import { QuarantineError, TerminalJobError } from "../task-worker.js";
import type { JobHandler, TaskExecutionContext, TaskExecutionResult } from "../types.js";

export interface ExtractJobInput {
  sourceUri?: string;
  sourceId?: string;
  sourceRecordId?: string;
  provenanceRunId?: string;
  acquiredAt?: string;
  container: string;
  objectKey: string;
  sha256?: string;
  mimeType?: string;
  providerId?: string;
  targetContainer?: string;
  transformVersion?: string;
}

export function createExtractJobHandler(): JobHandler {
  return async (ctx: TaskExecutionContext): Promise<TaskExecutionResult> => {
    if (!ctx.objectStore) {
      throw new TerminalJobError("ObjectStore is required for extraction execution");
    }

    const input = ctx.job.input as unknown as ExtractJobInput;
    if (!input.container || !input.objectKey) {
      throw new TerminalJobError("Missing required parameters: container and objectKey");
    }

    const targetContainer = input.targetContainer || "extracted";
    const providerId = input.providerId || "local";
    const transformVersion = input.transformVersion || "extract-v1";

    const ref: StorageRef = {
      provider_id: providerId,
      container: input.container,
      key: input.objectKey,
      version: null,
      sha256: input.sha256 || "",
      bytes: 0,
    };

    let rawBuffer: Buffer;
    try {
      const chunks: Uint8Array[] = [];
      for await (const chunk of ctx.objectStore.openStream(ref)) {
        chunks.push(chunk);
      }
      rawBuffer = Buffer.concat(chunks);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found") || msg.includes("ENOENT") || msg.includes("NotFoundError")) {
        throw new TerminalJobError(
          `Source artifact not found in store: ${input.container}/${input.objectKey}`
        );
      }
      throw err;
    }

    // Verify hash if provided
    if (input.sha256) {
      const actualSha = createHash("sha256").update(rawBuffer).digest("hex");
      if (actualSha !== input.sha256) {
        throw new QuarantineError(
          `Integrity mismatch for ${input.objectKey}: expected ${input.sha256}, got ${actualSha}`
        );
      }
    }

    // Extract text / markdown representation
    const textContent = rawBuffer.toString("utf-8");
    let extractedText: string;

    if (
      input.mimeType?.includes("html") ||
      textContent.includes("<html") ||
      textContent.includes("<!DOCTYPE")
    ) {
      // Basic zero-dependency HTML distillation: strip script, style, and HTML tags
      extractedText = textContent
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
    } else {
      extractedText = textContent.trim();
    }

    const extractedBuffer = Buffer.from(extractedText, "utf-8");
    const extractedSha256 = createHash("sha256").update(extractedBuffer).digest("hex");
    const extractedSize = extractedBuffer.length;
    const extractedKey = `derived/${extractedSha256.slice(0, 2)}/${extractedSha256}.txt`;

    async function* streamFromBuffer(b: Buffer): AsyncIterable<Uint8Array> {
      yield b;
    }
    await ctx.objectStore.putStream(extractedKey, streamFromBuffer(extractedBuffer));

    if (input.sourceUri)
      recordWorkerProvenance({
        sha256: createHash("sha256").update(rawBuffer).digest("hex"),
        size: rawBuffer.length,
        storageUri: `object-store://${providerId}/${input.container}/${input.objectKey}`,
        sourceUri: input.sourceUri,
        sourceId: input.sourceId || "task-worker",
        sourceRecordId: input.sourceRecordId || ctx.job.documentId || ctx.job.id,
        runId: ctx.job.id,
        acquiredAt: input.acquiredAt || new Date().toISOString(),
        text: input.mimeType?.startsWith("text/") ? extractedText : undefined,
      });

    const artifacts = [
      {
        sha256: extractedSha256,
        sizeBytes: extractedSize,
        mimeType: "text/plain",
        providerId,
        container: targetContainer,
        objectKey: extractedKey,
        transformVersion,
        metadata: {
          rawSha256: input.sha256,
          rawObjectKey: input.objectKey,
          extractedLength: extractedText.length,
        },
      },
    ];

    const outboxEvents = [
      {
        eventType: "document.extracted",
        payload: {
          jobId: ctx.job.id,
          documentId: ctx.job.documentId,
          rawSha256: input.sha256,
          extractedSha256,
          targetContainer,
          targetKey: extractedKey,
        },
      },
    ];

    return {
      artifacts,
      outboxEvents,
    };
  };
}
