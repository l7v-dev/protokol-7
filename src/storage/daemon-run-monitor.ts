import { DatabaseSync } from "node:sqlite";

const EXPIRED = `status IN ('INITIALIZING','INGESTING','CLEANING','PACKING','VERIFYING')
  AND last_heartbeat_at IS NOT NULL AND heartbeat_interval_seconds > 0
  AND julianday(last_heartbeat_at) + heartbeat_interval_seconds * 3 / 86400.0 < julianday(?)`;

export interface DaemonRunHealth {
  monitoring: "disabled" | "ready" | "unavailable";
  stale_runs: Array<Record<string, unknown>>;
}

function openCatalog(path: string, readOnly: boolean): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly });
  try {
    db.exec("PRAGMA busy_timeout=1000");
    if (db.prepare("SELECT version FROM daemon_monitor_schema").get()?.version !== 1) {
      throw new Error("Unsupported daemon monitoring schema");
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function getDaemonRunHealth(
  path = process.env.PROTOKOL_DAEMON_RUN_DB,
  now = new Date()
): DaemonRunHealth {
  if (!path) return { monitoring: "disabled", stale_runs: [] };
  let db: DatabaseSync | undefined;
  try {
    db = openCatalog(path, true);
    const rows = db
      .prepare(`SELECT run_id, pipeline_name, status, last_heartbeat_at,
        heartbeat_interval_seconds FROM pipeline_runs
        WHERE ((${EXPIRED}) OR (status='FAILED' AND error_message='Heartbeat expired'))
        AND NOT EXISTS (
          SELECT 1 FROM pipeline_runs AS newer
          WHERE newer.pipeline_name=pipeline_runs.pipeline_name
          AND (newer.created_at > pipeline_runs.created_at
            OR (newer.created_at=pipeline_runs.created_at AND newer.rowid > pipeline_runs.rowid))
        )
        ORDER BY run_id`)
      .all(now.toISOString());
    return { monitoring: "ready", stale_runs: rows };
  } catch {
    return { monitoring: "unavailable", stale_runs: [] };
  } finally {
    db?.close();
  }
}

export function reapStaleDaemonRuns(path: string | undefined, now = new Date()): number {
  if (!path) return 0;
  // Opening read-only first ensures a missing catalog is never created by a reaper.
  const proof = openCatalog(path, true);
  proof.close();
  const db = openCatalog(path, false);
  try {
    const timestamp = now.toISOString();
    return Number(
      db
        .prepare(`UPDATE pipeline_runs SET status='FAILED', completed_at=?,
          error_message='Heartbeat expired' WHERE ${EXPIRED}`)
        .run(timestamp, timestamp).changes
    );
  } finally {
    db.close();
  }
}
