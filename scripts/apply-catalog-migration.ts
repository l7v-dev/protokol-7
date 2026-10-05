import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyBlueprintMigration } from "../src/api/blueprint-migration";
import { rehearseCatalogMigration } from "./rehearse-catalog-migration";

async function main() {
  const [catalog, backupDirectory] = process.argv.slice(2);
  if (!catalog || !backupDirectory)
    throw new Error("Catalog and new backup directory are required.");
  const proof = await rehearseCatalogMigration(catalog, backupDirectory);
  const db = new DatabaseSync(resolve(catalog));
  try {
    db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("Live catalog has foreign key violations.");
    applyBlueprintMigration(db);
    if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok")
      throw new Error("Post-migration integrity check failed.");
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("Post-migration foreign key check failed.");
    writeFileSync(
      resolve(backupDirectory, "activation.json"),
      `${JSON.stringify({ status: "passed", source: proof.source, backupPath: proof.backupPath, backupSha256: proof.backupSha256, appliedAt: new Date().toISOString() })}\n`,
      { flag: "wx", mode: 0o600 }
    );
    console.log("[PASS] Catalog migration applied; integrity and foreign keys passed.");
  } finally {
    db.close();
  }
}

main().catch(() => {
  console.error(
    "[ERROR] Catalog activation failed; consult backup and check schema before retrying."
  );
  process.exitCode = 1;
});
