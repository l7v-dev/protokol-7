/**
 * tests/telemetry-and-logs.test.ts
 *
 * Unit tests for TerminalTheme, Anomaly Telemetry, and RunLogger.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { writeRunLog } from "../src/api/run-logger";
import { RunRegistry } from "../src/api/run-registry";
import { recordAnomaly } from "../src/telemetry/anomalies";
import { TerminalTheme } from "../src/utils/terminal-theme";

describe("TerminalTheme - Deterministic ASCII Formatters", () => {
  it("formats status badge correctly with standard tags", () => {
    assert.equal(TerminalTheme.badge("INFO", "Süreç başladı"), "[INFO] Süreç başladı");
    assert.equal(TerminalTheme.badge("error", "Kritik hata"), "[ERROR] Kritik hata");
    assert.equal(TerminalTheme.badge("PASS", "Test geçti"), "[PASS] Test geçti");
  });

  it("renders ASCII banner with correct width and centering", () => {
    const banner = TerminalTheme.banner("TEST BASLIGI", "Alt Bilgi");
    const lines = banner.split("\n");
    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes("TEST BASLIGI"));
    assert.ok(lines[1].includes("Alt Bilgi"));
    // Zero emoji check
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(banner));
  });

  it("renders structured key-value panels", () => {
    const panel = TerminalTheme.panel("PANEL TEST", [
      ["Anahtar1", "Deger1"],
      ["UzunAnahtar", "Deger2"],
    ]);
    const lines = panel.split("\n");
    assert.equal(lines[0], "[PANEL TEST]");
    assert.ok(lines[1].includes("Anahtar1:"));
    assert.ok(lines[2].includes("UzunAnahtar:"));
  });

  it("renders aligned ASCII table", () => {
    const table = TerminalTheme.table(
      ["Aktor", "Sure", "Durum"],
      [
        ["wikipedia", "120ms", "PASS"],
        ["arxiv", "340ms", "FAIL"],
      ]
    );
    const lines = table.split("\n");
    assert.equal(lines.length, 4); // header, separator, 2 rows
    assert.ok(lines[0].includes("Aktor"));
    assert.ok(lines[1].includes("+-"));
  });
});

describe("Anomaly Telemetry - Stall and Error Tracking", () => {
  const testTelemetryFile = "ledger/test-telemetry.jsonl";

  it("records structured anomaly event to telemetry file", () => {
    if (existsSync(testTelemetryFile)) unlinkSync(testTelemetryFile);

    const event = recordAnomaly(
      {
        anomalyCode: "STALL_TIMEOUT",
        severity: "ERROR",
        component: "CrawlerActor",
        targetUrl: "https://example.com/slow-page",
        durationMs: 31000,
        message: "Playwright navigation timed out after 30s",
      },
      testTelemetryFile
    );

    assert.ok(event.eventId.startsWith("anom_"));
    assert.equal(event.anomalyCode, "STALL_TIMEOUT");
    assert.equal(event.severity, "ERROR");

    assert.ok(existsSync(testTelemetryFile));
    const content = readFileSync(testTelemetryFile, "utf8");
    assert.ok(content.includes("STALL_TIMEOUT"));
    assert.ok(content.includes("https://example.com/slow-page"));

    unlinkSync(testTelemetryFile);
  });
});

describe("RunLogger & RunRegistry - File Logging & Ledger Indexing", () => {
  const testBaseDir = "ledger/test-logs";

  it("writes atomic log file and adds entry to index.jsonl", () => {
    if (existsSync(testBaseDir)) rmSync(testBaseDir, { recursive: true, force: true });

    const dummyRun = {
      runId: "run_test_12345",
      actorName: "wikipedia",
      status: "succeeded" as const,
      input: { title: "Test Article" },
      logs: [
        {
          timestamp: "2026-09-28T12:00:00.000Z",
          level: "INFO" as const,
          message: "Sayfa sorgulaniyor",
        },
        { timestamp: "2026-09-28T12:00:01.000Z", level: "PASS" as const, message: "Sayfa alindi" },
      ],
      startedAt: "2026-09-28T12:00:00.000Z",
      finishedAt: "2026-09-28T12:00:01.000Z",
      durationMs: 1000,
      itemCount: 1,
    };

    const { logPath, indexEntry } = writeRunLog(dummyRun, testBaseDir);

    assert.ok(existsSync(logPath));
    const logContent = readFileSync(logPath, "utf8");
    assert.ok(logContent.includes("RUN_ID:     run_test_12345"));
    assert.ok(logContent.includes("Sayfa alindi"));

    const indexPath = join(testBaseDir, "index.jsonl");
    assert.ok(existsSync(indexPath));
    const indexContent = readFileSync(indexPath, "utf8");
    assert.ok(indexContent.includes("run_test_12345"));
    assert.equal(indexEntry.actor, "wikipedia");
    assert.equal(indexEntry.status, "succeeded");

    rmSync(testBaseDir, { recursive: true, force: true });
  });

  it("RunRegistry automatically writes run log on completion", () => {
    const registry = new RunRegistry();
    const run = registry.createRun("arxiv", { query: "machine learning" });
    registry.startRun(run.runId);
    registry.appendLog(run.runId, "INFO", "Sorgu baslatildi");
    registry.completeRun(run.runId, { articles: 5 }, 5);

    assert.equal(run.status, "succeeded");
    assert.equal(run.itemCount, 5);

    // Verify file log was flushed
    assert.ok(existsSync("ledger/logs/index.jsonl"));
    const indexContent = readFileSync("ledger/logs/index.jsonl", "utf8");
    assert.ok(indexContent.includes(run.runId));
  });
});
