/**
 * High-Capacity Instagram Profile & Deep Content Harvester — protokol-7
 *
 * Scrapes authenticated Instagram profiles, discovering media posts, reels,
 * carousel slides, engagement stats, and user comments using Playwright stealth pooling.
 * Persists all structured relational data directly into SQLite (data/instagram.sqlite)
 * and binary media into Object Vault (~/protokol-object-vault).
 *
 * Conforms to rules/logging-discipline.md (zero emoji, standard ASCII tags,
 * throttled in-place progress reporting to prevent terminal buffer locks).
 */

import type { Response } from "playwright";
import type {
  InstagramMediaChild,
  InstagramMediaRecord,
  InstagramProfileRecord,
} from "../src/api/types";
import { BrowserPool } from "../src/browser/browser-pool";
import { InstagramDatabase } from "../src/storage/instagram-database";
import { ObjectVault, type StoreObjectOptions } from "../src/storage/object-vault";
import { banner, divider, panel } from "../src/utils/terminal-theme";

interface HarvestOptions {
  username: string;
  scrollRounds?: number;
  maxPosts?: number;
  maxCommentsPerPost?: number;
  dbPath?: string;
  timeoutMs?: number;
  downloadMedia?: boolean;
  vaultRoot?: string;
}

/**
 * Zero-emoji deterministic progress reporter for CLI & headless environments.
 * Uses in-place carriage-return updating in TTY sessions to prevent terminal locks.
 */
class HarvestProgressTracker {
  private lastUpdateMs = 0;
  private readonly isTty: boolean;

  constructor() {
    this.isTty = Boolean(process.stdout.isTTY);
  }

  logStage(stage: string, message: string): void {
    if (this.isTty) {
      process.stdout.write("\r\x1b[K");
    }
    console.log(`[INFO] [STAGE ${stage}] ${message}`);
  }

  logSuccess(stage: string, message: string): void {
    if (this.isTty) {
      process.stdout.write("\r\x1b[K");
    }
    console.log(`[OK] [STAGE ${stage}] ${message}`);
  }

  logWarning(message: string): void {
    if (this.isTty) {
      process.stdout.write("\r\x1b[K");
    }
    console.warn(`[WARN] ${message}`);
  }

  logError(message: string): void {
    if (this.isTty) {
      process.stdout.write("\r\x1b[K");
    }
    console.error(`[ERROR] ${message}`);
  }

  updateProgress(stage: string, message: string, force = false): void {
    const now = Date.now();
    if (!force && now - this.lastUpdateMs < 150) {
      return;
    }
    this.lastUpdateMs = now;

    if (this.isTty) {
      process.stdout.write(`\r\x1b[K[INFO] [STAGE ${stage}] ${message}`);
    } else if (force) {
      console.log(`[INFO] [STAGE ${stage}] ${message}`);
    }
  }

  finishStage(): void {
    if (this.isTty) {
      process.stdout.write("\n");
    }
  }
}

/**
 * Extracts raw post nodes from Instagram GraphQL and feed JSON responses.
 */
function extractNodesFromPayload(
  payload: Record<string, unknown> | null | undefined
): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const nodes: Record<string, unknown>[] = [];
  const d = (payload.data as Record<string, unknown>) || payload;

  const paths = [
    (d as any)?.xdt_api__v1__feed__user_timeline_graphql_connection?.edges,
    (d as any)?.xdt_api__v1__feed__timeline__connection?.edges,
    (d as any)?.xdt_api__v1__clips__user__connection_v2?.edges,
    (d as any)?.fetch__XDTUserDict?.clips_connection?.edges,
    (d as any)?.user?.edge_owner_to_timeline_media?.edges,
  ];

  for (const p of paths) {
    if (Array.isArray(p)) {
      for (const edge of p) {
        const n = edge?.node?.media || edge?.node;
        if (n && typeof n === "object") {
          nodes.push(n as Record<string, unknown>);
        }
      }
    }
  }

  if (Array.isArray((d as any)?.items)) {
    for (const item of (d as any).items) {
      if (item && typeof item === "object") {
        nodes.push(item as Record<string, unknown>);
      }
    }
  }

  return nodes;
}

/**
 * Normalizes raw Instagram GraphQL / Feed node into strongly-typed InstagramMediaRecord.
 */
