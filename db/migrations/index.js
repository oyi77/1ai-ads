import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createLogger } from '../../server/lib/logger.js';

const log = createLogger('migrations');

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS_TABLE = `
 CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT DEFAULT (datetime('now'))
 )
`;

function ensureMigrationsTable(db) {
 db.exec(MIGRATIONS_TABLE);
}

function getAppliedMigrations(db) {
 return db.prepare('SELECT name FROM _migrations').all().map(r => r.name);
}

function loadMigrationFiles() {
 const files = readdirSync(__dirname)
  .filter(f => f.endsWith('.sql'))
  .sort();
 return files;
}

const IGNORABLE_PATTERNS = [
 /duplicate column name/i,
 /already exists/i,
 /index .* already exists/i,
];

function isIgnorableError(err) {
 return IGNORABLE_PATTERNS.some(p => p.test(err.message));
}

export function runMigrations(db) {
 ensureMigrationsTable(db);
 const applied = getAppliedMigrations(db);
 const allFiles = loadMigrationFiles();
 const pending = allFiles.filter(f => !applied.includes(f));

 for (const file of pending) {
  const sql = readFileSync(join(__dirname, file), 'utf-8');
  try {
   db.exec('BEGIN TRANSACTION');
   db.exec(sql);
   db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
   db.exec('COMMIT');
   log.info(`Migration applied: ${file}`);
  } catch (err) {
   db.exec('ROLLBACK');
   if (isIgnorableError(err)) {
    // Column/index already exists — mark as applied
    db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(file);
    log.info(`Migration already applied (skipped): ${file}`);
   } else {
    log.error(`Migration FAILED: ${file}`, err.message);
    throw err;
   }
  }
 }
}
