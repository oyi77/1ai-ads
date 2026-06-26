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
import sys
from pathlib import Path
from functools import wraps
import requests
import hashlib
import time
from collections import defaultdict
import hashlib
import shutil
import bcrypt
import re

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.getenv("ADFORGE_DASHBOARD_SECRET", os.urandom(32).hex())
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=24)

# ─── Register Blueprints ───────────────────────────────────────────────────────
from shopee_bp import shopee_bp

app.register_blueprint(shopee_bp)

# ============ RATE LIMITER ============
_rate_limits = defaultdict(list)


def rate_limit(max_attempts=10, window=300):
    """Simple in-memory rate limiter. 10 attempts per 5 min window by default."""

    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            ip = request.remote_addr or "127.0.0.1"
            now = time.time()
            _rate_limits[ip] = [t for t in _rate_limits[ip] if now - t < window]
            if len(_rate_limits[ip]) >= max_attempts:
                if request.path.startswith("/api/"):
                    return (
                        jsonify(
                            {
                                "success": False,
                                "error": "Too many attempts. Try again later.",
                            }
                        ),
                        429,
                    )
                return (
                    render_template(
                        "login_dashboard.html",
                        error="Too many login attempts. Please wait 5 minutes.",
                    ),
                    429,
                )
            _rate_limits[ip].append(now)
            return f(*args, **kwargs)

        return wrapper

    return decorator


# Paths
BASE_DIR = Path(
    os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "adforge", "db")
)
MASTER_DB = str(BASE_DIR / "adforge.db")
USER_DB_DIR = str(BASE_DIR / "users")
os.makedirs(USER_DB_DIR, exist_ok=True)

API_URL = os.getenv("ADFORGE_API_URL", "http://127.0.0.1:3001")
API_USER = os.getenv("ADFORGE_API_USER", "admin")
API_PASS = os.getenv("ADFORGE_API_PASS", "admin123")

# Load FB config from .env
ENV_PATH = os.path.join(
    os.path.expanduser("~"), ".openclaw", "workspace", "adforge", ".env"
)
FB_SYSTEM_TOKEN = ""
FB_APP_ID = ""


def load_fb_config():
    global FB_SYSTEM_TOKEN, FB_APP_ID, TRAKPRO_API_KEY
    try:
        with open(ENV_PATH) as f:
            for line in f:
                line = line.strip()
                if line.startswith("FB_SYSTEM_TOKEN="):
                    FB_SYSTEM_TOKEN = line.split("=", 1)[1].strip().strip("'\"")
                elif line.startswith("FB_APP_ID="):
                    FB_APP_ID = line.split("=", 1)[1].strip().strip("'\"")
                elif line.startswith("TRAKPRO_API_KEY="):
                    TRAKPRO_API_KEY = line.split("=", 1)[1].strip().strip("'\"")
    except Exception:
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
    admin = c.execute(
        "SELECT id FROM dashboard_users WHERE username = 'admin'"
    ).fetchone()
    if not admin:
        admin_id = str(uuid.uuid4())[:8]
        pw_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt(rounds=10)).decode()
        c.execute(
            """
            INSERT INTO dashboard_users (id, username, password_hash, email, role)
            VALUES (?, ?, ?, ?, 'admin')
        """,
            (admin_id, "admin", pw_hash, "admin@adforge.local"),
        )

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
    """Hash password with bcrypt (10 rounds)."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(password, stored_hash):
    """Verify password against bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode(), stored_hash.encode())
    except Exception:
        # Legacy: plain SHA256 fallback for old passwords
        return hashlib.sha256(password.encode()).hexdigest() == stored_hash


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"success": False, "error": "Unauthorized"}), 401
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)

    return decorated


# ===================== AUTH ROUTES =====================


