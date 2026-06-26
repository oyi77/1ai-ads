#!/usr/bin/env python3
"""
vilona_csv_auto_watcher.py — Auto CSV Parser & Taglink Attribution Engine
Version 2.0 — Per-User Database + Supabase Push

Triggers:
  - New CSV lands in inbound/ dir → auto-detect, parse, push
  - Sends Telegram notification to user

Usage:
  python3 scripts/vilona_csv_auto_watcher.py          # Watch mode (runs forever)
  python3 scripts/vilona_csv_auto_watcher.py --once    # Parse all pending CSVs
"""
import csv
import json
import os
import sys
import glob
import time
import hashlib
import requests
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

# === CONFIG ===
INBOUND_DIR = Path("/home/openclaw/.openclaw/media/inbound")
PROCESSED_DIR = Path("/home/openclaw/.openclaw/media/processed")
WATCHED_DIR = Path("/home/openclaw/.openclaw/media/inbound")
SUPABASE_URL = 'https://fqlstjiabpczutscykdc.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxbHN0amlhYnBjenV0c2N5a2RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTExMTEzNiwiZXhwIjoyMDk0Njg3MTM2fQ.y5wmvpvL-Q1z03_YKfnV_dEbP6pN1C156mwBCOyP4_E'
USER_DB_DIR = Path("/home/openclaw/.openclaw/workspace/adforge/db/users")
MASTER_DB = "/home/openclaw/.openclaw/workspace/adforge/db/adforge.db"

# File patterns
COMMISSION_PATTERN = "AffiliateCommissionReport_*.csv"
CLICK_PATTERN = "WebsiteClickReport*.csv"

os.makedirs(str(PROCESSED_DIR), exist_ok=True)

# === HELPERS ===

def get_user_db(user_id):
    path = USER_DB_DIR / f"adforge_user_{user_id}.db"
    if not path.exists():
        return None
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn

def get_all_users():
    """Get all users who have telegram configured."""
    conn = sqlite3.connect(MASTER_DB)
    conn.row_factory = sqlite3.Row
    users = conn.execute("""
        SELECT id, username, telegram_bot_token, telegram_chat_id 
        FROM dashboard_users WHERE telegram_bot_token IS NOT NULL
    """).fetchall()
    conn.close()
    return users

def detect_account_from_filename(filename):
    """Detect which account a CSV belongs to based on filename patterns."""
    name = filename.lower()
    if "kakriput" in name:
        return "4356"
    elif "8458" in name or "nyamiresep" in name:
        return "8458"
    else:
        return "0858"  # default

def detect_file_type(filename):
    """Determine if file is click report or commission report."""
    if filename.startswith("WebsiteClickReport") or "click" in filename.lower():
        return "click"
    elif filename.startswith("AffiliateCommissionReport") or "commission" in filename.lower():
        return "commission"
    return "unknown"

def parse_click_report(filepath):
    """Parse Shopee Click Report CSV."""
    clicks_per_tag = defaultdict(int)
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                tag = row.get('Tag_link', '').replace('----', '').strip()
                if tag:
                    clicks_per_tag[tag] += 1
    except Exception as e:
        return None, f"Parse click error: {e}"
    
    total_clicks = sum(clicks_per_tag.values())
    return {"total_clicks": total_clicks, "per_tag": dict(clicks_per_tag), "filename": os.path.basename(filepath)}, None

def parse_commission_report(filepath):
    """Parse Shopee Commission Report CSV."""
    orders = defaultdict(set)
    total_comm = defaultdict(float)
    completed_orders = 0
    total_revenue = 0.0
    
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                oid = row.get('ID Pemesanan', '')
                if not oid:
                    continue
                tag = row.get('Tag_link1', '').strip()
                comm_raw = row.get('Komisi Bersih Affiliate (Rp)', '0').replace(',', '')
                status = row.get('Status Pesanan', '')
                try:
                    comm = float(comm_raw)
                except:
                    comm = 0.0
                
                if tag:
                    orders[tag].add(oid)
                    total_comm[tag] += comm
                total_revenue += comm
                if status == 'Selesai':
                    completed_orders += 1
    except Exception as e:
        return None, f"Parse commission error: {e}"
    
    total_orders = sum(len(o) for o in orders.values())
    return {
        "total_revenue": total_revenue,
        "total_orders": total_orders,
        "completed_orders": completed_orders,
        "per_tag": {tag: {"orders": len(oids), "commission": total_comm[tag]} for tag, oids in orders.items()},
        "filename": os.path.basename(filepath)
    }, None

