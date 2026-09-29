/**
 * PapersWithCodeActor - Machine Learning Papers, Benchmarks, and Code Repositories Harvester.
 * Harvests academic ML papers, arXiv IDs, official GitHub implementations, benchmarks,
 * and AI summaries from Papers With Code and Hugging Face Papers.
 * Conforms to docs/actor-contract.md and docs/actors/papers-with-code.md.
 */

import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  PapersWithCodeActorResult,
  PapersWithCodeActorTaskOptions,
  PapersWithCodePaperRecord,
  PapersWithCodeRepo,
  PapersWithCodeSearchResultItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const HF_PAPERS_API_URL = "https://huggingface.co/api/papers";
const HF_DAILY_PAPERS_API_URL = "https://huggingface.co/api/daily_papers";
const HF_PAPERS_BASE_URL = "https://huggingface.co/papers";

interface HfAuthor {
  name: string;
  user?: {
    fullname?: string;
    name?: string;
  };
}

interface HfPaperApiResponse {
  id: string;
  title: string;
  summary?: string;
  ai_summary?: string;
  publishedAt?: string;
  upvotes?: number;
  authors?: HfAuthor[];
  linkedModels?: string[];
  linkedDatasets?: string[];
  linkedSpaces?: string[];
}

export class PapersWithCodeActor implements IActor<PapersWithCodeActorResult> {
  readonly actorType = "papers-with-code" as const;
  readonly description =
    "Harvests machine learning papers, official GitHub code repositories, arXiv abstracts, and benchmark tasks from Papers With Code & Hugging Face Papers.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<PapersWithCodeActorResult>> {
    const startTime = context?.startTime || Date.now();
    const opts = (task.options?.papersWithCodeOptions || {}) as PapersWithCodeActorTaskOptions;
    const timeoutMs = opts.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    // Initial SSRF check on targetUrl if provided
    if (
      task.targetUrl &&
      (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
    ) {
      const initialCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
        allowLocalNetwork,
      });
      if (!initialCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed: ${initialCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }
    }

    let action: "paper" | "search" | "trending" | "daily" = opts.action || "paper";
    let paper = opts.paper || "";
    let arxivId = opts.arxivId || "";
    let query = opts.query || "";
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 10;

    // URL parameter extraction
    const targetUrl = task.targetUrl || "";
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const pathname = parsed.pathname;