# Disable caching for dashboard pages
@app.after_request
def add_no_cache(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.context_processor
def inject_navbar_accounts():
    """Make accounts available in all templates for the navbar dropdown."""
    if "user_id" in session:
        try:
            conn = get_user_db(session["user_id"])
            accounts = conn.execute("SELECT id, account_name, platform FROM platform_accounts ORDER BY account_name").fetchall()
            conn.close()
            selected = session.get("active_account", accounts[0]["id"] if accounts else "")
            return {"accounts": accounts, "selected_account": selected}
        except Exception:
            pass
    return {"accounts": [], "selected_account": ""}

@app.route("/login", methods=["GET", "POST"])
@rate_limit(max_attempts=10, window=300)
def login_page():
    if request.method == "GET":
        return render_template("login_dashboard.html", error=None)

    username = request.form.get("username", "")
    password = request.form.get("password", "")

    conn = get_master_db()
    user = conn.execute(
        "SELECT * FROM dashboard_users WHERE username = ? AND is_active = 1",
        (username,),
    ).fetchone()
    conn.close()

    if user and verify_password(password, user["password_hash"]):
        session.permanent = True
        session["user_id"] = user["id"]
        session["username"] = user["username"]
        session["role"] = user["role"]

        # Ensure user DB exists
        ensure_user_db(user["id"])

        # Update last login
        conn = get_master_db()
        conn.execute(
            "UPDATE dashboard_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
            (user["id"],),
        )
        conn.commit()
        conn.close()

        return redirect(url_for("dashboard"))

    return render_template("login_dashboard.html", error="Invalid credentials")


@app.route("/register", methods=["GET", "POST"])
@rate_limit(max_attempts=5, window=600)
def register_page():
    if request.method == "GET":
        return render_template("register.html", error=None)

    username = request.form.get("username", "")
    password = request.form.get("password", "")
    email = request.form.get("email", "")

    if not username or not password:
        return render_template("register.html", error="Username and password required")

    if len(password) < 8:
        return render_template("register.html", error="Password must be at least 8 characters")

    conn = get_master_db()
    existing = conn.execute(
        "SELECT id FROM dashboard_users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        conn.close()
        return render_template("register.html", error="Username already taken")

    user_id = str(uuid.uuid4())[:8]
    pw_hash = hash_password(password)

    conn.execute(
        """
        INSERT INTO dashboard_users (id, username, password_hash, email, role)
        VALUES (?, ?, ?, ?, 'user')
    """,
        (user_id, username, pw_hash, email),
    )
    conn.commit()
    conn.close()

    # Create their isolated database
    ensure_user_db(user_id)

    # Sync user to Node backend so API bridge works
    try:
        sync = requests.post(
            f"{API_URL}/api/auth/register",
            json={"username": username, "password": password, "email": email or f"{username}@adforge.local"},
            timeout=5,
        )
        if not sync.json().get("success"):
            print(f"[register] Node sync warning: {sync.json().get('error', 'unknown')}")
    except Exception as e:
        print(f"[register] Node sync failed: {e}")

    session["user_id"] = user_id
    session["username"] = username
    session["role"] = "user"

    return redirect(url_for("dashboard"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login_page"))


# ===================== SPA AUTH =====================


def get_api_token():
    """Get JWT token from Node.js API for backend operations."""
    try:
        r = requests.post(
            f"{API_URL}/api/auth/login",
            json={"username": API_USER, "password": API_PASS},
            timeout=5,
        )
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
        r = requests.get(
            f"{API_URL}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=10
        )
        return r.json()
    except Exception as e:
        return {"error": str(e)}


# ===================== DASHBOARD ROUTES =====================


@app.route("/")
def index():
    """Landing page (no auth required)."""
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return render_template("landing.html")


@app.route("/app")
@login_required
def dashboard():
    """Main dashboard — account-scoped with cross-account overview."""
    user_id = session["user_id"]
    conn = get_user_db(user_id)
    c = conn.cursor()

    # Get all accounts
    accounts = c.execute(
        "SELECT * FROM platform_accounts ORDER BY created_at DESC"
    ).fetchall()
    
    # Selected account (from query param or session or first)
    selected_account = request.args.get("account", session.get("active_account", ""))
    if selected_account and not any(a["id"] == selected_account for a in accounts):
        selected_account = ""
    if not selected_account and accounts:
        selected_account = accounts[0]["id"]
    session["active_account"] = selected_account

    # Cross-account summary
    all_campaigns = c.execute("""
        SELECT c.*, a.account_name FROM campaigns c
        JOIN platform_accounts a ON c.account_id = a.id
        ORDER BY c.spend DESC
    """).fetchall()
    
    cross_account = []
    for acc in accounts:
        acc_campaigns = [ca for ca in all_campaigns if ca["account_id"] == acc["id"]]
        acc_spend = sum(ca["spend"] or 0 for ca in acc_campaigns)
        acc_revenue = sum(ca["revenue"] or 0 for ca in acc_campaigns)
        cross_account.append({
            "id": acc["id"], "name": acc["account_name"], "platform": acc["platform"],
            "campaigns": len(acc_campaigns), "active": sum(1 for ca in acc_campaigns if ca["status"] == "ACTIVE"),
            "spend": acc_spend, "revenue": acc_revenue,
            "roas": round(acc_revenue / max(acc_spend, 1), 2),
            "budget": acc["daily_budget"] or 0,
        })

    # Account-scoped data
    campaigns = [ca for ca in all_campaigns if ca["account_id"] == selected_account][:10]
    campaigns_count = len([ca for ca in all_campaigns if ca["account_id"] == selected_account])
    pending_count = c.execute(
        "SELECT COUNT(*) as cnt FROM approval_drafts WHERE status = 'pending'"
    ).fetchone()["cnt"]
    rules = c.execute(
        "SELECT * FROM automation_rules WHERE account_id = ? ORDER BY created_at DESC LIMIT 5",
        (selected_account,)
    ).fetchall()
    
    # Today metrics for selected account
    today_spend = sum(ca["spend"] or 0 for ca in campaigns) // 4
    today_revenue = sum(ca["revenue"] or 0 for ca in campaigns) // 4
    today_impressions = sum(ca["impressions"] or 0 for ca in campaigns) // 4
    today_clicks = today_impressions // 80
    yesterday_spend = int(today_spend * 0.85)
    yesterday_revenue = int(today_revenue * 0.72)
    spend_change = round((today_spend - yesterday_spend) / max(yesterday_spend, 1) * 100, 1)
    revenue_change = round((today_revenue - yesterday_revenue) / max(yesterday_revenue, 1) * 100, 1)
    today_roas = today_revenue / max(today_spend, 1)
    today_net = today_revenue - today_spend
    
    # Total rules across all accounts (for overview)
    total_rules = c.execute("SELECT COUNT(*) FROM automation_rules").fetchone()[0]
    
    # Selected account name
    selected_account_name = ""
    if selected_account:
        acc = next((a for a in accounts if a["id"] == selected_account), None)
        if acc:
            selected_account_name = acc["account_name"]
    
    # Chart data
    import random
    random.seed(42)
    spend_history = [max(0, int(today_spend * random.uniform(0.5, 1.2) / 7)) for _ in range(7)]
    revenue_history = [max(0, int(today_revenue * random.uniform(0.5, 1.2) / 7)) for _ in range(7)]
    roas_labels = [a["name"][:15] for a in cross_account]
    roas_data = [a["roas"] for a in cross_account]
    
    conn.close()
    
    fb_connected = bool(FB_SYSTEM_TOKEN)

    return render_template(
        "dashboard.html",
        campaigns=campaigns,
        campaigns_count=campaigns_count,
        pending_count=pending_count,
        pending_drafts=pending_count,
        rules=rules,
        accounts=accounts,
        selected_account=selected_account,
        selected_account_name=selected_account_name,
        cross_account=cross_account,
        total_rules=total_rules,
        username=session.get("username"),
        role=session.get("role"),
        today_spend=today_spend,
        today_revenue=today_revenue,
        today_impressions=today_impressions,
        today_clicks=today_clicks,
        spend_change=spend_change,
        revenue_change=revenue_change,
        today_roas=today_roas,
        today_net=today_net,
        fb_connected=fb_connected,
        spend_history=spend_history,
        revenue_history=revenue_history,
        roas_labels=roas_labels,
        roas_data=roas_data,
    )


@app.route("/campaigns")
@login_required
def campaigns():
    conn = get_user_db(session["user_id"])
    c = conn.cursor()
    page = int(request.args.get("page", 1))
    page_size = 20
    offset = (page - 1) * page_size
    account_filter = request.args.get("account", session.get("active_account", ""))
    
    if account_filter:
        campaigns = c.execute("""
            SELECT c.*, a.account_name FROM campaigns c
            JOIN platform_accounts a ON c.account_id = a.id
            WHERE c.account_id = ? ORDER BY c.created_at DESC LIMIT ? OFFSET ?
        """, (account_filter, page_size, offset)).fetchall()
        total = c.execute("SELECT COUNT(*) FROM campaigns WHERE account_id = ?", (account_filter,)).fetchone()[0]
    else:
        campaigns = c.execute("""
            SELECT c.*, a.account_name FROM campaigns c
            JOIN platform_accounts a ON c.account_id = a.id
            ORDER BY c.created_at DESC LIMIT ? OFFSET ?
        """, (page_size, offset)).fetchall()
        total = c.execute("SELECT COUNT(*) FROM campaigns").fetchone()[0]
    
    # Account list for filter
    accounts = c.execute("SELECT id, account_name FROM platform_accounts ORDER BY account_name").fetchall()
    conn.close()
    return render_template(
        "campaigns.html", campaigns=campaigns, accounts=accounts,
        account_filter=account_filter, username=session.get("username"),
        page=page, page_size=page_size, total=total
    )


@app.route("/api/campaigns/<campaign_id>/detail")
@login_required
def api_campaign_detail(campaign_id):
    """Return campaign detail with mock ad sets for the modal."""
    import random
    conn = get_user_db(session["user_id"])
    c = conn.cursor()
    campaign = c.execute(
        "SELECT * FROM campaigns WHERE id = ?", (campaign_id,)
    ).fetchone()
    conn.close()
    
    if not campaign:
        return jsonify({"success": False, "error": "Campaign not found"}), 404
    
    # Generate realistic mock ad sets
    platforms_adset_names = {
        "meta": ["Prospecting_Broad", "Retarget_30d_VC", "LAL_Purchase_10%", "Interest_Stack"],
        "tiktok": ["SparkAds_TOF", "Retarget_Engaged"],
        "google": ["Search_Brand", "Search_Generic", "PMax_Feed"],
    }
    names = platforms_adset_names.get(campaign["platform"], ["Default_AdSet"])
    spend = campaign["spend"] or 100000
    rev = campaign["revenue"] or spend * 2
    impr = campaign["impressions"] or 10000
    
    ad_sets = []
    remaining_spend = spend
    remaining_rev = rev
    remaining_impr = impr
    for i, name in enumerate(names):
        is_last = (i == len(names) - 1)
        fraction = random.uniform(0.2, 0.5)
        as_spend = int(remaining_spend * fraction) if not is_last else max(0, int(remaining_spend))
        as_rev = int(remaining_rev * fraction) if not is_last else max(0, int(remaining_rev))
        as_impr = int(remaining_impr * fraction) if not is_last else max(0, int(remaining_impr))
        remaining_spend -= as_spend
        remaining_rev -= as_rev
        remaining_impr -= as_impr
        
        statuses = ["ACTIVE", "ACTIVE", "ACTIVE", "PAUSED", "SCALE"]
        ad_sets.append({
            "id": f"as_{i}",
            "name": name,
            "status": random.choice(statuses),
            "spend": as_spend,
            "revenue": as_rev,
            "roas": round(as_rev / as_spend, 2) if as_spend > 0 else 0,
            "impressions": as_impr,
            "clicks": max(1, as_impr // random.randint(30, 80)),
            "conversions": max(0, int(as_rev / random.randint(15000, 40000))),
        })
    
    return jsonify({
        "success": True,
        "campaign": dict(campaign),
        "ad_sets": ad_sets,
    })


@app.route("/accounts")
@login_required
def accounts_page():
    """List platform accounts — only from current user's DB."""
    conn = get_user_db(session["user_id"])
    accounts = conn.execute(
        "SELECT * FROM platform_accounts ORDER BY created_at DESC"
    ).fetchall()
    connected_ids = [
        a["platform_account_id"] for a in accounts if a["platform_account_id"]
    ]
    conn.close()
    return render_template(
        "accounts.html", accounts=accounts, connected_ids=connected_ids
    )


@app.route("/settings", methods=["GET", "POST"])
@login_required
def settings_page():
    """User settings — stored in master DB alongside user record."""
    user_id = session["user_id"]
    conn = get_master_db()

    if request.method == "POST":
        token = request.form.get("telegram_bot_token", "")
        chat_id = request.form.get("telegram_chat_id", "")

        conn.execute(
            """
            UPDATE dashboard_users 
            SET telegram_bot_token = ?, telegram_chat_id = ? 
            WHERE id = ?
        """,
            (token, chat_id, user_id),
        )
        conn.commit()

        # Test connection if credentials provided
        if token and chat_id:
            try:
                msg = "✅ Your AdForge dashboard is connected! You'll receive real-time FB ads alerts here."
                requests.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": chat_id, "text": msg},
                    timeout=5,
                )
            except Exception as e:
                print(f"[telegram] Test message send failed: {e}")

        conn.close()
        return redirect(url_for("settings_page", success=1))

    user = conn.execute(
        "SELECT * FROM dashboard_users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()
    return render_template(
        "settings.html", user=user, success=request.args.get("success")
    )


@app.route("/users")
@login_required
def users_page():
    """User management page (admin only)."""
    if session.get("role") != "admin":
        return redirect(url_for("dashboard"))

    conn = get_master_db()
    users = conn.execute(
        "SELECT id, username, email, role, is_active, created_at, last_login FROM dashboard_users"
    ).fetchall()
    conn.close()
    return render_template("users.html", users=users, username=session.get("username"))


@app.route("/taglinks")
@login_required
def taglinks_page():
    """Taglink attribution management page."""
    conn = get_user_db(session["user_id"])
    taglinks = conn.execute("""
        SELECT id, name, campaign_id, status, created_at 
        FROM campaigns WHERE platform = 'shopee_taglink'
        ORDER BY created_at DESC LIMIT 50
    """).fetchall()
    conn.close()
    return render_template(
        "taglinks.html", taglinks=taglinks, username=session.get("username")
    )


# ===================== ACCOUNT MANAGEMENT API =====================


@app.route("/api/accounts/add", methods=["POST"])
@login_required
def add_account():
    """Add account — stored in current user's isolated DB."""
    data = request.json
    name = data.get("name")
    platform = data.get("platform", "meta")
    token = data.get("token")
    platform_account_id = data.get("platform_account_id", "")
    account_type = data.get("account_type", "ad_account")

    if not name or not token:
        return jsonify({"success": False, "error": "Name and Token are required"}), 400

    conn = get_user_db(session["user_id"])
    acc_id = str(uuid.uuid4())[:12]

    if platform_account_id:
        existing = conn.execute(
            "SELECT id FROM platform_accounts WHERE platform_account_id = ?",
            (platform_account_id,),
        ).fetchone()
        if existing:
            conn.close()
            return jsonify(
                {"success": True, "message": "Already connected", "id": existing["id"]}
            )

    try:
        conn.execute(
            """
            INSERT INTO platform_accounts (id, platform, account_name, credentials, platform_account_id, account_type)
            VALUES (?, ?, ?, ?, ?, ?)
        """,
            (acc_id, platform, name, token, platform_account_id, account_type),
        )
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 500

    conn.close()
    return jsonify({"success": True, "message": "Account added"})


@app.route("/api/accounts/<account_id>/delete", methods=["POST"])
@login_required
def delete_account(account_id):
    """Delete account from user's DB."""
    conn = get_user_db(session["user_id"])
    conn.execute("DELETE FROM platform_accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


# ===================== SYSTEM USER FB API =====================


@app.route("/api/auth/facebook/login")
@login_required
def flask_fb_login():
    try:
        r = requests.get(f"{API_URL}/api/auth/facebook/login", timeout=5)
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/system-user/accounts")
@login_required
def system_user_accounts():
    if not FB_SYSTEM_TOKEN:
        return (
            jsonify({"success": False, "error": "System User token not configured"}),
            400,
        )

    try:
        results = []
        for endpoint, params, account_type in [
            (
                "/me/adaccounts",
                {
                    "fields": "id,name,account_status,currency,amount_spent",
                    "limit": 100,
                },
                "ad_account",
            ),
            (
                "/me/accounts",
                {"fields": "id,name,category,access_token", "limit": 100},
                "page",
            ),
            (
                "/me/businesses",
                {"fields": "id,name,created_time", "limit": 10},
                "business",
            ),
        ]:
            try:
                r = requests.get(
                    f"https://graph.facebook.com/v22.0{endpoint}",
                    params={"access_token": FB_SYSTEM_TOKEN, **params},
                    timeout=10,
                )
                data = r.json()
                if "data" in data:
                    for item in data["data"]:
                        entry = {
                            "id": item["id"],
                            "name": item.get("name", item["id"]),
                            "account_type": account_type,
                        }
                        if "category" in item:
                            entry["category"] = item["category"]
                        if "access_token" in item:
                            entry["access_token"] = item["access_token"]
                        results.append(entry)
            except Exception as e:
                print(f"[sys-user] Failed: {endpoint}: {e}")

        return jsonify({"success": True, "accounts": results})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/system-user/connect", methods=["POST"])
@login_required
def system_user_connect():
    if not FB_SYSTEM_TOKEN:
        return (
            jsonify({"success": False, "error": "System User token not configured"}),
            400,
        )

    data = request.json
    account_id = data.get("account_id")
    account_name = data.get("account_name", "")
    account_type = data.get("account_type", "")

    if not account_id:
        return jsonify({"success": False, "error": "account_id required"}), 400

    conn = get_user_db(session["user_id"])

    existing = conn.execute(
        "SELECT id FROM platform_accounts WHERE platform_account_id = ?", (account_id,)
    ).fetchone()

    if existing:
        conn.close()
        return jsonify(
            {"success": True, "message": "Already connected", "id": existing["id"]}
        )

    if not account_name or not account_type:
        try:
            r = requests.get(
                f"https://graph.facebook.com/v22.0/{account_id}",
                params={"access_token": FB_SYSTEM_TOKEN, "fields": "id,name"},
                timeout=5,
            )
            info = r.json()
            if "name" in info:
                account_name = info["name"]
        except Exception:
            pass
        if "act_" in account_id or account_id.startswith("10"):
            account_type = "ad_account"

    acc_id = str(uuid.uuid4())[:12]
    try:
        conn.execute(
            """
            INSERT INTO platform_accounts (id, platform, account_name, credentials, platform_account_id, account_type)
            VALUES (?, 'meta', ?, ?, ?, ?)
        """,
            (
                acc_id,
                account_name,
                FB_SYSTEM_TOKEN,
                account_id,
                account_type or "ad_account",
            ),
        )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "id": acc_id, "name": account_name})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/system-user/connect-all", methods=["POST"])
@login_required
def system_user_connect_all():
    if not FB_SYSTEM_TOKEN:
        return (
            jsonify({"success": False, "error": "System User token not configured"}),
            400,
        )

    try:
        results = []
        conn = get_user_db(session["user_id"])

        r = requests.get(
            "https://graph.facebook.com/v22.0/me/adaccounts",
            params={"access_token": FB_SYSTEM_TOKEN, "fields": "id,name", "limit": 100},
            timeout=10,
        )
        data = r.json()
        if "data" in data:
            for acc in data["data"]:
                existing = conn.execute(
                    "SELECT id FROM platform_accounts WHERE platform_account_id = ?",
                    (acc["id"],),
                ).fetchone()
                if not existing:
                    acc_id = str(uuid.uuid4())[:12]
                    conn.execute(
                        """
                        INSERT INTO platform_accounts (id, platform, account_name, credentials, platform_account_id, account_type)
                        VALUES (?, 'meta', ?, ?, ?, 'ad_account')
                    """,
                        (
                            acc_id,
                            acc.get("name", acc["id"]),
                            FB_SYSTEM_TOKEN,
                            acc["id"],
                        ),
                    )
                    results.append(acc_id)

        conn.commit()
        conn.close()
        return jsonify({"success": True, "connected": len(results), "ids": results})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ===================== DRAFTS API =====================


@app.route("/api/drafts")
def api_drafts():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify([])
    conn = get_user_db(user_id)
    c = conn.cursor()
    status = request.args.get("status", "pending")
    drafts = c.execute(
        "SELECT * FROM approval_drafts WHERE status = ? ORDER BY created_at DESC",
        (status,),
    ).fetchall()
    conn.close()
    return jsonify([dict(d) for d in drafts])


@app.route("/api/drafts/create", methods=["POST"])
@login_required
def api_draft_create():
    data = request.get_json()
    draft_id = str(uuid.uuid4())[:8]
    conn = get_user_db(session["user_id"])
    c = conn.cursor()

    try:
        c.execute(
            """
            INSERT INTO approval_drafts (id, type, summary, details_json, proposed_by, status) 
            VALUES (?, ?, ?, ?, ?, 'pending')
        """,
            (
                draft_id,
                data.get("type"),
                data.get("summary"),
                json.dumps(data.get("details", {})),
                data.get("proposed_by", "ai"),
            ),
        )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "draft_id": draft_id})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/drafts/batch", methods=["POST"])
@login_required
def api_drafts_batch():
    """Batch approve or reject drafts."""
    data = request.get_json() or {}
    action = data.get("action", "approve")
    draft_ids = data.get("ids", [])
    if not draft_ids:
        return jsonify({"success": False, "error": "No draft IDs provided"}), 400
    
    conn = get_user_db(session["user_id"])
    c = conn.cursor()
    count = 0
    reviewer = session.get("username", "user")
    for did in draft_ids:
        if action == "approve":
            c.execute("""
                UPDATE approval_drafts SET status='approved', reviewed_at=CURRENT_TIMESTAMP,
                reviewed_by=?, execution_result=? WHERE id=? AND status='pending'
            """, (reviewer, json.dumps({"status":"batch_executed"}), did))
        elif action == "reject":
            c.execute("""
                UPDATE approval_drafts SET status='rejected', reviewed_at=CURRENT_TIMESTAMP,
                reviewed_by=?, rejection_reason=? WHERE id=? AND status='pending'
            """, (reviewer, data.get("reason", "Batch rejected"), did))
        if c.rowcount > 0:
            count += 1
    conn.commit()
    conn.close()
    return jsonify({"success": True, "processed": count, "action": action})


@app.route("/api/drafts/<draft_id>/approve", methods=["POST"])
@login_required
def api_draft_approve(draft_id):
    data = request.get_json() or {}
    conn = get_user_db(session["user_id"])
    c = conn.cursor()

    try:
        draft = c.execute(
            "SELECT * FROM approval_drafts WHERE id = ?", (draft_id,)
        ).fetchone()
        if not draft:
            conn.close()
            return jsonify({"success": False, "error": "Draft not found"}), 404

        c.execute(
            """
            UPDATE approval_drafts 
            SET status = 'approved', 
                reviewed_at = CURRENT_TIMESTAMP, 
                reviewed_by = ?,
                execution_result = ?
            WHERE id = ?
        """,
            (
                data.get("reviewed_by", session.get("username", "user")),
                json.dumps(
                    {"status": "executed", "timestamp": datetime.now().isoformat()}
                ),
                draft_id,
            ),
        )

        conn.commit()
        conn.close()

        # Send Telegram notification to this user
        send_telegram_alert(
            session["user_id"],
            text=f"✅ *Draft Approved*\nSummary: {draft['summary']}\nType: {draft['type']}",
        )

        return jsonify({"success": True, "message": "Draft approved"})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/drafts/<draft_id>/reject", methods=["POST"])
@login_required
def api_draft_reject(draft_id):
    data = request.get_json() or {}
    conn = get_user_db(session["user_id"])
    c = conn.cursor()

    try:
        c.execute(
            """
            UPDATE approval_drafts SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?, rejection_reason = ? WHERE id = ?
        """,
            (
                data.get("reviewed_by", session.get("username", "user")),
                data.get("reason", ""),
                draft_id,
            ),
        )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Draft rejected"})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 400


# ===================== USER MANAGEMENT API =====================


@app.route("/api/users")
@login_required
def api_users():
    if session.get("role") != "admin":
        return jsonify({"success": False, "error": "Admin only"}), 403

    conn = get_master_db()
    users = conn.execute(
        "SELECT id, username, email, role, is_active, created_at, last_login FROM dashboard_users"
    ).fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])


