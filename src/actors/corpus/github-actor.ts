/**
 * GithubActor - GitHub repository metadata, README, issues, pull requests,
 * releases, and source tree extraction actor.
 * Conforms to docs/actor-contract.md and docs/actors/github.md.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  GithubActorResult,
  GithubActorTaskOptions,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const GITHUB_API_BASE = "https://api.github.com";

export class GithubActor implements IActor<GithubActorResult> {
  readonly actorType = "github" as const;
  readonly description =
    "GitHub repository metadata, README, issues, pull requests, releases, and source tree extraction actor.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<GithubActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: GithubActorTaskOptions =
      task.options?.githubOptions || (task.options as GithubActorTaskOptions) || {};
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

      // 2. Parse repository coordinate and action
      const { owner, repo, action } = this.resolveRepoAndAction(task.targetUrl, options);

      if (!owner || !repo) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage:
            "Missing repository identifier. Provide 'owner' and 'repo' in options, or targetUrl (e.g. 'https://github.com/owner/repo').",
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 3. Resolve upstream API endpoint URL
      const endpoint = this.buildEndpointUrl(task.targetUrl, owner, repo, action, options);

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
          errorMessage: `SSRF validation failed on target endpoint: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 5. Dispatch HTTP request with abort controller and authentication if present
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      const token = options.token || process.env.GITHUB_TOKEN;
      const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
        Accept:
          action === "readme"
            ? "application/vnd.github.raw+json, application/vnd.github.v3+json"
            : "application/vnd.github.v3+json",
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      let response: Response;
      try {
        response = await safeRedirectFetch(endpoint, {
          signal: controller.signal,
          headers,
          timeoutMs,
          allowLocalNetwork,
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
          errorMessage: `GitHub API request failed with HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 6. Process response data and generate GFM Markdown
      const rawText = await response.text();
      let parsedData: Record<string, unknown> | Array<Record<string, unknown>>;

      try {
        parsedData = JSON.parse(rawText);
      } catch {
        // Raw text (e.g. raw markdown readme)
        parsedData = { content: rawText };
      }

      const markdown = this.renderMarkdown(owner, repo, action, parsedData, endpoint);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          owner,
          repo,
          action,
          data: parsedData,
          queryUrl: endpoint,
          markdown,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Resolves owner, repository name, and action from targetUrl or options.
   */
  resolveRepoAndAction(
    targetUrl?: string,
    options?: GithubActorTaskOptions
  ): { owner: string; repo: string; action: string } {
    let owner = options?.owner?.trim() || "";
    let repo = options?.repo?.trim() || "";
    let action = options?.action || "repo";

    if (targetUrl) {
      const trimmed = targetUrl.trim();
      const match = trimmed.match(
        /(?:https?:\/\/github\.com\/|^)([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/(issues|pulls|releases|blob|tree))?/i
      );

      if (match) {
        if (!owner) owner = match[1];
        if (!repo) repo = match[2].replace(/\.git$/i, "");
        if (match[3] && !options?.action) {
          const sub = match[3].toLowerCase();
          if (sub === "issues") action = "issues";
          else if (sub === "pulls") action = "pulls";
          else if (sub === "releases") action = "releases";
          else if (sub === "tree" || sub === "blob") action = "tree";
        }
      }
    }

    return { owner, repo, action };
  }

  /**
   * Constructs the GitHub REST API URL.
   */
  buildEndpointUrl(
    targetUrl: string | undefined,
    owner: string,
    repo: string,
    action: string,
    options?: GithubActorTaskOptions
  ): string {
    if (
      targetUrl &&
      (targetUrl.includes("api.github.com") ||
        (targetUrl.startsWith("http://127.0.0.1") && targetUrl.includes("/repos/")))
    ) {
      return targetUrl;
    }

    const limit = options?.limit || 30;
    const state = options?.state || "open";

    switch (action) {
      case "readme":
        return `${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`;
      case "issues":
        return `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}`;
      case "pulls":
        return `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls?state=${state}&per_page=${limit}`;
      case "releases":
        return `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases?per_page=${limit}`;
      case "tree":
        return `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
      default:
        return `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
    }
  }

  /**
   * Formats GitHub data into LLM-ready GFM Markdown.
   */
  private renderMarkdown(
    owner: string,
    repo: string,
    action: string,
    data: Record<string, unknown> | Array<Record<string, unknown>>,
    endpointUrl: string
  ): string {
    const lines: string[] = [];
    lines.push(`# GitHub Repository: ${owner}/${repo}`);
    lines.push(`**İşlem:** ${action} | **Kaynak API:** [${endpointUrl}](${endpointUrl})\n`);

    if (action === "readme") {
      if (typeof (data as Record<string, unknown>).content === "string") {
        const content = (data as Record<string, unknown>).content as string;
        // If Base64 encoded
        const decoded =
          (data as Record<string, unknown>).encoding === "base64"
            ? Buffer.from(content, "base64").toString("utf-8")
            : content;
        lines.push(decoded);
      } else {
        lines.push(JSON.stringify(data, null, 2));
      }
      return lines.join("\n");
    }

    if (action === "repo" && !Array.isArray(data)) {
      const d = data as Record<string, unknown>;
      lines.push(`* **Açıklama:** ${d.description || "Belirtilmemiş"}`);
      lines.push(
        `* **Yıldız (Stars):** ${d.stargazers_count ?? 0} | **Çatallar (Forks):** ${d.forks_count ?? 0}`
      );
      lines.push(`* **Açık Sorunlar (Open Issues):** ${d.open_issues_count ?? 0}`);
      lines.push(
        `* **Ana Dil:** ${d.language || "Bilinmiyor"} | **Varsayılan Dal:** ${d.default_branch || "main"}`
      );
      lines.push(`* **Lisans:** ${(d.license as Record<string, unknown>)?.name || "Lisanssız"}`);

      if (Array.isArray(d.topics) && d.topics.length > 0) {
        lines.push(`* **Etiketler:** ${d.topics.map((t) => `\`${t}\``).join(", ")}`);
      }
      return lines.join("\n");
    }

    if (Array.isArray(data)) {
      lines.push(`**Toplam Kayıt:** ${data.length}\n`);

      for (const item of data) {
        if (action === "issues" || action === "pulls") {
          const number = item.number;
          const title = item.title;
          const user = (item.user as Record<string, unknown>)?.login || "anon";
          const state = item.state;
          const url = item.html_url;
          const body = typeof item.body === "string" ? item.body : "";

          lines.push(`## #${number}: ${title} [${state}]`);
          lines.push(`* **Yazar:** @${user} | **Bağlantı:** [GitHub #${number}](${url})`);

          if (Array.isArray(item.labels) && item.labels.length > 0) {
            const labels = item.labels
              .map((l: Record<string, unknown>) => `\`${l.name}\``)
              .join(", ");
            lines.push(`* **Etiketler:** ${labels}`);
          }

          if (body) {
            const preview = body.length > 500 ? `${body.substring(0, 500)}...` : body;
            lines.push(`\n> ${preview.replace(/\n/g, "\n> ")}\n`);
          }
          lines.push("---\n");
        } else if (action === "releases") {
          const tag = item.tag_name;
          const name = item.name || tag;
          const date = item.published_at;
          const body = typeof item.body === "string" ? item.body : "";
          const url = item.html_url;

          lines.push(`## Sürüm: ${name} (${tag})`);
          lines.push(`* **Yayın Tarihi:** ${date} | **Bağlantı:** [Release](${url})`);

          if (body) {
            lines.push(`\n${body}\n`);
          }
          lines.push("---\n");
        }
      }
      return lines.join("\n");
    }

    lines.push(`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``);
    return lines.join("\n");
  }
}
