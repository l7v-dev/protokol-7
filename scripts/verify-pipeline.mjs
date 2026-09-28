#!/usr/bin/env node

/**
 * scripts/verify-pipeline.mjs
 *
 * Deterministik Doğrulama Hattı (Verification Pipeline Runner)
 * Ref: rules/verification-pipeline.md, rules/failure-checklist.md, rules/logging-discipline.md, rules/documentation-discipline.md
 * Log Standardı: Sıfır emoji, standart ASCII etiketler.
 *
 * Kontroller:
 * 1. Dizin ve Mimari Bütünlük
 * 2. İsimlendirme ve Dokümantasyon Disiplini (Sıfır sohbet dili & buzzword)
 * 3. Loglama Disiplini (Sıfır emoji)
 * 4. Gizli Anahtar (Secret Detection) Taraması
 * 5. Canlı Bağımlılık / SCA Kontrolü
 * 6. Kod Stili ve Statik Analiz (Biome Lint & Format)
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ERROR_CLASSES, logTrace, SPAN_TYPES } from "./telemetry-logger.mjs";

console.log("=== PROTOKOL-7 DETERMINISTIK DOGRULAMA HATTI BASLATILIYOR ===\n");

const startTime = Date.now();
let passed = true;
let failureClass = null;

// 1. Dizin ve Mimari Bütünlük
console.log("[1/6] Mimari Dosya Butunlugu Denetleniyor...");
const REQUIRED_PATHS = [
  "AGENTS.md",
  "TASKS.md",
  "biome.json",
  "rules/trust-tiers.md",
  "rules/failure-checklist.md",
  "rules/metacognition.md",
  "rules/verification-pipeline.md",
  "rules/logging-discipline.md",
  "rules/documentation-discipline.md",
  "context/",
  "context/format-standards.md",
  "skills/",
  "docs/",
  "ledger/index.jsonl",
];

const missing = [];
for (const p of REQUIRED_PATHS) {
  if (!existsSync(p)) {
    missing.push(p);
  }
}

if (missing.length > 0) {
  console.error(`[ERROR] Eksik mimari yollar tespit edildi: ${missing.join(", ")}`);
  failureClass = ERROR_CLASSES.UNKNOWN;
  passed = false;
} else {
  console.log("[OK] Zorunlu mimari dosyalar ve dizinler mevcut.\n");
}

// 2. İsimlendirme ve Dokümantasyon Disiplini
console.log("[2/6] Isimlendirme ve Dokumantasyon Disiplini (Sohbet Dili & Jargon) Taranıyor...");
const CONVERSATIONAL_PATTERNS = [
  /(\/\/|\/\*|\*)\s*(şimdi burada|hadi bakalım|hadi şunu|kolayca hallediyoruz|umarım çalışır|now we are doing|let's check)/i,
];

const BANNED_WORDS = [
  "smart",
  "intelligent",
  "next-gen",
  "ultra",
  "seamless",
  "powerful",
  "ai-powered",
  "autonomous",
  "robust",
  "magical",
  "lightning",
  "harika",
  "mukemmel",
  "kusursuz",
  "guclu",
  "akilli",
];

function scanNamingAndDocs(dir) {
  const violations = [];
  if (!existsSync(dir)) return violations;
  const files = readdirSync(dir);
  for (const f of files) {
    if (
      f.startsWith(".") ||
      f === "node_modules" ||
      f === "ledger" ||
      f === "archive" ||
      f === "dist" ||
      f === "docs" ||
      f === "skills"
    ) {
      continue;
    }
    const fullPath = join(dir, f);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      violations.push(...scanNamingAndDocs(fullPath));
    } else if (f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".mjs")) {
      const content = readFileSync(fullPath, "utf8");
      // Sohbet dili kontrolü
      for (const cp of CONVERSATIONAL_PATTERNS) {
        if (
          cp.test(content) &&
          !fullPath.includes("verify-pipeline.mjs") &&
          !fullPath.includes("doctor.mjs")
        ) {
          violations.push({
            file: fullPath,
            word: "Yorumlarda yasakli sohbet/dolgu dili",
          });
        }
      }
      // Buzzword kontrolü
      for (const word of BANNED_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, "i");
        if (
          regex.test(content) &&
          !fullPath.includes("verify-pipeline.mjs") &&
          !fullPath.includes("doctor.mjs")
        ) {
          violations.push({ file: fullPath, word });
        }
      }
    }
  }
  return violations;
}

const namingViolations = scanNamingAndDocs(".");
if (namingViolations.length > 0) {
  console.warn(
    `[WARN] Isimlendirme veya dokumantasyon uyarilari (${namingViolations.length} adet):`
  );
  for (const v of namingViolations.slice(0, 5)) {
    console.warn(`       - ${v.file}: '${v.word}' tespit edildi.`);
  }
} else {
  console.log("[OK] Kod dosyalarinda yasakli pazarlama terimi ve sohbet dili bulunamadi.\n");
}

// 3. Loglama Disiplini (Sıfır Emoji Taranıyor)
console.log("[3/6] Loglama Disiplini (Sıfır Emoji) Taranıyor...");
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

function scanEmojis(dir) {
  const violations = [];
  if (!existsSync(dir)) return violations;
  const files = readdirSync(dir);
  for (const f of files) {
    if (
      f.startsWith(".") ||
      f === "node_modules" ||
      f === "ledger" ||
      f === "archive" ||
      f === "dist" ||
      f === "skills" ||
      f === "docs" ||
      f === "rules"
    ) {
      continue;
    }
    const fullPath = join(dir, f);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      violations.push(...scanEmojis(fullPath));
    } else if (f.endsWith(".mjs") || f.endsWith(".js") || f.endsWith(".ts")) {
      const content = readFileSync(fullPath, "utf8");
      if (EMOJI_REGEX.test(content)) {
        violations.push(fullPath);
      }
    }
  }
  return violations;
}

const emojiViolations = scanEmojis("scripts");
if (emojiViolations.length > 0) {
  console.error("[ERROR] Betiklerde yasakli emoji karakterleri tespit edildi:");
  for (const f of emojiViolations) {
    console.error(`        - ${f}`);
  }
  failureClass = ERROR_CLASSES.LINT;
  passed = false;
} else {
  console.log("[OK] Kod ve betiklerde emoji bulunamadi (Sifir emoji kurali gecerli).\n");
}

// 4. Gizli Anahtar (Secret Detection) Taraması
console.log("[4/6] Gizli Anahtar (Secret Detection) Taramasi Yapiliyor...");
const SECRET_PATTERNS = [
  { name: "Private Key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "GitHub Token",
    regex: /(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,})/,
  },
  {
    name: "JWT Token",
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  { name: "AWS Key ID", regex: /\bAKIA[0-9A-Z]{16}\b/ },
];

function scanSecrets(dir) {
  const violations = [];
  if (!existsSync(dir)) return violations;
  const files = readdirSync(dir);
  for (const f of files) {
    if (
      f.startsWith(".") ||
      f === "node_modules" ||
      f === "archive" ||
      f === "dist" ||
      f === "package-lock.json" ||
      f === "service_account.json" ||
      f === "credentials.json" ||
      f === "token.json"
    ) {
      continue;
    }
    const fullPath = join(dir, f);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      violations.push(...scanSecrets(fullPath));
    } else if (
      f.endsWith(".ts") ||
      f.endsWith(".js") ||
      f.endsWith(".mjs") ||
      f.endsWith(".json")
    ) {
      const content = readFileSync(fullPath, "utf8");
      for (const pattern of SECRET_PATTERNS) {
        if (
          pattern.regex.test(content) &&
          !fullPath.includes("verify-pipeline.mjs") &&
          !fullPath.includes("doctor.mjs")
        ) {
          violations.push({ file: fullPath, pattern: pattern.name });
        }
      }
    }
  }
  return violations;
}

const secretViolations = scanSecrets(".");
if (secretViolations.length > 0) {
  console.error(
    `[ERROR] Kaynak kodda gizli anahtar (secret) tespit edildi (${secretViolations.length} adet):`
  );
  for (const v of secretViolations) {
    console.error(`        - ${v.file} -> Desen: ${v.pattern}`);
  }
  failureClass = ERROR_CLASSES.SECRET;
  passed = false;
} else {
  console.log("[OK] Kod dosyalarinda gizli anahtar / secret tespit edilmedi.\n");
}

// 5. Canlı SCA Kontrolü
console.log("[5/6] Bagimlilik ve Paket Halusinasyonu (SCA) Denetleniyor...");
if (existsSync("package.json")) {
  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const deps = Object.keys(pkg.dependencies || {});
    if (deps.length > 0) {
      console.log(`      ${deps.length} bagimlilik sorgulaniyor...`);
      execSync(`node scripts/sca-check.mjs ${deps.join(" ")}`, {
        stdio: "inherit",
      });
    } else {
      console.log("[OK] Harici bagimlilik yok (sifir bagimlilik / guvenli durum).\n");
    }
  } catch (err) {
    console.error(`[ERROR] SCA dogrulama hatasi: ${err.message}`);
    failureClass = ERROR_CLASSES.SCA;
    passed = false;
  }
} else {
  console.log("[OK] Harici package.json bagimliligi bulunmuyor.\n");
}

// 6. Kod Stili ve Statik Analiz (Biome)
console.log("[6/6] Kod Stili ve Statik Analiz (Biome Lint) Denetleniyor...");
if (existsSync("biome.json")) {
  try {
    execSync("npx @biomejs/biome check", { stdio: "inherit" });
    console.log("[OK] Biome kod stili ve statik analiz basarili.\n");
  } catch (_err) {
    console.error(
      "[ERROR] Biome lint / stil denetimi basarisiz oldu. 'npm run lint' veya 'npm run format' calistirarak duzeltin."
    );
    failureClass = ERROR_CLASSES.LINT;
    passed = false;
  }
} else {
  console.warn("[WARN] biome.json bulunamadi, statik analiz adimi atlandi.\n");
}

const duration = Date.now() - startTime;

// Telemetri Kaydı
logTrace({
  span_type: SPAN_TYPES.FEEDBACK_INTEG,
  task: "verification-pipeline",
  tier: 1,
  tool: "verify-pipeline",
  duration_ms: duration,
  status: passed ? "success" : "failed",
  error_class: passed ? null : failureClass,
  metadata: { passed },
});

console.log("\n---------------------------------------------------------");
if (passed) {
  console.log(
    `[PASS] DOGRULAMA BASARILI: Kod tabani tum dogrulama katmanlarindan gecti (${duration}ms).`
  );
  process.exit(0);
} else {
  console.error(
    `[FAIL] DOGRULAMA BASARISIZ: Hatalari giderdikten sonra tekrar deneyin (${duration}ms).`
  );
  process.exit(1);
}
