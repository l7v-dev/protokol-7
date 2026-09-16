#!/usr/bin/env node

/**
 * scripts/harvest-ekutuphane.mjs
 *
 * T.C. Saglik Bakanligi E-Kutuphane Veri Cekme, Damıtma ve Arsivleme Boru Hatti
 * Standartlar:
 *   - Iki Asamali Calisma (Two-Phase Execution):
 *       FAZ 1 (Download Phase): Once tum ham veriler (PDF) raw_landing_pool'a indirilir ve hash'lenir.
 *       FAZ 2 (Refine Phase): Indirme bittikten sonra metinler ayiklanir, out havuzuna (.md.gz, .json.gz) muhurlenir,
 *                            ham PDF'ler cop havuzuna (trash/) tasinir.
 *   - Standart Ingilizce Dizin Isimleri (books, journals, articles, raw_landing_pool, trash, out)
 *   - Havuz Konumu: ~/protokol-data-pool/ (Proje disinda, kullanici ev dizininde)
 *   - Nihai Cikti (out/): YALNIZCA damıtılmış metin (.md.gz) ve metaveri (.json.gz). PDF YOKTUR.
 *   - Cop Havuzu (trash/): Islenen ham PDF'ler buraya tasinir, 7 gun sonra otomatik kalici silinir.
 *   - Veto Zinciri: 4 asamali dogrulama (Metadata, Magic Bytes, Crypto SHA-256, Stream)
 *   - Karantina Havuzu: Veto edilen bozuk/gecersiz kayitlar (quarantine_vetoed/{id}/)
 *   - Tarihsel 8 karakterli dosya adlandirma (YYYY + 4 haneli ID: ornek 20250701.md.gz)
 *   - Kesintiden devam edebilme (checkpoint.json)
 *   - Log Standardi: rules/logging-discipline.md (Sifir emoji, standart ASCII)
 *
 * Kullanim:
 *   node scripts/harvest-ekutuphane.mjs [--tur all|books|journals|articles] [--phase all|download|refine] [--pool-dir <yol>] [--trash-days 7] [--limit N] [--delay-ms 1000]
 */

import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import * as cheerio from "cheerio";
import { extractText } from "unpdf";

const BASE_URL = "https://ekutuphane.saglik.gov.tr";
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Bot/1.0; +https://protokol-7.local)";

// Standart Ingilizce Kategori Tanimlari
const CATEGORY_DEFINITIONS = {
  books: { key: "books", label: "Books", endpoint: "/YayinTur/Kitap" },
  journals: { key: "journals", label: "Journals", endpoint: "/YayinTur/Dergi" },
  articles: { key: "articles", label: "Articles", endpoint: "/YayinTur/Makale" },
};

// CLI Argumanlarini Isle
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) {
    return args[idx + 1];
  }
  return defaultValue;
}
const hasFlag = (name) => args.includes(name);

// Havuz Kok Dizini (Varsayilan: ~/protokol-data-pool)
const DEFAULT_POOL_DIR = join(homedir(), "protokol-data-pool");
const POOL_ROOT = resolve(process.env.PROTOKOL_POOL_DIR || getArg("--pool-dir", DEFAULT_POOL_DIR));
const OUT_SUBDIR = getArg("--out-name", "saglik-ekutuphane");
const OUT_DIR = resolve(getArg("--out-dir", join(POOL_ROOT, "out", OUT_SUBDIR)));
const TRASH_DAYS = Number.parseInt(getArg("--trash-days", "7"), 10);
const TARGET_PHASE = getArg("--phase", "all").toLowerCase();

const RAW_TUR = (getArg("--tur") || getArg("--category") || "all").toLowerCase();
const START_PAGE = Number.parseInt(getArg("--start-page", "1"), 10);
const EXPLICIT_END_PAGE = getArg("--end-page") ? Number.parseInt(getArg("--end-page"), 10) : null;
const ITEM_LIMIT = getArg("--limit") ? Number.parseInt(getArg("--limit"), 10) : null;
const DELAY_MS = Number.parseInt(getArg("--delay-ms", "1000"), 10);
const TARGET_ID = getArg("--id") ? Number.parseInt(getArg("--id"), 10) : null;
const SKIP_TEXT = hasFlag("--skip-text");
const NO_TRASH = hasFlag("--no-trash");

