/**
 * HuggingFaceDatasetsActor - Extraction actor for Hugging Face Serverless
 * Datasets API (datasets-server.huggingface.co).
 * Conforms to docs/actor-contract.md and docs/actors/huggingface-datasets.md.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  HuggingFaceDatasetsActorResult,
  HuggingFaceDatasetsActorTaskOptions,
  HuggingFaceDatasetsFeatureItem,
  HuggingFaceDatasetsSplitItem,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const HF_DATASETS_SERVER_BASE = "https://datasets-server.huggingface.co";

export class HuggingFaceDatasetsActor implements IActor<HuggingFaceDatasetsActorResult> {
  readonly actorType = "huggingface-datasets" as const;
  readonly description =
    "Hugging Face Datasets Server API extraction actor for streaming dataset rows, splits, and schema metadata.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<HuggingFaceDatasetsActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: HuggingFaceDatasetsActorTaskOptions =
      task.options?.huggingfaceDatasetsOptions ||
      (task.options as unknown as HuggingFaceDatasetsActorTaskOptions) ||
      {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

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

      // 2. Resolve query parameters and action
      const resolved = this.resolveParameters(task.targetUrl, options);
      if (!resolved.dataset) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage:
            "Dataset identifier is required (e.g. 'openai/gsm8k' or 'tatsu-lab/alpaca').",
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 3. Resolve upstream API endpoint URL
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

      // 5. Build request headers (including optional HF_TOKEN)
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(task.options?.headers || {}),
      };

      const token = options.hfToken || process.env.HF_TOKEN;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      // 6. Execute network fetch with timeout
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
          errorMessage: `Hugging Face Datasets Server API returned HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const json = await response.json();

      // 7. Parse response based on action
      const resultData = this.parseResponse(resolved, endpoint, json);

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
   * Resolves dataset parameters and action from targetUrl and options.
   */
  resolveParameters(
    targetUrl: string,
    options: HuggingFaceDatasetsActorTaskOptions
  ): {
    action: "rows" | "splits" | "info" | "size";
    dataset: string;
    config: string;
    split: string;
    offset: number;
    limit: number;
  } {
    let dataset = options.dataset || "";
    let config = options.config || "default";
    let split = options.split || "train";
    let action = options.action || "rows";
    const offset = options.offset !== undefined ? options.offset : 0;
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);

    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      try {
        const parsed = new URL(targetUrl);
        const pathname = parsed.pathname;

        // Pattern 1: datasets-server.huggingface.co/rows?dataset=...
        if (parsed.hostname.includes("datasets-server.huggingface.co")) {
          const dsParam = parsed.searchParams.get("dataset");
          if (dsParam) dataset = dsParam;
          const cfgParam = parsed.searchParams.get("config");
          if (cfgParam) config = cfgParam;
          const splitParam = parsed.searchParams.get("split");
          if (splitParam) split = splitParam;

          if (pathname.includes("/splits")) action = "splits";
          else if (pathname.includes("/info")) action = "info";
          else if (pathname.includes("/size")) action = "size";
          else if (pathname.includes("/rows")) action = "rows";
        }
        // Pattern 2: huggingface.co/datasets/{owner}/{name}
        else if (parsed.hostname.includes("huggingface.co")) {
          const parts = pathname.split("/").filter(Boolean);
          const dsIdx = parts.indexOf("datasets");
          if (dsIdx !== -1 && parts.length > dsIdx + 2) {
            dataset = `${parts[dsIdx + 1]}/${parts[dsIdx + 2]}`;
          } else if (dsIdx !== -1 && parts.length > dsIdx + 1) {
            dataset = parts[dsIdx + 1];
          }
        }
      } catch {
        // Fallback to explicit options
      }
    }

    return { action, dataset, config, split, offset, limit };
  }

  /**
   * Constructs the appropriate Datasets Server API endpoint URL.
   */
  buildEndpointUrl(
    targetUrl: string,
    resolved: {
      action: "rows" | "splits" | "info" | "size";
      dataset: string;
      config: string;
      split: string;
      offset: number;
      limit: number;
    }
  ): string {
    // If targetUrl directly targets a mock test server or valid Datasets Server endpoint
    if (
      targetUrl &&
      (targetUrl.includes("/rows") ||
        targetUrl.includes("/splits") ||
        targetUrl.includes("/info") ||
        targetUrl.includes("/size"))
    ) {
      return targetUrl;
    }

    const encDataset = encodeURIComponent(resolved.dataset);
    const encConfig = encodeURIComponent(resolved.config);
    const encSplit = encodeURIComponent(resolved.split);

    switch (resolved.action) {
      case "splits":
        return `${HF_DATASETS_SERVER_BASE}/splits?dataset=${encDataset}`;
      case "info":
        return `${HF_DATASETS_SERVER_BASE}/info?dataset=${encDataset}`;
      case "size":
        return `${HF_DATASETS_SERVER_BASE}/size?dataset=${encDataset}`;
      default:
        return `${HF_DATASETS_SERVER_BASE}/rows?dataset=${encDataset}&config=${encConfig}&split=${encSplit}&offset=${resolved.offset}&length=${resolved.limit}`;
    }
  }

  /**
   * Parses JSON API response into HuggingFaceDatasetsActorResult.
   */
  private parseResponse(
    resolved: {
      action: "rows" | "splits" | "info" | "size";
      dataset: string;
      config: string;
      split: string;
      offset: number;
      limit: number;
    },
    queryUrl: string,
    json: Record<string, unknown>
  ): HuggingFaceDatasetsActorResult {
    const result: HuggingFaceDatasetsActorResult = {
      dataset: resolved.dataset,
      action: resolved.action,
      queryUrl,
    };

    if (resolved.action === "splits") {
      const splitsRaw = Array.isArray(json?.splits) ? json.splits : [];
      const splits: HuggingFaceDatasetsSplitItem[] = splitsRaw.map(
        (s: Record<string, unknown>) => ({
          dataset: (s.dataset as string) || resolved.dataset,
          config: (s.config as string) || "default",
          split: (s.split as string) || "",
          numRows: typeof s.num_rows === "number" ? s.num_rows : undefined,
        })
      );

      result.splits = splits;
      result.markdown = this.renderSplitsMarkdown(resolved.dataset, splits);
      return result;
    }

    if (resolved.action === "info") {
      const datasetInfo = (json?.dataset_info || json?.info || json) as
        | Record<string, unknown>
        | undefined;
      const firstConfig = Object.keys(datasetInfo || {})[0];
      const infoObj =
        typeof datasetInfo?.[firstConfig] === "object"
          ? (datasetInfo[firstConfig] as Record<string, unknown>)
          : datasetInfo;

      result.info = {
        description: (infoObj?.description as string) || "",
        homepage: (infoObj?.homepage as string) || "",
        license: (infoObj?.license as string) || "",
        citation: (infoObj?.citation as string) || "",
      };

      result.markdown = this.renderInfoMarkdown(resolved.dataset, result.info);
      return result;
    }

    if (resolved.action === "size") {
      const sizeObj = (json?.size || json) as Record<string, unknown> | undefined;
      const splitsRaw: HuggingFaceDatasetsSplitItem[] = [];

      if (Array.isArray(sizeObj?.splits)) {
        for (const s of sizeObj.splits as Array<Record<string, unknown>>) {
          splitsRaw.push({
            dataset: resolved.dataset,
            config: (s.config as string) || "default",
            split: (s.split as string) || "",
            numRows: typeof s.num_rows === "number" ? s.num_rows : undefined,
          });
        }
      }

      result.splits = splitsRaw;
      result.markdown = this.renderSplitsMarkdown(resolved.dataset, splitsRaw);
      return result;
    }

    // Default action: "rows"
    result.config = resolved.config;
    result.split = resolved.split;
    result.offset = resolved.offset;
    result.limit = resolved.limit;
    result.totalRows = typeof json?.num_rows_total === "number" ? json.num_rows_total : undefined;

    // Parse features
    const features: HuggingFaceDatasetsFeatureItem[] = [];
    if (Array.isArray(json?.features)) {
      for (const f of json.features as Array<Record<string, unknown>>) {
        let typeStr = "unknown";
        if (typeof f.type === "string") {
          typeStr = f.type;
        } else if (typeof f.type === "object" && f.type !== null) {
          const typeObj = f.type as Record<string, unknown>;
          if (typeof typeObj.dtype === "string") typeStr = typeObj.dtype;
          else if (typeof typeObj._type === "string") typeStr = typeObj._type;
        }

        features.push({
          featureIdx: typeof f.feature_idx === "number" ? f.feature_idx : features.length,
          name: (f.name as string) || `column_${features.length}`,
          type: typeStr,
        });
      }
    }
    result.features = features;

    // Parse rows
    const rows: Array<Record<string, unknown>> = [];
    const rowsRaw = Array.isArray(json?.rows) ? json.rows : [];
    for (const r of rowsRaw) {
      if (r && typeof r === "object") {
        if ("row" in r && typeof r.row === "object" && r.row !== null) {
          rows.push(r.row as Record<string, unknown>);
        } else {
          rows.push(r as Record<string, unknown>);
        }
      }
    }
    result.rows = rows;
    result.markdown = this.renderRowsMarkdown(resolved, features, rows, result.totalRows);

    return result;
  }

  /**
   * Renders GFM Markdown table of rows.
   */
  private renderRowsMarkdown(
    resolved: { dataset: string; config: string; split: string; offset: number; limit: number },
    features: HuggingFaceDatasetsFeatureItem[],
    rows: Array<Record<string, unknown>>,
    totalRows?: number
  ): string {
    const lines: string[] = [];
    lines.push(`# Hugging Face Dataset: ${resolved.dataset}`);
    lines.push(
      `**Config:** \`${resolved.config}\` | **Split:** \`${resolved.split}\` | **Offset:** ${resolved.offset} | **Limit:** ${resolved.limit}`
    );
    if (totalRows !== undefined) {
      lines.push(`**Total Rows in Split:** ${totalRows.toLocaleString()}`);
    }
    lines.push("");

    if (features.length > 0) {
      lines.push("### Schema Features");
      lines.push("| Index | Field Name | Data Type |");
      lines.push("|---|---|---|");
      for (const f of features) {
        lines.push(`| ${f.featureIdx} | \`${f.name}\` | ${f.type} |`);
      }
      lines.push("");
    }

    lines.push(`### Extracted Rows (${rows.length})`);
    if (rows.length === 0) {
      lines.push("_No records returned in this slice._");
      return lines.join("\n");
    }

    // Determine preview columns (up to 4 columns to avoid unwieldy tables)
    const allKeys = features.length > 0 ? features.map((f) => f.name) : Object.keys(rows[0] || {});
    const displayKeys = allKeys.slice(0, 4);

    lines.push(`| Row | ${displayKeys.map((k) => `\`${k}\``).join(" | ")} |`);
    lines.push(`|---|${displayKeys.map(() => "---").join("|")}|`);

    rows.slice(0, 20).forEach((row, idx) => {
      const cells = displayKeys.map((k) => {
        const val = row[k];
        if (val === null || val === undefined) return "–";
        let str = typeof val === "object" ? JSON.stringify(val) : String(val);
        // Truncate long strings in table cell
        str = str.replace(/\n/g, " ").replace(/\|/g, "\\|");
        return str.length > 80 ? `${str.slice(0, 77)}...` : str;
      });
      lines.push(`| ${resolved.offset + idx + 1} | ${cells.join(" | ")} |`);
    });

    if (rows.length > 20) {
      lines.push("");
      lines.push(`_... and ${rows.length - 20} more records truncated from Markdown preview._`);
    }

    return lines.join("\n");
  }

  /**
   * Renders splits list in Markdown.
   */
  private renderSplitsMarkdown(dataset: string, splits: HuggingFaceDatasetsSplitItem[]): string {
    const lines: string[] = [];
    lines.push(`# Hugging Face Dataset Splits: ${dataset}`);
    lines.push(`Total available configurations and splits: **${splits.length}**`);
    lines.push("");
    lines.push("| Config | Split | Estimated Rows |");
    lines.push("|---|---|---|");

    for (const s of splits) {
      lines.push(
        `| \`${s.config}\` | \`${s.split}\` | ${s.numRows !== undefined ? s.numRows.toLocaleString() : "N/A"} |`
      );
    }

    return lines.join("\n");
  }

  /**
   * Renders dataset info card in Markdown.
   */
  private renderInfoMarkdown(
    dataset: string,
    info: { description?: string; homepage?: string; license?: string; citation?: string }
  ): string {
    const lines: string[] = [];
    lines.push(`# Hugging Face Dataset Info: ${dataset}`);
    if (info.homepage) lines.push(`- **Homepage:** ${info.homepage}`);
    if (info.license) lines.push(`- **License:** ${info.license}`);
    lines.push("");

    if (info.description) {
      lines.push("## Description");
      lines.push(info.description);
      lines.push("");
    }

    if (info.citation) {
      lines.push("## Citation");
      lines.push("```bibtex");
      lines.push(info.citation);
      lines.push("```");
      lines.push("");
    }

    return lines.join("\n");
  }
}
