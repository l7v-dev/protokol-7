/**
 * High-Capacity Instagram Profile & Deep Content Harvester — protokol-7
 *
 * Scrapes authenticated Instagram profiles, discovering media posts, reels,
 * carousel slides, engagement stats, and user comments using Playwright stealth pooling.
 * Persists all structured relational data directly into SQLite (data/instagram.sqlite).
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
  console.log(`[HARVESTER] Initiating deep harvest for @${username}`);
  console.log(
    `[HARVESTER] Target settings: scrolls=${scrollRounds}, maxPosts=${maxPosts}, maxComments=${maxCommentsPerPost}, downloadMedia=${downloadMedia}`
  );

  const db = new InstagramDatabase({ dbPath });
  const vault = downloadMedia ? new ObjectVault({ vaultRoot }) : null;
  const session = await BrowserPool.acquireSession({
    timeoutMs,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  const { page, context } = session;
  const envSessionId = process.env.INSTAGRAM_SESSION_ID;

  if (envSessionId) {
    console.log("[HARVESTER] Injecting authenticated sessionid cookie...");
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
  } else {
    console.log("[HARVESTER] Notice: Running in unauthenticated mode (no sessionid configured).");
  }

  let totalPostsSaved = 0;
  let totalCommentsSaved = 0;
  let totalSlidesSaved = 0;

  try {
    const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`;
    console.log(`[HARVESTER] Navigating to ${profileUrl}...`);
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

      const _title = document.title || "";
      const ogDesc = meta["og:description"] || "";
      const ogTitle = meta["og:title"] || "";
      const ogImage = meta["og:image"] || "";

      // Parse followers / following from og:description
      // Format e.g. "2M Followers, 560 Following, 8,293 Posts - See Instagram photos and videos..."
      let followers = 0;
      let following = 0;
      let posts = 0;

      const followersMatch = ogDesc.match(/([\d,.]+[KkMmBb]?)\s+Followers/i);
      if (followersMatch) {
        const raw = followersMatch[1].replace(/,/g, "");
        if (raw.endsWith("M") || raw.endsWith("m")) followers = parseFloat(raw) * 1_000_000;
        else if (raw.endsWith("K") || raw.endsWith("k")) followers = parseFloat(raw) * 1_000;
        else followers = parseInt(raw, 10) || 0;
      }

      const followingMatch = ogDesc.match(/([\d,.]+[KkMmBb]?)\s+Following/i);
      if (followingMatch) {
        const raw = followingMatch[1].replace(/,/g, "");
        if (raw.endsWith("M") || raw.endsWith("m")) following = parseFloat(raw) * 1_000_000;
        else if (raw.endsWith("K") || raw.endsWith("k")) following = parseFloat(raw) * 1_000;
        else following = parseInt(raw, 10) || 0;
      }

      const postsMatch = ogDesc.match(/([\d,.]+[KkMmBb]?)\s+Posts/i);
      if (postsMatch) {
        const raw = postsMatch[1].replace(/,/g, "");
        posts = parseInt(raw.replace(/[^\d]/g, ""), 10) || 0;
      }

      // Check header bio from header elements
      const bioEl = document.querySelector(
        "header section div.-vDIg, header section div:nth-child(3)"
      );
      const bioText = bioEl?.textContent?.trim() || ogDesc;

      return {
        username: uname,
        fullName: ogTitle.split("•")[0]?.trim() || uname,
        biography: bioText,
        profilePicUrl: ogImage,
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

    console.log(
      `[HARVESTER] Profile: ${profileRecord.fullName} (@${username}) | Followers: ${profileRecord.followerCount?.toLocaleString()} | Posts: ${profileRecord.mediaCount?.toLocaleString()}`
    );
    db.upsertProfile(profileRecord);

    // 2. Discover Post Links via Scrolling
    console.log(`[HARVESTER] Discovering timeline posts with ${scrollRounds} scrolling cycles...`);
    const discoveredShortcodes = new Set<string>();

    for (let r = 1; r <= scrollRounds; r++) {
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

      console.log(
        `[HARVESTER] Cycle ${r}/${scrollRounds}: ${discoveredShortcodes.size} unique post(s) found`
      );
      if (discoveredShortcodes.size >= maxPosts) break;

      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(1800);
    }

    // 2b. Explore Reels tab if we need more media (most Instagram creators publish heavily on Reels)
    if (discoveredShortcodes.size < maxPosts) {
      const reelsUrl = `https://www.instagram.com/${encodeURIComponent(username)}/reels/`;
      console.log(`[HARVESTER] Exploring Reels tab for additional media: ${reelsUrl}...`);
      try {
        await page.goto(reelsUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        await page.waitForTimeout(2500);

        let stagnantCount = 0;
        let prevCount = discoveredShortcodes.size;

        for (let r = 1; r <= scrollRounds; r++) {
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

          console.log(
            `[HARVESTER] Reels Cycle ${r}/${scrollRounds}: ${discoveredShortcodes.size} total post(s) found`
          );
          if (discoveredShortcodes.size >= maxPosts) break;

          if (discoveredShortcodes.size === prevCount) {
            stagnantCount++;
            if (stagnantCount >= 4) {
              console.log(
                "[HARVESTER] Timeline end reached: 4 consecutive scrolls found no new reels. Proceeding to extraction."
              );
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
        console.warn("[HARVESTER] Warning during Reels tab exploration:", (err as Error).message);
      }
    }

    const existingShortcodes = db.getExistingShortcodes(username);
    const shortcodesToProcess = Array.from(discoveredShortcodes).slice(0, maxPosts);
    const pendingShortcodes = shortcodesToProcess.filter((sc) => !existingShortcodes.has(sc));

    console.log(
      `[HARVESTER] Total discovered: ${shortcodesToProcess.length} | Already in database: ${
        shortcodesToProcess.length - pendingShortcodes.length
      } | New to harvest: ${pendingShortcodes.length}`
    );

    // 3. Process Each New Post (Detail Extraction)
    for (let idx = 0; idx < pendingShortcodes.length; idx++) {
      const sc = pendingShortcodes[idx];
      const postUrl = `https://www.instagram.com/p/${sc}/`;
      console.log(`[HARVESTER] [${idx + 1}/${pendingShortcodes.length}] Fetching post: ${postUrl}`);

      try {
        await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);

        const postDetail = await page.evaluate((maxC) => {
          const article =
            document.querySelector("article") ||
            document.querySelector('div[role="dialog"]') ||
            document.body;

          // Timestamp
          const timeEl = article.querySelector("time");
          const isoTime = timeEl?.getAttribute("datetime");
          const timestamp = isoTime ? Math.floor(new Date(isoTime).getTime() / 1000) : 0;

          // Main post text / caption
          let caption = "";
          const h1El = article.querySelector("h1");
          if (h1El) {
            caption = h1El.textContent?.trim() || "";
          } else {
            // First span with dir="auto" inside the header/author section
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

        // Format into InstagramMediaRecord
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

        // Extract hashtags and mentions
        const hashtags = (postDetail.caption.match(/#[A-Za-z0-9_ğüşıöçĞÜŞİÖÇ]+/g) || []).map((h) =>
          h.slice(1).toLowerCase()
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

        if (vault) {
          // Download cover thumbnail
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
            } catch (err: unknown) {
              console.warn(
                `[HARVESTER] Warning: failed to download cover for ${sc}:`,
                (err as Error).message
              );
            }
          }

          // Download carousel slides
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
            } catch (err: unknown) {
              console.warn(
                `[HARVESTER] Warning: failed to download slide ${sIdx + 1} for ${sc}:`,
                (err as Error).message
              );
            }
          }
        }

        console.log(
          `[HARVESTER] Saved post ${sc}: type=${mediaType}, likes=${postDetail.likeCount}, slides=${slides.length}, comments=${comments.length}`
        );
      } catch (err: unknown) {
        console.warn(
          `[HARVESTER] Warning: failed to fetch details for post ${sc}:`,
          (err as Error).message
        );
      }

      // Respectful pacing
      await page.waitForTimeout(1200);
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

    console.log("\n==================================================");
    console.log(`[HARVESTER] Complete! Harvest summary for @${username}:`);
    console.log(` - Posts saved: ${totalPostsSaved}`);
    console.log(` - Slides saved: ${totalSlidesSaved}`);
    console.log(` - Comments saved: ${totalCommentsSaved}`);
    console.log(` - Execution duration: ${(durationMs / 1000).toFixed(1)}s`);
    console.log(` - SQLite database: ${dbPath}`);
    console.log("==================================================");
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

  if (isAuto) {
    console.log(
      `[HARVESTER] AUTO MODE ACTIVATED: Crawling entire timeline for @${targetUser} until completion.`
    );
  }

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
