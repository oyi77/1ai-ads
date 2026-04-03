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
     db.exec('ALTER TABLE users ADD COLUMN email TEXT;');
   }
   if (!userCols.includes('confirmed')) {
     db.exec('ALTER TABLE users ADD COLUMN confirmed BOOLEAN DEFAULT 0;');
   }
   // Backfill null emails for existing users
   db.exec("UPDATE users SET email = username || '@adforge.local' WHERE email IS NULL OR email = ''");
    // Backfill confirmed for admin
    db.exec("UPDATE users SET confirmed = 1 WHERE username = 'admin' AND confirmed = 0");

    // Refresh Tokens table
    db.exec(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Multi-account support
    db.exec(`
      CREATE TABLE IF NOT EXISTS platform_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL, -- 'meta', 'google', 'tiktok', 'x', 'scalev'
        account_name TEXT NOT NULL,
        credentials TEXT NOT NULL, -- JSON string
        is_active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    return db;
 }

// No default export - use createDatabase() factory with DI
