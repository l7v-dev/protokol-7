/**
 * DergiParkActor - Turkish academic periodical portal actor.
 *
 * Queries the DergiPark OAI-PMH 2.0 endpoint to list sets (journals),
 * harvest metadata records (ListRecords), and retrieve single article
 * metadata (GetRecord). All parsing is done on raw XML via cheerio
 * xmlMode; no external XML parser dependency is added.
 *
 * OAI-PMH base: https://dergipark.org.tr/api/public/oai
 * Dublin Core metadata format: oai_dc
 */

import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  DergiParkAction,
  DergiParkActorResult,
  DergiParkActorTaskOptions,
  DergiParkArticle,
  IActor,
} from "../core/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";

const OAI_BASE = "https://dergipark.org.tr/api/public/oai";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RECORDS = 20;

export class DergiParkActor implements IActor<DergiParkActorResult> {
  readonly actorType = "dergipark" as const;
  readonly description =
    "Harvests article metadata and PDF links from DergiPark academic journals via OAI-PMH 2.0 Dublin Core.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<DergiParkActorResult>> {
    const startTime = context?.startTime || Date.now();
    const opts: DergiParkActorTaskOptions = task.options?.dergiParkOptions ?? {};
    const action: DergiParkAction = opts.action ?? "search";
    const timeoutMs = opts.timeoutMs ?? task.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      if (action === "list-sets") {
        return await this.handleListSets(task, timeoutMs, allowLocalNetwork, startTime);
      }
      if (action === "record") {
        return await this.handleGetRecord(task, opts, timeoutMs, allowLocalNetwork, startTime);
      }
      // Default: search / ListRecords
      return await this.handleListRecords(task, opts, timeoutMs, allowLocalNetwork, startTime);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `DergiParkActor execution failure: ${msg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  // -------------------------------------------------------------------------
  // OAI-PMH: ListSets
  // -------------------------------------------------------------------------

  private async handleListSets(
    task: ActorTask,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    startTime: number
  ): Promise<ActorResult<DergiParkActorResult>> {
    const url = `${OAI_BASE}?verb=ListSets`;
    const resp = await safeRedirectFetch(url, { timeoutMs, allowLocalNetwork });

    if (!resp.ok) {
      return this.httpError(task, resp.status, `ListSets HTTP ${resp.status}`, startTime);
    }

    const xml = await resp.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const sets: Array<{ setSpec: string; setName: string }> = [];

    $("set").each((_, el) => {
      const setSpec = $(el).find("setSpec").first().text().trim();
      const setName = $(el).find("setName").first().text().trim();
      if (setSpec) sets.push({ setSpec, setName });
    });

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "list-sets",
        totalItems: sets.length,
        articles: [],
        sets,
        queryUrl: url,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  // -------------------------------------------------------------------------
  // OAI-PMH: GetRecord
  // -------------------------------------------------------------------------

  private async handleGetRecord(
    task: ActorTask,
    opts: DergiParkActorTaskOptions,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    startTime: number
  ): Promise<ActorResult<DergiParkActorResult>> {
    if (!opts.identifier) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 400,
        errorMessage: "action='record' requires dergiParkOptions.identifier.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    const url =
      `${OAI_BASE}?verb=GetRecord` +
      `&identifier=${encodeURIComponent(opts.identifier)}` +
      `&metadataPrefix=oai_dc`;

    const resp = await safeRedirectFetch(url, { timeoutMs, allowLocalNetwork });
    if (!resp.ok) {
      return this.httpError(task, resp.status, `GetRecord HTTP ${resp.status}`, startTime);
    }

    const xml = await resp.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const articles: DergiParkArticle[] = [];

    $("record").each((_, el) => {
      const article = this.parseRecord($, el);
      if (article) articles.push(article);
    });

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "record",
        totalItems: articles.length,
        articles,
        queryUrl: url,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  // -------------------------------------------------------------------------
  // OAI-PMH: ListRecords
  // -------------------------------------------------------------------------

  private async handleListRecords(
    task: ActorTask,
    opts: DergiParkActorTaskOptions,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    startTime: number
  ): Promise<ActorResult<DergiParkActorResult>> {
    const maxRecords = opts.maxRecords ?? DEFAULT_MAX_RECORDS;
    let queryUrl: string;

    if (opts.resumptionToken) {
      queryUrl =
        `${OAI_BASE}?verb=ListRecords` +
        `&resumptionToken=${encodeURIComponent(opts.resumptionToken)}`;
    } else {
      queryUrl =
        `${OAI_BASE}?verb=ListRecords&metadataPrefix=oai_dc` +
        (opts.set ? `&set=${encodeURIComponent(opts.set)}` : "");
    }

    const resp = await safeRedirectFetch(queryUrl, { timeoutMs, allowLocalNetwork });
    if (!resp.ok) {
      return this.httpError(task, resp.status, `ListRecords HTTP ${resp.status}`, startTime);
    }

    const xml = await resp.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    // OAI-PMH error response check
    const oaiError = $("error").first();
    if (oaiError.length > 0) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 400,
        errorMessage: `OAI-PMH error (${oaiError.attr("code") ?? "unknown"}): ${oaiError.text().trim()}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const keyword = opts.keyword?.toLowerCase();
    const articles: DergiParkArticle[] = [];