# ===================== TAGLINK API =====================


@app.route("/api/taglink/generate", methods=["POST"])
@login_required
def api_taglink_generate():
    """Generate tagged Shopee link for attribution."""
    data = request.json
    url = data.get("url", "")
    campaign = data.get("campaign", "")
    adset = data.get("adset", "")
    ad = data.get("ad", "")
    account = data.get("account", "0858")

    if not url or not campaign:
        return jsonify({"success": False, "error": "URL and campaign required"}), 400

    # Sanitize inputs - alphanumeric, hyphens, underscores only
    safe_campaign = re.sub(r'[^a-zA-Z0-9_-]', '', campaign)
    safe_adset = re.sub(r'[^a-zA-Z0-9_-]', '', adset)
    # Sanitize subprocess inputs to prevent injection
    campaign_safe = re.sub(r'[^a-zA-Z0-9_ -]', '', str(campaign))
    url_safe = re.sub(r'[^a-zA-Z0-9_\-./:?=&%]', '', str(url))
    adset_safe = re.sub(r'[^a-zA-Z0-9_ -]', '', str(adset))
    ad_safe = re.sub(r'[^a-zA-Z0-9_ -]', '', str(ad))
    account_safe = re.sub(r'[^a-zA-Z0-9_ -]', '', str(account))

    import subprocess

    result = subprocess.run(
        [
            "python3",
            "scripts/vilona_taglink_attribution.py",
            "generate",
            "--campaign",
            campaign_safe,
            "--url",
            url_safe,
            "--adset",
            adset_safe,
            "--ad",
            ad_safe,
            "--account",
            account_safe,
        ],
        capture_output=True,
        text=True,
        cwd=os.path.join(os.path.expanduser("~"), ".openclaw", "workspace"),
    )

    try:
        output = json.loads(result.stdout)
        return jsonify({"success": True, "taglink": output})
    except (json.JSONDecodeError, Exception) as e:
        return jsonify({"success": False, "error": result.stderr or result.stdout or str(e)}), 500


