/**
 * OpenFdaActor - FDA public datasets, drug labels, adverse events, and device clearances actor.
 * Interfaces with official openFDA REST API (api.fda.gov) for verified pharmacological,
 * pharmaceutical, and regulatory health data.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  OpenFdaActorResult,
  OpenFdaActorTaskOptions,
} from "../core/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const OPEN_FDA_BASE = "https://api.fda.gov";

interface RawOpenFdaResponse {
  meta?: {
    disclaimer?: string;
    terms?: string;
    license?: string;
    last_updated?: string;
    results?: {
      skip?: number;
      limit?: number;
      total?: number;
    };
  };
  results?: Array<Record<string, unknown>>;
  error?: {
    code?: string;
    message?: string;
  };
}

export class OpenFdaActor implements IActor<OpenFdaActorResult> {
  readonly actorType = "open-fda" as const;
  readonly description =
    "Queries openFDA API for official FDA drug labels, adverse event reports, and medical device clearances.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<OpenFdaActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: OpenFdaActorTaskOptions = task.options?.openFdaOptions || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

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

      const endpoint = options.endpoint || "drug/label";
      const requestUrl = this.buildRequestUrl(task, options, endpoint);

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

      const response = await safeRedirectFetch(requestUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "protokol-7/1.0.0 (openFDA Actor)",
        },
        timeoutMs,
        allowLocalNetwork,
      });

      if (!response.ok) {
        // openFDA returns 404 if no results match the search query
        if (response.status === 404) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "completed",
            statusCode: 200,
            data: {
              total: 0,
              endpoint,
              results: [],
              queryUrl: requestUrl,
              markdown: `# openFDA Results (${endpoint})\nTotal Matches: 0\nNo records found for query.`,
            },
            executionDurationMs: Date.now() - startTime,
          };
        }

        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `openFDA API returned HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const rawJson = (await response.json()) as RawOpenFdaResponse;
      const results = rawJson.results || [];
      const total = rawJson.meta?.results?.total || results.length;
      const markdown = this.synthesizeMarkdown(endpoint, results, total);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          total,
          endpoint,
          results,
          queryUrl: requestUrl,
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
        errorMessage: `OpenFdaActor execution failed: ${errorMsg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private buildRequestUrl(
    task: ActorTask,
    options: OpenFdaActorTaskOptions,
    endpoint: string
  ): string {
    const rawTarget = (task.targetUrl || "").trim();
    const cleanEndpoint = endpoint.replace(/^\/+|\/+$/g, "");

    let baseUrl = `${OPEN_FDA_BASE}/${cleanEndpoint}.json`;
    if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://")) {
      baseUrl = rawTarget;
    }

    const url = new URL(baseUrl);

    const rawSearch = options.search || (!rawTarget.startsWith("http") ? rawTarget : "") || "";
    if (rawSearch) {
      let searchQuery = rawSearch;
      if (!rawSearch.includes(":") && !rawSearch.includes('"')) {
        if (cleanEndpoint === "drug/label") {
          searchQuery = `openfda.brand_name:"${rawSearch}"+openfda.generic_name:"${rawSearch}"`;
        } else if (cleanEndpoint === "device/510k") {
          searchQuery = `device_name:"${rawSearch}"`;
        } else if (cleanEndpoint === "drug/event") {
          searchQuery = `patient.drug.medicinalproduct:"${rawSearch}"`;
        }
      }
      url.searchParams.set("search", searchQuery);
    }

    const limit = Math.min(Math.max(options.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
    url.searchParams.set("limit", String(limit));

    if (options.skip && options.skip > 0) {
      url.searchParams.set("skip", String(options.skip));
    }

    return url.toString();
  }

  private synthesizeMarkdown(
    endpoint: string,
    results: Array<Record<string, unknown>>,
    total: number
  ): string {
    const lines: string[] = [];
    lines.push(`# openFDA Dataset Results (${endpoint})`);
    lines.push(`Total Matching Records: ${total}`);
    lines.push(`Retrieved Records: ${results.length}`);
    lines.push("");

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      lines.push(`## Record #${i + 1}`);

      if (endpoint === "drug/label") {
        const openfda = (item.openfda as Record<string, unknown>) || {};
        const brandNames = Array.isArray(openfda.brand_name)
          ? openfda.brand_name.join(", ")
          : undefined;
        const genericNames = Array.isArray(openfda.generic_name)
          ? openfda.generic_name.join(", ")
          : undefined;
        const manufacturer = Array.isArray(openfda.manufacturer_name)
          ? openfda.manufacturer_name.join(", ")
          : undefined;
        const productType = Array.isArray(openfda.product_type)
          ? openfda.product_type.join(", ")
          : undefined;

        if (brandNames) lines.push(`- **Brand Name**: ${brandNames}`);
        if (genericNames) lines.push(`- **Generic Name**: ${genericNames}`);
        if (manufacturer) lines.push(`- **Manufacturer**: ${manufacturer}`);
        if (productType) lines.push(`- **Product Type**: ${productType}`);

        const indications = this.getFirstStringArray(item.indications_and_usage);
        if (indications) {
          lines.push("");
          lines.push("### Indications and Usage");
          lines.push(indications.trim());
        }

        const warnings = this.getFirstStringArray(item.warnings);
        if (warnings) {
          lines.push("");
          lines.push("### Warnings");
          lines.push(warnings.trim());
        }

        const dosage = this.getFirstStringArray(item.dosage_and_administration);
        if (dosage) {
          lines.push("");
          lines.push("### Dosage and Administration");
          lines.push(dosage.trim());
        }
      } else if (endpoint === "device/510k") {
        lines.push(`- **510(k) Number**: ${item.k_number || "N/A"}`);
        lines.push(`- **Device Name**: ${item.device_name || "N/A"}`);
        lines.push(`- **Applicant**: ${item.applicant || "N/A"}`);
        lines.push(`- **Decision Date**: ${item.decision_date || "N/A"}`);
        if (item.statement_or_summary) {
          lines.push(`- **Type**: ${item.statement_or_summary}`);
        }
      } else if (endpoint === "drug/event") {
        lines.push(`- **Safety Report ID**: ${item.safetyreportid || "N/A"}`);
        lines.push(`- **Received Date**: ${item.receivedate || "N/A"}`);
        lines.push(`- **Serious Adverse Event**: ${item.serious === 1 ? "Yes" : "No"}`);

        const patient = (item.patient as Record<string, unknown>) || {};
        if (patient.reaction && Array.isArray(patient.reaction)) {
          const reactions = patient.reaction
            .map((r) => (r as Record<string, string>).reactionmeddrapt)
            .filter(Boolean)
            .join(", ");
          if (reactions) lines.push(`- **Reported Reactions**: ${reactions}`);
        }
      } else {
        // Generic JSON extraction
        lines.push("```json");
        lines.push(JSON.stringify(item, null, 2));
        lines.push("```");
      }

      lines.push("");
      lines.push("---");
      lines.push("");
    }

    return lines.join("\n").trim();
  }

  private getFirstStringArray(val: unknown): string | undefined {
    if (typeof val === "string") return val;
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") {
      return val[0];
    }
    return undefined;
  }
}
