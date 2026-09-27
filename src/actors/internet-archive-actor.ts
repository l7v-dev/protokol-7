/**
 * InternetArchiveActor - Archive.org public collection actor.
 *
 * Provides three actions:
 *   - "metadata"  : Fetches item metadata JSON from archive.org/metadata/{identifier}.
 *                   Returns file list with format labels and direct download URLs.
 *   - "search"    : Full-text search via archive.org/advancedsearch.php Scraping API.
 *   - "text"      : Downloads the first DjVuTXT or Abbyy GZ text file for an item
 *                   and returns up to maxTextChars of plain text.
 *
 * Zero new npm dependencies: uses native fetch (safeRedirectFetch + SSRF guard)
 * and Node.js zlib for optional gzip decompression of Abbyy OCR streams.
 */

import zlib from "node:zlib";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  InternetArchiveAction,
  InternetArchiveActorResult,
  InternetArchiveActorTaskOptions,
  InternetArchiveFile,
  InternetArchiveItem,
} from "../api/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";

const IA_BASE = "https://archive.org";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_MAX_TEXT_CHARS = 100_000;

// Text formats preferred in descending priority order
const TEXT_FORMAT_PRIORITY = ["DjVuTXT", "Abbyy GZ", "Abbyy", "Plain Text", "Text PDF", "PDF"];

