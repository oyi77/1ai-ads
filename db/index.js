import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runMigrations } from './migrations/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'schema.sql');

export function createDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Only apply schema.sql to a brand-new (empty) database. On an existing
  // database we must NOT re-run schema.sql: it would error on indexes that
  // reference columns added later by migrations (e.g. telegram_id), and worse
  // it would attempt to recreate tables. Existing databases are brought up to
  // date exclusively by the versioned migrations below.
  const tableCount = db.prepare(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  ).get().n;

  if (tableCount === 0) {
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  // Versioned migrations bring existing databases up to date (and mark schema
  // objects that already exist as applied).
  runMigrations(db);

  return db;
}
