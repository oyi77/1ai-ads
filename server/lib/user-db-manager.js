import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const USER_DB_DIR = path.join(process.cwd(), 'db', 'users');

/**
 * Get the file path for a user's isolated database.
 */
export function getUserDbPath(userId) {
  return path.join(USER_DB_DIR, `adforge_user_${userId}.db`);
}

/**
 * Open a user's isolated database with WAL mode and foreign keys.
 */
export function getUserDb(userId) {
  const dbPath = getUserDbPath(userId);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Create a user's isolated database with all tables if it doesn't exist.
 * Returns true if tables were created, false if DB already existed.
 */
export function ensureUserDb(userId) {
  const dbPath = getUserDbPath(userId);
  const needTables = !fs.existsSync(dbPath);

  fs.mkdirSync(USER_DB_DIR, { recursive: true });

  const db = getUserDb(userId);

  if (needTables) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS platform_accounts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL DEFAULT 'meta',
        account_name TEXT NOT NULL,
        credentials TEXT NOT NULL,
        platform_account_id TEXT,
        account_type TEXT DEFAULT 'ad_account',
        is_active INTEGER DEFAULT 1,
        health_status TEXT DEFAULT 'ok',
        last_error TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        platform TEXT,
        campaign_id TEXT,
        name TEXT,
        status TEXT,
        budget REAL DEFAULT 0,
        spend REAL DEFAULT 0,
        revenue REAL DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        roas REAL DEFAULT 0,
        last_synced TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        buying_type TEXT,
        bid_strategy TEXT
      );

      CREATE TABLE IF NOT EXISTS approval_drafts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        summary TEXT,
        details_json TEXT,
        proposed_by TEXT DEFAULT 'ai',
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        reviewed_at TEXT,
        reviewed_by TEXT,
        rejection_reason TEXT,
        execution_result TEXT
      );

      CREATE TABLE IF NOT EXISTS automation_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        trigger_metric TEXT,
        trigger_operator TEXT,
        trigger_value REAL,
        action_type TEXT,
        action_params TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS performance_history (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        date TEXT,
        spend REAL DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        revenue REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        config TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  db.close();
  return needTables;
}

/**
 * Initialize the master DB with the dashboard_users table.
 */
export function initMasterDb(masterDb) {
  masterDb.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'user',
      is_active INTEGER DEFAULT 1,
      telegram_bot_token TEXT,
      telegram_chat_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    );
  `);
}
