/**
 * src/actors/software-heritage-actor.ts
 *
 * Software Heritage Universal Source Code Archive Actor.
 * Interfaces with the Software Heritage Archive Web API v1 (archive.softwareheritage.org)
 * to resolve persistent SWHIDs (swh:1:cnt, swh:1:dir, swh:1:rev), browse directory trees,
 * inspect origin snapshot visits, and extract clean source code streams for LLMs.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  SoftwareHeritageActorResult,
  SoftwareHeritageActorTaskOptions,
  SoftwareHeritageDirectoryEntry,
} from "../api/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RAW_CHARS = 100_000;
const SWH_API_BASE = "https://archive.softwareheritage.org/api/1";

interface RawSwhDirectoryEntry {
  name?: string;
  type?: "file" | "dir" | "rev";
  target?: string;
  perms?: number;
  length?: number;
}

interface RawSwhRevision {
  id?: string;
  author?: { name?: string; email?: string; date?: string };
  committer?: { name?: string; email?: string; date?: string };
  date?: string;
  message?: string;
  directory?: string;
  parents?: Array<{ id?: string }>;
}

interface RawSwhOriginVisit {
  visit?: number;
  origin?: string;
  date?: string;
  status?: string;
  snapshot?: string | null;
}

export class SoftwareHeritageActor implements IActor<SoftwareHeritageActorResult> {
  readonly actorType = "software-heritage" as const;
  readonly description =
    "Queries Software Heritage Universal Source Code Archive for SWHID code blobs, directories, and repository origins.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<SoftwareHeritageActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: SoftwareHeritageActorTaskOptions = task.options?.softwareHeritageOptions || {};
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

      const resolved = this.resolveActionAndUrl(task, options);
      if (!resolved) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage:
            "Missing required Software Heritage target. Provide 'swhid' (e.g. 'swh:1:cnt:...') or 'originUrl' (e.g. 'https://github.com/...').",
          executionDurationMs: Date.now() - startTime,
        };
      }

      const { action, requestUrl, cleanId } = resolved;

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
        Accept:
          action === "content" ? "text/plain, application/octet-stream, */*" : "application/json",
        "User-Agent": "protokol-7/1.0.0 (Software Heritage Universal Source Code Actor)",
      };

      if (process.env.SOFTWARE_HERITAGE_API_TOKEN) {
        headers.Authorization = `Bearer ${process.env.SOFTWARE_HERITAGE_API_TOKEN}`;
      }

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
          errorMessage: `Software Heritage API returned HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      let dataPayload: unknown;
      let markdown = "";

      if (action === "content") {
        const textContent = await response.text();
        const maxChars = options.rawTextMaxChars || DEFAULT_MAX_RAW_CHARS;
        const truncatedContent = textContent.slice(0, maxChars);
        const isTruncated = textContent.length > maxChars;

        dataPayload = {
          swhid: cleanId,
          length: textContent.length,
          content: truncatedContent,
          isTruncated,
        };

        markdown = this.synthesizeContentMarkdown(
          cleanId,
          truncatedContent,
          textContent.length,
          isTruncated
        );
      } else {
        const jsonPayload = await response.json();
        dataPayload = jsonPayload;

        if (action === "directory") {
          const entries = Array.isArray(jsonPayload) ? (jsonPayload as RawSwhDirectoryEntry[]) : [];
          const normalizedEntries: SoftwareHeritageDirectoryEntry[] = entries.map((e) => ({
            name: e.name || "unnamed",
            type: e.type || "file",
            target: e.target || "",
            perms: e.perms,
            length: e.length,
          }));
          markdown = this.synthesizeDirectoryMarkdown(cleanId, normalizedEntries);
        } else if (action === "origin") {
          const visit = jsonPayload as RawSwhOriginVisit;
          markdown = this.synthesizeOriginMarkdown(visit);
        } else if (action === "revision") {
          const revision = jsonPayload as RawSwhRevision;
          markdown = this.synthesizeRevisionMarkdown(cleanId, revision);
        } else {
          markdown = `# Software Heritage Object\n\n\`\`\`json\n${JSON.stringify(jsonPayload, null, 2)}\n\`\`\``;
        }
      }

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          swhid: cleanId,
          action,
          url: requestUrl,
          data: dataPayload,
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
        errorMessage: `SoftwareHeritageActor execution failed: ${errorMsg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private resolveActionAndUrl(
    task: ActorTask,
    options: SoftwareHeritageActorTaskOptions
  ): {
    action: "content" | "directory" | "origin" | "revision";
    requestUrl: string;
    cleanId: string;
  } | null {
    const rawTarget = (task.targetUrl || "").trim();
    const swhid = options.swhid || (!rawTarget.startsWith("http") ? rawTarget : "") || "";
    const originUrl = options.originUrl;

    if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://")) {
      const parsed = new URL(rawTarget);
      if (parsed.pathname.includes("/content/")) {
        return { action: "content", requestUrl: rawTarget, cleanId: swhid || "custom-content" };
      }
      if (parsed.pathname.includes("/dir/")) {
        return { action: "directory", requestUrl: rawTarget, cleanId: swhid || "custom-dir" };
      }
      if (parsed.pathname.includes("/origin/")) {
        return { action: "origin", requestUrl: rawTarget, cleanId: originUrl || "custom-origin" };
      }
      if (parsed.pathname.includes("/revision/")) {
        return { action: "revision", requestUrl: rawTarget, cleanId: swhid || "custom-revision" };
      }
    }

    if (swhid) {
      const clean = swhid.trim();
      const hashPart = clean.split(":").pop() || clean;

      if (clean.includes(":cnt:") || options.action === "content") {
        return {
          action: "content",
          requestUrl: `${SWH_API_BASE}/content/sha1_git:${hashPart}/raw/`,
          cleanId: clean,
        };
      }

      if (clean.includes(":dir:") || options.action === "directory") {
        return {
          action: "directory",
          requestUrl: `${SWH_API_BASE}/dir/${hashPart}/`,
          cleanId: clean,
        };
      }

      if (clean.includes(":rev:") || options.action === "revision") {
        return {
          action: "revision",
          requestUrl: `${SWH_API_BASE}/revision/${hashPart}/`,
          cleanId: clean,
        };
      }

      // Default fallback for raw hash
      return {
        action: "content",
        requestUrl: `${SWH_API_BASE}/content/sha1_git:${hashPart}/raw/`,
        cleanId: clean,
      };
    }

    if (originUrl) {
      const encodedOrigin = encodeURIComponent(originUrl.trim());
      return {
        action: "origin",
        requestUrl: `${SWH_API_BASE}/origin/${encodedOrigin}/visit/latest/`,
        cleanId: originUrl.trim(),
      };
    }

    return null;
  }

  private synthesizeContentMarkdown(
    swhid: string,
    content: string,
    totalBytes: number,
    isTruncated: boolean
  ): string {
    const lines: string[] = [];
    lines.push(`# Software Heritage Source Blob: ${swhid}`);
    lines.push(`- **Persistent Identifier (SWHID)**: \`${swhid}\``);
    lines.push(`- **Byte Size**: ${totalBytes} bytes`);
    if (isTruncated) lines.push(`- **Notice**: Content truncated to display limit.`);
    lines.push("");
    lines.push("```");
    lines.push(content);
    lines.push("```");
    return lines.join("\n");
  }

  private synthesizeDirectoryMarkdown(
    swhid: string,
    entries: SoftwareHeritageDirectoryEntry[]
  ): string {
    const lines: string[] = [];
    lines.push(`# Software Heritage Directory Tree: ${swhid}`);
    lines.push(`- **Directory SWHID**: \`${swhid}\``);
    lines.push(`- **Total Entries**: ${entries.length}`);
    lines.push("");
    lines.push("| Name | Type | Target SWHID | Size (bytes) |");
    lines.push("|---|---|---|---|");

    for (const e of entries) {
      const sizeStr = e.length !== undefined ? String(e.length) : "-";
      lines.push(`| **${e.name}** | \`${e.type}\` | \`${e.target}\` | ${sizeStr} |`);
    }

    return lines.join("\n");
  }

  private synthesizeOriginMarkdown(visit: RawSwhOriginVisit): string {
    const lines: string[] = [];
    lines.push(`# Software Heritage Repository Origin: ${visit.origin || "Unknown"}`);
    lines.push(`- **Origin URL**: ${visit.origin || "N/A"}`);
    lines.push(`- **Latest Visit Date**: ${visit.date || "N/A"}`);
    lines.push(`- **Visit Status**: ${visit.status || "N/A"}`);
    lines.push(`- **Snapshot SWHID**: \`${visit.snapshot || "none"}\``);
    return lines.join("\n");
  }

  private synthesizeRevisionMarkdown(swhid: string, rev: RawSwhRevision): string {
    const lines: string[] = [];
    lines.push(`# Software Heritage Revision: ${swhid}`);
    lines.push(`- **Commit ID**: \`${rev.id || swhid}\``);
    if (rev.author?.name)
      lines.push(`- **Author**: ${rev.author.name} <${rev.author.email || ""}>`);
    if (rev.date) lines.push(`- **Date**: ${rev.date}`);
    if (rev.directory) lines.push(`- **Root Directory SWHID**: \`${rev.directory}\``);
    if (rev.message) {
      lines.push("");
      lines.push("### Commit Message");
      lines.push(`> ${rev.message.trim()}`);
    }
    return lines.join("\n");
  }
}
