/**
 * src/actors/eur-lex-actor.ts
 *
 * EUR-Lex European Union Law & Precedents Harvester.
 * Fetches EU directives, regulations, decisions, and European Court of Justice (CJEU)
 * case law via CELEX identifiers and European Publications Office CELLAR APIs.
 * Converts complex multilingual legal documents into clean, structured Markdown for LLMs.
 */

import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  EurLexActorResult,
  EurLexActorTaskOptions,
  EurLexDocumentItem,
  IActor,
} from "../core/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LANGUAGE = "en";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const EUR_LEX_DIRECT_BASE = "https://eur-lex.europa.eu/legal-content";
const CELLAR_SPARQL_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";

interface SparqlBindingItem {
  value?: string;
}

interface RawSparqlResponse {
  results?: {
    bindings?: Array<{
      celex?: SparqlBindingItem;
      title?: SparqlBindingItem;
      work?: SparqlBindingItem;
    }>;
  };
}

interface RawGenericEurLexItem {
  celex?: string;
  title?: string;
  documentType?: string;
  date?: string;
  language?: string;
  ojReference?: string;
  url?: string;
  contentSnippet?: string;
}

export class EurLexActor implements IActor<EurLexActorResult> {
  readonly actorType = "eur-lex" as const;
  readonly description =
    "Queries EUR-Lex and EU CELLAR repository for European Union directives, regulations, and Court of Justice case law.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<EurLexActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: EurLexActorTaskOptions = task.options?.eurLexOptions || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";
    const language = (options.language || DEFAULT_LANGUAGE).toLowerCase();

