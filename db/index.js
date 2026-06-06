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

 const schema = readFileSync(schemaPath, 'utf-8');
 db.exec(schema);

 // Run versioned migrations for existing databases
 runMigrations(db);

 return db;
}