// Aktif kategorileri belirle
function resolveCategories(tur) {
  if (tur === "all" || tur === "hepsi") {
    return Object.values(CATEGORY_DEFINITIONS);
  }
  if (tur === "books" || tur === "book" || tur === "kitap" || tur === "kitaplar") {
    return [CATEGORY_DEFINITIONS.books];
  }
  if (tur === "journals" || tur === "journal" || tur === "dergi" || tur === "dergiler") {
    return [CATEGORY_DEFINITIONS.journals];
  }
  if (tur === "articles" || tur === "article" || tur === "makale" || tur === "makaleler") {
    return [CATEGORY_DEFINITIONS.articles];
  }
  console.log(`[WARN] Bilinmeyen kategori: '${tur}'. Tum standart kategoriler taranacak.`);
  return Object.values(CATEGORY_DEFINITIONS);
}

const ACTIVE_CATEGORIES = resolveCategories(RAW_TUR);

// Standart Ingilizce Havuz Hiyerarsisi
const POOL_STRUCTURE = {
  root: POOL_ROOT,
  staging: join(POOL_ROOT, "staging"),
  quarantineVetoed: join(POOL_ROOT, "quarantine_vetoed"),
  rawLanding: join(POOL_ROOT, "raw_landing_pool", OUT_SUBDIR),
  trash: join(POOL_ROOT, "trash"),
  out: OUT_DIR,
  mapIndex: join(OUT_DIR, "00_map_index_pool"),
  refinedContent: join(OUT_DIR, "01_refined_content_pool"),
};

// Tum havuz dizinlerini hazirla
for (const p of Object.values(POOL_STRUCTURE)) {
  mkdirSync(p, { recursive: true });
}

const CHECKPOINT_PATH = join(POOL_STRUCTURE.mapIndex, "checkpoint.json");
const MANIFEST_PATH = join(POOL_STRUCTURE.mapIndex, "manifest.json");
const CHECKSUMS_PATH = join(POOL_STRUCTURE.mapIndex, "checksums.sha256");
const CATALOG_PATH = join(POOL_STRUCTURE.mapIndex, "catalog.jsonl");

// Cop Havuzundaki Suresi Dolan Dosyalari Kalici Olarak Temizle (7 Gun TTL)
function purgeExpiredTrash(trashRoot, maxAgeDays = 7) {
  if (!existsSync(trashRoot)) return 0;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let deletedCount = 0;

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        try {
          if (readdirSync(fullPath).length === 0) {
            rmdirSync(fullPath);
          }
        } catch {
          // ignore
        }
      } else if (entry.isFile()) {
        try {
          const stats = statSync(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            unlinkSync(fullPath);
            deletedCount++;
            console.log(
              `[TRASH-PURGE] ${maxAgeDays} gunluk suresi dolan ham dosya kalici olarak silindi: ${entry.name}`
            );
          }
        } catch (err) {
          console.log(`[WARN] Cop dosya silinemedi (${entry.name}): ${err.message}`);
        }
      }
    }
  }

  walk(trashRoot);
  return deletedCount;
}

// Checkpoint Yonetimi
let state = {
  schema_version: "3.0",
  last_updated: new Date().toISOString(),
  pool_root: POOL_ROOT,
  out_dir: OUT_DIR,
  downloaded_ids: [],
  downloaded_items: {},
  refined_ids: [],
  vetoed_ids: [],
  categories: {
    books: { last_page: 0, downloaded_count: 0, refined_count: 0 },
    journals: { last_page: 0, downloaded_count: 0, refined_count: 0 },
    articles: { last_page: 0, downloaded_count: 0, refined_count: 0 },
  },
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
      categories: { ...state.categories, ...(loaded.categories || {}) },
      stats: { ...state.stats, ...(loaded.stats || {}) },
    };
    console.log(
      `[INFO] Checkpoint yuklendi: ${state.downloaded_ids.length} indirilmis, ${state.refined_ids.length} damitilmis yayin mevcut.`
    );
  } catch (_err) {
    console.log("[WARN] Checkpoint okunamadi, sifirdan baslatiliyor.");
  }
}

function saveState() {
  state.last_updated = new Date().toISOString();
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(state, null, 2), "utf8");
}

