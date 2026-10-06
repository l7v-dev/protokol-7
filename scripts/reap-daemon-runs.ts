import { reapStaleDaemonRuns } from "../src/storage/daemon-run-monitor.js";

const path = process.env.PROTOKOL_DAEMON_RUN_DB;
if (!path) throw new Error("PROTOKOL_DAEMON_RUN_DB is required");
const count = reapStaleDaemonRuns(path);
console.log(`[DAEMON-REAPER] expired_runs=${count}`);
