/**
 * WiktionaryActor - Multi-Language Lexical & Etymological Extractor — protokol-7
 *
 * Interfaces with official Wikimedia Wiktionary REST and Action API endpoints
 * across 198+ language editions to fetch verified dictionary definitions,
 * parts of speech, etymology, phonetic pronunciations, translations, and synonyms.
 * Conforms to docs/actor-contract.md.
 */

import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  ActorType,
  IActor,
  WiktionaryActorResult,
  WiktionaryActorTaskOptions,
  WiktionaryEntryItem,
  WiktionaryPartOfSpeechItem,
  WiktionarySenseItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 10;
const DEFAULT_LANG = "en";

export class WiktionaryActor implements IActor<WiktionaryActorResult> {
  readonly actorType: ActorType = "wiktionary";
  readonly description =
    "Queries official Wikimedia Wiktionary REST and Action APIs across 198+ languages for lexical definitions, etymology, parts of speech, and translations.";

  private readonly turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    });

    // Strip script and style tags
    this.turndown.remove(["script", "style", "noscript"]);

    // Strip edit sections, reference markers, print-only elements, and navboxes
    this.turndown.addRule("wiktionaryStripNoise", {
      filter: (node) => {
        const el = node as HTMLElement;
        return Boolean(
          el.classList &&
            (el.classList.contains("mw-editsection") ||
              el.classList.contains("ws-noexport") ||
              el.classList.contains("noprint") ||
              el.classList.contains("navbox") ||
              el.classList.contains("sister-project"))
        );
      },
      replacement: () => "",
    });
  }

  async run(
    task: ActorTask,
    context?: ActorRunContext
  ): Promise<ActorResult<WiktionaryActorResult>> {
    const startTime = context?.startTime || Date.now();
    const taskOpts = task.options || {};
    const options: WiktionaryActorTaskOptions = (taskOpts.wiktionaryOptions ||
      taskOpts) as WiktionaryActorTaskOptions;
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork =
      process.env.NODE_ENV === "test" ||
      Boolean((task.options as Record<string, unknown> | undefined)?.allowLocalNetwork);

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

      // 2. Resolve parameters from targetUrl and options
      const { lang, word, action, query } = this.resolveParameters(task.targetUrl, options);
      const resolvedQueryUrl = this.buildApiUrl(
        task.targetUrl,
        lang,
        action,
        word,
        query,
        options.limit
      );

      // 3. SSRF validation on resolved endpoint
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

      // 4. Dispatch request
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(resolvedQueryUrl, {
          signal: controller.signal,
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; wiktionary-actor)",
            Accept: action === "entry" ? "text/html" : "application/json",
          },
        });
      } finally {
        clearTimeout(timeoutTimer);
      }

      if (!response.ok) {
        if (response.status === 404) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "completed",
            statusCode: 404,
            data: {
              lang,
              action,
              items: [],
              queryUrl: resolvedQueryUrl,
              markdown: `# Wiktionary: No Entry Found\n\nNo lexical entry exists for \`${word}\` in [${lang}](${resolvedQueryUrl}).`,
            },
            executionDurationMs: Date.now() - startTime,
          };
        }

        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `Wiktionary API returned status ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 5. Parse response by action type
      let items: WiktionaryEntryItem[] = [];
      let markdownOutput = "";

      if (action === "definition") {
        const json = (await response.json()) as Record<
          string,
          Array<{
            partOfSpeech?: string;
            language?: string;
            definitions?: Array<{
              definition?: string;
              examples?: string[];
              parsedExamples?: Array<{ example?: string }>;
            }>;
          }>
        >;

        const posItems: WiktionaryPartOfSpeechItem[] = [];
        const mdSections: string[] = [`# Wiktionary: ${word} (${lang})\n`];

        for (const [langKey, posEntries] of Object.entries(json)) {
          if (Array.isArray(posEntries)) {
            for (const entry of posEntries) {
              const senses: WiktionarySenseItem[] = [];
              const posName = entry.partOfSpeech || "Unknown";
              const langName = entry.language || langKey;

              mdSections.push(`## ${langName} — ${posName}\n`);

              if (Array.isArray(entry.definitions)) {
                entry.definitions.forEach((def, idx) => {
                  const rawDefHtml = def.definition || "";
                  const cleanDef = this.cleanDefinitionHtml(rawDefHtml);
                  const examples: string[] = [];

                  if (Array.isArray(def.examples)) {
                    for (const ex of def.examples) {
                      if (typeof ex === "string") {
                        examples.push(this.cleanDefinitionHtml(ex));
                      }
                    }
                  }

                  senses.push({
                    definition: cleanDef,
                    examples: examples.length > 0 ? examples : undefined,
                  });

                  mdSections.push(`${idx + 1}. ${cleanDef}`);
                  if (examples.length > 0) {
                    for (const ex of examples) {
                      mdSections.push(`   > *${ex}*`);
                    }
                  }
                });
                mdSections.push("");
              }

              posItems.push({
                partOfSpeech: posName,
                language: langName,
                definitions: senses,
              });
            }
          }
        }

        const canonicalUrl = `https://${lang}.wiktionary.org/wiki/${encodeURIComponent(word)}`;
        items = [
          {
            word,
            url: canonicalUrl,
            lang,
            partsOfSpeech: posItems,
            fullMarkdown: mdSections.join("\n"),
          },
        ];
        markdownOutput = mdSections.join("\n");
      } else if (action === "entry") {
        const html = await response.text();
        const fullMarkdown = this.turndown.turndown(html);
        const canonicalUrl = `https://${lang}.wiktionary.org/wiki/${encodeURIComponent(word)}`;

        items = [
          {
            word,
            url: canonicalUrl,
            lang,
            fullMarkdown,
            rawHtml: options.extractMarkdown ? undefined : html,
          },
        ];

        markdownOutput = `# Wiktionary Entry: ${word} (${lang})\n\nSource: [${canonicalUrl}](${canonicalUrl})\n\n${fullMarkdown}`;
      } else if (action === "search") {
        const searchJson = (await response.json()) as [string, string[], string[], string[]];
        const titles = searchJson[1] || [];
        const descriptions = searchJson[2] || [];
        const urls = searchJson[3] || [];

        items = titles.map((t, idx) => ({
          word: t,
          url: urls[idx] || `https://${lang}.wiktionary.org/wiki/${encodeURIComponent(t)}`,
          lang,
          etymology: descriptions[idx] || undefined,
        }));

        markdownOutput = `# Wiktionary Search Results: "${query || word}" (${lang})\n\n`;
        items.forEach((item, idx) => {
          markdownOutput += `${idx + 1}. [${item.word}](${item.url})\n`;
        });
      } else if (action === "random") {
        const randomJson = (await response.json()) as {
          query?: { random?: Array<{ id: number; title: string }> };
        };
        const randomEntries = randomJson.query?.random || [];

        items = randomEntries.map((entry) => ({
          word: entry.title,
          url: `https://${lang}.wiktionary.org/wiki/${encodeURIComponent(entry.title)}`,
          lang,
        }));

        markdownOutput = `# Wiktionary Random Discoveries (${lang})\n\n`;
        items.forEach((item, idx) => {
          markdownOutput += `${idx + 1}. [${item.word}](${item.url})\n`;
        });
      }

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          lang,
          action,
          items,
          queryUrl: resolvedQueryUrl,
          markdown: markdownOutput.trim(),
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const isAbort = (err as { name?: string }).name === "AbortError";
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isAbort ? "timed_out" : "failed",
        statusCode: isAbort ? 408 : 500,
        errorMessage: isAbort
          ? `Request timed out after ${timeoutMs}ms`
          : `Wiktionary extraction failed: ${(err as Error).message}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private cleanDefinitionHtml(html: string): string {
    if (!html) return "";
    let text = this.turndown.turndown(html);
    text = text.replace(/\[\d+\]/g, ""); // strip references
    text = text.replace(/\s+/g, " ").trim();
    return text;
  }

  resolveParameters(
    targetUrl?: string,
    options?: WiktionaryActorTaskOptions
  ): {
    lang: string;
    word: string;
    action: "definition" | "entry" | "search" | "random";
    query?: string;
  } {
    let lang = (options?.lang || "").trim().toLowerCase();
    let word = (options?.word || "").trim();
    let action = options?.action;
    const query = options?.query;

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const hostParts = parsed.hostname.split(".");
        if (hostParts.length >= 2 && hostParts.includes("wiktionary")) {
          lang = hostParts[0];
        }

        const path = decodeURIComponent(parsed.pathname);
        if (path.includes("/api/rest_v1/page/definition/")) {
          const parts = path.split("/api/rest_v1/page/definition/");
          if (parts[1]) word = parts[1].replace(/_/g, " ").trim();
          action = "definition";
        } else if (path.includes("/api/rest_v1/page/html/")) {
          const parts = path.split("/api/rest_v1/page/html/");
          if (parts[1]) word = parts[1].replace(/_/g, " ").trim();
          action = "entry";
        } else if (path.startsWith("/wiki/")) {
          word = path.substring(6).replace(/_/g, " ").trim();
          if (!action) action = "definition";
        }
      } catch {
        // Fall back to option parameters if targetUrl is malformed
      }
    }

    if (!lang) lang = DEFAULT_LANG;
    if (!word) word = query || "dictionary";
    if (!action) {
      if (options?.query) {
        action = "search";
      } else {
        action = "definition";
      }
    }

    return { lang, word, action, query };
  }

  buildApiUrl(
    targetUrl?: string,
    lang = DEFAULT_LANG,
    action: "definition" | "entry" | "search" | "random" = "definition",
    word = "dictionary",
    query?: string,
    limit = DEFAULT_LIMIT
  ): string {
    if (
      targetUrl &&
      (targetUrl.includes("/api/rest_v1/") ||
        targetUrl.includes("/w/api.php") ||
        targetUrl.includes("action="))
    ) {
      return targetUrl;
    }

    const host = `${lang.toLowerCase().trim()}.wiktionary.org`;

    switch (action) {
      case "definition":
        return `https://${host}/api/rest_v1/page/definition/${encodeURIComponent(word.replace(/ /g, "_"))}`;
      case "entry":
        return `https://${host}/api/rest_v1/page/html/${encodeURIComponent(word.replace(/ /g, "_"))}`;
      case "search":
        return `https://${host}/w/api.php?action=opensearch&search=${encodeURIComponent(query || word)}&limit=${limit}&namespace=0&format=json`;
      case "random":
        return `https://${host}/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=${limit}&format=json`;
    }
  }
}