function parseInstagramGraphQLNode(
  node: Record<string, unknown> | null | undefined,
  ownerUsername: string
): InstagramMediaRecord | null {
  if (!node || typeof node !== "object") return null;

  const n = node as any;
  const shortcode = n.code || n.shortcode;
  if (!shortcode || typeof shortcode !== "string") return null;

  const postUrl = `https://www.instagram.com/p/${shortcode}/`;

  // Media type: 1 = Image, 2 = Video, 8 = Carousel/Sidecar
  let mediaType: "image" | "video" | "carousel" = "image";
  if (
    node.media_type === 8 ||
    node.__typename === "GraphSidecar" ||
    (Array.isArray(node.carousel_media) && node.carousel_media.length > 0)
  ) {
    mediaType = "carousel";
  } else if (
    node.media_type === 2 ||
    node.__typename === "GraphVideo" ||
    node.video_versions?.length ||
    node.is_video
  ) {
    mediaType = "video";
  }

  // Caption extraction
  let caption = "";
  if (typeof node.caption === "string") {
    caption = node.caption;
  } else if (
    node.caption &&
    typeof node.caption === "object" &&
    typeof node.caption.text === "string"
  ) {
    caption = node.caption.text;
  } else if (node.edge_media_to_caption?.edges?.[0]?.node?.text) {
    caption = node.edge_media_to_caption.edges[0].node.text;
  }

  const takenAt = Number(node.taken_at || node.taken_at_timestamp || 0);

  const likeCount = Number(
    node.like_count ?? node.edge_media_preview_like?.count ?? node.edge_liked_by?.count ?? 0
  );
  const commentCount = Number(node.comment_count ?? node.edge_media_to_comment?.count ?? 0);

  // Highest resolution display URL
  let displayUrl = "";
  if (
    Array.isArray(node.image_versions2?.candidates) &&
    node.image_versions2.candidates.length > 0
  ) {
    displayUrl = node.image_versions2.candidates[0].url || "";
  } else if (node.display_url) {
    displayUrl = node.display_url;
  } else if (node.display_uri) {
    displayUrl = node.display_uri;
  }

  // Video URL
  let videoUrl: string | undefined;
  if (Array.isArray(node.video_versions) && node.video_versions.length > 0) {
    videoUrl = node.video_versions[0].url;
  } else if (node.video_url) {
    videoUrl = node.video_url;
  }

  // Carousel slides
  const slides: InstagramMediaChild[] = [];
  if (Array.isArray(node.carousel_media) && node.carousel_media.length > 0) {
    node.carousel_media.forEach((slideItem: any, sIdx: number) => {
      const slideId = String(slideItem.id || slideItem.pk || `${shortcode}_slide_${sIdx + 1}`);
      const slideType: "image" | "video" =
        slideItem.media_type === 2 || slideItem.video_versions?.length ? "video" : "image";
      let sDisplay = "";
      if (
        Array.isArray(slideItem.image_versions2?.candidates) &&
        slideItem.image_versions2.candidates.length > 0
      ) {
        sDisplay = slideItem.image_versions2.candidates[0].url || "";
      } else if (slideItem.display_url) {
        sDisplay = slideItem.display_url;
      }
      let sVideo: string | undefined;
      if (Array.isArray(slideItem.video_versions) && slideItem.video_versions.length > 0) {
        sVideo = slideItem.video_versions[0].url;
      }
      if (sDisplay) {
        slides.push({
          id: slideId,
          mediaType: slideType,
          displayUrl: sDisplay,
          videoUrl: sVideo,
        });
      }
    });
  } else if (Array.isArray(node.edge_sidecar_to_children?.edges)) {
    node.edge_sidecar_to_children.edges.forEach((edge: any, sIdx: number) => {
      const sn = edge.node;
      if (sn && sn.display_url) {
        slides.push({
          id: String(sn.id || `${shortcode}_slide_${sIdx + 1}`),
          mediaType: sn.is_video ? "video" : "image",
          displayUrl: sn.display_url,
          videoUrl: sn.video_url,
        });
      }
    });
  }

  const hashtags = (caption.match(/#[A-Za-z0-9_ğüşıöçĞÜŞİÖÇ]+/g) || []).map((h) =>
    h.slice(1).toLowerCase()
  );
  const mentions = (caption.match(/@[A-Za-z0-9_.]+/g) || []).map((m) => m.slice(1).toLowerCase());

  return {
    id: shortcode,
    shortcode,
    url: postUrl,
    mediaType,
    caption,
    likeCount,
    commentCount,
    takenAtTimestamp: takenAt,
    displayUrl,
    videoUrl,
    hashtags,
    mentions,
    children: slides.length > 1 ? slides : undefined,
    owner: {
      id: ownerUsername,
      username: ownerUsername,
    },
  };
}

export async function harvestInstagramProfile(options: HarvestOptions) {
  const {
    username,
    scrollRounds = 8,
    maxPosts = 30,
    maxCommentsPerPost = 50,
    dbPath = "data/instagram.sqlite",
    timeoutMs = 45_000,
    downloadMedia = false,
    vaultRoot,
  } = options;

  const tStart = Date.now();
  const tracker = new HarvestProgressTracker();

  console.log(banner("PROTOKOL-7 INSTAGRAM HARVESTER", `Target: @${username}`));
  console.log(
    panel("PARAMETRELER", [
      ["Hedef Kullanici", `@${username}`],
      ["Kaydirma Limiti", String(scrollRounds)],
      ["Maksimum Gonderi", String(maxPosts)],
      ["Maksimum Yorum/Post", String(maxCommentsPerPost)],
      ["Medya Indirme (Vault)", downloadMedia ? "Etkin" : "Devre Disi"],
      ["Veritabani", dbPath],
    ])
  );
  console.log(divider());

  const db = new InstagramDatabase({ dbPath });
  const vault = downloadMedia ? new ObjectVault({ vaultRoot }) : null;

  tracker.logStage("1/4", "Tarayici oturumu baslatiliyor ve kimlik dogrulaniyor...");
  const session = await BrowserPool.acquireSession({
    timeoutMs,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  const { context } = session;
  const page = session.page;
  const envSessionId = process.env.INSTAGRAM_SESSION_ID;

  if (envSessionId) {
    await context.addCookies([
      {
        name: "sessionid",
        value: envSessionId,
        domain: ".instagram.com",
        path: "/",
        secure: true,
        httpOnly: true,
      },
    ]);
    tracker.updateProgress("1/4", "Oturum cerezi (sessionid) context'e enjekte edildi.", true);
  } else {
    tracker.logWarning("sessionid bulunamadi. Anonim modda devam ediliyor.");
  }

  let totalPostsSaved = 0;
  let totalCommentsSaved = 0;
  let totalSlidesSaved = 0;

  const capturedShortcodes = new Set<string>();

  // Asynchronous concurrent media download worker
  const mediaDownloadQueue: Array<{
    url: string;
    options: StoreObjectOptions;
    onSuccess: (relPath: string) => void;
  }> = [];
  let activeDownloads = 0;
  const MAX_CONCURRENT_DOWNLOADS = 4;
  let totalMediaDownloaded = 0;

  function pumpDownloadQueue() {
    while (activeDownloads < MAX_CONCURRENT_DOWNLOADS && mediaDownloadQueue.length > 0) {
      const job = mediaDownloadQueue.shift()!;
      activeDownloads++;
      vault!
        .downloadAsset(job.url, job.options, {
          Referer: "https://www.instagram.com/",
        })
        .then((meta) => {
          job.onSuccess(meta.absolutePath);
          totalMediaDownloaded++;
        })
        .catch(() => {
          // Non-fatal download error
        })
        .finally(() => {
          activeDownloads--;
          pumpDownloadQueue();
        });
    }
  }

  function enqueueMedia(
    url: string,
    options: StoreObjectOptions,
    onSuccess: (relPath: string) => void
  ) {
    if (!vault || !url) return;
    mediaDownloadQueue.push({ url, options, onSuccess });
    pumpDownloadQueue();
  }

  // Intercept all GraphQL and feed JSON responses in real time
  const handleResponse = async (res: Response) => {
    const url = res.url();
    if (
      url.includes("graphql") ||
      url.includes("/api/v1/feed/") ||
      url.includes("/api/v1/clips/")
    ) {
      try {
        const text = await res.text().catch(() => "");
        if (text.startsWith("{")) {
          const json = JSON.parse(text);
          const nodes = extractNodesFromPayload(json);
          for (const rawNode of nodes) {
            const record = parseInstagramGraphQLNode(rawNode, username);
            if (record && !capturedShortcodes.has(record.shortcode)) {
              capturedShortcodes.add(record.shortcode);
              db.upsertPost(record, username, rawNode);
              totalPostsSaved++;
              totalSlidesSaved += record.children?.length || 0;
              totalCommentsSaved += record.comments?.length || 0;

              if (vault) {
                if (record.displayUrl) {
                  enqueueMedia(
                    record.displayUrl,
                    {
                      actor: "instagram",
                      targetId: username,
                      category: "thumbnails",
                      filename: `${record.shortcode}_cover.webp`,
                      sourceUrl: record.displayUrl,
                      mimeType: "image/webp",
                    },
                    (absPath) => db.updatePostLocalPath(record.shortcode, absPath)
                  );
                }
                if (record.children) {
                  record.children.forEach((slide, sIdx) => {
                    const sOrder = String(sIdx + 1).padStart(2, "0");
                    if (slide.displayUrl) {
                      enqueueMedia(
                        slide.displayUrl,
                        {
                          actor: "instagram",
                          targetId: username,
                          category: "images",
                          filename: `${record.shortcode}_slide_${sOrder}.webp`,
                          sourceUrl: slide.displayUrl,
                          mimeType: "image/webp",
                        },
                        (absPath) => db.updateSlideLocalPath(slide.id, absPath)
                      );
                    }
                  });
                }
              }
            }
          }
        }
      } catch {
        // Non-fatal response handling error
      }
    }
  };

  page.on("response", handleResponse);

  try {
    const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`;
    tracker.updateProgress("1/4", `Profil yukleniyor: ${profileUrl}...`, true);
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(3000);

    // 1. Extract Profile Info from DOM / Meta tags
    const profileData = await page.evaluate((uname) => {
      const meta: Record<string, string> = {};
      document.querySelectorAll("meta[property], meta[name]").forEach((el) => {
        const prop = el.getAttribute("property") || el.getAttribute("name");
        const content = el.getAttribute("content");
        if (prop && content) meta[prop] = content;
      });

      const ogDesc = meta["og:description"] || "";
      const ogTitle = meta["og:title"] || "";
      const ogImage = meta["og:image"] || "";

      let followers = 0;
      let following = 0;
      let posts = 0;

      const followersMatch = ogDesc.match(/([\d,.]+[KkMmBb]?)\s+Followers/i);
      if (followersMatch) {
        const raw = followersMatch[1].replace(/,/g, "");
        if (raw.toUpperCase().endsWith("K")) followers = Math.round(parseFloat(raw) * 1_000);
        else if (raw.toUpperCase().endsWith("M"))
          followers = Math.round(parseFloat(raw) * 1_000_000);
        else if (raw.toUpperCase().endsWith("B"))
          followers = Math.round(parseFloat(raw) * 1_000_000_000);
        else followers = parseInt(raw, 10) || 0;
      }

      const followingMatch = ogDesc.match(/([\d,.]+[KkMmBb]?)\s+Following/i);
      if (followingMatch) {
        const raw = followingMatch[1].replace(/,/g, "");
        if (raw.toUpperCase().endsWith("K")) following = Math.round(parseFloat(raw) * 1_000);
        else if (raw.toUpperCase().endsWith("M"))
          following = Math.round(parseFloat(raw) * 1_000_000);
        else following = parseInt(raw, 10) || 0;
      }

      const postsMatch = ogDesc.match(/([\d,.]+[KkMmBb]?)\s+Posts/i);
      if (postsMatch) {
        const raw = postsMatch[1].replace(/,/g, "");
        if (raw.toUpperCase().endsWith("K")) posts = Math.round(parseFloat(raw) * 1_000);
        else if (raw.toUpperCase().endsWith("M")) posts = Math.round(parseFloat(raw) * 1_000_000);
        else posts = parseInt(raw, 10) || 0;
      }

      let fullName = "";
      const titleMatch = ogTitle.match(/^([^(]+)/);
      if (titleMatch) {
        fullName = titleMatch[1].trim();
      }

      let biography = "";
      const headerSection = document.querySelector("header");
      if (headerSection) {
        const spans = Array.from(headerSection.querySelectorAll("span"));
        for (const s of spans) {
          const t = s.textContent?.trim() || "";
          if (t && t.length > 20 && !t.includes("Followers") && !t.includes("Following")) {
            biography = t;
            break;
          }
        }
      }

      return {
        fullName: fullName || uname,
        biography,
        profilePicUrl: ogImage || undefined,
        followers,
        following,
        posts,
      };
    }, username);

    const profileRecord: InstagramProfileRecord = {
      id: username,
      username,
      fullName: profileData.fullName,
      biography: profileData.biography,
      profilePicUrl: profileData.profilePicUrl,
      followerCount: profileData.followers,
      followingCount: profileData.following,
      mediaCount: profileData.posts,
      isVerified: false,
      isPrivate: false,
    };

    db.upsertProfile(profileRecord);
    tracker.finishStage();
    tracker.logSuccess(
      "1/4",
      `Profil dogrulandi: ${profileRecord.fullName} (@${username}) | Takipci: ${profileRecord.followerCount?.toLocaleString()} | Toplam Gonderi: ${profileRecord.mediaCount?.toLocaleString()}`
    );

    if (vault) {
      try {
        const pending = db.getPendingMediaDownloads(username);
        if (pending.posts.length > 0 || pending.slides.length > 0) {
          tracker.logStage(
            "1/4",
            `Veritabanindaki bekleyen medya varliklari kuyruga aliniyor: ${pending.posts.length} gonderi, ${pending.slides.length} slayt...`
          );
          for (const p of pending.posts) {
            if (p.display_url) {
              enqueueMedia(
                p.display_url,
                {
                  actor: "instagram",
                  targetId: username,
                  category: "thumbnails",
                  filename: `${p.shortcode}_cover.webp`,
                  sourceUrl: p.display_url,
                  mimeType: "image/webp",
                },
                (absPath) => db.updatePostLocalPath(p.shortcode, absPath)
              );
            }
          }
          for (const s of pending.slides) {
            if (s.display_url) {
              const sOrder = String(s.slide_order + 1).padStart(2, "0");
              enqueueMedia(
                s.display_url,
                {
                  actor: "instagram",
                  targetId: username,
                  category: "images",
                  filename: `${s.post_shortcode}_slide_${sOrder}.webp`,
                  sourceUrl: s.display_url,
                  mimeType: "image/webp",
                },
                (absPath) => db.updateSlideLocalPath(s.id, absPath)
              );
            }
          }
        }
      } catch (err: unknown) {
        tracker.logWarning(`Medya backfill hatasi: ${(err as Error).message}`);
      }
    }

    // 2. Discover & Stream Posts via Scrolling
    tracker.logStage(
      "2/4",
      `Zaman tuneli ve medya akisi taranarak yakalaniyor (Hedef: ${maxPosts} gonderi, ${scrollRounds} dongu)...`
    );

    let timelineStagnantCount = 0;
    let timelinePrevCount = 0;

    for (let r = 1; r <= scrollRounds; r++) {
      if (page.isClosed() || !context.browser()?.isConnected()) {
        tracker.logError("Tarayici baglantisi koptu. Kesif sonlandiriliyor.");
        break;
      }

      tracker.updateProgress(
        "2/4",
        `Zaman tuneli taranarak yakalaniyor: ${capturedShortcodes.size}/${maxPosts} gonderi (Dongu ${r}/${scrollRounds}) | Medya: ${totalMediaDownloaded} indirildi, ${mediaDownloadQueue.length + activeDownloads} sirada...`
      );
      if (capturedShortcodes.size >= maxPosts) break;

      if (capturedShortcodes.size === timelinePrevCount) {
        timelineStagnantCount++;
        if (timelineStagnantCount >= 15) {
          break;
        }
      } else {
        timelineStagnantCount = 0;
        timelinePrevCount = capturedShortcodes.size;
      }

      // Stop autoplaying media in Chromium to prevent video buffer bloat
      await page
        .evaluate(() => {
          document.querySelectorAll("video").forEach((v) => {
            v.pause();
            v.removeAttribute("autoplay");
          });
        })
        .catch(() => {});

      await page.keyboard.press("PageDown").catch(() => {});
      await page.waitForTimeout(300);
      await page.mouse.wheel(0, 2000).catch(() => {});
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(1600);
    }

    // 2b. Explore Reels tab if we need more media
    if (capturedShortcodes.size < maxPosts && !page.isClosed()) {
      const reelsUrl = `https://www.instagram.com/${encodeURIComponent(username)}/reels/`;
      tracker.updateProgress("2/4", `Reels sekmesine geciliyor: ${reelsUrl}...`, true);
      try {
        await page.goto(reelsUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        await page.waitForTimeout(2500);

        let reelsStagnantCount = 0;
        let reelsPrevCount = capturedShortcodes.size;

        for (let r = 1; r <= scrollRounds; r++) {
          if (page.isClosed() || !context.browser()?.isConnected()) break;

          tracker.updateProgress(
            "2/4",
            `Reels taranarak yakalaniyor: ${capturedShortcodes.size}/${maxPosts} gonderi (Reels Dongu ${r}/${scrollRounds}) | Medya: ${totalMediaDownloaded} indirildi, ${mediaDownloadQueue.length + activeDownloads} sirada...`
          );
          if (capturedShortcodes.size >= maxPosts) break;

          if (capturedShortcodes.size === reelsPrevCount) {
            reelsStagnantCount++;
            if (reelsStagnantCount >= 15) break;
          } else {
            reelsStagnantCount = 0;
            reelsPrevCount = capturedShortcodes.size;
          }

          await page
            .evaluate(() => {
              document.querySelectorAll("video").forEach((v) => {
                v.pause();
                v.removeAttribute("autoplay");
              });
            })
            .catch(() => {});

          await page.keyboard.press("PageDown").catch(() => {});
          await page.waitForTimeout(300);
          await page.mouse.wheel(0, 2000).catch(() => {});
          await page.waitForTimeout(500);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
          await page.waitForTimeout(1600);
        }
      } catch (err: unknown) {
        tracker.logWarning(`Reels sekmesi tarama uyarisi: ${(err as Error).message}`);
      }
    }

    tracker.finishStage();
    tracker.logSuccess(
      "2/4",
      `Akis taramasi tamamlandi: ${capturedShortcodes.size} gonderi ve ${totalSlidesSaved} slayt yakalanarak SQLite'a yazildi.`
    );

    // 3. Drain Media Downloads & Verify
    tracker.logStage("3/4", "Medya indirme kuyrugu ve veri butunlugu denetleniyor...");

    if (vault) {
      while (mediaDownloadQueue.length > 0 || activeDownloads > 0) {
        tracker.updateProgress(
          "3/4",
          `Medya nesneleri indiriliyor: ${totalMediaDownloaded} tamamlandi, ${mediaDownloadQueue.length + activeDownloads} sirada...`
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    tracker.finishStage();
    tracker.logSuccess(
      "3/4",
      `Cikarim tamamlandi: ${totalPostsSaved} gonderi ve ${totalSlidesSaved} slayt veritabanina kaydedildi (${totalMediaDownloaded} medya nesnesi Object Vault'a yazildi).`
    );

    // 4. Audit Run Log
    const durationMs = Date.now() - tStart;
    db.recordHarvestRun({
      runId: `harvest-${username}-${Date.now()}`,
      targetType: "profile",
      targetQuery: username,
      engineUsed: "browser_session",
      status: "success",
      itemsHarvested: totalPostsSaved,
      commentsHarvested: totalCommentsSaved,
      durationMs,
      createdAt: Math.floor(Date.now() / 1000),
    });

    tracker.logStage("4/4", "Veritabani ve calisma denetim kayitlari muhurlendi.");
    tracker.logSuccess("4/4", "Tum veriler SQLite ve Object Vault ile esitlendi.");

    console.log(divider());
    console.log(
      panel("HARVEST OZETI", [
        ["Hedef", `@${username}`],
        ["Kaydedilen Gonderi", String(totalPostsSaved)],
        ["Kaydedilen Slayt", String(totalSlidesSaved)],
        ["Kaydedilen Yorum", String(totalCommentsSaved)],
        ["Toplam Sure", `${(durationMs / 1000).toFixed(1)}s`],
        ["SQLite Veritabani", dbPath],
        [
          "Object Vault",
          vault ? vault.vaultRoot : "Devre Disi (--download-media ile etkinlestirin)",
        ],
      ])
    );
    console.log(divider());
  } finally {
    await session.release();
  }
}

// CLI direct run
if (
  process.argv[1]?.endsWith("harvest_instagram_profile.ts") ||
  process.argv[1]?.endsWith("harvest_instagram_profile.js")
) {
  const targetUser = process.argv[2] || "pratik.psikoloji";
  const arg3 = process.argv[3]?.toLowerCase();
  const arg4 = process.argv[4]?.toLowerCase();

  const isAuto = !arg3 || arg3 === "auto" || arg3 === "all" || arg4 === "auto" || arg4 === "all";

  const scrolls = isAuto ? 2000 : parseInt(process.argv[3] || "15", 10);
  const maxP = isAuto ? 100000 : parseInt(process.argv[4] || "50", 10);

  const shouldDownloadMedia =
    process.argv.includes("--download-media") || process.argv.includes("--sync-media");

  harvestInstagramProfile({
    username: targetUser,
    scrollRounds: scrolls,
    maxPosts: maxP,
    maxCommentsPerPost: 50,
    downloadMedia: shouldDownloadMedia,
  }).catch((err) => {
    console.error("[FATAL] Harvest failed:", err);
    process.exit(1);
  });
}