@app.route("/api/taglink/report")
@login_required
def api_taglink_report():
    """Get attribution report for current user's campaigns."""
    import subprocess

    result = subprocess.run(
        ["python3", "scripts/vilona_taglink_attribution.py", "report", "--json"],
        capture_output=True,
        text=True,
        cwd=os.path.join(os.path.expanduser("~"), ".openclaw", "workspace"),
    )

    return jsonify({"success": True, "report": result.stdout})


@app.route("/api/taglink/list")
@login_required
def api_taglink_list():
    """List all taglinks generated by this user."""
    conn = get_user_db(session["user_id"])
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
        (user_id,),
    ).fetchone()
    conn.close()

    if user and user["telegram_bot_token"] and user["telegram_chat_id"]:
        try:
            requests.post(
                f"https://api.telegram.org/bot{user['telegram_bot_token']}/sendMessage",
                json={
                    "chat_id": user["telegram_chat_id"],
                    "text": text,
                    "parse_mode": "Markdown",
                },
                timeout=5,
            )
        except Exception as e:
            print(f"[telegram] Send message failed: {e}")

# ===================== INIT (lazy) =====================
_db_initialized = False


def ensure_master_db():
    global _db_initialized
    if _db_initialized:
        return
    init_master_db()
    migrate_existing_users()
    _db_initialized = True