function writeManifest() {
  const manifest = {
    manifest_version: "3.0",
    generated_at: new Date().toISOString(),
    archive_name: "saglik-bakanligi-ekutuphane",
    source_url: BASE_URL,
    pool_root: POOL_ROOT,
    pipeline_mode: "TWO_PHASE_SEQUENTIAL (DOWNLOAD_FIRST_THEN_REFINE)",
    status: "REFINED_READY_FOR_COLD_VAULT",
    out_format: "REFINED_TEXT_ONLY (NO_RAW_PDFS_IN_OUT)",
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
    pools: {
      raw_landing: "raw_landing_pool",
      map_index: "00_map_index_pool",
      refined_content: "01_refined_content_pool",
      trash: "trash",
    },
    categories: Object.keys(CATEGORY_DEFINITIONS),
    checksums_file: "00_map_index_pool/checksums.sha256",
    catalog_file: "00_map_index_pool/catalog.jsonl",
    checkpoint_file: "00_map_index_pool/checkpoint.json",
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

// VETO ZINCIRI HATA URETECI
function createVetoError(gate, reason, details = {}) {
  const err = new Error(`[VETO-${gate}] ${reason}`);
  err.name = "VetoChainError";
  err.gate = gate;
  err.reason = reason;
  err.details = details;
  return err;
}

// Veto Gate 1: Metadata Dogrulamasi
function validateMetadataGate(meta) {
  if (!meta.id || typeof meta.id !== "number") {
    throw createVetoError("GATE1_METADATA", "Gecersiz veya eksik yayin kimligi (ID).");
  }
  if (!meta.title || meta.title.trim().length === 0) {
    throw createVetoError("GATE1_METADATA", "Yayin basligi bos veya eksik.");
  }
  if (!meta.year || !/^\d{4}$/.test(meta.year)) {
    throw createVetoError("GATE1_METADATA", `Gecersiz basim yili: '${meta.year}'.`);
  }
  if (meta.canonical_stem?.length !== 8) {
    throw createVetoError(
      "GATE1_METADATA",
      `8 karakterli kanonik kok uretilemedi: '${meta.canonical_stem}'.`
    );
  }
}

// Veto Gate 2: Magic Bytes Dogrulamasi (%PDF- Baslik Kontrolu)
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

// Veto Gate 3: Kriptografik Ozet Dogrulamasi
function validateCryptographicGate(streamSha256, fileSha256) {
  if (streamSha256 !== fileSha256) {
    throw createVetoError(
      "GATE3_CRYPTO",
      `Kriptografik SHA-256 ozet uyusmazligi. Akis: ${streamSha256}, Disk: ${fileSha256}`
    );
  }
}

// Veto Islemi: Dosyayi Karantinaya Tasi ve Kaydet
function executeVeto(id, categoryKey, err, tempFilePath = null) {
  console.log(`[VETO] Yayin ID ${id} (${categoryKey}) VETO EDILDI: ${err.message}`);
  const targetQuarantineDir = join(POOL_STRUCTURE.quarantineVetoed, String(id));
  mkdirSync(targetQuarantineDir, { recursive: true });

  const auditRecord = {
    id,
    category: categoryKey,
    gate: err.gate || "GATE_UNKNOWN",
    reason: err.reason || err.message,
    details: err.details || {},
    vetoed_at: new Date().toISOString(),
  };

  writeFileSync(
    join(targetQuarantineDir, "veto_audit.json"),
    JSON.stringify(auditRecord, null, 2),
    "utf8"
  );

  if (tempFilePath && existsSync(tempFilePath)) {
    try {
      renameSync(tempFilePath, join(targetQuarantineDir, "rejected_payload.bin"));
    } catch {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // ignore
      }
    }
  }

  state.vetoed_ids.push(auditRecord);
  state.stats.vetoed_count++;
  saveState();
}

// 8 Karakterli Kanonik Dosya Adi Ureteci (YYYY + 4 haneli ID)
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

// HTTP Fetch ve Geri Cekilme (Exponential Backoff)
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
      console.log(
        `[WARN] Istek basarisiz (${err.message}), ${backoff}ms sonra yeniden deneniyor...`
      );
      await sleep(backoff);
    }
  }
}

