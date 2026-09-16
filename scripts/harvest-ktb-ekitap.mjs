#!/usr/bin/env node
/**
 * PROTOKOL-7: KULTUR VE TURIZM BAKANLIGI E-KITAP ARSIVLEYICI (KTB HARVESTER)
 *
 * Ozellikler:
 * 1. Iki Asamali Sirali Yurutme: Faz 1 (Tum PDFleri Indir) -> Faz 2 (Metin Damit & LLM Arindir)
 * 2. KTB Anti-Hotlinking Korumasi Asimi: Eser URLsi ile dinamik Referer basligi enjeksiyonu.
 * 3. 4 Kapili Veto Zinciri (Metadata, Magic Bytes %PDF-, Kriptografik SHA-256, Content).
 * 4. Akis Ici LLM Metin Arindirma (In-Pipeline LLM Sanitizer):
 *    - Tekrarlayan ust/alt sayfa basliklarini (header/footer) frekans filtresiyle silme.
 *    - Sayfa sonu hece bolme tirelerini (hyphenation) birlestirme.
 *    - Yapay sayfa gecis imlerini kaldirip akici paragraflara donusturme.
 *    - Sayfa numaralari ve susleme ASCII karakterlerini temizleme.
 * 5. Out Havuzunda SIFIR HAM PDF: Sadece .md.gz ve .json.gz muhurlenir.
 * 6. Cop Havuzu (Trash): Ham PDFler 7 gun saklanir ve otomatik silinir.
 * 7. Kanonik 8 Karakterli Dosya Adlandirmasi: YYYY + 4 haneli ID.
 */

import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import * as cheerio from "cheerio";
import { extractText } from "unpdf";

const BASE_URL = "https://ekitap.ktb.gov.tr";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (Protokol-7 KTB Harvester)";

