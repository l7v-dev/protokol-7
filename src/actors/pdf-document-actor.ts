import { extractText, getDocumentProxy, getMeta } from "unpdf";
import { ContextGuard } from "../core/context-guard";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  PdfDocumentMetadata,
  PdfDocumentResult,
  PdfPageEntry,
} from "../core/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";

const MAX_PDF_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
const DEFAULT_TIMEOUT_MS = 30_000;

export class PdfDocumentActor implements IActor<PdfDocumentResult> {
  readonly actorType = "pdf-document" as const;
  readonly description =
    "Extracts textual streams, page boundaries, metrics, and document metadata from PDF files.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<PdfDocumentResult>> {
    const startTime = context.startTime || Date.now();
    const pdfOptions = task.options?.pdfOptions;
    const timeoutMs = pdfOptions?.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;

    try {
      let uint8Data: Uint8Array;
      let sourceUrl: string | undefined;

      if (pdfOptions?.pdfBase64) {
        const buffer = Buffer.from(pdfOptions.pdfBase64, "base64");
        uint8Data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
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

        const contentLengthHeader = response.headers.get("content-length");
        if (contentLengthHeader) {
          const parsedLength = Number.parseInt(contentLengthHeader, 10);
          if (!Number.isNaN(parsedLength) && parsedLength > MAX_PDF_SIZE_BYTES) {
            return {
              taskId: task.taskId,
              actorType: this.actorType,
              status: "failed",
              statusCode: 413,
              errorMessage: `Remote PDF exceeds maximum payload limit of ${MAX_PDF_SIZE_BYTES} bytes.`,
              executionDurationMs: Date.now() - startTime,
            };
          }
        }

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_PDF_SIZE_BYTES) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 413,
            errorMessage: `Remote PDF exceeds maximum payload limit of ${MAX_PDF_SIZE_BYTES} bytes.`,
            executionDurationMs: Date.now() - startTime,
          };
        }

        uint8Data = new Uint8Array(arrayBuffer);
      } else {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage: "Neither targetUrl nor pdfBase64 payload was provided.",
          executionDurationMs: Date.now() - startTime,
        };
      }

      if (!this.validatePdfMagicBytes(uint8Data)) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage: "Invalid binary payload: Missing '%PDF-' header signature.",
          executionDurationMs: Date.now() - startTime,
        };
      }

      const doc = await getDocumentProxy(uint8Data);
      const meta = await getMeta(doc);
      const extracted = await extractText(doc);

      const totalPages = extracted.totalPages;
      const rawPages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];

      const maxPages = pdfOptions?.maxPages;
      const pagesToProcess = maxPages && maxPages > 0 ? rawPages.slice(0, maxPages) : rawPages;

      const pages: PdfPageEntry[] = pagesToProcess.map((pageText, idx) => {
        const cleanText = ContextGuard.stripInvisibleUnicode((pageText || "").trim());
        const characterCount = cleanText.length;
        const wordCount = cleanText.length > 0 ? cleanText.split(/\s+/).length : 0;

        return {
          pageNumber: idx + 1,
          text: cleanText,
          characterCount,
          wordCount,
        };
      });

      const fullText = pages.map((p) => p.text).join("\n\n");
      const totalCharacters = pages.reduce((sum, p) => sum + p.characterCount, 0);
      const totalWords = pages.reduce((sum, p) => sum + p.wordCount, 0);

      const metadata: PdfDocumentMetadata = {
        title: meta.info?.Title ? String(meta.info.Title) : undefined,
        author: meta.info?.Author ? String(meta.info.Author) : undefined,
        creator: meta.info?.Creator ? String(meta.info.Creator) : undefined,
        producer: meta.info?.Producer ? String(meta.info.Producer) : undefined,
        creationDate: meta.info?.CreationDate ? String(meta.info.CreationDate) : undefined,
        modificationDate: meta.info?.ModDate ? String(meta.info.ModDate) : undefined,
      };

      const resultData: PdfDocumentResult = {
        url: sourceUrl,
        totalPages,
        extractedPages: pages.length,
        metadata,
        pages,
        fullText,
        totalCharacters,
        totalWords,
      };

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: resultData,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const error = err as Error;
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `PDF extraction failed: ${error.message || "Unknown error"}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private validatePdfMagicBytes(data: Uint8Array): boolean {
    if (data.length < 5) return false;
    // Check %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    return (
      data[0] === 0x25 &&
      data[1] === 0x50 &&
      data[2] === 0x44 &&
      data[3] === 0x46 &&
      data[4] === 0x2d
    );
  }
}
