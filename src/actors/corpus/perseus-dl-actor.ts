/**
 * PerseusDlActor - Tufts Perseus Digital Library classical texts, bilingual editions,
 * morphological analysis, and search catalog harvester.
 * Conforms to docs/actor-contract.md and docs/actors/perseus-dl.md.
 */

import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  PerseusDlAction,
  PerseusDlActorResult,
  PerseusDlActorTaskOptions,
  PerseusMorphAnalysis,
  PerseusSearchResultItem,
  PerseusTextPassage,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const PERSEUS_BASE_URL = "https://www.perseus.tufts.edu";
const PERSEUS_TEXT_URL = "https://www.perseus.tufts.edu/hopper/text";
const PERSEUS_MORPH_URL = "https://www.perseus.tufts.edu/hopper/morph";
const PERSEUS_SEARCH_URL = "https://www.perseus.tufts.edu/hopper/searchresults";

export class PerseusDlActor implements IActor<PerseusDlActorResult> {
  readonly actorType = "perseus-dl" as const;
  readonly description =
    "Harvests classical Greek, Latin, Hebrew, and Arabic texts, bilingual editions, morphological analyses, and catalog items from Tufts Perseus Digital Library.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<PerseusDlActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: PerseusDlActorTaskOptions =
      task.options?.perseusDlOptions ||
      (task.options as unknown as PerseusDlActorTaskOptions) ||
      {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF check on targetUrl if provided
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

      // 2. Resolve parameters & action
      const resolved = this.resolveParameters(task.targetUrl, options);

      // 3. Build upstream URL
      const endpoint = this.buildEndpointUrl(task.targetUrl, resolved);

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
          errorMessage: `SSRF validation failed for endpoint ${endpoint}: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 5. Fetch content
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(endpoint, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": USER_AGENT,
            ...(task.options?.headers || {}),
          },
          signal: controller.signal,
          allowLocalNetwork,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `Perseus Digital Library returned HTTP ${response.status}: ${errorText.slice(0, 300)}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const html = await response.text();

      // 6. Parse response based on action
      const parsed = this.parseResponse(resolved.action, html, endpoint, resolved);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: parsed,
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
   * Resolves action, doc identifier, word, language, query, and limits.
   */
  resolveParameters(
    targetUrl: string | undefined,
    options: PerseusDlActorTaskOptions
  ): {
    action: PerseusDlAction;
    doc: string;
    subReference?: string;
    word?: string;
    language: string;
    query?: string;
    limit: number;
  } {
    let action: PerseusDlAction = options.action || "text";
    let doc = (options.doc || "").trim();
    const subReference = options.subReference?.trim();
    let word = options.word?.trim();
    let language = (options.language || "greek").toLowerCase();
    let query = options.query?.trim();
    const limit = Math.max(1, Math.min(options.limit || 20, 100));

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.pathname.includes("/morph")) {
          action = "morph";
          word = parsed.searchParams.get("l") || word;
          language = parsed.searchParams.get("la") || language;
        } else if (parsed.pathname.includes("/searchresults")) {
          action = "search";
          query = parsed.searchParams.get("q") || query;
        } else if (parsed.pathname.includes("/text")) {
          action = "text";
          const docParam = parsed.searchParams.get("doc");
          if (docParam) {
            doc = docParam;
          }
        }
      } catch {
        // Fall back to options
      }
    }

    if (!doc && !word && !query) {
      if (action === "morph") {
        word = "logos";
        language = "greek";
      } else if (action === "search") {
        query = "iliad";
      } else {
        doc = "Perseus:text:1999.01.0133:book=1:card=1";
      }
    }

    return {
      action,
      doc,
      subReference,
      word,
      language,
      query,
      limit,
    };
  }

  /**
   * Builds the upstream URL. In test mode, targetUrl is respected.
   */
  buildEndpointUrl(
    targetUrl: string | undefined,
    resolved: ReturnType<typeof this.resolveParameters>
  ): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return targetUrl;
    }

    if (resolved.action === "morph") {
      const w = encodeURIComponent(resolved.word || "logos");
      const lang = encodeURIComponent(resolved.language || "greek");
      return `${PERSEUS_MORPH_URL}?l=${w}&la=${lang}`;
    }

    if (resolved.action === "search") {
      const q = encodeURIComponent(resolved.query || "iliad");
      return `${PERSEUS_SEARCH_URL}?q=${q}`;
    }

    // Default: text
    let docId = resolved.doc;
    if (resolved.subReference && !docId.includes(resolved.subReference)) {
      docId = `${docId}:${resolved.subReference}`;
    }
    return `${PERSEUS_TEXT_URL}?doc=${encodeURIComponent(docId)}`;
  }

  /**
   * Parses the HTML response from Perseus Hopper.
   */
  parseResponse(
    action: PerseusDlAction,
    html: string,
    endpoint: string,
    resolved: ReturnType<typeof this.resolveParameters>
  ): PerseusDlActorResult {
    const $ = cheerio.load(html);

    if (action === "morph") {
      const analyses = this.parseMorphAnalysis($, resolved.word || "");
      const markdown = this.renderMorphMarkdown(analyses, resolved.word || "");
      return {
        action: "morph",
        queryUrl: endpoint,
        totalResults: analyses.length,
        morphAnalysis: analyses,
        markdown,
      };
    }

    if (action === "search") {
      const results = this.parseSearchResults($, resolved.limit);
      const markdown = this.renderSearchMarkdown(results, resolved.query || "");
      return {
        action: "search",
        queryUrl: endpoint,
        totalResults: results.length,
        searchResults: results,
        markdown,
      };
    }

    // Default: text passage
    const passage = this.parseTextPassage($, resolved.doc, endpoint);
    const markdown = this.renderPassageMarkdown(passage);
    return {
      action: "text",
      queryUrl: endpoint,
      totalResults: passage.originalText || passage.sections?.length ? 1 : 0,
      passage,
      markdown,
    };
  }

  /**
   * Parses a classical text passage and parallel translations.
   */
  private parseTextPassage(
    $: cheerio.CheerioAPI,
    docId: string,
    endpoint: string
  ): PerseusTextPassage {
    const author =
      $("span.author, .header_text .author, #header_text .author").first().text().trim() ||
      $("meta[name='DC.creator']").attr("content") ||
      undefined;

    const work =
      $("span.title, .header_text .title, #header_text .title").first().text().trim() ||
      $("meta[name='DC.title']").attr("content") ||
      undefined;

    const edition =
      $(".header_text .editor, span.editor").first().text().trim() ||
      $("meta[name='DC.contributor']").attr("content") ||
      undefined;

    const languageMeta =
      $("meta[name='DC.language']").attr("content") || $("div.greek, .greek").length > 0
        ? "greek"
        : $("div.latin, .latin").length > 0
          ? "latin"
          : "english";

    // Text content extraction
    const mainContainer = $(".text_main, .text_container, div.text, #text_main, main").first();
    const targetElement = mainContainer.length > 0 ? mainContainer : $("body");

    // Extract structured sections / line cards if present
    const sections: Array<{ id: string; label?: string; text: string }> = [];
    let sectionNodes = targetElement.find(".card, .section, .text_card");
    if (sectionNodes.length === 0) {
      sectionNodes = targetElement.find("p.line, div.p");
    }

    if (sectionNodes.length > 0) {
      sectionNodes.each((idx, el) => {
        const node = $(el);
        const secId = node.attr("id") || `sec-${idx + 1}`;
        const secLabel = node.find(".card_label, .linenumber, .ref").text().trim() || undefined;
        // Clean out linenumber from text if extracted separately
        const clone = node.clone();
        clone.find(".card_label, .linenumber, .ref").remove();
        const text = clone.text().replace(/\s+/g, " ").trim();
        if (text) {
          sections.push({
            id: secId,
            label: secLabel,
            text,
          });
        }
      });
    }

    // Clean text extraction
    const textClone = targetElement.clone();
    textClone.find("script, style, noscript, nav, header, footer, .header_text, #header").remove();
    const originalText = textClone.text().replace(/\s+/g, " ").trim();

    // Check for parallel translation if side-by-side or translated container exists
    let translationText: string | undefined;
    const transContainer = $(".translation, .text_translation, .parallel_translation");
    if (transContainer.length > 0) {
      const transClone = transContainer.clone();
      transClone.find("script, style").remove();
      translationText = transClone.text().replace(/\s+/g, " ").trim();
    }

    return {
      docId: docId || endpoint,
      author,
      work,
      edition,
      language: languageMeta,
      subReference: docId.includes(":") ? docId.split(":").slice(2).join(":") : undefined,
      originalText: originalText || undefined,
      translationText: translationText || undefined,
      sections: sections.length > 0 ? sections : undefined,
    };
  }

  /**
   * Parses morphological analysis of a word.
   */
  private parseMorphAnalysis($: cheerio.CheerioAPI, word: string): PerseusMorphAnalysis[] {
    const results: PerseusMorphAnalysis[] = [];

    // Perseus Hopper morph pages structure analyses in tables or divs with class 'analysis', 'lemma', 'morph'
    const analysisRows = $(
      "table.morph tr, table.analysis tr, div.lemma, .morph_analysis, .lemma_header"
    );

    if (analysisRows.length > 0) {
      analysisRows.each((_, el) => {
        const row = $(el);
        // Skip table header
        if (row.find("th").length > 0) {
          return;
        }

        const lemmaText =
          row.find(".lemma, .lemma_definition, strong, b").first().text().trim() || word;
        const posText =
          row.find(".pos, .part_of_speech, td:nth-child(2)").first().text().trim() || "noun";
        const formText =
          row.find(".parse, .parse_code, td:nth-child(3)").first().text().trim() ||
          row.text().trim();
        const definition =
          row.find(".definition, .short_definition, td:nth-child(4)").first().text().trim() ||
          undefined;

        // Parse features from grammatical description string
        const features = this.extractGrammaticalFeatures(formText);

        if (lemmaText || formText) {
          results.push({
            lemma: lemmaText,
            pos: posText,
            parsedForm: formText,
            features: features && Object.keys(features).length > 0 ? features : undefined,
            shortDefinition: definition,
          });
        }
      });
    }

    // Fallback if structured table is not found but plain text is present
    if (results.length === 0) {
      const mainText = $("body").text().replace(/\s+/g, " ").trim();
      if (mainText.length > 0) {
        results.push({
          lemma: word,
          pos: "unclassified",
          parsedForm: mainText.slice(0, 300),
        });
      }
    }

    return results;
  }

  /**
   * Helper to parse grammatical tags (case, number, gender, tense, voice, mood).
   */
  private extractGrammaticalFeatures(text: string): NonNullable<PerseusMorphAnalysis["features"]> {
    const lower = text.toLowerCase();
    const features: NonNullable<PerseusMorphAnalysis["features"]> = {};

    // Case
    if (lower.includes("nom")) features.case = "nominative";
    else if (lower.includes("gen")) features.case = "genitive";
    else if (lower.includes("dat")) features.case = "dative";
    else if (lower.includes("acc")) features.case = "accusative";
    else if (lower.includes("voc")) features.case = "vocative";
    else if (lower.includes("abl")) features.case = "ablative";

    // Gender
    if (lower.includes("masc")) features.gender = "masculine";
    else if (lower.includes("fem")) features.gender = "feminine";
    else if (lower.includes("neut")) features.gender = "neuter";

    // Number
    if (lower.includes("sg") || lower.includes("sing")) features.number = "singular";
    else if (lower.includes("pl") || lower.includes("plur")) features.number = "plural";
    else if (lower.includes("dual")) features.number = "dual";

    // Tense
    if (lower.includes("pres")) features.tense = "present";
    else if (lower.includes("aor")) features.tense = "aorist";
    else if (lower.includes("imperf")) features.tense = "imperfect";
    else if (lower.includes("perf")) features.tense = "perfect";
    else if (lower.includes("plup")) features.tense = "pluperfect";
    else if (lower.includes("fut")) features.tense = "future";

    // Mood
    if (lower.includes("ind")) features.mood = "indicative";
    else if (lower.includes("subj")) features.mood = "subjunctive";
    else if (lower.includes("opt")) features.mood = "optative";
    else if (lower.includes("imperat")) features.mood = "imperative";
    else if (lower.includes("inf")) features.mood = "infinitive";
    else if (lower.includes("part")) features.mood = "participle";

    // Voice
    if (lower.includes("act")) features.voice = "active";
    else if (lower.includes("mid")) features.voice = "middle";
    else if (lower.includes("pass")) features.voice = "passive";

    return features;
  }

  /**
   * Parses search results from Perseus Hopper.
   */
  private parseSearchResults($: cheerio.CheerioAPI, limit: number): PerseusSearchResultItem[] {
    const results: PerseusSearchResultItem[] = [];

    const rows = $(".search_results li, table.search_results tr, .result_row, div.result");

    rows.each((_, el) => {
      if (results.length >= limit) return;

      const node = $(el);
      const link = node.find("a").first();
      const href = link.attr("href") || "";
      const title = link.text().trim() || node.find(".title").text().trim();
      const author = node.find(".author").text().trim() || undefined;
      const snippet = node.find(".snippet, .context, p").text().trim() || undefined;

      if (title && href) {
        const fullUrl = href.startsWith("http")
          ? href
          : `${PERSEUS_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;

        // Extract doc ID from URL if present
        let docId = fullUrl;
        try {
          const parsed = new URL(fullUrl);
          const docParam = parsed.searchParams.get("doc");
          if (docParam) docId = docParam;
        } catch {
          // ignore
        }

        results.push({
          docId,
          title,
          author,
          snippet,
          url: fullUrl,
        });
      }
    });

    return results;
  }

  /**
   * Formats text passage as Markdown.
   */
  private renderPassageMarkdown(passage: PerseusTextPassage): string {
    const lines: string[] = [];

    lines.push(`# ${passage.work || passage.docId}`);
    if (passage.author) {
      lines.push(`**Author:** ${passage.author}`);
    }
    if (passage.edition) {
      lines.push(`**Edition/Editor:** ${passage.edition}`);
    }
    if (passage.language) {
      lines.push(`**Language:** ${passage.language}`);
    }
    if (passage.subReference) {
      lines.push(`**Reference:** ${passage.subReference}`);
    }
    lines.push(`**Document ID:** \`${passage.docId}\``);
    lines.push("");

    if (passage.sections && passage.sections.length > 0) {
      lines.push("## Text Sections");
      lines.push("");
      for (const sec of passage.sections) {
        if (sec.label) {
          lines.push(`### ${sec.label}`);
        }
        lines.push(sec.text);
        lines.push("");
      }
    } else if (passage.originalText) {
      lines.push("## Text Content");
      lines.push("");
      lines.push(passage.originalText);
      lines.push("");
    }

    if (passage.translationText) {
      lines.push("## Parallel Translation");
      lines.push("");
      lines.push(passage.translationText);
      lines.push("");
    }

    return lines.join("\n").trim();
  }

  /**
   * Formats morphological analyses as Markdown.
   */
  private renderMorphMarkdown(analyses: PerseusMorphAnalysis[], word: string): string {
    const lines: string[] = [];

    lines.push(`# Perseus Morphological Analysis: ${word}`);
    lines.push("");

    if (analyses.length === 0) {
      lines.push("No morphological parses found for word.");
      return lines.join("\n");
    }

    lines.push("| Lemma | Part of Speech | Parsed Features | Definition |");
    lines.push("|---|---|---|---|");

    for (const item of analyses) {
      const featureStr = item.features
        ? Object.entries(item.features)
            .map(([k, v]) => `${k}:${v}`)
            .join(", ")
        : item.parsedForm || "n/a";
      const def = item.shortDefinition || "-";
      lines.push(`| **${item.lemma}** | \`${item.pos}\` | ${featureStr} | ${def} |`);
    }

    return lines.join("\n");
  }

  /**
   * Formats search results as Markdown.
   */
  private renderSearchMarkdown(results: PerseusSearchResultItem[], query: string): string {
    const lines: string[] = [];

    lines.push(`# Perseus Digital Library Search: "${query}"`);
    lines.push(`Total items returned: ${results.length}`);
    lines.push("");

    if (results.length === 0) {
      lines.push("No catalog entries found.");
      return lines.join("\n");
    }

    for (const item of results) {
      lines.push(`### [${item.title}](${item.url})`);
      if (item.author) {
        lines.push(`- **Author:** ${item.author}`);
      }
      lines.push(`- **Document ID:** \`${item.docId}\``);
      if (item.snippet) {
        lines.push(`- **Context:** ${item.snippet}`);
      }
      lines.push("");
    }

    return lines.join("\n").trim();
  }
}