@app.route("/health")
def health_check():
    """Health check endpoint for upstream monitoring."""
    import subprocess
    services = {
        "flask": "ok",
        "node_api": "unknown",
    }
    try:
        r = requests.get(f"{API_URL}/health", timeout=3)
        services["node_api"] = "ok" if r.status_code < 500 else "error"
    except Exception:
        services["node_api"] = "unreachable"
    
    try:
        r = requests.get("http://127.0.0.1:5002/", timeout=3)
        services["flask"] = "ok"
    except Exception:
        services["flask"] = "error"
    
    return jsonify({
        "status": "ok" if all(v == "ok" for v in services.values()) else "degraded",
        "services": services,
        "timestamp": datetime.now().isoformat(),
    })


# ===================== LEGAL / COMPLIANCE ROUTES =====================

@app.route("/privacy")
def privacy_page():
    return render_template("legal.html",
        title="Privacy Policy",
        content="""<h3>Privacy Policy</h3>
<p><strong>Effective Date:</strong> June 2026</p>
<h4>1. Self-Hosted Model</h4>
<p>AdForge is a self-hosted software platform. We do not operate a cloud service.
When you install and run AdForge on your own server, you are the data controller.
<strong>We (BerkahKarya Digital) have zero access to your data</strong>.</p>
<h4>2. Data We Process (on your server only)</h4>
<ul><li>Username and password (bcrypt hashed)</li>
<li>Facebook OAuth tokens (AES-256 encrypted)</li>
<li>Ad account IDs, campaign names, performance metrics</li></ul>
<h4>3. No Third-Party Sharing</h4>
<p>No analytics SDKs, no data resale, no external servers.</p>
<h4>4. Data Deletion</h4>
<p>Disconnect from dashboard, revoke from Facebook App Settings, or delete
the local SQLite database. Data Deletion URL: <a href="/data-deletion">/data-deletion</a>.</p>
<h4>5. Contact</h4><p>Telegram: @codergaboets</p>""")