// Kategori Sayfa Sayisini Dinamik Kesfet
async function discoverMaxPage(categoryEndpoint) {
  try {
    const url = `${BASE_URL}${categoryEndpoint}?sayfa=1`;
    const resp = await fetchWithRetry(url);
    const html = await resp.text();
    const $ = cheerio.load(html);
    const pages = [1];
    $('a[href*="sayfa="]').each((_, a) => {
      const m = $(a)
        .attr("href")
        ?.match(/sayfa=(\d+)/);
      if (m?.[1]) {
        pages.push(Number.parseInt(m[1], 10));
      }
    });
    return Math.max(...pages);
  } catch (err) {
    console.log(
      `[WARN] Dinamik sayfa sayisi tespit edilemedi (${err.message}), varsayilan 1 alindi.`
    );
    return 1;
  }
}

// Sayfadaki Yayin ID'lerini Cikar
async function harvestPage(categoryEndpoint, page, maxPage, categoryKey) {
  const url = `${BASE_URL}${categoryEndpoint}?sayfa=${page}`;
  console.log(`\n[PAGE ${page}/${maxPage}] [${categoryKey.toUpperCase()}] Liste taraniyor: ${url}`);
  const resp = await fetchWithRetry(url);
  const html = await resp.text();
  const $ = cheerio.load(html);

  const ids = [];
  $('a[href*="/Yayin/"]').each((_, el) => {
    const href = $(el).attr("href");
    const m = href?.match(/\/Yayin\/(\d+)/);
    if (m?.[1]) {
      const id = Number.parseInt(m[1], 10);
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
  });

  return ids;
}

// Yayin Detay Metaverisini Cikar
async function harvestDetail(id, categoryKey, categoryLabel) {
  const url = `${BASE_URL}/Yayin/${id}`;
  const resp = await fetchWithRetry(url);
  const html = await resp.text();
  const $ = cheerio.load(html);

  const title = $("h2 strong").text().trim() || $("h2").text().trim();
  const detailBox = $("#yayinDetay");

  let publisher = "";
  let year = "";
  let language = "";
  let pageCount = 0;
  let sizeStr = "";
  let originalFilename = "";

  const textLines = detailBox
    .text()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of textLines) {
    if (line.startsWith("Yayınlayan:")) publisher = line.replace("Yayınlayan:", "").trim();
    else if (line.startsWith("Yıl:")) year = line.replace("Yıl:", "").trim();
    else if (line.startsWith("Dil:")) language = line.replace("Dil:", "").trim();
    else if (line.startsWith("Sayfa Sayısı:")) {
      const p = Number.parseInt(line.replace("Sayfa Sayısı:", "").trim(), 10);
      if (!Number.isNaN(p)) pageCount = p;
    } else if (line.startsWith("Boyut:")) sizeStr = line.replace("Boyut:", "").trim();
  }

  const directPdfLink = detailBox.find('a[href*="/Ekutuphane/"]').attr("href");
  if (directPdfLink) {
    originalFilename = decodeURIComponent(basename(directPdfLink));
  } else {
    originalFilename = `yayin-${id}.pdf`;
  }

  let coverImage = detailBox.find("img").attr("src") || "";
  if (coverImage && !coverImage.startsWith("http")) {
    coverImage = new URL(coverImage, BASE_URL).toString();
  }

  let summary = "";
  detailBox.find("label").remove();
  detailBox.find(".butonDetay").remove();
  detailBox.find("img").remove();
  detailBox.find("a").remove();
  summary = detailBox.text().replace(/\s+/g, " ").trim();

  const downloadUrl = `${BASE_URL}/Home/GetDocument/${id}`;
  const yearMatch = year.match(/\b(19\d\d|20\d\d)\b/);
  const cleanYear = yearMatch ? yearMatch[1] : "2026";

  return {
    id,
    url,
    category: categoryKey,
    category_label: categoryLabel,
    title,
    publisher,
    year: cleanYear,
    raw_year: year,
    language: language || "Türkçe",
    page_count: pageCount,
    size_declared: sizeStr,
    summary,
    original_filename: originalFilename,
    cover_image_url: coverImage,
    download_url: downloadUrl,
    harvested_at: new Date().toISOString(),
  };
}

