/**
 * HackerNewsActor - Extraction actor for Y Combinator Hacker News
 * engineering discussions, architecture post-mortems, and comment trees.
 * Conforms to docs/actor-contract.md and docs/actors/hacker-news.md.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  HackerNewsActorResult,
  HackerNewsActorTaskOptions,
  HackerNewsCommentItem,
  HackerNewsStoryItem,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const HN_ALGOLIA_BASE = "https://hn.algolia.com/api/v1";

/**
 * Converts Hacker News HTML comment formatting to clean GFM Markdown.
 */
function cleanHnHtml(html?: string): string {
  if (!html) return "";
  let text = html;

  text = text.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, "\n```\n$1\n```\n");
  text = text.replace(/<p>/gi, "\n\n");
  text = text.replace(/<\/p>/gi, "");
  text = text.replace(/<i>(.*?)<\/i>/gi, "*$1*");
  text = text.replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  text = text.replace(/<[^>]+>/g, ""); // Strip any remaining tags

  // Decode common HTML entities
  text = text
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

  return text.trim();
}

export class HackerNewsActor implements IActor<HackerNewsActorResult> {
  readonly actorType = "hacker-news" as const;
  readonly description =
    "Y Combinator Hacker News engineering discussions, architecture post-mortems, and comment trees extraction actor.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<HackerNewsActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: HackerNewsActorTaskOptions =
      task.options?.hackerNewsOptions || (task.options as HackerNewsActorTaskOptions) || {};
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
      const { action, storyId, query } = this.resolveParameters(task.targetUrl, options);

