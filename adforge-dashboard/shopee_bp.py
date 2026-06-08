"""
🛒 Shopee Ads Blueprint — Multi-account Shopee Affiliate + Meta Ads Campaign Monitor

Registered under /shopee/ prefix in main app.py.

Features:
  ✅ Multiple CSV upload (drag-drop supported)
  ✅ Per-account mapping (Nyamiresep 1041, Kakriput 1208/8458, JENDRALBOT 0858)
  ✅ Auto-read pushed data from topic chats (data/shopee/*.json)
  ✅ Shopee Commission + Clicks tracking
  ✅ Meta Ads integration (spend, CPC, CTR, ROAS)
  ✅ Unified dashboard with per-account tabs
"""
from flask import Blueprint, render_template, jsonify, request
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path
import pandas as pd
import numpy as np
import json
import math
import os
import re
import time
import glob

shopee_bp = Blueprint(
    "shopee",
    __name__,
    url_prefix="/shopee",
    template_folder="templates",
)

# ─── Config ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "shopee"
UPLOAD_DIR = DATA_DIR / "uploads"
REPORTS_DIR = BASE_DIR / "reports"
MEDIA_DIR = Path("/home/openclaw/.openclaw/media/inbound")

ALLOWED_EXTENSIONS = {"csv"}
MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB

ACCOUNTS = {
    "nyamiresep": {
        "id": "nyamiresep",
        "name": "Nyamiresep Dapur",
        "meta_act": "act_380721031313330",
        "meta_label": "1041",
        "color": "#FF6B6B",
        "icon": "🍳",
        "hard_cap": 300000,
        "csv_patterns": ["nyamiresep", "nyami", "1041", "380721"],
    },
    "kakriput": {
        "id": "kakriput",
        "name": "Kakriput",
        "meta_act": "act_435670549443081",
        "meta_label": "1208/8458",
        "color": "#4ECDC4",
        "icon": "🌿",
        "hard_cap": 300000,
        "csv_patterns": ["kakriput", "kakrip", "1208", "8458", "435670"],
    },
    "jendralbot": {
        "id": "jendralbot",
        "name": "JENDRALBOT",
        "meta_act": "act_435670549443081",
        "meta_label": "0858",
        "color": "#45B7D1",
        "icon": "🤖",
        "hard_cap": 500000,
        "csv_patterns": ["jendralbot", "0858", "jendral"],
    },
}

for _acc_id in ACCOUNTS:
    (UPLOAD_DIR / _acc_id).mkdir(parents=True, exist_ok=True)

# ─── Cache ─────────────────────────────────────────────────────────────────────
_cache: dict = {}
_cache_ttl = 30  # seconds


def _detect_account_from_filename(filename: str) -> str:
    fname_lower = filename.lower()
    for acc_id, acc in ACCOUNTS.items():
        for pattern in acc["csv_patterns"]:
            if pattern in fname_lower:
                return acc_id
    return None


def _parse_shopee_commission_csv(filepath: str) -> list:
    try:
        df = pd.read_csv(filepath)
        orders = []
        for _, row in df.iterrows():
            try:
                order = {
                    "order_id": str(row.get("Order ID", row.get("order_id", ""))),
                    "product_name": str(
                        row.get("Product Name", row.get("product_name", ""))
                    ),
                    "commission": float(
                        row.get("Commission", row.get("commission", 0))
                    ),
                    "status": str(row.get("Status", row.get("status", "unknown"))),
                    "date": str(
                        row.get("Order Time", row.get("date", row.get("Date", "")))
                    ),
                }
                orders.append(order)
            except Exception:
                continue
        return orders
    except Exception:
        return []


def _load_json_data(filepath: str) -> dict:
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except Exception:
        return {}


def _get_account_data(account_id: str) -> dict:
    cache_key = f"account_{account_id}"
    now = time.time()
    if cache_key in _cache and now - _cache[cache_key]["ts"] < _cache_ttl:
        return _cache[cache_key]["data"]

    acc = ACCOUNTS.get(account_id)
    if not acc:
        return {}

    csv_files = sorted(
        glob.glob(str(UPLOAD_DIR / account_id / "*.csv")),
        key=os.path.getmtime,
        reverse=True,
    )
    json_files = sorted(
        glob.glob(str(DATA_DIR / account_id / "*.json")),
        key=os.path.getmtime,
        reverse=True,
    )

    orders = []
    for f in csv_files[:5]:
        orders.extend(_parse_shopee_commission_csv(f))

    meta_data = {}
    for f in json_files[:3]:
        data = _load_json_data(f)
        if data:
            meta_data.update(data)

    total_commission = sum(o.get("commission", 0) for o in orders)
    total_orders = len(orders)

    result = {
        "account": acc,
        "orders": orders[:50],
        "total_orders": total_orders,
        "total_commission": total_commission,
        "meta_data": meta_data,
        "csv_files": [
            {"name": os.path.basename(f), "size": os.path.getsize(f)}
            for f in csv_files[:10]
        ],
    }

    _cache[cache_key] = {"data": result, "ts": now}
    return result


