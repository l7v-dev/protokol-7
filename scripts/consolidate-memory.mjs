#!/usr/bin/env node
/**
 * scripts/consolidate-memory.mjs
 *
 * Hipokampüs Bellek Konsolidasyonu (Memory Consolidation)
 * TASKS.md'deki "Son tamamlananlar" listesi 5'i aştığında,
 * eski görevleri otomatik olarak gzip sıkıştırmasıyla archive/sessions/'a taşır
 * ve archive/index.jsonl indeksine ekler.
 *
 * Log Standardı: rules/logging-discipline.md (Sıfır emoji, standart ASCII etiketler).
 *
 * Kullanım: node scripts/consolidate-memory.mjs
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const TASKS_PATH = "TASKS.md";
const INDEX_PATH = "archive/index.jsonl";
const SESSIONS_DIR = "archive/sessions";

if (!existsSync(TASKS_PATH)) {
  console.error("[ERROR] TASKS.md bulunamadı.");
  process.exit(1);
}

const tasksContent = readFileSync(TASKS_PATH, "utf8");

const completedHeaderMatch = tasksContent.match(/^## Son tamamlananlar.*$/m);
if (!completedHeaderMatch) {
  console.log("[INFO] 'Son tamamlananlar' başlığı bulunamadı.");
  process.exit(0);
}

const completedHeader = completedHeaderMatch[0];
const startIndex = completedHeaderMatch.index;
const nextSectionHeader = "---";

const afterHeader = tasksContent.slice(startIndex + completedHeader.length);
const endIndex = afterHeader.indexOf(nextSectionHeader);
const completedBlock = endIndex !== -1 ? afterHeader.slice(0, endIndex) : afterHeader;

const lines = completedBlock.split("\n");
const taskLines = lines.filter((l) => l.trim().startsWith("- [x]"));

console.log(`[INFO] Tamamlanan görev sayısı: ${taskLines.length}`);

if (taskLines.length <= 5) {
  console.log("[INFO] Bellek konsolidasyonuna gerek yok (tamamlanan görev sayısı <= 5).");
  process.exit(0);
}

const toKeep = taskLines.slice(0, 5);
const toArchive = taskLines.slice(5);

console.log(`[INFO] ${toArchive.length} adet eski görev arşive konsolide ediliyor...`);

const dateStr = new Date().toISOString().slice(0, 10);
const timestamp = Date.now();
const sessionFilename = `${dateStr}--session-${timestamp}.md.gz`;
const sessionRelPath = `sessions/${sessionFilename}`;
const sessionFullPath = `${SESSIONS_DIR}/${sessionFilename}`;

const archiveContent = `# Arşivlenmiş Görev Kayıtları — ${dateStr}\n\n${toArchive.join("\n")}\n`;
const compressed = gzipSync(Buffer.from(archiveContent, "utf8"));

writeFileSync(sessionFullPath, compressed);

const summaryTopic = toArchive[0].replace(/- \[[xX]\]\s*/, "").slice(0, 80);
const indexEntry = `${JSON.stringify({
  tarih: dateStr,
  faz: "Konsolidasyon",
  konu: `${toArchive.length} görev konsolide edildi: ${summaryTopic}...`,
  dosya: sessionRelPath,
  tier_max: 2,
})}\n`;

writeFileSync(INDEX_PATH, indexEntry, { flag: "a" });

const updatedBlock = `\n\n${toKeep.join("\n")}\n\n`;
const newTasksContent =
  tasksContent.slice(0, startIndex + completedHeader.length) +
  updatedBlock +
  (endIndex !== -1 ? afterHeader.slice(endIndex) : "");

writeFileSync(TASKS_PATH, newTasksContent, "utf8");

console.log(`[OK] ${toArchive.length} görev ${sessionRelPath} dosyasına sıkıştırıldı.`);
console.log(`[OK] archive/index.jsonl güncellendi.`);
console.log(`[OK] TASKS.md optimize edildi (5 aktif tamamlanan tutuldu).`);
