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

/**
 * Surface duplicate numeric prefixes in the pending set. Warn only: three
 * historic dups (011, 027, 041) already ship and run cleanly via lexical
 * order + idempotent statements, so a hard boot-fail would brick every fresh
 * DB over a condition that is already safe on disk. The warning makes a NEW
 * same-prefix pair visible so a human can verify ordering.
 */
function assertNoDuplicatePendingPrefixes(files) {
 const seen = new Map();
 for (const f of files) {
  const prefix = f.match(/^(\d+)/)?.[1];
  if (!prefix) continue;
  if (seen.has(prefix)) {
   log.warn(`Duplicate migration prefix ${prefix}: ${seen.get(prefix)} and ${f} — lexical order decides; verify safety`);
  }
  seen.set(prefix, f);
 }
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
 assertNoDuplicatePendingPrefixes(pending);

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