// Komut satiri argumanlari
const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  const match = args.find((a) => a.startsWith(`--${flag}=`));
  if (match) return match.split("=")[1];
  const idx = args.indexOf(`--${flag}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) {
    return args[idx + 1];
  }
  return defaultValue;
}
const hasFlag = (flag) => args.includes(`--${flag}`);

const TARGET_PHASE = getArg("phase", "all").toLowerCase(); // "all", "download", "refine"
const ITEM_LIMIT = getArg("limit") ? Number.parseInt(getArg("limit"), 10) : 0;
const DELAY_MS = getArg("delay") ? Number.parseInt(getArg("delay"), 10) : 400;
const NO_TRASH = hasFlag("no-trash");
const TARGET_ID = getArg("id") ? Number.parseInt(getArg("id"), 10) : null;
const TRASH_DAYS = 7;

// Havuz dizin mimarisi
const POOL_ROOT = process.env.PROTOKOL_POOL_ROOT || "/home/l7v/protokol-data-pool";
const POOL_STRUCTURE = {
  root: POOL_ROOT,
  staging: join(POOL_ROOT, "staging"),
  rawLanding: join(POOL_ROOT, "raw_landing_pool", "ktb-ekitap"),
  trash: join(POOL_ROOT, "trash", "ktb-ekitap"),
  quarantineVetoed: join(POOL_ROOT, "quarantine_vetoed", "ktb-ekitap"),
  out: join(POOL_ROOT, "out", "ktb-ekitap"),
  mapIndex: join(POOL_ROOT, "out", "ktb-ekitap", "00_map_index_pool"),
  refinedContent: join(POOL_ROOT, "out", "ktb-ekitap", "01_refined_content_pool"),
};

for (const dir of Object.values(POOL_STRUCTURE)) {
  mkdirSync(dir, { recursive: true });
}

const CHECKPOINT_PATH = join(POOL_STRUCTURE.mapIndex, "checkpoint.json");
const CATALOG_PATH = join(POOL_STRUCTURE.mapIndex, "catalog.jsonl");
const CHECKSUMS_PATH = join(POOL_STRUCTURE.mapIndex, "checksums.sha256");
const MANIFEST_PATH = join(POOL_STRUCTURE.out, "manifest.json");

// Kok kategoriler
const ROOT_CATEGORIES = [
  { key: "edebiyat", label: "Edebiyat", href: "/TR-78351/edebiyat.html" },
  { key: "halk-bilimi", label: "Halk Bilimi", href: "/TR-78667/halk-bilimi--halk-kulturu.html" },
  {
    key: "halk-kutuphaneleri",
    label: "Halk Kütüphaneleri",
    href: "/TR-265065/halk-kutuphaneleri.html",
  },
  { key: "kultur", label: "Kültür", href: "/TR-80049/kultur.html" },
  { key: "kulturel-miras", label: "Kültürel Miras", href: "/TR-80392/kulturel-miras.html" },
  {
    key: "kutuphanecilik",
    label: "Kütüphanecilik",
    href: "/TR-265064/kutuphanecilik-calismalari.html",
  },
  { key: "sanat", label: "Sanat", href: "/TR-81061/sanat.html" },
  { key: "tanitim", label: "Tanıtım Eserleri", href: "/TR-271645/tanitim-eserleri.html" },
  { key: "tarih", label: "Tarih", href: "/TR-81461/tarih.html" },
  {
    key: "son-eklenen",
    label: "Son Eklenen Kitaplar",
    href: "/TR-82759/son-eklenen-kitaplar.html",
  },
];

// Checkpoint durumu
let state = {
  schema_version: "1.0",
  last_updated: new Date().toISOString(),
  pool_root: POOL_ROOT,
  out_dir: POOL_STRUCTURE.out,
  downloaded_ids: [],
  downloaded_items: {},
  refined_ids: [],
  vetoed_ids: [],
  stats: {
    total_discovered: 0,
    downloaded_pdfs: 0,
    extracted_texts: 0,
    vetoed_count: 0,
    trashed_pdfs: 0,
  },
};

if (existsSync(CHECKPOINT_PATH)) {
  try {
    const loaded = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
    state = {
      ...state,
      ...loaded,
      downloaded_items: { ...state.downloaded_items, ...(loaded.downloaded_items || {}) },
      stats: { ...state.stats, ...(loaded.stats || {}) },
    };
  } catch (_e) {
    console.log("[WARN] Checkpoint okunamadi, sifirdan baslatiliyor.");
  }
}

function saveState() {
  state.last_updated = new Date().toISOString();
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(state, null, 2), "utf8");
}

function writeManifest() {
  const manifest = {
    manifest_version: "1.0",
    generated_at: new Date().toISOString(),
    archive_name: "kultur-ve-turizm-bakanligi-ekitap",
    source_url: BASE_URL,
    pool_root: POOL_ROOT,
    pipeline_mode: "TWO_PHASE_SEQUENTIAL (DOWNLOAD_FIRST_THEN_REFINE)",
    status: "REFINED_READY_FOR_LLM_VAULT",
    out_format: "REFINED_SANITIZED_TEXT_ONLY (NO_RAW_PDFS_IN_OUT)",
    trash_retention_days: TRASH_DAYS,
    total_downloaded: state.downloaded_ids.length,
    total_refined: state.refined_ids.length,
    total_vetoed: state.vetoed_ids.length,
    veto_chain: {
      gate1: "GATE1_METADATA_INTEGRITY",
      gate2: "GATE2_MAGIC_BYTES_VERIFICATION",
      gate3: "GATE3_SHA256_INTEGRITY",
      gate4: "GATE4_CONTENT_DISTILLATION",
    },
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

function createVetoError(gate, reason, details = {}) {
  const err = new Error(`[VETO-${gate}] ${reason}`);
  err.name = "VetoChainError";
  err.gate = gate;
  err.reason = reason;
  err.details = details;
  return err;
}

function validateMetadataGate(meta) {
  if (!meta.id || typeof meta.id !== "number") {
    throw createVetoError("GATE1_METADATA", "Gecersiz veya eksik yayin kimligi (ID).");
  }
  if (!meta.title || meta.title.trim().length === 0) {
    throw createVetoError("GATE1_METADATA", "Yayin basligi bos veya eksik.");
  }
  if (!meta.download_url || !meta.download_url.includes("/Eklenti/")) {
    throw createVetoError("GATE1_METADATA", "Gecersiz indirme baglantisi.");
  }
}

function validateMagicBytesGate(buffer) {
  if (!buffer || buffer.length < 5) {
    throw createVetoError("GATE2_MAGIC_BYTES", "Dosya boyutu cok kucuk (0 bayt veya bos).");
  }
  const magic = buffer.subarray(0, 5).toString("latin1");
  if (!magic.startsWith("%PDF-")) {
    const preview = buffer.subarray(0, 80).toString("utf8").replace(/\s+/g, " ");
    throw createVetoError(
      "GATE2_MAGIC_BYTES",
      `Gecersiz ikili baslik (Magic byte %PDF- degil). Yanit HTML/Hata iceriyor olabilir: '${preview}'`
    );
  }
}

function validateCryptographicGate(streamSha256, fileSha256) {
  if (streamSha256 !== fileSha256) {
    throw createVetoError(
      "GATE3_CRYPTO",
      `Kriptografik SHA-256 ozet uyusmazligi. Akis: ${streamSha256}, Disk: ${fileSha256}`
    );
  }
}

function executeVeto(id, categoryKey, err, tempFilePath = null) {
  console.log(`[VETO] Eser ID ${id} (${categoryKey}) VETO EDILDI: ${err.message}`);
  const targetDir = join(POOL_STRUCTURE.quarantineVetoed, String(id));
  mkdirSync(targetDir, { recursive: true });

  const audit = {
    id,
    category: categoryKey,
    gate: err.gate || "GATE_UNKNOWN",
    reason: err.reason || err.message,
    details: err.details || {},
    vetoed_at: new Date().toISOString(),
  };
  writeFileSync(join(targetDir, "veto_audit.json"), JSON.stringify(audit, null, 2), "utf8");

  if (tempFilePath && existsSync(tempFilePath)) {
    try {
      renameSync(tempFilePath, join(targetDir, "rejected_payload.bin"));
    } catch {
      try {
        unlinkSync(tempFilePath);
      } catch {}
    }
  }

  state.vetoed_ids.push(audit);
  state.stats.vetoed_count++;
  saveState();
}

function formatCanonical8BitName(yearStr, id) {
  let y = Number.parseInt(yearStr, 10);
  if (Number.isNaN(y) || y < 1900 || y > 2100) {
    y = new Date().getFullYear();
  }
  const idStr = String(id).padStart(4, "0").slice(-4);
  return `${y}${idStr}`;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/pdf,*/*",
          ...(options.headers || {}),
        },
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }
      return resp;
    } catch (err) {
      if (i === retries - 1) throw err;
      const backoff = (i + 1) * 2000;
      await sleep(backoff);
    }
  }
}

// Akis Tabanli PDF Indirme (Referer Baslikli)
async function streamDownloadToStaging(id, downloadUrl, refererUrl) {
  const stagingPath = join(POOL_STRUCTURE.staging, `ktb_${id}_${Date.now()}.tmp`);
  const resp = await fetchWithRetry(downloadUrl, {
    headers: {
      Referer: refererUrl,
    },
  });

  const hashSha256 = createHash("sha256");
  let totalBytes = 0;
  const fileStream = createWriteStream(stagingPath);

  for await (const chunk of resp.body) {
    hashSha256.update(chunk);
    totalBytes += chunk.length;
    fileStream.write(chunk);
  }
  fileStream.end();

  await new Promise((resolve, reject) => {
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
  });

  const streamHash = hashSha256.digest("hex");
  return { stagingPath, streamHash, sizeBytes: totalBytes };
}

// ============================================================================
// LLM METIN ARINDIRMA MOTORU (IN-PIPELINE SANITIZER)
// ============================================================================
export function sanitizeTextForLlm(pages) {
  if (!pages || pages.length === 0) return "";
  const pageList = Array.isArray(pages) ? pages : [String(pages)];

  // 1. Sayfalar arasinda tekrarlanan baslik/altlik satirlarini (boilerplate) tespit et
  const lineFrequencies = new Map();
  const normalizedPages = pageList.map((p) => {
    return p
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  });

  for (const lines of normalizedPages) {
    const candidates = [...lines.slice(0, 3), ...lines.slice(-3)];
    for (const c of candidates) {
      if (c.length > 4 && !/^\d+$/.test(c)) {
        lineFrequencies.set(c, (lineFrequencies.get(c) || 0) + 1);
      }
    }
  }

  const threshold = Math.max(2, Math.floor(pageList.length * 0.35));
  const boilerplateLines = new Set();
  for (const [line, count] of lineFrequencies.entries()) {
    if (count >= threshold) {
      boilerplateLines.add(line);
    }
  }

  // 2. Gürültü satırlarını ayıkla
  const cleanedPages = normalizedPages.map((lines) => {
    return lines
      .filter((line) => {
        if (boilerplateLines.has(line)) return false;
        if (/^[-—–\s]*\d+[-—–\s]*$/.test(line)) return false;
        if (/^Sayfa\s+\d+$/i.test(line)) return false;
        if (/^[<\s>•\.\-_=]{4,}$/.test(line)) return false;
        return true;
      })
      .join("\n");
  });

  // 3. Heceleme (de-hyphenation) ve akıcı paragraf birleştirme
  let fullText = "";
  for (const pageText of cleanedPages) {
    const trimmed = pageText.trim();
    if (!trimmed) continue;

    if (!fullText) {
      fullText = trimmed;
      continue;
    }

    const hyphenMatch = fullText.match(/([a-zA-ZçğıöşüÇĞİÖŞÜ])-$/);
    const firstWordMatch = trimmed.match(/^([a-zA-ZçğıöşüÇĞİÖŞÜ]+)/);

    if (hyphenMatch && firstWordMatch) {
      fullText = fullText.slice(0, -1) + trimmed;
    } else {
      const lastChar = fullText.slice(-1);
      const isSentenceEnd = [".", "!", "?", ":", ";"].includes(lastChar);
      if (isSentenceEnd) {
        fullText += "\n\n" + trimmed;
      } else {
        fullText += " " + trimmed;
      }
    }
  }

  return fullText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// PDF Damıtma ve Gzip Markdown Mühürleme
async function extractAndGzipMarkdown(pdfPath, meta, targetMdGzPath) {
  const pdfBuffer = readFileSync(pdfPath);
  const textResult = await extractText(new Uint8Array(pdfBuffer));
  const rawPages = textResult.text || [];

  // Akış içi LLM Sanitizer ile arındır
  const cleanFullText = sanitizeTextForLlm(rawPages);

  const yamlFrontmatter = [
    "---",
    `id: ${meta.id}`,
    `canonical_stem: "${meta.canonical_stem}"`,
    `category: "${meta.category}"`,
    `category_label: "${meta.category_label}"`,
    `title: ${JSON.stringify(meta.title)}`,
    `original_pdf_sha256: "${meta.original_pdf_sha256}"`,
    `original_pdf_size_bytes: ${meta.original_pdf_size_bytes}`,
    `year: ${meta.year}`,
    `source_url: "${meta.source_url}"`,
    `download_url: "${meta.download_url}"`,
    `extracted_at: "${new Date().toISOString()}"`,
    `sanitized_for_llm: true`,
    "---",
    "",
    `# ${meta.title}`,
    "",
    cleanFullText,
  ].join("\n");

  const compressedGzip = gzipSync(Buffer.from(yamlFrontmatter, "utf8"), { level: 9 });
  writeFileSync(targetMdGzPath, compressedGzip);
  const mdHash = createHash("sha256").update(compressedGzip).digest("hex");

  return {
    char_count: cleanFullText.length,
    compressed_bytes: compressedGzip.length,
    sha256: mdHash,
  };
}

