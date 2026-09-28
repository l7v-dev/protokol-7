/**
 * ProofWikiActor - ProofWiki mathematical theorems, axioms, definitions,
 * and formal/informal step-by-step proof chains harvester.
 * Interfaces with ProofWiki MediaWiki API (https://proofwiki.org/w/api.php).
 * Conforms to docs/actor-contract.md and docs/actors/proofwiki.md.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  ProofWikiActorResult,
  ProofWikiActorTaskOptions,
  ProofWikiItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const PROOFWIKI_API_BASE = "https://proofwiki.org/w/api.php";
const PROOFWIKI_SITE_BASE = "https://proofwiki.org/wiki";

export class ProofWikiActor implements IActor<ProofWikiActorResult> {
  readonly actorType = "proofwiki" as const;
  readonly description =
    "Harvests mathematical theorems, axioms, definitions, and step-by-step proof chains from ProofWiki MediaWiki API.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<ProofWikiActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: ProofWikiActorTaskOptions =
      task.options?.proofWikiOptions ||
      (task.options as unknown as ProofWikiActorTaskOptions) ||
      {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF validation on targetUrl if provided
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

      // 2. Resolve parameters & action
      const resolved = this.resolveParameters(task.targetUrl, options);

      // 3. Build upstream API endpoint
      const endpoint = this.buildEndpointUrl(task.targetUrl, resolved);

      // 4. Secondary SSRF validation on resolved endpoint
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(endpoint, {
        allowLocalNetwork,
      });

      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed for endpoint ${endpoint}: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 5. Build headers
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(task.options?.headers || {}),
      };

      // 6. Network fetch with abort controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(endpoint, {
          method: "GET",
          headers,
          signal: controller.signal,
          allowLocalNetwork,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `ProofWiki API returned HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const json = (await response.json()) as Record<string, unknown>;

      // 7. Parse items based on action mode
      const items = this.parseResponse(resolved.action, json, resolved.title);
      const markdown = this.renderMarkdown(resolved.action, items);

      const resultData: ProofWikiActorResult = {
        action: resolved.action,
        totalResults: items.length,
        items,
        queryUrl: endpoint,
        markdown,
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
      const isAbort =
        err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isAbort ? "timed_out" : "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Resolves action, title, search query, category, and limit parameters.
   */
  resolveParameters(
    targetUrl: string,
    options: ProofWikiActorTaskOptions
  ): {
    action: "theorem" | "search" | "random" | "category";
    title?: string;
    query?: string;
    category?: string;
    limit: number;
  } {
    let action: "theorem" | "search" | "random" | "category" = "theorem";
    let title = options.title?.trim();
    const query = options.query?.trim();
    const category = options.category?.trim();
    const limit = Math.min(Math.max(options.limit || 10, 1), 50);

    if (options.action) {
      const act = options.action.toLowerCase();
      if (act === "search" || act === "random" || act === "category" || act === "theorem") {
        action = act;
      }
    } else if (query) {
      action = "search";
    } else if (category) {
      action = "category";
    }

    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.searchParams.has("title") || parsed.searchParams.has("page")) {
          const rawTitle =
            parsed.searchParams.get("title") || parsed.searchParams.get("page") || "";
          title = decodeURIComponent(rawTitle.replace(/_/g, " ")) || title;
          action = "theorem";
        } else if (parsed.pathname.includes("/wiki/")) {
          const rawSlug = parsed.pathname.split("/wiki/")[1];
          if (rawSlug) {
            title = decodeURIComponent(rawSlug.replace(/_/g, " "));
            action = "theorem";
          }
        }
      } catch {
        // Fallback to provided options
      }
    }

    if (action === "theorem" && !title) {
      title = query || "Pythagorean Theorem";
    }

    return {
      action,
      title,
      query,
      category,
      limit,
    };
  }

  /**
   * Constructs the appropriate MediaWiki API endpoint URL.
   */
  buildEndpointUrl(
    targetUrl: string,
    resolved: {
      action: "theorem" | "search" | "random" | "category";
      title?: string;
      query?: string;
      category?: string;
      limit: number;
    }
  ): string {
    if (targetUrl && (targetUrl.includes("action=") || targetUrl.includes("/test"))) {
      return targetUrl;
    }

    switch (resolved.action) {
      case "search": {
        const encQuery = encodeURIComponent(resolved.query || resolved.title || "");
        return `${PROOFWIKI_API_BASE}?action=query&list=search&srsearch=${encQuery}&srlimit=${resolved.limit}&format=json`;
      }
      case "random": {
        return `${PROOFWIKI_API_BASE}?action=query&list=random&rnnamespace=0&rnlimit=${resolved.limit}&format=json`;
      }
      case "category": {
        let cat = resolved.category || "Theorems";
        if (cat.startsWith("Category:")) cat = cat.slice(9);
        const encCat = encodeURIComponent(`Category:${cat}`);
        return `${PROOFWIKI_API_BASE}?action=query&list=categorymembers&cmtitle=${encCat}&cmlimit=${resolved.limit}&format=json`;
      }
      default: {
        const encPage = encodeURIComponent(resolved.title || "Pythagorean Theorem");
        return `${PROOFWIKI_API_BASE}?action=parse&page=${encPage}&prop=wikitext|categories&format=json`;
      }
    }
  }

  /**
   * Parses MediaWiki JSON response into standard ProofWikiItem array.
   */
  parseResponse(
    _action: string,
    json: Record<string, unknown>,
    fallbackTitle?: string
  ): ProofWikiItem[] {
    const items: ProofWikiItem[] = [];

    // 1. Single Theorem Parse (action=parse)
    if (json.parse && typeof json.parse === "object") {
      const parse = json.parse as Record<string, unknown>;
      const title = String(parse.title || fallbackTitle || "Theorem");
      const pageId = typeof parse.pageid === "number" ? parse.pageid : undefined;
      const url = `${PROOFWIKI_SITE_BASE}/${encodeURIComponent(title.replace(/ /g, "_"))}`;

      let wikitext = "";
      if (parse.wikitext && typeof parse.wikitext === "object") {
        wikitext = String((parse.wikitext as Record<string, unknown>)["*"] || "");
      }

      const categories: string[] = [];
      if (Array.isArray(parse.categories)) {
        for (const cat of parse.categories) {
          if (cat && typeof cat === "object" && "*" in cat) {
            categories.push(String((cat as Record<string, unknown>)["*"]));
          }
        }
      }

      const parsedSections = this.parseWikitextSections(wikitext);

      items.push({
        pageId,
        title,
        url,
        theorem: parsedSections.theorem,
        proofs: parsedSections.proofs,
        definitions: parsedSections.definitions,
        sources: parsedSections.sources,
        categories,
        rawWikitext: wikitext,
      });

      return items;
    }

    // 2. Query list responses (search, random, categorymembers)
    const query = json.query as Record<string, unknown> | undefined;
    if (!query) return items;

    // Search results
    if (Array.isArray(query.search)) {
      for (const res of query.search) {
        const r = res as Record<string, unknown>;
        const title = String(r.title || "");
        items.push({
          pageId: typeof r.pageid === "number" ? r.pageid : undefined,
          title,
          url: `${PROOFWIKI_SITE_BASE}/${encodeURIComponent(title.replace(/ /g, "_"))}`,
          theorem: r.snippet
            ? String(r.snippet)
                .replace(/<[^>]+>/g, "")
                .trim()
            : undefined,
        });
      }
    }
    // Random pages
    else if (Array.isArray(query.random)) {
      for (const res of query.random) {
        const r = res as Record<string, unknown>;
        const title = String(r.title || "");
        items.push({
          pageId: typeof r.id === "number" ? r.id : undefined,
          title,
          url: `${PROOFWIKI_SITE_BASE}/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        });
      }
    }
    // Category members
    else if (Array.isArray(query.categorymembers)) {
      for (const res of query.categorymembers) {
        const r = res as Record<string, unknown>;
        const title = String(r.title || "");
        items.push({
          pageId: typeof r.pageid === "number" ? r.pageid : undefined,
          title,
          url: `${PROOFWIKI_SITE_BASE}/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        });
      }
    }

    return items;
  }

  /**
   * Parses ProofWiki wikitext into structured theorem, proofs, definitions, and sources.
   */
  parseWikitextSections(wikitext: string): {
    theorem?: string;
    proofs: string[];
    definitions: string[];
    sources: string[];
  } {
    const proofs: string[] = [];
    const definitions: string[] = [];
    const sources: string[] = [];
    let theoremText = "";

    // Normalize math tags to LaTeX format ($...$ and $$...$$)
    const cleanWikitext = this.normalizeMath(wikitext);

    // Split by level-2 headings: == Heading ==
    const sectionRegex = /==\s*([^=]+?)\s*==/g;
    const sectionSplits: Array<{ title: string; index: number }> = [];
    let match: RegExpExecArray | null;

    while (true) {
      match = sectionRegex.exec(cleanWikitext);
      if (!match) break;
      sectionSplits.push({ title: match[1].trim(), index: match.index });
    }

    if (sectionSplits.length === 0) {
      return {
        theorem: cleanWikitext.trim(),
        proofs: [],
        definitions: [],
        sources: [],
      };
    }

    // Lead section before the first heading
    const lead = cleanWikitext.slice(0, sectionSplits[0].index).trim();
    if (lead) {
      theoremText = lead;
    }

    for (let i = 0; i < sectionSplits.length; i++) {
      const current = sectionSplits[i];
      const start = current.index;
      const end = i + 1 < sectionSplits.length ? sectionSplits[i + 1].index : cleanWikitext.length;
      const sectionContent = cleanWikitext.slice(start, end);
      const contentWithoutHeading = sectionContent.replace(/==\s*[^=]+?\s*==/, "").trim();

      const lowerTitle = current.title.toLowerCase();

      if (lowerTitle.includes("theorem") || lowerTitle.includes("statement")) {
        theoremText = contentWithoutHeading;
      } else if (lowerTitle.includes("proof")) {
        proofs.push(contentWithoutHeading);
      } else if (lowerTitle.includes("definition")) {
        definitions.push(contentWithoutHeading);
      } else if (lowerTitle.includes("source")) {
        const sourceLines = contentWithoutHeading
          .split("\n")
          .map((s) => s.replace(/^\*+\s*/, "").trim())
          .filter(Boolean);
        sources.push(...sourceLines);
      }
    }

    return {
      theorem: theoremText ? theoremText.trim() : undefined,
      proofs,
      definitions,
      sources,
    };
  }

  /**
   * Normalizes ProofWiki specific wikitext templates and math tags into LaTeX.
   */
  normalizeMath(text: string): string {
    return (
      text
        // Convert <math>...</math> to $...$
        .replace(/<math>(.*?)<\/math>/gs, "$$$1$$")
        // Convert {{begin-eqn}} ... {{end-eqn}} blocks
        .replace(/\{\{begin-eqn\}\}(.*?)\{\{end-eqn\}\}/gs, (_m, p1) => {
          return `\n$$\n\\begin{aligned}\n${p1.trim()}\n\\end{aligned}\n$$\n`;
        })
        // Strip ProofWiki {{eqn|...}} templates into aligned row
        .replace(/\{\{eqn\s*\|\s*r\s*=\s*([^|]*?)\s*\|\s*l\s*=\s*([^|]*?)\s*\}\}/g, "$1 &= $2 \\\\")
        .replace(/\{\{eqn\s*\|\s*([^}]*?)\s*\}\}/g, (_m, p1) => `${p1.replace(/\|/g, " & ")} \\\\`)
        // Remove double brackets for internal wiki links [[Link|Text]] => Text, [[Link]] => Link
        .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
        // Remove templates like {{QED}}
        .replace(/\{\{QED\}\}/gi, "■")
        .trim()
    );
  }

  /**
   * Formats ProofWiki items into structured GFM Markdown for LLM mathematical reasoning.
   */
  renderMarkdown(action: string, items: ProofWikiItem[]): string {
    const lines: string[] = [];
    lines.push(`# ProofWiki Formal & Mathematical Proofs`);
    lines.push(`**Action Mode:** \`${action}\``);
    lines.push(`**Total Items:** ${items.length}`);
    lines.push("");

    if (items.length === 0) {
      lines.push("_No proofs or theorems found for the query._");
      return lines.join("\n");
    }

    items.forEach((item, idx) => {
      lines.push(`## ${idx + 1}. [${item.title}](${item.url})`);
      if (item.pageId) lines.push(`*Page ID: ${item.pageId}*`);
      lines.push("");

      if (item.theorem) {
        lines.push("### Theorem Statement");
        lines.push(item.theorem);
        lines.push("");
      }

      if (item.definitions && item.definitions.length > 0) {
        lines.push("### Definitions");
        item.definitions.forEach((def, dIdx) => {
          lines.push(`**Definition ${dIdx + 1}:**`);
          lines.push(def);
          lines.push("");
        });
      }

      if (item.proofs && item.proofs.length > 0) {
        lines.push("### Step-by-Step Proof(s)");
        item.proofs.forEach((proof, pIdx) => {
          lines.push(`#### Proof ${pIdx + 1}`);
          lines.push(proof);
          lines.push("");
        });
      }

      if (item.sources && item.sources.length > 0) {
        lines.push("### Historical Sources & Citations");
        for (const src of item.sources) {
          lines.push(`- ${src}`);
        }
        lines.push("");
      }

      if (item.categories && item.categories.length > 0) {
        lines.push(`**Categories:** \`${item.categories.join("`, `")}\``);
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    });

    return lines.join("\n");
  }
}
