/**
 * GooglePatentsActor - Google Patents & USPTO/EPO public global patent data,
 * claims hierarchy, technical specifications, and prior art citations extraction actor.
 * Conforms to docs/actor-contract.md and docs/plans/turk-hukuku-ve-patent-aktorleri-plani.md.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  GooglePatentClaimItem,
  GooglePatentItem,
  GooglePatentsAction,
  GooglePatentsActorResult,
  GooglePatentsActorTaskOptions,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const PATENTS_BASE = "https://patents.google.com";

export class GooglePatentsActor implements IActor<GooglePatentsActorResult> {
  readonly actorType = "google-patents" as const;
  readonly description =
    "Google Patents global patent claims, engineering specifications, prior art, and classification codes extraction actor.";

  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    });
    this.turndown.remove(["script", "style", "nav", "footer", "iframe", "noscript"]);
  }

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<GooglePatentsActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: GooglePatentsActorTaskOptions =
      task.options?.googlePatentsOptions || (task.options as GooglePatentsActorTaskOptions) || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      const action = this.resolveAction(task.targetUrl, options.action);

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

      const endpoint = this.buildEndpointUrl(task.targetUrl, action, options);

      const ssrfCheck = await SSRFGuard.validateUrlWithDns(endpoint, { allowLocalNetwork });
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

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(endpoint, {
          signal: controller.signal,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html, application/json;q=0.9, */*;q=0.8",
          },
          timeoutMs,
          allowLocalNetwork,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `Upstream Google Patents request failed with HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const rawText = await response.text();
      const resultData = this.parseResponse(rawText, endpoint, action, options);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: resultData,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: err instanceof Error ? err.message : String(err),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Resolves action mode from URL or options.
   */
  resolveAction(targetUrl?: string, specifiedAction?: GooglePatentsAction): GooglePatentsAction {
    if (specifiedAction) return specifiedAction;

    if (targetUrl) {
      const lower = targetUrl.toLowerCase();
      if (lower.includes("/claims") || lower.includes("#claims")) {
        return "claims";
      }
      if (lower.includes("/patent/")) {
        return "patent";
      }
    }

    return "search";
  }

  /**
   * Extracts patent ID from URL or input string.
   */
  resolvePatentId(targetUrl?: string, specifiedPatentId?: string): string {
    if (specifiedPatentId?.trim()) {
      return specifiedPatentId.trim().toUpperCase();
    }
    if (targetUrl) {
      const match = targetUrl.match(/\/patent\/([A-Za-z0-9_-]+)/);
      if (match) {
        return match[1].split("/")[0].toUpperCase();
      }
    }
    return "US10000000B2";
  }

  /**
   * Builds request endpoint URL.
   */
  buildEndpointUrl(
    targetUrl?: string,
    action: GooglePatentsAction = "patent",
    options?: GooglePatentsActorTaskOptions
  ): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return targetUrl;
    }

    const baseUrl = PATENTS_BASE;

    if (action === "patent" || action === "claims") {
      const patentId = this.resolvePatentId(targetUrl, options?.patentId);
      return `${baseUrl}/patent/${encodeURIComponent(patentId)}/en`;
    }

    const url = new URL(`${baseUrl}/`);
    const qParts: string[] = [];

    if (options?.query) {
      qParts.push(options.query.trim());
    }
    if (options?.inventor) {
      qParts.push(`inventor:(${options.inventor.trim()})`);
    }
    if (options?.assignee) {
      qParts.push(`assignee:(${options.assignee.trim()})`);
    }
    if (options?.country) {
      qParts.push(`country:${options.country.trim().toUpperCase()}`);
    }
    if (options?.status && options.status !== "all") {
      qParts.push(`status:${options.status.toUpperCase()}`);
    }
    if (options?.before) {
      qParts.push(`before:priority:${options.before.trim()}`);
    }
    if (options?.after) {
      qParts.push(`after:priority:${options.after.trim()}`);
    }

    if (qParts.length > 0) {
      url.searchParams.set("q", qParts.join(" "));
    }

    if (options?.limit) {
      url.searchParams.set("num", String(options.limit));
    }

    return url.href;
  }

  /**
   * Parses JSON or HTML response into GooglePatentsActorResult.
   */
  private parseResponse(
    rawText: string,
    queryUrl: string,
    action: GooglePatentsAction,
    options: GooglePatentsActorTaskOptions
  ): GooglePatentsActorResult {
    // Attempt JSON parse
    try {
      const parsed = JSON.parse(rawText);
      if (parsed.patentId || parsed.patent || parsed.title) {
        return this.parseJsonPatent(parsed, queryUrl, action);
      }
      if (Array.isArray(parsed) || Array.isArray(parsed.results)) {
        return this.parseJsonSearchResults(parsed, queryUrl);
      }
    } catch {
      // Fallback to HTML
    }

    if (action === "patent" || action === "claims") {
      return this.parseHtmlPatent(rawText, queryUrl, action, options);
    }

    return this.parseHtmlSearch(rawText, queryUrl, options);
  }

  /**
   * Parses JSON single patent structure.
   */
  private parseJsonPatent(
    data: Record<string, unknown>,
    queryUrl: string,
    action: GooglePatentsAction
  ): GooglePatentsActorResult {
    const rawPatent = (data.patent || data) as Record<string, unknown>;
    const patentId = String(rawPatent.patentId || rawPatent.id || "UNKNOWN").toUpperCase();
    const title = String(rawPatent.title || "Untitled Patent").trim();
    const abstract = rawPatent.abstract ? String(rawPatent.abstract).trim() : undefined;
    const publicationDate = rawPatent.publicationDate
      ? String(rawPatent.publicationDate)
      : undefined;
    const filingDate = rawPatent.filingDate ? String(rawPatent.filingDate) : undefined;
    const priorityDate = rawPatent.priorityDate ? String(rawPatent.priorityDate) : undefined;
    const grantDate = rawPatent.grantDate ? String(rawPatent.grantDate) : undefined;
    const inventors = Array.isArray(rawPatent.inventors)
      ? (rawPatent.inventors as string[])
      : undefined;
    const assignees = Array.isArray(rawPatent.assignees)
      ? (rawPatent.assignees as string[])
      : undefined;
    const jurisdiction = rawPatent.jurisdiction
      ? String(rawPatent.jurisdiction)
      : patentId.slice(0, 2);
    const kindCode = rawPatent.kindCode ? String(rawPatent.kindCode) : undefined;
    const cpcClassifications = Array.isArray(rawPatent.cpcClassifications)
      ? (rawPatent.cpcClassifications as string[])
      : undefined;
    const ipcClassifications = Array.isArray(rawPatent.ipcClassifications)
      ? (rawPatent.ipcClassifications as string[])
      : undefined;

    const claims: GooglePatentClaimItem[] = [];
    if (Array.isArray(rawPatent.claims)) {
      rawPatent.claims.forEach((cl, index) => {
        const item = cl as Record<string, unknown>;
        const num = Number(item.number || index + 1);
        const text = String(item.text || item.claimText || "").trim();
        const isInd = Boolean(item.isIndependent ?? !text.toLowerCase().includes("claim"));
        claims.push({
          number: num,
          claimId: String(item.claimId || `claim-${num}`),
          text,
          isIndependent: isInd,
          dependentOn: typeof item.dependentOn === "number" ? item.dependentOn : undefined,
        });
      });
    }

    const patentItem: GooglePatentItem = {
      patentId,
      title,
      abstract,
      url: queryUrl,
      publicationDate,
      filingDate,
      priorityDate,
      grantDate,
      inventors,
      assignees,
      jurisdiction,
      kindCode,
      cpcClassifications,
      ipcClassifications,
      claimsCount: claims.length,
      claims: claims.length > 0 ? claims : undefined,
      descriptionMarkdown: rawPatent.description ? String(rawPatent.description) : undefined,
    };

    const markdown =
      action === "claims"
        ? this.renderClaimsMarkdown(claims, patentId, queryUrl)
        : this.renderPatentMarkdown(patentItem);

    return {
      action,
      queryUrl,
      totalResults: 1,
      patent: patentItem,
      claims: claims.length > 0 ? claims : undefined,
      markdown,
    };
  }

  /**
   * Parses JSON search results.
   */
  private parseJsonSearchResults(data: unknown, queryUrl: string): GooglePatentsActorResult {
    const rawList = Array.isArray(data)
      ? data
      : (data as Record<string, unknown>).results
        ? ((data as Record<string, unknown>).results as Record<string, unknown>[])
        : [];

    const patents: GooglePatentItem[] = rawList.map((item, idx) => {
      const p = item as Record<string, unknown>;
      const patentId = String(p.patentId || p.id || `PATENT-${idx + 1}`).toUpperCase();
      return {
        patentId,
        title: String(p.title || `Patent ${patentId}`).trim(),
        abstract: p.abstract ? String(p.abstract).trim() : undefined,
        url: p.url ? String(p.url) : `${PATENTS_BASE}/patent/${patentId}/en`,
        publicationDate: p.publicationDate ? String(p.publicationDate) : undefined,
        filingDate: p.filingDate ? String(p.filingDate) : undefined,
        inventors: Array.isArray(p.inventors) ? (p.inventors as string[]) : undefined,
        assignees: Array.isArray(p.assignees) ? (p.assignees as string[]) : undefined,
        jurisdiction: p.jurisdiction ? String(p.jurisdiction) : patentId.slice(0, 2),
      };
    });

    const markdown = this.renderSearchMarkdown(patents, queryUrl);

    return {
      action: "search",
      queryUrl,
      totalResults: patents.length,
      patents,
      markdown,
    };
  }

  /**
   * Parses HTML patent specification page from patents.google.com.
   */
  private parseHtmlPatent(
    html: string,
    queryUrl: string,
    action: GooglePatentsAction,
    options: GooglePatentsActorTaskOptions
  ): GooglePatentsActorResult {
    const $ = cheerio.load(html);

    const patentId = this.resolvePatentId(queryUrl, options.patentId);
    const title =
      $("#title, .title, meta[name='DC.title']").first().attr("content") ||
      $("#title, .title, h1").first().text().replace(/\s+/g, " ").trim() ||
      `Patent ${patentId}`;

    const abstract =
      $("section[itemprop='abstract'] .abstract, meta[name='DC.description']")
        .first()
        .attr("content") ||
      $("section[itemprop='abstract'], .abstract").first().text().replace(/\s+/g, " ").trim() ||
      undefined;

    // Dates & Metadata
    let publicationDate: string | undefined;
    let filingDate: string | undefined;
    let priorityDate: string | undefined;

    $("meta[name='DC.date']").each((_, el) => {
      const scheme = $(el).attr("scheme");
      const content = $(el).attr("content");
      if (!content) return;
      if (scheme === "issue" || scheme === "dateSubmitted") publicationDate = content;
      if (scheme === "dateSubmitted") filingDate = content;
    });

    // Check application dates in table or metadata
    const bodyText = $("body").text();
    const pubMatch = bodyText.match(/Publication\s*date\s*:\s*([0-9-]{8,10})/i);
    if (pubMatch) publicationDate = pubMatch[1];
    const filingMatch = bodyText.match(/Filing\s*date\s*:\s*([0-9-]{8,10})/i);
    if (filingMatch) filingDate = filingMatch[1];
    const prioMatch = bodyText.match(/Priority\s*date\s*:\s*([0-9-]{8,10})/i);
    if (prioMatch) priorityDate = prioMatch[1];

    // Inventors & Assignees
    const inventors: string[] = [];
    $("meta[name='DC.contributor']").each((_, el) => {
      const name = $(el).attr("content")?.trim();
      if (name && !inventors.includes(name)) inventors.push(name);
    });
    $(".inventor, [itemprop='inventor']").each((_, el) => {
      const name = $(el).text().trim();
      if (name && !inventors.includes(name)) inventors.push(name);
    });

    const assignees: string[] = [];
    $(".assignee, [itemprop='assigneeOriginal'], [itemprop='assigneeCurrent']").each((_, el) => {
      const name = $(el).text().trim();
      if (name && !assignees.includes(name)) assignees.push(name);
    });

    // Classifications
    const cpcClassifications: string[] = [];
    $(".cpc, [itemprop='cpcs'] span, a[href*='cpc']").each((_, el) => {
      const code = $(el).text().trim();
      if (code.match(/^[A-H]\d{2}[A-Z]\d+/i) && !cpcClassifications.includes(code)) {
        cpcClassifications.push(code);
      }
    });

    // Claims extraction
    const claims: GooglePatentClaimItem[] = [];
    $("section[itemprop='claims'] .claim, .claims-section .claim, .claim-text").each(
      (index, el) => {
        const $cl = $(el);
        const text = $cl.text().replace(/\s+/g, " ").trim();
        if (!text) return;

        const numMatch = text.match(/^(\d+)\.\s*(.*)$/);
        const claimNum = numMatch ? parseInt(numMatch[1], 10) : index + 1;
        const claimText = numMatch ? numMatch[2] : text;

        const depMatch = claimText.match(/claim\s*(\d+)/i);
        const dependentOn = depMatch ? parseInt(depMatch[1], 10) : undefined;
        const isIndependent = !dependentOn;

        claims.push({
          number: claimNum,
          claimId: `claim-${claimNum}`,
          text: claimText,
          isIndependent,
          dependentOn,
        });
      }
    );

    // Fallback claims parser if selector was empty
    if (claims.length === 0) {
      const claimsBlock = $("section[itemprop='claims'], #claims").text();
      const claimSplits = claimsBlock.split(/(?=\b\d+\.\s+)/);
      for (const seg of claimSplits) {
        const trimmed = seg.replace(/\s+/g, " ").trim();
        const m = trimmed.match(/^(\d+)\.\s*(.+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          const t = m[2];
          const depMatch = t.match(/claim\s*(\d+)/i);
          claims.push({
            number: num,
            claimId: `claim-${num}`,
            text: t,
            isIndependent: !depMatch,
            dependentOn: depMatch ? parseInt(depMatch[1], 10) : undefined,
          });
        }
      }
    }

    // Description markdown
    const descEl = $("section[itemprop='description'], #description, .description");
    const descriptionMarkdown =
      descEl.length > 0 ? this.turndown.turndown(descEl.html() || "") : undefined;

    const patentItem: GooglePatentItem = {
      patentId,
      title,
      abstract,
      url: queryUrl,
      publicationDate,
      filingDate,
      priorityDate,
      inventors: inventors.length > 0 ? inventors : undefined,
      assignees: assignees.length > 0 ? assignees : undefined,
      jurisdiction: patentId.slice(0, 2),
      cpcClassifications: cpcClassifications.length > 0 ? cpcClassifications : undefined,
      claimsCount: claims.length,
      claims: claims.length > 0 ? claims : undefined,
      descriptionMarkdown,
    };

    const markdown =
      action === "claims"
        ? this.renderClaimsMarkdown(claims, patentId, queryUrl)
        : this.renderPatentMarkdown(patentItem);

    return {
      action,
      queryUrl,
      totalResults: 1,
      patent: patentItem,
      claims: claims.length > 0 ? claims : undefined,
      markdown,
    };
  }

  /**
   * Parses HTML patent search page.
   */
  private parseHtmlSearch(
    html: string,
    queryUrl: string,
    _options: GooglePatentsActorTaskOptions
  ): GooglePatentsActorResult {
    const $ = cheerio.load(html);
    const patents: GooglePatentItem[] = [];

    $("search-result-item, .search-result, tr.result, li.result").each((index, el) => {
      const $el = $(el);
      const link = $el.find("a[href*='/patent/']").first();
      const href = link.attr("href") || "";
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (!text || text.length < 5) return;

      const patentId = this.resolvePatentId(href, `PATENT-${index + 1}`);
      const title =
        $el.find(".title, h3, h4").first().text().trim() ||
        link.text().trim() ||
        `Patent ${patentId}`;
      const abstract = $el.find(".snippet, .abstract").first().text().trim() || undefined;

      const itemUrl = href.startsWith("http")
        ? href
        : href
          ? `${PATENTS_BASE}${href.startsWith("/") ? "" : "/"}${href}`
          : `${queryUrl}#${patentId}`;

      patents.push({
        patentId,
        title,
        abstract,
        url: itemUrl,
        jurisdiction: patentId.slice(0, 2),
      });
    });

    const markdown = this.renderSearchMarkdown(patents, queryUrl);

    return {
      action: "search",
      queryUrl,
      totalResults: patents.length,
      patents,
      markdown,
    };
  }

  private renderClaimsMarkdown(
    claims: GooglePatentClaimItem[],
    patentId: string,
    queryUrl: string
  ): string {
    const lines: string[] = [
      `# Claims for Patent ${patentId}`,
      "",
      `- **Patent Document:** [${queryUrl}](${queryUrl})`,
      `- **Total Claims:** ${claims.length}`,
      `- **Independent Claims:** ${claims.filter((c) => c.isIndependent).length}`,
      `- **Dependent Claims:** ${claims.filter((c) => !c.isIndependent).length}`,
      "",
      "---",
      "",
    ];

    claims.forEach((cl) => {
      const badge = cl.isIndependent
        ? "**[INDEPENDENT CLAIM]**"
        : `**[DEPENDENT ON CLAIM ${cl.dependentOn}]**`;
      lines.push(`### Claim ${cl.number} ${badge}`);
      lines.push("");
      lines.push(cl.text);
      lines.push("");
    });

    return lines.join("\n");
  }

  private renderPatentMarkdown(patent: GooglePatentItem): string {
    const lines: string[] = [
      `# ${patent.patentId}: ${patent.title}`,
      "",
      `- **Document URL:** [${patent.url}](${patent.url})`,
      `- **Jurisdiction:** ${patent.jurisdiction || patent.patentId.slice(0, 2)}`,
    ];

    if (patent.filingDate) lines.push(`- **Filing Date:** ${patent.filingDate}`);
    if (patent.publicationDate) lines.push(`- **Publication Date:** ${patent.publicationDate}`);
    if (patent.priorityDate) lines.push(`- **Priority Date:** ${patent.priorityDate}`);
    if (patent.inventors && patent.inventors.length > 0) {
      lines.push(`- **Inventors:** ${patent.inventors.join(", ")}`);
    }
    if (patent.assignees && patent.assignees.length > 0) {
      lines.push(`- **Assignee(s):** ${patent.assignees.join(", ")}`);
    }
    if (patent.cpcClassifications && patent.cpcClassifications.length > 0) {
      lines.push(`- **CPC Classifications:** ${patent.cpcClassifications.slice(0, 10).join(", ")}`);
    }

    if (patent.abstract) {
      lines.push("");
      lines.push("## Abstract");
      lines.push("");
      lines.push(patent.abstract);
    }

    if (patent.claims && patent.claims.length > 0) {
      lines.push("");
      lines.push(`## Claims (${patent.claims.length})`);
      lines.push("");
      patent.claims.forEach((cl) => {
        const type = cl.isIndependent ? "Independent" : `Dependent on Claim ${cl.dependentOn}`;
        lines.push(`**Claim ${cl.number} (${type})**: ${cl.text}`);
        lines.push("");
      });
    }

    if (patent.descriptionMarkdown) {
      lines.push("");
      lines.push("## Description");
      lines.push("");
      lines.push(patent.descriptionMarkdown);
    }

    return lines.join("\n");
  }

  private renderSearchMarkdown(patents: GooglePatentItem[], queryUrl: string): string {
    const lines: string[] = [
      "# Google Patents Search Results",
      "",
      `- **Query URL:** [${queryUrl}](${queryUrl})`,
      `- **Total Patents Found:** ${patents.length}`,
      "",
      "| # | Patent ID | Title | Jurisdiction | Link |",
      "|---|---|---|---|---|",
    ];

    patents.forEach((item, idx) => {
      lines.push(
        `| ${idx + 1} | \`${item.patentId}\` | ${item.title.slice(0, 60)} | ${item.jurisdiction || "-"} | [View Patent](${item.url}) |`
      );
    });

    lines.push("");
    return lines.join("\n");
  }
}
