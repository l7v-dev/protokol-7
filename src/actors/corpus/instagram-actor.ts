/**
 * Instagram Public Profile, Post/Reel, Recent Media & Hashtag Harvester Actor — protokol-7
 *
 * Extracts structured profiles, media posts, reels, carousel slides, engagement
 * metrics, and hashtags from public Instagram resources.
 * Employs a dual-engine architecture:
 * 1. Fast HTTP API extraction querying web_profile_info with official web client headers (X-IG-App-ID).
 * 2. Headless Chromium Stealth fallback via BrowserPool for login walls, checkpoint gating,
 *    and response interception with optional session cookie authentication.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  InstagramAction,
  InstagramActorResult,
  InstagramActorTaskOptions,
  InstagramCommentRecord,
  InstagramHashtagRecord,
  InstagramMediaChild,
  InstagramMediaRecord,
  InstagramMediaType,
  InstagramProfileRecord,
} from "../../api/types";
import { BrowserPool, type PooledBrowserSession } from "../../browser/browser-pool";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const INSTAGRAM_WEB_APP_ID = "936619743392459";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface TargetResolution {
  action: InstagramAction;
  query: string;
  username?: string;
  shortcode?: string;
  hashtag?: string;
  directUrl?: string;
}

export class InstagramActor implements IActor<InstagramActorResult> {
  readonly actorType = "instagram" as const;
  readonly description =
    "Extracts public Instagram profiles, posts, reels, recent media, and hashtags using dual-engine HTTP API and Playwright Chromium stealth fallback.";

  async run(
    task: ActorTask,
    context?: ActorRunContext
  ): Promise<ActorResult<InstagramActorResult>> {
    const startTime = context?.startTime || Date.now();
    const taskOpts = task.options || {};
    const options = (taskOpts.instagramOptions || taskOpts) as InstagramActorTaskOptions;
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork =
      process.env.NODE_ENV === "test" ||
      Boolean(options.allowLocalNetwork) ||
      Boolean((task.options as Record<string, unknown> | undefined)?.allowLocalNetwork);

    try {
      // 1. Initial SSRF validation on targetUrl if explicitly provided as HTTP URL
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

      // 2. Resolve target parameters and action
      const target = this.resolveTarget(task.targetUrl, options);
      if (!target) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage:
            "Missing target parameter: Provide a valid Instagram URL, username, shortcode, or hashtag.",
          executionDurationMs: Date.now() - startTime,
        };
      }

      const forceBrowser = Boolean(
        options.useBrowser ||
          options.renderJavaScript ||
          options.sessionCookies?.length ||
          process.env.INSTAGRAM_SESSION_ID
      );

      let resultData: InstagramActorResult | null = null;
      let engineUsed: "http" | "browser" = "http";

      // 3. Level 1: Fast HTTP API Extraction (unless browser mode is forced)
      if (!forceBrowser) {
        try {
          resultData = await this.executeHttpExtraction(
            target,
            options,
            timeoutMs,
            allowLocalNetwork
          );
        } catch {
          // Fall through to Level 2 browser pool
        }
      }

      // 4. Level 2: Headless Chromium Stealth Fallback
      if (!resultData) {
        engineUsed = "browser";
        resultData = await this.executeBrowserExtraction(
          target,
          options,
          timeoutMs,
          allowLocalNetwork
        );
      }

      // 5. Build LLM-ready markdown synthesis if enabled
      if (options.extractMarkdown !== false) {
        resultData.markdown = this.synthesizeMarkdown(resultData);
      }
      resultData.engineUsed = engineUsed;

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: resultData,
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
   * Resolves Instagram target identifier, URL, and operational action.
   */
  resolveTarget(targetUrl?: string, options?: InstagramActorTaskOptions): TargetResolution | null {
    let rawInput = (targetUrl || options?.targetUrl || "").trim();
    const action = options?.action;
    const username = options?.username?.trim().replace(/^@/, "");
    const shortcode = options?.shortcode?.trim();
    const hashtag = options?.hashtag?.trim().replace(/^#/, "");
    const isUrl = rawInput.startsWith("http://") || rawInput.startsWith("https://");
    const directUrl = isUrl ? rawInput : undefined;

    // Prioritize explicit task options
    if (shortcode) {
      return {
        action: action || "post",
        query: shortcode,
        shortcode,
        directUrl,
      };
    }

    if (hashtag) {
      return {
        action: action || "hashtag",
        query: hashtag,
        hashtag,
        directUrl,
      };
    }

    if (username) {
      return {
        action: action || "profile",
        query: username,
        username,
        directUrl,
      };
    }

    if (!rawInput) {
      return null;
    }

    // Try parsing from raw URL
    if (rawInput.startsWith("http://") || rawInput.startsWith("https://")) {
      try {
        const parsed = new URL(rawInput);
        const path = parsed.pathname.replace(/\/+$/, "");
        const segments = path.split("/").filter(Boolean);

        // Check for post or reel: /p/{shortcode}, /reel/{shortcode}, /tv/{shortcode}
        if (
          segments.length >= 2 &&
          (segments[0] === "p" || segments[0] === "reel" || segments[0] === "tv")
        ) {
          return {
            action: action || "post",
            query: segments[1],
            shortcode: segments[1],
            directUrl: rawInput,
          };
        }

        // Check for hashtag: /explore/tags/{hashtag}
        if (segments.length >= 3 && segments[0] === "explore" && segments[1] === "tags") {
          return {
            action: action || "hashtag",
            query: segments[2],
            hashtag: segments[2],
            directUrl: rawInput,
          };
        }

        // Check for user profile: /{username}
        if (
          segments.length === 1 &&
          !["explore", "accounts", "direct", "stories", "reels"].includes(segments[0])
        ) {
          return {
            action: action || "profile",
            query: segments[0],
            username: segments[0],
            directUrl: rawInput,
          };
        }
      } catch {
        // Fall through to plain text matching
      }
    }

    // Clean plain text string
    rawInput = rawInput.replace(/^@/, "");
    if (rawInput.startsWith("#")) {
      const cleanTag = rawInput.slice(1);
      return {
        action: action || "hashtag",
        query: cleanTag,
        hashtag: cleanTag,
      };
    }

    return {
      action: action || "profile",
      query: rawInput,
      username: rawInput,
    };
  }

  /**
   * Level 1: Executes low-latency HTTP API extraction.
   */
  private async executeHttpExtraction(
    target: TargetResolution,
    options: InstagramActorTaskOptions,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<InstagramActorResult> {
    const endpoint = this.buildApiEndpoint(target);
    const ssrfCheck = await SSRFGuard.validateUrlWithDns(endpoint, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      throw new Error(`SSRF check failed for Instagram API endpoint: ${ssrfCheck.reason}`);
    }

    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      "X-IG-App-ID": INSTAGRAM_WEB_APP_ID,
      Accept: "*/*",
      "X-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
    };

    // Apply session cookies if provided
    const cookieHeader = this.buildCookieHeader(options);
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const response = await safeRedirectFetch(endpoint, {
      headers,
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      throw new Error(`HTTP API failed with status ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("HTTP response was not valid JSON (likely HTML login wall).");
    }

    return this.parseJsonResponse(target, json, options);
  }

  /**
   * Level 2: Executes Playwright Chromium extraction with Stealth and response interception.
   */
  private async executeBrowserExtraction(
    target: TargetResolution,
    options: InstagramActorTaskOptions,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<InstagramActorResult> {
    const targetUrl = this.buildWebUrl(target);
    const ssrfCheck = await SSRFGuard.validateUrlWithDns(targetUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      throw new Error(`SSRF check failed for Instagram web URL: ${ssrfCheck.reason}`);
    }

    let session: PooledBrowserSession | undefined;

    try {
      session = await BrowserPool.acquireSession({
        timeoutMs,
        allowLocalNetwork,
        userAgent: USER_AGENT,
      });

      const { context, page } = session;

      // Inject session cookies if configured
      const cookiesToInject = options.sessionCookies || [];
      const envSessionId = process.env.INSTAGRAM_SESSION_ID;
      if (envSessionId && !cookiesToInject.some((c) => c.name === "sessionid")) {
        cookiesToInject.push({
          name: "sessionid",
          value: envSessionId,
          domain: ".instagram.com",
          path: "/",
        });
      }

      if (cookiesToInject.length > 0) {
        await context.addCookies(
          cookiesToInject.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain || ".instagram.com",
            path: c.path || "/",
            secure: true,
            httpOnly: c.name === "sessionid",
          }))
        );
      }

      let interceptedJson: Record<string, unknown> | null = null;

      // Intercept background JSON API responses
      page.on("response", async (res) => {
        try {
          const url = res.url();
          if (
            (url.includes("/api/v1/users/web_profile_info/") ||
              url.includes("/graphql/query/") ||
              url.includes("/api/v1/tags/web_info/")) &&
            res.status() === 200
          ) {
            const parsed = await res.json();
            if (parsed && typeof parsed === "object") {
              interceptedJson = parsed as Record<string, unknown>;
            }
          }
        } catch {
          // Non-blocking response parse attempt
        }
      });

      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });

      // Brief wait for background network requests to resolve
      if (!interceptedJson) {
        await page.waitForTimeout(1500).catch(() => {});
      }

      if (interceptedJson) {
        return this.parseJsonResponse(target, interceptedJson, options);
      }

      // Fallback: Extract from DOM JSON-LD and OpenGraph metadata
      return await this.extractFromPageDom(page, target, options);
    } finally {
      if (session) {
        await session.release();
      }
    }
  }

  /**
   * Fallback extractor reading schema.org JSON-LD scripts and OpenGraph metadata from DOM.
   */
  private async extractFromPageDom(
    page: import("playwright").Page,
    target: TargetResolution,
    _options: InstagramActorTaskOptions
  ): Promise<InstagramActorResult> {
    const pageData = await page.evaluate(() => {
      const metaTags: Record<string, string> = {};
      document.querySelectorAll("meta[property], meta[name]").forEach((el) => {
        const prop = el.getAttribute("property") || el.getAttribute("name");
        const content = el.getAttribute("content");
        if (prop && content) {
          metaTags[prop] = content;
        }
      });

      let jsonLd: Record<string, unknown> | null = null;
      const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
      if (jsonLdScript?.textContent) {
        try {
          jsonLd = JSON.parse(jsonLdScript.textContent);
        } catch {
          // Ignore parse failure
        }
      }

      const domPosts: Array<{
        shortcode: string;
        url: string;
        mediaType: "image" | "video";
        displayUrl?: string;
        caption?: string;
      }> = [];

      document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').forEach((el) => {
        const a = el as HTMLAnchorElement;
        const href = a.getAttribute("href") || "";
        const match = href.match(/\/(p|reel)\/([^/?#]+)/);
        if (match) {
          const type = match[1] === "reel" ? ("video" as const) : ("image" as const);
          const shortcode = match[2];
          if (!domPosts.some((p) => p.shortcode === shortcode)) {
            const img = a.querySelector("img");
            domPosts.push({
              shortcode,
              url: `https://www.instagram.com/${match[1]}/${shortcode}/`,
              mediaType: type,
              displayUrl: img?.src || undefined,
              caption: img?.alt || "",
            });
          }
        }
      });

      const domComments: Array<{
        username: string;
        text: string;
        profilePicUrl?: string;
      }> = [];

      document.querySelectorAll("ul li, div[class*='Comment'], article ul li").forEach((el) => {
        const userEl = el.querySelector("h3, a[href^='/'], a[role='link']");
        const textEl = el.querySelector("span[dir='auto']");
        if (userEl && textEl) {
          const u = userEl.textContent?.trim().replace(/^@/, "") || "";
          const t = textEl.textContent?.trim() || "";
          if (
            u &&
            t &&
            u !== t &&
            !u.includes("Follow") &&
            !domComments.some((c) => c.username === u && c.text === t)
          ) {
            const img = el.querySelector("img");
            domComments.push({
              username: u,
              text: t,
              profilePicUrl: img?.src || undefined,
            });
          }
        }
      });

      const title = document.title || "";
      return { metaTags, jsonLd, title, domPosts, domComments };
    });

    const { metaTags, jsonLd } = pageData;
    const ogTitle = metaTags["og:title"] || "";
    const ogDesc = metaTags["og:description"] || "";
    const ogImage = metaTags["og:image"] || "";
    const ogVideo = metaTags["og:video"] || "";

    if (target.action === "profile" || target.action === "recent_posts") {
      const parsedStats = this.parseProfileStatsFromDescription(ogDesc);
      const username = target.username || target.query;

      const recentPostsPreview: InstagramMediaRecord[] = (pageData.domPosts || []).map((p) => ({
        id: p.shortcode,
        shortcode: p.shortcode,
        url: p.url,
        mediaType: p.mediaType,
        caption: p.caption || "",
        likeCount: 0,
        commentCount: 0,
        displayUrl: p.displayUrl,
        hashtags: this.extractHashtags(p.caption || ""),
        mentions: this.extractMentions(p.caption || ""),
      }));

      const profile: InstagramProfileRecord = {
        id: String(jsonLd?.identifier || username),
        username,
        fullName: String(jsonLd?.name || ogTitle.split("•")[0]?.trim() || username),
        biography: String(jsonLd?.description || ogDesc),
        externalUrl: typeof jsonLd?.url === "string" ? jsonLd.url : undefined,
        profilePicUrl: ogImage || undefined,
        isVerified: false,
        isPrivate: false,
        followerCount: parsedStats.followers,
        followingCount: parsedStats.following,
        mediaCount: parsedStats.posts,
        recentPostsPreview,
      };

      return {
        action: target.action,
        query: target.query,
        profile,
        posts: recentPostsPreview,
        markdown: "",
        engineUsed: "browser",
      };
    }

    // Post / Reel fallback
    const shortcode = target.shortcode || target.query;
    const isVideo = Boolean(ogVideo || metaTags["og:type"] === "video");
    const caption = ogTitle || ogDesc;

    const extractedComments: InstagramCommentRecord[] = (pageData.domComments || []).map(
      (c, idx) => ({
        id: `dom-c-${idx + 1}`,
        username: c.username,
        text: c.text,
        authorProfilePicUrl: c.profilePicUrl,
        likeCount: 0,
      })
    );

    const mediaRecord: InstagramMediaRecord = {
      id: shortcode,
      shortcode,
      url: `https://www.instagram.com/p/${shortcode}/`,
      mediaType: isVideo ? "video" : "image",
      caption,
      likeCount: 0,
      commentCount: extractedComments.length,
      takenAtTimestamp: Math.floor(Date.now() / 1000),
      displayUrl: ogImage,
      videoUrl: ogVideo || undefined,
      hashtags: this.extractHashtags(caption),
      mentions: this.extractMentions(caption),
      comments: extractedComments.length > 0 ? extractedComments : undefined,
    };

    return {
      action: "post",
      query: target.query,
      posts: [mediaRecord],
      markdown: "",
      engineUsed: "browser",
    };
  }

  /**
   * Parses structured Instagram API JSON into standard domain records.
   */
  private parseJsonResponse(
    target: TargetResolution,
    json: Record<string, unknown>,
    _options: InstagramActorTaskOptions
  ): InstagramActorResult {
    // 1. Profile / Recent Posts action
    if (target.action === "profile" || target.action === "recent_posts") {
      const dataObj = (json.data || json) as Record<string, unknown>;
      const userObj = (dataObj.user || dataObj) as Record<string, unknown>;

      if (!userObj || (!userObj.id && !userObj.username)) {
        throw new Error(`Instagram user profile not found or empty response for: ${target.query}`);
      }

      const profile = this.normalizeProfile(userObj);
      const posts = profile.recentPostsPreview || [];

      return {
        action: target.action,
        query: target.query,
        profile,
        posts: target.action === "recent_posts" ? posts : undefined,
        markdown: "",
        engineUsed: "http",
      };
    }

    // 2. Hashtag action
    if (target.action === "hashtag") {
      const dataObj = (json.data || json) as Record<string, unknown>;
      const tagObj = (dataObj.hashtag || dataObj.tag || json) as Record<string, unknown>;
      const hashtag = this.normalizeHashtag(tagObj, target.hashtag || target.query);

      return {
        action: "hashtag",
        query: target.query,
        hashtag,
        posts: [...hashtag.topPosts, ...hashtag.recentPosts],
        markdown: "",
        engineUsed: "http",
      };
    }

    // 3. Post / Reel action
    const dataObj = (json.data || json) as Record<string, unknown>;
    const dataItems = Array.isArray(dataObj.items)
      ? (dataObj.items as Array<Record<string, unknown>>)
      : undefined;
    const jsonItems = Array.isArray(json.items)
      ? (json.items as Array<Record<string, unknown>>)
      : undefined;
    const mediaObj = (dataObj.xdt_shortcode_media ||
      dataObj.shortcode_media ||
      dataItems?.[0] ||
      jsonItems?.[0] ||
      json) as Record<string, unknown>;

    if (!mediaObj) {
      throw new Error(`Instagram post or reel not found for shortcode: ${target.query}`);
    }

    const post = this.normalizeMedia(mediaObj);

    return {
      action: "post",
      query: target.query,
      posts: [post],
      markdown: "",
      engineUsed: "http",
    };
  }

  /**
   * Normalizes raw user profile payload into InstagramProfileRecord contract.
   */
  normalizeProfile(raw: Record<string, unknown>): InstagramProfileRecord {
    const username = String(raw.username || "");
    const fullName = String(raw.full_name || raw.name || username);
    const biography = String(raw.biography || raw.bio || "");
    const isVerified = Boolean(raw.is_verified);
    const isPrivate = Boolean(raw.is_private);

    // Follower counts
    const followerCount = Number(
      (raw.edge_followed_by as Record<string, unknown>)?.count ||
        raw.follower_count ||
        raw.followers ||
        0
    );

    const followingCount = Number(
      (raw.edge_follow as Record<string, unknown>)?.count ||
        raw.following_count ||
        raw.following ||
        0
    );

    // Timeline media preview
    const timelineObj = raw.edge_owner_to_timeline_media as Record<string, unknown> | undefined;
    const mediaCount = Number(timelineObj?.count || raw.media_count || 0);

    const rawEdges = Array.isArray(timelineObj?.edges) ? timelineObj.edges : [];
    const recentPostsPreview: InstagramMediaRecord[] = rawEdges.map(
      (edge: Record<string, unknown>) => {
        const node = (edge.node || edge) as Record<string, unknown>;
        return this.normalizeMedia(node);
      }
    );

    return {
      id: String(raw.id || username),
      username,
      fullName,
      biography,
      externalUrl: raw.external_url ? String(raw.external_url) : undefined,
      profilePicUrl: raw.profile_pic_url_hd
        ? String(raw.profile_pic_url_hd)
        : raw.profile_pic_url
          ? String(raw.profile_pic_url)
          : undefined,
      isVerified,
      isPrivate,
      followerCount,
      followingCount,
      mediaCount,
      recentPostsPreview,
    };
  }

  /**
   * Normalizes raw media node into InstagramMediaRecord contract.
   */
  normalizeMedia(raw: Record<string, unknown>): InstagramMediaRecord {
    const shortcode = String(raw.shortcode || raw.code || raw.id || "");
    const id = String(raw.id || shortcode);

    const typename = String(raw.__typename || "");
    let mediaType: InstagramMediaType = "image";
    if (raw.is_video || typename === "GraphVideo") {
      mediaType = "video";
    } else if (
      typename === "GraphSidecar" ||
      raw.edge_sidecar_to_children ||
      Array.isArray(raw.carousel_media)
    ) {
      mediaType = "carousel";
    }

    // Extract caption text
    let caption = "";
    const captionEdges = (raw.edge_media_to_caption as Record<string, unknown>)?.edges;
    if (Array.isArray(captionEdges) && captionEdges.length > 0) {
      const firstEdge = captionEdges[0] as Record<string, unknown> | undefined;
      const node = firstEdge?.node as Record<string, unknown> | undefined;
      caption = String(node?.text || "");
    } else if (raw.caption && typeof raw.caption === "object") {
      caption = String((raw.caption as Record<string, unknown>).text || "");
    } else if (typeof raw.caption === "string") {
      caption = raw.caption;
    }

    const likeCount = Number(
      (raw.edge_liked_by as Record<string, unknown>)?.count ||
        (raw.edge_media_preview_like as Record<string, unknown>)?.count ||
        raw.like_count ||
        0
    );

    const commentCount = Number(
      (raw.edge_media_to_comment as Record<string, unknown>)?.count || raw.comment_count || 0
    );

    const takenAtTimestamp = Number(raw.taken_at_timestamp || raw.taken_at || 0);
    const candidates = (raw.image_versions2 as Record<string, unknown> | undefined)?.candidates;
    const firstCandidateUrl =
      Array.isArray(candidates) && candidates.length > 0
        ? (candidates[0] as Record<string, unknown>)?.url
        : undefined;
    const displayUrl = String(raw.display_url || firstCandidateUrl || "");
    const videoUrl = raw.video_url ? String(raw.video_url) : undefined;
    const videoViewCount = raw.video_view_count ? Number(raw.video_view_count) : undefined;

    // Children (carousel items)
    let children: InstagramMediaChild[] | undefined;
    const sidecarEdges = (raw.edge_sidecar_to_children as Record<string, unknown>)?.edges;
    if (Array.isArray(sidecarEdges) && sidecarEdges.length > 0) {
      children = sidecarEdges.map((e: Record<string, unknown>, idx: number) => {
        const cNode = (e.node || e) as Record<string, unknown>;
        return {
          id: String(cNode.id || `${id}-${idx}`),
          mediaType: cNode.is_video ? "video" : "image",
          displayUrl: String(cNode.display_url || ""),
          videoUrl: cNode.video_url ? String(cNode.video_url) : undefined,
          dimensions:
            cNode.dimensions && typeof cNode.dimensions === "object"
              ? (cNode.dimensions as { width: number; height: number })
              : undefined,
        };
      });
    }

    // Owner info
    let owner: InstagramMediaRecord["owner"];
    const rawOwner = raw.owner as Record<string, unknown> | undefined;
    if (rawOwner && (rawOwner.username || rawOwner.id)) {
      owner = {
        id: String(rawOwner.id || ""),
        username: String(rawOwner.username || ""),
        fullName: rawOwner.full_name ? String(rawOwner.full_name) : undefined,
        isVerified: Boolean(rawOwner.is_verified),
        profilePicUrl: rawOwner.profile_pic_url ? String(rawOwner.profile_pic_url) : undefined,
      };
    }

    // Location
    let location: InstagramMediaRecord["location"];
    const rawLoc = raw.location as Record<string, unknown> | undefined;
    if (rawLoc?.name) {
      location = {
        id: String(rawLoc.id || ""),
        name: String(rawLoc.name),
        slug: rawLoc.slug ? String(rawLoc.slug) : undefined,
      };
    }

    // Comments
    let comments: InstagramCommentRecord[] | undefined;
    const commentEdges =
      (raw.edge_media_to_parent_comment as Record<string, unknown>)?.edges ||
      (raw.edge_media_to_comment as Record<string, unknown>)?.edges ||
      (Array.isArray(raw.comments) ? raw.comments : undefined) ||
      (Array.isArray(raw.preview_comments) ? raw.preview_comments : undefined);

    if (Array.isArray(commentEdges) && commentEdges.length > 0) {
      comments = commentEdges.map((e: Record<string, unknown>, idx: number) => {
        const cNode = (e.node || e) as Record<string, unknown>;
        const cOwner = (cNode.owner || cNode.user) as Record<string, unknown> | undefined;
        const likeObj = cNode.edge_liked_by as Record<string, unknown> | undefined;
        return {
          id: String(cNode.id || `c-${idx + 1}`),
          username: String(cOwner?.username || ""),
          text: String(cNode.text || ""),
          createdAtTimestamp: Number(cNode.created_at || cNode.created_at_utc || 0),
          likeCount: Number(likeObj?.count || cNode.comment_like_count || 0),
          authorProfilePicUrl: cOwner?.profile_pic_url ? String(cOwner.profile_pic_url) : undefined,
          authorIsVerified: Boolean(cOwner?.is_verified),
        };
      });
    }

    return {
      id,
      shortcode,
      url: `https://www.instagram.com/p/${shortcode}/`,
      mediaType,
      caption,
      likeCount,
      commentCount: commentCount || comments?.length || 0,
      takenAtTimestamp,
      displayUrl,
      videoUrl,
      videoViewCount,
      hashtags: this.extractHashtags(caption),
      mentions: this.extractMentions(caption),
      children,
      comments,
      location,
      owner,
    };
  }

  /**
   * Normalizes raw hashtag payload into InstagramHashtagRecord contract.
   */
  normalizeHashtag(raw: Record<string, unknown>, tagName: string): InstagramHashtagRecord {
    const name = String(raw.name || tagName).replace(/^#/, "");
    const mediaCount = Number(
      (raw.edge_hashtag_to_media as Record<string, unknown>)?.count || raw.media_count || 0
    );

    const topEdges = (raw.edge_hashtag_to_top_posts as Record<string, unknown>)?.edges || [];
    const recentEdges = (raw.edge_hashtag_to_media as Record<string, unknown>)?.edges || [];

    const topPosts = Array.isArray(topEdges)
      ? topEdges.map((e: Record<string, unknown>) =>
          this.normalizeMedia((e.node || e) as Record<string, unknown>)
        )
      : [];

    const recentPosts = Array.isArray(recentEdges)
      ? recentEdges.map((e: Record<string, unknown>) =>
          this.normalizeMedia((e.node || e) as Record<string, unknown>)
        )
      : [];

    return {
      name,
      mediaCount,
      topPosts,
      recentPosts,
    };
  }

  /**
   * Synthesizes clean GitHub Flavored Markdown from extraction output.
   */
  synthesizeMarkdown(result: InstagramActorResult): string {
    const lines: string[] = [];

    if (result.profile) {
      const p = result.profile;
      lines.push(`# Instagram Profile: @${p.username}`);
      lines.push("");
      lines.push(`**Full Name:** ${p.fullName}  `);
      lines.push(
        `**Followers:** ${p.followerCount.toLocaleString()} | **Following:** ${p.followingCount.toLocaleString()} | **Total Posts:** ${p.mediaCount.toLocaleString()}  `
      );
      lines.push(
        `**Verified:** ${p.isVerified ? "Yes" : "No"} | **Private:** ${p.isPrivate ? "Yes" : "No"}  `
      );
      if (p.externalUrl) {
        lines.push(`**Website:** [${p.externalUrl}](${p.externalUrl})  `);
      }
      lines.push("");
      lines.push("### Biography");
      lines.push(p.biography ? p.biography : "*(No biography provided)*");
      lines.push("");

      if (p.recentPostsPreview && p.recentPostsPreview.length > 0) {
        lines.push("### Recent Media Timeline");
        lines.push("");
        lines.push("| Shortcode | Type | Likes | Comments | Date | Caption Preview |");
        lines.push("|---|---|---|---|---|---|");
        for (const post of p.recentPostsPreview) {
          const dateStr = post.takenAtTimestamp
            ? new Date(post.takenAtTimestamp * 1000).toISOString().split("T")[0]
            : "N/A";
          const snippet = post.caption.replace(/[\r\n]+/g, " ").slice(0, 60);
          lines.push(
            `| [${post.shortcode}](${post.url}) | \`${post.mediaType}\` | ${post.likeCount} | ${post.commentCount} | ${dateStr} | ${snippet}${post.caption.length > 60 ? "..." : ""} |`
          );
        }
        lines.push("");
      }
    }

    if (result.posts && result.posts.length > 0 && result.action !== "profile") {
      lines.push(`# Instagram Media Posts (${result.posts.length} Items)`);
      lines.push("");
      for (const post of result.posts) {
        lines.push(`## Post: ${post.shortcode} (\`${post.mediaType}\`)`);
        lines.push(`- **URL:** [${post.url}](${post.url})`);
        lines.push(
          `- **Likes:** ${post.likeCount.toLocaleString()} | **Comments:** ${post.commentCount.toLocaleString()}`
        );
        if (post.takenAtTimestamp) {
          lines.push(`- **Published:** ${new Date(post.takenAtTimestamp * 1000).toISOString()}`);
        }
        if (post.location) {
          lines.push(`- **Location:** ${post.location.name}`);
        }
        if (post.hashtags.length > 0) {
          lines.push(`- **Tags:** ${post.hashtags.map((h) => `#${h}`).join(", ")}`);
        }
        if (post.videoUrl) {
          lines.push(`- **Video URL:** [Direct Stream](${post.videoUrl})`);
        }
        lines.push("");
        lines.push("### Caption");
        lines.push(post.caption ? post.caption : "*(No caption)*");
        lines.push("");

        if (post.children && post.children.length > 0) {
          lines.push("### Carousel Slides");
          lines.push("| # | Type | Media Display Link |");
          lines.push("|---|---|---|");
          post.children.forEach((c, idx) => {
            lines.push(`| ${idx + 1} | \`${c.mediaType}\` | [View Image/Video](${c.displayUrl}) |`);
          });
          lines.push("");
        }

        if (post.comments && post.comments.length > 0) {
          lines.push(`### User Comments (${post.comments.length} Items)`);
          lines.push("| User | Likes | Date | Comment Text |");
          lines.push("|---|---|---|---|");
          for (const c of post.comments) {
            const dateStr = c.createdAtTimestamp
              ? new Date(c.createdAtTimestamp * 1000).toISOString().split("T")[0]
              : "N/A";
            const snippet = c.text.replace(/[\r\n]+/g, " ");
            lines.push(
              `| [@${c.username}](https://www.instagram.com/${c.username}/) | ${c.likeCount || 0} | ${dateStr} | ${snippet} |`
            );
          }
          lines.push("");
        }
      }
    }

    if (result.hashtag) {
      const h = result.hashtag;
      lines.push(`# Instagram Hashtag: #${h.name}`);
      lines.push(`**Total Public Posts:** ${h.mediaCount.toLocaleString()}`);
      lines.push("");
      if (h.topPosts.length > 0) {
        lines.push(`### Top Posts (${h.topPosts.length})`);
        lines.push("| Shortcode | Type | Likes | Comments | Caption Preview |");
        lines.push("|---|---|---|---|---|");
        for (const post of h.topPosts) {
          const snippet = post.caption.replace(/[\r\n]+/g, " ").slice(0, 50);
          lines.push(
            `| [${post.shortcode}](${post.url}) | \`${post.mediaType}\` | ${post.likeCount} | ${post.commentCount} | ${snippet} |`
          );
        }
        lines.push("");
      }
    }

    return lines.join("\n").trim();
  }

  /**
   * Helper constructing API query endpoint URL.
   */
  private buildApiEndpoint(target: TargetResolution): string {
    if (target.directUrl) {
      return target.directUrl;
    }
    if (target.action === "post") {
      return `https://www.instagram.com/p/${encodeURIComponent(target.shortcode || target.query)}/?__a=1&__d=dis`;
    }
    if (target.action === "hashtag") {
      return `https://www.instagram.com/api/v1/tags/web_info/?tag_name=${encodeURIComponent(target.hashtag || target.query)}`;
    }
    const cleanUser = encodeURIComponent(target.username || target.query);
    return `https://www.instagram.com/api/v1/users/web_profile_info/?username=${cleanUser}`;
  }

  /**
   * Helper constructing direct browser navigation web URL.
   */
  private buildWebUrl(target: TargetResolution): string {
    if (target.directUrl) {
      return target.directUrl;
    }
    if (target.action === "post") {
      return `https://www.instagram.com/p/${encodeURIComponent(target.shortcode || target.query)}/`;
    }
    if (target.action === "hashtag") {
      return `https://www.instagram.com/explore/tags/${encodeURIComponent(target.hashtag || target.query)}/`;
    }
    return `https://www.instagram.com/${encodeURIComponent(target.username || target.query)}/`;
  }

  /**
   * Serializes session cookies for standard Cookie HTTP header.
   */
  private buildCookieHeader(options: InstagramActorTaskOptions): string | undefined {
    const cookies: string[] = [];
    if (options.sessionCookies && Array.isArray(options.sessionCookies)) {
      for (const c of options.sessionCookies) {
        if (c.name && c.value) {
          cookies.push(`${c.name}=${c.value}`);
        }
      }
    }
    const envSessionId = process.env.INSTAGRAM_SESSION_ID;
    if (envSessionId && !cookies.some((c) => c.startsWith("sessionid="))) {
      cookies.push(`sessionid=${envSessionId}`);
    }
    return cookies.length > 0 ? cookies.join("; ") : undefined;
  }

  /**
   * Parses follower, following, and post counts from standard OpenGraph description string.
   * e.g. "1.2M Followers, 500 Following, 342 Posts - See Instagram photos and videos from..."
   */
  private parseProfileStatsFromDescription(desc: string): {
    followers: number;
    following: number;
    posts: number;
  } {
    const res = { followers: 0, following: 0, posts: 0 };
    if (!desc) return res;

    const followerMatch = desc.match(/([\d.,kKmMBb]+)\s+Followers/i);
    const followingMatch = desc.match(/([\d.,kKmMBb]+)\s+Following/i);
    const postMatch = desc.match(/([\d.,kKmMBb]+)\s+Posts/i);

    if (followerMatch) res.followers = this.parseNumericKmb(followerMatch[1]);
    if (followingMatch) res.following = this.parseNumericKmb(followingMatch[1]);
    if (postMatch) res.posts = this.parseNumericKmb(postMatch[1]);

    return res;
  }

  /**
   * Converts compact numerical strings (e.g. 1.2M, 45K) to raw integer numbers.
   */
  private parseNumericKmb(val: string): number {
    const cleaned = val.replace(/,/g, "").trim().toLowerCase();
    if (cleaned.endsWith("m")) {
      return Math.round(parseFloat(cleaned.slice(0, -1)) * 1_000_000);
    }
    if (cleaned.endsWith("k")) {
      return Math.round(parseFloat(cleaned.slice(0, -1)) * 1_000);
    }
    if (cleaned.endsWith("b")) {
      return Math.round(parseFloat(cleaned.slice(0, -1)) * 1_000_000_000);
    }
    const parsed = parseInt(cleaned, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Extracts hashtag keywords from text body.
   */
  private extractHashtags(text: string): string[] {
    const matches = text.match(/#([a-zA-Z0-9_\u00c0-\u024f]+)/g);
    if (!matches) return [];
    return Array.from(new Set(matches.map((m) => m.slice(1))));
  }

  /**
   * Extracts user mention handles from text body.
   */
  private extractMentions(text: string): string[] {
    const matches = text.match(/@([a-zA-Z0-9_.]+)/g);
    if (!matches) return [];
    return Array.from(new Set(matches.map((m) => m.slice(1))));
  }
}