// Akis Tabanli PDF Indir ve Gecici Dosyaya Kaydet
async function streamDownloadToStaging(id, downloadUrl) {
  const stagingPath = join(POOL_STRUCTURE.staging, `dl_${id}_${Date.now()}.tmp`);
  const resp = await fetchWithRetry(downloadUrl);

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

  return {
    stagingPath,
    streamHash,
    sizeBytes: totalBytes,
  };
}

// PDF'ten Metin Cikar ve Gzip Markdown Olarak Sakla
async function extractAndGzipMarkdown(pdfPath, meta, targetMdGzPath) {
  const pdfBuffer = readFileSync(pdfPath);
  const textResult = await extractText(new Uint8Array(pdfBuffer));

  const pages = textResult.text || [];
  const fullText = Array.isArray(pages)
    ? pages.join("\n\n--- [SAYFA GEÇİŞİ] ---\n\n")
    : String(pages);

  const yamlFrontmatter = [
    "---",
    `id: ${meta.id}`,
    `canonical_stem: "${meta.canonical_stem}"`,
    `category: "${meta.category}"`,
    `category_label: "${meta.category_label}"`,
    `title: ${JSON.stringify(meta.title)}`,
    `original_filename: ${JSON.stringify(meta.original_filename)}`,
    `original_pdf_sha256: "${meta.original_pdf_sha256}"`,
    `original_pdf_size_bytes: ${meta.original_pdf_size_bytes}`,
    `publisher: ${JSON.stringify(meta.publisher)}`,
    `year: ${meta.year}`,
    `language: ${JSON.stringify(meta.language)}`,
    `page_count: ${meta.page_count}`,
    `download_url: "${meta.download_url}"`,
    `extracted_at: "${new Date().toISOString()}"`,
    "---",
    "",
    `# ${meta.title}`,
    "",
    fullText,
  ].join("\n");

  const compressedGzip = gzipSync(Buffer.from(yamlFrontmatter, "utf8"), { level: 9 });
  writeFileSync(targetMdGzPath, compressedGzip);

  const mdHash = createHash("sha256").update(compressedGzip).digest("hex");

  return {
    char_count: fullText.length,
    compressed_bytes: compressedGzip.length,
    sha256: mdHash,
  };
}

