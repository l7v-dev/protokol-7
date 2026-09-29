/**
 * WikidataActor - Structured Knowledge Graph & Entity Claims Harvester — protokol-7
 *
 * Interfaces with official Wikimedia Wikidata APIs (wbgetentities, wbsearchentities,
 * Special:EntityData, and query.wikidata.org SPARQL endpoint) to extract structured
 * knowledge graph entities, Q-IDs, P-IDs, statements, claims, and semantic triples.
 * Conforms to docs/actor-contract.md.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  ActorType,
  IActor,
  WikidataActorResult,
  WikidataActorTaskOptions,
  WikidataEntityItem,
  WikidataSparqlBinding,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 10;
const DEFAULT_LANG = "en";
const WIKIDATA_HOST = "www.wikidata.org";
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

export class WikidataActor implements IActor<WikidataActorResult> {
  readonly actorType: ActorType = "wikidata";
  readonly description =
    "Queries official Wikimedia Wikidata APIs and SPARQL endpoint for structured knowledge graph entities, claims, labels, and semantic triples.";

  async run(task: ActorTask, context?: ActorRunContext): Promise<ActorResult<WikidataActorResult>> {
    const startTime = context?.startTime || Date.now();
    const taskOpts = task.options || {};
    const options: WikidataActorTaskOptions = (taskOpts.wikidataOptions ||
      taskOpts) as WikidataActorTaskOptions;
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork =
      process.env.NODE_ENV === "test" ||
      Boolean((task.options as Record<string, unknown> | undefined)?.allowLocalNetwork);

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

      const { action, entityId, query, sparql, lang } = this.resolveParameters(
        task.targetUrl,
        options
      );
      const resolvedQueryUrl = this.buildApiUrl(
        task.targetUrl,
        action,
        entityId,
        query,
        sparql,
        lang,
        options.limit
      );

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

      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(resolvedQueryUrl, {
          signal: controller.signal,
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; wikidata-actor)",
            Accept: "application/json, application/sparql-results+json, */*",
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
          errorMessage: `Wikidata API responded with status ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const rawJson = (await response.json()) as Record<string, unknown>;

      if (action === "sparql") {
        const sparqlData = rawJson as {
          head: { vars: string[] };
          results: { bindings: WikidataSparqlBinding[] };
        };

        const markdown = this.renderSparqlMarkdown(sparqlData, sparql || "");

        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "completed",
          statusCode: response.status,
          data: {
            action: "sparql",
            queryUrl: resolvedQueryUrl,
            sparqlResults: sparqlData,
            markdown,
          },
          executionDurationMs: Date.now() - startTime,
        };
      }

      if (action === "search") {
        const searchResults = (rawJson.search as Array<Record<string, unknown>>) || [];
        const items: WikidataEntityItem[] = searchResults.map((s) => ({
          id: String(s.id),
          title: String(s.title || s.id),
          url: String(s.concepturi || `https://${WIKIDATA_HOST}/wiki/${s.id}`),
          label: s.label ? String(s.label) : undefined,
          description: s.description ? String(s.description) : undefined,
          aliases: Array.isArray(s.aliases) ? s.aliases.map(String) : undefined,
        }));

        const markdown = this.renderEntityListMarkdown(items, "Search Results", lang);

        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "completed",
          statusCode: response.status,
          data: {
            action: "search",
            queryUrl: resolvedQueryUrl,
            items,
            markdown,
          },
          executionDurationMs: Date.now() - startTime,
        };
      }

      // Default: entity / claims
      const entitiesObj = (rawJson.entities as Record<string, Record<string, unknown>>) || {};
      const items: WikidataEntityItem[] = Object.keys(entitiesObj).map((id) => {
        const ent = entitiesObj[id];
        const labels = (ent.labels as Record<string, { value: string }>) || {};
        const descriptions = (ent.descriptions as Record<string, { value: string }>) || {};
        const aliasesObj = (ent.aliases as Record<string, Array<{ value: string }>>) || {};
        const sitelinksObj =
          (ent.sitelinks as Record<string, { site: string; title: string; url?: string }>) || {};

        const label = labels[lang]?.value || labels.en?.value || Object.values(labels)[0]?.value;
        const description =
          descriptions[lang]?.value ||
          descriptions.en?.value ||
          Object.values(descriptions)[0]?.value;
        const aliases = (aliasesObj[lang] || aliasesObj.en || []).map((a) => a.value);

        // Parse claims into structured key-value map
        const rawClaims = (ent.claims as Record<string, Array<Record<string, unknown>>>) || {};
        const parsedClaims: Record<
          string,
          Array<{ property: string; value: unknown; datatype?: string }>
        > = {};

        for (const [prop, claimList] of Object.entries(rawClaims)) {
          if (options.propertyId && prop !== options.propertyId) continue;
          parsedClaims[prop] = claimList.map((c) => {
            const mainsnak = (c.mainsnak as Record<string, unknown>) || {};
            const datavalue = (mainsnak.datavalue as Record<string, unknown>) || {};
            return {
              property: prop,
              value: datavalue.value ?? null,
              datatype: mainsnak.datatype ? String(mainsnak.datatype) : undefined,
            };
          });
        }

        return {
          id,
          title: label ? `${label} (${id})` : id,
          url: `https://${WIKIDATA_HOST}/wiki/${id}`,
          label,
          description,
          aliases,
          claims: parsedClaims,
          sitelinks: sitelinksObj,
        };
      });

      const markdown = this.renderEntityListMarkdown(items, "Entities & Claims", lang);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: response.status,
        data: {
          action: options.propertyId ? "claims" : "entity",
          queryUrl: resolvedQueryUrl,
          items,
          markdown,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTimeout = msg.includes("aborted") || msg.includes("timeout");
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        statusCode: isTimeout ? 408 : 500,
        errorMessage: msg,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  public resolveParameters(
    targetUrl: string | undefined,
    options: WikidataActorTaskOptions
  ): {
    action: "entity" | "search" | "sparql" | "claims";
    entityId?: string;
    query?: string;
    sparql?: string;
    lang: string;
  } {
    let action = options.action;
    let entityId = options.entityId;
    let query = options.query;
    let sparql = options.sparql;
    const lang = options.lang || DEFAULT_LANG;

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`);
        if (parsed.hostname.includes("query.wikidata.org") || parsed.pathname.includes("/sparql")) {
          action = "sparql";
          sparql = parsed.searchParams.get("query") || sparql;
        } else if (parsed.searchParams.get("action") === "wbsearchentities") {
          action = "search";
          query = parsed.searchParams.get("search") || query;
        } else if (parsed.searchParams.get("action") === "wbgetentities") {
          action = "entity";
          entityId = parsed.searchParams.get("ids") || entityId;
        } else if (parsed.pathname.includes("/Special:EntityData/")) {
          action = "entity";
          const match = parsed.pathname.match(/Special:EntityData\/(Q\d+|P\d+)/);
          if (match) entityId = match[1];
        } else if (parsed.pathname.startsWith("/wiki/")) {
          const id = parsed.pathname.replace("/wiki/", "");
          if (/^[QP]\d+$/i.test(id)) {
            action = "entity";
            entityId = id.toUpperCase();
          }
        }
      } catch {
        if (!entityId && !query) {
          if (/^[QP]\d+$/i.test(targetUrl)) {
            entityId = targetUrl.toUpperCase();
          } else {
            query = targetUrl;
          }
        }
      }
    }

    if (!action) {
      if (sparql) {
        action = "sparql";
      } else if (options.propertyId && entityId) {
        action = "claims";
      } else if (query && !entityId) {
        action = "search";
      } else {
        action = "entity";
      }
    }

    return { action, entityId, query, sparql, lang };
  }

  public buildApiUrl(
    targetUrl: string | undefined,
    action: "entity" | "search" | "sparql" | "claims",
    entityId?: string,
    query?: string,
    sparql?: string,
    lang = DEFAULT_LANG,
    limit?: number
  ): string {
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (
          parsed.pathname.includes("/w/api.php") ||
          parsed.pathname.includes("/Special:EntityData/") ||
          parsed.pathname.includes("/sparql") ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "localhost"
        ) {
          return targetUrl;
        }
      } catch {
        // Fallback to dynamic building
      }
    }

    if (action === "sparql") {
      const q = encodeURIComponent(sparql || "SELECT * WHERE { ?s ?p ?o } LIMIT 10");
      return `${SPARQL_ENDPOINT}?query=${q}&format=json`;
    }

    if (action === "search") {
      const q = encodeURIComponent(query || entityId || "");
      const l = Math.max(1, limit || DEFAULT_LIMIT);
      return `https://${WIKIDATA_HOST}/w/api.php?action=wbsearchentities&search=${q}&language=${encodeURIComponent(lang)}&limit=${l}&format=json`;
    }

    // Default: entity / claims via wbgetentities
    const id = entityId || "Q42";
    return `https://${WIKIDATA_HOST}/w/api.php?action=wbgetentities&ids=${encodeURIComponent(id)}&languages=${encodeURIComponent(lang)}&format=json`;
  }

  private renderEntityListMarkdown(
    items: WikidataEntityItem[],
    title: string,
    lang: string
  ): string {
    const lines: string[] = [
      `# Wikidata Knowledge Graph Report (${lang.toUpperCase()})`,
      "",
      `## ${title}`,
      "",
      "| Entity ID | Label | Description | URL |",
      "|---|---|---|---|",
    ];

    for (const item of items) {
      const cleanDesc = (item.description || "N/A").replace(/[\r\n]+/g, " ");
      lines.push(
        `| [${item.id}](${item.url}) | ${item.label || "N/A"} | ${cleanDesc} | ${item.url} |`
      );
    }

    lines.push("");

    if (items.some((i) => i.claims && Object.keys(i.claims).length > 0)) {
      lines.push("## Statements & Claims", "");
      for (const item of items) {
        if (item.claims && Object.keys(item.claims).length > 0) {
          lines.push(`### ${item.label || item.id} (${item.id})`, "");
          lines.push("| Property | Datatype | Value |", "|---|---|---|");
          for (const [prop, claims] of Object.entries(item.claims)) {
            for (const c of claims) {
              const valStr =
                typeof c.value === "object" ? JSON.stringify(c.value) : String(c.value ?? "");
              lines.push(`| ${prop} | ${c.datatype || "unspecified"} | \`${valStr}\` |`);
            }
          }
          lines.push("");
        }
      }
    }

    return lines.join("\n");
  }

  private renderSparqlMarkdown(
    sparqlData: { head: { vars: string[] }; results: { bindings: WikidataSparqlBinding[] } },
    query: string
  ): string {
    const vars = sparqlData.head?.vars || [];
    const bindings = sparqlData.results?.bindings || [];

    const lines: string[] = [
      "# Wikidata SPARQL Query Results",
      "",
      "```sparql",
      query.trim(),
      "```",
      "",
      `- **Total Records:** ${bindings.length}`,
      "",
    ];

    if (vars.length > 0 && bindings.length > 0) {
      lines.push(`| ${vars.join(" | ")} |`);
      lines.push(`| ${vars.map(() => "---").join(" | ")} |`);

      for (const row of bindings) {
        const rowVals = vars.map((v) => {
          const cell = row[v];
          if (!cell) return "";
          return cell.value.replace(/\|/g, "\\|");
        });
        lines.push(`| ${rowVals.join(" | ")} |`);
      }
    }

    return lines.join("\n");
  }
}
