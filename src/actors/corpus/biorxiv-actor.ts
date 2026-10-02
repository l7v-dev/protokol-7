/**
 * BiorxivActor - Cold Spring Harbor Laboratory bioRxiv & medRxiv preprint actor.
 *
 * Interfaces with the CSHL Details REST API to search and retrieve preprints in biology,
 * genomics, neuroscience, bioinformatics, clinical medicine, and public health.
 *
 * API Base: https://api.biorxiv.org/details
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  BiorxivActorResult,
  BiorxivActorTaskOptions,
  BiorxivArticleItem,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const CSHL_DETAILS_BASE = "https://api.biorxiv.org/details";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 30;

interface RawCshlMessage {
  status?: string;
  count?: number | string;
  total?: number | string;
  cursor?: number | string;
  category?: string;
  interval?: string;
}

interface RawCshlArticle {
  doi?: string;
  title?: string;
  authors?: string;
  author_corresponding?: string;
  author_corresponding_institution?: string;
  date?: string;
  version?: string;
  type?: string;
  license?: string;
  category?: string;
  jatsxml?: string;
  abstract?: string;
  published?: string;
  server?: string;
}

interface RawCshlResponse {
  messages?: RawCshlMessage[];
  collection?: RawCshlArticle[];
}

export class BiorxivActor implements IActor<BiorxivActorResult> {
  readonly actorType = "biorxiv" as const;
  readonly description =
    "Queries Cold Spring Harbor Laboratory (CSHL) bioRxiv and medRxiv REST API for biology and health sciences preprints, metadata, abstracts, and author affiliations.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<BiorxivActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: BiorxivActorTaskOptions = task.options?.biorxivOptions || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    const server = (options.server || "biorxiv").toLowerCase();
    const targetServer = server === "medrxiv" ? "medrxiv" : "biorxiv";

    try {
      // 1. Resolve query URL based on DOI or interval/category search
      const resolvedQueryUrl = this.buildApiUrl(task.targetUrl, options, targetServer);

      // 2. Validate URL against SSRF policy
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(resolvedQueryUrl, {
        allowLocalNetwork,
      });

      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 3. Execute HTTP request
      const response = await safeRedirectFetch(resolvedQueryUrl, {
        headers: {
          "User-Agent":
            "protokol-7/1.0.0 (Preprint Metadata Ingestion Engine; mailto:l7v-dev@protokol.local)",
          Accept: "application/json",
        },
        timeoutMs,
        maxRedirects: 3,
        allowLocalNetwork,
      });

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `CSHL bioRxiv API error: HTTP ${response.status} ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const rawJson = (await response.json()) as RawCshlResponse;
      const messages = rawJson.messages || [];
      const msg0 = messages[0] || {};
      const rawCollection = rawJson.collection || [];

      let totalCount = 0;
      if (typeof msg0.total === "number") {
        totalCount = msg0.total;
      } else if (typeof msg0.total === "string" && /^\d+$/.test(msg0.total)) {
        totalCount = parseInt(msg0.total, 10);
      } else {
        totalCount = rawCollection.length;
      }

      const cursor =
        typeof msg0.cursor === "number"
          ? msg0.cursor
          : typeof msg0.cursor === "string" && /^\d+$/.test(msg0.cursor)
            ? parseInt(msg0.cursor, 10)
            : options.cursor || 0;

      // 4. Client-side query filter if search query is specified
      let filtered = rawCollection;
      if (options.query && options.query.trim().length > 0) {
        const queryTerms = options.query.toLowerCase().split(/\s+/).filter(Boolean);
        filtered = rawCollection.filter((item) => {
          const haystack =
            `${item.title || ""} ${item.abstract || ""} ${item.authors || ""}`.toLowerCase();
          return queryTerms.every((term) => haystack.includes(term));
        });
      }

      // 5. Limit articles
      const limit = options.limit || DEFAULT_LIMIT;
      const limitedCollection = filtered.slice(0, limit);

      // 6. Map to structured items
      const articles: BiorxivArticleItem[] = limitedCollection.map((item) => {
        const itemDoi = item.doi || "";
        const title = item.title || "";
        const itemServer = (item.server || targetServer).toLowerCase();
        const category = item.category || options.category || "general";
        const pubDate = item.date;
        const pubYear = pubDate ? parseInt(pubDate.slice(0, 4), 10) || undefined : undefined;
        const version = item.version ? parseInt(item.version, 10) || 1 : 1;
        const authors = item.authors;
        const correspondingAuthor = item.author_corresponding;
        const institution = item.author_corresponding_institution;
        const license = item.license;
        const publishedDoi =
          item.published && item.published.toLowerCase() !== "na" ? item.published : undefined;
        const abstractText = item.abstract;
        const jatsxmlUrl = item.jatsxml;

        const articleMd = this.synthesizeArticleMarkdown({
          doi: itemDoi,
          title,
          server: itemServer,
          category,
          pubDate,
          version,
          authors,
          institution,
          license,
          publishedDoi,
          abstractText,
        });

        return {
          doi: itemDoi,
          title,
          server: itemServer,
          category,
          pubDate,
          pubYear,
          version,
          authors,
          correspondingAuthor,
          institution,
          license,
          publishedDoi,
          abstractText,
          jatsxmlUrl,
          markdown: articleMd,
        };
      });

      // 7. Synthesize overall Markdown
      const overallMarkdown = this.synthesizeOverallMarkdown({
        server: targetServer,
        totalCount,
        cursor,
        articles,
        query: options.query,
        category: options.category,
        interval: options.interval,
        doi: options.doi,
      });

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          server: targetServer,
          totalCount,
          cursor,
          articles,
          queryUrl: resolvedQueryUrl,
          markdown: overallMarkdown,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `BiorxivActor execution failure: ${msg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private buildApiUrl(
    targetUrl: string | undefined,
    options: BiorxivActorTaskOptions,
    server: string
  ): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return targetUrl;
    }

    if (options.doi) {
      const cleanDoi = options.doi.trim();
      return `${CSHL_DETAILS_BASE}/${server}/${cleanDoi}`;
    }

    const cursor = options.cursor || 0;
    const interval = options.interval
      ? options.interval.replace(/:/g, "/")
      : "2026-01-01/2026-10-02";

    let url = `${CSHL_DETAILS_BASE}/${server}/${interval}/${cursor}/json`;
    if (options.category) {
      const encodedCat = encodeURIComponent(options.category.toLowerCase().replace(/ /g, "_"));
      url += `?category=${encodedCat}`;
    }

    return url;
  }

  private synthesizeArticleMarkdown(item: {
    doi: string;
    title: string;
    server: string;
    category: string;
    pubDate?: string;
    version?: number;
    authors?: string;
    institution?: string;
    license?: string;
    publishedDoi?: string;
    abstractText?: string;
  }): string {
    const lines = [`# ${item.title}`, ""];
    const metaParts = [];

    if (item.authors) {
      metaParts.push(`**Authors:** ${item.authors}`);
    }
    metaParts.push(`**Server:** ${item.server.toUpperCase()}`);
    if (item.category) {
      metaParts.push(`**Category:** ${item.category}`);
    }
    metaParts.push(`**DOI:** [${item.doi}](https://doi.org/${item.doi}) (v${item.version || 1})`);
    if (item.pubDate) {
      metaParts.push(`**Date:** ${item.pubDate}`);
    }
    if (item.institution) {
      metaParts.push(`**Institution:** ${item.institution}`);
    }
    if (item.license) {
      metaParts.push(`**License:** ${item.license}`);
    }
    if (item.publishedDoi) {
      metaParts.push(`**Published:** [${item.publishedDoi}](https://doi.org/${item.publishedDoi})`);
    }

    lines.push(metaParts.join(" | "));
    lines.push("");

    if (item.abstractText) {
      lines.push("## Abstract");
      lines.push(item.abstractText);
      lines.push("");
    }

    return lines.join("\n").trim();
  }

  private synthesizeOverallMarkdown(meta: {
    server: string;
    totalCount: number;
    cursor: number;
    articles: BiorxivArticleItem[];
    query?: string;
    category?: string;
    interval?: string;
    doi?: string;
  }): string {
    const lines = [
      `# ${meta.server === "medrxiv" ? "medRxiv" : "bioRxiv"} Preprint Corpus Results`,
      "",
      `| Metric | Value |`,
      `| --- | --- |`,
      `| **Server** | ${meta.server.toUpperCase()} |`,
      `| **Total Matching** | ${meta.totalCount} |`,
      `| **Returned Articles** | ${meta.articles.length} |`,
      `| **Cursor Offset** | ${meta.cursor} |`,
    ];

    if (meta.doi) lines.push(`| **DOI Filter** | \`${meta.doi}\` |`);
    if (meta.query) lines.push(`| **Query Filter** | \`${meta.query}\` |`);
    if (meta.category) lines.push(`| **Category** | \`${meta.category}\` |`);
    if (meta.interval) lines.push(`| **Date Interval** | \`${meta.interval}\` |`);

    lines.push("");

    if (meta.articles.length === 0) {
      lines.push("*No preprint articles found matching the specified parameters.*");
      return lines.join("\n");
    }

    lines.push("## Articles");
    lines.push("");

    for (let i = 0; i < meta.articles.length; i++) {
      const art = meta.articles[i];
      lines.push(`### ${i + 1}. ${art.title}`);
      lines.push(
        `- **DOI:** [${art.doi}](https://doi.org/${art.doi}) (v${art.version || 1}) | **Category:** ${art.category} | **Date:** ${art.pubDate || "N/A"}`
      );
      if (art.authors) {
        lines.push(`- **Authors:** ${art.authors}`);
      }
      if (art.institution) {
        lines.push(`- **Institution:** ${art.institution}`);
      }
      if (art.abstractText) {
        const snippet =
          art.abstractText.length > 300 ? `${art.abstractText.slice(0, 300)}...` : art.abstractText;
        lines.push(`- **Abstract:** ${snippet}`);
      }
      lines.push("");
    }

    return lines.join("\n").trim();
  }
}
