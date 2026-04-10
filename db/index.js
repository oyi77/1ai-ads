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
     try { db.exec('ALTER TABLE campaigns ADD COLUMN revenue REAL;'); } catch (e) { console.warn('Migration warning (revenue):', e.message); }
   }
   const lpCols = db.prepare("PRAGMA table_info(landing_pages)").all().map(c => c.name);
   if (!lpCols.includes('slug')) {
     try { db.exec('ALTER TABLE landing_pages ADD COLUMN slug TEXT;'); } catch (e) { console.warn('Migration warning (slug):', e.message); }
   }
   if (!lpCols.includes('is_published')) {
     try { db.exec('ALTER TABLE landing_pages ADD COLUMN is_published BOOLEAN DEFAULT 0;'); } catch (e) { console.warn('Migration warning (is_published):', e.message); }
   }
   const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
   if (!userCols.includes('email')) {
     try { db.exec('ALTER TABLE users ADD COLUMN email TEXT;'); } catch (e) { console.warn('Migration warning (email):', e.message); }
   }
   if (!userCols.includes('confirmed')) {
     try { db.exec('ALTER TABLE users ADD COLUMN confirmed BOOLEAN DEFAULT 0;'); } catch (e) { console.warn('Migration warning (confirmed):', e.message); }
   }
   if (!userCols.includes('role')) {
     try { db.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "user";'); } catch (e) { console.warn('Migration warning (role):', e.message); }
   }
   if (!userCols.includes('plan')) {
     try { db.exec('ALTER TABLE users ADD COLUMN plan TEXT DEFAULT "free";'); } catch (e) { console.warn('Migration warning (plan):', e.message); }
   }
   // Backfill null emails for existing users
   try { db.exec("UPDATE users SET email = username || '@adforge.local' WHERE email IS NULL OR email = ''"); } catch (e) { console.warn('Backfill warning (email):', e.message); }
    // Backfill confirmed for admin
    try { db.exec("UPDATE users SET confirmed = 1 WHERE username = 'admin' AND confirmed = 0"); } catch (e) { console.warn('Backfill warning (confirmed):', e.message); }

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
        platform TEXT NOT NULL,
        account_name TEXT NOT NULL,
        credentials TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        health_status TEXT DEFAULT 'ok',
        last_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    const paCols = db.prepare("PRAGMA table_info(platform_accounts)").all().map(c => c.name);
    if (!paCols.includes('health_status')) {
      try { db.exec("ALTER TABLE platform_accounts ADD COLUMN health_status TEXT DEFAULT 'ok'"); } catch (e) { console.warn('Migration warning (health_status):', e.message); }
    }
    if (!paCols.includes('last_error')) {
      try { db.exec("ALTER TABLE platform_accounts ADD COLUMN last_error TEXT"); } catch (e) { console.warn('Migration warning (last_error):', e.message); }
    }

    // AI suggestions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_suggestions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        target_id TEXT,
        target_type TEXT,
        suggestion TEXT NOT NULL,
        rationale TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        applied_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Ensure campaigns have a unique constraint on campaign_id
    const campIndices = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='campaigns'").all().map(i => i.name);
    if (!campIndices.includes('idx_campaigns_platform_external_id')) {
      try {
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_platform_external_id ON campaigns(platform, campaign_id);');
      } catch (e) {
        console.warn('Migration warning (unique campaign index):', e.message);
      }
    }

    return db;
  }

// No default export - use createDatabase() factory with DI
