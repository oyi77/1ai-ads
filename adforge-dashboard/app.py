#!/usr/bin/env python3
"""
AdForge Dashboard v3.0 — Per-User Database Isolation
Each user gets their OWN SQLite DB. Master DB only for authentication.

Features:
- Per-user login with isolated database
- Per-user platform account management
- Telegram Bot integration per user (BotFather token)
- Real-time FB ad alerts via user's bot
"""
from flask import Flask, render_template, jsonify, request, redirect, url_for, session
from datetime import datetime, timedelta
import sqlite3
import json
import uuid
import os
from pathlib import Path
from functools import wraps
import requests
import hashlib
import time
from collections import defaultdict
import hashlib
import shutil

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = os.getenv('ADFORGE_DASHBOARD_SECRET', os.urandom(32).hex())
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)

# ============ RATE LIMITER ============
_rate_limits = defaultdict(list)

def rate_limit(max_attempts=10, window=300):
    """Simple in-memory rate limiter. 10 attempts per 5 min window by default."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            ip = request.remote_addr or '127.0.0.1'
            now = time.time()
            _rate_limits[ip] = [t for t in _rate_limits[ip] if now - t < window]
            if len(_rate_limits[ip]) >= max_attempts:
                if request.path.startswith('/api/'):
                    return jsonify({'success': False, 'error': 'Too many attempts. Try again later.'}), 429
                return render_template('login_dashboard.html', error='Too many login attempts. Please wait 5 minutes.'), 429
            _rate_limits[ip].append(now)
            return f(*args, **kwargs)
        return wrapper
    return decorator

# Paths
BASE_DIR = Path("/home/openclaw/.openclaw/workspace/adforge/db")
MASTER_DB = str(BASE_DIR / "adforge.db")
USER_DB_DIR = str(BASE_DIR / "users")
os.makedirs(USER_DB_DIR, exist_ok=True)

API_URL = "http://127.0.0.1:3001"
API_USER = "admin"
API_PASS = "admin123"

# Load FB config from .env
ENV_PATH = "/home/openclaw/.openclaw/workspace/adforge/.env"
FB_SYSTEM_TOKEN = ""
FB_APP_ID = ""
def load_fb_config():
    global FB_SYSTEM_TOKEN, FB_APP_ID
    try:
        with open(ENV_PATH) as f:
            for line in f:
                line = line.strip()
                if line.startswith("FB_SYSTEM_TOKEN="):
                    FB_SYSTEM_TOKEN = line.split("=", 1)[1].strip().strip("'\"")
                elif line.startswith("FB_APP_ID="):
                    FB_APP_ID = line.split("=", 1)[1].strip().strip("'\"")
    except:
        pass
load_fb_config()

# ===================== DB HELPERS =====================

def get_master_db():
    """Connect to master DB (authentication only)."""
    conn = sqlite3.connect(MASTER_DB)
    conn.row_factory = sqlite3.Row
    return conn

def get_user_db_path(user_id):
    """Get path to a user's isolated database."""
    return os.path.join(USER_DB_DIR, f"adforge_user_{user_id}.db")

