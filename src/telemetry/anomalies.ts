/**
 * src/telemetry/anomalies.ts
 *
 * Protokol-7 Sistem Duraklama, Timeout ve Anomali Telemetrisi
 * Web scraping, crawling ve veri boru hatlarinda olusan sessiz kilitlenmeleri,
 * rate limit duraklamalarini, guvenlik engellerini ve zaman asimlarini kaydeder.
 *
 * Log Standardi: rules/logging-discipline.md (Sifir emoji, standart ASCII etiketler).
 */

import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AnomalyCode =
  | "STALL_TIMEOUT"
  | "RATE_LIMIT_BACKOFF"
  | "SECURITY_BLOCK_403"
  | "SSRF_INTERCEPTION"
  | "CIRCUIT_BREAKER_OPEN"
  | "MEMORY_PRESSURE"
  | "RETRY_EXHAUSTED";

export type AnomalySeverity = "WARN" | "ERROR" | "CRITICAL";

export interface AnomalyEvent {
  eventId: string;
  timestamp: string;
  anomalyCode: AnomalyCode;
  severity: AnomalySeverity;
  component: string;
  targetUrl?: string;
  durationMs?: number;
  backoffMs?: number;
  message: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_TELEMETRY_PATH = "ledger/telemetry.jsonl";

/**
 * Anomali olayini ledger/telemetry.jsonl kütügüne atomik olarak yazar.
 */
export function recordAnomaly(
  anomaly: Omit<AnomalyEvent, "eventId" | "timestamp">,
  filePath = DEFAULT_TELEMETRY_PATH
): AnomalyEvent {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const event: AnomalyEvent = {
    eventId: `anom_${randomUUID().substring(0, 8)}`,
    timestamp: new Date().toISOString(),
    ...anomaly,
  };

  const line = `${JSON.stringify({
    type: "ANOMALY_TELEMETRY",
    ...event,
  })}\n`;

  try {
    appendFileSync(filePath, line, "utf8");
  } catch (err) {
    console.error(`[TELEMETRY_ERROR] Anomali kaydedilemedi:`, err);
  }

  return event;
}
