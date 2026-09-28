#!/usr/bin/env node
/**
 * scripts/logs.mjs
 *
 * Protokol-7 Log Fihristi ve Anomali Radari CLI Araci
 * ledger/logs/index.jsonl ve ledger/telemetry.jsonl uzerindeki kayitlari
 * derleyerek son aktör calismalarini ve sistem anomalilerini listeler.
 *
 * Log Standardi: rules/logging-discipline.md (Sifir emoji, standart ASCII etiketler).
 *
 * Kullanim: node scripts/logs.mjs (veya npm run logs)
 *           node scripts/logs.mjs --limit 10
 */

import { existsSync, readFileSync } from "node:fs";
import { Theme } from "./terminal-theme.mjs";

const args = process.argv.slice(2);
let limit = 5;
const limitArgIdx = args.indexOf("--limit");
if (limitArgIdx !== -1 && args[limitArgIdx + 1]) {
  const parsed = Number.parseInt(args[limitArgIdx + 1], 10);
  if (!Number.isNaN(parsed) && parsed > 0) limit = parsed;
}

const LOG_INDEX_PATH = "ledger/logs/index.jsonl";
const TELEMETRY_PATH = "ledger/telemetry.jsonl";

function getRecentLogs(maxCount) {
  if (!existsSync(LOG_INDEX_PATH)) return [];
  const content = readFileSync(LOG_INDEX_PATH, "utf8");
  const lines = content.split("\n").filter(Boolean);
  const entries = [];
  for (let i = lines.length - 1; i >= 0 && entries.length < maxCount; i--) {
    try {
      entries.push(JSON.parse(lines[i]));
    } catch {}
  }
  return entries;
}

function getAnomalyStats() {
  const stats = {
    totalAnomalies: 0,
    byCode: {},
    recentAnomalies: [],
  };

  if (!existsSync(TELEMETRY_PATH)) return stats;
  const content = readFileSync(TELEMETRY_PATH, "utf8");
  const lines = content.split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === "ANOMALY_TELEMETRY" && obj.anomalyCode) {
        stats.totalAnomalies++;
        stats.byCode[obj.anomalyCode] = (stats.byCode[obj.anomalyCode] || 0) + 1;
        stats.recentAnomalies.unshift(obj);
      }
    } catch {}
  }
  return stats;
}

function renderLogs() {
  const recentLogs = getRecentLogs(limit);
  const anomalyStats = getAnomalyStats();

  console.log(Theme.banner("PROTOKOL-7 LOG FIHRISTI VE ANOMALI RADARI"));
  console.log("");

  // 1. Son Calisma Loglari
  if (recentLogs.length === 0) {
    console.log(Theme.badge("INFO", `Henuz calisma logu bulunmuyor (${LOG_INDEX_PATH}).`));
  } else {
    console.log(`[SON AKTÖR CALISMA KAYITLARI (Son ${recentLogs.length})]`);
    for (let i = 0; i < recentLogs.length; i++) {
      const item = recentLogs[i];
      const timeStr = item.timestamp ? item.timestamp.slice(11, 19) : "--:--:--";
      const statusBadge = item.status === "succeeded" ? "[PASS]" : "[FAIL]";
      const duration = `${item.duration_ms}ms`;
      console.log(
        `  ${i + 1}. ${timeStr} | ${item.actor.padEnd(14)} | ${statusBadge.padEnd(7)} | ${duration.padEnd(7)} | Dosya: ${item.file}`
      );
      console.log(`     Ozet: ${item.summary}`);
    }
  }

  console.log("");

  // 2. Anomali ve Duraklama Radari
  const anomalyEntries = [["Toplam Anomali", `${anomalyStats.totalAnomalies} olay`]];

  if (anomalyStats.totalAnomalies > 0) {
    for (const [code, count] of Object.entries(anomalyStats.byCode)) {
      anomalyEntries.push([`  - ${code}`, `${count} adet`]);
    }
    const last = anomalyStats.recentAnomalies[0];
    if (last) {
      anomalyEntries.push([
        "Son Anomali",
        `${last.anomalyCode} (${last.component} - ${last.timestamp.slice(11, 19)})`,
      ]);
      anomalyEntries.push(["Son Mesaj", last.message.slice(0, 50)]);
    }
  } else {
    anomalyEntries.push(["Durum", "Sistem stabil; kayitli duraklama veya timeout yok."]);
  }

  console.log(Theme.panel("ANOMALI VE DURAKLAMA RADARI", anomalyEntries));
  console.log("");
  console.log(Theme.divider("="));
}

renderLogs();
