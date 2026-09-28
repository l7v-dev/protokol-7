/**
 * LessWrongActor - Epistemic rationality, Bayesian reasoning, AI alignment,
 * and dialectic argumentation trees harvester from LessWrong & Alignment Forum GraphQL API.
 * Conforms to docs/actor-contract.md and docs/actors/lesswrong.md.
 */

import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  LessWrongActorResult,
  LessWrongActorTaskOptions,
  LessWrongComment,
  LessWrongPost,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const LESSWRONG_GRAPHQL_ENDPOINT = "https://www.lesswrong.com/graphql";
const ALIGNMENT_FORUM_GRAPHQL_ENDPOINT = "https://www.alignmentforum.org/graphql";

const GRAPHQL_QUERY_POSTS = `
query GetPosts($input: PostsListInput) {
  posts(input: $input) {
    results {
      _id
      title
      slug
      pageUrl
      postedAt
      baseScore
      voteCount
      commentCount
      user {
        username
        displayName
      }
      htmlBody
    }
    totalCount
  }
}
`;

const GRAPHQL_QUERY_POST = `
query GetPost($input: PostInput) {
  post(input: $input) {
    result {
      _id
      title
      slug
      pageUrl
      postedAt
      baseScore
      voteCount
      commentCount
      user {
        username
        displayName
      }
      htmlBody
    }
  }
}
`;

const GRAPHQL_QUERY_COMMENTS = `
query GetComments($input: CommentsListInput) {
  comments(input: $input) {
    results {
      _id
      postId
      parentCommentId
      postedAt
      baseScore
      user {
        username
        displayName
      }
      htmlBody
    }
    totalCount
  }
}
`;

