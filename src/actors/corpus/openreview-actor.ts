/**
 * OpenReviewActor - Extraction actor for OpenReview academic submissions,
 * peer reviews, author rebuttals, meta-reviews, and decisions.
 * Conforms to docs/actor-contract.md and docs/actors/openreview.md.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  OpenReviewActorResult,
  OpenReviewActorTaskOptions,
  OpenReviewNoteItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const OPENREVIEW_API_V2 = "https://api2.openreview.net";

function extractValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object" && val !== null && "value" in val) {
    const inner = (val as { value: unknown }).value;
    if (typeof inner === "string") return inner;
    if (Array.isArray(inner)) return inner.join(", ");
    return String(inner ?? "");
  }
  return "";
}

function extractArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map((x) => String(x));
  if (typeof val === "object" && val !== null && "value" in val) {
    const inner = (val as { value: unknown }).value;
    if (Array.isArray(inner)) return inner.map((x) => String(x));
  }
  return [];
}

export class OpenReviewActor implements IActor<OpenReviewActorResult> {
  readonly actorType = "openreview" as const;
  readonly description =
    "OpenReview academic paper submissions, peer reviews, author rebuttals, and decisions extraction actor.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<OpenReviewActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: OpenReviewActorTaskOptions =
      task.options?.openreviewOptions || (task.options as OpenReviewActorTaskOptions) || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF validation on targetUrl if explicitly provided as HTTP URL
      if (
        task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
      ) {
        const initialSsrfCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
          allowLocalNetwork,
        });

        if (!initialSsrfCheck.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${initialSsrfCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      // 2. Resolve query parameters and action
      const { action, venue, forumId, noteId, query } = this.resolveParameters(
        task.targetUrl,
        options
      );

      // 3. Resolve upstream API endpoint URL
      const endpoint = this.buildEndpointUrl(
        task.targetUrl,
        action,
        venue,
        forumId,
        noteId,
        query,
        options.limit || 25
      );

      // 4. Secondary SSRF check on resolved endpoint
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(endpoint, {
        allowLocalNetwork,
      });

      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed on target endpoint: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 5. Dispatch HTTP request with abort controller
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(endpoint, {
          signal: controller.signal,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json, text/plain, */*",
          },
          timeoutMs,
          allowLocalNetwork,
        });
      } finally {
        clearTimeout(timeoutTimer);
      }

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `OpenReview API request failed with HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 6. Process response data and normalize into structured OpenReview notes
      const rawText = await response.text();
      const notes = this.parseNotes(rawText);
      const markdown = this.renderMarkdown(action, venue, forumId, notes, endpoint);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          action,
          venue,
          forumId,
          totalCount: notes.length,
          notes,
          queryUrl: endpoint,
          markdown,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTimeout = msg.includes("aborted") || msg.includes("timeout");
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        statusCode: isTimeout ? 408 : 500,
        errorMessage: msg,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Resolves action, venue, forumId, noteId, and query from targetUrl or options.
   */
  resolveParameters(
    targetUrl?: string,
    options?: OpenReviewActorTaskOptions
  ): {
    action: "submissions" | "forum" | "note";
    venue?: string;
    forumId?: string;
    noteId?: string;
    query?: string;
  } {
    let action = options?.action || "submissions";
    let venue = options?.venue?.trim();
    let forumId = options?.forumId?.trim();
    let noteId = options?.noteId?.trim();
    const query = options?.query?.trim();

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const searchParams = parsed.searchParams;

        if (parsed.pathname.includes("/forum") || searchParams.has("forum")) {
          action = "forum";
          forumId = forumId || searchParams.get("id") || searchParams.get("forum") || undefined;
        } else if (parsed.pathname.includes("/group")) {
          action = "submissions";
          venue = venue || searchParams.get("id") || undefined;
        } else if (parsed.pathname.includes("/note") || searchParams.has("id")) {
          if (!forumId && !venue) {
            action = "note";
            noteId = noteId || searchParams.get("id") || undefined;
          }
        }
      } catch {
        // Not a standard parseable URL, keep existing options
      }
    }

    if (forumId && action !== "forum") {
      action = "forum";
    } else if (noteId && action !== "note" && !forumId) {
      action = "note";
    }

    return { action, venue, forumId, noteId, query };
  }

  /**
   * Constructs the OpenReview API URL.
   */
  buildEndpointUrl(
    targetUrl: string | undefined,
    action: string,
    venue?: string,
    forumId?: string,
    noteId?: string,
    query?: string,
    limit: number = 25
  ): string {
    if (
      targetUrl &&
      (targetUrl.includes("api.openreview.net") ||
        targetUrl.includes("api2.openreview.net") ||
        (targetUrl.startsWith("http://127.0.0.1") && targetUrl.includes("/notes")))
    ) {
      return targetUrl;
    }

    if (action === "forum" && forumId) {
      return `${OPENREVIEW_API_V2}/notes?forum=${encodeURIComponent(forumId)}&limit=100`;
    }

    if (action === "note" && noteId) {
      return `${OPENREVIEW_API_V2}/notes?id=${encodeURIComponent(noteId)}`;
    }

    if (query) {
      return `${OPENREVIEW_API_V2}/notes/search?term=${encodeURIComponent(query)}&limit=${limit}`;
    }

    if (venue) {
      return `${OPENREVIEW_API_V2}/notes?content.venueid=${encodeURIComponent(venue)}&limit=${limit}`;
    }

    return `${OPENREVIEW_API_V2}/notes?limit=${limit}`;
  }

  /**
   * Parses raw API JSON into structured OpenReview notes.
   */
  private parseNotes(rawJson: string): OpenReviewNoteItem[] {
    let data: unknown;
    try {
      data = JSON.parse(rawJson);
    } catch {
      return [];
    }

    let rawNotes: Array<Record<string, unknown>> = [];
    if (Array.isArray(data)) {
      rawNotes = data;
    } else if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.notes)) {
        rawNotes = obj.notes as Array<Record<string, unknown>>;
      } else if (obj.id) {
        rawNotes = [obj];
      }
    }

    return rawNotes.map((note) => {
      const content = (note.content as Record<string, unknown>) || {};
      const title = extractValue(content.title) || extractValue(note.title);
      const abstract = extractValue(content.abstract);
      const authors = extractArray(content.authors);
      const venue = extractValue(content.venue) || extractValue(content.venueid);
      const yearStr = extractValue(content.year);
      const year = yearStr ? Number.parseInt(yearStr, 10) : undefined;
      const pdf = extractValue(content.pdf);
      const pdfUrl = pdf
        ? pdf.startsWith("http")
          ? pdf
          : `https://openreview.net/pdf?id=${note.id}`
        : undefined;

      const rating =
        extractValue(content.rating) ||
        extractValue(content.recommendation) ||
        extractValue(content.score);
      const confidence = extractValue(content.confidence);
      const decision = extractValue(content.decision);
      const comment =
        extractValue(content.review) ||
        extractValue(content.comment) ||
        extractValue(content.summary) ||
        extractValue(content.rebuttal);

      return {
        id: String(note.id || ""),
        forum: note.forum ? String(note.forum) : undefined,
        replyto: note.replyto ? String(note.replyto) : undefined,
        invitation: note.invitation ? String(note.invitation) : undefined,
        title: title || undefined,
        authors: authors.length > 0 ? authors : undefined,
        abstract: abstract || undefined,
        venue: venue || undefined,
        year: !Number.isNaN(year) ? year : undefined,
        pdfUrl,
        rating: rating || undefined,
        confidence: confidence || undefined,
        decision: decision || undefined,
        comment: comment || undefined,
        content,
        createdAt: (note.cdate || note.tcdate || note.createdAt) as string | number | undefined,
      };
    });
  }

  /**
   * Renders structured OpenReview notes into LLM-ready GFM Markdown.
   */
  private renderMarkdown(
    action: string,
    venue?: string,
    forumId?: string,
    notes: OpenReviewNoteItem[] = [],
    endpointUrl?: string
  ): string {
    const lines: string[] = [];
    lines.push("# OpenReview Academic Submissions & Reviews");
    lines.push(
      `**İşlem:** ${action} | **Toplam Not:** ${notes.length} | **Kaynak API:** [${endpointUrl}](${endpointUrl})\n`
    );

    if (venue) {
      lines.push(`**Konferans / Venue:** \`${venue}\`\n`);
    }

    if (action === "forum" && forumId) {
      // Find submission (root note without replyto, or matching forumId)
      const root = notes.find((n) => n.id === forumId || !n.replyto) || notes[0];
      const replies = notes.filter((n) => n !== root);

      if (root) {
        lines.push(`## Makale: ${root.title || root.id}`);
        if (root.authors && root.authors.length > 0) {
          lines.push(`* **Yazarlar:** ${root.authors.join(", ")}`);
        }
        if (root.venue) {
          lines.push(`* **Yayın Yeri:** ${root.venue} ${root.year ? `(${root.year})` : ""}`);
        }
        if (root.pdfUrl) {
          lines.push(`* **PDF Metni:** [Açık İndirme](${root.pdfUrl})`);
        }
        if (root.abstract) {
          lines.push(`\n### Özet (Abstract)\n${root.abstract}\n`);
        }
        lines.push("---\n");
      }

      // Check for decision
      const decisionNote = replies.find(
        (n) => n.decision || n.invitation?.toLowerCase().includes("decision")
      );
      if (decisionNote) {
        lines.push(`### Nihai Karar: ${decisionNote.decision || "Açıklandı"}`);
        if (decisionNote.comment) {
          lines.push(`> ${decisionNote.comment.replace(/\n/g, "\n> ")}\n`);
        }
        lines.push("---\n");
      }

      // List peer reviews and rebuttals
      const reviews = replies.filter(
        (n) =>
          n !== decisionNote &&
          (n.rating ||
            n.invitation?.toLowerCase().includes("review") ||
            n.invitation?.toLowerCase().includes("comment") ||
            n.invitation?.toLowerCase().includes("rebuttal"))
      );

      for (let i = 0; i < reviews.length; i++) {
        const rev = reviews[i];
        const isRebuttal =
          rev.invitation?.toLowerCase().includes("rebuttal") ||
          rev.invitation?.toLowerCase().includes("author") ||
          (Boolean(rev.replyto) && rev.replyto !== root?.id);
        const header = isRebuttal
          ? `Yazar Yanıtı / Rebuttal #${i + 1}`
          : `Hakem İncelemesi #${i + 1}`;

        lines.push(`### ${header} (ID: ${rev.id})`);
        if (rev.rating) {
          lines.push(`* **Puan (Rating):** ${rev.rating}`);
        }
        if (rev.confidence) {
          lines.push(`* **Güven (Confidence):** ${rev.confidence}`);
        }
        if (rev.comment) {
          lines.push(`\n${rev.comment}\n`);
        }
        lines.push("---\n");
      }

      return lines.join("\n");
    }

    // Default submissions listing
    for (const note of notes) {
      lines.push(`## ${note.title || note.id}`);
      lines.push(`* **Forum ID:** \`${note.forum || note.id}\``);
      if (note.authors && note.authors.length > 0) {
        lines.push(`* **Yazarlar:** ${note.authors.join(", ")}`);
      }
      if (note.venue) {
        lines.push(`* **Konferans:** ${note.venue}`);
      }
      if (note.pdfUrl) {
        lines.push(`* **PDF:** [Bağlantı](${note.pdfUrl})`);
      }
      if (note.abstract) {
        const preview =
          note.abstract.length > 300 ? `${note.abstract.substring(0, 300)}...` : note.abstract;
        lines.push(`\n> ${preview.replace(/\n/g, "\n> ")}\n`);
      }
      lines.push("---\n");
    }

    return lines.join("\n");
  }
}

export { OpenReviewActor as OpenreviewActor };
