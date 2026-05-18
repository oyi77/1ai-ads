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

DB_PATH = "/home/openclaw/.openclaw/workspace/adforge/adforge.db"
API_URL = "http://127.0.0.1:3001"
API_USER = "admin"
API_PASS = "admin123"

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

# ============ API ENDPOINTS ============
@app.route('/api/stats')
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