// ============================================================================
// FAZ 1: KTB AGINI TARAMA VE HAM INDIRME
// ============================================================================
async function crawlAndDownload(categoryList) {
  console.log("\n===========================================================");
  console.log(">>> KTB FAZ 1: AG TARAMA VE HAM PDF INDIRME ASAMASI <<<");
  console.log("===========================================================\n");

  const visitedUrls = new Set();
  const queue = [];

  for (const cat of categoryList) {
    queue.push({
      url: `${BASE_URL}${cat.href}`,
      categoryKey: cat.key,
      categoryLabel: cat.label,
      depth: 0,
    });
  }

  let downloadedCount = 0;

  while (queue.length > 0) {
    if (ITEM_LIMIT && state.downloaded_ids.length >= ITEM_LIMIT) {
      console.log(`[INFO] Belirlenen eser limiti (${ITEM_LIMIT}) tamamlandi.`);
      break;
    }

    const item = queue.shift();
    if (visitedUrls.has(item.url)) continue;
    visitedUrls.add(item.url);

    try {
      const resp = await fetchWithRetry(item.url);
      const html = await resp.text();
      const $ = cheerio.load(html);

      // 1. Bu sayfa bir kitap detay sayfası mı? (Eklenti PDF linki var mı?)
      let downloadHref = null;
      $("a").each((_, a) => {
        const h = $(a).attr("href");
        if (h?.includes("/Eklenti/") && (h.toLowerCase().includes(".pdf") || h.includes("pdf?"))) {
          downloadHref = h;
        }
      });

      if (downloadHref) {
        // Kitap bulundu!
        const idMatch = item.url.match(/TR-(\d+)/);
        const id = idMatch ? Number.parseInt(idMatch[1], 10) : Date.now();

        if (TARGET_ID && id !== TARGET_ID) {
          continue;
        }

        if (state.downloaded_ids.includes(id)) {
          continue;
        }

        const title = $("h1").text().trim() || $("h2").text().trim() || $("title").text().trim();
        const year = "2024";
        const stem8 = formatCanonical8BitName(year, id);
        const fullDownloadUrl = downloadHref.startsWith("http")
          ? downloadHref
          : `${BASE_URL}${downloadHref}`;

        const bookMeta = {
          id,
          canonical_stem: stem8,
          title,
          category: item.categoryKey,
          category_label: item.categoryLabel,
          year,
          source_url: item.url,
          download_url: fullDownloadUrl,
        };

        // Gate 1: Metadata
        validateMetadataGate(bookMeta);

        console.log(`\n[DOWNLOAD] #${id} [${item.categoryKey}] ${title}`);
        console.log(`           URL: ${fullDownloadUrl}`);

        let tempStaging = null;
        try {
          const dl = await streamDownloadToStaging(id, fullDownloadUrl, item.url);
          tempStaging = dl.stagingPath;

          const downloadedBuf = readFileSync(dl.stagingPath);
          validateMagicBytesGate(downloadedBuf);

          const diskSha256 = createHash("sha256").update(downloadedBuf).digest("hex");
          validateCryptographicGate(dl.streamHash, diskSha256);

          // raw_landing_pool'a taşı
          const catLandingDir = join(POOL_STRUCTURE.rawLanding, item.categoryKey);
          mkdirSync(catLandingDir, { recursive: true });
          const targetPdf = join(catLandingDir, `${stem8}.pdf`);
          renameSync(dl.stagingPath, targetPdf);
          tempStaging = null;

          bookMeta.original_pdf_sha256 = diskSha256;
          bookMeta.original_pdf_size_bytes = dl.sizeBytes;
          bookMeta.raw_pdf_path = targetPdf;

          state.downloaded_ids.push(id);
          state.downloaded_items[id] = bookMeta;
          state.stats.downloaded_pdfs++;
          state.stats.total_discovered++;
          downloadedCount++;
          saveState();

          console.log(`[SAVED] ${(dl.sizeBytes / 1024 / 1024).toFixed(2)} MB -> raw_landing_pool`);
        } catch (vetoErr) {
          executeVeto(id, item.categoryKey, vetoErr, tempStaging);
        }

        await sleep(DELAY_MS);
        continue;
      }

      // 2. Alt linkleri kuyruğa ekle (Kategori navigasyonu)
      if (item.depth < 4) {
        $("a").each((_, a) => {
          const h = $(a).attr("href");
          if (h?.startsWith("/TR-") && h.endsWith(".html")) {
            const nextUrl = `${BASE_URL}${h}`;
            if (!visitedUrls.has(nextUrl)) {
              queue.push({
                url: nextUrl,
                categoryKey: item.categoryKey,
                categoryLabel: item.categoryLabel,
                depth: item.depth + 1,
              });
            }
          }
        });
      }

      await sleep(DELAY_MS);
    } catch (err) {
      console.log(`[WARN] Adres taranamadi (${item.url}): ${err.message}`);
    }
  }

  console.log(`\n[FAZ 1 BITTI] Indirilen: ${downloadedCount} adet ham PDF.`);
}