def _get_unified_data() -> dict:
    cache_key = "unified"
    now = time.time()
    if cache_key in _cache and now - _cache[cache_key]["ts"] < _cache_ttl:
        return _cache[cache_key]["data"]

    accounts_data = {}
    total_commission = 0
    total_orders = 0

    for acc_id in ACCOUNTS:
        data = _get_account_data(acc_id)
        accounts_data[acc_id] = data
        total_commission += data.get("total_commission", 0)
        total_orders += data.get("total_orders", 0)

    result = {
        "accounts": accounts_data,
        "total_commission": total_commission,
        "total_orders": total_orders,
        "account_count": len(ACCOUNTS),
    }

    _cache[cache_key] = {"data": result, "ts": now}
    return result


# ─── Routes ────────────────────────────────────────────────────────────────────


@shopee_bp.route("/")
def index():
    return render_template("shopee_dashboard.html", accounts=ACCOUNTS)


@shopee_bp.route("/api/unified")
def api_unified():
    return jsonify(_get_unified_data())


@shopee_bp.route("/api/account/<account_id>")
def api_account(account_id):
    if account_id not in ACCOUNTS:
        return jsonify({"error": "Account not found"}), 404
    return jsonify(_get_account_data(account_id))


@shopee_bp.route("/api/accounts")
def api_accounts():
    return jsonify(
        {
            "accounts": [
                {
                    "id": acc["id"],
                    "name": acc["name"],
                    "color": acc["color"],
                    "icon": acc["icon"],
                }
                for acc in ACCOUNTS.values()
            ]
        }
    )


@shopee_bp.route("/api/meta/<account_id>")
def api_meta(account_id):
    acc = ACCOUNTS.get(account_id)
    if not acc:
        return jsonify({"error": "Account not found"}), 404

    json_files = sorted(
        glob.glob(str(DATA_DIR / account_id / "*.json")),
        key=os.path.getmtime,
        reverse=True,
    )

    meta_data = {}
    for f in json_files[:5]:
        data = _load_json_data(f)
        if data:
            meta_data.update(data)

    return jsonify({"account": acc, "meta": meta_data})


@shopee_bp.route("/api/orders/<account_id>")
def api_orders(account_id):
    if account_id not in ACCOUNTS:
        return jsonify({"error": "Account not found"}), 404

    data = _get_account_data(account_id)
    return jsonify({"orders": data.get("orders", []), "account": ACCOUNTS[account_id]})


@shopee_bp.route("/api/upload", methods=["POST"])
def api_upload():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only CSV files allowed"}), 400

    filename = secure_filename(file.filename)
    account_id = _detect_account_from_filename(filename)

    if not account_id:
        account_id = request.form.get("account_id", "jendralbot")

    filepath = UPLOAD_DIR / account_id / filename
    file.save(str(filepath))

    _cache.pop(f"account_{account_id}", None)
    _cache.pop("unified", None)

    return jsonify(
        {
            "success": True,
            "filename": filename,
            "account_id": account_id,
            "size": os.path.getsize(str(filepath)),
        }
    )


@shopee_bp.route("/api/uploaded-files")
def api_uploaded_files():
    files_by_account = {}
    for acc_id in ACCOUNTS:
        csv_files = sorted(
            glob.glob(str(UPLOAD_DIR / acc_id / "*.csv")),
            key=os.path.getmtime,
            reverse=True,
        )
        files_by_account[acc_id] = [
            {
                "name": os.path.basename(f),
                "size": os.path.getsize(f),
                "modified": datetime.fromtimestamp(os.path.getmtime(f)).isoformat(),
            }
            for f in csv_files[:20]
        ]
    return jsonify(files_by_account)


@shopee_bp.route("/api/delete-file", methods=["POST"])
def api_delete_file():
    data = request.get_json()
    filename = data.get("filename")
    account_id = data.get("account_id")

    if not filename or not account_id:
        return jsonify({"error": "filename and account_id required"}), 400

    filepath = UPLOAD_DIR / account_id / filename
    if not filepath.exists():
        return jsonify({"error": "File not found"}), 404

    os.remove(str(filepath))
    _cache.pop(f"account_{account_id}", None)
    _cache.pop("unified", None)

    return jsonify({"success": True})


@shopee_bp.route("/api/refresh")
def api_refresh():
    _cache.clear()
    return jsonify({"success": True, "message": "Cache cleared"})


@shopee_bp.route("/api/summary")
def api_summary():
    data = _get_unified_data()
    return jsonify(
        {
            "total_commission": data["total_commission"],
            "total_orders": data["total_orders"],
            "account_count": data["account_count"],
            "accounts": {
                acc_id: {
                    "name": ACCOUNTS[acc_id]["name"],
                    "commission": acc_data.get("total_commission", 0),
                    "orders": acc_data.get("total_orders", 0),
                }
                for acc_id, acc_data in data["accounts"].items()
            },
        }
    )
