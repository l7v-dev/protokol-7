/**
 * ApertaActor - TUBITAK ULAKBIM Aperta (Turkiye Acik Arsivi) Extractor Actor
 *
 * Interfaces with TUBITAK ULAKBIM Aperta Invenio REST API to search and retrieve
 * open science records, research datasets, articles, files, and direct download links.
 *
 * API Base: https://aperta.ulakbim.gov.tr/api/records
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  ApertaActorResult,
  ApertaActorTaskOptions,
  ApertaFileItem,
  ApertaRecordItem,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const APERTA_API_BASE = "https://aperta.ulakbim.gov.tr/api/records";
const DEFAULT_TIMEOUT_MS = 35_000;
const DEFAULT_PAGE_SIZE = 20;

interface RawApertaCustomBranch {
  id?: string;
  title?: { tr?: string; en?: string } | string;
}

interface RawApertaCreator {
  name?: string;
  affiliation?: string | null;
}

interface RawApertaMetadata {
  title?: string;
  publication_date?: string;
  description?: string;
  doi?: string;
  creators?: RawApertaCreator[];
  resource_type?: { type?: string; title?: string } | string;
  keywords?: string[];
  publisher?: string;
  language?: string;
  license?: string;
  access_right?: string;
  custom?: {
    "aperta:science_branches"?: RawApertaCustomBranch[];
  };
}

interface RawApertaFile {
  id?: string;
  key?: string;
  size?: number;
  checksum?: string;
  links?: { self?: string };
}

interface RawApertaItem {
  id?: string | number;
  doi?: string;
  created?: string;
  modified?: string;
  metadata?: RawApertaMetadata;
  files?: RawApertaFile[];
}

interface RawApertaSearchResponse {
  hits?: {
    total?: number;
    hits?: RawApertaItem[];
  };
}

export class ApertaActor implements IActor<ApertaActorResult> {
  readonly actorType = "aperta" as const;
  readonly description =
    "Queries TUBITAK ULAKBIM Aperta open archive API for open science datasets, publications, metadata, and files.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<ApertaActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: ApertaActorTaskOptions = task.options?.apertaOptions || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    const action = options.action || (options.recordId ? "get_record" : "search_records");

    try {
      // 1. Resolve endpoint URL
      const resolvedQueryUrl = this.buildApiUrl(task.targetUrl, options, action);

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
          errorMessage: `SSRF validation failed: ${ssrfCheck.reason || "Forbidden destination"}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 3. Fetch from Aperta API
      const response = await safeRedirectFetch(resolvedQueryUrl, {
        headers: {
          "User-Agent": "protokol-7/1.0.0 (Aperta Client; mailto:l7v-dev@protokol.local)",
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
          errorMessage: `Aperta API returned HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const rawJson = (await response.json()) as unknown;

      // 4. Transform response according to action
      let records: ApertaRecordItem[] = [];
      let totalCount = 0;
      const page = options.page || 1;
      const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;

      if (action === "get_record" || action === "list_files") {
        const item = rawJson as RawApertaItem;
        if (item && item.id !== undefined) {
          const rec = this.transformItem(item);
          records = [rec];
          totalCount = 1;
        }
      } else {
        const searchResp = rawJson as RawApertaSearchResponse;
        const hits = searchResp.hits?.hits || [];
        totalCount = searchResp.hits?.total || 0;
        records = hits.map((hit) => this.transformItem(hit));
      }

      // 5. Generate LLM Markdown synthesis
      const markdown = this.renderMarkdown(records, action, totalCount, options);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          action,
          totalCount,
          page,
          pageSize,
          records,
          queryUrl: resolvedQueryUrl,
          markdown,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: `Aperta actor execution error: ${errorMsg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private buildApiUrl(
    targetUrl: string | undefined,
    options: ApertaActorTaskOptions,
    action: "search_records" | "get_record" | "list_files"
  ): string {
    if (
      targetUrl &&
      (targetUrl.includes("aperta.ulakbim.gov.tr/api/records") ||
        targetUrl.startsWith("http://127.0.0.1"))
    ) {
      return targetUrl;
    }

    if (action === "get_record" || action === "list_files") {
      const recId = encodeURIComponent(String(options.recordId || ""));
      return `${APERTA_API_BASE}/${recId}`;
    }

    const queryParams = new URLSearchParams();
    queryParams.set("q", options.query || "*");
    queryParams.set("page", String(options.page || 1));
    queryParams.set("size", String(options.pageSize || DEFAULT_PAGE_SIZE));

    if (options.sort) {
      queryParams.set("sort", options.sort);
    }

    return `${APERTA_API_BASE}?${queryParams.toString()}`;
  }

  private transformItem(item: RawApertaItem): ApertaRecordItem {
    const id = String(item.id || "");
    const meta = item.metadata || {};

    const title = meta.title || `Record ${id}`;
    const description = meta.description || "";
    const doi = meta.doi || item.doi || "";
    const publisher = meta.publisher || "TUBITAK ULAKBIM";
    const publicationDate = meta.publication_date || item.created?.substring(0, 10) || "";

    // Creators
    const creatorNames: string[] = [];
    if (Array.isArray(meta.creators)) {
      for (const c of meta.creators) {
        if (c?.name) {
          creatorNames.push(c.name.trim());
        }
      }
    }
    const creators = creatorNames.join("; ");

    // Resource Type
    let resourceType = "";
    if (typeof meta.resource_type === "object" && meta.resource_type !== null) {
      resourceType = meta.resource_type.type || meta.resource_type.title || "";
    } else if (typeof meta.resource_type === "string") {
      resourceType = meta.resource_type;
    }

    // Language
    const language = meta.language || "unknown";

    // Keywords
    const keywords = Array.isArray(meta.keywords) ? meta.keywords : [];

    // Subjects / Science Branches
    const subjects: string[] = [];
    const branches = meta.custom?.["aperta:science_branches"];
    if (Array.isArray(branches)) {
      for (const b of branches) {
        if (typeof b.title === "object" && b.title !== null) {
          const val = b.title.tr || b.title.en;
          if (val && !subjects.includes(val)) {
            subjects.push(val);
          }
        } else if (typeof b.title === "string" && !subjects.includes(b.title)) {
          subjects.push(b.title);
        }
      }
    }

    // Rights / License
    const rights = meta.license || meta.access_right || "";

    // Files Manifest
    const files: ApertaFileItem[] = [];
    let totalFileSize = 0;

    if (Array.isArray(item.files)) {
      for (const f of item.files) {
        const size = Number(f.size || 0);
        totalFileSize += size;
        const key = f.key || "";
        const downloadUrl =
          f.links?.self || `https://aperta.ulakbim.gov.tr/api/records/${id}/files/${key}/content`;
        files.push({
          id: f.id,
          key,
          size,
          checksum: f.checksum,
          downloadUrl,
        });
      }
    }

    const textPayload = `${title} ${description}`.trim();
    const charCount = textPayload.length;
    const wordCount = textPayload ? textPayload.split(/\s+/).length : 0;

    return {
      id,
      doi,
      title,
      creators,
      description,
      publisher,
      publicationDate,
      resourceType,
      language,
      keywords,
      subjects,
      rights,
      files,
      fileCount: files.length,
      totalFileSize,
      charCount,
      wordCount,
    };
  }

  private renderMarkdown(
    records: ApertaRecordItem[],
    action: string,
    totalCount: number,
    options: ApertaActorTaskOptions
  ): string {
    const lines: string[] = [];
    lines.push("# TUBITAK ULAKBIM Aperta Record Manifest");
    lines.push("");

    if (action === "get_record" && records.length > 0) {
      const rec = records[0];
      lines.push(`## ${rec.title}`);
      lines.push("");
      lines.push(`- **Aperta ID:** ${rec.id}`);
      if (rec.doi) lines.push(`- **DOI:** [${rec.doi}](https://doi.org/${rec.doi})`);
      if (rec.creators) lines.push(`- **Creators:** ${rec.creators}`);
      if (rec.publicationDate) lines.push(`- **Publication Date:** ${rec.publicationDate}`);
      if (rec.resourceType) lines.push(`- **Type:** ${rec.resourceType}`);
      if (rec.language) lines.push(`- **Language:** ${rec.language}`);
      if (rec.rights) lines.push(`- **Access / License:** ${rec.rights}`);
      if (rec.subjects && rec.subjects.length > 0)
        lines.push(`- **Science Branches:** ${rec.subjects.join(", ")}`);
      if (rec.keywords && rec.keywords.length > 0)
        lines.push(`- **Keywords:** ${rec.keywords.join(", ")}`);
      lines.push("");

      if (rec.description) {
        lines.push("### Abstract / Description");
        lines.push("");
        lines.push(rec.description);
        lines.push("");
      }

      if (rec.files && rec.files.length > 0) {
        lines.push("### Attached Files");
        lines.push("");
        lines.push("| File Name | Size (MB) | Checksum | Download URL |");
        lines.push("|---|---|---|---|");
        for (const f of rec.files) {
          const mb = ((f.size || 0) / (1024 * 1024)).toFixed(2);
          lines.push(
            `| \`${f.key}\` | ${mb} | \`${f.checksum || "-"}\` | [Download](${f.downloadUrl}) |`
          );
        }
        lines.push("");
      }
    } else {
      lines.push(
        `Total Matching Records: **${totalCount.toLocaleString()}** (Page ${options.page || 1})`
      );
      lines.push("");
      lines.push("| ID | Title | Creators | Type | Date | Files | DOI |");
      lines.push("|---|---|---|---|---|---|---|");

      for (const r of records) {
        const shortTitle = r.title.replace(/\|/g, "/").slice(0, 60);
        const shortCreators = (r.creators || "-").replace(/\|/g, "/").slice(0, 30);
        const doiLink = r.doi ? `[${r.doi}](https://doi.org/${r.doi})` : "-";
        lines.push(
          `| [${r.id}](https://aperta.ulakbim.gov.tr/record/${r.id}) | ${shortTitle} | ${shortCreators} | ${r.resourceType || "-"} | ${r.publicationDate || "-"} | ${r.fileCount || 0} | ${doiLink} |`
        );
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}
