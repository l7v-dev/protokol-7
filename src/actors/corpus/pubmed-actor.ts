/**
 * PubmedActor - Biomedical, clinical, and life sciences research literature actor.
 * Interfaces with NCBI E-utilities (esearch, esummary, efetch) and BioC API for PubMed
 * articles, structured abstracts, MeSH descriptors, authors, and PMC full texts.
 */

import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  PubmedActorResult,
  PubmedActorTaskOptions,
  PubmedArticleItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 20;

const NCBI_ESEARCH_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const NCBI_ESUMMARY_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
const NCBI_EFETCH_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const NCBI_BIOC_BASE = "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json";

interface RawEsearchResult {
  esearchresult?: {
    count?: string;
    retmax?: string;
    retstart?: string;
    idlist?: string[];
  };
}

interface RawEsummaryResult {
  result?: {
    uids?: string[];
    [key: string]: unknown;
  };
}

interface RawBioCResult {
  documents?: Array<{
    id?: string;
    passages?: Array<{
      infons?: Record<string, string>;
      text?: string;
    }>;
  }>;
}

export class PubmedActor implements IActor<PubmedActorResult> {
  readonly actorType = "pubmed" as const;
  readonly description =
    "Queries NCBI E-utilities (esearch, esummary, efetch) and BioC API for biomedical literature, PubMed abstracts, MeSH terms, and PMC open-access articles.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<PubmedActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: PubmedActorTaskOptions = task.options?.pubmedOptions || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";
    const action = options.action || "search";

