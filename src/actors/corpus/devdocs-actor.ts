/**
 * DevDocsActor - Developer Documentation Harvester.
 * Fetches, searches, and converts official documentation across 100+ technologies
 * into clean, LLM-ready GitHub-Flavored Markdown.
 * Conforms to docs/actor-contract.md and docs/actors/devdocs.md.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  DevDocEntry,
  DevDocMeta,
  DevDocsActorResult,
  DevDocsActorTaskOptions,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const DEVDOCS_BASE_URL = "https://devdocs.io";
const DOCUMENTS_BASE_URL = "https://documents.devdocs.io";

export class DevDocsActor implements IActor<DevDocsActorResult> {
  readonly actorType = "devdocs" as const;
  readonly description =
    "Harvests official developer documentation, API references, guides, and docset indexes across 100+ technologies from DevDocs.";

  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      hr: "---",
    });

    this.turndown.addRule("preservePreCode", {
      filter: (node) => node.nodeName === "PRE",
      replacement: (_content, node) => {
        const el = node as unknown as {
          firstElementChild?: {
            className?: string;
            textContent?: string;
            getAttribute?: (name: string) => string | null;
          };
          textContent?: string;
        };
        const codeEl = el.firstElementChild;
        let language = "";
        const className =
          codeEl?.className ||
          (typeof codeEl?.getAttribute === "function" ? codeEl.getAttribute("class") : "") ||
          "";
        const match = className.match(/language-([a-zA-Z0-9_-]+)/);
        if (match?.[1]) {
          language = match[1];
        }
        const text = (codeEl?.textContent || el.textContent || "").trim();
        return `\n\`\`\`${language}\n${text}\n\`\`\`\n`;
      },
    });
  }

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<DevDocsActorResult>> {
    const startTime = context?.startTime || Date.now();
    const opts = (task.options?.devdocsOptions || {}) as DevDocsActorTaskOptions;
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

    let action: "list_docs" | "search" | "entry" = opts.action || "list_docs";
    let doc = opts.doc || "";
    let path = opts.path || "";
    let query = opts.query || "";
    const category = opts.category || "";
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;

    // URL parameter extraction
    const targetUrl = task.targetUrl || "";
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const pathname = parsed.pathname;

        if (
          pathname === "/docs/docs.json" ||
          pathname === "/docs" ||
          pathname === "/" ||
          pathname === ""
        ) {
          action = "list_docs";
        } else {
          const parts = pathname.replace(/^\/+/, "").split("/");
          if (parts.length > 0 && parts[0]) {
            doc = decodeURIComponent(parts[0]);
            if (parts.length > 1 && parts.slice(1).join("/")) {
              const subpath = parts.slice(1).join("/");
              if (subpath === "index.json") {
                action = "search";
              } else {
                action = "entry";
                path = subpath;
              }
            } else if (parsed.searchParams.has("q")) {
              action = "search";
              query = parsed.searchParams.get("q") || "";
            } else if (parsed.hash.startsWith("#q=")) {
              action = "search";
              query = decodeURIComponent(parsed.hash.replace(/^#q=/, ""));
            } else {
              if (query) {
                action = "search";
              } else {
                action = "list_docs";
              }
            }
          }
        }
      } catch {
        // Fall back to options
      }
    }

    if (!action) {
      action = doc && path ? "entry" : doc && query ? "search" : "list_docs";
    }

    try {
      if (action === "entry") {
        if (!doc) doc = "rust";
        if (!path) path = "book/ch01-00-getting-started";

        const cleanPath = path.replace(/\.html$/, "");
        const entryUrl =
          targetUrl && (targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost"))
            ? targetUrl.endsWith(".html")
              ? targetUrl
              : `${targetUrl}.html`
            : `${DOCUMENTS_BASE_URL}/${encodeURIComponent(doc)}/${cleanPath}.html`;

        const ssrfValidation = await SSRFGuard.validateUrlWithDns(entryUrl, { allowLocalNetwork });
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
          const res = await safeRedirectFetch(entryUrl, {
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
              errorMessage: `DevDocs entry returned HTTP ${res.status}: ${res.statusText}`,
              executionDurationMs: Date.now() - startTime,
            };
          }
          html = await res.text();
        } finally {
          clearTimeout(timeoutId);
        }

        const $ = cheerio.load(html);
        $("script, style, noscript, svg, iframe, ._attribution").remove();

        const title = $("h1, h2").first().text().trim() || cleanPath;
        const bodyContent = $("body").html() || html;
        const markdownBody = this.turndown.turndown(bodyContent);

        const fullMarkdown = [
          `# DevDocs: ${doc} - ${title}`,
          `**Source**: \`${entryUrl}\``,
          `**Docset**: \`${doc}\``,
          `**Path**: \`${cleanPath}\``,
          "",
          "---",
          "",
          markdownBody,
        ].join("\n");

        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "completed",
          statusCode: responseStatus,
          data: {
            action: "entry",
            queryUrl: entryUrl,
            totalResults: 1,
            doc,
            path: cleanPath,
            title,
            markdown: fullMarkdown,
          },
          executionDurationMs: Date.now() - startTime,
        };
      }

      if (action === "search") {
        if (!doc) doc = "rust";
        const indexUrl =
          targetUrl && (targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost"))
            ? targetUrl
            : `${DOCUMENTS_BASE_URL}/${encodeURIComponent(doc)}/index.json`;

        const ssrfValidation = await SSRFGuard.validateUrlWithDns(indexUrl, { allowLocalNetwork });
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

        let indexData: { entries?: DevDocEntry[]; types?: unknown[] } = {};
        let responseStatus = 200;
        try {
          const res = await safeRedirectFetch(indexUrl, {
            signal: controller.signal,
            headers: {
              "User-Agent": USER_AGENT,
              Accept: "application/json,text/plain,*/*",
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
              errorMessage: `DevDocs index returned HTTP ${res.status}: ${res.statusText}`,
              executionDurationMs: Date.now() - startTime,
            };
          }
          indexData = (await res.json()) as { entries?: DevDocEntry[] };
        } finally {
          clearTimeout(timeoutId);
        }

        const rawEntries: DevDocEntry[] = indexData.entries || [];
        const normalizedQuery = query.toLowerCase().trim();

        const filtered = normalizedQuery
          ? rawEntries.filter(
              (e) =>
                e.name.toLowerCase().includes(normalizedQuery) ||
                e.path.toLowerCase().includes(normalizedQuery) ||
                e.type?.toLowerCase().includes(normalizedQuery)
            )
          : rawEntries;

        const sliced = filtered.slice(0, limit);

        const markdownLines = [
          `# DevDocs Search: ${doc} - "${query}"`,
          `**Docset**: \`${doc}\``,
          `**Matches**: ${filtered.length} found (showing ${sliced.length})`,
          "",
          "| Name | Path | Type |",
          "|---|---|---|",
        ];

        for (const item of sliced) {
          const safeName = item.name.replace(/\|/g, "\\|");
          const safePath = item.path.replace(/\|/g, "\\|");
          const safeType = (item.type || "").replace(/\|/g, "\\|");
          markdownLines.push(
            `| [${safeName}](${DEVDOCS_BASE_URL}/${doc}/${safePath}) | \`${safePath}\` | ${safeType} |`
          );
        }

        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "completed",
          statusCode: responseStatus,
          data: {
            action: "search",
            queryUrl: indexUrl,
            totalResults: filtered.length,
            doc,
            title: `DevDocs Search: ${doc} - ${query}`,
            entries: sliced,
            markdown: markdownLines.join("\n"),
          },
          executionDurationMs: Date.now() - startTime,
        };
      }

      // Default: list_docs
      const docsUrl =
        targetUrl && (targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost"))
          ? targetUrl
          : `${DEVDOCS_BASE_URL}/docs/docs.json`;

      const ssrfValidation = await SSRFGuard.validateUrlWithDns(docsUrl, { allowLocalNetwork });
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

      let docsList: DevDocMeta[] = [];
      let responseStatus = 200;
      try {
        const res = await safeRedirectFetch(docsUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json,text/plain,*/*",
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
            errorMessage: `DevDocs docs list returned HTTP ${res.status}: ${res.statusText}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
        docsList = (await res.json()) as DevDocMeta[];
      } finally {
        clearTimeout(timeoutId);
      }

      let filtered = docsList;
      if (category) {
        const catLower = category.toLowerCase();
        filtered = filtered.filter((d) => d.type?.toLowerCase() === catLower);
      }
      if (query) {
        const qLower = query.toLowerCase();
        filtered = filtered.filter(
          (d) =>
            d.name.toLowerCase().includes(qLower) ||
            d.slug.toLowerCase().includes(qLower) ||
            d.alias?.toLowerCase().includes(qLower)
        );
      }

      const sliced = filtered.slice(0, limit);

      const markdownLines = [
        "# DevDocs Documentation Directory",
        `**Total Available Docsets**: ${docsList.length} (filtered: ${filtered.length}, showing: ${sliced.length})`,
        "",
        "| Name | Slug | Type | Version / Release | Home |",
        "|---|---|---|---|---|",
      ];

      for (const d of sliced) {
        const name = d.name.replace(/\|/g, "\\|");
        const slug = d.slug.replace(/\|/g, "\\|");
        const type = (d.type || "").replace(/\|/g, "\\|");
        const ver = (d.release || d.version || "").replace(/\|/g, "\\|");
        const home = d.links?.home ? `[Link](${d.links.home})` : "-";
        markdownLines.push(`| **${name}** | \`${slug}\` | ${type} | ${ver} | ${home} |`);
      }

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: responseStatus,
        data: {
          action: "list_docs",
          queryUrl: docsUrl,
          totalResults: filtered.length,
          title: "DevDocs Documentation Catalog",
          docs: sliced,
          markdown: markdownLines.join("\n"),
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
          : `DevDocs actor extraction failed: ${message}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }
}