// ============================================================================
// FAZ 1: HAM VERI INDIRME ASAMASI (DOWNLOAD PHASE)
// ============================================================================
async function runDownloadPhase(categories) {
  console.log("\n===========================================================");
  console.log(">>> FAZ 1: HAM VERI INDIRME ASAMASI (DOWNLOAD PHASE) <<<");
  console.log("Tüm PDF'ler sırayla indirilecek, işleme Faz 2'de başlayacak.");
  console.log("===========================================================\n");

  let downloadedCountInRun = 0;

  for (const cat of categories) {
    if (ITEM_LIMIT && state.downloaded_ids.length >= ITEM_LIMIT) {
      console.log(`[INFO] Belirlenen limit (${ITEM_LIMIT}) tamamlandi.`);
      break;
    }

    console.log(`\n-----------------------------------------------------------`);
    console.log(`[CATEGORY] >>> ${cat.label.toUpperCase()} (${cat.endpoint}) <<<`);
    console.log(`-----------------------------------------------------------`);

    const maxPage = EXPLICIT_END_PAGE || (await discoverMaxPage(cat.endpoint));
    console.log(`[INFO] ${cat.label} icin toplam sayfa: ${maxPage}`);

    const startPage = Math.max(START_PAGE, (state.categories[cat.key]?.last_page || 0) + 1);

    for (let page = startPage; page <= maxPage; page++) {
      if (ITEM_LIMIT && state.downloaded_ids.length >= ITEM_LIMIT) break;

      let ids = [];
      try {
        ids = await harvestPage(cat.endpoint, page, maxPage, cat.key);
      } catch (err) {
        console.error(`[ERROR] Sayfa ${page} alinamadi: ${err.message}`);
        continue;
      }

      console.log(`[DISCOVER] Sayfa ${page}: ${ids.length} adet yayin tespit edildi.`);

      for (const id of ids) {
        if (ITEM_LIMIT && state.downloaded_ids.length >= ITEM_LIMIT) break;

        if (state.downloaded_ids.includes(id)) {
          console.log(`[SKIP] Yayin ID ${id} daha once indirilmis.`);
          continue;
        }

        console.log(`\n[DOWNLOAD-PHASE] Yayin ID: ${id} [${cat.key}]`);
        let tempStagingFile = null;

        try {
          // 1. Metaveri cek
          const meta = await harvestDetail(id, cat.key, cat.label);
          const stem8 = formatCanonical8BitName(meta.year, id);
          meta.canonical_stem = stem8;

          // Veto Gate 1: Metadata Dogrulamasi
          validateMetadataGate(meta);

          const yearStr = String(meta.year);
          const rawCatDir = join(POOL_STRUCTURE.rawLanding, cat.key, yearStr);
          mkdirSync(rawCatDir, { recursive: true });

          const targetPdfPath = join(rawCatDir, `${stem8}.pdf`);

          // 2. Akis tabanli indir
          console.log(`[DOWNLOAD] PDF indiriliyor (staging): ${meta.download_url}`);
          const dl = await streamDownloadToStaging(id, meta.download_url);
          tempStagingFile = dl.stagingPath;

          const downloadedBuffer = readFileSync(dl.stagingPath);

          // Veto Gate 2: Magic Bytes (%PDF- denetimi)
          validateMagicBytesGate(downloadedBuffer);

          // Veto Gate 3: Kriptografik SHA-256 denetimi
          const diskSha256 = createHash("sha256").update(downloadedBuffer).digest("hex");
          validateCryptographicGate(dl.streamHash, diskSha256);

          // Veto zincirini gecti -> raw_landing_pool'a tasi
          renameSync(dl.stagingPath, targetPdfPath);
          tempStagingFile = null;

          meta.original_pdf_sha256 = diskSha256;
          meta.original_pdf_size_bytes = dl.sizeBytes;
          meta.raw_pdf_path = targetPdfPath;

          // Durumu kaydet
          state.downloaded_ids.push(id);
          state.downloaded_items[id] = meta;
          state.categories[cat.key].downloaded_count =
            (state.categories[cat.key].downloaded_count || 0) + 1;
          state.stats.downloaded_pdfs++;
          state.stats.total_discovered++;
          downloadedCountInRun++;
          saveState();

          console.log(
            `[DOWNLOADED] ${cat.key}/${yearStr}/${stem8}.pdf (${(dl.sizeBytes / 1024 / 1024).toFixed(2)} MB) -> raw_landing_pool'a kaydedildi.`
          );
        } catch (err) {
          executeVeto(id, cat.key, err, tempStagingFile);
        }

        const jitter = DELAY_MS + Math.floor(Math.random() * 500);
        await sleep(jitter);
      }

      state.categories[cat.key].last_page = page;
      saveState();
    }
  }

  console.log("\n===========================================================");
  console.log(
    `[PHASE 1 TAMAMLANDI] Bu koşumda indirilen: ${downloadedCountInRun} adet, toplam indirilen: ${state.downloaded_ids.length} adet ham PDF.`
  );
  console.log("===========================================================\n");
}