    try {
      // 1. Initial SSRF validation on targetUrl if explicitly provided
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

      // 2. Resolve primary API query URL based on action
      const resolvedQueryUrl = this.buildApiUrl(task.targetUrl, options, action);

      // 3. Validate resolved URL against SSRF policy
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

      // 4. Fetch initial response
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(resolvedQueryUrl, {
          signal: controller.signal,
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; pubmed-actor)",
            Accept: "application/json, application/xml, text/xml, */*",
          },
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
          errorMessage: `NCBI API returned HTTP error ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const responseText = await response.text();
      const trimmedText = responseText.trim();

      // 5. Parse response according to content / action
      let articles: PubmedArticleItem[] = [];
      let totalCount = 0;
      let pmids: string[] = [];

      if (
        trimmedText.startsWith("<") ||
        trimmedText.includes("<?xml") ||
        trimmedText.includes("<PubmedArticleSet")
      ) {
        // PubMed XML format
        articles = this.parsePubmedXml(trimmedText);
        pmids = articles.map((a) => a.pmid);
        totalCount = articles.length;
      } else {
        // JSON format
        let json: unknown;
        try {
          json = JSON.parse(trimmedText);
        } catch {
          json = null;
        }

        if (json && typeof json === "object") {
          if ("esearchresult" in json) {
            const esearch = (json as RawEsearchResult).esearchresult;
            pmids = esearch?.idlist || [];
            totalCount = Number.parseInt(esearch?.count || "0", 10) || pmids.length;

            // In search action without targetUrl override, if we found PMIDs and want articles,
            // we can construct stub article items or fetch details. If targetUrl was supplied, we return the parsed list.
            articles = pmids.map((id) => ({
              pmid: id,
              title: `PubMed Article ${id}`,
              authors: [],
              fullTextUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
              markdown: `# PubMed Article ${id}\n\n- **PMID:** [${id}](https://pubmed.ncbi.nlm.nih.gov/${id}/)`,
            }));
          } else if ("result" in json) {
            const resObj = (json as RawEsummaryResult).result || {};
            const uids = resObj.uids || [];
            pmids = uids;
            totalCount = uids.length;
            articles = this.parseEsummaryJson(resObj);
          } else if ("documents" in json) {
            const biocObj = json as RawBioCResult;
            articles = this.parseBioCJson(biocObj);
            pmids = articles.map((a) => a.pmid || a.pmcid || "");
            totalCount = articles.length;
          }
        }
      }

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          action,
          totalCount,
          pmids,
          articles,
          queryUrl: resolvedQueryUrl,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const isAbort =
        (err instanceof Error && err.name === "AbortError") ||
        (typeof err === "object" &&
          err !== null &&
          "type" in err &&
          (err as { type: string }).type === "aborted");
      const isTimeout = isAbort || (err instanceof Error && /timeout/i.test(err.message));

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        statusCode: isTimeout ? 408 : 500,
        errorMessage: err instanceof Error ? err.message : String(err),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private buildApiUrl(
    targetUrl: string | undefined,
    options: PubmedActorTaskOptions,
    action: "search" | "summary" | "fetch" | "bioc"
  ): string {
    if (targetUrl) {
      return targetUrl;
    }

    const maxResults = Math.min(options.maxResults || DEFAULT_MAX_RESULTS, 100);

    if (action === "summary") {
      const pmidsStr = (options.pmids || []).join(",");
      const url = new URL(NCBI_ESUMMARY_BASE);
      url.searchParams.set("db", "pubmed");
      url.searchParams.set("retmode", "json");
      if (pmidsStr) url.searchParams.set("id", pmidsStr);
      if (options.apiKey) url.searchParams.set("api_key", options.apiKey);
      return url.toString();
    }

    if (action === "fetch") {
      const pmidsStr = (options.pmids || []).join(",");
      const url = new URL(NCBI_EFETCH_BASE);
      url.searchParams.set("db", "pubmed");
      url.searchParams.set("retmode", "xml");
      if (pmidsStr) url.searchParams.set("id", pmidsStr);
      if (options.apiKey) url.searchParams.set("api_key", options.apiKey);
      return url.toString();
    }

    if (action === "bioc") {
      const pmcid = options.pmcids?.[0] || options.pmids?.[0] || "";
      const normalizedPmcid = pmcid.replace(/^PMC/i, "");
      return `${NCBI_BIOC_BASE}/${normalizedPmcid}/unicode`;
    }

    // Default "search"
    const url = new URL(NCBI_ESEARCH_BASE);
    url.searchParams.set("db", "pubmed");
    url.searchParams.set("retmode", "json");
    url.searchParams.set("term", options.query || "biomedical");
    url.searchParams.set("retmax", String(maxResults));
    if (options.apiKey) url.searchParams.set("api_key", options.apiKey);
    return url.toString();
  }

  private parsePubmedXml(xmlText: string): PubmedArticleItem[] {
    const $ = cheerio.load(xmlText, { xmlMode: true });
    const articles: PubmedArticleItem[] = [];

    $("PubmedArticle").each((_, el) => {
      const articleElem = $(el);
      const pmid = articleElem.find("MedlineCitation > PMID").text().trim();
      const title = articleElem.find("MedlineCitation > Article > ArticleTitle").text().trim();

      // Abstract
      const abstractParts: string[] = [];
      articleElem.find("MedlineCitation > Article > Abstract > AbstractText").each((_, aEl) => {
        const label = $(aEl).attr("Label");
        const text = $(aEl).text().trim();
        if (label && text) {
          abstractParts.push(`**${label}:** ${text}`);
        } else if (text) {
          abstractParts.push(text);
        }
      });
      const abstractText = abstractParts.join("\n\n");

      // Journal
      const journalTitle =
        articleElem.find("MedlineCitation > Article > Journal > Title").text().trim() ||
        articleElem.find("MedlineCitation > Article > Journal > ISOAbbreviation").text().trim();

      // PubDate
      const pubYearStr =
        articleElem
          .find("MedlineCitation > Article > Journal > JournalIssue > PubDate > Year")
          .text()
          .trim() || articleElem.find("MedlineCitation > DateCompleted > Year").text().trim();
      const pubYear = pubYearStr ? Number.parseInt(pubYearStr, 10) : undefined;
      const pubMonth = articleElem
        .find("MedlineCitation > Article > Journal > JournalIssue > PubDate > Month")
        .text()
        .trim();
      const pubDay = articleElem
        .find("MedlineCitation > Article > Journal > JournalIssue > PubDate > Day")
        .text()
        .trim();
      const pubDate = [pubYearStr, pubMonth, pubDay].filter(Boolean).join("-") || undefined;

      // Authors
      const authors: string[] = [];
      articleElem.find("MedlineCitation > Article > AuthorList > Author").each((_, authEl) => {
        const lastName = $(authEl).find("LastName").text().trim();
        const foreName = $(authEl).find("ForeName").text().trim();
        const collective = $(authEl).find("CollectiveName").text().trim();
        if (lastName && foreName) {
          authors.push(`${foreName} ${lastName}`);
        } else if (lastName) {
          authors.push(lastName);
        } else if (collective) {
          authors.push(collective);
        }
      });

      // MeSH Headings
      const meshHeadings: string[] = [];
      articleElem.find("MedlineCitation > MeshHeadingList > MeshHeading").each((_, meshEl) => {
        const desc = $(meshEl).find("DescriptorName");
        const term = desc.text().trim();
        if (term) {
          const isMajor = desc.attr("MajorTopicYN") === "Y";
          meshHeadings.push(isMajor ? `${term}*` : term);
        }
      });

      // Identifiers: DOI & PMC
      let doi: string | undefined;
      let pmcid: string | undefined;
      articleElem.find("PubmedData > ArticleIdList > ArticleId").each((_, idEl) => {
        const idType = $(idEl).attr("IdType");
        const val = $(idEl).text().trim();
        if (idType === "doi" && val) doi = val;
        if (idType === "pmc" && val) pmcid = val.startsWith("PMC") ? val : `PMC${val}`;
      });

      // PubTypes
      const pubTypes: string[] = [];
      articleElem
        .find("MedlineCitation > Article > PublicationTypeList > PublicationType")
        .each((_, ptEl) => {
          const pt = $(ptEl).text().trim();
          if (pt) pubTypes.push(pt);
        });

      // Full text URL
      const fullTextUrl = pmcid
        ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`
        : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

      // Markdown synthesis
      const markdownLines = [
        `# ${title}`,
        "",
        `- **PMID:** [${pmid}](https://pubmed.ncbi.nlm.nih.gov/${pmid}/)`,
      ];
      if (pmcid)
        markdownLines.push(
          `- **PMCID:** [${pmcid}](https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/)`
        );
      if (doi) markdownLines.push(`- **DOI:** [${doi}](https://doi.org/${doi})`);
      if (journalTitle) markdownLines.push(`- **Journal:** ${journalTitle}`);
      if (pubDate) markdownLines.push(`- **Publication Date:** ${pubDate}`);
      if (authors.length > 0) markdownLines.push(`- **Authors:** ${authors.join(", ")}`);
      if (meshHeadings.length > 0)
        markdownLines.push(`- **MeSH Headings:** ${meshHeadings.join("; ")}`);
      if (abstractText) {
        markdownLines.push("", "## Abstract", "", abstractText);
      }
      const markdown = markdownLines.join("\n");

      articles.push({
        pmid,
        pmcid,
        doi,
        title,
        abstractText: abstractText || undefined,
        journalTitle: journalTitle || undefined,
        pubDate,
        pubYear: Number.isNaN(pubYear) ? undefined : pubYear,
        authors,
        meshHeadings: meshHeadings.length > 0 ? meshHeadings : undefined,
        pubTypes: pubTypes.length > 0 ? pubTypes : undefined,
        fullTextUrl,
        markdown,
      });
    });

    return articles;
  }

  private parseEsummaryJson(resultObj: Record<string, unknown>): PubmedArticleItem[] {
    const uids = (resultObj.uids as string[]) || [];
    const articles: PubmedArticleItem[] = [];

    for (const uid of uids) {
      const item = resultObj[uid] as Record<string, unknown> | undefined;
      if (!item) continue;

      const title = String(item.title || "")
        .replace(/<[^>]+>/g, "")
        .trim();
      const journalTitle = item.source ? String(item.source).trim() : undefined;
      const pubDate = item.pubdate ? String(item.pubdate).trim() : undefined;

      let pubYear: number | undefined;
      if (pubDate) {
        const match = pubDate.match(/\b(19\d\d|20\d\d)\b/);
        if (match) pubYear = Number.parseInt(match[1], 10);
      }

      const authors: string[] = [];
      if (Array.isArray(item.authors)) {
        for (const auth of item.authors) {
          if (auth && typeof auth === "object" && "name" in auth && typeof auth.name === "string") {
            authors.push(auth.name);
          }
        }
      }

      let doi: string | undefined;
      let pmcid: string | undefined;
      if (Array.isArray(item.articleids)) {
        for (const aid of item.articleids) {
          if (aid && typeof aid === "object" && "idtype" in aid && "value" in aid) {
            const idtype = String(aid.idtype).toLowerCase();
            const val = String(aid.value);
            if (idtype === "doi") doi = val;
            if (idtype === "pmc") pmcid = val.startsWith("PMC") ? val : `PMC${val}`;
          }
        }
      }

      const fullTextUrl = pmcid
        ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`
        : `https://pubmed.ncbi.nlm.nih.gov/${uid}/`;

      const markdownLines = [
        `# ${title}`,
        "",
        `- **PMID:** [${uid}](https://pubmed.ncbi.nlm.nih.gov/${uid}/)`,
      ];
      if (pmcid)
        markdownLines.push(
          `- **PMCID:** [${pmcid}](https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/)`
        );
      if (doi) markdownLines.push(`- **DOI:** [${doi}](https://doi.org/${doi})`);
      if (journalTitle) markdownLines.push(`- **Journal:** ${journalTitle}`);
      if (pubDate) markdownLines.push(`- **Publication Date:** ${pubDate}`);
      if (authors.length > 0) markdownLines.push(`- **Authors:** ${authors.join(", ")}`);
      const markdown = markdownLines.join("\n");

      articles.push({
        pmid: uid,
        pmcid,
        doi,
        title,
        journalTitle,
        pubDate,
        pubYear,
        authors,
        fullTextUrl,
        markdown,
      });
    }

    return articles;
  }

  private parseBioCJson(biocObj: RawBioCResult): PubmedArticleItem[] {
    const docs = biocObj.documents || [];
    const articles: PubmedArticleItem[] = [];

    for (const doc of docs) {
      const pmcid = doc.id?.startsWith("PMC") ? doc.id : doc.id ? `PMC${doc.id}` : "";
      let title = "";
      const abstractParts: string[] = [];
      const bodyParts: string[] = [];

      for (const p of doc.passages || []) {
        const secType = p.infons?.section_type?.toUpperCase() || "";
        const text = p.text?.trim() || "";
        if (!text) continue;

        if (secType === "TITLE" && !title) {
          title = text;
        } else if (secType === "ABSTRACT" || secType.includes("ABSTR")) {
          abstractParts.push(text);
        } else {
          bodyParts.push(text);
        }
      }

      const abstractText = abstractParts.join("\n\n");
      const fullTextUrl = pmcid ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/` : "";

      const markdownLines = [
        `# ${title || pmcid || "PMC Article"}`,
        "",
        pmcid ? `- **PMCID:** [${pmcid}](${fullTextUrl})` : "",
      ].filter(Boolean);

      if (abstractText) {
        markdownLines.push("", "## Abstract", "", abstractText);
      }
      if (bodyParts.length > 0) {
        markdownLines.push("", "## Article Text", "", bodyParts.slice(0, 5).join("\n\n"));
      }
      const markdown = markdownLines.join("\n");

      articles.push({
        pmid: "",
        pmcid: pmcid || undefined,
        title: title || pmcid || "PMC Article",
        abstractText: abstractText || undefined,
        authors: [],
        fullTextUrl: fullTextUrl || undefined,
        markdown,
      });
    }

    return articles;
  }
}
