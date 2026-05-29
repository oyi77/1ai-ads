#!/usr/bin/env python3
"""
Migrate existing shared database data into per-user databases.
Run ONCE after upgrading to v3.0.

Reads master adforge.db, finds all users, 
and copies their relevant data into isolated user DBs.
"""
import sqlite3
import json
import os
import sys
from pathlib import Path

BASE_DIR = Path(os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "adforge", "db"))
MASTER_DB = str(BASE_DIR / "adforge.db")
USER_DB_DIR = str(BASE_DIR / "users")
os.makedirs(USER_DB_DIR, exist_ok=True)

def connect_master():
    conn = sqlite3.connect(MASTER_DB)
    conn.row_factory = sqlite3.Row
    return conn

def connect_user(user_id):
    path = os.path.join(USER_DB_DIR, f"adforge_user_{user_id}.db")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn

def ensure_user_tables(conn):
    c = conn.cursor()
    tables = [
        """CREATE TABLE IF NOT EXISTS platform_accounts (
            id TEXT PRIMARY KEY, platform TEXT NOT NULL DEFAULT 'meta',
            account_name TEXT NOT NULL, credentials TEXT NOT NULL,
            platform_account_id TEXT, account_type TEXT DEFAULT 'ad_account',
            is_active BOOLEAN DEFAULT 1, health_status TEXT DEFAULT 'ok',
            last_error TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""",
        """CREATE TABLE IF NOT EXISTS campaigns (
            id TEXT PRIMARY KEY, platform TEXT, campaign_id TEXT, name TEXT,
            status TEXT, budget REAL DEFAULT 0, spend REAL DEFAULT 0,
            revenue REAL DEFAULT 0, impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0, conversions INTEGER DEFAULT 0,
            roas REAL DEFAULT 0, last_synced TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            buying_type TEXT, bid_strategy TEXT)""",
        """CREATE TABLE IF NOT EXISTS approval_drafts (
            id TEXT PRIMARY KEY, type TEXT NOT NULL, summary TEXT,
            details_json TEXT, proposed_by TEXT DEFAULT 'ai',
            status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP, reviewed_by TEXT, rejection_reason TEXT,
            execution_result TEXT)""",
        """CREATE TABLE IF NOT EXISTS automation_rules (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, trigger_metric TEXT,
            trigger_operator TEXT, trigger_value REAL, action_type TEXT,
            action_params TEXT, is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""",
        """CREATE TABLE IF NOT EXISTS performance_history (
            id TEXT PRIMARY KEY, account_id TEXT, date TEXT,
            spend REAL DEFAULT 0, impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0, conversions INTEGER DEFAULT 0,
            revenue REAL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""",
    ]
    for sql in tables:
        c.execute(sql)
    conn.commit()

def migrate_user(user_id, username):
    """Migrate a single user's data from master DB to their isolated DB."""
    print(f"  Migrating user: {username} ({user_id})...")
    
    master = connect_master()
    mc = master.cursor()
    
    user_db = connect_user(user_id)
    ensure_user_tables(user_db)
    uc = user_db.cursor()
    
    migrated = []
    
    # 1. Platform accounts
    try:
        accounts = mc.execute("SELECT * FROM platform_accounts WHERE user_id = ?", (user_id,)).fetchall()
        for acc in accounts:
            existing = uc.execute("SELECT id FROM platform_accounts WHERE id = ?", (acc['id'],)).fetchone()
            if not existing:
                try:
                    uc.execute("""
                        INSERT INTO platform_accounts (id, platform, account_name, credentials, 
                            platform_account_id, account_type, is_active, health_status, 
                            last_error, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (acc['id'], acc['platform'], acc['account_name'], acc['credentials'],
                          acc['platform_account_id'], acc['account_type'], acc['is_active'],
                          acc['health_status'], acc['last_error'], acc['created_at'], acc['updated_at']))
                    migrated.append(f"  ✓ Account: {acc['account_name']}")
                except Exception as e:
                    print(f"  ✗ Failed account {acc['account_name']}: {e}")
        user_db.commit()
    except Exception as e:
        print(f"  ✗ No accounts found or error: {e}")
    
    # 2. Campaigns (via platform_account_id)
    try:
        account_ids = [a['platform_account_id'] for a in accounts if a['platform_account_id']]
        if account_ids:
            placeholders = ','.join('?' * len(account_ids))
            camps = master.execute(f"SELECT * FROM campaigns WHERE campaign_id IN ({placeholders})", account_ids).fetchall()
            for camp in camps:
                existing = uc.execute("SELECT id FROM campaigns WHERE id = ?", (camp['id'],)).fetchone()
                if not existing:
                    try:
                        uc.execute("""
                            INSERT INTO campaigns (id, platform, campaign_id, name, status, budget,
                                spend, revenue, impressions, clicks, conversions, roas,
                                last_synced, created_at, updated_at, buying_type, bid_strategy)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (camp['id'], camp['platform'], camp['campaign_id'], camp['name'],
                              camp['status'], camp['budget'], camp['spend'], camp['revenue'],
                              camp['impressions'], camp['clicks'], camp['conversions'], camp['roas'],
                              camp['last_synced'], camp['created_at'], camp['updated_at'],
                              camp.get('buying_type'), camp.get('bid_strategy')))
                        migrated.append(f"  ✓ Campaign: {camp['name']}")
                    except Exception as e:
                        print(f"  ✗ Failed campaign {camp.get('name')}: {e}")
        user_db.commit()
    except Exception as e:
        print(f"  ✗ No campaigns found: {e}")
    
    # 3. Approval drafts (via user_id if it was stored)
    try:
        drafts = mc.execute("SELECT * FROM approval_drafts WHERE user_id = ?", (user_id,)).fetchall()
        for draft in drafts:
            existing = uc.execute("SELECT id FROM approval_drafts WHERE id = ?", (draft['id'],)).fetchone()
            if not existing:
                try:
                    uc.execute("""
                        INSERT INTO approval_drafts (id, type, summary, details_json, proposed_by,
                            status, created_at, reviewed_at, reviewed_by, rejection_reason, execution_result)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (draft['id'], draft['type'], draft['summary'], draft['details_json'],
                          draft['proposed_by'], draft['status'], draft['created_at'],
                          draft['reviewed_at'], draft['reviewed_by'], draft['rejection_reason'],
                          draft['execution_result']))
                    migrated.append(f"  ✓ Draft: {draft.get('summary', '')[:30]}")
                except Exception:
                    pass
        user_db.commit()
    except Exception as e:
        print(f"  ✗ No drafts: {e}")
    
    master.close()
    user_db.close()
    
    return migrated

def main():
    master = connect_master()
    users = master.execute("SELECT id, username FROM dashboard_users").fetchall()
    master.close()
    
    print(f"Found {len(users)} users in master database.")
    total_migrated = 0
    
    for user in users:
        items = migrate_user(user['id'], user['username'])
        total_migrated += len(items)
        for item in items:
            print(item)
    
    print(f"\n{'='*50}")
    print(f"Migration complete: {total_migrated} items migrated across {len(users)} users.")
    print(f"Each user now has their own DB at: {USER_DB_DIR}")

if __name__ == "__main__":
    main()
