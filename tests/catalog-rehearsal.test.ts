import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { rehearseCatalogMigration } from "../scripts/rehearse-catalog-migration";

test("catalog rehearsal includes committed WAL rows and leaves source schema unchanged", async () => {
  const root = mkdtempSync(join(tmpdir(), "catalog-rehearsal-"));
  const source = new DatabaseSync(join(root, "source.sqlite"));
  try {
    source.exec(readFileSync("context/schema.sql", "utf8"));
    source.exec(
      "ALTER TABLE pipeline_executions DROP COLUMN processing_metadata_json; PRAGMA journal_mode=WAL;"
    );
    source.exec(
      "INSERT INTO datasets VALUES ('fixture','fixture','fixture','public_domain','en',NULL,'2026-10-05');"
    );
    const report = await rehearseCatalogMigration(
      join(root, "source.sqlite"),
      join(root, "output")
    );
    assert.equal(report.before.datasets, 1);
    assert.equal(report.after.datasets, 1);
    assert.equal(report.liveMigrationApplied, false);
    assert.equal(
      source
        .prepare("PRAGMA table_info(pipeline_executions)")
        .all()
        .some((column) => column.name === "processing_metadata_json"),
      false
    );
    const restored = new DatabaseSync(report.backupPath, { readOnly: true });
    try {
      assert.equal(
        restored.prepare("SELECT dataset_id FROM datasets").get()?.dataset_id,
        "fixture"
      );
    } finally {
      restored.close();
    }
    await assert.rejects(
      rehearseCatalogMigration(join(root, "source.sqlite"), join(root, "output")),
      /EEXIST/
    );
  } finally {
    source.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("catalog rehearsal rejects existing broken foreign keys without migrating source", async () => {
  const root = mkdtempSync(join(tmpdir(), "catalog-invalid-"));
  const source = new DatabaseSync(join(root, "source.sqlite"));
  try {
    source.exec(
      "PRAGMA foreign_keys=OFF; CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES (1);"
    );
    await assert.rejects(
      rehearseCatalogMigration(join(root, "source.sqlite"), join(root, "output")),
      /foreign key/
    );
    assert.equal(source.prepare("SELECT COUNT(*) AS count FROM child").get()?.count, 1);
  } finally {
    source.close();
    rmSync(root, { recursive: true, force: true });
  }
});
