import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const MIGRATION_FILES = [
  "infra/migrations/0002-blueprint-provenance.sql",
  "infra/migrations/0003-release-reviews.sql",
  "infra/migrations/0004-processing-evidence.sql",
  "infra/migrations/0011-producer-raw-evidence.sql",
  "infra/migrations/0012-corpus-producer-runs.sql",
];

export function applyBlueprintMigration(db: DatabaseSync): void {
  const statements = MIGRATION_FILES.flatMap((migrationFile) => {
    const migrationPath = [
      resolve(__dirname, "../..", migrationFile),
      resolve(__dirname, "../../..", migrationFile),
    ].find(existsSync);
    if (!migrationPath) {
      throw new Error("Blueprint migration file unavailable.");
    }
    return readFileSync(migrationPath, "utf8")
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
  });

  db.exec("BEGIN IMMEDIATE;");
  try {
    for (const statement of statements) {
      const alter = /^ALTER TABLE (\w+)\s+ADD COLUMN (\w+)\b/i.exec(statement);
      if (alter) {
        const columns = db.prepare(`PRAGMA table_info(${alter[1]})`).all();
        if (columns.some((column) => column.name === alter[2])) {
          continue;
        }
      }
      db.exec(statement);
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}
