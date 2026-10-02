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

import type {
  InstagramCommentRecord,
  InstagramMediaChild,
  InstagramMediaRecord,
  InstagramProfileRecord,
} from "../src/api/types";
import { BrowserPool } from "../src/browser/browser-pool";
import { InstagramDatabase } from "../src/storage/instagram-database";
import { ObjectVault } from "../src/storage/object-vault";
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
  let page = session.page;
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

    // 2. Discover Post Links via Scrolling
    tracker.logStage(
      "2/4",
      `Zaman tuneli ve medya kesfi baslatildi (Hedef: ${maxPosts} gonderi, ${scrollRounds} dongu)...`
    );
    const discoveredShortcodes = new Set<string>();

    for (let r = 1; r <= scrollRounds; r++) {
      if (page.isClosed() || !context.browser()?.isConnected()) {
        tracker.logError("Tarayici baglantisi koptu. Kesif sonlandiriliyor.");
        break;
      }

      const shortcodesOnPage = await page.evaluate(() => {
        const anchors = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
        const results: string[] = [];
        anchors.forEach((a) => {
          const href = a.getAttribute("href") || "";
          const match = href.match(/\/(p|reel)\/([^/?#]+)/);
          if (match?.[2]) {
            results.push(match[2]);
          }
        });
        return results;
      });

      for (const sc of shortcodesOnPage) {
        discoveredShortcodes.add(sc);
      }

      tracker.updateProgress(
        "2/4",
        `Zaman tuneli taraniyor: ${discoveredShortcodes.size}/${maxPosts} gonderi (Dongu ${r}/${scrollRounds})...`
      );
      if (discoveredShortcodes.size >= maxPosts) break;

      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(1600);
    }

    // 2b. Explore Reels tab if we need more media
    if (discoveredShortcodes.size < maxPosts && !page.isClosed()) {
      const reelsUrl = `https://www.instagram.com/${encodeURIComponent(username)}/reels/`;
      tracker.updateProgress("2/4", `Reels sekmesine geciliyor: ${reelsUrl}...`, true);
      try {
        await page.goto(reelsUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        await page.waitForTimeout(2500);

        let stagnantCount = 0;
        let prevCount = discoveredShortcodes.size;

        for (let r = 1; r <= scrollRounds; r++) {
          if (page.isClosed() || !context.browser()?.isConnected()) {
            break;
          }

          const reelsOnPage = await page.evaluate(() => {
            const anchors = document.querySelectorAll('a[href*="/reel/"]');
            const results: string[] = [];
            anchors.forEach((a) => {
              const href = a.getAttribute("href") || "";
              const match = href.match(/\/reel\/([^/?#]+)/);
              if (match?.[1]) {
                results.push(match[1]);
              }
            });
            return results;
          });

          for (const sc of reelsOnPage) {
            discoveredShortcodes.add(sc);
          }

          tracker.updateProgress(
            "2/4",
            `Reels taraniyor: ${discoveredShortcodes.size}/${maxPosts} gonderi (Reels Dongu ${r}/${scrollRounds})...`
          );
          if (discoveredShortcodes.size >= maxPosts) break;

          if (discoveredShortcodes.size === prevCount) {
            stagnantCount++;
            if (stagnantCount >= 4) {
              break;
            }
          } else {
            stagnantCount = 0;
            prevCount = discoveredShortcodes.size;
          }

          await page.evaluate(() => window.scrollBy(0, 3500));
          await page.waitForTimeout(1600);
        }
      } catch (err: unknown) {
        tracker.logWarning(`Reels sekmesi tarama uyarisi: ${(err as Error).message}`);
      }
    }

    const existingShortcodes = db.getExistingShortcodes(username);
    const shortcodesToProcess = Array.from(discoveredShortcodes).slice(0, maxPosts);
    const pendingShortcodes = shortcodesToProcess.filter((sc) => !existingShortcodes.has(sc));

    tracker.finishStage();
    tracker.logSuccess(
      "2/4",
      `Kesif tamamlandi: ${shortcodesToProcess.length} gonderi bulundu (${shortcodesToProcess.length - pendingShortcodes.length} veritabaninda mevcut, ${pendingShortcodes.length} yeni islenecek).`
    );

    // 3. Process Each New Post (Detail Extraction with Tab Recycling & Crash Guard)
    if (pendingShortcodes.length > 0) {
      tracker.logStage(
        "3/4",
        `Gonderi detaylari cikariliyor ve kaydediliyor (${pendingShortcodes.length} adet)...`
      );

      for (let idx = 0; idx < pendingShortcodes.length; idx++) {
        // Crash Guard: ensure page and browser context are active
        if (page.isClosed() || !context.browser()?.isConnected()) {
          tracker.logError(
            "Tarayici oturumu beklenmedik sekilde kapandi. Cikarim dongusu sonlandiriliyor."
          );
          break;
        }

        // Memory Recycling: Every 15 posts, close the page and create a fresh one to flush Chromium heap
        if (idx > 0 && idx % 15 === 0) {
          tracker.updateProgress(
            "3/4",
            `Chromium bellek tahliyesi yapiliyor (${idx}/${pendingShortcodes.length})...`,
            true
          );
          try {
            await page.close().catch(() => {});
            page = await context.newPage();
            page.setDefaultTimeout(timeoutMs);
          } catch (err: unknown) {
            tracker.logWarning(`Sayfa bellek tahliye uyarisi: ${(err as Error).message}`);
          }
        }

        const sc = pendingShortcodes[idx];
        const postUrl = `https://www.instagram.com/p/${sc}/`;
        const pct = Math.floor(((idx + 1) / pendingShortcodes.length) * 100);

        tracker.updateProgress(
          "3/4",
          `[${idx + 1}/${pendingShortcodes.length}] (%${pct}) Yukleniyor: ${sc}...`
        );

        try {
          await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
          await page.waitForTimeout(2000);

          // Stop autoplaying media in Chromium to prevent video buffer bloat
          await page
            .evaluate(() => {
              document.querySelectorAll("video").forEach((v) => {
                v.pause();
                v.removeAttribute("autoplay");
              });
            })
            .catch(() => {});

          const postDetail = await page.evaluate((maxC) => {
            const article =
              document.querySelector("article") ||
              document.querySelector('div[role="dialog"]') ||
              document.body;

            // Timestamp
            const timeEl = article.querySelector("time");
            const isoTime = timeEl?.getAttribute("datetime");
            const timestamp = isoTime ? Math.floor(new Date(isoTime).getTime() / 1000) : 0;

            // Caption
            let caption = "";
            const h1El = article.querySelector("h1");
            if (h1El) {
              caption = h1El.textContent?.trim() || "";
            } else {
              const authorAnchor = article.querySelector("header a, a[role='link']");
              if (authorAnchor) {
                const row = authorAnchor.closest("div, li");
                const span = row?.querySelector("span[dir='auto']");
                caption = span?.textContent?.trim() || "";
              }
            }

            if (!caption) {
              const metaOgDesc = document
                .querySelector('meta[property="og:description"]')
                ?.getAttribute("content");
              caption = metaOgDesc || "";
            }

            // Like count
            let likeCount = 0;
            const allSpans = Array.from(article.querySelectorAll("section span, a span"));
            for (const s of allSpans) {
              const txt = s.textContent?.trim() || "";
              const match = txt.match(/([\d,.]+)\s+likes?/i);
              if (match) {
                likeCount = parseInt(match[1].replace(/[^\d]/g, ""), 10) || 0;
                break;
              }
            }

            // Images and slides
            const images: string[] = [];
            article.querySelectorAll("img[src*='fbcdn.net']").forEach((img) => {
              const src = (img as HTMLImageElement).src;
              if (
                src &&
                !images.includes(src) &&
                !src.includes("150x150") &&
                !src.includes("s150x150")
              ) {
                images.push(src);
              }
            });

            // Video
            const videoEl = article.querySelector("video");
            const videoUrl = videoEl ? videoEl.getAttribute("src") || undefined : undefined;

            // Comments
            const comments: Array<{ username: string; text: string; profilePic?: string }> = [];
            const commentElements = article.querySelectorAll("ul > div > li, ul > li");

            commentElements.forEach((li) => {
              if (comments.length >= maxC) return;
              const userAnchor = li.querySelector("h3 a, a[role='link'], a[href^='/']");
              const textSpan = li.querySelector("span[dir='auto']");
              if (userAnchor && textSpan) {
                const u = userAnchor.textContent?.trim().replace(/^@/, "") || "";
                const t = textSpan.textContent?.trim() || "";
                if (
                  u &&
                  t &&
                  u !== t &&
                  !u.includes("Follow") &&
                  !t.includes("likes") &&
                  !t.includes("Reply")
                ) {
                  if (!comments.some((c) => c.username === u && c.text === t)) {
                    const pic = (li.querySelector("img") as HTMLImageElement)?.src;
                    comments.push({ username: u, text: t, profilePic: pic });
                  }
                }
              }
            });

            return {
              caption,
              timestamp,
              likeCount,
              images,
              videoUrl,
              comments,
            };
          }, maxCommentsPerPost);

          const mediaType = postDetail.videoUrl
            ? "video"
            : postDetail.images.length > 1
              ? "carousel"
              : "image";

          const slides: InstagramMediaChild[] = postDetail.images.map((imgUrl, sIdx) => ({
            id: `${sc}_slide_${sIdx + 1}`,
            mediaType: "image",
            displayUrl: imgUrl,
          }));

          const comments: InstagramCommentRecord[] = postDetail.comments.map((c, cIdx) => ({
            id: `${sc}_c_${cIdx + 1}`,
            username: c.username,
            text: c.text,
            authorProfilePicUrl: c.profilePic,
            likeCount: 0,
            createdAtTimestamp: postDetail.timestamp,
          }));

          const hashtags = (postDetail.caption.match(/#[A-Za-z0-9_ğüşıöçĞÜŞİÖÇ]+/g) || []).map(
            (h) => h.slice(1).toLowerCase()
          );
          const mentions = (postDetail.caption.match(/@[A-Za-z0-9_.]+/g) || []).map((m) =>
            m.slice(1).toLowerCase()
          );

          const mediaRecord: InstagramMediaRecord = {
            id: sc,
            shortcode: sc,
            url: postUrl,
            mediaType,
            caption: postDetail.caption,
            likeCount: postDetail.likeCount,
            commentCount: comments.length,
            takenAtTimestamp: postDetail.timestamp,
            displayUrl: postDetail.images[0] || undefined,
            videoUrl: postDetail.videoUrl,
            hashtags,
            mentions,
            children: slides.length > 1 ? slides : undefined,
            comments: comments.length > 0 ? comments : undefined,
            owner: {
              id: username,
              username,
            },
          };

          db.upsertPost(mediaRecord, username);
          totalPostsSaved++;
          totalCommentsSaved += comments.length;
          totalSlidesSaved += slides.length;

          // Object Vault Asset Download (if enabled)
          if (vault) {
            if (mediaRecord.displayUrl) {
              try {
                const coverReceipt = await vault.downloadAsset(
                  mediaRecord.displayUrl,
                  {
                    actor: "instagram",
                    targetId: username,
                    category: "thumbnails",
                    filename: `${sc}_cover.webp`,
                    sourceUrl: mediaRecord.displayUrl,
                    mimeType: "image/webp",
                  },
                  { Referer: "https://www.instagram.com/" }
                );
                db.updatePostLocalPath(sc, coverReceipt.absolutePath);
              } catch {
                // Non-fatal
              }
            }

            for (let sIdx = 0; sIdx < slides.length; sIdx++) {
              const slide = slides[sIdx];
              const sOrder = String(sIdx + 1).padStart(2, "0");
              try {
                const slideReceipt = await vault.downloadAsset(
                  slide.displayUrl,
                  {
                    actor: "instagram",
                    targetId: username,
                    category: "images",
                    filename: `${sc}_slide_${sOrder}.webp`,
                    sourceUrl: slide.displayUrl,
                    mimeType: "image/webp",
                  },
                  { Referer: "https://www.instagram.com/" }
                );
                db.updateSlideLocalPath(slide.id, slideReceipt.absolutePath);
              } catch {
                // Non-fatal
              }
            }
          }

          tracker.updateProgress(
            "3/4",
            `[${idx + 1}/${pendingShortcodes.length}] (%${pct}) ${sc} (${mediaType}) | Toplam: ${totalPostsSaved} gonderi, ${totalSlidesSaved} slayt`
          );
        } catch (err: unknown) {
          tracker.logWarning(`Gonderi cikarim uyarisi (${sc}): ${(err as Error).message}`);
        }

        await page.waitForTimeout(1000);
      }

      tracker.finishStage();
      tracker.logSuccess(
        "3/4",
        `Cikarim tamamlandi: ${totalPostsSaved} gonderi, ${totalSlidesSaved} slayt veritabanina yazildi.`
      );
    } else {
      tracker.logSuccess(
        "3/4",
        "Yeni gonderi bulunmuyor. Tum gonderiler zaten veritabaninda guncel."
      );
    }

    // 4. Audit Run Log
    const durationMs = Date.now() - tStart;
    db.recordHarvestRun({
      runId: `harvest-${username}-${Date.now()}`,
      targetType: "profile",
      targetQuery: username,
      engineUsed: "browser_session",
      status: "completed",
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
