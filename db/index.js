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
   const campCols = db.prepare("PRAGMA table_info(campaigns)").all().map(c => c.name);
   if (!campCols.includes('revenue')) {
     db.exec('ALTER TABLE campaigns ADD COLUMN revenue REAL;');
   }
   const lpCols = db.prepare("PRAGMA table_info(landing_pages)").all().map(c => c.name);
   if (!lpCols.includes('slug')) {
     db.exec('ALTER TABLE landing_pages ADD COLUMN slug TEXT;');
   }
   if (!lpCols.includes('is_published')) {
     db.exec('ALTER TABLE landing_pages ADD COLUMN is_published BOOLEAN DEFAULT 0;');
   }
   const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
   if (!userCols.includes('email')) {
     // SQLite doesn't allow adding UNIQUE column to existing table with data
     // Need to handle this case - for now add without UNIQUE constraint
     db.exec('ALTER TABLE users ADD COLUMN email TEXT;');
     // Create unique index separately if needed
     try {
       db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);');
     } catch (e) {
       // Index creation might fail if duplicates exist
       console.warn('Could not create unique email index:', e.message);
     }
   }
   if (!userCols.includes('confirmed')) {
     db.exec('ALTER TABLE users ADD COLUMN confirmed BOOLEAN DEFAULT 0;');
   }

   return db;
 }

// No default export - use createDatabase() factory with DI
