import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { applyBlueprintMigration } from "../src/api/blueprint-migration";

function inventory(db: DatabaseSync): Record<string, number> {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all();
  return Object.fromEntries(
    tables.map(({ name }) => {
      const quoted = String(name).replaceAll('"', '""');
      return [
        String(name),
        Number(db.prepare(`SELECT COUNT(*) AS count FROM "${quoted}"`).get()?.count),
      ];
    })
  );
}

function validate(db: DatabaseSync): void {
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok")
    throw new Error("Catalog integrity check failed.");
  if (db.prepare("PRAGMA foreign_key_check").all().length)
    throw new Error("Catalog foreign key check failed.");
}

/** Online backup captures committed WAL data; only the independent rehearsal copy is migrated. */
export async function rehearseCatalogMigration(sourcePath: string, outputDirectory: string) {
  const source = resolve(sourcePath);
  const output = resolve(outputDirectory);
  mkdirSync(output, { mode: 0o700 });
  const backupPath = resolve(output, "catalog-before.sqlite");
  const rehearsalPath = resolve(output, "catalog-rehearsal.sqlite");
  const sourceDb = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(sourceDb, backupPath);
  } finally {
    sourceDb.close();
  }
  const backupDb = new DatabaseSync(backupPath, { readOnly: true });
  let before: Record<string, number>;
  try {
    validate(backupDb);
    before = inventory(backupDb);
    await backup(backupDb, rehearsalPath);
  } finally {
    backupDb.close();
  }
  const rehearsal = new DatabaseSync(rehearsalPath);
  let after: Record<string, number>;
  try {
    rehearsal.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    applyBlueprintMigration(rehearsal);
    validate(rehearsal);
    after = inventory(rehearsal);
    for (const [table, count] of Object.entries(before)) {
      if (after[table] !== count) throw new Error("Migration changed an existing table row count.");
    }
    applyBlueprintMigration(rehearsal);
    validate(rehearsal);
  } finally {
    rehearsal.close();
  }
  const report = {
    status: "passed",
    source,
    backupPath,
    rehearsalPath,
    backupSha256: createHash("sha256").update(readFileSync(backupPath)).digest("hex"),
    before,
    after,
    liveMigrationApplied: false,
    checkedAt: new Date().toISOString(),
  };
  writeFileSync(resolve(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return report;
}

if (process.argv[1]?.endsWith("rehearse-catalog-migration.ts")) {
  const [source, output] = process.argv.slice(2);
  if (!source || !output) {
    console.error("Usage: tsx scripts/rehearse-catalog-migration.ts SOURCE NEW_OUTPUT_DIRECTORY");
    process.exitCode = 1;
  } else {
    rehearseCatalogMigration(source, output).then(
      (report) => console.log(JSON.stringify(report)),
      () => {
        console.error("[ERROR] Catalog rehearsal failed; source was not migrated.");
        process.exitCode = 1;
      }
    );
  }
}
