#!/usr/bin/env node
/**
 * scripts/omega-memory.mjs
 *
 * Omega-3 Yerel Semantik & Kavramsal Bellek Arama Motoru (Semantic Memory Search)
 * context/, docs/adr/, rules/ ve archive/index.jsonl üzerinde
 * ağırlıklı terim frekansı, başlık eşleşmesi ve bağlam skorlamasıyla
 * ilgili kural ve kararları anında ajanın önüne getirir.
 *
 * Log Standardı: rules/logging-discipline.md (Sıfır emoji, standart ASCII etiketler).
 *
 * Kullanım: node scripts/omega-memory.mjs "<arama terimi veya kavram>"
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const query = process.argv.slice(2).join(" ").trim();

if (!query) {
  console.log("Kullanım: node scripts/omega-memory.mjs <kavram / arama terimi>");
  console.log("Örnek:   node scripts/omega-memory.mjs 'blast radius trust tier'");
  process.exit(1);
}

const SEARCH_DIRS = ["rules", "context", "docs/adr"];
const INDEX_FILE = "archive/index.jsonl";

const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

function scanDir(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  const files = readdirSync(dir);
  for (const f of files) {
    const fullPath = join(dir, f);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...scanDir(fullPath));
    } else if (f.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = SEARCH_DIRS.flatMap(scanDir);
const scoredResults = [];

for (const filePath of allFiles) {
  const content = readFileSync(filePath, "utf8");
  const lowerContent = content.toLowerCase();
  let score = 0;
  const matches = [];

  for (const term of terms) {
    const headerRegex = new RegExp(`^#+\\s+.*${term}.*`, "gim");
    const headerMatches = content.match(headerRegex);
    if (headerMatches) {
      score += headerMatches.length * 10;
      matches.push(...headerMatches.map((h) => h.trim()));
    }

    const termCount = (lowerContent.match(new RegExp(`\\b${term}\\b`, "g")) || []).length;
    score += termCount * 2;
  }

  if (score > 0) {
    const lines = content.split("\n");
    let snippet = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (terms.some((t) => line.toLowerCase().includes(t)) && line.trim().length > 20) {
        snippet = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join("\n");
        break;
      }
    }

    scoredResults.push({
      file: filePath,
      score,
      snippet: snippet || `${content.slice(0, 200)}...`,
    });
  }
}

if (existsSync(INDEX_FILE)) {
  const indexContent = readFileSync(INDEX_FILE, "utf8");
  const lines = indexContent.split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const str = `${entry.tarih} ${entry.faz} ${entry.konu}`.toLowerCase();
      if (terms.some((t) => str.includes(t))) {
        scoredResults.push({
          file: `archive/index.jsonl (${entry.dosya})`,
          score: 5,
          snippet: `[Geçmiş Oturum] Tarih: ${entry.tarih} | Faz: ${entry.faz} | Konu: ${entry.konu}`,
        });
      }
    } catch {}
  }
}

scoredResults.sort((a, b) => b.score - a.score);

console.log(`[QUERY] Semantik bellek araması: "${query}"\n`);

if (scoredResults.length === 0) {
  console.log("[INFO] Eşleşen kural, bağlam veya geçmiş oturum bulunamadı.");
} else {
  console.log(`[INFO] ${scoredResults.length} adet kaynak bulundu:\n`);
  for (const r of scoredResults.slice(0, 5)) {
    console.log(`[SOURCE] ${r.file} (Skor: ${r.score})`);
    console.log(`--------------------------------------------------`);
    console.log(r.snippet.trim());
    console.log("\n");
  }
}
