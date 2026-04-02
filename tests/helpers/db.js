import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '../../db/schema.sql');

export function createTestDb() {
  const db = new Database(':memory:');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  return db;
}
