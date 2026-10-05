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
import { LogEmitter } from "./log-emitter";

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
  traceId?: string;
  spanId?: string;
}

const DEFAULT_TELEMETRY_PATH = "ledger/telemetry.jsonl";

/**
 * Persists OTel metadata and mirrors identifiers to the optional JSONL ledger.
 */
export function recordAnomaly(
  anomaly: Omit<AnomalyEvent, "eventId" | "timestamp">,
  filePath: string | null = DEFAULT_TELEMETRY_PATH,
  emitter = new LogEmitter()
): AnomalyEvent {
  const log = emitter.emit({
    eventName: `anomaly.${anomaly.anomalyCode}`,
    severity: anomaly.severity === "CRITICAL" ? "ERROR" : anomaly.severity,
    traceId: anomaly.traceId,
    spanId: anomaly.spanId,
    durationMs: anomaly.durationMs,
  });
  const event: AnomalyEvent = {
    eventId: `anom_${randomUUID().substring(0, 8)}`,
    timestamp: new Date().toISOString(),
    ...anomaly,
    traceId: log.trace_id,
    spanId: log.span_id,
  };

  if (filePath !== null) {
    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const line = `${JSON.stringify({
        type: "ANOMALY_TELEMETRY",
        eventId: event.eventId,
        anomalyCode: event.anomalyCode,
        component: /^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(event.component)
          ? event.component
          : "unknown",
        message: log.body,
        ...log,
      })}\n`;
      appendFileSync(filePath, line, "utf8");
    } catch {
      console.error("[TELEMETRY_ERROR] JSONL mirror unavailable; SQLite event persisted.");
    }
  }

  return event;
}
