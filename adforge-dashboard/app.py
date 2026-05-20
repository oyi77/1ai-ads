#!/usr/bin/env python3
"""
AdForge Dashboard — Full Flask App with Multi-User Auth
Draft system + user management + Meta API integration
"""
from flask import Flask, render_template, jsonify, request, redirect, url_for, session
from datetime import datetime, timedelta
import sqlite3
import json
import uuid
from pathlib import Path
from functools import wraps
import requests
import hashlib
import secrets

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = 'adforge-secret-2026-berkahkarya'

DB_PATH = "/home/openclaw/.openclaw/workspace/adforge/db/adforge.db"
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

# ============ INIT DB ============
def init_db():
    """Initialize dashboard users table."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Dashboard users table
    c.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT,
            role TEXT DEFAULT 'user',
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        )
    """)
    
    # Platform accounts table
    c.execute("""
        CREATE TABLE IF NOT EXISTS platform_accounts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
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
    
    # Create default admin if not exists
    admin = c.execute("SELECT id FROM dashboard_users WHERE username = 'admin'").fetchone()
    if not admin:
        admin_id = str(uuid.uuid4())[:8]
        pw_hash = hashlib.sha256('admin123'.encode()).hexdigest()
        c.execute("""
            INSERT INTO dashboard_users (id, username, password_hash, email, role)
            VALUES (?, ?, ?, ?, 'admin')
        """, (admin_id, 'admin', pw_hash, 'admin@adforge.local'))
        
        # Create demo user
        demo_id = str(uuid.uuid4())[:8]
        demo_hash = hashlib.sha256('demo123'.encode()).hexdigest()
        c.execute("""
            INSERT INTO dashboard_users (id, username, password_hash, email, role)
            VALUES (?, ?, ?, ?, 'user')
        """, (demo_id, 'demo', demo_hash, 'demo@adforge.local'))
    
    # Migrate: add new columns if they don't exist
    try:
        c.execute("ALTER TABLE platform_accounts ADD COLUMN platform_account_id TEXT")
    except:
        pass  # Already exists
    try:
        c.execute("ALTER TABLE platform_accounts ADD COLUMN account_type TEXT DEFAULT 'ad_account'")
    except:
        pass
    
    conn.commit()
    conn.close()

# ============ AUTH ============
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password, stored_hash):
    return hash_password(password) == stored_hash

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'error': 'Unauthorized'}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ============ AUTH ROUTES ============
@app.route('/login', methods=['GET', 'POST'])
def login_page():
    if request.method == 'GET':
        return render_template('login_dashboard.html', error=None)
    
    username = request.form.get('username', '')
    password = request.form.get('password', '')
    
    conn = get_db()
    user = conn.execute("SELECT * FROM dashboard_users WHERE username = ? AND is_active = 1", (username,)).fetchone()
    conn.close()
    
    if user and verify_password(password, user['password_hash']):
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['role'] = user['role']
        
        # Update last login
        conn = get_db()
        conn.execute("UPDATE dashboard_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (user['id'],))
        conn.commit()
        conn.close()
        
        return redirect(url_for('dashboard'))
    
    return render_template('login_dashboard.html', error='Invalid credentials')

@app.route('/register', methods=['GET', 'POST'])
def register_page():
    if request.method == 'GET':
        return render_template('register.html', error=None)
    
    username = request.form.get('username', '')
    password = request.form.get('password', '')
    email = request.form.get('email', '')
    
    if not username or not password:
        return render_template('register.html', error='Username and password required')
    
    conn = get_db()
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
    
    session['user_id'] = user_id
    session['username'] = username
    session['role'] = 'user'
    
    return redirect(url_for('dashboard'))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))

# ============ SPA AUTH — get JWT from Node API ============
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

# ============ DASHBOARD ROUTES ============
@app.route('/')
def index():
    """Landing page (no auth required)."""
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('landing.html')

@app.route('/app')
@login_required
def dashboard():
    """Main dashboard (requires auth)."""
    conn = get_db()
    c = conn.cursor()
    
    campaigns = c.execute("SELECT * FROM campaigns LIMIT 10").fetchall()
    campaigns_count = c.execute("SELECT COUNT(*) as cnt FROM campaigns").fetchone()['cnt']
    pending_count = c.execute("SELECT COUNT(*) as cnt FROM approval_drafts WHERE status = 'pending'").fetchone()['cnt']
    rules = c.execute("SELECT * FROM automation_rules LIMIT 5").fetchall()
    
    # Get user count
    user_count = c.execute("SELECT COUNT(*) as cnt FROM dashboard_users").fetchone()['cnt']
    
    conn.close()
    
    return render_template('dashboard.html',
                         campaigns=campaigns,
                         campaigns_count=campaigns_count,
                         pending_drafts=pending_count,
                         rules=rules,
                         user_count=user_count,
                         username=session.get('username'),
                         role=session.get('role'))

@app.route('/campaigns')
@login_required
def campaigns():
    conn = get_db()
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

@app.route('/automation')
@login_required
def automation():
    conn = get_db()
    c = conn.cursor()
    rules = c.execute("SELECT * FROM automation_rules ORDER BY created_at DESC").fetchall()
    conn.close()
    
    return render_template('automation.html', rules=rules, username=session.get('username'))

@app.route('/drafts')
@login_required
def drafts_page():
    conn = get_db()
    c = conn.cursor()
    
    pending = c.execute("""
        SELECT * FROM approval_drafts 
        WHERE status = 'pending' 
        ORDER BY created_at DESC
    """).fetchall()
    
    history = c.execute("""
        SELECT * FROM approval_drafts 
        WHERE status IN ('approved', 'rejected')
        ORDER BY reviewed_at DESC 
        LIMIT 20
    """).fetchall()
    
    conn.close()
    
    return render_template('drafts.html',
                         pending_drafts=pending,
                         history_drafts=history,
                         pending_count=len(pending),
                         username=session.get('username'))

@app.route('/accounts')
@login_required
def accounts_page():
    """List and manage Meta/Platform accounts."""
    conn = get_db()
    accounts = conn.execute("SELECT * FROM platform_accounts ORDER BY created_at DESC").fetchall()
    # Get connected platform account IDs for JS (handle missing key for old rows)
    connected_ids = []
    for a in accounts:
        try:
            pid = a['platform_account_id']
            if pid:
                connected_ids.append(pid)
        except (IndexError, KeyError):
            pass
    conn.close()
    return render_template('accounts.html', accounts=accounts, connected_ids=connected_ids)

@app.route('/api/accounts/add', methods=['POST'])
@login_required
def add_account():
    """Add a new platform account."""
    data = request.json
    name = data.get('name')
    platform = data.get('platform', 'meta')
    token = data.get('token')
    platform_account_id = data.get('platform_account_id', '')
    account_type = data.get('account_type', 'ad_account')
    
    if not name or not token:
        return jsonify({'success': False, 'error': 'Name and Token are required'}), 400
        
    conn = get_db()
    acc_id = str(uuid.uuid4())[:12]
    user_id = session['user_id']
    
    # Check if already connected by platform_account_id
    if platform_account_id:
        existing = conn.execute(
            "SELECT id FROM platform_accounts WHERE platform_account_id = ? AND user_id = ?",
            (platform_account_id, user_id)
        ).fetchone()
        if existing:
            conn.close()
            return jsonify({'success': True, 'message': 'Already connected', 'id': existing['id']})
    
    try:
        conn.execute("""
            INSERT INTO platform_accounts (id, user_id, platform, account_name, credentials, platform_account_id, account_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (acc_id, user_id, platform, name, token, platform_account_id, account_type))
        conn.commit()
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()
        
    return jsonify({'success': True, 'message': 'Account added successfully'})

@app.route('/users')
@login_required
def users_page():
    """User management page (admin only)."""
    if session.get('role') != 'admin':
        return redirect(url_for('dashboard'))
    
    conn = get_db()
    users = conn.execute("SELECT id, username, email, role, is_active, created_at, last_login FROM dashboard_users").fetchall()
    conn.close()
    
    return render_template('users.html', users=users, username=session.get('username'))

@app.route('/api/auth/facebook/login')
@login_required
def flask_fb_login():
    """Proxy Facebook Login call to Node.js API."""
    try:
        r = requests.get(f"{API_URL}/api/auth/facebook/login", timeout=5)
        return jsonify(r.json())
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============ SYSTEM USER API ============
@app.route('/api/system-user/accounts')
@login_required
def system_user_accounts():
    """List all accounts accessible by the System User token."""
    if not FB_SYSTEM_TOKEN:
        return jsonify({'success': False, 'error': 'System User token not configured'}), 400
    
    try:
        results = []
        
        # 1. Get Ad Accounts (via /me/adaccounts)
        try:
            r = requests.get(
                'https://graph.facebook.com/v22.0/me/adaccounts',
                params={'access_token': FB_SYSTEM_TOKEN, 'fields': 'id,name,account_status,currency,amount_spent', 'limit': 100},
                timeout=10
            )
            data = r.json()
            if 'data' in data:
                for acc in data['data']:
                    results.append({
                        'id': acc['id'],
                        'name': acc.get('name', f"Ad Account {acc['id']}"),
                        'account_type': 'ad_account',
                        'status': acc.get('account_status', 0),
                        'currency': acc.get('currency', ''),
                    })
        except Exception as e:
            print(f"[sys-user] Failed to fetch adaccounts: {e}")
        
        # 2. Get Pages
        try:
            r = requests.get(
                'https://graph.facebook.com/v22.0/me/accounts',
                params={'access_token': FB_SYSTEM_TOKEN, 'fields': 'id,name,category,access_token', 'limit': 100},
                timeout=10
            )
            data = r.json()
            if 'data' in data:
                for page in data['data']:
                    results.append({
                        'id': page['id'],
                        'name': page.get('name', f"Page {page['id']}"),
                        'account_type': 'page',
                        'category': page.get('category', ''),
                        'access_token': page.get('access_token', ''),
                    })
        except Exception as e:
            print(f"[sys-user] Failed to fetch pages: {e}")
        
        # 3. Get Business Managers
        try:
            r = requests.get(
                'https://graph.facebook.com/v22.0/me/businesses',
                params={'access_token': FB_SYSTEM_TOKEN, 'fields': 'id,name,created_time', 'limit': 10},
                timeout=10
            )
            data = r.json()
            if 'data' in data:
                for biz in data['data']:
                    results.append({
                        'id': biz['id'],
                        'name': biz.get('name', f"BM {biz['id']}"),
                        'account_type': 'business',
                    })
        except Exception as e:
            print(f"[sys-user] Failed to fetch businesses: {e}")
        
        return jsonify({'success': True, 'accounts': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/system-user/connect', methods=['POST'])
@login_required
def system_user_connect():
    """Connect a specific account via System User token."""
    if not FB_SYSTEM_TOKEN:
        return jsonify({'success': False, 'error': 'System User token not configured'}), 400
    
    data = request.json
    account_id = data.get('account_id')
    account_name = data.get('account_name', '')
    account_type = data.get('account_type', '')
    
    if not account_id:
        return jsonify({'success': False, 'error': 'account_id required'}), 400
    
    conn = get_db()
    user_id = session['user_id']
    
    # Check if already connected
    existing = conn.execute(
        "SELECT id FROM platform_accounts WHERE platform_account_id = ? AND user_id = ?",
        (account_id, user_id)
    ).fetchone()
    
    if existing:
        conn.close()
        return jsonify({'success': True, 'message': 'Already connected', 'id': existing['id']})
    
    # If ad account type, try to get name from FB
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
            INSERT INTO platform_accounts (id, user_id, platform, account_name, credentials, platform_account_id, account_type)
            VALUES (?, ?, 'meta', ?, ?, ?, ?)
        """, (acc_id, user_id, account_name, FB_SYSTEM_TOKEN, account_id, account_type or 'ad_account'))
        conn.commit()
        return jsonify({'success': True, 'id': acc_id, 'name': account_name})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/system-user/connect-all', methods=['POST'])
@login_required
def system_user_connect_all():
    """Connect all available accounts from System User at once."""
    if not FB_SYSTEM_TOKEN:
        return jsonify({'success': False, 'error': 'System User token not configured'}), 400
    
    try:
        # Fetch ad accounts
        results = []
        conn = get_db()
        user_id = session['user_id']
        
        r = requests.get(
            'https://graph.facebook.com/v22.0/me/adaccounts',
            params={'access_token': FB_SYSTEM_TOKEN, 'fields': 'id,name,account_status,currency', 'limit': 100},
            timeout=10
        )
        data = r.json()
        if 'data' in data:
            for acc in data['data']:
                existing = conn.execute(
                    "SELECT id FROM platform_accounts WHERE platform_account_id = ? AND user_id = ?",
                    (acc['id'], user_id)
                ).fetchone()
                if not existing:
                    acc_id = str(uuid.uuid4())[:12]
                    conn.execute("""
                        INSERT INTO platform_accounts (id, user_id, platform, account_name, credentials, platform_account_id, account_type)
                        VALUES (?, ?, 'meta', ?, ?, ?, 'ad_account')
                    """, (acc_id, user_id, acc.get('name', acc['id']), FB_SYSTEM_TOKEN, acc['id']))
                    results.append(acc_id)
        
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'connected': len(results), 'ids': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def api_stats():
    pending = 0
    try:
        conn = get_db()
        pending = conn.execute("SELECT COUNT(*) as cnt FROM approval_drafts WHERE status = 'pending'").fetchone()['cnt']
        conn.close()
    except:
        pass
    
    return jsonify({
        'pending_drafts': pending,
        'status': 'online'
    })

@app.route('/api/drafts')
def api_drafts():
    conn = get_db()
    c = conn.cursor()
    
    status = request.args.get('status', 'pending')
    drafts = c.execute("""
        SELECT * FROM approval_drafts 
        WHERE status = ?
        ORDER BY created_at DESC
    """, (status,)).fetchall()
    
    conn.close()
    return jsonify([dict(d) for d in drafts])

@app.route('/api/drafts/create', methods=['POST'])
def api_draft_create():
    data = request.get_json()
    draft_id = str(uuid.uuid4())[:8]
    conn = get_db()
    c = conn.cursor()
    
    try:
        c.execute("""
            INSERT INTO approval_drafts 
            (id, type, summary, details_json, proposed_by, status) 
            VALUES (?, ?, ?, ?, ?, 'pending')
        """, (
            draft_id,
            data.get('type'),
            data.get('summary'),
            json.dumps(data.get('details', {})),
            data.get('proposed_by', 'ai')
        ))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'draft_id': draft_id})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/drafts/<draft_id>/approve', methods=['POST'])
def api_draft_approve(draft_id):
    data = request.get_json() or {}
    conn = get_db()
    c = conn.cursor()
    
    try:
        draft = c.execute("SELECT * FROM approval_drafts WHERE id = ?", (draft_id,)).fetchone()
        if not draft:
            return jsonify({'success': False, 'error': 'Draft not found'}), 404
        
        c.execute("""
            UPDATE approval_drafts 
            SET status = 'approved', 
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?
            WHERE id = ?
        """, (data.get('reviewed_by', session.get('username', 'user')), draft_id))
        
        c.execute("""
            UPDATE approval_drafts 
            SET execution_result = ?
            WHERE id = ?
        """, (json.dumps({'status': 'executed', 'timestamp': datetime.now().isoformat()}), draft_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Draft approved'})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/drafts/<draft_id>/reject', methods=['POST'])
def api_draft_reject(draft_id):
    data = request.get_json() or {}
    conn = get_db()
    c = conn.cursor()
    
    try:
        c.execute("""
            UPDATE approval_drafts 
            SET status = 'rejected', 
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?,
                rejection_reason = ?
            WHERE id = ?
        """, (
            data.get('reviewed_by', session.get('username', 'user')),
            data.get('reason', ''),
            draft_id
        ))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Draft rejected'})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/users')
@login_required
def api_users():
    if session.get('role') != 'admin':
        return jsonify({'success': False, 'error': 'Admin only'}), 403
    
    conn = get_db()
    users = conn.execute("SELECT id, username, email, role, is_active, created_at, last_login FROM dashboard_users").fetchall()
    conn.close()
    
    return jsonify([dict(u) for u in users])

# ============ INIT ============
init_db()

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 AdForge Dashboard v2.0 — Multi-User + Draft System")
    print("   http://127.0.0.1:5002")
    print("   Login: admin / admin123")
    print("=" * 60)
    app.run(host='127.0.0.1', port=5002, debug=True, use_reloader=False)
