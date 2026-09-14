#!/usr/bin/env node

/**
 * scripts/verify-pipeline.mjs
 *
 * Deterministik Doğrulama Hattı (Verification Pipeline Runner)
 * Ref: rules/verification-pipeline.md, rules/failure-checklist.md, rules/logging-discipline.md
 *
 * Kontroller:
 * 1. Dizin ve Mimari Bütünlük (Rules, Context, Skills, TASKS.md, Docs/plans, Docs/walkthroughs, Biome)
 * 2. Naming Discipline (Yasaklı pazarlama buzzword taraması)
 * 3. Logging Discipline (Sıfır emoji taraması)
 * 4. Canlı Bağımlılık / SCA Kontrolü
 * 5. Kod Stili ve Statik Analiz (Biome Lint & Format Denetimi)
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

console.log("=== OMEGA-3 DETERMINISTIK DOGRULAMA HATTI BASLATILIYOR ===\n");

let passed = true;

// 1. Dizin ve Mimari Bütünlük
console.log("[1/5] Mimari Dosya Butunlugu Denetleniyor...");
const REQUIRED_PATHS = [
  "AGENTS.md",
  "TASKS.md",
  "biome.json",
  "rules/trust-tiers.md",
  "rules/failure-checklist.md",
  "rules/metacognition.md",
  "rules/verification-pipeline.md",
  "rules/logging-discipline.md",
  "rules/task-discipline.md",
  "context/",
  "skills/",
  "docs/plans/",
  "docs/walkthroughs/",
  "archive/index.jsonl",
];

const missing = [];
for (const p of REQUIRED_PATHS) {
  if (!existsSync(p)) {
    missing.push(p);
  }
}

if (missing.length > 0) {
  console.error(`[ERROR] Eksik mimari yollar tespit edildi: ${missing.join(", ")}`);
  passed = false;
} else {
  console.log("[OK] Zorunlu mimari dosyalar ve dizinler mevcut.\n");
}

// 2. Naming Discipline (Yasaklı Buzzword Taraması)
console.log("[2/5] Isimlendirme Disiplini (Naming Discipline) Taranıyor...");
const BANNED_WORDS = [
  "smart",
  "intelligent",
  "next-gen",
  "ultra",
  "seamless",
  "magical",
  "lightning",
];

function scanNaming(dir) {
  const violations = [];
  if (!existsSync(dir)) return violations;
  const files = readdirSync(dir);
  for (const f of files) {
    if (f.startsWith(".") || f === "node_modules" || f === "archive" || f === "dist") continue;
    const fullPath = join(dir, f);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (f !== "skills" && f !== "docs") {
        violations.push(...scanNaming(fullPath));
      }
    } else if (f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".mjs")) {
      const content = readFileSync(fullPath, "utf8");
      for (const word of BANNED_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, "i");
        if (regex.test(content) && !fullPath.includes("verify-pipeline.mjs")) {
          violations.push({ file: fullPath, word });
        }
      }
    }
  }
  return violations;
}

const namingViolations = scanNaming(".");
if (namingViolations.length > 0) {
  console.warn(`[WARN] Isimlendirme uyarilari (${namingViolations.length} adet):`);
  for (const v of namingViolations.slice(0, 5)) {
    console.warn(`       - ${v.file}: '${v.word}' kelimesi tespit edildi.`);
  }
} else {
  console.log("[OK] Kod dosyalarinda yasakli pazarlama terimi bulunamadi.\n");
}

// 3. Logging Discipline (Sıfır Emoji Taraması)
console.log("[3/5] Loglama Disiplini (Sıfır Emoji) Taranıyor...");
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

function scanEmojis(dir) {
  const violations = [];
  if (!existsSync(dir)) return violations;
  const files = readdirSync(dir);
  for (const f of files) {
    if (f.startsWith(".") || f === "node_modules" || f === "archive" || f === "dist") continue;
    const fullPath = join(dir, f);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (f !== "skills" && f !== "docs" && f !== "rules") {
        violations.push(...scanEmojis(fullPath));
      }
    } else if (f.endsWith(".mjs") || f.endsWith(".js") || f.endsWith(".ts")) {
      const content = readFileSync(fullPath, "utf8");
      if (EMOJI_REGEX.test(content)) {
        violations.push(fullPath);
      }
    }
  }
  return violations;
}

const emojiViolations = [...scanEmojis("scripts"), ...scanEmojis("src"), ...scanEmojis("tests")];
if (emojiViolations.length > 0) {
  console.error(`[ERROR] Kod ve betiklerde yasakli emoji karakterleri tespit edildi:`);
  for (const f of emojiViolations) {
    console.error(`        - ${f}`);
  }
  passed = false;
} else {
  console.log("[OK] Kod ve betiklerde emoji bulunamadi (Sifir emoji kurali gecerli).\n");
}

// 4. Canlı SCA Kontrolü
console.log("[4/5] Bagimlilik ve Paket Halusinasyonu (SCA) Denetleniyor...");
if (existsSync("package.json")) {
  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const deps = Object.keys(pkg.dependencies || {});
    if (deps.length > 0) {
      console.log(`      ${deps.length} bagimlilik sorgulaniyor...`);
      execSync(`node scripts/sca-check.mjs ${deps.join(" ")}`, { stdio: "inherit" });
    } else {
      console.log("[OK] Harici bagimlilik yok (sifir bagimlilik / guvenli durum).\n");
    }
  } catch (err) {
    console.error(`[ERROR] SCA dogrulama hatasi: ${err.message}`);
    passed = false;
  }
} else {
  console.log("[OK] Harici package.json bagimliligi bulunmuyor.\n");
}

// 5. Kod Stili ve Statik Analiz (Biome)
console.log("[5/5] Kod Stili ve Statik Analiz (Biome Lint) Denetleniyor...");
if (existsSync("biome.json")) {
  try {
    execSync("npx @biomejs/biome check", { stdio: "inherit" });
    console.log("[OK] Biome kod stili ve statik analiz basarili.\n");
  } catch (_err) {
    console.error(
      "[ERROR] Biome lint / stil denetimi basarisiz oldu. 'npm run lint' veya 'npm run format' calistirarak duzeltin."
    );
    passed = false;
  }
} else {
  console.warn("[WARN] biome.json bulunamadi, statik analiz adimi atlandi.\n");
}

console.log("\n---------------------------------------------------------");
if (passed) {
  console.log("[PASS] DOGRULAMA BASARILI: Kod tabani tum dogrulama katmanlarindan gecti.");
  process.exit(0);
} else {
  console.error("[FAIL] DOGRULAMA BASARISIZ: Hatalari giderdikten sonra tekrar deneyin.");
  process.exit(1);
}