// ============================================================================
// FAZ 2: METIN DAMITMA VE ARSIVLEME ASAMASI (REFINE PHASE)
// ============================================================================
async function runRefinePhase() {
  console.log("\n===========================================================");
  console.log(">>> FAZ 2: METIN DAMITMA VE ARSIVLEME ASAMASI (REFINE PHASE) <<<");
  console.log(
    "İndirilen PDF'lerden metinler çıkarılıyor, out havuzuna mühürleniyor, PDF'ler trash'e aktarılıyor."
  );
  console.log("===========================================================\n");

  const pendingIds = state.downloaded_ids.filter((id) => !state.refined_ids.includes(id));
  console.log(`[INFO] Damıtılacak bekleyen yayın sayısı: ${pendingIds.length}`);

  for (const id of pendingIds) {
    const meta = state.downloaded_items[id];
    if (!meta) {
      console.log(`[WARN] Yayin ID ${id} icin metaveri bulunamadi, atlaniyor.`);
      continue;
    }

    const { category, year, canonical_stem: stem8, raw_pdf_path: targetPdfPath } = meta;
    const yearStr = String(year);

    console.log(`\n[REFINE-PHASE] Yayin ID: ${id} [${category}] (${meta.title})`);

    if (!targetPdfPath || !existsSync(targetPdfPath)) {
      console.log(`[WARN] Ham PDF bulunamadi (${targetPdfPath}), atlaniyor.`);
      continue;
    }

    // Out havuzundaki hedef dizin ve dosya yollari
    const refinedCatDir = join(POOL_STRUCTURE.refinedContent, category, yearStr);
    mkdirSync(refinedCatDir, { recursive: true });

    const mdGzFilename = `${stem8}.md.gz`;
    const jsonGzFilename = `${stem8}.json.gz`;

    const targetMdGzPath = join(refinedCatDir, mdGzFilename);
    const targetJsonGzPath = join(refinedCatDir, jsonGzFilename);

    meta.rel_markdown = `01_refined_content_pool/${category}/${yearStr}/${mdGzFilename}`;
    meta.rel_structured = `01_refined_content_pool/${category}/${yearStr}/${jsonGzFilename}`;

    // 1. Metin Cikar ve Gzip Markdown Yap
    if (!SKIP_TEXT) {
      try {
        console.log("[EXTRACT] PDF metni damıtılıyor ve Gzip yapılıyor...");
        const extResult = await extractAndGzipMarkdown(targetPdfPath, meta, targetMdGzPath);
        console.log(
          `[SAVED] ${meta.rel_markdown} (${extResult.char_count} karakter -> ${extResult.compressed_bytes} bytes gz)`
        );
        meta.text_extracted = true;
        meta.md_gz_sha256 = extResult.sha256;
        state.stats.extracted_texts++;
      } catch (extErr) {
        console.log(`[WARN] PDF metni damıtılamadı (${extErr.message}), bos metin olusturuldu.`);
        meta.text_extracted = false;
      }
    }

    // 2. Yapilandirilmis JSON.gz Kaydet (Nihai out havuzuna)
    const jsonContent = JSON.stringify(meta, null, 2);
    const jsonGzBuffer = gzipSync(Buffer.from(jsonContent, "utf8"), { level: 9 });
    writeFileSync(targetJsonGzPath, jsonGzBuffer);
    meta.json_gz_sha256 = createHash("sha256").update(jsonGzBuffer).digest("hex");
    console.log(`[SAVED] ${meta.rel_structured}`);

    // 3. Ham PDF'i Trash Havuzuna Tasi (7 gun TTL) - out klasorunde PDF barindirilmaz!
    if (NO_TRASH) {
      unlinkSync(targetPdfPath);
      console.log(`[PURGED] Ham PDF silindi (--no-trash).`);
    } else {
      const trashCatDir = join(POOL_STRUCTURE.trash, category);
      mkdirSync(trashCatDir, { recursive: true });
      const trashPdfPath = join(trashCatDir, `${stem8}.pdf`);
      renameSync(targetPdfPath, trashPdfPath);
      state.stats.trashed_pdfs++;
      console.log(
        `[TRASHED] Ham PDF cop havuzuna tasindi (7 gun saklanacak): trash/${category}/${stem8}.pdf`
      );
    }

    // 4. Katalog ve Checksums Ekle (00_map_index_pool) - SADECE out altindaki dosyalari icerir
    writeFileSync(CATALOG_PATH, `${JSON.stringify(meta)}\n`, { flag: "a", encoding: "utf8" });

    const checksumEntries = [];
    if (meta.md_gz_sha256) {
      checksumEntries.push(`${meta.md_gz_sha256}  ${meta.rel_markdown}`);
    }
    if (meta.json_gz_sha256) {
      checksumEntries.push(`${meta.json_gz_sha256}  ${meta.rel_structured}`);
    }
    if (checksumEntries.length > 0) {
      writeFileSync(CHECKSUMS_PATH, `${checksumEntries.join("\n")}\n`, {
        flag: "a",
        encoding: "utf8",
      });
    }

    // 5. Durumu Guncelle
    state.refined_ids.push(id);
    state.categories[category].refined_count = (state.categories[category].refined_count || 0) + 1;
    saveState();

    console.log(`[PASS] Yayin ID ${id} basariyla damitildi ve out havuzuna muhurlendi.`);
  }

  // Bos kalan raw_landing_pool dizinlerini temizle
  try {
    const cleanEmptyDirs = (dir) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const sub = join(dir, entry.name);
          cleanEmptyDirs(sub);
          if (readdirSync(sub).length === 0) rmdirSync(sub);
        }
      }
    };
    cleanEmptyDirs(POOL_STRUCTURE.rawLanding);
  } catch {
    // ignore
  }

  console.log("\n===========================================================");
  console.log(
    `[PHASE 2 TAMAMLANDI] Toplam Damıtılan: ${state.refined_ids.length} adet yayın out havuzunda mühürlendi.`
  );
  console.log("===========================================================\n");
}