        if (pathname.includes("/paper/")) {
          action = "paper";
          const match = pathname.match(/\/paper\/([^/?#]+)/);
          if (match?.[1]) {
            paper = decodeURIComponent(match[1]);
          }
        } else if (
          pathname.includes("/papers/trending") ||
          pathname === "/papers" ||
          pathname === "/papers/"
        ) {
          action = "trending";
        } else if (pathname.includes("/papers/")) {
          action = "paper";
          const match = pathname.match(/\/papers\/([^/?#]+)/);
          if (match?.[1]) {
            const rawId = decodeURIComponent(match[1]);
            if (/^\d{4}\.\d{4,5}(v\d+)?$/.test(rawId)) {
              arxivId = rawId.replace(/v\d+$/, "");
            } else {
              paper = rawId;
            }
          }
        } else if (parsed.searchParams.has("q") || parsed.searchParams.has("q_term")) {
          action = "search";
          query = parsed.searchParams.get("q") || parsed.searchParams.get("q_term") || "";
        }
      } catch {
        // Fall back to options
      }
    }

    // Direct arxivId detection from paper string
    if (!arxivId && paper) {
      const arxivMatch = paper.match(/(\d{4}\.\d{4,5})/);
      if (arxivMatch?.[1]) {
        arxivId = arxivMatch[1];
      }
    }

    if (!arxivId && !paper && !query && action === "paper") {
      arxivId = "1706.03762";
    }

    try {
      if (action === "trending" || action === "daily") {
        const dailyUrl =
          targetUrl && (targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost"))
            ? targetUrl
            : HF_DAILY_PAPERS_API_URL;

        const ssrfValidation = await SSRFGuard.validateUrlWithDns(dailyUrl, { allowLocalNetwork });
        if (!ssrfValidation.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${ssrfValidation.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        let rawPapers: Array<{ paper?: HfPaperApiResponse; title?: string }> = [];
        let responseStatus = 200;
        try {
          const res = await safeRedirectFetch(dailyUrl, {
            signal: controller.signal,
            headers: {
              "User-Agent": USER_AGENT,
              Accept: "application/json",
            },
            allowLocalNetwork,
          });
          responseStatus = res.status;
          if (!res.ok) {
            return {
              taskId: task.taskId,
              actorType: this.actorType,
              status: "failed",
              statusCode: res.status,
              errorMessage: `Daily papers API returned HTTP ${res.status}: ${res.statusText}`,
              executionDurationMs: Date.now() - startTime,
            };
          }
          rawPapers = (await res.json()) as typeof rawPapers;
        } finally {
          clearTimeout(timeoutId);
        }

        const papersList = rawPapers.slice(0, limit).map((entry) => {
          const p = entry.paper || (entry as unknown as HfPaperApiResponse);
          const authors = (p.authors || [])
            .map((a) => a.user?.fullname || a.user?.name || a.name)
            .filter(Boolean);
          const paperRecord: PapersWithCodePaperRecord = {
            id: p.id,
            title: p.title,
            url: `${HF_PAPERS_BASE_URL}/${p.id}`,
            arxivId: p.id,
            publishedAt: p.publishedAt,
            authors,
            summary: p.summary || "",
            aiSummary: p.ai_summary,
            upvotes: p.upvotes,
            linkedModels: p.linkedModels,
            linkedDatasets: p.linkedDatasets,
            markdown: "",
          };
          return paperRecord;
        });

        const markdownLines = [
          "# Trending Machine Learning Research Papers",
          `**Source**: \`${HF_PAPERS_BASE_URL}/trending\``,
          `**Total Retrieved**: ${papersList.length}`,
          "",
          "| Title | arXiv ID | Upvotes | Published | Authors |",
          "|---|---|---|---|---|",
        ];

        for (const p of papersList) {
          const safeTitle = p.title.replace(/\|/g, "\\|");
          const authorsStr =
            p.authors.slice(0, 3).join(", ") + (p.authors.length > 3 ? " et al." : "");
          markdownLines.push(
            `| [${safeTitle}](${p.url}) | \`${p.arxivId}\` | ${p.upvotes || 0} | ${p.publishedAt?.split("T")[0] || "-"} | ${authorsStr} |`
          );
        }

        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "completed",
          statusCode: responseStatus,
          data: {
            action,
            queryUrl: dailyUrl,
            totalResults: papersList.length,
            papers: papersList,
            markdown: markdownLines.join("\n"),
          },
          executionDurationMs: Date.now() - startTime,
        };
      }

      if (action === "search") {
        if (!query) query = "transformer";
        const searchWebUrl =
          targetUrl && (targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost"))
            ? targetUrl
            : `${HF_PAPERS_BASE_URL}?q=${encodeURIComponent(query)}`;

        const ssrfValidation = await SSRFGuard.validateUrlWithDns(searchWebUrl, {
          allowLocalNetwork,
        });
        if (!ssrfValidation.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${ssrfValidation.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        let html = "";
        let responseStatus = 200;
        try {
          const res = await safeRedirectFetch(searchWebUrl, {
            signal: controller.signal,
            headers: {
              "User-Agent": USER_AGENT,
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            allowLocalNetwork,
          });
          responseStatus = res.status;
          if (!res.ok) {
            return {
              taskId: task.taskId,
              actorType: this.actorType,
              status: "failed",
              statusCode: res.status,
              errorMessage: `Search request returned HTTP ${res.status}: ${res.statusText}`,
              executionDurationMs: Date.now() - startTime,
            };
          }
          html = await res.text();
        } finally {
          clearTimeout(timeoutId);
        }

        const $ = cheerio.load(html);
        const searchResults: PapersWithCodeSearchResultItem[] = [];

        $("article, a[href*='/papers/']").each((_, el) => {
          const href = $(el).attr("href") || "";
          const match = href.match(/\/papers\/(\d{4}\.\d{4,5})/);
          if (match?.[1]) {
            const id = match[1];
            if (!searchResults.some((s) => s.id === id)) {
              const titleEl = $(el).find("h3, h2").first();
              const title = titleEl.text().trim() || $(el).text().trim().split("\n")[0] || id;
              searchResults.push({
                id,
                title,
                url: `${HF_PAPERS_BASE_URL}/${id}`,
                arxivId: id,
                authors: [],
              });
            }
          }
        });

        const sliced = searchResults.slice(0, limit);

        const markdownLines = [
          `# Papers With Code Search: "${query}"`,
          `**Matches Found**: ${searchResults.length} (showing ${sliced.length})`,
          "",
          "| Title | arXiv ID | Link |",
          "|---|---|---|",
        ];

        for (const s of sliced) {
          const safeTitle = s.title.replace(/\|/g, "\\|");
          markdownLines.push(`| ${safeTitle} | \`${s.arxivId}\` | [View Paper](${s.url}) |`);
        }

        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "completed",
          statusCode: responseStatus,
          data: {
            action: "search",
            queryUrl: searchWebUrl,
            totalResults: searchResults.length,
            searchResults: sliced,
            markdown: markdownLines.join("\n"),
          },
          executionDurationMs: Date.now() - startTime,
        };
      }

      // Default: paper extraction
      if (!arxivId && paper) {
        arxivId = paper.toLowerCase().replace(/[^0-9.]/g, "");
      }
      if (!arxivId) {
        arxivId = "1706.03762";
      }

      const paperApiUrl =
        targetUrl && (targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost"))
          ? targetUrl.includes("/papers/")
            ? targetUrl.replace(/\/papers\/(\d{4}\.\d{4,5})/, "/$1")
            : targetUrl
          : `${HF_PAPERS_API_URL}/${arxivId}`;

      const ssrfValidation = await SSRFGuard.validateUrlWithDns(paperApiUrl, { allowLocalNetwork });
      if (!ssrfValidation.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed: ${ssrfValidation.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let paperData: HfPaperApiResponse | null = null;
      let responseStatus = 200;
      try {
        const res = await safeRedirectFetch(paperApiUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json",
          },
          allowLocalNetwork,
        });
        responseStatus = res.status;
        if (!res.ok) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: res.status,
            errorMessage: `Paper API returned HTTP ${res.status}: ${res.statusText}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
        paperData = (await res.json()) as HfPaperApiResponse;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!paperData?.id) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 404,
          errorMessage: `Paper with arXiv ID ${arxivId} not found`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const webUrl =
        targetUrl && (targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost"))
          ? targetUrl.includes("/papers/")
            ? targetUrl
            : `${new URL(targetUrl).origin}/papers/${paperData.id}`
          : `${HF_PAPERS_BASE_URL}/${paperData.id}`;

      const repos: PapersWithCodeRepo[] = [];
      try {
        const pageRes = await safeRedirectFetch(webUrl, {
          headers: { "User-Agent": USER_AGENT },
          allowLocalNetwork,
        });
        if (pageRes.ok) {
          const pageHtml = await pageRes.text();
          const $ = cheerio.load(pageHtml);
          $("a[href*='github.com']").each((_, el) => {
            const href = $(el).attr("href");
            if (
              href &&
              !href.includes("github.com/huggingface") &&
              !repos.some((r) => r.url === href)
            ) {
              repos.push({
                url: href,
                name: href.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, ""),
                isOfficial: true,
              });
            }
          });
        }
      } catch {
        // Fallback: repos empty
      }

      const authors = (paperData.authors || [])
        .map((a) => a.user?.fullname || a.user?.name || a.name)
        .filter(Boolean);

      const markdownLines: string[] = [
        `# ${paperData.title}`,
        `**arXiv ID**: [\`${paperData.id}\`](https://arxiv.org/abs/${paperData.id})`,
        `**Source**: \`${webUrl}\``,
        authors.length ? `**Author(s)**: ${authors.join(", ")}` : "",
        paperData.publishedAt ? `**Published**: ${paperData.publishedAt.split("T")[0]}` : "",
        paperData.upvotes !== undefined ? `**Upvotes**: ${paperData.upvotes}` : "",
        "",
      ];

      if (paperData.ai_summary) {
        markdownLines.push("## AI Summary", paperData.ai_summary, "");
      }

      if (paperData.summary) {
        markdownLines.push("## Abstract", paperData.summary, "");
      }

      if (repos.length > 0) {
        markdownLines.push("## Code Implementations & Repositories", "");
        for (const r of repos) {
          markdownLines.push(
            `- [${r.name || r.url}](${r.url})${r.isOfficial ? " *(Official / Community)*" : ""}`
          );
        }
        markdownLines.push("");
      }

      if (paperData.linkedModels && paperData.linkedModels.length > 0) {
        markdownLines.push(
          "## Linked Models",
          paperData.linkedModels.map((m) => `- [\`${m}\`](https://huggingface.co/${m})`).join("\n"),
          ""
        );
      }

      if (paperData.linkedDatasets && paperData.linkedDatasets.length > 0) {
        markdownLines.push(
          "## Linked Datasets",
          paperData.linkedDatasets
            .map((d) => `- [\`${d}\`](https://huggingface.co/datasets/${d})`)
            .join("\n"),
          ""
        );
      }

      const fullMarkdown = markdownLines.filter(Boolean).join("\n");

      const paperRecord: PapersWithCodePaperRecord = {
        id: paperData.id,
        title: paperData.title,
        url: webUrl,
        arxivId: paperData.id,
        publishedAt: paperData.publishedAt,
        authors,
        summary: paperData.summary || "",
        aiSummary: paperData.ai_summary,
        upvotes: paperData.upvotes,
        codeRepositories: repos,
        linkedModels: paperData.linkedModels,
        linkedDatasets: paperData.linkedDatasets,
        markdown: fullMarkdown,
      };

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: responseStatus,
        data: {
          action: "paper",
          queryUrl: paperApiUrl,
          totalResults: 1,
          paper: paperRecord,
          markdown: fullMarkdown,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const isTimeout =
        (err instanceof Error && err.name === "AbortError") ||
        (typeof err === "object" && err !== null && "name" in err && err.name === "AbortError");
      const message = err instanceof Error ? err.message : String(err);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        statusCode: isTimeout ? 408 : 500,
        errorMessage: isTimeout
          ? `Request timed out after ${timeoutMs}ms`
          : `Papers With Code actor extraction failed: ${message}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }
}