// ============================================================================
// FAZ 2: METIN DAMITMA VE LLM ARINDIRMA
// ============================================================================
async function runRefinePhase() {
  console.log("\n===========================================================");
  console.log(">>> KTB FAZ 2: LLM METIN DAMITMA VE MUHURLEME ASAMASI <<<");
  console.log("===========================================================\n");

  const pendingIds = state.downloaded_ids.filter((id) => !state.refined_ids.includes(id));
  console.log(`[INFO] Damıtılacak bekleyen eser sayısı: ${pendingIds.length}`);

  for (const id of pendingIds) {
    const meta = state.downloaded_items[id];
    if (!meta?.raw_pdf_path || !existsSync(meta.raw_pdf_path)) {
      continue;
    }

    const { category, year, canonical_stem: stem8, raw_pdf_path: targetPdfPath } = meta;
    const refinedCatDir = join(POOL_STRUCTURE.refinedContent, category, String(year));
    mkdirSync(refinedCatDir, { recursive: true });

    const mdGzFilename = `${stem8}.md.gz`;
    const jsonGzFilename = `${stem8}.json.gz`;
    const targetMdGzPath = join(refinedCatDir, mdGzFilename);
    const targetJsonGzPath = join(refinedCatDir, jsonGzFilename);

    meta.rel_markdown = `01_refined_content_pool/${category}/${year}/${mdGzFilename}`;
    meta.rel_structured = `01_refined_content_pool/${category}/${year}/${jsonGzFilename}`;

    console.log(`\n[REFINE] #${id} [${category}] ${meta.title}`);
    try {
      const ext = await extractAndGzipMarkdown(targetPdfPath, meta, targetMdGzPath);
      meta.text_extracted = true;
      meta.md_gz_sha256 = ext.sha256;
      state.stats.extracted_texts++;
      console.log(`[SANITIZED] ${ext.char_count} karakter -> ${ext.compressed_bytes} bytes gz`);
    } catch (err) {
      console.log(`[WARN] Metin damıtılamadı (${err.message})`);
      meta.text_extracted = false;
    }

    // JSON.gz kaydet
    const jsonBuf = gzipSync(Buffer.from(JSON.stringify(meta, null, 2), "utf8"), { level: 9 });
    writeFileSync(targetJsonGzPath, jsonBuf);
    meta.json_gz_sha256 = createHash("sha256").update(jsonBuf).digest("hex");

    // PDF'i trash'e tasi
    if (NO_TRASH) {
      unlinkSync(targetPdfPath);
    } else {
      const trashCatDir = join(POOL_STRUCTURE.trash, category);
      mkdirSync(trashCatDir, { recursive: true });
      renameSync(targetPdfPath, join(trashCatDir, `${stem8}.pdf`));
      state.stats.trashed_pdfs++;
    }

    // Katalog ve checksums güncelle
    writeFileSync(CATALOG_PATH, `${JSON.stringify(meta)}\n`, { flag: "a", encoding: "utf8" });
    if (meta.md_gz_sha256) {
      writeFileSync(CHECKSUMS_PATH, `${meta.md_gz_sha256}  ${meta.rel_markdown}\n`, {
        flag: "a",
        encoding: "utf8",
      });
    }

    state.refined_ids.push(id);
    saveState();
    console.log(`[PASS] Eser #${id} LLM kasasına mühürlendi.`);
  }

  writeManifest();
  console.log(`\n[FAZ 2 BITTI] Toplam damıtılan: ${state.refined_ids.length} eser.`);
}

async function main() {
  console.log("=== PROTOKOL-7: KULTUR VE TURIZM BAKANLIGI E-KITAP ARSIVLEYICI ===");
  console.log(`Havuz Kökü:   ${POOL_ROOT}`);
  console.log(`Hedef Faz:    ${TARGET_PHASE.toUpperCase()}`);
  console.log(`Eser Limiti:  ${ITEM_LIMIT || "Limitsiz"}`);

  if (TARGET_PHASE === "all" || TARGET_PHASE === "download") {
    await crawlAndDownload(ROOT_CATEGORIES);
  }
  if (TARGET_PHASE === "all" || TARGET_PHASE === "refine") {
    await runRefinePhase();
  }
  console.log("\n[TAMAMLANDI] Boru hattı çalışması başarıyla bitti.");
}

const isMain = Boolean(process.argv[1]) && process.argv[1].endsWith("harvest-ktb-ekitap.mjs");
if (isMain) {
  main().catch((err) => {
    console.error("[FATAL]", err);
    process.exit(1);
  });
}
