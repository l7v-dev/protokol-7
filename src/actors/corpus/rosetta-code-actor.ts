/**
 * RosettaCodeActor - Multi-language Algorithm and Code Comparison Harvester.
 * Harvests task implementations, algorithms, and data structures across 800+ programming languages
 * from Rosetta Code via MediaWiki API and structured HTML parsing.
 * Conforms to docs/actor-contract.md and docs/actors/rosetta-code.md.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  RosettaCodeActorResult,
  RosettaCodeActorTaskOptions,
  RosettaCodeImplementation,
  RosettaCodeSearchResultItem,
  RosettaCodeTaskDetails,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const ROSETTA_BASE_URL = "https://rosettacode.org";
const ROSETTA_API_URL = "https://rosettacode.org/w/api.php";

interface MediaWikiSearchItem {
  ns: number;
  title: string;
  pageid: number;
  size: number;
  wordcount: number;
  snippet: string;
  timestamp: string;
}

interface MediaWikiParseSection {
  toclevel: number;
  level: string;
  line: string;
  number: string;
  index: string;
  fromtitle: string;
  byteoffset: number;
  anchor: string;
}

export class RosettaCodeActor implements IActor<RosettaCodeActorResult> {
  readonly actorType = "rosetta-code" as const;
  readonly description =
    "Harvests multi-language algorithm implementations, code comparisons, and programming tasks across 800+ languages from Rosetta Code.";

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
        const element = node as unknown as {
          firstElementChild?: { className?: string; textContent?: string };
          textContent?: string;
        };
        const codeElement = element.firstElementChild;
        let language = "";
        if (codeElement) {
          const className = codeElement.className || "";
          const match = className.match(/language-(\w+)|source-(\w+)/);
          if (match) {
            language = match[1] || match[2] || "";
          }
        }
        const text = (codeElement?.textContent || element.textContent || "").trim();
        return `\n\`\`\`${language}\n${text}\n\`\`\`\n`;
      },
    });
  }

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<RosettaCodeActorResult>> {
    const startTime = context?.startTime || Date.now();
    const opts = (task.options?.rosettaCodeOptions || {}) as RosettaCodeActorTaskOptions;
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

    let action: "task" | "search" | "random" | "languages" = opts.action || "task";
    let taskName = opts.task || "";
    let language = opts.language || "";
    let query = opts.query || "";
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 10;

    // Resolve API URL (supports mock server in test environment)
    let apiBaseUrl = ROSETTA_API_URL;
    let webBaseUrl = ROSETTA_BASE_URL;
    const targetUrl = task.targetUrl || "";

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
          apiBaseUrl = `${parsed.origin}/w/api.php`;
          webBaseUrl = parsed.origin;
        }

        const pathname = parsed.pathname;
        if (pathname.includes("/wiki/")) {
          action = "task";
          const match = pathname.match(/\/wiki\/(.+)$/);
          if (match?.[1]) {
            taskName = decodeURIComponent(match[1]).replace(/_/g, " ");
          }
          if (parsed.hash) {
            language = decodeURIComponent(parsed.hash.replace(/^#/, "")).replace(/_/g, " ");
          }
        } else if (parsed.searchParams.has("search")) {
          action = "search";
          query = parsed.searchParams.get("search") || "";
        } else if (parsed.searchParams.has("page")) {
          action = "task";
          taskName = parsed.searchParams.get("page") || "";
        }
      } catch {
        // Fall back to options
      }
    }

    if (!taskName && !query && action === "task") {
      taskName = "100 doors";
    }

    try {
      if (action === "search") {
        if (!query) query = "Fibonacci";
        const searchApiUrl = `${apiBaseUrl}?action=query&list=search&srsearch=${encodeURIComponent(
          query
        )}&srlimit=${limit}&format=json`;

        const ssrfValidation = await SSRFGuard.validateUrlWithDns(searchApiUrl, {
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

        let data: { query?: { search?: MediaWikiSearchItem[] } } = {};
        let responseStatus = 200;
        try {
          const res = await safeRedirectFetch(searchApiUrl, {
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
              errorMessage: `Rosetta Code search returned HTTP ${res.status}: ${res.statusText}`,
              executionDurationMs: Date.now() - startTime,
            };
          }
          data = (await res.json()) as { query?: { search?: MediaWikiSearchItem[] } };
        } finally {
          clearTimeout(timeoutId);
        }

        const items = data.query?.search || [];
        const searchResults: RosettaCodeSearchResultItem[] = items.map((i) => ({
          title: i.title,
          snippet: cheerio
            .load(i.snippet || "")
            .text()
            .trim(),
          size: i.size,
          wordCount: i.wordcount,
        }));

        const markdownLines = [
          `# Rosetta Code Search: "${query}"`,
          `**Found**: ${items.length} tasks`,
          "",
          "| Task | Size | Words | Snippet |",
          "|---|---|---|---|",
        ];

        for (const s of searchResults) {
          const safeTitle = s.title.replace(/\|/g, "\\|");
          const safeSnippet = (s.snippet || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
          const link = `${webBaseUrl}/wiki/${encodeURIComponent(s.title.replace(/ /g, "_"))}`;
          markdownLines.push(
            `| [${safeTitle}](${link}) | ${s.size || "-"} | ${s.wordCount || "-"} | ${safeSnippet} |`
          );
        }

        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "completed",
          statusCode: responseStatus,
          data: {
            action: "search",
            queryUrl: searchApiUrl,
            totalResults: searchResults.length,
            searchResults,
            markdown: markdownLines.join("\n"),
          },
          executionDurationMs: Date.now() - startTime,
        };
      }

      if (action === "random") {
        const randomApiUrl = `${apiBaseUrl}?action=query&list=random&rnnamespace=0&rnlimit=1&format=json`;

        const ssrfValidation = await SSRFGuard.validateUrlWithDns(randomApiUrl, {
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

        let data: { query?: { random?: Array<{ id: number; title: string }> } } = {};
        try {
          const res = await safeRedirectFetch(randomApiUrl, {
            signal: controller.signal,
            headers: {
              "User-Agent": USER_AGENT,
              Accept: "application/json",
            },
            allowLocalNetwork,
          });
          if (!res.ok) {
            return {
              taskId: task.taskId,
              actorType: this.actorType,
              status: "failed",
              statusCode: res.status,
              errorMessage: `Rosetta Code random request failed: ${res.statusText}`,
              executionDurationMs: Date.now() - startTime,
            };
          }
          data = (await res.json()) as {
            query?: { random?: Array<{ id: number; title: string }> };
          };
        } finally {
          clearTimeout(timeoutId);
        }

        const randomPage = data.query?.random?.[0];
        if (!randomPage) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 404,
            errorMessage: "No random task returned from Rosetta Code",
            executionDurationMs: Date.now() - startTime,
          };
        }

        taskName = randomPage.title;
      }

      if (action === "languages") {
        const catApiUrl = `${apiBaseUrl}?action=query&list=categorymembers&cmtitle=Category:Programming_Languages&cmlimit=${limit}&format=json`;

        const ssrfValidation = await SSRFGuard.validateUrlWithDns(catApiUrl, { allowLocalNetwork });
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

        let data: { query?: { categorymembers?: Array<{ title: string }> } } = {};
        let responseStatus = 200;
        try {
          const res = await safeRedirectFetch(catApiUrl, {
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
              errorMessage: `Rosetta Code languages query failed: ${res.statusText}`,
              executionDurationMs: Date.now() - startTime,
            };
          }
          data = (await res.json()) as { query?: { categorymembers?: Array<{ title: string }> } };
        } finally {
          clearTimeout(timeoutId);
        }

        const langs = (data.query?.categorymembers || [])
          .map((m) => m.title.replace(/^Category:/, "").trim())
          .filter(Boolean);

        const markdownLines = [
          "# Rosetta Code Programming Languages",
          `**Total Retrieved**: ${langs.length}`,
          "",
          ...langs.map((l) => `- ${l}`),
        ];

        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "completed",
          statusCode: responseStatus,
          data: {
            action: "languages",
            queryUrl: catApiUrl,
            totalResults: langs.length,
            languages: langs,
            markdown: markdownLines.join("\n"),
          },
          executionDurationMs: Date.now() - startTime,
        };
      }

      // Default: task action
      const normalizedTask = taskName.replace(/ /g, "_");
      const parseApiUrl = `${apiBaseUrl}?action=parse&page=${encodeURIComponent(
        normalizedTask
      )}&prop=text|sections&format=json`;

      const ssrfValidation = await SSRFGuard.validateUrlWithDns(parseApiUrl, { allowLocalNetwork });
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

      let parseData: {
        parse?: {
          title?: string;
          text?: { "*": string };
          sections?: MediaWikiParseSection[];
        };
        error?: { code: string; info: string };
      } = {};
      let responseStatus = 200;
      try {
        const res = await safeRedirectFetch(parseApiUrl, {
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
            errorMessage: `Rosetta Code task returned HTTP ${res.status}: ${res.statusText}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
        parseData = (await res.json()) as typeof parseData;
      } finally {
        clearTimeout(timeoutId);
      }

      if (parseData.error) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 404,
          errorMessage: `Rosetta Code API error: ${parseData.error.info || parseData.error.code}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const parsedTitle = parseData.parse?.title || taskName;
      const htmlContent = parseData.parse?.text?.["*"] || "";
      const sections = parseData.parse?.sections || [];

      const $ = cheerio.load(htmlContent);

      let descriptionHtml = "";
      const firstH2 = $("h2").first();
      if (firstH2.length > 0) {
        const descElements = firstH2.prevAll().toArray().reverse();
        for (const el of descElements) {
          descriptionHtml += $(el).html() || "";
        }
      } else {
        descriptionHtml = $("p").first().html() || "";
      }

      const cleanDescription = this.turndown.turndown(descriptionHtml).trim();

      const languageSections = sections.filter((s) => s.level === "2");
      const availableLanguages = languageSections.map((s) => s.line.replace(/<[^>]+>/g, "").trim());

      const implementations: RosettaCodeImplementation[] = [];
      const targetLangLower = language.toLowerCase().trim();

      const selectedSections = targetLangLower
        ? languageSections.filter(
            (s) =>
              s.line.toLowerCase().includes(targetLangLower) ||
              s.anchor.toLowerCase().includes(targetLangLower)
          )
        : languageSections.slice(0, limit);

      for (const sec of selectedSections) {
        const langName = sec.line.replace(/<[^>]+>/g, "").trim();
        let headlineEl = $("*")
          .filter((_, el) => $(el).attr("id") === sec.anchor)
          .first();
        if (!headlineEl.length) {
          headlineEl = $("h2")
            .filter((_, el) => $(el).text().includes(langName))
            .first();
        }
        if (headlineEl.length > 0) {
          const parentHeading = headlineEl.is("h2") ? headlineEl : headlineEl.closest("h2");
          const codeParts: string[] = [];
          const explanationParts: string[] = [];

          let curr = parentHeading.next();
          while (curr.length > 0 && !curr.is("h2")) {
            if (curr.is("pre") || curr.find("pre").length > 0) {
              const preText = curr.is("pre") ? curr.text() : curr.find("pre").text();
              codeParts.push(preText.trim());
            } else if (curr.is("p") || curr.is("ul") || curr.is("ol")) {
              const text = curr.text().trim();
              if (text) explanationParts.push(text);
            }
            curr = curr.next();
          }

          const combinedCode = codeParts.join("\n\n");
          if (combinedCode) {
            implementations.push({
              language: langName,
              code: combinedCode,
              explanation: explanationParts.join("\n\n"),
              lineCount: combinedCode.split("\n").length,
            });
          }
        }
      }

      const taskUrl = `${webBaseUrl}/wiki/${encodeURIComponent(normalizedTask)}`;
      const markdownLines: string[] = [
        `# Rosetta Code: ${parsedTitle}`,
        `**Source**: \`${taskUrl}\``,
        `**Total Languages Implemented**: ${availableLanguages.length}`,
        "",
        "## Task Description",
        cleanDescription || "*(No formal description provided)*",
        "",
      ];

      if (language && implementations.length === 0) {
        markdownLines.push(
          `> [!WARNING] No direct code found for language **${language}** in this task.`,
          `**Available Languages (${availableLanguages.length})**: ${availableLanguages.slice(0, 30).join(", ")}...`
        );
      } else {
        markdownLines.push("## Implementations", "");
        for (const impl of implementations) {
          const langSlug = impl.language.toLowerCase().replace(/[^a-z0-9#+]/g, "");
          markdownLines.push(
            `### ${impl.language}`,
            impl.explanation ? `${impl.explanation}\n` : "",
            `\`\`\`${langSlug}`,
            impl.code,
            "```",
            ""
          );
        }

        if (!targetLangLower && availableLanguages.length > limit) {
          markdownLines.push(
            "---",
            `*Showing top ${implementations.length} languages out of ${availableLanguages.length} available.*`,
            `*All Available Languages*: ${availableLanguages.join(", ")}`
          );
        }
      }

      const taskDetails: RosettaCodeTaskDetails = {
        task: normalizedTask,
        title: parsedTitle,
        url: taskUrl,
        description: cleanDescription,
        totalLanguages: availableLanguages.length,
        availableLanguages,
        implementations,
        markdown: markdownLines.join("\n"),
      };

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: responseStatus,
        data: {
          action: "task",
          queryUrl: parseApiUrl,
          totalResults: implementations.length,
          taskDetails,
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
          : `Rosetta Code actor extraction failed: ${message}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }
}
