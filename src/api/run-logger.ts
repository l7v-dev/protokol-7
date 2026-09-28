/**
 * src/api/run-logger.ts
 *
 * Protokol-7 Calisma Logu ve Fihrist Motoru
 * Her aktör ve boru hatti calismasinin loglarini atomik olarak
 * ledger/logs/runs/ altinda dosyalar ve ledger/logs/index.jsonl
 * kayit defterine tek satirlik deterministik ozetini isler.
 *
 * Log Standardi: rules/logging-discipline.md (Sifir emoji, standart ASCII etiketler).
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunRecord } from "./run-registry";

export interface LogIndexEntry {
  log_id: string;
  run_id: string;
  actor: string;
  timestamp: string;
  status: string;
  duration_ms: number;
  item_count: number;
  error_count: number;
  error_code?: string;
  file: string;
  summary: string;
}

const DEFAULT_LOGS_DIR = "ledger/logs";

export function writeRunLog(
  run: RunRecord,
  baseDir = DEFAULT_LOGS_DIR
): { logPath: string; indexEntry: LogIndexEntry } {
  const runsDir = join(baseDir, "runs");
  const indexPath = join(baseDir, "index.jsonl");

  if (!existsSync(runsDir)) {
    mkdirSync(runsDir, { recursive: true });
  }

  const safeTimestamp = (run.startedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  const fileName = `run_${safeTimestamp}_${run.actorName}_${run.runId.slice(-6)}.log`;
  const relFilePath = `runs/${fileName}`;
  const fullLogPath = join(baseDir, relFilePath);

  // 1. Log dosyasini formatla
  const headerLines = [
    `======================= PROTOKOL-7 RUN LOG =======================`,
    `RUN_ID:     ${run.runId}`,
    `ACTOR:      ${run.actorName}`,
    `STATUS:     ${run.status.toUpperCase()}`,
    `STARTED:    ${run.startedAt}`,
    `FINISHED:   ${run.finishedAt || new Date().toISOString()}`,
    `DURATION:   ${run.durationMs ?? 0}ms`,
    `ITEMS:      ${run.itemCount ?? 0}`,
    `------------------------------------------------------------------`,
    `INPUT:      ${JSON.stringify(run.input)}`,
    `------------------------------------------------------------------`,
  ];

  let errorCount = 0;
  const logBodyLines = run.logs.map((log) => {
    if (log.level === "ERROR") errorCount++;
    return `[${log.timestamp}] [${log.level.padEnd(5)}] ${log.message}`;
  });

  if (run.errorMessage) {
    headerLines.push(`ERROR:      ${run.errorMessage}`);
    headerLines.push(`------------------------------------------------------------------`);
  }

  const fullContent = [
    ...headerLines,
    ...logBodyLines,
    `==================================================================\n`,
  ].join("\n");
  writeFileSync(fullLogPath, fullContent, "utf8");

  // 2. Fihrist kaydini olustur
  const summary = run.errorMessage
    ? `HATA: ${run.errorMessage.slice(0, 90)}`
    : `BASARILI: ${run.itemCount ?? 0} kayit cikarildi (${run.durationMs ?? 0}ms)`;

  const indexEntry: LogIndexEntry = {
    log_id: `log_${Date.now()}_${run.runId.slice(-6)}`,
    run_id: run.runId,
    actor: run.actorName,
    timestamp: run.finishedAt || new Date().toISOString(),
    status: run.status,
    duration_ms: run.durationMs ?? 0,
    item_count: run.itemCount ?? 0,
    error_count: errorCount,
    error_code: run.errorMessage ? "ERR_EXECUTION_FAILED" : undefined,
    file: relFilePath,
    summary,
  };

  const indexDir = dirname(indexPath);
  if (!existsSync(indexDir)) {
    mkdirSync(indexDir, { recursive: true });
  }

  appendFileSync(indexPath, `${JSON.stringify(indexEntry)}\n`, "utf8");

  return { logPath: fullLogPath, indexEntry };
}
