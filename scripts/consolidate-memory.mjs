#!/usr/bin/env node
/**
 * scripts/consolidate-memory.mjs
 *
 * Hipokampus Bellek Konsolidasyonu ve Ledger Muhurleme Motoru
 * TASKS.md'deki aktif bolumden tamamlanmis gorevleri ve "Son tamamlananlar"
 * bolumundeki 5'ten eski tum gorevleri tespit eder, gzip sikistirmasiyla
 * ledger/sessions/ dizinine muhurler ve ledger/index.jsonl kutugune isler.
 *
 * Log Standardi: rules/logging-discipline.md (Sifir emoji, standart ASCII etiketler).
 *
 * Kullanim: node scripts/consolidate-memory.mjs
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const TASKS_PATH = "TASKS.md";
const INDEX_PATH = "ledger/index.jsonl";
const SESSIONS_DIR = "ledger/sessions";

if (!existsSync(TASKS_PATH)) {
  console.error("[ERROR] TASKS.md bulunamadi.");
  process.exit(1);
}

if (!existsSync(SESSIONS_DIR)) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

let tasksContent = readFileSync(TASKS_PATH, "utf8");

// 1. ## Aktif bolumundeki tamamlanmis gorevleri ayristir
const activeHeaderMatch = tasksContent.match(/^## Aktif\s*$/m);
const completedFromActive = [];

if (activeHeaderMatch) {
  const activeStart = activeHeaderMatch.index + activeHeaderMatch[0].length;
  const nextSectionMatch = tasksContent.slice(activeStart).match(/^##\s+/m);
  const activeEnd = nextSectionMatch ? activeStart + nextSectionMatch.index : tasksContent.length;

  const activeBlock = tasksContent.slice(activeStart, activeEnd);
  const activeLines = activeBlock.split("\n");

  const remainingActiveLines = [];
  let currentTask = [];
  let isCurrentCompleted = false;

  for (const line of activeLines) {
    if (line.trim().startsWith("- [")) {
      if (currentTask.length > 0) {
        if (isCurrentCompleted) {
          completedFromActive.push(currentTask.join("\n"));
        } else {
          remainingActiveLines.push(...currentTask);
        }
      }
      currentTask = [line];
      isCurrentCompleted = line.trim().startsWith("- [x]") || line.trim().startsWith("- [X]");
    } else {
      currentTask.push(line);
    }
  }

  if (currentTask.length > 0) {
    if (isCurrentCompleted) {
      completedFromActive.push(currentTask.join("\n"));
    } else {
      remainingActiveLines.push(...currentTask);
    }
  }

  const updatedActiveBlock = `\n\n${remainingActiveLines.join("\n").trim()}\n\n`;
  tasksContent =
    tasksContent.slice(0, activeStart) + updatedActiveBlock + tasksContent.slice(activeEnd);
}

// 2. ## Son tamamlananlar bolumundeki gorevleri topla
const completedHeaderMatch = tasksContent.match(/^## Son tamamlananlar.*$/m);
if (!completedHeaderMatch) {
  console.log("[INFO] 'Son tamamlananlar' basligi bulunamadi.");
  process.exit(0);
}

const completedHeader = completedHeaderMatch[0];
const completedStartIndex = completedHeaderMatch.index;
const nextDivider = "---";

const afterCompleted = tasksContent.slice(completedStartIndex + completedHeader.length);
const dividerIndex = afterCompleted.indexOf(nextDivider);
const completedBlock = dividerIndex !== -1 ? afterCompleted.slice(0, dividerIndex) : afterCompleted;

const existingCompletedTasks = [];
const lines = completedBlock.split("\n");
let currentCompleted = [];

for (const line of lines) {
  if (line.trim().startsWith("- [x]") || line.trim().startsWith("- [X]")) {
    if (currentCompleted.length > 0) {
      existingCompletedTasks.push(currentCompleted.join("\n").trim());
    }
    currentCompleted = [line];
  } else if (currentCompleted.length > 0) {
    currentCompleted.push(line);
  }
}
if (currentCompleted.length > 0) {
  existingCompletedTasks.push(currentCompleted.join("\n").trim());
}

// Aktif bolumden cikarilan tamamlanmis isleri en basa ekle
const allCompletedTasks = [...completedFromActive, ...existingCompletedTasks].filter(Boolean);

console.log(`[INFO] Toplam tamamlanan gorev tespit edildi: ${allCompletedTasks.length}`);

if (allCompletedTasks.length <= 5 && completedFromActive.length === 0) {
  console.log("[INFO] Konsolidasyona gerek yok (tamamlanan gorev sayisi <= 5).");
  process.exit(0);
}

const toKeep = allCompletedTasks.slice(0, 3);
const toArchive = allCompletedTasks.slice(3);

console.log(`[INFO] ${toArchive.length} adet gorev ledger/ dizinine muhurleniyor...`);

const dateStr = new Date().toISOString().slice(0, 10);
const timestamp = Date.now();
const sessionFilename = `${dateStr}--session-${timestamp}.md.gz`;
const sessionRelPath = `sessions/${sessionFilename}`;
const sessionFullPath = `${SESSIONS_DIR}/${sessionFilename}`;

const archiveContent = `# Ledger Gorev Kayitlari — ${dateStr}\n\n${toArchive.join("\n\n")}\n`;
const compressed = gzipSync(Buffer.from(archiveContent, "utf8"));

writeFileSync(sessionFullPath, compressed);

const firstTaskHeader = toArchive[0]
  .split("\n")[0]
  .replace(/- \[[xX]\]\s*/, "")
  .slice(0, 80);
const indexEntry = `${JSON.stringify({
  tarih: dateStr,
  faz: "Ledger-Muhur",
  konu: `${toArchive.length} gorev konsolide edildi: ${firstTaskHeader}...`,
  dosya: sessionRelPath,
  tier_max: 2,
})}\n`;

writeFileSync(INDEX_PATH, indexEntry, { flag: "a" });

const updatedCompletedBlock = `\n\n${toKeep.join("\n\n")}\n\n`;
const newTasksContent =
  tasksContent.slice(0, completedStartIndex + completedHeader.length) +
  updatedCompletedBlock +
  (dividerIndex !== -1 ? afterCompleted.slice(dividerIndex) : "");

writeFileSync(TASKS_PATH, newTasksContent, "utf8");

console.log(`[OK] ${toArchive.length} gorev ${sessionRelPath} dosyasina sikistirildi.`);
console.log(`[OK] ledger/index.jsonl guncellendi.`);
console.log(`[OK] TASKS.md optimize edildi (${toKeep.length} son tamamlanan referans tutuldu).`);

// 3. Log dosyasi rotasyonu (ledger/logs/runs/ - son 100 dosya tutulur)
const RUNS_LOG_DIR = "ledger/logs/runs";
if (existsSync(RUNS_LOG_DIR)) {
  const logFiles = readdirSync(RUNS_LOG_DIR)
    .filter((f) => f.endsWith(".log"))
    .map((f) => ({
      name: f,
      path: join(RUNS_LOG_DIR, f),
      time: statSync(join(RUNS_LOG_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);

  if (logFiles.length > 100) {
    const toDelete = logFiles.slice(100);
    for (const f of toDelete) {
      try {
        unlinkSync(f.path);
      } catch {}
    }
    console.log(
      `[OK] Log rotasyonu: ${toDelete.length} eski ham log dosyasi temizlendi (100 dosya tutuldu).`
    );
  }
}
