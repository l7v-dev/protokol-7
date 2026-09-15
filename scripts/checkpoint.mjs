#!/usr/bin/env node
/**
 * scripts/checkpoint.mjs
 *
 * L5 Güvenlik Seviyesi: Deterministik Atomik Kontrol Noktası ve Geri Alma Motoru
 * (L5 Runtime Contract: Atomic State Checkpoint and Rollback Engine)
 *
 * Ref: ADR 0006, rules/logging-discipline.md, rules/documentation-discipline.md
 * Log Standardı: Sıfır emoji, standart ASCII etiketler.
 */

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { ERROR_CLASSES, logTrace, SPAN_TYPES } from "./telemetry-logger.mjs";

const CHECKPOINT_DIR = "archive/checkpoints";
const CHECKPOINT_INDEX = `${CHECKPOINT_DIR}/index.jsonl`;

function ensureDir(path) {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function execGit(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

/**
 * Çalışma ağacının anlık durumunu Git ref ve metadata olarak kaydeder.
 */
export function createCheckpoint(label = "auto-checkpoint") {
  ensureDir(CHECKPOINT_INDEX);

  const timestamp = new Date().toISOString();
  const id = `chk-${Date.now()}`;
  const headCommit = execGit("git rev-parse --short HEAD");

  // Çalışma alanındaki uncommitted değişiklikleri yakalar
  let commitSha = "";
  try {
    commitSha = execGit(`git stash create "${id}: ${label}"`);
  } catch (_e) {
    commitSha = "";
  }

  // Eğer çalışma ağacı HEAD ile tamamen farksızsa commitSha HEAD olur
  if (!commitSha) {
    commitSha = execGit("git rev-parse HEAD");
  }

  // Ref kaydı oluştur
  try {
    execGit(`git update-ref refs/checkpoints/${id} ${commitSha}`);
  } catch (err) {
    console.error(`[ERROR] Git ref olusturulamadi: ${err.message}`);
    logTrace({
      span_type: SPAN_TYPES.SAFETY_MONITOR,
      task: "checkpoint-create",
      tool: "checkpoint",
      status: "failed",
      error_class: ERROR_CLASSES.UNKNOWN,
      metadata: { id, label },
    });
    return null;
  }

  // İzlenmeyen dosyaları kaydet
  let untrackedFiles = [];
  try {
    const rawUntracked = execGit("git ls-files --others --exclude-standard");
    if (rawUntracked) {
      untrackedFiles = rawUntracked.split("\n").filter(Boolean);
    }
  } catch (_e) {
    untrackedFiles = [];
  }

  const record = {
    id,
    label,
    timestamp,
    commit_sha: commitSha,
    head_commit: headCommit,
    untracked_count: untrackedFiles.length,
  };

  appendFileSync(CHECKPOINT_INDEX, `${JSON.stringify(record)}\n`, "utf8");

  logTrace({
    span_type: SPAN_TYPES.SAFETY_MONITOR,
    task: "checkpoint-create",
    tool: "checkpoint",
    target: id,
    status: "success",
    metadata: record,
  });

  console.log(`[OK] Kontrol noktasi olusturuldu: ${id} (${label}) -> ref: refs/checkpoints/${id}`);
  return record;
}

/**
 * Mevcut kontrol noktalarını indeks dosyasından okur.
 */
export function listCheckpoints() {
  if (!existsSync(CHECKPOINT_INDEX)) {
    console.log("[INFO] Kayitli kontrol noktasi bulunmuyor.");
    return [];
  }

  const lines = readFileSync(CHECKPOINT_INDEX, "utf8").split("\n").filter(Boolean);
  const checkpoints = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_e) {
        return null;
      }
    })
    .filter(Boolean);

  console.log(`=== KAYITLI KONTROL NOKTALARI (${checkpoints.length} Adet) ===\n`);
  for (const c of checkpoints) {
    console.log(
      `[CHECKPOINT] ${c.id} | ${c.timestamp} | ${c.label} | ref: ${c.commit_sha.slice(0, 7)}`
    );
  }
  return checkpoints;
}

/**
 * Çalışma alanını belirtilen veya en son kontrol noktasına geri döndürür.
 */
export function rollbackCheckpoint(targetId = "latest") {
  const checkpoints = listCheckpoints();
  if (checkpoints.length === 0) {
    console.error("[ERROR] Geri alinacak kontrol noktasi bulunamadi.");
    return false;
  }

  let target = null;
  if (targetId === "latest") {
    target = checkpoints[checkpoints.length - 1];
  } else {
    target = checkpoints.find((c) => c.id === targetId);
  }

  if (!target) {
    console.error(`[ERROR] Belirtilen kontrol noktasi bulunamadi: ${targetId}`);
    return false;
  }

  console.log(
    `[INFO] Geri alma baslatiliyor: ${target.id} (${target.label}) -> ${target.commit_sha.slice(0, 7)}...`
  );

  try {
    execGit(`git checkout refs/checkpoints/${target.id} -- .`);
    console.log(`[OK] Calisma alani basariyla kontrol noktasina geri donduruldu: ${target.id}`);

    logTrace({
      span_type: SPAN_TYPES.SAFETY_MONITOR,
      task: "checkpoint-rollback",
      tool: "checkpoint",
      target: target.id,
      status: "success",
      metadata: { targetId: target.id, commit: target.commit_sha },
    });
    return true;
  } catch (err) {
    console.error(`[ERROR] Geri alma islemi basarisiz: ${err.message}`);
    logTrace({
      span_type: SPAN_TYPES.SAFETY_MONITOR,
      task: "checkpoint-rollback",
      tool: "checkpoint",
      target: target.id,
      status: "failed",
      error_class: ERROR_CLASSES.UNKNOWN,
      metadata: { error: err.message },
    });
    return false;
  }
}

// CLI Yürütme Hattı
const command = process.argv[2] || "list";
const arg = process.argv[3];

if (command === "create") {
  createCheckpoint(arg || "manual-checkpoint");
} else if (command === "rollback") {
  rollbackCheckpoint(arg || "latest");
} else if (command === "list") {
  listCheckpoints();
} else {
  console.log(
    "Kullanim: node scripts/checkpoint.mjs [create <label> | rollback <id|latest> | list]"
  );
}