export class InternetArchiveActor implements IActor<InternetArchiveActorResult> {
  readonly actorType = "internet-archive" as const;
  readonly description =
    "Fetches item metadata, search results, and OCR text streams from the Internet Archive (archive.org).";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<InternetArchiveActorResult>> {
    const startTime = context?.startTime || Date.now();
    const opts: InternetArchiveActorTaskOptions = task.options?.internetArchiveOptions ?? {};
    const action: InternetArchiveAction = opts.action ?? "metadata";
    const timeoutMs = opts.timeoutMs ?? task.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      if (action === "search") {
        return await this.handleSearch(task, opts, timeoutMs, allowLocalNetwork, startTime);
      }
      if (action === "text") {
        return await this.handleText(task, opts, timeoutMs, allowLocalNetwork, startTime);
      }
      // Default: metadata
      return await this.handleMetadata(task, opts, timeoutMs, allowLocalNetwork, startTime);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `InternetArchiveActor execution failure: ${msg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  // -------------------------------------------------------------------------
  // action="metadata"
  // -------------------------------------------------------------------------

  private async handleMetadata(
    task: ActorTask,
    opts: InternetArchiveActorTaskOptions,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    startTime: number
  ): Promise<ActorResult<InternetArchiveActorResult>> {
    const identifier = this.resolveIdentifier(task, opts);
    if (!identifier) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 400,
        errorMessage:
          "action='metadata' requires dergiParkOptions.identifier or a targetUrl containing the archive.org item path.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    const url = `${IA_BASE}/metadata/${identifier}`;
    const resp = await safeRedirectFetch(url, { timeoutMs, allowLocalNetwork });
    if (!resp.ok) {
      return this.httpError(task, resp.status, `Metadata HTTP ${resp.status}`, startTime);
    }

    const json = (await resp.json()) as Record<string, unknown>;
    const item = this.parseMetadataJson(json, identifier);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "metadata",
        totalItems: 1,
        items: [item],
        queryUrl: url,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  // -------------------------------------------------------------------------
  // action="search"
  // -------------------------------------------------------------------------

  private async handleSearch(
    task: ActorTask,
    opts: InternetArchiveActorTaskOptions,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    startTime: number
  ): Promise<ActorResult<InternetArchiveActorResult>> {
    const query = opts.searchQuery || task.targetUrl || "";
    if (!query) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 400,
        errorMessage: "action='search' requires internetArchiveOptions.searchQuery.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    const maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;
    const mediaType = opts.mediaType ?? "texts";

    const params = new URLSearchParams({
      q: `${query} AND mediatype:${mediaType}`,
      fl: [
        "identifier",
        "title",
        "creator",
        "description",
        "subject",
        "publisher",
        "date",
        "language",
        "mediatype",
      ].join(","),
      rows: String(maxResults),
      page: "1",
      output: "json",
    });

    const url = `${IA_BASE}/advancedsearch.php?${params.toString()}`;
    const resp = await safeRedirectFetch(url, { timeoutMs, allowLocalNetwork });
    if (!resp.ok) {
      return this.httpError(task, resp.status, `Search HTTP ${resp.status}`, startTime);
    }

    const json = (await resp.json()) as {
      response?: { docs?: Record<string, unknown>[] };
    };
    const docs = json.response?.docs ?? [];

    const items: InternetArchiveItem[] = docs.map((doc) => {
      const id = String(doc.identifier ?? "");
      return {
        identifier: id,
        title: String(doc.title ?? id),
        creator: doc.creator ? String(doc.creator) : undefined,
        description: doc.description ? String(doc.description) : undefined,
        subject: Array.isArray(doc.subject)
          ? (doc.subject as string[])
          : doc.subject
            ? [String(doc.subject)]
            : undefined,
        publisher: doc.publisher ? String(doc.publisher) : undefined,
        date: doc.date ? String(doc.date) : undefined,
        language: doc.language ? String(doc.language) : undefined,
        mediaType: doc.mediatype ? String(doc.mediatype) : undefined,
        downloadUrl: id ? `${IA_BASE}/download/${id}` : undefined,
        textUrl: undefined,
        files: [],
      };
    });

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "search",
        totalItems: items.length,
        items,
        queryUrl: url,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  // -------------------------------------------------------------------------
  // action="text"
  // -------------------------------------------------------------------------

  private async handleText(
    task: ActorTask,
    opts: InternetArchiveActorTaskOptions,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    startTime: number
  ): Promise<ActorResult<InternetArchiveActorResult>> {
    const identifier = this.resolveIdentifier(task, opts);
    if (!identifier) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 400,
        errorMessage: "action='text' requires internetArchiveOptions.identifier.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    // Fetch metadata first to discover text file
    const metaUrl = `${IA_BASE}/metadata/${identifier}`;
    const metaResp = await safeRedirectFetch(metaUrl, { timeoutMs, allowLocalNetwork });
    if (!metaResp.ok) {
      return this.httpError(task, metaResp.status, `Metadata HTTP ${metaResp.status}`, startTime);
    }

    const json = (await metaResp.json()) as Record<string, unknown>;
    const item = this.parseMetadataJson(json, identifier);

    // Select best text file by priority
    const textFile = this.selectTextFile(item.files);
    if (!textFile) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 404,
        errorMessage: `No OCR/text file found for identifier '${identifier}'. Available formats: ${item.files.map((f) => f.format).join(", ") || "none"}.`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const maxChars = opts.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS;
    const textResp = await safeRedirectFetch(textFile.url, { timeoutMs, allowLocalNetwork });
    if (!textResp.ok) {
      return this.httpError(task, textResp.status, `Text file HTTP ${textResp.status}`, startTime);
    }

    let extractedText: string;
    const arrayBuf = await textResp.arrayBuffer();
    const rawBuf = Buffer.from(arrayBuf);

    if (textFile.format === "Abbyy GZ" || textFile.url.endsWith(".gz")) {
      // Decompress gzip with native Node.js zlib
      const decompressed = await new Promise<Buffer>((resolve, reject) => {
        zlib.gunzip(rawBuf, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      extractedText = decompressed.toString("utf-8");
    } else {
      extractedText = rawBuf.toString("utf-8");
    }

    // Trim to maxChars
    if (extractedText.length > maxChars) {
      extractedText = `${extractedText.slice(0, maxChars)}\n[truncated at ${maxChars} characters]`;
    }

    item.textUrl = textFile.url;

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "text",
        totalItems: 1,
        items: [item],
        extractedText,
        queryUrl: metaUrl,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  // -------------------------------------------------------------------------
  // JSON metadata parser
  // -------------------------------------------------------------------------

  private parseMetadataJson(
    json: Record<string, unknown>,
    identifier: string
  ): InternetArchiveItem {
    const meta = (json.metadata ?? {}) as Record<string, unknown>;
    const rawFiles = (json.files ?? []) as Record<string, unknown>[];

    const str = (v: unknown) => (v ? String(v) : undefined);
    const arr = (v: unknown): string[] | undefined => {
      if (Array.isArray(v)) return v.map(String);
      if (v) return [String(v)];
      return undefined;
    };

    const files: InternetArchiveFile[] = rawFiles.map((f) => {
      const name = String(f.name ?? "");
      return {
        name,
        format: String(f.format ?? ""),
        size: f.size ? Number(f.size) : undefined,
        url: `${IA_BASE}/download/${identifier}/${encodeURIComponent(name)}`,
      };
    });

    // Identify best download URL (prefer DjVu or PDF)
    const downloadFile =
      files.find((f) => f.format === "DjVu" || f.name.endsWith(".djvu")) ??
      files.find((f) => f.format === "PDF" || f.name.endsWith(".pdf"));

    return {
      identifier,
      title: String(meta.title ?? identifier),
      creator: str(meta.creator),
      description: str(meta.description),
      subject: arr(meta.subject),
      publisher: str(meta.publisher),
      date: str(meta.date),
      language: str(meta.language),
      mediaType: str(meta.mediatype),
      downloadUrl: downloadFile?.url,
      textUrl: undefined,
      files,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private selectTextFile(files: InternetArchiveFile[]): InternetArchiveFile | undefined {
    for (const fmt of TEXT_FORMAT_PRIORITY) {
      const f = files.find((file) => file.format === fmt);
      if (f) return f;
    }
    return undefined;
  }

  private resolveIdentifier(
    task: ActorTask,
    opts: InternetArchiveActorTaskOptions
  ): string | undefined {
    if (opts.identifier) return opts.identifier;
    // Try to extract from targetUrl: archive.org/details/{identifier}
    if (task.targetUrl) {
      const match = task.targetUrl.match(/(?:details|metadata|download)\/([^/?#]+)/);
      if (match?.[1]) return match[1];
    }
    return undefined;
  }

  private httpError(
    task: ActorTask,
    status: number,
    message: string,
    startTime: number
  ): ActorResult<InternetArchiveActorResult> {
    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "failed",
      statusCode: status,
      errorMessage: message,
      executionDurationMs: Date.now() - startTime,
    };
  }
}
