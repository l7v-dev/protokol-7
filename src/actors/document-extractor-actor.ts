import { ContextGuard } from "../api/context-guard";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  DocumentExtractorResult,
  IActor,
  SupportedDocumentFormat,
} from "../api/types";
import { OfficeExtractor } from "../extractors/office-extractor";
import { TabularExtractor } from "../extractors/tabular-extractor";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";

const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_TIMEOUT_MS = 30_000;

export class DocumentExtractorActor implements IActor<DocumentExtractorResult> {
  readonly actorType = "document-extractor" as const;
  readonly description =
    "Extracts textual streams, structured records, tables, and document metadata from office files (DOCX, XLSX), tabular files (CSV, TSV), and plain text formats.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<DocumentExtractorResult>> {
    const startTime = context.startTime || Date.now();
    const docOptions = task.options?.documentOptions;
    const timeoutMs = docOptions?.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;

    let buffer: Buffer;
    let sourceUrl: string | undefined;

    try {
      if (docOptions?.documentBase64) {
        buffer = Buffer.from(docOptions.documentBase64, "base64");
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
          if (!Number.isNaN(parsed) && parsed > MAX_DOCUMENT_SIZE_BYTES) {
            return {
              taskId: task.taskId,
              actorType: this.actorType,
              status: "failed",
              statusCode: 413,
              errorMessage: `Document exceeds maximum payload limit of ${MAX_DOCUMENT_SIZE_BYTES} bytes.`,
              executionDurationMs: Date.now() - startTime,
            };
          }
        }

        const arrayBuf = await response.arrayBuffer();
        if (arrayBuf.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 413,
            errorMessage: `Document exceeds maximum payload limit of ${MAX_DOCUMENT_SIZE_BYTES} bytes.`,
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
          errorMessage: "Neither targetUrl nor documentBase64 payload was provided.",
          executionDurationMs: Date.now() - startTime,
        };
      }

      const format = this.resolveFormat(sourceUrl, buffer, docOptions?.format);

      let resultData: DocumentExtractorResult;

      switch (format) {
        case "docx": {
          const docxRes = OfficeExtractor.extractDocx(buffer);
          resultData = {
            url: sourceUrl,
            format: "docx",
            fullText: ContextGuard.stripInvisibleUnicode(docxRes.fullText),
            totalCharacters: docxRes.totalCharacters,
            totalWords: docxRes.totalWords,
            metadata: docxRes.metadata,
            markdownTable:
              docxRes.markdownTables.length > 0 ? docxRes.markdownTables.join("\n\n") : undefined,
          };
          break;
        }

        case "xlsx": {
          const xlsxRes = OfficeExtractor.extractXlsx(buffer);
          resultData = {
            url: sourceUrl,
            format: "xlsx",
            fullText: ContextGuard.stripInvisibleUnicode(xlsxRes.fullText),
            totalCharacters: xlsxRes.totalCharacters,
            totalWords: xlsxRes.totalWords,
            sheets: xlsxRes.sheets,
            metadata: xlsxRes.metadata,
          };
          break;
        }

        case "csv":
        case "tsv": {
          const textContent = buffer.toString("utf8");
          const tabRes = TabularExtractor.parse(textContent, {
            delimiter: docOptions?.delimiter || (format === "tsv" ? "\t" : undefined),
            maxRows: docOptions?.maxRows,
          });

          resultData = {
            url: sourceUrl,
            format,
            fullText: tabRes.markdownTable,
            totalCharacters: tabRes.markdownTable.length,
            records: tabRes.records,
            markdownTable: tabRes.markdownTable,
            metadata: {
              detectedDelimiter: tabRes.detectedDelimiter,
              rowCount: tabRes.rowCount,
              columnCount: tabRes.columnCount,
              headers: tabRes.headers,
            },
          };
          break;
        }

        default: {
          const rawText = ContextGuard.stripInvisibleUnicode(buffer.toString("utf8"));
          resultData = {
            url: sourceUrl,
            format: format || "txt",
            fullText: rawText,
            totalCharacters: rawText.length,
            totalWords: rawText.length > 0 ? rawText.trim().split(/\s+/).length : 0,
          };
          break;
        }
      }

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
        errorMessage: `Document extraction failed: ${error.message || "Unknown error"}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private resolveFormat(
    url?: string,
    buffer?: Buffer,
    explicitFormat?: SupportedDocumentFormat
  ): SupportedDocumentFormat {
    if (explicitFormat) return explicitFormat;

    if (url) {
      const cleanUrl = url.split("?")[0].toLowerCase();
      if (cleanUrl.endsWith(".docx")) return "docx";
      if (cleanUrl.endsWith(".xlsx")) return "xlsx";
      if (cleanUrl.endsWith(".csv")) return "csv";
      if (cleanUrl.endsWith(".tsv")) return "tsv";
      if (cleanUrl.endsWith(".json")) return "json";
      if (cleanUrl.endsWith(".yaml") || cleanUrl.endsWith(".yml")) return "yaml";
      if (cleanUrl.endsWith(".txt")) return "txt";
    }

    if (buffer && buffer.length >= 4) {
      // PKZip signature: 0x50, 0x4B, 0x03, 0x04
      if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
        const sample = buffer.subarray(0, Math.min(buffer.length, 10_000)).toString("latin1");
        if (sample.includes("word/")) return "docx";
        if (sample.includes("xl/")) return "xlsx";
      }

      // Check text characteristics
      const sampleText = buffer.subarray(0, Math.min(buffer.length, 1000)).toString("utf8");
      if (sampleText.startsWith("{") || sampleText.startsWith("[")) {
        return "json";
      }
      if (sampleText.includes("\t") && sampleText.includes("\n")) {
        return "tsv";
      }
      if (sampleText.includes(",") && sampleText.includes("\n")) {
        return "csv";
      }
    }

    return "txt";
  }
}
