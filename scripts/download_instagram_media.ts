/**
 * Instagram Media Asset Downloader & Object Vault Synchronizer — protokol-7
 *
 * Scans pending media records from SQLite (data/instagram.sqlite), downloads images,
 * carousel slides, and video assets to the local Object Vault partition:
 * <VAULT_ROOT>/instagram/<username>/<category>/<filename>
 * Default vault root: ~/protokol-object-vault
 *
 * Usage:
 *   npx tsx scripts/download_instagram_media.ts [username] [--concurrency=4]
 */

import { InstagramDatabase } from "../src/storage/instagram-database";
import { ObjectVault } from "../src/storage/object-vault";

interface DownloaderOptions {
  username?: string;
  concurrency?: number;
  dbPath?: string;
  vaultRoot?: string;
}

export async function downloadInstagramMedia(options: DownloaderOptions = {}) {
  const {
    username,
    concurrency = 4,
    dbPath = "data/catalogs/instagram.sqlite",
    vaultRoot,
  } = options;

  const tStart = Date.now();
  const db = new InstagramDatabase({ dbPath });
  const vault = new ObjectVault({ vaultRoot });

  console.log("==================================================");
  console.log("[MEDIA-VAULT] Starting Instagram Media Download Pipeline");
  console.log(`[MEDIA-VAULT] Vault Root: ${vault.vaultRoot}`);
  console.log(`[MEDIA-VAULT] Target User: ${username || "ALL"}`);
  console.log(`[MEDIA-VAULT] Concurrency: ${concurrency}`);
  console.log("==================================================");

  const pending = db.getPendingMediaDownloads(username);
  const totalPosts = pending.posts.length;
  const totalSlides = pending.slides.length;
  const totalItems = totalPosts + totalSlides;

  console.log(
    `[MEDIA-VAULT] Discovered ${totalPosts} pending post cover(s) and ${totalSlides} carousel slide(s).`
  );

  if (totalItems === 0) {
    console.log("[MEDIA-VAULT] All media assets are up to date. Nothing to download.");
    db.close();
    return { downloaded: 0, failed: 0, total: 0 };
  }

  let downloadedCount = 0;
  let failedCount = 0;

  // 1. Download carousel slides
  console.log(`\n[MEDIA-VAULT] Processing ${totalSlides} carousel slide(s)...`);
  for (let i = 0; i < pending.slides.length; i += concurrency) {
    const chunk = pending.slides.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (slide, idx) => {
        const itemIndex = i + idx + 1;
        const owner = slide.owner_username;
        const sc = slide.post_shortcode;
        const sOrder = String(slide.slide_order + 1).padStart(2, "0");
        const filename = `${sc}_slide_${sOrder}.webp`;

        try {
          const receipt = await vault.downloadAsset(
            slide.display_url,
            {
              actor: "instagram",
              targetId: owner,
              category: "images",
              filename,
              sourceUrl: slide.display_url,
              mimeType: "image/webp",
            },
            {
              Referer: "https://www.instagram.com/",
            }
          );

          db.updateSlideLocalPath(slide.id, receipt.absolutePath);
          downloadedCount++;
          console.log(
            `[MEDIA-VAULT] [${itemIndex}/${totalSlides}] Slide saved: ${owner}/images/${filename} (${(receipt.sizeBytes / 1024).toFixed(1)} KB)`
          );
        } catch (err: unknown) {
          failedCount++;
          console.warn(
            `[MEDIA-VAULT] [${itemIndex}/${totalSlides}] Warning: Failed to download slide ${filename}:`,
            (err as Error).message
          );
        }
      })
    );

    // Rate-limit throttle between batches
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // 2. Download post covers and videos
  console.log(`\n[MEDIA-VAULT] Processing ${totalPosts} post cover/media asset(s)...`);
  for (let i = 0; i < pending.posts.length; i += concurrency) {
    const chunk = pending.posts.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (post, idx) => {
        const itemIndex = i + idx + 1;
        const owner = post.owner_username;
        const sc = post.shortcode;
        const filename = `${sc}_cover.webp`;

        try {
          const receipt = await vault.downloadAsset(
            post.display_url,
            {
              actor: "instagram",
              targetId: owner,
              category: "thumbnails",
              filename,
              sourceUrl: post.display_url,
              mimeType: "image/webp",
            },
            {
              Referer: "https://www.instagram.com/",
            }
          );

          db.updatePostLocalPath(sc, receipt.absolutePath);
          downloadedCount++;
          console.log(
            `[MEDIA-VAULT] [${itemIndex}/${totalPosts}] Post cover saved: ${owner}/thumbnails/${filename} (${(receipt.sizeBytes / 1024).toFixed(1)} KB)`
          );
        } catch (err: unknown) {
          failedCount++;
          console.warn(
            `[MEDIA-VAULT] [${itemIndex}/${totalPosts}] Warning: Failed to download cover for ${sc}:`,
            (err as Error).message
          );
        }
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const durationSec = ((Date.now() - tStart) / 1000).toFixed(1);
  console.log("\n==================================================");
  console.log("[MEDIA-VAULT] Download pipeline complete!");
  console.log(` - Total downloaded: ${downloadedCount}`);
  console.log(` - Failed / skipped: ${failedCount}`);
  console.log(` - Elapsed time: ${durationSec}s`);
  console.log(` - Vault destination: ${vault.vaultRoot}/instagram/`);
  console.log("==================================================");

  db.close();
  return { downloaded: downloadedCount, failed: failedCount, total: totalItems };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const targetUsername =
    process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : undefined;
  const concurrencyArg = process.argv.find((a) => a.startsWith("--concurrency="));
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split("=")[1], 10) : 4;

  downloadInstagramMedia({
    username: targetUsername,
    concurrency,
  }).catch((err) => {
    console.error("[MEDIA-VAULT] Fatal error in downloader:", err);
    process.exit(1);
  });
}
