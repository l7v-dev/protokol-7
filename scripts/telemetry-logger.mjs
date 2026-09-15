#!/usr/bin/env node
/**
 * scripts/telemetry-logger.mjs
 *
 * Deterministik Ajan Telemetri Kayıtçısı (Agent Telemetry Logger)
 * 9 Katmanlı Açıklık (Span) Mimarisi ve Korelasyon İzleme Motoru
 *
 * Ref: ADR 0003, ADR 0005, rules/logging-discipline.md, rules/documentation-discipline.md
 * Log Standardı: Sıfır emoji, standart ASCII etiketler.
 */

import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Dokuz Katmanlı Açıklık (Span) Taksonomisi
 * Kaynak: A Fault Detection Benchmark and Toolkit for LLM Agent Observability
 */
export const SPAN_TYPES = Object.freeze({
  PLANNING: "PLANNING",
  REASONING: "REASONING",
  TOOL_EXECUTION: "TOOL_EXECUTION",
  SAFETY_MONITOR: "SAFETY_MONITOR",
  DELEGATION: "DELEGATION",
  MEMORY_ACCESS: "MEMORY_ACCESS",
  CONTEXT_BUDGET: "CONTEXT_BUDGET",
  FEEDBACK_INTEG: "FEEDBACK_INTEG",
  SYSTEM_SYSCALL: "SYSTEM_SYSCALL",
});

/**
 * Deterministik Hata Parmak İzi Sınıfları
 */
export const ERROR_CLASSES = Object.freeze({
  LINT: "ERR_LINT_STYLE",
  SCA: "ERR_SCA_SLOPSQUAT",
  SECRET: "ERR_SECRET_DETECTED",
  DOC_JARGON: "ERR_DOCUMENTATION_JARGON",
  TYPE: "ERR_TYPE_MISMATCH",
  TEST: "ERR_TEST_FAILURE",
  SSRF: "ERR_SSRF_VIOLATION",
  TIMEOUT: "ERR_EXEC_TIMEOUT",
  UNKNOWN: "ERR_UNKNOWN",
});

/**
 * Belirtilen parametrelerle tekil bir açıklık (span) kaydı oluşturur ve atomik JSONL'e yazar.
 */
export function logTrace(entry, telemetryFile = "archive/telemetry.jsonl") {
  const dir = dirname(telemetryFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const spanType = entry.span_type || SPAN_TYPES.TOOL_EXECUTION;
  const traceId = entry.trace_id || randomUUID();
  const spanId = entry.span_id || randomUUID();
  const parentSpanId = entry.parent_span_id || null;

  const payload = {
    timestamp: new Date().toISOString(),
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: parentSpanId,
    span_type: spanType,
    task: entry.task || "unspecified",
    tier: entry.tier ?? 0,
    tool: entry.tool || "unknown",
    target: entry.target || null,
    duration_ms: entry.duration_ms || 0,
    status: entry.status === "failed" ? "failed" : "success",
    error_class: entry.error_class || null,
    payload: entry.payload || null,
    metadata: entry.metadata || {},
  };

  appendFileSync(telemetryFile, `${JSON.stringify(payload)}\n`, "utf8");
  return payload;
}

/**
 * Çok adımlı bir görev için paylaşılan bir trace_id bağlamı üretir.
 */
export function createTraceSession(task, tier = 0, telemetryFile = "archive/telemetry.jsonl") {
  const traceId = randomUUID();
  let rootSpanId = null;

  return {
    trace_id: traceId,
    task,
    tier,
    logSpan(spanType, details = {}) {
      const parentId = details.parent_span_id || rootSpanId;
      const record = logTrace(
        {
          trace_id: traceId,
          parent_span_id: parentId,
          span_type: spanType,
          task,
          tier,
          tool: details.tool || task,
          target: details.target,
          duration_ms: details.duration_ms || 0,
          status: details.status || "success",
          error_class: details.error_class || null,
          payload: details.payload || null,
          metadata: details.metadata || {},
        },
        telemetryFile
      );

      if (!rootSpanId) {
        rootSpanId = record.span_id;
      }
      return record;
    },
  };
}

if (process.argv[1]?.endsWith("telemetry-logger.mjs")) {
  const session = createTraceSession("system-health-check", 0);
  const root = session.logSpan(SPAN_TYPES.PLANNING, {
    tool: "task-planner",
    duration_ms: 12,
    payload: { goal: "verify-all-components", steps: 3 },
  });

  session.logSpan(SPAN_TYPES.TOOL_EXECUTION, {
    parent_span_id: root.span_id,
    tool: "doctor-runner",
    duration_ms: 45,
    status: "success",
  });

  session.logSpan(SPAN_TYPES.FEEDBACK_INTEG, {
    parent_span_id: root.span_id,
    tool: "verify-pipeline",
    duration_ms: 85,
    status: "success",
    payload: { exit_code: 0 },
  });

  console.log(
    `[OK] 9 katmanli telemetri oturumu archive/telemetry.jsonl dosyasina islendi (trace_id: ${session.trace_id}).`
  );
}
