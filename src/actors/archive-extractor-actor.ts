import { ArchiveExtractor } from "../archive/archive-extractor";
import { ArchiveSecurityError } from "../archive/archive-guard";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  ArchiveExtractorResult,
  IActor,
} from "../core/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";

const MAX_ARCHIVE_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
const DEFAULT_TIMEOUT_MS = 60_000;

export class ArchiveExtractorActor implements IActor<ArchiveExtractorResult> {
  readonly actorType = "archive-extractor" as const;
  readonly description =
    "Extracts and inspects compressed archives (ZIP, TAR, GZ, RAR) with strict Zip Slip path traversal and Zip Bomb volumetric guards.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<ArchiveExtractorResult>> {
    const startTime = context.startTime || Date.now();
    const archiveOptions = task.options?.archiveOptions;
    const timeoutMs = archiveOptions?.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;

    let buffer: Buffer;
    let sourceUrl: string | undefined;

    try {
      if (archiveOptions?.archiveBase64) {
        buffer = Buffer.from(archiveOptions.archiveBase64, "base64");
      } else if (task.targetUrl) {
        sourceUrl = task.targetUrl;
        let response: Response;
        try {
          response = await safeRedirectFetch(task.targetUrl, {
            timeoutMs,
            headers: task.options?.headers,
            allowLocalNetwork: false,
            proxy: task.options?.proxy,
            retryOptions: task.options?.retryOptions,
          });
        } catch (fetchError) {
          const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
          const isSsrf = msg.includes("SSRF validation failed");
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: isSsrf ? 403 : 500,
            errorMessage: msg,
            executionDurationMs: Date.now() - startTime,
          };
        }

        if (!response.ok) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: response.status,
            errorMessage: `HTTP request failed with status ${response.status}: ${response.statusText}`,
            executionDurationMs: Date.now() - startTime,
          };
        }

        const contentLength = response.headers.get("content-length");
        if (contentLength) {
          const parsed = Number.parseInt(contentLength, 10);
          if (!Number.isNaN(parsed) && parsed > MAX_ARCHIVE_DOWNLOAD_BYTES) {
            return {
              taskId: task.taskId,
              actorType: this.actorType,
              status: "failed",
              statusCode: 413,
              errorMessage: `Archive download exceeds maximum limit of ${MAX_ARCHIVE_DOWNLOAD_BYTES} bytes.`,
              executionDurationMs: Date.now() - startTime,
            };
          }
        }

        const arrayBuf = await response.arrayBuffer();
        if (arrayBuf.byteLength > MAX_ARCHIVE_DOWNLOAD_BYTES) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 413,
            errorMessage: `Archive download exceeds maximum limit of ${MAX_ARCHIVE_DOWNLOAD_BYTES} bytes.`,
            executionDurationMs: Date.now() - startTime,
          };
        }

        buffer = Buffer.from(arrayBuf);
      } else {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage: "Neither targetUrl nor archiveBase64 payload was provided.",
          executionDurationMs: Date.now() - startTime,
        };
      }

      const extracted = ArchiveExtractor.extract(buffer, archiveOptions);
      extracted.url = sourceUrl;

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: extracted,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      if (err instanceof ArchiveSecurityError) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `Archive security barrier triggered [${err.code}]: ${err.message}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const error = err as Error;
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `Archive extraction failed: ${error.message || "Unknown error"}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }
}
