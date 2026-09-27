/**
 * EPUB 2/3 E-Book and Publication Extraction Actor.
 * Fetches remote EPUBs via SSRF-safe HTTP or processes direct base64 payloads,
 * extracts OPF Dublin Core metadata, resolves hierarchical Table of Contents,
 * and converts ordered chapters into clean GFM Markdown.
 */

import { ArchiveSecurityError } from "../archive/archive-guard";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  EpubExtractorResult,
  IActor,
} from "../api/types";
import { EpubExtractor } from "../extractors/epub-extractor";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";

const MAX_EPUB_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_TIMEOUT_MS = 60_000;

export class EpubExtractorActor implements IActor<EpubExtractorResult> {
  readonly actorType = "epub-extractor" as const;
  readonly description =
    "Extracts e-books and publications from EPUB 2/3 containers with Dublin Core metadata, hierarchical TOC, and spine-ordered GFM Markdown.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<EpubExtractorResult>> {
    const startTime = context.startTime || Date.now();
    const epubOptions = task.options?.epubOptions;
    const timeoutMs = epubOptions?.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;

    let buffer: Buffer;
    let sourceUrl: string | undefined;

    try {
      if (epubOptions?.epubBase64) {
        buffer = Buffer.from(epubOptions.epubBase64, "base64");
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
          if (!Number.isNaN(parsed) && parsed > MAX_EPUB_DOWNLOAD_BYTES) {
            return {
              taskId: task.taskId,
              actorType: this.actorType,
              status: "failed",
              statusCode: 413,
              errorMessage: `EPUB download exceeds maximum limit of ${MAX_EPUB_DOWNLOAD_BYTES} bytes.`,
              executionDurationMs: Date.now() - startTime,
            };
          }
        }

        const arrayBuf = await response.arrayBuffer();
        if (arrayBuf.byteLength > MAX_EPUB_DOWNLOAD_BYTES) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 413,
            errorMessage: `EPUB download exceeds maximum limit of ${MAX_EPUB_DOWNLOAD_BYTES} bytes.`,
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
          errorMessage:
            "Target URL or epubOptions.epubBase64 payload is required for EPUB extraction.",
          executionDurationMs: Date.now() - startTime,
        };
      }

      const extractionResult = EpubExtractor.extract(buffer, epubOptions);
      if (sourceUrl) {
        extractionResult.url = sourceUrl;
      }

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: extractionResult,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      if (err instanceof ArchiveSecurityError) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `EPUB security barrier triggered [${err.code}]: ${err.message}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const error = err as Error;
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `EPUB extraction failed: ${error.message || "Unknown error"}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }
}
