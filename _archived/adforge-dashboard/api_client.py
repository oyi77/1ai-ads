"""
AdForge Dashboard — Full Integration
Connects Flask UI to Node.js API for live campaign/meta data
"""

ADFORGE_API = "http://127.0.0.1:3001"
ADFORGE_USER = "admin"
ADFORGE_PASS = "admin123"

import requests
import json

def auth_token():
    """Get auth token from AdForge API."""
    try:
        r = requests.post(f"{ADFORGE_API}/api/auth/login", json={
            "username": ADFORGE_USER, "password": ADFORGE_PASS
        }, timeout=5)
        data = r.json()
        if data.get("success") and data.get("token"):
            return data["token"]
    except Exception as e:
        print(f"[api] Auth failed: {e}")
    return None

def api_get(path):
    """GET request to AdForge API with auth."""
    token = auth_token()
    if not token:
        return {"error": "auth_failed"}
    try:
        r = requests.get(f"{ADFORGE_API}{path}", headers={
            "Authorization": f"Bearer {token}"
        }, timeout=10)
        return r.json()
    except Exception as e:
        return {"error": str(e)}

def get_campaigns():
    """Get all campaigns from AdForge."""
    return api_get("/api/campaigns")

def get_platforms():
    """Get platform accounts."""
    return api_get("/api/platforms")

def get_stats():
    """Get dashboard stats."""
    campaigns = get_campaigns()
    platforms = get_platforms()
    return {
        "total_campaigns": campaigns.get("total", 0) if isinstance(campaigns, dict) else 0,
        "total_platforms": len(platforms.get("data", [])) if isinstance(platforms, dict) else 0,
        "campaigns": campaigns.get("data", []) if isinstance(campaigns, dict) else [],
    }

if __name__ == "__main__":
    print("=== AdForge API Integration Test ===")
    token = auth_token()
    print(f"Auth token: {'✅' if token else '❌'}")
    if token:
        stats = get_stats()
        print(f"Campaigns: {stats['total_campaigns']}")
        print(f"Platforms: {stats['total_platforms']}")
