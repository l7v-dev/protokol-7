/**
 * YouTube Transcripts & Captions Harvester Actor — protokol-7
 *
 * Extracts structured captions, transcripts, and metadata from public YouTube
 * videos and Shorts. Supports multiple output formats (captions, textWithTimestamps,
 * singleStringText, xml), optional video metadata toggles, and LLM text cleaning.
 * Employs a dual-engine architecture: fast HTTP extraction with automatic
 * Playwright Chromium fallback for Proof-of-Origin (PO-Token) gating defense.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  YoutubeTranscriptOutputFormat,
  YoutubeTranscriptRecord,
  YoutubeTranscriptSegment,
  YoutubeTranscriptsActorResult,
  YoutubeTranscriptsActorTaskOptions,
} from "../../api/types";
import { BrowserPool, type PooledBrowserSession } from "../../browser/browser-pool";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class YoutubeTranscriptsActor implements IActor<YoutubeTranscriptsActorResult> {
  readonly actorType = "youtube-transcripts" as const;
  readonly description =
    "Extracts captions, timestamped transcripts, and video metadata from YouTube videos and Shorts with LLM cleaning.";

  async run(
    task: ActorTask,
    context?: ActorRunContext
  ): Promise<ActorResult<YoutubeTranscriptsActorResult>> {
    const startTime = context?.startTime || Date.now();
    const taskOpts = task.options || {};
    const options = (taskOpts.youtubeTranscriptsOptions ||
      taskOpts) as YoutubeTranscriptsActorTaskOptions;
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork =
      process.env.NODE_ENV === "test" ||
      Boolean((task.options as Record<string, unknown> | undefined)?.allowLocalNetwork);

    // 1. Resolve target video URLs or IDs
    const urlList: string[] = [];
    if (options.urls && Array.isArray(options.urls) && options.urls.length > 0) {
      urlList.push(...options.urls);
    } else if (options.videoId) {
      urlList.push(options.videoId);
    } else if (task.targetUrl) {
      urlList.push(task.targetUrl);
    }

    if (urlList.length === 0) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 400,
        errorMessage: "No target URLs or video IDs provided for YouTube transcript extraction.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    const outputFormat = options.outputFormat || "captions";
    const cleanText = options.cleanText !== false; // Default true for LLM dataset cleanliness
    const preferredLang = options.languageCode || "en";
    const records: YoutubeTranscriptRecord[] = [];

    let successfulCount = 0;
    let failedCount = 0;

    // 2. Process each URL/video ID
    for (const rawUrl of urlList) {
      const videoId = this.extractVideoId(rawUrl);
      if (!videoId) {
        records.push({
          videoId: rawUrl,
          title: "Unknown",
          captions: null,
          status: "failed",
          reason: "Invalid YouTube URL or unrecognizable video ID.",
          transcriptFound: false,
        });
        failedCount++;
        continue;
      }

      let watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
        try {
          const parsed = new URL(rawUrl);
          if (!parsed.hostname.includes("youtube.com") && !parsed.hostname.includes("youtu.be")) {
            watchUrl = rawUrl;
          } else if (parsed.pathname === "/watch" && parsed.searchParams.has("v")) {
            watchUrl = rawUrl;
          }
        } catch {
          // ignore
        }
      }

      // SSRF validation
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(watchUrl, { allowLocalNetwork });
      if (!ssrfCheck.valid) {
        records.push({
          videoId,
          title: "Blocked",
          captions: null,
          status: "failed",
          reason: `SSRF validation failed: ${ssrfCheck.reason}`,
          transcriptFound: false,
        });
        failedCount++;
        continue;
      }

      try {
        const record = await this.extractSingleVideo(
          videoId,
          watchUrl,
          options,
          outputFormat,
          cleanText,
          preferredLang,
          timeoutMs,
          allowLocalNetwork
        );
        records.push(record);
        if (record.status === "completed" && record.transcriptFound) {
          successfulCount++;
        } else {
          failedCount++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        records.push({
          videoId,
          title: "Error",
          captions: null,
          status: "failed",
          reason: errMsg,
          transcriptFound: false,
        });
        failedCount++;
      }
    }

    const markdown = this.renderMarkdownSummary(records, outputFormat);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: successfulCount > 0 || failedCount === 0 ? "completed" : "failed",
      statusCode: successfulCount > 0 ? 200 : 404,
      data: {
        totalProcessed: records.length,
        successfulCount,
        failedCount,
        records,
        queryUrl: records[0]?.videoId
          ? `https://www.youtube.com/watch?v=${records[0].videoId}`
          : task.targetUrl,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Extracts transcript and metadata for a single video using HTTP first, then Playwright fallback.
   */
  private async extractSingleVideo(
    videoId: string,
    watchUrl: string,
    options: YoutubeTranscriptsActorTaskOptions,
    outputFormat: YoutubeTranscriptOutputFormat,
    cleanText: boolean,
    preferredLang: string,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<YoutubeTranscriptRecord> {
    // Test isolation / fixture intercept
    if (process.env.NODE_ENV === "test" && (options as Record<string, unknown>).__mockRecord) {
      return (options as Record<string, unknown>).__mockRecord as YoutubeTranscriptRecord;
    }

    // Engine A: Fast HTTP fetch of watch page
    let playerResponse: Record<string, unknown> | null = null;
    let initialHtml = "";

    try {
      const response = await safeRedirectFetch(watchUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeoutMs,
        allowLocalNetwork,
      });

      if (response.ok) {
        initialHtml = await response.text();
        playerResponse = this.extractPlayerResponse(initialHtml);
      }
    } catch {
      // Continue to fallback if HTTP fails
    }

    // Extract metadata from playerResponse if present
    const videoDetails =
      playerResponse && typeof playerResponse.videoDetails === "object"
        ? (playerResponse.videoDetails as Record<string, unknown>)
        : null;

    const microformat =
      playerResponse && typeof playerResponse.microformat === "object"
        ? (playerResponse.microformat as Record<string, unknown>)
        : null;

    const playerMicroformat =
      microformat && typeof microformat.playerMicroformatRenderer === "object"
        ? (microformat.playerMicroformatRenderer as Record<string, unknown>)
        : null;

    const title = String(videoDetails?.title || `YouTube Video ${videoId}`);
    const channelName = options.channelNameBoolean
      ? String(videoDetails?.author || playerMicroformat?.ownerChannelName || "") || null
      : undefined;
    const channelID = options.channelIDBoolean
      ? String(videoDetails?.channelId || playerMicroformat?.externalChannelId || "") || null
      : undefined;
    const datePublished = options.datePublishedBoolean
      ? String(playerMicroformat?.publishDate || playerMicroformat?.uploadDate || "") || null
      : undefined;
    const dateText = options.dateTextBoolean
      ? String(playerMicroformat?.publishDate || "").split("T")[0] || null
      : undefined;
    const viewCount = options.viewCountBoolean
      ? `${Number(videoDetails?.viewCount || playerMicroformat?.viewCount || 0).toLocaleString()} views`
      : undefined;
    const keywords = options.keywordsBoolean
      ? Array.isArray(videoDetails?.keywords)
        ? (videoDetails.keywords as string[]).join(", ")
        : null
      : undefined;
    const thumbnailUrl = options.thumbnailBoolean
      ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      : undefined;
    const description = options.descriptionBoolean
      ? String(
          videoDetails?.shortDescription ||
            (playerMicroformat?.description as Record<string, unknown> | undefined)?.simpleText ||
            ""
        )
      : undefined;

    // Check caption tracks
    const captionsObj =
      playerResponse && typeof playerResponse.captions === "object"
        ? (playerResponse.captions as Record<string, unknown>)
        : null;
    const tracklistRenderer =
      captionsObj && typeof captionsObj.playerCaptionsTracklistRenderer === "object"
        ? (captionsObj.playerCaptionsTracklistRenderer as Record<string, unknown>)
        : null;
    const captionTracks = Array.isArray(tracklistRenderer?.captionTracks)
      ? (tracklistRenderer?.captionTracks as Array<Record<string, unknown>>)
      : [];

    let rawSegments: YoutubeTranscriptSegment[] = [];
    let processedBy: "http-innertube" | "playwright-browser" = "http-innertube";
    let timedTextRawXml = "";

    // Try fetching timedtext directly if track is available
    if (captionTracks.length > 0 && !options.preferBrowser) {
      const chosenTrack =
        captionTracks.find(
          (t) =>
            typeof t.languageCode === "string" &&
            t.languageCode.toLowerCase().startsWith(preferredLang.toLowerCase())
        ) || captionTracks[0];

      const rawBaseUrl = String(chosenTrack.baseUrl || "");
      if (rawBaseUrl) {
        const fullBaseUrl = rawBaseUrl.startsWith("http")
          ? rawBaseUrl
          : `https://www.youtube.com${rawBaseUrl}`;

        // Validate timedtext endpoint against SSRF
        const timedCheck = await SSRFGuard.validateUrlWithDns(fullBaseUrl, { allowLocalNetwork });
        if (timedCheck.valid) {
          try {
            const timedRes = await safeRedirectFetch(fullBaseUrl, {
              headers: {
                "User-Agent": USER_AGENT,
                Referer: watchUrl,
              },
              timeoutMs: Math.min(timeoutMs, 10_000),
              allowLocalNetwork,
            });

            if (timedRes.ok) {
              const body = await timedRes.text();
              if (body && body.length > 0 && body.includes("<text")) {
                timedTextRawXml = body;
                rawSegments = this.parseTimedTextXml(body);
              }
            }
          } catch {
            // Will fallback to browser
          }
        }
      }
    }

    // Engine B: Playwright Chromium Fallback (when timedtext is empty, PO-token required, or preferBrowser requested)
    if (rawSegments.length === 0) {
      const browserResult = await this.extractViaBrowser(
        videoId,
        watchUrl,
        timeoutMs,
        allowLocalNetwork,
        options
      );
      if (browserResult && browserResult.segments.length > 0) {
        rawSegments = browserResult.segments;
        processedBy = "playwright-browser";
        timedTextRawXml = browserResult.rawXml || "";
      }
    }

    // Check if transcript was successfully located
    if (rawSegments.length === 0) {
      return {
        videoId,
        title,
        captions: null,
        channelName,
        channelID,
        datePublished,
        dateText,
        viewCount,
        keywords,
        thumbnailUrl,
        description,
        status: "failed",
        reason: "No available captions found or closed captions are disabled for this video.",
        processedBy,
        transcriptFound: false,
      };
    }

    // Apply text cleaning if requested
    const processedSegments = cleanText
      ? rawSegments
          .map((s) => ({
            start: s.start,
            end: s.end,
            text: this.cleanSegmentText(s.text),
          }))
          .filter((s) => s.text.length > 0)
      : rawSegments;

    // Format output
    let finalCaptions: string[] | YoutubeTranscriptSegment[] | string | null = null;

    switch (outputFormat) {
      case "captions":
        finalCaptions = processedSegments.map((s) => s.text);
        break;
      case "textWithTimestamps":
        finalCaptions = processedSegments;
        break;
      case "singleStringText":
        finalCaptions = processedSegments.map((s) => s.text).join(" ");
        break;
      case "xmlWithoutTimestamps":
        finalCaptions = `<transcript>\n${processedSegments
          .map((s) => `  <text>${this.escapeXml(s.text)}</text>`)
          .join("\n")}\n</transcript>`;
        break;
      case "xmlWithTimestamps":
        finalCaptions =
          timedTextRawXml ||
          `<transcript>\n${processedSegments
            .map(
              (s) =>
                `  <text start="${s.start}" dur="${Math.max(0, s.end - s.start)}">${this.escapeXml(s.text)}</text>`
            )
            .join("\n")}\n</transcript>`;
        break;
      default:
        finalCaptions = processedSegments.map((s) => s.text);
    }

    return {
      videoId,
      title,
      captions: finalCaptions,
      channelName,
      channelID,
      datePublished,
      dateText,
      viewCount,
      keywords,
      thumbnailUrl,
      description,
      status: "completed",
      processedBy,
      transcriptFound: true,
    };
  }

  /**
   * Browser-based extraction fallback using Playwright and BrowserPool.
   */
  private async extractViaBrowser(
    _videoId: string,
    watchUrl: string,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    options: YoutubeTranscriptsActorTaskOptions
  ): Promise<{ segments: YoutubeTranscriptSegment[]; rawXml?: string } | null> {
    let session: PooledBrowserSession | undefined;

    try {
      session = await BrowserPool.acquireSession({
        timeoutMs,
        blockAssets: true,
        allowLocalNetwork,
        proxy: options.proxy,
      });

      const page = session.page;
      let interceptedXml = "";
      let interceptedSegments: YoutubeTranscriptSegment[] = [];

      // Intercept network responses for timedtext
      page.on("response", async (res) => {
        const url = res.url();
        if (url.includes("/api/timedtext") && res.ok()) {
          try {
            const text = await res.text();
            if (text?.includes("<text")) {
              interceptedXml = text;
              interceptedSegments = this.parseTimedTextXml(text);
            }
          } catch {
            // Ignore response read errors
          }
        }
      });

      await page.goto(watchUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });

      // Dismiss cookie consent if shown
      try {
        const consentBtn = await page.$(
          'button[aria-label*="Accept"], button[aria-label*="agree"], button[aria-label*="Kabul"]'
        );
        if (consentBtn) {
          await consentBtn.click();
          await page.waitForTimeout(500);
        }
      } catch {
        // Non-blocking
      }

      // Check if network interception already captured the transcript
      if (interceptedSegments.length > 0) {
        return { segments: interceptedSegments, rawXml: interceptedXml };
      }

      // Try expanding description to trigger transcript button
      try {
        const expandBtn = await page.$("#expand, ytd-text-inline-expander #expand");
        if (expandBtn) {
          await expandBtn.click();
          await page.waitForTimeout(400);
        }

        const showTranscriptBtn = await page.$(
          'ytd-video-description-transcript-section-renderer button, button[aria-label*="transcript" i], button[aria-label*="metni" i]'
        );
        if (showTranscriptBtn) {
          await showTranscriptBtn.click();
          await page.waitForTimeout(1500);
        }
      } catch {
        // Non-blocking
      }

      // If intercepted via network
      if (interceptedSegments.length > 0) {
        return { segments: interceptedSegments, rawXml: interceptedXml };
      }

      // Scrape segments from DOM if rendered
      const domSegments = await page
        .$$eval("ytd-transcript-segment-renderer", (elements) => {
          return elements.map((el) => {
            const timeText =
              el.querySelector(".segment-timestamp, [class*='timestamp']")?.textContent?.trim() ||
              "0:00";
            const textContent =
              el.querySelector(".segment-text, [class*='segment-text']")?.textContent?.trim() || "";

            // Convert MM:SS or HH:MM:SS to seconds
            const parts = timeText.split(":").map(Number);
            let seconds = 0;
            if (parts.length === 2) {
              seconds = (parts[0] || 0) * 60 + (parts[1] || 0);
            } else if (parts.length === 3) {
              seconds = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
            }

            return {
              start: seconds,
              end: seconds + 2,
              text: textContent,
            };
          });
        })
        .catch(() => []);

      if (domSegments && domSegments.length > 0) {
        return { segments: domSegments };
      }

      return null;
    } catch {
      return null;
    } finally {
      if (session) {
        await session.release().catch(() => {});
      }
    }
  }

  /**
   * Parses standard YouTube timedtext XML format.
   */
  public parseTimedTextXml(xml: string): YoutubeTranscriptSegment[] {
    const segments: YoutubeTranscriptSegment[] = [];
    const regex = /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/gi;
    let match: RegExpExecArray | null = regex.exec(xml);

    while (match !== null) {
      const start = Number.parseFloat(match[1]);
      const duration = match[2] ? Number.parseFloat(match[2]) : 0;
      const end = Math.round((start + duration) * 100) / 100;
      const rawText = match[3] || "";
      segments.push({
        start: Math.round(start * 100) / 100,
        end,
        text: this.unescapeHtml(rawText),
      });
      match = regex.exec(xml);
    }

    return segments;
  }

  /**
   * Sanitizes transcript text by stripping acoustic labels, speaker marks, and noise tokens.
   */
  public cleanSegmentText(text: string): string {
    if (!text) return "";

    let cleaned = this.unescapeHtml(text);

    // Strip auditory markers: [Music], [Müzik], [Applause], [Alkış], [Laughter], [Gülüşmeler], (music), ♪, ♫
    cleaned = cleaned.replace(
      /\[\s*(?:music|müzik|applause|alkış|laughter|gülüşmeler|çalan müzik|kahkaha|cheering|cough|sigh|sound effect|inaudible)[^\]]*\]/gi,
      ""
    );
    cleaned = cleaned.replace(
      /\(\s*(?:music|müzik|applause|alkış|laughter|gülüşmeler)[^)]*\)/gi,
      ""
    );
    cleaned = cleaned.replace(/[♪♫#]/g, "");

    // Strip leading speaker prompts: ">>" or "SPEAKER 1:"
    cleaned = cleaned.replace(/^>>\s*/g, "");
    cleaned = cleaned.replace(/^[A-Z0-9_\s]{2,15}:\s*/, "");

    // Collapse whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    return cleaned;
  }

  /**
   * Normalizes URLs and extracts the 11-character YouTube video ID.
   */
  public extractVideoId(input: string): string | null {
    if (!input || typeof input !== "string") return null;
    const trimmed = input.trim();

    // Direct 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }

    try {
      const parsedUrl = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      const host = parsedUrl.hostname.toLowerCase();

      // youtu.be/ID
      if (host.includes("youtu.be")) {
        const id = parsedUrl.pathname.slice(1).split("/")[0].split("?")[0];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }

      // watch?v=ID (supports youtube.com and test/mock servers)
      if (parsedUrl.searchParams.has("v")) {
        const id = parsedUrl.searchParams.get("v") || "";
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }

      // /shorts/ID
      if (parsedUrl.pathname.includes("/shorts/")) {
        const id = parsedUrl.pathname.split("/shorts/")[1].split("/")[0].split("?")[0];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }

      // /embed/ID
      if (parsedUrl.pathname.includes("/embed/")) {
        const id = parsedUrl.pathname.split("/embed/")[1].split("/")[0].split("?")[0];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    } catch {
      // Ignore URL parse error and proceed to fallback
    }

    // Fallback regex scan
    const idMatch = trimmed.match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (idMatch?.[1]) {
      return idMatch[1];
    }

    return null;
  }

  /**
   * Safely extracts ytInitialPlayerResponse JSON from watch page HTML.
   */
  private extractPlayerResponse(html: string): Record<string, unknown> | null {
    try {
      const match =
        html.match(/ytInitialPlayerResponse\s*=\s*({.+?});(?:\s*var\s|\s*<\/script>)/s) ||
        html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
      if (match?.[1]) {
        return JSON.parse(match[1]);
      }
    } catch {
      // JSON parse error
    }
    return null;
  }

  private unescapeHtml(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/'/g, "&apos;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Renders human-readable and LLM-friendly GFM Markdown table and transcript text.
   */
  private renderMarkdownSummary(
    records: YoutubeTranscriptRecord[],
    format: YoutubeTranscriptOutputFormat
  ): string {
    const lines: string[] = [];
    lines.push("# YouTube Transcripts Harvester Report");
    lines.push("");
    lines.push(`- **Total Videos:** ${records.length}`);
    lines.push(
      `- **Successful:** ${records.filter((r) => r.status === "completed" && r.transcriptFound).length}`
    );
    lines.push(`- **Failed / No Captions:** ${records.filter((r) => !r.transcriptFound).length}`);
    lines.push(`- **Selected Format:** \`${format}\``);
    lines.push("");
    lines.push("## Video Inventory");
    lines.push("");
    lines.push("| Video ID | Title | Channel | Published | Status | Captions Found |");
    lines.push("|---|---|---|---|---|---|");

    for (const r of records) {
      const statusBadge = r.status === "completed" ? "OK" : "FAILED";
      const foundBadge = r.transcriptFound ? "YES" : "NO";
      lines.push(
        `| [${r.videoId}](https://www.youtube.com/watch?v=${r.videoId}) | ${r.title.slice(0, 40)} | ${r.channelName || "N/A"} | ${r.dateText || "N/A"} | ${statusBadge} | ${foundBadge} |`
      );
    }

    lines.push("");
    lines.push("## Transcripts Content");
    lines.push("");

    for (const r of records) {
      lines.push(`### [${r.videoId}] ${r.title}`);
      if (r.channelName) lines.push(`- **Channel:** ${r.channelName}`);
      if (r.viewCount) lines.push(`- **Views:** ${r.viewCount}`);
      if (r.keywords) lines.push(`- **Keywords:** ${r.keywords}`);
      lines.push("");

      if (!r.transcriptFound || !r.captions) {
        lines.push(`> Reason: ${r.reason || "No captions available"}`);
        lines.push("");
        continue;
      }

      if (Array.isArray(r.captions)) {
        if (typeof r.captions[0] === "string") {
          lines.push("```text");
          for (const line of r.captions as string[]) {
            lines.push(line);
          }
          lines.push("```");
        } else {
          // Timestamped objects
          lines.push("| Start (s) | End (s) | Segment Text |");
          lines.push("|---|---|---|");
          for (const seg of r.captions as YoutubeTranscriptSegment[]) {
            lines.push(`| ${seg.start} | ${seg.end} | ${seg.text} |`);
          }
        }
      } else {
        lines.push(r.captions);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}
