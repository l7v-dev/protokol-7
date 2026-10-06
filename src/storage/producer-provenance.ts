import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { TextNormalizer } from "../pipeline/processors/text-normalizer.js";

export interface WorkerProvenance {
  sha256: string;
  size: number;
  storageUri: string;
  sourceUri: string;
  sourceId: string;
  sourceRecordId: string;
  runId: string;
  acquiredAt: string;
  text?: string;
}

export function recordWorkerProvenance(record: WorkerProvenance): void {
  const path = process.env.PROTOKOL_PROVENANCE_DB;
  if (!path) return;
  if (!/^[a-f0-9]{64}$/.test(record.sha256) || record.size < 0)
    throw new Error("Invalid raw artifact receipt");
  const uri = new URL(record.sourceUri);
  if (uri.username || uri.password) throw new Error("Evidence URI contains credentials");
  for (const key of [...uri.searchParams.keys()]) {
    if (
      /^(api_?key|token|access_token|signature|key|x-amz-(signature|credential|security-token))$/i.test(
        key
      )
    )
      uri.searchParams.delete(key);
  }
  // Prove the migrated catalog exists before allowing a writable connection.
  const proof = new DatabaseSync(path, { readOnly: true });
  try {
    proof.prepare("SELECT raw_artifact_id FROM raw_artifacts LIMIT 0").all();
  } finally {
    proof.close();
  }
  const db = new DatabaseSync(path);
  const rawId = `sha256:${record.sha256}`;
  const now = new Date().toISOString();
  try {
    db.exec("PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
    db.prepare("INSERT OR IGNORE INTO raw_artifacts VALUES (?,?,?,?)").run(
      rawId,
      record.sha256,
      record.size,
      now
    );
    if (
      db.prepare("SELECT byte_size FROM raw_artifacts WHERE raw_artifact_id=?").get(rawId)
        ?.byte_size !== record.size
    )
      throw new Error("Raw artifact size conflict");
    db.prepare("INSERT OR IGNORE INTO raw_artifact_locations VALUES (?,?)").run(
      rawId,
      record.storageUri
    );
    db.prepare(
      "INSERT OR IGNORE INTO pipeline_run_manifests (manifest_id,run_id,trace_id,pipeline,started_at,status,agent_id,agent_version,config_sha256,created_at) VALUES (?,?,?,?,?,'partial','task-worker','1',?,?)"
    ).run(
      record.runId,
      record.runId,
      record.runId.replaceAll("-", ""),
      record.sourceId,
      record.acquiredAt,
      createHash("sha256").update("worker-provenance.v1").digest("hex"),
      now
    );
    const acquisition = createHash("sha256")
      .update(
        JSON.stringify([
          record.runId,
          record.sourceId,
          record.sourceRecordId,
          uri.toString(),
          rawId,
        ])
      )
      .digest("hex");
    db.prepare("INSERT OR IGNORE INTO raw_artifact_acquisitions VALUES (?,?,?,?,?,?,?)").run(
      acquisition,
      rawId,
      record.sourceId,
      record.sourceRecordId,
      uri.toString(),
      record.acquiredAt,
      record.runId
    );
    if (record.text?.trim()) {
      const normalizer = new TextNormalizer();
      const text = normalizer.normalize(record.text);
      const document = createHash("sha256").update(text).digest("hex");
      const receipt = createHash("sha256")
        .update(
          JSON.stringify([record.runId, record.sourceId, record.sourceRecordId, document, rawId])
        )
        .digest("hex");
      if (
        !db.prepare("SELECT 1 FROM producer_occurrence_receipts WHERE receipt_id=?").get(receipt)
      ) {
        db.prepare(
          "INSERT OR IGNORE INTO document_provenance (document_id,canonicalization_version,language,pii_status,split,rights_status,created_at) VALUES (?,?,'und','unchecked','unassigned','unknown',?)"
        ).run(document, normalizer.canonicalizationVersion, now);
        if (
          db
            .prepare("SELECT canonicalization_version FROM document_provenance WHERE document_id=?")
            .get(document)?.canonicalization_version !== normalizer.canonicalizationVersion
        )
          throw new Error("Canonicalization policy conflict");
        const occurrence = db
          .prepare(
            "INSERT INTO document_occurrences(document_id,source_id,source_record_id,source_uri,acquired_at,raw_artifact_id) VALUES (?,?,?,?,?,?)"
          )
          .run(
            document,
            record.sourceId,
            record.sourceRecordId,
            uri.toString(),
            record.acquiredAt,
            rawId
          ).lastInsertRowid;
        db.prepare("INSERT INTO document_occurrence_runs VALUES (?,?)").run(
          occurrence,
          record.runId
        );
        db.prepare("INSERT INTO producer_occurrence_receipts VALUES (?,?,?)").run(
          receipt,
          occurrence,
          record.runId
        );
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* BEGIN may have failed before opening a transaction. */
    }
    throw error;
  } finally {
    db.close();
  }
}

/** Replay committed ledger outcomes independently; a catalog outage never reverses a job. */
export function reconcileWorkerProvenance(ledgerPath: string): void {
  const path = process.env.PROTOKOL_PROVENANCE_DB;
  if (!path) return;
  const ledger = new DatabaseSync(ledgerPath, { readOnly: true });
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout=10000; BEGIN IMMEDIATE");
    for (const row of db
      .prepare(
        "SELECT run_id FROM pipeline_run_manifests WHERE agent_id='task-worker' AND status='partial'"
      )
      .all()) {
      const job = ledger
        .prepare("SELECT status,updated_at FROM jobs WHERE id=?")
        .get(String(row.run_id));
      if (!job || !["succeeded", "failed", "quarantined"].includes(String(job.status))) continue;
      const status = job.status === "succeeded" ? "success" : "failed";
      db.prepare(
        "UPDATE pipeline_run_manifests SET status=?,finished_at=?,counts_json=?,errors_json=? WHERE run_id=?"
      ).run(
        status,
        String(job.updated_at),
        JSON.stringify({ jobs: 1 }),
        JSON.stringify(status === "failed" ? { job_status: job.status } : {}),
        String(row.run_id)
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* No transaction if BEGIN failed. */
    }
    throw error;
  } finally {
    db.close();
    ledger.close();
  }
}
