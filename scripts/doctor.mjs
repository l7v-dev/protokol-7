#!/usr/bin/env node
/**
 * scripts/doctor.mjs
 *
 * Repository Sağlık, Güvenlik ve Disiplin Denetçisi (Repository Doctor)
 * Ref: ADR 0006, rules/verification-pipeline.md, rules/documentation-discipline.md
 * Log Standardı: Sıfır emoji, standart ASCII etiketler.
 *
 * Kullanım: node scripts/doctor.mjs
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ERROR_CLASSES, logTrace, SPAN_TYPES } from "./telemetry-logger.mjs";

console.log("=== PROTOKOL-7 DEPO VE ORTAM SAGLIK DENETIMI (DOCTOR) ===\n");

const startTime = Date.now();
let healthy = true;
const findings = [];

// 1. Dizin ve Mimari Bütünlük
console.log("[1/7] Mimari Dosya Butunlugu Denetleniyor...");
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
  findings.push({
    step: "structure",
    error_class: ERROR_CLASSES.UNKNOWN,
    details: missing,
  });
  healthy = false;
} else {
  console.log("[OK] Zorunlu mimari dosyalar ve kurallar mevcut.\n");
}

// 2. Git Calisma Agaci Durumu
console.log("[2/7] Git Calisma Agaci Sagligi Denetleniyor...");
try {
  const gitStatus = execSync("git status --porcelain", { encoding: "utf8" });
  if (gitStatus.trim().length > 0) {
    const changeCount = gitStatus.trim().split("\n").length;
    console.log(`[INFO] Calisma agacinda ${changeCount} adet commit edilmemis degisiklik mevcut.`);
  } else {
    console.log("[OK] Calisma agaci temiz (clean working tree).\n");
  }
} catch {
  console.warn("[WARN] Git durumu alinamadi (Git deposu disinda olabilir).\n");
}

// 3. Gizli Anahtar (Secret Detection) Taramasi
console.log("[3/7] Gizli Anahtar (Secret Detection) Taramasi Yapiliyor...");
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
  {
    name: "Generic API Key",
    regex: /(api_key|apiKey|secret_key|secretKey)\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/i,
  },
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
        if (pattern.regex.test(content) && !fullPath.includes("doctor.mjs")) {
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
    `[ERROR] Kaynak kodda gizli anahtar (secret) suphesi tespit edildi (${secretViolations.length} adet):`
  );
  for (const v of secretViolations) {
    console.error(`        - ${v.file} -> Desen: ${v.pattern}`);
  }
  findings.push({
    step: "secret_detection",
    error_class: ERROR_CLASSES.SECRET,
    details: secretViolations,
  });
  healthy = false;
} else {
  console.log("[OK] Kod dosyalarinda hassas gizli anahtar / secret tespit edilmedi.\n");
}

// 4. Dokumantasyon ve Yorum Disiplini (Sifir Sohbet Dili & Sifir Jargon)
console.log("[4/7] Dokumantasyon ve Yorum Disiplini (Sohbet Dili & Jargon) Taranıyor...");
const CONVERSATIONAL_PATTERNS = [
  /(\/\/|\/\*|\*)\s*(şimdi burada|hadi bakalım|hadi şunu|kolayca hallediyoruz|umarım çalışır|now we are doing|let's check)/i,
];

const BANNED_BUZZWORDS = [
  "smart",
  "intelligent",
  "next-gen",
  "ultra",
  "super",
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

function scanDocumentation(dir) {
  const violations = [];
  if (!existsSync(dir)) return violations;
  const files = readdirSync(dir);
  for (const f of files) {
    if (
      f.startsWith(".") ||
      f === "node_modules" ||
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
      violations.push(...scanDocumentation(fullPath));
    } else if (f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".mjs")) {
      const content = readFileSync(fullPath, "utf8");
      // Sohbet dili kontrolu
      for (const cp of CONVERSATIONAL_PATTERNS) {
        if (cp.test(content) && !fullPath.includes("doctor.mjs")) {
          violations.push({
            file: fullPath,
            issue: "Yorumlarda yasakli sohbet/dolgu dili tespit edildi.",
          });
        }
      }
      // Buzzword kontrolu
      for (const bw of BANNED_BUZZWORDS) {
        const r = new RegExp(`\\b${bw}\\b`, "i");
        if (
          r.test(content) &&
          !fullPath.includes("doctor.mjs") &&
          !fullPath.includes("verify-pipeline.mjs")
        ) {
          violations.push({
            file: fullPath,
            issue: `Yasakli pazarlama jargonu tespit edildi: '${bw}'`,
          });
        }
      }
    }
  }
  return violations;
}

const docViolations = scanDocumentation(".");
if (docViolations.length > 0) {
  console.error(
    `[ERROR] Yorum ve dokumantasyon disiplini ihlalleri (${docViolations.length} adet):`
  );
  for (const dv of docViolations.slice(0, 5)) {
    console.error(`        - ${dv.file}: ${dv.issue}`);
  }
  findings.push({
    step: "documentation_discipline",
    error_class: ERROR_CLASSES.DOC_JARGON,
    details: docViolations,
  });
  healthy = false;
} else {
  console.log("[OK] Kod dosyalarinda sohbet dili ve pazarlama jargonu bulunamadi.\n");
}

// 5. Loglama Disiplini (Sifir Emoji)
console.log("[5/7] Loglama Disiplini (Sıfır Emoji) Taranıyor...");
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

function scanEmojis(dir) {
  const violations = [];
  if (!existsSync(dir)) return violations;
  const files = readdirSync(dir);
  for (const f of files) {
    if (
      f.startsWith(".") ||
      f === "node_modules" ||
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
  findings.push({
    step: "emoji_check",
    error_class: ERROR_CLASSES.LINT,
    details: emojiViolations,
  });
  healthy = false;
} else {
  console.log("[OK] Betiklerde emoji bulunamadi (Sifir emoji kurali gecerli).\n");
}

// 6. Bagimlilik ve Paket Halusinasyonu (SCA)
console.log("[6/7] Bagimlilik ve Paket Halusinasyonu (SCA) Denetleniyor...");
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
    findings.push({
      step: "sca_check",
      error_class: ERROR_CLASSES.SCA,
      details: err.message,
    });
    healthy = false;
  }
}

// 7. Kod Stili ve Statik Analiz (Biome)
console.log("[7/7] Kod Stili ve Statik Analiz (Biome Lint) Denetleniyor...");
if (existsSync("biome.json")) {
  try {
    execSync("npx @biomejs/biome check", { stdio: "inherit" });
    console.log("[OK] Biome kod stili ve statik analiz basarili.\n");
  } catch (_err) {
    console.error("[ERROR] Biome lint / stil denetimi basarisiz oldu.");
    findings.push({
      step: "biome_lint",
      error_class: ERROR_CLASSES.LINT,
      details: "Biome lint failures detected",
    });
    healthy = false;
  }
}

const duration = Date.now() - startTime;

// Telemetri Kaydı
logTrace({
  span_type: SPAN_TYPES.SAFETY_MONITOR,
  task: "doctor-health-check",
  tier: 0,
  tool: "doctor",
  duration_ms: duration,
  status: healthy ? "success" : "failed",
  error_class: findings.length > 0 ? findings[0].error_class : null,
  metadata: { findingsCount: findings.length },
});

console.log("---------------------------------------------------------");
if (healthy) {
  console.log(
    `[PASS] DEPO VE ORTAM SAGLIKLI: Tum kontroller basariyla tamamlandi (${duration}ms).`
  );
  process.exit(0);
} else {
  console.error(
    `[FAIL] SAGLIK DENETIMI BASARISIZ: ${findings.length} adet problem tespit edildi (${duration}ms).`
  );
  process.exit(1);
}