def push_to_supabase(account_id, click_data, commission_data):
    """Push parsed data to Supabase dashboard."""
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal,resolution=merge-duplicates"
    }
    
    # Ensure account exists
    acc_url = f"{SUPABASE_URL}/rest/v1/accounts"
    requests.post(acc_url, headers=headers, json={"id": account_id, "name": f"Account {account_id}"})
    
    # Push click data
    url_upsert = f"{SUPABASE_URL}/rest/v1/daily_metrics?on_conflict=account_id,date"
    
    today = datetime.now().strftime('%Y-%m-%d')
    metrics = [{
        "account_id": account_id,
        "date": today,
        "clicks": click_data['total_clicks'] if click_data else 0,
        "orders": commission_data['total_orders'] if commission_data else 0,
        "commission": int(commission_data['total_revenue']) if commission_data else 0,
        "spend": 0
    }]
    
    res = requests.post(url_upsert, headers=headers, json=metrics)
    if res.status_code in [200, 201]:
        return True
    else:
        print(f"  ⚠ Supabase push: {res.status_code} {res.text[:100]}")
        return False

def send_telegram_notification(user, click_data, commission_data, account_id):
    """Send auto-process notification to user's Telegram bot."""
    if not user or not user['telegram_bot_token']:
        return
    
    token = user['telegram_bot_token']
    chat_id = user['telegram_chat_id']
    
    lines = []
    
    if click_data:
        c = click_data
        lines.append(f"📈 *SHOPEE AUTO-SYNC*")
        lines.append(f"└ Account: {account_id}")
        lines.append(f"")
        lines.append(f"🖱 *{c['total_clicks']:,} Clicks*")
        lines.append(f"   Top tags:")
        top_tags = sorted(c['per_tag'].items(), key=lambda x: -x[1])[:3]
        for tag, count in top_tags:
            lines.append(f"   • {tag}: {count}")
    
    if commission_data:
        co = commission_data
        lines.append(f"")
        lines.append(f"💰 *Revenue: Rp{co['total_revenue']:,.0f}*")
        lines.append(f"📦 Orders: {co['total_orders']} | ✅ Completed: {co['completed_orders']}")
    
    lines.append(f"")
    lines.append(f"📁 Source: {os.path.basename(click_data['filename'] if click_data else commission_data['filename'])}")
    
    message = "\n".join(lines)
    
    try:
        requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                     json={"chat_id": chat_id, "text": message, "parse_mode": "Markdown"}, timeout=10)
        print(f"  ✅ Telegram sent to {user['username']}")
    except Exception as e:
        print(f"  ⚠ Telegram failed: {e}")

def process_csv(filepath):
    """Process a single CSV file: detect type, parse, push, notify."""
    filename = os.path.basename(filepath)
    filetype = detect_file_type(filename)
    account = detect_account_from_filename(filename)
    
    print(f"\n📄 Processing: {filename}")
    print(f"   Type: {filetype} | Account: {account}")
    
    click_data = None
    commission_data = None
    
    if filetype == "click":
        click_data, err = parse_click_report(filepath)
        if err:
            print(f"   ❌ {err}")
            return False
        
        # Look for a matching commission file
        date_part = filename.split("---")[0].replace("WebsiteClickReport", "")[:12]
        comm_pattern = f"AffiliateCommissionReport_{date_part}*.csv"
        comm_files = sorted(glob.glob(str(INBOUND_DIR / comm_pattern)), key=os.path.getmtime, reverse=True)
        
        # Try searching for any commission file from same day
        if not comm_files:
            day_part = date_part[:8]  # YYYYMMDD
            comm_pattern2 = f"AffiliateCommissionReport_{day_part}*.csv"
            comm_files = sorted(glob.glob(str(INBOUND_DIR / comm_pattern2)), key=os.path.getmtime, reverse=True)
        
        if comm_files:
            print(f"   🔗 Found matching commission: {os.path.basename(comm_files[0])}")
            commission_data, err2 = parse_commission_report(comm_files[0])
            if err2:
                print(f"   ⚠ Commission parse: {err2}")
    
    elif filetype == "commission":
        commission_data, err = parse_commission_report(filepath)
        if err:
            print(f"   ❌ {err}")
            return False
        
        # Look for matching click file
        date_part = filename.replace("AffiliateCommissionReport_", "").split("---")[0][:12]
        click_pattern = f"WebsiteClickReport{date_part}*.csv"
        click_files = sorted(glob.glob(str(INBOUND_DIR / click_pattern)), key=os.path.getmtime, reverse=True)
        
        if not click_files:
            day_part = date_part[:8]
            click_pattern2 = f"WebsiteClickReport{day_part}*.csv"
            click_files = sorted(glob.glob(str(INBOUND_DIR / click_pattern2)), key=os.path.getmtime, reverse=True)
        
        if click_files:
            print(f"   🔗 Found matching clicks: {os.path.basename(click_files[0])}")
            click_data, err2 = parse_click_report(click_files[0])
            if err2:
                print(f"   ⚠ Click parse: {err2}")
    
    elif filetype == "unknown":
        # Try parsing as both
        print(f"   ⚠ Unknown type, attempting both parsers...")
        click_data, err1 = parse_click_report(filepath)
        if not err1 and click_data:
            filetype = "click"
        else:
            commission_data, err2 = parse_commission_report(filepath)
            if not err2 and commission_data:
                filetype = "commission"
    
    # Push to Supabase
    if click_data or commission_data:
        result = push_to_supabase(account, click_data, commission_data)
        if result:
            print(f"   ✅ Supabase push: Account {account}")
        else:
            print(f"   ⚠ Supabase push attempted")
    
    # Send notification to all users with bots
    users = get_all_users()
    for user in users:
        send_telegram_notification(user, click_data, commission_data, account)
    
    # Move processed file
    dest = PROCESSED_DIR / filename
    try:
        os.rename(filepath, str(dest))
        print(f"   📁 Moved to processed/")
    except:
        print(f"   ⚠ Could not move file")
    
    # Also update local per-user DB
    update_local_user_db(account, click_data, commission_data)
    
    return True