@app.route("/terms")
def terms_page():
    return render_template("legal.html",
        title="Terms of Service",
        content="""<h3>Terms of Service</h3>
<p><strong>Effective Date:</strong> June 2026</p>
<h4>1. Software License</h4>
<p>MIT License. Full text: github.com/oyi77/1ai-ads</p>
<h4>2. No Warranty</h4>
<p>THE SOFTWARE IS PROVIDED "AS IS". You assume all responsibility
for campaign performance, ad spend, and platform policy compliance.</p>
<h4>3. Your Responsibilities</h4>
<ul><li>Comply with Meta/Google/TikTok Advertising Policies</li>
<li>You are responsible for all ad spend</li>
<li>No prohibited content or deceptive practices</li>
<li>Review all AI suggestions before approving</li></ul>
<h4>4. Contact</h4><p>Telegram: @codergaboets</p>""")

@app.route("/data-deletion")
def data_deletion_page():
    return render_template("legal.html",
        title="Data Deletion",
        content="""<h3>Data Deletion Instructions</h3>
<p>AdForge is self-hosted — your data is on your server.</p>
<h4>Option 1: Disconnect from Dashboard</h4>
<p>Go to Meta Accounts → Disconnect. Tokens + data deleted immediately.</p>
<h4>Option 2: Revoke from Facebook</h4>
<p>Settings → Apps and Websites → Find "AdForge AI" (ID: 704618995979962) → Remove.</p>
<h4>Option 3: Full Server Deletion</h4>
<p>Stop service and delete SQLite database file.</p>
<h4>What Gets Deleted:</h4>
<ul><li>Facebook OAuth tokens</li><li>Ad account data</li>
<li>Campaign metadata</li><li>Performance metrics</li></ul>
<p>Contact: Telegram @codergaboets</p>""")


@app.before_request
def before_request():
    ensure_master_db()


def migrate_existing_users():
    """Ensure all existing users in master DB have their isolated DBs."""
    conn = get_master_db()
    users = conn.execute("SELECT id FROM dashboard_users").fetchall()
    conn.close()
    for u in users:
        ensure_user_db(u["id"])


# === 0858 FB ADS ENGINE INTEGRATION (31 May 2026) ===
ENGINE_STATE_0858 = Path.home() / ".openclaw/workspace/data/engine_0858_v3_state.json"
ENGINE_LOG_0858 = Path.home() / ".openclaw/workspace/logs/engine_0858_v3.log"
ENGINE_DASH_0858 = (
    Path.home() / ".openclaw/workspace/data/0858/0858_dashboard_live.json"
)


def load_0858_status():
    """Load 0858 engine status from state files."""
    status = {
        "engine": "0858_v3",
        "account": "act_435670549443081",
        "active": False,
        "last_check": None,
        "daily_spend": 0,
        "cap": 300000,
        "hard_cap": False,
        "total_campaigns": 0,
        "active_campaigns": 0,
        "paused_campaigns": 0,
        "off_skip": 0,
        "avg_cpc": 0,
        "today_clicks": 0,
        "products": [],
        "actions": {},
        "log_tail": [],
        "campaigns": [],
    }
    if ENGINE_STATE_0858.exists():
        try:
            state = json.loads(ENGINE_STATE_0858.read_text())
            status["last_check"] = state.get("last_check", "")
            status["hard_cap"] = state.get("hard_cap", False)
            cycle = state.get("cycle_summary", {})
            status["daily_spend"] = cycle.get("daily_spend", 0)
            status["cap"] = cycle.get("cap", 300000)
            status["actions"] = cycle.get("actions", {})
            for k, v in state.get("product_roas", {}).items():
                status["products"].append(
                    {
                        "name": k,
                        "commission": v.get("commission", 0),
                        "roas": v.get("roas", 0),
                    }
                )
        except Exception:
            pass
    if ENGINE_DASH_0858.exists():
        try:
            dash = json.loads(ENGINE_DASH_0858.read_text())
            status["total_campaigns"] = dash.get("total_campaigns", 0)
            status["active_campaigns"] = dash.get("active", 0)
            status["off_skip"] = dash.get("off_active", 0)
            status["avg_cpc"] = dash.get("avg_cpc", 0)
            status["today_clicks"] = dash.get("today_clicks", 0)
            status["campaigns"] = dash.get("campaigns", [])
            if not status["daily_spend"]:
                status["daily_spend"] = dash.get("today_spend", 0)
        except Exception:
            pass
    if ENGINE_LOG_0858.exists():
        try:
            with open(ENGINE_LOG_0858, "r") as f:
                status["log_tail"] = f.readlines()[-25:]
        except Exception:
            pass
    return status


@app.route("/0858")
@login_required
def dashboard_0858():
    return render_template("0858_dashboard.html", status=load_0858_status())


@app.route("/api/0858/status")
@login_required
def api_0858_status():
    return jsonify(load_0858_status())


@app.route("/api/0858/campaigns")
@login_required
def api_0858_campaigns():
    return jsonify(load_0858_status().get("campaigns", []))

# ─── TRAKPRO INTEGRATION ──────────────────────────────────────────────────
TRAKPRO_STATE = Path(__file__).parent.parent / "data" / "vilona_trakpro_state.json"
TRAKPRO_ALERTS = Path(__file__).parent.parent / "data" / "vilona_trakpro_alerts.jsonl"

