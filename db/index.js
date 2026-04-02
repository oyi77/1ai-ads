import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'schema.sql');

export function createDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Migrations for existing databases
  const cols = db.prepare("PRAGMA table_info(campaigns)").all().map(c => c.name);
  if (!cols.includes('revenue')) {
    db.exec('ALTER TABLE campaigns ADD COLUMN revenue REAL;');
  }

  return db;
}

// No default export - use createDatabase() factory with DI
