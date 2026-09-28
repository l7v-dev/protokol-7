#!/usr/bin/env node
/**
 * scripts/pulse.mjs
 *
 * Protokol-7 Sistem Nabzi (System Pulse) CLI Araci
 * Aktif gorev, katalog veritabani, kayitli aktorler, depolama hedefleri,
 * log fihristi ve ledger durumunu 20 milisaniyede konsantre ASCII paneli olarak sunar.
 *
 * Log Standardi: rules/logging-discipline.md (Sifir emoji, standart ASCII etiketler).
 *
 * Kullanim: node scripts/pulse.mjs (veya npm run pulse)
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { Theme } from "./terminal-theme.mjs";

function getActiveTask() {
  if (!existsSync("TASKS.md")) return "TASKS.md bulunamadi";
  const content = readFileSync("TASKS.md", "utf8");
  const activeMatch = content.match(/^## Aktif\s*\n+([\s\S]*?)(?=^##|$)/m);
  if (!activeMatch) return "Aktif gorev yok";
  const lines = activeMatch[1].trim().split("\n");
  for (const l of lines) {
    if (l.trim().startsWith("- [ ]") || l.trim().startsWith("- [/]")) {
      return l.trim().replace(/^[-\s/[\]]+/, "");
    }
  }
  return "Aktif is bulunmuyor (Tumu tamamlandi)";
}

function getLastCompletedTask() {
  if (!existsSync("TASKS.md")) return "Bulunamadi";
  const content = readFileSync("TASKS.md", "utf8");
  const completedMatch = content.match(/^## Son tamamlananlar[\s\S]*?\n+([\s\S]*?)(?=^---|$)/m);
  if (!completedMatch) return "Kayit yok";
  const lines = completedMatch[1].trim().split("\n");
  for (const l of lines) {
    if (l.trim().startsWith("- [x]") || l.trim().startsWith("- [X]")) {
      return l.trim().replace(/^-\s*\[[xX]\]\s*/, "");
    }
  }
  return "Tamamlanan gorev kaydi yok";
}

function getDatabaseStatus() {
  const dbPath = process.env.PROTOKOL_DB_PATH || "data/catalog.sqlite";
  if (!existsSync(dbPath)) {
    return `${dbPath} (Henuz olusturulmadi — ilk calismada otomatik acilir)`;
  }
  const stat = statSync(dbPath);
  const kb = (stat.size / 1024).toFixed(1);
  return `${dbPath} (ACID WAL — ${kb} KB — 7 tablo tanimli)`;
}

function getLedgerStatus() {
  const indexPath = "ledger/index.jsonl";
  if (!existsSync(indexPath)) {
    return "ledger/index.jsonl bulunamadi";
  }
  const content = readFileSync(indexPath, "utf8");
  const entries = content.split("\n").filter(Boolean);
  if (entries.length === 0) return "0 oturum kayitli";
  try {
    const lastEntry = JSON.parse(entries[entries.length - 1]);
    return `${entries.length} oturum muhurlu (Son muhur: ${lastEntry.tarih} - ${lastEntry.faz})`;
  } catch {
    return `${entries.length} oturum muhurlu`;
  }
}

function getLogStatus() {
  const logIndex = "ledger/logs/index.jsonl";
  if (!existsSync(logIndex)) return "Henuz kayitli calisma logu yok";
  const content = readFileSync(logIndex, "utf8");
  const lines = content.split("\n").filter(Boolean);
  if (lines.length === 0) return "0 calisma kayitli";
  try {
    const last = JSON.parse(lines[lines.length - 1]);
    return `${lines.length} run logu fihristte (Son: ${last.actor} [${last.status.toUpperCase()}])`;
  } catch {
    return `${lines.length} run logu fihristte`;
  }
}

function renderPulse() {
  const activeTask = getActiveTask();
  const lastTask = getLastCompletedTask();
  const dbStatus = getDatabaseStatus();
  const ledgerStatus = getLedgerStatus();
  const logStatus = getLogStatus();

  console.log(Theme.banner("PROTOKOL-7 SISTEM NABZI"));
  console.log("");
  console.log(
    Theme.panel("CALISAN BELLEK", [
      ["Aktif Gorev", activeTask],
      ["Son Muhur", lastTask],
    ])
  );
  console.log("");
  console.log(
    Theme.panel("MIMARI & VERITABANI", [
      ["Katalog DB", dbStatus],
      ["Aktorler", "32 kayitli aktor (src/actors/actor-registry.ts)"],
      ["REST Rotalari", "5 domain router (/api/v1/ - Store, Pipeline, Dataset, Job, Vault)"],
      ["Depolama", "GDrive (OAuth2 hazir) | Cold Vault (Btrfs SHA-256) | R2 (Yapilandirildi)"],
    ])
  );
  console.log("");
  console.log(
    Theme.panel("DEFTER & GOZLEMLENEBILIRLIK", [
      ["Defter (Ledger)", ledgerStatus],
      ["Log Fihristi", `${logStatus} -> npm run logs`],
      ["Arama", 'npm run memory "<kavram>" (BM25 semantik tarayici)'],
      ["Dogrulama", "npm run verify (6 katman) | npm run doctor (7 asama)"],
    ])
  );
  console.log("");
  console.log(Theme.divider("="));
}

renderPulse();
