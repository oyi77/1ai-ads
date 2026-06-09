#!/usr/bin/env python3
"""🔥 GLOWSCENT AGGRESSIVE TAKEOVER — Jam 02:54 WIB, action NOW!"""
import json, urllib.request, urllib.parse, os, sys
from pathlib import Path

WORKSPACE = Path(__file__).parent.parent
TOKEN_FILE = Path("/tmp/fb_token.txt")

def load_token():
    if TOKEN_FILE.exists():
        t = TOKEN_FILE.read_text().strip()
        if t: return t
    env_file = WORKSPACE / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("META_ACCESS_TOKEN="):
                t = line.split("=", 1)[1].strip()
                if t: return t
    return None

TOKEN = load_token()
if not TOKEN:
    print("❌ NO TOKEN!")
    sys.exit(1)

API = "https://graph.facebook.com/v22.0"
ACCT = "act_2125021885010866"

def fb_post(endpoint, **params):
    params["access_token"] = TOKEN
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(f"{API}/{endpoint}", data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"error": body[:300]}

def fb_get(endpoint, **params):
    params["access_token"] = TOKEN
    qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    req = urllib.request.Request(f"{API}/{endpoint}?{qs}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:300]}

# ═══════════════════════════════════════════
# ACTION 1: SCALE WINNERS
# ═══════════════════════════════════════════
winners = {
    "120250705444100166": {"name": "GLW681#1 PintuLipatGeser", "current": 100000, "new": 200000},
    "120250258818290166": {"name": "GLW681#2 PintuLipatGeser", "current": 18000,  "new": 100000},
    "120250259268080166": {"name": "TEST Pintulipatgeser",     "current": 20000,  "new": 150000},
}

print("=" * 55)
print("🚀 ACTION 1: SCALE WINNERS — 3x budget!")
print("=" * 55)
for cid, info in winners.items():
    result = fb_post(f"{cid}", daily_budget=info["new"])
    err = result.get("error")
    if err:
        print(f"  ❌ {info['name']}: {err[:100]}")
    else:
        print(f"  ✅ {info['name']:35} Rp{info['current']:,} → Rp{info['new']:,}")

# ═══════════════════════════════════════════
# ACTION 2: KILL BONCOS permanently + rename to OFF_
# ═══════════════════════════════════════════
losers = {
    "120248505306690166": {"name": "ON_CBO_LC_Pintulipatgeser (CPC 155)", "action": "PAUSE", "new_name": "OFF_CBO_LC_Pintulipatgeser_BONCOS"},
    "120250556375080166": {"name": "ON_Hijabcepol (CPC 219, Rp658)",     "action": "PAUSE", "new_name": "OFF_Hijabcepol_LC_TEST_BONCOS"},
}

print(f"\n{'=' * 55}")
print("🔴 ACTION 2: KILL BONCOS")
print("=" * 55)
for cid, info in losers.items():
    result = fb_post(f"{cid}", status="PAUSED")
    err = result.get("error")
    if err:
        print(f"  ❌ {info['name']}: {err[:100]}")
    else:
        print(f"  ✅ {info['name']:45} → PAUSED")
    # Also rename to OFF_ so engine never touches them
    if "new_name" in info:
        rename = fb_post(f"{cid}", name=info["new_name"])
        if rename.get("error"):
            print(f"  ⚠️  Rename failed: {rename['error'][:80]}")
        else:
            print(f"  🔄 Renamed → {info['new_name']}")

# ═══════════════════════════════════════════
# ACTION 3: Verify OFF_ truly paused
# ═══════════════════════════════════════════
print(f"\n{'=' * 55}")
print("📋 ACTION 3: OFF_ CAMPAIGNS AUDIT")
print("=" * 55)
camps = fb_get(f"{ACCT}/campaigns", fields="id,name,status", limit=100)
for c in camps.get("data", []):
    name = c.get("name", "")
    if "OFF_" in name:
        if c.get("status") != "PAUSED":
            fb_post(c["id"], status="PAUSED")
            print(f"  🔴 Force-PAUSED: {name[:45]} (was {c['status']})")
        else:
            print(f"  ✅ OK: {name[:45]}")

# ═══════════════════════════════════════════
# ACTION 4: REPORT FINAL STATE
# ═══════════════════════════════════════════
print(f"\n{'=' * 55}")
print("💰 FINAL BUDGET DISTRIBUTION")
print("=" * 55)
camps2 = fb_get(f"{ACCT}/campaigns", fields="id,name,status,daily_budget", limit=100)
total_budget = 0
for c in camps2.get("data", []):
    s = c.get("status", "?")
    b = int(c.get("daily_budget", 0) or 0)
    total_budget += b
    star = " ⭐" if c["id"] in winners else ""
    print(f"  {s:8} | Rp{b:>7,}/hari | {c.get('name','?')[:50]}{star}")

winner_budget = sum(w["new"] for w in winners.values())
print(f"\n  📊 TOTAL: Rp{total_budget:,}/hari")
print(f"  ⭐ WINNERS: Rp{winner_budget:,}/hari ({winner_budget/total_budget*100:.0f}% dari total)")
print(f"\n🔥 TAKE COMPLETE. Next: engine patch at 04:00 WIB.")