def update_local_user_db(account_id, click_data, commission_data):
    """Update the per-user databases with parsed data."""
    master = sqlite3.connect(MASTER_DB)
    master.row_factory = sqlite3.Row
    users = master.execute("SELECT id FROM dashboard_users").fetchall()
    master.close()
    
    today = datetime.now().strftime('%Y-%m-%d')
    
    for user in users:
        db = get_user_db(user['id'])
        if not db:
            continue
        
        try:
            c = db.cursor()
            
            # Upsert a campaign entry for tracking
            if click_data or commission_data:
                total_clicks = click_data['total_clicks'] if click_data else 0
                total_revenue = commission_data['total_revenue'] if commission_data else 0
                total_orders = commission_data['total_orders'] if commission_data else 0
                
                # Check if we already have today's entry
                existing = c.execute(
                    "SELECT id FROM campaigns WHERE name = ? AND campaign_id = ?",
                    (f"Shopee-Auto-{today}", f"shopee_{account_id}_{today}")
                ).fetchone()
                
                if not existing:
                    import time
                    unique_id = f"shopee_{account_id}_{today}_{int(time.time()*1000)}"
                    c.execute("""
                        INSERT INTO campaigns (id, platform, campaign_id, name, status, spend, revenue, impressions, clicks, conversions)
                        VALUES (?, 'shopee', ?, ?, 'SYNCED', 0, ?, 0, ?, ?)
                    """, (
                        unique_id,
                        f"shopee_{account_id}_{today}",
                        f"Shopee Auto Sync {today} (Account {account_id})",
                        total_revenue, total_clicks, total_orders
                    ))
                    db.commit()
            
            db.close()
        except Exception as e:
            print(f"  ⚠ Local DB update failed for {user['id']}: {e}")
            try:
                db.close()
            except:
                pass

def watch_mode(interval=30):
    """Daemon mode — watch inbound dir for new CSVs every N seconds."""
    print(f"🔍 CSV Watcher started. Checking every {interval}s...")
    print(f"   Watching: {INBOUND_DIR}")
    print(f"   Output:   {PROCESSED_DIR}")
    print(f"   Press Ctrl+C to stop\n")
    
    seen = set()
    
    while True:
        files = sorted(glob.glob(str(INBOUND_DIR / "*.csv")), key=os.path.getmtime)
        
        for filepath in files:
            fname = os.path.basename(filepath)
            if fname not in seen:
                seen.add(fname)
                process_csv(filepath)
        
        time.sleep(interval)

def once_mode():
    """Process all pending CSVs once."""
    print(f"🔍 Processing all pending CSVs in {INBOUND_DIR}...")
    files = sorted(glob.glob(str(INBOUND_DIR / "*.csv")), key=os.path.getmtime)
    
    if not files:
        print("No CSV files found.")
        return
    
    for filepath in files:
        # Skip files that look like templates/samples
        fname = os.path.basename(filepath)
        if "template" in fname.lower():
            print(f"⏩ Skipping template: {fname}")
            continue
        process_csv(filepath)
    
    print(f"\n✅ Processed {len(files)} files.")

if __name__ == "__main__":
    if "--once" in sys.argv:
        once_mode()
    else:
        # Default: watch mode
        interval = 30
        for arg in sys.argv:
            if arg.startswith("--interval="):
                interval = int(arg.split("=")[1])
        watch_mode(interval)