    try {
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

      const celex = this.resolveCelex(task, options);
      const query = options.query?.trim();

      if (!celex && !query) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage:
            "Missing CELEX identifier or search query. Provide 'celex' (e.g. '32016R0679') or 'query' (e.g. 'artificial intelligence regulation').",
          executionDurationMs: Date.now() - startTime,
        };
      }

      const requestUrl = this.buildRequestUrl(task, celex, query, language);

      const ssrfCheck = await SSRFGuard.validateUrlWithDns(requestUrl, {
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

      const headers: Record<string, string> = {
        Accept: celex
          ? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          : "application/sparql-results+json,application/json,*/*",
        "User-Agent": "protokol-7/1.0.0 (EUR-Lex European Law Harvester)",
      };

      const response = await safeRedirectFetch(requestUrl, {
        method: "GET",
        headers,
        timeoutMs,
        allowLocalNetwork,
      });

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `EUR-Lex endpoint returned HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const contentType = response.headers.get("content-type") || "";
      let documents: EurLexDocumentItem[] = [];
      let totalCount = 0;

      if (contentType.includes("json")) {
        const json = await response.json();
        const parsed = this.parseSparqlOrJsonResponse(json, language);
        documents = parsed.documents;
        totalCount = parsed.totalCount;
      } else {
        const html = await response.text();
        const singleDoc = this.parseEurLexHtml(html, celex || "UNKNOWN", language, requestUrl);
        documents = [singleDoc];
        totalCount = 1;
      }

      const limit = Math.min(Math.max(options.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
      const filteredDocs = documents.slice(0, limit);
      const markdown = this.synthesizeMarkdown(filteredDocs, celex, query, language);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          celex,
          query,
          language,
          totalCount,
          documents: filteredDocs,
          markdown,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `EurLexActor execution failed: ${errorMsg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private resolveCelex(task: ActorTask, options: EurLexActorTaskOptions): string | undefined {
    if (options.celex) {
      return options.celex.trim().toUpperCase();
    }

    const rawTarget = (task.targetUrl || "").trim();
    if (rawTarget && !rawTarget.startsWith("http")) {
      const match = rawTarget.match(/\b([1-9]\d{3}[A-Z]\d{4,5})\b/i);
      if (match) {
        return match[1].toUpperCase();
      }
    }

    if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://")) {
      const celexParam = new URL(rawTarget).searchParams.get("uri");
      if (celexParam?.startsWith("CELEX:")) {
        return celexParam.replace("CELEX:", "").toUpperCase();
      }
    }

    return undefined;
  }

  private buildRequestUrl(
    task: ActorTask,
    celex?: string,
    query?: string,
    language = DEFAULT_LANGUAGE
  ): string {
    const rawTarget = (task.targetUrl || "").trim();
    if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://")) {
      const url = new URL(rawTarget);
      if (celex) url.searchParams.set("celex", celex);
      if (query) url.searchParams.set("query", query);
      url.searchParams.set("lang", language);
      return url.toString();
    }

    if (celex) {
      return `${EUR_LEX_DIRECT_BASE}/${language}/TXT/HTML/?uri=CELEX:${celex}`;
    }

    // SPARQL Search query on CELLAR
    const sparqlQuery = encodeURIComponent(
      `
      PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
      SELECT DISTINCT ?work ?celex ?title WHERE {
        ?work cdm:work_has_resource-type ?type .
        ?work cdm:resource_legal_id_celex ?celex .
        ?expression cdm:expression_belongs_to_work ?work .
        ?expression cdm:expression_title ?title .
        FILTER(regex(?title, "${query?.replace(/"/g, '\\"') || ""}", "i"))
      } LIMIT 10
    `.trim()
    );

    return `${CELLAR_SPARQL_ENDPOINT}?query=${sparqlQuery}&format=application%2Fsparql-results%2Bjson`;
  }

  private parseEurLexHtml(
    html: string,
    celex: string,
    language: string,
    url: string
  ): EurLexDocumentItem {
    const $ = cheerio.load(html);

    // Extract title from standard EUR-Lex markup
    let title =
      $("#title").text().trim() ||
      $("p.title-doc-first").text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      `EU Legal Document CELEX:${celex}`;

    title = title.replace(/\s+/g, " ");

    const ojReference = $(".oj-ref").text().trim() || undefined;
    const date = $(".doc-date").text().trim() || undefined;

    // Remove noise elements
    $("script, style, noscript, nav, header, footer, #banner, .cookie-consent").remove();

    // Extract body text
    const contentSnippet = $("body").text().replace(/\s+/g, " ").trim().slice(0, 5000);

    return {
      celex,
      title,
      documentType: this.inferDocType(celex),
      date,
      language,
      ojReference,
      url,
      contentSnippet,
    };
  }

  private parseSparqlOrJsonResponse(
    json: unknown,
    language: string
  ): { documents: EurLexDocumentItem[]; totalCount: number } {
    const documents: EurLexDocumentItem[] = [];

    // CELLAR SPARQL format
    const sparql = json as RawSparqlResponse;
    if (sparql?.results?.bindings && Array.isArray(sparql.results.bindings)) {
      for (const b of sparql.results.bindings) {
        const celex = b.celex?.value || "UNKNOWN";
        const title = b.title?.value || `Document CELEX:${celex}`;
        const workUrl =
          b.work?.value || `${EUR_LEX_DIRECT_BASE}/${language}/TXT/?uri=CELEX:${celex}`;

        documents.push({
          celex,
          title,
          documentType: this.inferDocType(celex),
          language,
          url: workUrl,
        });
      }
      return { documents, totalCount: documents.length };
    }

    // Generic JSON array format
    if (Array.isArray(json)) {
      const items = json as RawGenericEurLexItem[];
      for (const item of items) {
        documents.push({
          celex: item.celex || "UNKNOWN",
          title: item.title || "Untitled EU Act",
          documentType: item.documentType || this.inferDocType(item.celex || ""),
          date: item.date,
          language: item.language || language,
          ojReference: item.ojReference,
          url: item.url || `${EUR_LEX_DIRECT_BASE}/${language}/TXT/?uri=CELEX:${item.celex}`,
          contentSnippet: item.contentSnippet,
        });
      }
      return { documents, totalCount: documents.length };
    }

    const singleItem = json as RawGenericEurLexItem;
    if (singleItem?.celex) {
      documents.push({
        celex: singleItem.celex,
        title: singleItem.title || `Document ${singleItem.celex}`,
        documentType: this.inferDocType(singleItem.celex),
        date: singleItem.date,
        language,
        url:
          singleItem.url || `${EUR_LEX_DIRECT_BASE}/${language}/TXT/?uri=CELEX:${singleItem.celex}`,
        contentSnippet: singleItem.contentSnippet,
      });
      return { documents, totalCount: 1 };
    }

    return { documents: [], totalCount: 0 };
  }

  private inferDocType(celex: string): string {
    if (celex.includes("R")) return "Regulation";
    if (celex.includes("L")) return "Directive";
    if (celex.includes("D")) return "Decision";
    if (celex.includes("CJ") || celex.startsWith("6")) return "CJEU Judgment";
    if (celex.includes("PC")) return "Commission Proposal";
    return "Legal Act";
  }

  private synthesizeMarkdown(
    docs: EurLexDocumentItem[],
    celex?: string,
    query?: string,
    language = DEFAULT_LANGUAGE
  ): string {
    const lines: string[] = [];

    if (celex && docs.length > 0) {
      const doc = docs[0];
      lines.push(`# EUR-Lex Document: CELEX ${doc.celex}`);
      lines.push(`- **Title**: ${doc.title}`);
      lines.push(`- **Type**: ${doc.documentType || "EU Legal Act"}`);
      lines.push(`- **Language**: ${doc.language.toUpperCase()}`);
      if (doc.date) lines.push(`- **Adoption Date**: ${doc.date}`);
      if (doc.ojReference) lines.push(`- **Official Journal**: ${doc.ojReference}`);
      lines.push(`- **EUR-Lex URI**: ${doc.url}`);
      lines.push("");

      if (doc.contentSnippet) {
        lines.push("## Document Content Excerpt");
        lines.push(doc.contentSnippet);
      }
      return lines.join("\n").trim();
    }

    lines.push(`# EUR-Lex Legal Act Search`);
    if (query) lines.push(`Search Query: "${query}"`);
    lines.push(`Language: ${language.toUpperCase()}`);
    lines.push(`Total Retrieved: ${docs.length}`);
    lines.push("");

    if (docs.length === 0) {
      lines.push("No EU directives or regulations found matching query.");
      return lines.join("\n");
    }

    lines.push("| CELEX | Type | Title | Link |");
    lines.push("|---|---|---|---|");

    for (const d of docs) {
      lines.push(
        `| \`${d.celex}\` | **${d.documentType || "Act"}** | ${d.title.slice(0, 100)}... | [View](${d.url}) |`
      );
    }

    return lines.join("\n").trim();
  }
}
