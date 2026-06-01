"""
Shared Meta Ads helpers - import from both optimizer and baby_pillow scripts.
Eliminates code duplication across scripts.
"""

import re, requests, os
import os


# ─── Token loading ────────────────────────────────────────────
def load_token():
    """Load Meta access token from env."""
    return os.environ.get("META_ACCESS_TOKEN", "")


# ─── API helpers ──────────────────────────────────────────────
API_VERSION = "v19.0"
API_BASE = f"https://graph.facebook.com/{API_VERSION}"


def api_get(access_token, path, params=None, timeout=15):
    if params is None:
        params = {}
    params["access_token"] = access_token
    try:
        r = requests.get(f"{API_BASE}/{path}", params=params, timeout=timeout)
        return r.json()
    except Exception as e:
        return {"error": str(e)}


def api_post(access_token, path, data=None, timeout=15):
    if data is None:
        data = {}
    data["access_token"] = access_token
    try:
        r = requests.post(f"{API_BASE}/{path}", data=data, timeout=timeout)
        return r.json()
    except Exception as e:
        return {"error": str(e)}


# ─── Quick account scan ──────────────────────────────────────
def scan_account(access_token, act_id):
    """Single account quick scan - returns summary dict."""
    ins = api_get(
        access_token,
        f"{act_id}/insights",
        {
            "fields": "spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type",
            "date_preset": "today",
        },
    )
    d = ins.get("data", [{}])[0] if ins.get("data") else {}

    purchases = sum(
        int(a["value"])
        for a in d.get("actions", [])
        if "purchase" in a.get("action_type", "").lower()
    )

    return {
        "spend": float(d.get("spend", 0)),
        "impressions": int(float(d.get("impressions", 0))),
        "clicks": int(float(d.get("clicks", 0))),
        "ctr": float(d.get("ctr", 0)),
        "cpc": float(d.get("cpc", 0)),
        "cpm": float(d.get("cpm", 0)),
        "purchases": purchases,
    }


def get_active_campaigns(access_token, act_id):
    """Get all ACTIVE campaigns for an account."""
    camps = api_get(
        access_token,
        f"{act_id}/campaigns",
        {"fields": "id,name,status,daily_budget", "limit": 50},
    )
    if "error" in camps:
        return []
    return [c for c in camps.get("data", []) if c.get("status") == "ACTIVE"]


def get_campaign_insights(access_token, camp_id):
    """Get today's insights for a specific campaign."""
    ins = api_get(
        access_token,
        f"{camp_id}/insights",
        {
            "fields": "spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type",
            "date_preset": "today",
        },
    )
    d = ins.get("data", [{}])[0] if ins.get("data") else {}

    purchases = sum(
        int(a["value"])
        for a in d.get("actions", [])
        if "purchase" in a.get("action_type", "").lower()
    )
    cpr = next(
        (
            float(x["value"])
            for x in d.get("cost_per_action_type", [])
            if "purchase" in x.get("action_type", "").lower()
        ),
        None,
    )

    return {
        "spend": float(d.get("spend", 0)),
        "impressions": int(float(d.get("impressions", 0))),
        "clicks": int(float(d.get("clicks", 0))),
        "ctr": float(d.get("ctr", 0)),
        "cpc": float(d.get("cpc", 0)),
        "purchases": purchases,
        "cpr": cpr,
    }


print(f"meta_shared.py ready")