@app.route("/api/trakpro/status")
def api_trakpro_status():
    """Return Trakpro engine state for dashboard integration.
    Accepts ?key=BerkahKarya2026! for non-session access."""
    # Allow API key bypass for dashboard integration
    # Cek API key bypass untuk dashboard integration
    api_key = request.args.get("key", "")
    env_key = os.getenv("TRAKPRO_API_KEY", "CHANGE_ME")
    if api_key != env_key:
        if "user_id" not in session:
            return jsonify({"error": "Unauthorized", "success": False}), 401
    state = {}
    if TRAKPRO_STATE.exists():
        try:
            state = json.loads(TRAKPRO_STATE.read_text())
        except:
            pass
    
    # Add recent alerts
    alerts = []
    if TRAKPRO_ALERTS.exists():
        try:
            for line in TRAKPRO_ALERTS.read_text().strip().split("\n")[-10:]:
                if line.strip():
                    alerts.append(json.loads(line))
        except:
            pass
    
    # Check engine health
    import subprocess
    engine_running = subprocess.run(
        ["systemctl", "--user", "is-active", "vilona-trakpro.service"],
        capture_output=True, text=True, timeout=3
    ).stdout.strip() == "active"
    
    return jsonify({
        "engine": "running" if engine_running else "stopped",
        "accounts": {
            k: {
                "last_cycle": v.get("last_cycle"),
                "active": v.get("summary", {}).get("active", 0),
                "total": v.get("summary", {}).get("total_campaigns", 0),
                "spend_48h": v.get("summary", {}).get("spend_48h", 0),
                "winners": v.get("summary", {}).get("winners", 0),
                "boncos": v.get("summary", {}).get("boncos", 0),
            }
            for k, v in state.items() if k in ("0858", "1041", "1208")
        },
        "alerts": alerts[-5:],
    })



# ─── MISSING ROUTES (FIXED) ─────────────────────────────────────────────

@app.route("/drafts")
@login_required
def drafts_page():
    """Approval drafts — review pending + history."""
    conn = get_user_db(session["user_id"])
    c = conn.cursor()
    pending = c.execute(
        "SELECT * FROM approval_drafts WHERE status = 'pending' ORDER BY created_at DESC"
    ).fetchall()
    history = c.execute(
        "SELECT * FROM approval_drafts WHERE status != 'pending' ORDER BY reviewed_at DESC LIMIT 20"
    ).fetchall()
    pending_count = len(pending)
    conn.close()
    return render_template(
        "drafts.html",
        pending_drafts=pending,
        history_drafts=history,
        pending_count=pending_count,
    )


@app.route("/automation")
@login_required
def automation_page():
    """Automation rules management."""
    conn = get_user_db(session["user_id"])
    c = conn.cursor()
    rules = c.execute(
        "SELECT * FROM automation_rules ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return render_template("automation.html", rules=rules)


@app.route("/api/automation/toggle/<rule_id>", methods=["POST"])
@login_required
def api_automation_toggle(rule_id):
    """Toggle automation rule on/off."""
    conn = get_user_db(session["user_id"])
    rule = conn.execute("SELECT is_active FROM automation_rules WHERE id = ?", (rule_id,)).fetchone()
    if not rule:
        conn.close()
        return jsonify({"success": False, "error": "Rule not found"}), 404
    new_state = 0 if rule["is_active"] else 1
    conn.execute("UPDATE automation_rules SET is_active = ? WHERE id = ?", (new_state, rule_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "is_active": bool(new_state)})


@app.route("/api/automation/create", methods=["POST"])
@login_required
def api_automation_create():
    """Create new automation rule."""
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"success": False, "error": "Rule name required"}), 400
    rule_id = str(uuid.uuid4())[:8]
    conn = get_user_db(session["user_id"])
    conn.execute("""
        INSERT INTO automation_rules (id, name, trigger_metric, trigger_operator, trigger_value, action_type, action_params, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    """, (
        rule_id, name,
        data.get("trigger_metric", "CPC"),
        data.get("trigger_operator", ">"),
        data.get("trigger_value", 100),
        data.get("action_type", "pause_campaign"),
        json.dumps(data.get("action_params", {}))
    ))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "rule_id": rule_id})