def get_user_db(user_id):
    """Connect to a user's isolated database."""
    path = get_user_db_path(user_id)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_master_db():
    """Init master DB — ONLY authentication table."""
    conn = get_master_db()
    c = conn.cursor()
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT,
            role TEXT DEFAULT 'user',
            is_active INTEGER DEFAULT 1,
            telegram_bot_token TEXT,
            telegram_chat_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        )
    """)
    
    # Create default admin if not exists
    admin = c.execute("SELECT id FROM dashboard_users WHERE username = 'admin'").fetchone()
    if not admin:
        admin_id = str(uuid.uuid4())[:8]
        pw_hash = hashlib.sha256('admin123'.encode()).hexdigest()
        c.execute("""
            INSERT INTO dashboard_users (id, username, password_hash, email, role)
            VALUES (?, ?, ?, ?, 'admin')
        """, (admin_id, 'admin', pw_hash, 'admin@adforge.local'))
        
        # Also create their user DB
        ensure_user_db(admin_id)
    
    conn.commit()
    conn.close()

def ensure_user_db(user_id):
    """Create a user's isolated database with all tables if it doesn't exist."""
    path = get_user_db_path(user_id)
    need_tables = not os.path.exists(path)
    
    conn = get_user_db(user_id)
    c = conn.cursor()
    
    if need_tables:
        c.execute("""
            CREATE TABLE IF NOT EXISTS platform_accounts (
                id TEXT PRIMARY KEY,
                platform TEXT NOT NULL DEFAULT 'meta',
                account_name TEXT NOT NULL,
                credentials TEXT NOT NULL,
                platform_account_id TEXT,
                account_type TEXT DEFAULT 'ad_account',
                is_active BOOLEAN DEFAULT 1,
                health_status TEXT DEFAULT 'ok',
                last_error TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        c.execute("""
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
                last_synced TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                buying_type TEXT,
                bid_strategy TEXT
            )
        """)
        
        c.execute("""
            CREATE TABLE IF NOT EXISTS approval_drafts (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                summary TEXT,
                details_json TEXT,
                proposed_by TEXT DEFAULT 'ai',
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMP,
                reviewed_by TEXT,
                rejection_reason TEXT,
                execution_result TEXT
            )
        """)
        
        c.execute("""
            CREATE TABLE IF NOT EXISTS automation_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                trigger_metric TEXT,
                trigger_operator TEXT,
                trigger_value REAL,
                action_type TEXT,
                action_params TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        c.execute("""
            CREATE TABLE IF NOT EXISTS performance_history (
                id TEXT PRIMARY KEY,
                account_id TEXT,
                date TEXT,
                spend REAL DEFAULT 0,
                impressions INTEGER DEFAULT 0,
                clicks INTEGER DEFAULT 0,
                conversions INTEGER DEFAULT 0,
                revenue REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        c.execute("""
            CREATE TABLE IF NOT EXISTS plugins (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                enabled BOOLEAN DEFAULT 1,
                config TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
    
    conn.close()
    return need_tables

# ===================== AUTH =====================

def hash_password(password):
    """Hash password with salt using PBKDF2 (128k iterations)."""
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 128000)
    return salt.hex() + ':' + key.hex()

def verify_password(password, stored_hash):
    """Verify password against stored PBKDF2 hash."""
    parts = stored_hash.split(':')
    if len(parts) == 2:
        salt = bytes.fromhex(parts[0])
        key = bytes.fromhex(parts[1])
        new_key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 128000)
        return new_key == key
    # Legacy: plain SHA256 fallback for old passwords
    return hashlib.sha256(password.encode()).hexdigest() == stored_hash

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'error': 'Unauthorized'}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated

# ===================== AUTH ROUTES =====================

@app.route('/login', methods=['GET', 'POST'])
@rate_limit(max_attempts=10, window=300)
def login_page():
    if request.method == 'GET':
        return render_template('login_dashboard.html', error=None)
    
    username = request.form.get('username', '')
    password = request.form.get('password', '')
    
    conn = get_master_db()
    user = conn.execute("SELECT * FROM dashboard_users WHERE username = ? AND is_active = 1", (username,)).fetchone()
    conn.close()
    
    if user and verify_password(password, user['password_hash']):
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['role'] = user['role']
        
        # Ensure user DB exists
        ensure_user_db(user['id'])
        
        # Update last login
        conn = get_master_db()
        conn.execute("UPDATE dashboard_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (user['id'],))
        conn.commit()
        conn.close()
        
        return redirect(url_for('dashboard'))
    
    return render_template('login_dashboard.html', error='Invalid credentials')

@app.route('/register', methods=['GET', 'POST'])
@rate_limit(max_attempts=5, window=600)
def register_page():
    if request.method == 'GET':
        return render_template('register.html', error=None)
    
    username = request.form.get('username', '')
    password = request.form.get('password', '')
    email = request.form.get('email', '')
    
    if not username or not password:
        return render_template('register.html', error='Username and password required')
    
    conn = get_master_db()
    existing = conn.execute("SELECT id FROM dashboard_users WHERE username = ?", (username,)).fetchone()
    if existing:
        conn.close()
        return render_template('register.html', error='Username already taken')
    
    user_id = str(uuid.uuid4())[:8]
    pw_hash = hash_password(password)
    
    conn.execute("""
        INSERT INTO dashboard_users (id, username, password_hash, email, role)
        VALUES (?, ?, ?, ?, 'user')
    """, (user_id, username, pw_hash, email))
    conn.commit()
    conn.close()
    
    # Create their isolated database
    ensure_user_db(user_id)
    
    session['user_id'] = user_id
    session['username'] = username
    session['role'] = 'user'
    
    return redirect(url_for('dashboard'))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))

# ===================== SPA AUTH =====================

def get_api_token():
    """Get JWT token from Node.js API for backend operations."""
    try:
        r = requests.post(f"{API_URL}/api/auth/login", json={
            "username": API_USER, "password": API_PASS
        }, timeout=5)
        data = r.json()
        if data.get("success"):
            return data["data"]["accessToken"]
    except Exception as e:
        print(f"[api] Auth failed: {e}")
    return None

def api_get(path, token=None):
    """GET from Node.js API."""
    if not token:
        token = get_api_token()
    if not token:
        return {"error": "auth_failed"}
    try:
        r = requests.get(f"{API_URL}{path}", headers={
            "Authorization": f"Bearer {token}"
        }, timeout=10)
        return r.json()
    except Exception as e:
        return {"error": str(e)}

# ===================== DASHBOARD ROUTES =====================

@app.route('/')
def index():
    """Landing page (no auth required)."""
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('landing.html')

@app.route('/app')
@login_required
def dashboard():
    """Main dashboard — reads ONLY from current user's DB."""
    user_id = session['user_id']
    conn = get_user_db(user_id)
    c = conn.cursor()
    
    campaigns = c.execute("SELECT * FROM campaigns ORDER BY spend DESC LIMIT 10").fetchall()
    campaigns_count = c.execute("SELECT COUNT(*) as cnt FROM campaigns").fetchone()['cnt']
    pending_count = c.execute("SELECT COUNT(*) as cnt FROM approval_drafts WHERE status = 'pending'").fetchone()['cnt']
    rules = c.execute("SELECT * FROM automation_rules LIMIT 5").fetchall()
    accounts = c.execute("SELECT * FROM platform_accounts ORDER BY created_at DESC").fetchall()
    
    conn.close()
    
    return render_template('dashboard.html',
                         campaigns=campaigns,
                         campaigns_count=campaigns_count,
                         pending_drafts=pending_count,
                         rules=rules,
                         accounts=accounts,
                         username=session.get('username'),
                         role=session.get('role'))

@app.route('/campaigns')
@login_required
def campaigns():
    conn = get_user_db(session['user_id'])
    c = conn.cursor()
    campaigns = c.execute("""
        SELECT id, name, platform, status, 
               COALESCE(spend, 0) as spend,
               COALESCE(revenue, 0) as revenue,
               COALESCE(impressions, 0) as impressions
        FROM campaigns 
        ORDER BY created_at DESC
    """).fetchall()
    conn.close()
    return render_template('campaigns.html', campaigns=campaigns, username=session.get('username'))

@app.route('/accounts')
@login_required
def accounts_page():
    """List platform accounts — only from current user's DB."""
    conn = get_user_db(session['user_id'])
    accounts = conn.execute("SELECT * FROM platform_accounts ORDER BY created_at DESC").fetchall()
    connected_ids = [a['platform_account_id'] for a in accounts if a['platform_account_id']]
    conn.close()
    return render_template('accounts.html', accounts=accounts, connected_ids=connected_ids)

@app.route('/settings', methods=['GET', 'POST'])
@login_required
def settings_page():
    """User settings — stored in master DB alongside user record."""
    user_id = session['user_id']
    conn = get_master_db()
    
    if request.method == 'POST':
        token = request.form.get('telegram_bot_token', '')
        chat_id = request.form.get('telegram_chat_id', '')
        
        conn.execute("""
            UPDATE dashboard_users 
            SET telegram_bot_token = ?, telegram_chat_id = ? 
            WHERE id = ?
        """, (token, chat_id, user_id))
        conn.commit()
        
        # Test connection if credentials provided
        if token and chat_id:
            try:
                msg = "✅ Your AdForge dashboard is connected! You'll receive real-time FB ads alerts here."
                requests.post(f"https://api.telegram.org/bot{token}/sendMessage", 
                             json={"chat_id": chat_id, "text": msg}, timeout=5)
            except:
                pass
                
        conn.close()
        return redirect(url_for('settings_page', success=1))
    
    user = conn.execute("SELECT * FROM dashboard_users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return render_template('settings.html', user=user, success=request.args.get('success'))

@app.route('/users')
@login_required
def users_page():
    """User management page (admin only)."""
    if session.get('role') != 'admin':
        return redirect(url_for('dashboard'))
    
    conn = get_master_db()
    users = conn.execute("SELECT id, username, email, role, is_active, created_at, last_login FROM dashboard_users").fetchall()
    conn.close()
    return render_template('users.html', users=users, username=session.get('username'))

@app.route('/taglinks')
@login_required
def taglinks_page():
    """Taglink attribution management page."""
    conn = get_user_db(session['user_id'])
    taglinks = conn.execute("""
        SELECT id, name, campaign_id, status, created_at 
        FROM campaigns WHERE platform = 'shopee_taglink'
        ORDER BY created_at DESC LIMIT 50
    """).fetchall()
    conn.close()
    return render_template('taglinks.html', taglinks=taglinks, username=session.get('username'))

# ===================== ACCOUNT MANAGEMENT API =====================

@app.route('/api/accounts/add', methods=['POST'])
@login_required
def add_account():
    """Add account — stored in current user's isolated DB."""
    data = request.json
    name = data.get('name')
    platform = data.get('platform', 'meta')
    token = data.get('token')
    platform_account_id = data.get('platform_account_id', '')
    account_type = data.get('account_type', 'ad_account')
    
    if not name or not token:
        return jsonify({'success': False, 'error': 'Name and Token are required'}), 400
    
    conn = get_user_db(session['user_id'])
    acc_id = str(uuid.uuid4())[:12]
    
    if platform_account_id:
        existing = conn.execute(
            "SELECT id FROM platform_accounts WHERE platform_account_id = ?",
            (platform_account_id,)
        ).fetchone()
        if existing:
            conn.close()
            return jsonify({'success': True, 'message': 'Already connected', 'id': existing['id']})
    
    try:
        conn.execute("""
            INSERT INTO platform_accounts (id, platform, account_name, credentials, platform_account_id, account_type)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (acc_id, platform, name, token, platform_account_id, account_type))
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500
    
    conn.close()
    return jsonify({'success': True, 'message': 'Account added'})

@app.route('/api/accounts/<account_id>/delete', methods=['POST'])
@login_required
def delete_account(account_id):
    """Delete account from user's DB."""
    conn = get_user_db(session['user_id'])
    conn.execute("DELETE FROM platform_accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ===================== SYSTEM USER FB API =====================

@app.route('/api/auth/facebook/login')
@login_required
def flask_fb_login():
    try:
        r = requests.get(f"{API_URL}/api/auth/facebook/login", timeout=5)
        return jsonify(r.json())
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/system-user/accounts')
@login_required
def system_user_accounts():
    if not FB_SYSTEM_TOKEN:
        return jsonify({'success': False, 'error': 'System User token not configured'}), 400
    
    try:
        results = []
        for endpoint, params, account_type in [
            ('/me/adaccounts', {'fields': 'id,name,account_status,currency,amount_spent', 'limit': 100}, 'ad_account'),
            ('/me/accounts', {'fields': 'id,name,category,access_token', 'limit': 100}, 'page'),
            ('/me/businesses', {'fields': 'id,name,created_time', 'limit': 10}, 'business'),
        ]:
            try:
                r = requests.get(
                    f'https://graph.facebook.com/v22.0{endpoint}',
                    params={'access_token': FB_SYSTEM_TOKEN, **params},
                    timeout=10
                )
                data = r.json()
                if 'data' in data:
                    for item in data['data']:
                        entry = {'id': item['id'], 'name': item.get('name', item['id']), 'account_type': account_type}
                        if 'category' in item: entry['category'] = item['category']
                        if 'access_token' in item: entry['access_token'] = item['access_token']
                        results.append(entry)
            except Exception as e:
                print(f"[sys-user] Failed: {endpoint}: {e}")
        
        return jsonify({'success': True, 'accounts': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/system-user/connect', methods=['POST'])
@login_required
def system_user_connect():
    if not FB_SYSTEM_TOKEN:
        return jsonify({'success': False, 'error': 'System User token not configured'}), 400
    
    data = request.json
    account_id = data.get('account_id')
    account_name = data.get('account_name', '')
    account_type = data.get('account_type', '')
    
    if not account_id:
        return jsonify({'success': False, 'error': 'account_id required'}), 400
    
    conn = get_user_db(session['user_id'])
    
    existing = conn.execute(
        "SELECT id FROM platform_accounts WHERE platform_account_id = ?",
        (account_id,)
    ).fetchone()
    
    if existing:
        conn.close()
        return jsonify({'success': True, 'message': 'Already connected', 'id': existing['id']})
    
    if not account_name or not account_type:
        try:
            r = requests.get(
                f'https://graph.facebook.com/v22.0/{account_id}',
                params={'access_token': FB_SYSTEM_TOKEN, 'fields': 'id,name'},
                timeout=5
            )
            info = r.json()
            if 'name' in info:
                account_name = info['name']
        except:
            pass
        if 'act_' in account_id or account_id.startswith('10'):
            account_type = 'ad_account'
    
    acc_id = str(uuid.uuid4())[:12]
    try:
        conn.execute("""
            INSERT INTO platform_accounts (id, platform, account_name, credentials, platform_account_id, account_type)
            VALUES (?, 'meta', ?, ?, ?, ?)
        """, (acc_id, account_name, FB_SYSTEM_TOKEN, account_id, account_type or 'ad_account'))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'id': acc_id, 'name': account_name})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/system-user/connect-all', methods=['POST'])
@login_required
def system_user_connect_all():
    if not FB_SYSTEM_TOKEN:
        return jsonify({'success': False, 'error': 'System User token not configured'}), 400
    
    try:
        results = []
        conn = get_user_db(session['user_id'])
        
        r = requests.get(
            'https://graph.facebook.com/v22.0/me/adaccounts',
            params={'access_token': FB_SYSTEM_TOKEN, 'fields': 'id,name', 'limit': 100},
            timeout=10
        )
        data = r.json()
        if 'data' in data:
            for acc in data['data']:
                existing = conn.execute(
                    "SELECT id FROM platform_accounts WHERE platform_account_id = ?",
                    (acc['id'],)
                ).fetchone()
                if not existing:
                    acc_id = str(uuid.uuid4())[:12]
                    conn.execute("""
                        INSERT INTO platform_accounts (id, platform, account_name, credentials, platform_account_id, account_type)
                        VALUES (?, 'meta', ?, ?, ?, 'ad_account')
                    """, (acc_id, acc.get('name', acc['id']), FB_SYSTEM_TOKEN, acc['id']))
                    results.append(acc_id)
        
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'connected': len(results), 'ids': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ===================== DRAFTS API =====================

@app.route('/api/drafts')
def api_drafts():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify([])
    conn = get_user_db(user_id)
    c = conn.cursor()
    status = request.args.get('status', 'pending')
    drafts = c.execute("SELECT * FROM approval_drafts WHERE status = ? ORDER BY created_at DESC", (status,)).fetchall()
    conn.close()
    return jsonify([dict(d) for d in drafts])

@app.route('/api/drafts/create', methods=['POST'])
@login_required
def api_draft_create():
    data = request.get_json()
    draft_id = str(uuid.uuid4())[:8]
    conn = get_user_db(session['user_id'])
    c = conn.cursor()
    
    try:
        c.execute("""
            INSERT INTO approval_drafts (id, type, summary, details_json, proposed_by, status) 
            VALUES (?, ?, ?, ?, ?, 'pending')
        """, (draft_id, data.get('type'), data.get('summary'), json.dumps(data.get('details', {})), data.get('proposed_by', 'ai')))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'draft_id': draft_id})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/drafts/<draft_id>/approve', methods=['POST'])
@login_required
def api_draft_approve(draft_id):
    data = request.get_json() or {}
    conn = get_user_db(session['user_id'])
    c = conn.cursor()
    
    try:
        draft = c.execute("SELECT * FROM approval_drafts WHERE id = ?", (draft_id,)).fetchone()
        if not draft:
            conn.close()
            return jsonify({'success': False, 'error': 'Draft not found'}), 404
        
        c.execute("""
            UPDATE approval_drafts 
            SET status = 'approved', 
                reviewed_at = CURRENT_TIMESTAMP, 
                reviewed_by = ?,
                execution_result = ?
            WHERE id = ?
        """, (
            data.get('reviewed_by', session.get('username', 'user')),
            json.dumps({'status': 'executed', 'timestamp': datetime.now().isoformat()}),
            draft_id
        ))
        
        conn.commit()
        conn.close()
        
        # Send Telegram notification to this user
        send_telegram_alert(session['user_id'], 
            text=f"✅ *Draft Approved*\nSummary: {draft['summary']}\nType: {draft['type']}")
        
        return jsonify({'success': True, 'message': 'Draft approved'})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/drafts/<draft_id>/reject', methods=['POST'])
@login_required
def api_draft_reject(draft_id):
    data = request.get_json() or {}
    conn = get_user_db(session['user_id'])
    c = conn.cursor()
    
    try:
        c.execute("""
            UPDATE approval_drafts SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?, rejection_reason = ? WHERE id = ?
        """, (data.get('reviewed_by', session.get('username', 'user')), data.get('reason', ''), draft_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Draft rejected'})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 400

# ===================== USER MANAGEMENT API =====================

@app.route('/api/users')
@login_required
def api_users():
    if session.get('role') != 'admin':
        return jsonify({'success': False, 'error': 'Admin only'}), 403
    
    conn = get_master_db()
    users = conn.execute("SELECT id, username, email, role, is_active, created_at, last_login FROM dashboard_users").fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])

# ===================== TAGLINK API =====================

@app.route('/api/taglink/generate', methods=['POST'])
@login_required
def api_taglink_generate():
    """Generate tagged Shopee link for attribution."""
    data = request.json
    url = data.get('url', '')
    campaign = data.get('campaign', '')
    adset = data.get('adset', '')
    ad = data.get('ad', '')
    account = data.get('account', '0858')
    
    if not url or not campaign:
        return jsonify({'success': False, 'error': 'URL and campaign required'}), 400
    
    import subprocess
    result = subprocess.run([
        'python3', 'scripts/vilona_taglink_attribution.py', 'generate',
        '--campaign', campaign,
        '--url', url,
        '--adset', adset,
        '--ad', ad,
        '--account', account
    ], capture_output=True, text=True, cwd='/home/openclaw/.openclaw/workspace')
    
    try:
        output = json.loads(result.stdout)
        return jsonify({'success': True, 'taglink': output})
    except:
        return jsonify({'success': False, 'error': result.stderr or result.stdout}), 500

@app.route('/api/taglink/report')
@login_required
def api_taglink_report():
    """Get attribution report for current user's campaigns."""
    import subprocess
    result = subprocess.run([
        'python3', 'scripts/vilona_taglink_attribution.py', 'report',
        '--json'
    ], capture_output=True, text=True, cwd='/home/openclaw/.openclaw/workspace')
    
    return jsonify({'success': True, 'report': result.stdout})

@app.route('/api/taglink/list')
@login_required
def api_taglink_list():
    """List all taglinks generated by this user."""
    conn = get_user_db(session['user_id'])
    taglinks = conn.execute("""
        SELECT id, name, campaign_id, status, created_at 
        FROM campaigns WHERE platform = 'shopee_taglink'
        ORDER BY created_at DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(t) for t in taglinks])


def send_telegram_alert(user_id, text):
    """Send a notification to a specific user via their Telegram bot."""
    conn = get_master_db()
    user = conn.execute(
        "SELECT telegram_bot_token, telegram_chat_id FROM dashboard_users WHERE id = ?",
        (user_id,)
    ).fetchone()
    conn.close()
    
    if user and user['telegram_bot_token'] and user['telegram_chat_id']:
        try:
            requests.post(
                f"https://api.telegram.org/bot{user['telegram_bot_token']}/sendMessage",
                json={"chat_id": user['telegram_chat_id'], "text": text, "parse_mode": "Markdown"},
                timeout=5
            )
        except:
            pass

# ===================== INIT (lazy) =====================
_db_initialized = False

def ensure_master_db():
    global _db_initialized
    if _db_initialized:
        return
    init_master_db()
    migrate_existing_users()
    _db_initialized = True

@app.before_request
def before_request():
    ensure_master_db()

def migrate_existing_users():
    """Ensure all existing users in master DB have their isolated DBs."""
    conn = get_master_db()
    users = conn.execute("SELECT id FROM dashboard_users").fetchall()
    conn.close()
    for u in users:
        ensure_user_db(u['id'])

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 AdForge Dashboard v3.0 — Per-User Database Isolation")
    print("   http://127.0.0.1:5002")
    print("   Users: Each user has their OWN database file")
    print("=" * 60)
    app.run(host='127.0.0.1', port=5002, debug=True, use_reloader=False)