export class LessWrongActor implements IActor<LessWrongActorResult> {
  readonly actorType = "lesswrong" as const;
  readonly description =
    "Harvests epistemic rationality, Bayesian reasoning, AI alignment essays, and dialectic comment trees from LessWrong and Alignment Forum GraphQL APIs.";

  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
  }

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<LessWrongActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: LessWrongActorTaskOptions =
      task.options?.lessWrongOptions ||
      (task.options as unknown as LessWrongActorTaskOptions) ||
      {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF check on targetUrl if provided
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

      // 2. Resolve parameters & platform
      const resolved = this.resolveParameters(task.targetUrl, options);

      // 3. Determine GraphQL endpoint URL
      const endpoint = this.buildEndpointUrl(task.targetUrl, resolved.platform);

      // 4. Secondary SSRF check on endpoint
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

      // 5. Construct GraphQL payload
      const queryPayload = this.buildGraphQLPayload(resolved);

      // 6. Network fetch with abort controller
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(task.options?.headers || {}),
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(queryPayload),
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
          errorMessage: `LessWrong GraphQL API returned HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const json = (await response.json()) as Record<string, unknown>;

      // Check GraphQL errors
      if (Array.isArray(json.errors) && json.errors.length > 0) {
        const firstErr = json.errors[0] as { message?: string };
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage: `GraphQL Error: ${firstErr.message || "Unknown error"}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 7. Parse response items
      const { posts, comments } = this.parseGraphQLResponse(resolved.action, json);

      // 8. Optionally fetch comments if action is single post and requested
      if (
        resolved.action === "post" &&
        resolved.includeComments &&
        posts.length > 0 &&
        posts[0].id
      ) {
        const postComments = await this.fetchCommentsForPost(
          endpoint,
          posts[0].id,
          resolved.maxComments,
          headers,
          allowLocalNetwork
        );
        posts[0].comments = postComments;
      }

      const markdown = this.renderMarkdown(resolved.platform, resolved.action, posts, comments);

      const resultData: LessWrongActorResult = {
        action: resolved.action,
        platform: resolved.platform,
        totalResults: posts.length > 0 ? posts.length : comments?.length || 0,
        posts,
        comments,
        queryUrl: endpoint,
        markdown,
      };

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
   * Resolves options, platform, action, and identifiers.
   */
  resolveParameters(
    targetUrl: string,
    options: LessWrongActorTaskOptions
  ): {
    action: "posts" | "post" | "comments" | "search";
    platform: "lesswrong" | "alignmentforum";
    postId?: string;
    slug?: string;
    query?: string;
    limit: number;
    view: string;
    includeComments: boolean;
    maxComments: number;
  } {
    let platform: "lesswrong" | "alignmentforum" = "lesswrong";
    let action: "posts" | "post" | "comments" | "search" = "posts";
    let postId = options.postId?.trim();
    let slug = options.slug?.trim();
    const query = options.query?.trim();
    const limit = Math.min(Math.max(options.limit || 10, 1), 50);
    const view = options.view?.trim() || "curated";
    const includeComments = options.includeComments ?? true;
    const maxComments = Math.min(Math.max(options.maxComments || 10, 1), 50);

    if (options.platform?.toLowerCase() === "alignmentforum") {
      platform = "alignmentforum";
    }

    if (options.action) {
      const act = options.action.toLowerCase();
      if (act === "post" || act === "comments" || act === "search" || act === "posts") {
        action = act;
      }
    } else if (postId || slug) {
      action = "post";
    } else if (query) {
      action = "search";
    }

    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.hostname.includes("alignmentforum.org")) {
          platform = "alignmentforum";
        }
        if (parsed.pathname.includes("/posts/")) {
          const parts = parsed.pathname.split("/posts/")[1].split("/").filter(Boolean);
          if (parts.length > 0) {
            postId = parts[0];
            action = "post";
          }
          if (parts.length > 1) {
            slug = parts[1];
          }
        }
      } catch {
        // Fallback to options
      }
    }

    return {
      action,
      platform,
      postId,
      slug,
      query,
      limit,
      view,
      includeComments,
      maxComments,
    };
  }

  /**
   * Constructs the appropriate GraphQL endpoint URL.
   */
  buildEndpointUrl(targetUrl: string, platform: "lesswrong" | "alignmentforum"): string {
    if (targetUrl && (targetUrl.includes("/graphql") || targetUrl.includes("/test"))) {
      return targetUrl;
    }
    return platform === "alignmentforum"
      ? ALIGNMENT_FORUM_GRAPHQL_ENDPOINT
      : LESSWRONG_GRAPHQL_ENDPOINT;
  }

  /**
   * Builds GraphQL query and variable payload.
   */
  buildGraphQLPayload(resolved: {
    action: "posts" | "post" | "comments" | "search";
    postId?: string;
    slug?: string;
    query?: string;
    limit: number;
    view: string;
  }): { query: string; variables: Record<string, unknown> } {
    switch (resolved.action) {
      case "post": {
        const selector: Record<string, unknown> = {};
        if (resolved.postId) selector._id = resolved.postId;
        if (resolved.slug) selector.slug = resolved.slug;
        return {
          query: GRAPHQL_QUERY_POST,
          variables: { input: { selector } },
        };
      }
      case "comments": {
        return {
          query: GRAPHQL_QUERY_COMMENTS,
          variables: {
            input: {
              terms: {
                postId: resolved.postId,
                limit: resolved.limit,
              },
            },
          },
        };
      }
      case "search": {
        return {
          query: GRAPHQL_QUERY_POSTS,
          variables: {
            input: {
              terms: {
                query: resolved.query,
                limit: resolved.limit,
              },
            },
          },
        };
      }
      default: {
        return {
          query: GRAPHQL_QUERY_POSTS,
          variables: {
            input: {
              terms: {
                view: resolved.view,
                limit: resolved.limit,
              },
            },
          },
        };
      }
    }
  }

  /**
   * Parses GraphQL response JSON into LessWrongPost and LessWrongComment arrays.
   */
  parseGraphQLResponse(
    _action: string,
    json: Record<string, unknown>
  ): { posts: LessWrongPost[]; comments?: LessWrongComment[] } {
    const data = json.data as Record<string, unknown> | undefined;
    if (!data) return { posts: [] };

    // 1. Single Post Response
    if (data.post && typeof data.post === "object") {
      const postWrap = data.post as Record<string, unknown>;
      const p = postWrap.result as Record<string, unknown> | undefined;
      if (!p) return { posts: [] };

      const user = p.user as Record<string, unknown> | undefined;
      const author = String(user?.displayName || user?.username || "Anonymous");
      const htmlBody = String(p.htmlBody || "");
      const contentMarkdown = htmlBody ? this.turndown.turndown(htmlBody) : undefined;

      const post: LessWrongPost = {
        id: String(p._id || ""),
        title: String(p.title || "Untitled"),
        slug: String(p.slug || ""),
        url: String(p.pageUrl || `https://www.lesswrong.com/posts/${p._id}`),
        author,
        postedAt: String(p.postedAt || new Date().toISOString()),
        score: typeof p.baseScore === "number" ? p.baseScore : 0,
        voteCount: typeof p.voteCount === "number" ? p.voteCount : undefined,
        commentCount: typeof p.commentCount === "number" ? p.commentCount : undefined,
        contentMarkdown,
      };

      return { posts: [post] };
    }

    // 2. Posts List Response
    if (data.posts && typeof data.posts === "object") {
      const postsWrap = data.posts as Record<string, unknown>;
      const results = postsWrap.results as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(results)) return { posts: [] };

      const posts: LessWrongPost[] = results.map((p) => {
        const user = p.user as Record<string, unknown> | undefined;
        const author = String(user?.displayName || user?.username || "Anonymous");
        const htmlBody = String(p.htmlBody || "");
        const contentMarkdown = htmlBody ? this.turndown.turndown(htmlBody) : undefined;

        return {
          id: String(p._id || ""),
          title: String(p.title || "Untitled"),
          slug: String(p.slug || ""),
          url: String(p.pageUrl || `https://www.lesswrong.com/posts/${p._id}`),
          author,
          postedAt: String(p.postedAt || new Date().toISOString()),
          score: typeof p.baseScore === "number" ? p.baseScore : 0,
          voteCount: typeof p.voteCount === "number" ? p.voteCount : undefined,
          commentCount: typeof p.commentCount === "number" ? p.commentCount : undefined,
          contentMarkdown,
        };
      });

      return { posts };
    }

    // 3. Comments Response
    if (data.comments && typeof data.comments === "object") {
      const commentsWrap = data.comments as Record<string, unknown>;
      const results = commentsWrap.results as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(results)) return { posts: [] };

      const comments: LessWrongComment[] = results.map((c) => {
        const user = c.user as Record<string, unknown> | undefined;
        const author = String(user?.displayName || user?.username || "Anonymous");
        const htmlBody = String(c.htmlBody || "");
        const contentMarkdown = htmlBody ? this.turndown.turndown(htmlBody) : "";

        return {
          id: String(c._id || ""),
          postId: c.postId ? String(c.postId) : undefined,
          parentCommentId: c.parentCommentId ? String(c.parentCommentId) : undefined,
          author,
          postedAt: String(c.postedAt || new Date().toISOString()),
          score: typeof c.baseScore === "number" ? c.baseScore : 0,
          contentMarkdown,
        };
      });

      return { posts: [], comments };
    }

    return { posts: [] };
  }

  /**
   * Fetches comments for a specific post.
   */
  private async fetchCommentsForPost(
    endpoint: string,
    postId: string,
    limit: number,
    headers: Record<string, string>,
    allowLocalNetwork: boolean
  ): Promise<LessWrongComment[]> {
    try {
      const payload = {
        query: GRAPHQL_QUERY_COMMENTS,
        variables: {
          input: {
            terms: {
              postId,
              limit,
            },
          },
        },
      };

      const resp = await safeRedirectFetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        allowLocalNetwork,
      });

      if (!resp.ok) return [];

      const json = (await resp.json()) as Record<string, unknown>;
      const { comments } = this.parseGraphQLResponse("comments", json);
      return comments || [];
    } catch {
      return [];
    }
  }

  /**
   * Formats LessWrong posts and dialectic comments into GFM Markdown.
   */
  renderMarkdown(
    platform: string,
    action: string,
    posts: LessWrongPost[],
    comments?: LessWrongComment[]
  ): string {
    const lines: string[] = [];
    const platformTitle =
      platform === "alignmentforum" ? "Alignment Forum" : "LessWrong Epistemic Rationality";

    lines.push(`# ${platformTitle} Corpus`);
    lines.push(
      `**Action:** \`${action}\` | **Total Items:** ${posts.length || (comments?.length ?? 0)}`
    );
    lines.push("");

    if (posts.length === 0 && (!comments || comments.length === 0)) {
      lines.push("_No posts or comments found for query._");
      return lines.join("\n");
    }

    if (posts.length > 0) {
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        lines.push(`## ${i + 1}. [${post.title}](${post.url})`);
        lines.push(
          `*Author:* **${post.author}** | *Score:* **${post.score}** | *Date:* \`${post.postedAt.slice(0, 10)}\``
        );
        lines.push("");

        if (post.contentMarkdown) {
          lines.push("### Essay Content");
          lines.push(post.contentMarkdown);
          lines.push("");
        }

        if (post.comments && post.comments.length > 0) {
          lines.push("### Dialectic Comments & Argumentation");
          for (const c of post.comments) {
            lines.push(`> **${c.author}** (Score: ${c.score}):`);
            lines.push(`> ${c.contentMarkdown.replace(/\n/g, "\n> ")}`);
            lines.push("");
          }
        }

        lines.push("---");
        lines.push("");
      }
    } else if (comments && comments.length > 0) {
      lines.push("## Dialectic Comments");
      for (let i = 0; i < comments.length; i++) {
        const c = comments[i];
        lines.push(`### Comment ${i + 1} by ${c.author} (Score: ${c.score})`);
        lines.push(c.contentMarkdown);
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    }

    return lines.join("\n");
  }
}