      // 3. Resolve upstream API endpoint URL
      const endpoint = this.buildEndpointUrl(
        task.targetUrl,
        action,
        storyId,
        query,
        options.limit || 20
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
          errorMessage: `Hacker News API request failed with HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 6. Parse response data and render Markdown
      const rawText = await response.text();
      const maxComments = options.maxComments || 50;
      const { stories, markdown } = this.parseResponse(action, rawText, endpoint, maxComments);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          action,
          totalStories: stories.length,
          stories,
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
   * Resolves action, storyId, and query from targetUrl or options.
   */
  resolveParameters(
    targetUrl?: string,
    options?: HackerNewsActorTaskOptions
  ): {
    action: "top" | "best" | "new" | "ask" | "show" | "story" | "search";
    storyId?: number;
    query?: string;
  } {
    let action = options?.action || "top";
    let storyId = options?.storyId;
    const query = options?.query?.trim();

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const searchParams = parsed.searchParams;

        if (searchParams.has("id")) {
          action = "story";
          const idNum = Number.parseInt(searchParams.get("id") || "", 10);
          if (!Number.isNaN(idNum)) storyId = idNum;
        } else if (parsed.pathname.includes("/items/")) {
          action = "story";
          const match = parsed.pathname.match(/\/items\/(\d+)/);
          if (match) storyId = Number.parseInt(match[1], 10);
        } else if (parsed.pathname.includes("/ask")) {
          action = "ask";
        } else if (parsed.pathname.includes("/show")) {
          action = "show";
        } else if (parsed.pathname.includes("/newest") || parsed.pathname.includes("/new")) {
          action = "new";
        } else if (parsed.pathname.includes("/best")) {
          action = "best";
        }
      } catch {
        // Keep existing options
      }
    }

    if (storyId && action !== "story") {
      action = "story";
    }

    return { action, storyId, query };
  }

  /**
   * Constructs the Hacker News API URL.
   */
  buildEndpointUrl(
    targetUrl: string | undefined,
    action: string,
    storyId?: number,
    query?: string,
    limit: number = 20
  ): string {
    if (
      targetUrl &&
      (targetUrl.includes("hn.algolia.com") ||
        targetUrl.includes("firebaseio.com") ||
        (targetUrl.startsWith("http://127.0.0.1") &&
          (targetUrl.includes("/items/") ||
            targetUrl.includes("/search") ||
            targetUrl.includes("/item/"))))
    ) {
      return targetUrl;
    }

    if (action === "story" && storyId) {
      return `${HN_ALGOLIA_BASE}/items/${storyId}`;
    }

    if (query) {
      return `${HN_ALGOLIA_BASE}/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`;
    }

    switch (action) {
      case "ask":
        return `${HN_ALGOLIA_BASE}/search?tags=ask_hn&hitsPerPage=${limit}`;
      case "show":
        return `${HN_ALGOLIA_BASE}/search?tags=show_hn&hitsPerPage=${limit}`;
      case "new":
        return `${HN_ALGOLIA_BASE}/search_by_date?tags=story&hitsPerPage=${limit}`;
      default:
        return `${HN_ALGOLIA_BASE}/search?tags=front_page&hitsPerPage=${limit}`;
    }
  }

  /**
   * Parses JSON API response into structured stories and comments.
   */
  private parseResponse(
    action: string,
    rawText: string,
    endpointUrl: string,
    maxComments: number
  ): { stories: HackerNewsStoryItem[]; markdown: string } {
    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      return { stories: [], markdown: "" };
    }

    const stories: HackerNewsStoryItem[] = [];

    if (action === "story" || (data && typeof data === "object" && "children" in data)) {
      // Single story with nested comment tree
      const s = data as Record<string, unknown>;
      const story: HackerNewsStoryItem = {
        id: Number(s.id || 0),
        title: String(s.title || "Untitled"),
        url: s.url ? String(s.url) : undefined,
        author: s.author ? String(s.author) : undefined,
        points: typeof s.points === "number" ? s.points : undefined,
        commentsCount: Array.isArray(s.children) ? s.children.length : undefined,
        time: typeof s.created_at_i === "number" ? s.created_at_i : undefined,
        text: cleanHnHtml(s.text ? String(s.text) : undefined),
        comments: this.parseCommentTree(s.children as Array<Record<string, unknown>>, maxComments),
      };
      stories.push(story);
    } else if (
      data &&
      typeof data === "object" &&
      Array.isArray((data as Record<string, unknown>).hits)
    ) {
      // Search or front page listing
      const hits = (data as Record<string, unknown>).hits as Array<Record<string, unknown>>;
      for (const h of hits) {
        stories.push({
          id: Number(h.objectID || h.id || 0),
          title: String(h.title || "Untitled"),
          url: h.url ? String(h.url) : undefined,
          author: h.author ? String(h.author) : undefined,
          points: typeof h.points === "number" ? h.points : undefined,
          commentsCount: typeof h.num_comments === "number" ? h.num_comments : undefined,
          time: typeof h.created_at_i === "number" ? h.created_at_i : undefined,
          text: cleanHnHtml(h.story_text ? String(h.story_text) : undefined),
        });
      }
    } else if (Array.isArray(data)) {
      // Flat list of items
      for (const item of data) {
        if (item && typeof item === "object") {
          stories.push({
            id: Number(item.id || 0),
            title: String(item.title || "Untitled"),
            url: item.url ? String(item.url) : undefined,
            author: item.by ? String(item.by) : item.author ? String(item.author) : undefined,
            points: typeof item.score === "number" ? item.score : item.points,
            commentsCount: Array.isArray(item.kids) ? item.kids.length : undefined,
          });
        }
      }
    }

    const markdown = this.renderMarkdown(action, stories, endpointUrl);
    return { stories, markdown };
  }

  /**
   * Recursively parses nested comment trees.
   */
  private parseCommentTree(
    rawChildren: Array<Record<string, unknown>> | undefined,
    maxCount: number,
    currentCount = { val: 0 }
  ): HackerNewsCommentItem[] {
    if (!Array.isArray(rawChildren) || currentCount.val >= maxCount) {
      return [];
    }

    const results: HackerNewsCommentItem[] = [];

    for (const c of rawChildren) {
      if (!c || currentCount.val >= maxCount) break;
      currentCount.val++;

      const comment: HackerNewsCommentItem = {
        id: Number(c.id || 0),
        author: c.author ? String(c.author) : undefined,
        text: cleanHnHtml(c.text ? String(c.text) : undefined),
        time: typeof c.created_at_i === "number" ? c.created_at_i : undefined,
        parentId: typeof c.parent_id === "number" ? c.parent_id : undefined,
      };

      if (Array.isArray(c.children) && c.children.length > 0 && currentCount.val < maxCount) {
        comment.children = this.parseCommentTree(
          c.children as Array<Record<string, unknown>>,
          maxCount,
          currentCount
        );
      }

      results.push(comment);
    }

    return results;
  }

  /**
   * Renders Hacker News stories and nested comments to GFM Markdown.
   */
  private renderMarkdown(
    action: string,
    stories: HackerNewsStoryItem[],
    endpointUrl: string
  ): string {
    const lines: string[] = [];
    lines.push("# Hacker News Engineering & Architecture Discussions");
    lines.push(
      `**İşlem:** ${action} | **Toplam Başlık:** ${stories.length} | **Kaynak API:** [${endpointUrl}](${endpointUrl})\n`
    );

    if (action === "story" && stories.length === 1) {
      const s = stories[0];
      lines.push(`## ${s.title}`);
      lines.push(
        `* **Puan:** ${s.points ?? 0} | **Yazar:** @${s.author || "anon"} | **ID:** \`${s.id}\``
      );
      if (s.url) {
        lines.push(`* **Bağlantı:** [${s.url}](${s.url})`);
      }
      lines.push(
        `* **HN Tartışması:** [Hacker News #${s.id}](https://news.ycombinator.com/item?id=${s.id})`
      );

      if (s.text) {
        lines.push(`\n### Gönderi Metni\n${s.text}\n`);
      }

      lines.push("\n### Yorumlar ve Tartışma Ağacı\n");
      if (s.comments && s.comments.length > 0) {
        this.renderCommentsMarkdown(s.comments, lines, 0);
      } else {
        lines.push("*Henüz yorum bulunmuyor.*");
      }

      return lines.join("\n");
    }

    // Default multi-story list
    for (const s of stories) {
      lines.push(`## ${s.title}`);
      lines.push(
        `* **Puan:** ${s.points ?? 0} | **Yorum Sayısı:** ${s.commentsCount ?? 0} | **Yazar:** @${s.author || "anon"}`
      );
      if (s.url) {
        lines.push(`* **Bağlantı:** [${s.url}](${s.url})`);
      }
      lines.push(
        `* **Tartışma:** [Hacker News #${s.id}](https://news.ycombinator.com/item?id=${s.id})`
      );

      if (s.text) {
        lines.push(`\n> ${s.text.replace(/\n/g, "\n> ")}\n`);
      }
      lines.push("---\n");
    }

    return lines.join("\n");
  }

  /**
   * Helper to format recursive comment indentation.
   */
  private renderCommentsMarkdown(
    comments: HackerNewsCommentItem[],
    lines: string[],
    depth: number
  ): void {
    const prefix = "> ".repeat(depth);

    for (const c of comments) {
      lines.push(`${prefix}**@${c.author || "anon"}** (ID: ${c.id}):`);
      if (c.text) {
        const indentedText = c.text
          .split("\n")
          .map((line) => `${prefix}${line}`)
          .join("\n");
        lines.push(`${indentedText}\n`);
      }
      if (c.children && c.children.length > 0) {
        this.renderCommentsMarkdown(c.children, lines, depth + 1);
      }
    }
  }
}