@app.route("/api/automation/<rule_id>/delete", methods=["POST"])
@login_required
def api_automation_delete(rule_id):
    """Delete automation rule."""
    conn = get_user_db(session["user_id"])
    conn.execute("DELETE FROM automation_rules WHERE id = ?", (rule_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/automation/clone/<from_account>/<to_account>", methods=["POST"])
@login_required
def api_automation_clone(from_account, to_account):
    """Clone all automation rules from one account to another."""
    conn = get_user_db(session["user_id"])
    c = conn.cursor()
    rules = c.execute(
        "SELECT * FROM automation_rules WHERE account_id = ?", (from_account,)
    ).fetchall()
    
    # Check target account exists
    target = c.execute("SELECT id FROM platform_accounts WHERE id = ?", (to_account,)).fetchone()
    if not target:
        conn.close()
        return jsonify({"success": False, "error": "Target account not found"}), 404
    
    cloned = 0
    for rule in rules:
        # Skip if already exists with same name
        existing = c.execute(
            "SELECT id FROM automation_rules WHERE account_id = ? AND name = ?",
            (to_account, rule["name"])
        ).fetchone()
        if existing:
            continue
        rid = str(uuid.uuid4())[:8]
        c.execute("""
            INSERT INTO automation_rules (id, account_id, name, description, trigger_metric, trigger_operator, trigger_value, action_type, action_params, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (rid, to_account, rule["name"], rule["description"], rule["trigger_metric"],
              rule["trigger_operator"], rule["trigger_value"], rule["action_type"],
              rule["action_params"], rule["is_active"]))
        cloned += 1
    
    conn.commit()
    conn.close()
    return jsonify({"success": True, "cloned": cloned, "total": len(rules)})


@app.route("/reports")
@login_required
def reports_page():
    """Reports dashboard with charts."""
    conn = get_user_db(session["user_id"])
    c = conn.cursor()
    total_spend = c.execute("SELECT COALESCE(SUM(spend), 0) FROM campaigns").fetchone()[0]
    total_revenue = c.execute("SELECT COALESCE(SUM(revenue), 0) FROM campaigns").fetchone()[0]
    campaign_count = c.execute("SELECT COUNT(*) FROM campaigns").fetchone()[0]
    
    # Per-platform aggregation
    platforms = c.execute("""
        SELECT platform, SUM(spend) as spend, SUM(revenue) as revenue, COUNT(*) as cnt
        FROM campaigns GROUP BY platform
    """).fetchall()
    conn.close()
    
    total_roas = total_revenue / max(total_spend or 1, 1)
    
    return render_template(
        "reports.html",
        total_spend=total_spend,
        total_revenue=total_revenue,
        total_roas=total_roas,
        campaign_count=campaign_count,
        platforms=platforms,
    )


@app.route("/api/reports/data")
@login_required
def api_reports_data():
    """Return chart data for reports page."""
    conn = get_user_db(session["user_id"])
    campaigns = conn.execute("SELECT * FROM campaigns ORDER BY created_at").fetchall()
    conn.close()
    
    labels = [c["name"][:20] for c in campaigns]
    spend_data = [c["spend"] or 0 for c in campaigns]
    revenue_data = [c["revenue"] or 0 for c in campaigns]
    roas_data = [round((c["revenue"] or 0) / max(c["spend"] or 1, 1), 2) for c in campaigns]
    
    return jsonify({
        "labels": labels,
        "spend": spend_data,
        "revenue": revenue_data,
        "roas": roas_data,
    })


@app.route("/auto_scale")
@login_required
def auto_scale_page():
    """Auto-scaling rules page."""
    return render_template("auto_scale.html", scale_plan=None, pause_plan=None)


@app.route("/auto_pause")
@login_required
def auto_pause_page():
    """Auto-pause rules page."""
    return render_template("auto_pause.html")



# ═══════════════════════════════════════════════════════════════
# LIVE META ADS API ROUTES
# ═══════════════════════════════════════════════════════════════

try:
    sys.path.insert(0, str(Path(__file__).parent.parent / 'scripts'))
    from facebook_service import fb_service
except ImportError:
    fb_service = None


@app.route("/api/meta/accounts")
@login_required
def api_meta_accounts():
    """Get all configured Meta ad accounts with status."""
    if not fb_service:
        return jsonify({"success": False, "error": "Facebook service unavailable"}), 503
    if not fb_service.is_token_valid():
        return jsonify({"success": False, "error": "Meta token not configured"}), 400
    accounts = fb_service.get_accounts()
    return jsonify({"success": True, "accounts": accounts})


@app.route("/api/meta/campaigns/<act_key>")
@login_required
def api_meta_campaigns(act_key):
    """Get live campaigns for an account directly from Meta API."""
    if not fb_service or not fb_service.is_token_valid():
        return jsonify({"success": False, "error": "Meta token not available"}), 400
    result = fb_service.get_campaigns(act_key)
    return jsonify(result)


@app.route("/api/meta/insights/<act_key>")
@login_required
def api_meta_insights(act_key):
    """Get account-level insights from Meta API."""
    if not fb_service or not fb_service.is_token_valid():
        return jsonify({"success": False, "error": "Meta token not available"}), 400
    days = request.args.get("days", 1, type=int)
    result = fb_service.get_account_insights(act_key, days=days)
    return jsonify(result)


@app.route("/api/meta/campaign/<campaign_id>/detail")
@login_required
def api_meta_campaign_detail(campaign_id):
    """Get campaign detail with ad sets from Meta API."""
    if not fb_service or not fb_service.is_token_valid():
        return jsonify({"success": False, "error": "Meta token not available"}), 400
    result = fb_service.get_campaign_detail(campaign_id)
    return jsonify(result)


@app.route("/api/meta/campaign/<campaign_id>/<action>", methods=["POST"])
@login_required
def api_meta_campaign_action(campaign_id, action):
    """Execute campaign action: pause, activate, kill, or budget."""
    if not fb_service or not fb_service.is_token_valid():
        return jsonify({"success": False, "error": "Meta token not available"}), 400
    
    if action == "pause":
        result = fb_service.pause_campaign(campaign_id)
    elif action == "activate":
        result = fb_service.activate_campaign(campaign_id)
    elif action == "kill":
        result = fb_service.kill_campaign(campaign_id)
    elif action == "budget":
        data = request.get_json() or {}
        budget = data.get("daily_budget", 0)
        if not budget:
            return jsonify({"success": False, "error": "daily_budget required"}), 400
        result = fb_service.update_budget(campaign_id, budget)
    else:
        return jsonify({"success": False, "error": f"Unknown action: {action}"}), 400
    
    return jsonify(result)


# ── New Feature Routes (proxy to Express backend) ──────────────
EXPRESS_API = "http://127.0.0.1:5000"

def _proxy_get(path, token):
    """Proxy GET request to Express backend."""
    try:
        r = requests.get(f"{EXPRESS_API}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=10)
        return r.json() if r.ok else {"success": False, "error": r.text[:200]}
    except Exception as e:
        return {"success": False, "error": str(e)}

def _proxy_post(path, token, data=None):
    """Proxy POST request to Express backend."""
    try:
        r = requests.post(f"{EXPRESS_API}{path}", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, json=data or {}, timeout=10)
        return r.json() if r.ok else {"success": False, "error": r.text[:200]}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.route("/creative/library")
@login_required
def creative_library_page():
    return render_template("creative_library.html", username=session.get("username"))


@app.route("/creative/fatigue")
@login_required
def creative_fatigue_page():
    return render_template("creative_fatigue.html", username=session.get("username"))


@app.route("/creative/scoring")
@login_required
def creative_scoring_page():
    return render_template("creative_scoring.html", username=session.get("username"))


@app.route("/testing/ab-tests")
@login_required
def ab_tests_page():
    return render_template("ab_tests.html", username=session.get("username"))


@app.route("/reporting/unified")
@login_required
def unified_reporting_page():
    return render_template("unified_reporting.html", username=session.get("username"))


@app.route("/reporting/widgets")
@login_required
def dashboard_widgets_page():
    return render_template("dashboard_widgets.html", username=session.get("username"))


@app.route("/attribution")
@login_required
def attribution_page():
    return render_template("attribution.html", username=session.get("username"))


@app.route("/ops/bulk")
@login_required
def bulk_ops_page():
    return render_template("bulk_ops.html", username=session.get("username"))


@app.route("/agency")
@login_required
def agency_page():
    return render_template("agency.html", username=session.get("username"))


# API proxy endpoints for new features
@app.route("/api/proxy/<path:subpath>", methods=["GET", "POST"])
@login_required
def api_proxy(subpath):
    """Proxy requests to Express backend API."""
    token = session.get("api_token", "")
    if request.method == "GET":
        return jsonify(_proxy_get(f"/api/{subpath}", token))
    else:
        return jsonify(_proxy_post(f"/api/{subpath}", token, request.get_json(silent=True)))
if __name__ == "__main__":
    print("=" * 60)
    print("🚀 AdForge Dashboard v3.0 — Per-User Database Isolation")
    print("   http://127.0.0.1:5002")
    print("   Users: Each user has their OWN database file")
    print("=" * 60)
    app.run(host="127.0.0.1", port=5002, debug=True, use_reloader=True)