    $("record").each((_, el) => {
      if (articles.length >= maxRecords) return false;
      const article = this.parseRecord($, el);
      if (!article) return;

      // Client-side keyword filter on title and abstract
      if (keyword) {
        const haystack = `${article.title} ${article.abstract ?? ""}`.toLowerCase();
        if (!haystack.includes(keyword)) return;
      }

      articles.push(article);
    });

    const resumptionToken = $("resumptionToken").first().text().trim() || undefined;

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "search",
        totalItems: articles.length,
        articles,
        resumptionToken,
        queryUrl,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  // -------------------------------------------------------------------------
  // Dublin Core record parser
  // -------------------------------------------------------------------------

  private parseRecord(
    $: ReturnType<typeof cheerio.load>,
    el: cheerio.Element
  ): DergiParkArticle | undefined {
    const $el = $(el);
    const header = $el.find("header").first();
    const metadata = $el.find("metadata").first();

    const status = header.attr("status");
    if (status === "deleted") return undefined;

    const identifier = header.find("identifier").first().text().trim();
    if (!identifier) return undefined;

    const dc = metadata.find("dc\\:title, title").first();
    const title =
      dc.text().trim() || metadata.find("[localName='title']").first().text().trim() || identifier;

    const authors: string[] = [];
    $el.find("dc\\:creator, creator").each((_, a) => {
      const v = $(a).text().trim();
      if (v) authors.push(v);
    });

    const abstract = $el.find("dc\\:description, description").first().text().trim() || undefined;

    const keywords: string[] = [];
    $el.find("dc\\:subject, subject").each((_, s) => {
      const v = $(s).text().trim();
      if (v) keywords.push(v);
    });

    const journal = $el.find("dc\\:source, source").first().text().trim() || undefined;

    const publisher = $el.find("dc\\:publisher, publisher").first().text().trim() || undefined;

    const publicationDate = $el.find("dc\\:date, date").first().text().trim() || undefined;

    const language = $el.find("dc\\:language, language").first().text().trim() || undefined;

    let doi: string | undefined;
    let pdfUrl: string | undefined;
    let htmlUrl: string | undefined;

    $el.find("dc\\:identifier, identifier").each((_, idEl) => {
      const v = $(idEl).text().trim();
      if (v.startsWith("http") && v.includes("/doi/")) doi = v;
      else if (v.startsWith("http") && v.toLowerCase().endsWith(".pdf")) pdfUrl = v;
      else if (v.startsWith("http") && !pdfUrl && !v.includes("oai:")) htmlUrl = v;
    });

    // ISSN extraction from source field pattern "EISSN: XXXX-XXXX"
    let issn: string | undefined;
    const issnMatch = journal?.match(/(\d{4}-\d{3}[\dX])/i);
    if (issnMatch?.[1]) issn = issnMatch[1];

    return {
      identifier,
      title,
      authors,
      abstract,
      keywords: keywords.length > 0 ? keywords : undefined,
      journal: publisher ?? journal,
      issn,
      doi,
      publicationDate,
      language,
      pdfUrl,
      htmlUrl,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private httpError(
    task: ActorTask,
    status: number,
    message: string,
    startTime: number
  ): ActorResult<DergiParkActorResult> {
    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "failed",
      statusCode: status,
      errorMessage: message,
      executionDurationMs: Date.now() - startTime,
    };
  }
}