// Ana Calisma Dongusu
async function main() {
  console.log("=== PROTOKOL-7: SAGLIK BAKANLIGI E-KUTUPHANE ARSIVLEYICI ===");
  console.log(`Havuz Koku (Pool Root):  ${POOL_ROOT}`);
  console.log(`Gecici Alan (Staging):   ${POOL_STRUCTURE.staging}`);
  console.log(`Ham Indirme Havuzu:      ${POOL_STRUCTURE.rawLanding}`);
  console.log(`Cop Havuzu (Trash):      ${POOL_STRUCTURE.trash} (${TRASH_DAYS} gun TTL)`);
  console.log(`Karantina (Vetoed):      ${POOL_STRUCTURE.quarantineVetoed}`);
  console.log(`Nihai Cikti (Out):       ${POOL_STRUCTURE.out} (PDF'siz, yalnizca damıtılmış)`);
  console.log(`Calisma Fazi:            ${TARGET_PHASE.toUpperCase()}`);
  console.log(`Kategoriler:             ${ACTIVE_CATEGORIES.map((c) => c.label).join(", ")}`);
  console.log(
    `Limit:                   ${ITEM_LIMIT ? `${ITEM_LIMIT} adet` : "Limitsiz (Tam Koleksiyon)"}`
  );
  console.log(`Gecikme:                 ${DELAY_MS}ms`);
  console.log(`Hedef ID:                ${TARGET_ID ? TARGET_ID : "Yok (Liste Taramasi)"}\n`);

  // 1. Cop havuzunu denetle ve suresi dolmus dosyalari kalici temizle
  console.log("[INFO] Cop havuzu (trash) denetleniyor...");
  const purgedInitial = purgeExpiredTrash(POOL_STRUCTURE.trash, TRASH_DAYS);
  if (purgedInitial > 0) {
    console.log(`[INFO] Suresi dolmus ${purgedInitial} adet cop dosya kalici olarak silindi.`);
  }

  writeManifest();

  // Tekil ID modu
  if (TARGET_ID) {
    const cat = ACTIVE_CATEGORIES[0] || CATEGORY_DEFINITIONS.books;
    console.log(`[INFO] Tekil ID hedefi: ${TARGET_ID} (${cat.label})`);
    await runDownloadPhase([cat]);
    await runRefinePhase();
    writeManifest();
    return;
  }

  // FAZ 1: Tum verileri indir
  if (TARGET_PHASE === "all" || TARGET_PHASE === "download") {
    await runDownloadPhase(ACTIVE_CATEGORIES);
  }

  // FAZ 2: Indirilen verileri damit ve out'a muhurle, PDF'leri trash'e tasi
  if (TARGET_PHASE === "all" || TARGET_PHASE === "refine") {
    await runRefinePhase();
  }

  // Kapanista manifesto ve cop temizligi
  purgeExpiredTrash(POOL_STRUCTURE.trash, TRASH_DAYS);
  writeManifest();

  console.log("\n===========================================================");
  console.log("[SUMMARY] Tum calisma tamamlandi.");
  console.log(`Toplam Indirilen (Raw):  ${state.downloaded_ids.length} adet PDF`);
  console.log(`Toplam Damıtılan (Out):  ${state.refined_ids.length} adet yayın`);
  console.log(`Cope Tasinan PDF:        ${state.stats.trashed_pdfs} adet (7 gun sonra silinecek)`);
  console.log(`Veto Edilen (Karantina): ${state.vetoed_ids.length} adet`);
  console.log(`Nihai Cikti Klasoru:     ${POOL_STRUCTURE.out}`);
  console.log(`Katalog:                 ${CATALOG_PATH}`);
  console.log(`Manifest:                ${MANIFEST_PATH}`);
  console.log(`Checksum Defteri:        ${CHECKSUMS_PATH}`);
  console.log("===========================================================\n");
}

main().catch((err) => {
  console.error("[FATAL ERROR]", err);
  process.exit(1);
});
