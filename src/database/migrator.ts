import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Database } from './client.js';

export type MigrationRecord = {
  version: string;
  appliedAt: Date;
};

export async function runMigrations(
  database: Database,
  migrationDirectory: string
): Promise<MigrationRecord[]> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const applied = new Set(
    (await database.query<{ version: string }>('SELECT version FROM schema_migrations'))
      .rows
      .map((row) => row.version)
  );

  const records: MigrationRecord[] = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');

    if (applied.has(version)) {
      continue;
    }

    const sql = await readFile(join(migrationDirectory, file), 'utf8');
    const appliedAt = await database.withTransaction(async (client) => {
      await client.query(sql);
      const result = await client.query<{ applied_at: Date }>(
        'INSERT INTO schema_migrations (version) VALUES ($1) RETURNING applied_at',
        [version]
      );
      return result.rows[0]?.applied_at ?? new Date();
    });

    records.push({ version, appliedAt });
  }

  return records;
}
