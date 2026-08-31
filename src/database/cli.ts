import { fileURLToPath } from 'node:url';

import { loadConfig } from '../config/env.js';
import { Database } from './client.js';
import { runMigrations } from './migrator.js';

const config = loadConfig();
const database = new Database(config);
const migrationDirectory = fileURLToPath(new URL('./migrations', import.meta.url));

try {
  const applied = await runMigrations(database, migrationDirectory);
  console.log(JSON.stringify({ appliedMigrations: applied.map((migration) => migration.version) }));
} finally {
  await database.close();
}
