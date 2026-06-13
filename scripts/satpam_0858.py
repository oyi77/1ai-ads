#!/usr/bin/env python3
"""SATPAM 0858 (Kakriput) — engine-backed patrol for cron."""
import json, sys, os, urllib.request, urllib.parse
from datetime import datetime
from pathlib import Path

# Token loader — read from .env file directly by key, no shell sourcing
def load_token():
    env_path = Path("/home/openclaw/projects/1ai-ads/.env")
    for line in env_path.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN not found in .env")

TOKEN = load_token()
print(f"Token loaded: {len(TOKEN)} chars")

# Verify engine is importable
HERE = Path("/home/openclaw/projects/1ai-ads")
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import vilona_trakpro_engine as engine

ACT = "act_435670549443081"
API = "https://graph.facebook.com/v22.0"
OUT = "/tmp/satpam_0858_latest.json"

def fb_get(endpoint, fields=None, limit=None, time_range=None, level=None, filtering=None):
    """Reuse engine's fb_get with current token."""
    params = {"access_token": TOKEN}
    if fields:
        params["fields"] = fields
    if limit:
        params["limit"] = str(limit)
    if time_range:
        params["time_range"] = time_range
    if level:
        params["level"] = level
    if filtering:
        params["filtering"] = filtering
    url = f"{API}/{endpoint}"
    qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    full = f"{url}?{qs}"
    req = urllib.request.Request(full)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())

# Verify account access
print("Verifying account access...")
try:
    acct = fb_get(f"{ACT}", fields="name,id")
    print(f"Account: {acct.get('name')} ({acct.get('id')})")
except Exception as e:
    print(f"ACCOUNT CHECK FAILED: {e}")
    # Save blocker and exit
    out = {
        "timestamp": datetime.now().isoformat(),
        "mode": "BLOCKER",
        "error": f"Account introspection failed: {e}",
        "act": ACT,
    }
    Path(OUT).write_text(json.dumps(out, indent=2))
    sys.exit(2)

# Fetch today's insights for global CPC
print("Fetching today's insights for global CPC...")
today_str = datetime.now().strftime("%Y-%m-%d")
try:
    insights = fb_get(
        f"{ACT}/insights",
        fields="campaign_id,campaign_name,spend,clicks,cpc,ctr,impressions",
        time_range=json.dumps({"since": today_str, "until": today_str}),
        level="campaign",
        limit="200",
    )
    rows = insights.get("data", [])
    print(f"Insights rows today: {len(rows)}")
    
    total_spend = sum(float(r.get("spend", 0) or 0) for r in rows)
    total_clicks = sum(int(r.get("clicks", 0) or 0) for r in rows)
    global_cpc = total_spend / total_clicks if total_clicks > 0 else 0.0
    
    print(f"Global CPC today: Rp{global_cpc:.1f} (spend={total_spend:.0f}, clicks={total_clicks})")
except Exception as e:
    print(f"INSIGHTS FETCH FAILED: {e}")
    out = {
        "timestamp": datetime.now().isoformat(),
        "mode": "BLOCKER",
        "error": f"Insights fetch failed (HTTP 403 possible): {e}",
        "act": ACT,
        "account_name": acct.get("name"),
    }
    Path(OUT).write_text(json.dumps(out, indent=2))
    sys.exit(3)

# Determine mode matching skill criteria
if global_cpc <= 80:
    mode = "AMAN"
elif global_cpc <= 120:
    mode = "WATCH"
else:
    mode = "NORMAL"

print(f"Mode: {mode}")

# Fetch campaigns
print("Fetching campaigns...")
campaigns_data = fb_get(f"{ACT}/campaigns", fields="id,name,status,effective_status,daily_budget", limit="200")
campaigns = campaigns_data.get("data", [])
print(f"Campaigns fetched: {len(campaigns)}")

active_camps = [c for c in campaigns if c.get("status") == "ACTIVE"]
off_camps = [c for c in campaigns if c.get("name", "").startswith("OFF_")]
star_camps = [c for c in campaigns if c.get("name", "").startswith("🌟_")]

print(f"Active: {len(active_camps)} | OFF_: {len(off_camps)} | 🌟: {len(star_camps)}")

# Build insight lookup
insight_map = {}
for r in rows:
    cid = r.get("campaign_id")
    if cid:
        insight_map[cid] = r

# MONSTER hunt (always)
monsters = []
watch_list = []
for c in campaigns:
    cid = c.get("id")
    name = c.get("name", "")
    ins = insight_map.get(cid, {})
    cpc = float(ins.get("cpc", 0) or 0)
    spend = float(ins.get("spend", 0) or 0)
    clicks = int(ins.get("clicks", 0) or 0)
    
    if cpc >= 500 and spend > 1000:
        monsters.append(f"{name} (CPC Rp{cpc:.0f}, spend Rp{spend:.0f})")
    elif cpc > 200 and clicks == 0 and spend > 500:
        watch_list.append(f"{name} (CPC Rp{cpc:.0f}, spend Rp{spend:.0f})")

# Winner scan + LC scale (AMAN mode: report only)
winners = []
lc_eligible = []
auto_unpause_candidates = []

for c in campaigns:
    cid = c.get("id")
    name = c.get("name", "")
    status = c.get("status", "")
    ins = insight_map.get(cid, {})
    cpc = float(ins.get("cpc", 0) or 0)
    clicks = int(ins.get("clicks", 0) or 0)
    spend = float(ins.get("spend", 0) or 0)
    
    if "LC" in name.upper() and cpc < 120 and spend < 20000 and spend > 0 and clicks > 0:
        lc_eligible.append(name)
    
    if cpc < 120 and clicks > 3 and spend > 2000 and status == "PAUSED" and not name.startswith("OFF_"):
        auto_unpause_candidates.append(name)
    
    if cpc < 120 and clicks > 5 and spend > 10000:
        winners.append(name)

# Count renamed today (look for 🌟_ prefix in active campaigns)
renamed_today = sum(1 for c in campaigns if c.get("name", "").startswith("🌟_"))

report = {
    "timestamp": datetime.now().isoformat(),
    "act": ACT,
    "account_name": acct.get("name"),
    "mode": mode,
    "global_cpc": round(global_cpc, 1),
    "active": len(active_camps),
    "off": len(off_camps),
    "star": len(star_camps),
    "monsters": monsters,
    "watch": watch_list,
    "winners": winners,
    "winners_count": len(winners),
    "renamed_today": renamed_today,
    "lc_eligible": lc_eligible,
    "lc_eligible_count": len(lc_eligible),
    "auto_unpause_candidates": auto_unpause_candidates,
    "auto_unpause_count": len(auto_unpause_candidates),
    "total_campaigns": len(campaigns),
    "spend_today": round(total_spend, 0),
    "clicks_today": total_clicks,
}

Path(OUT).write_text(json.dumps(out := report, indent=2, ensure_ascii=False))

# Print report in requested format
print("\n" + "="*60)
print(f"🛡️ SATPAM 0858 {datetime.now().strftime('%Y-%m-%d %H:%M')}")
print(f"ACTIVE:{len(active_camps)} | OFF_:{len(off_camps)} | 🌟:{len(star_camps)} | Global CPC:Rp{global_cpc:.0f} | Mode:{mode}")
print(f"💀 MONSTER: {len(monsters)}")
for m in monsters[:10]:
    print(f"   {m}")
print(f"👀 WATCH: {len(watch_list)}")
for w in watch_list[:10]:
    print(f"   {w}")
print(f"🌟 WINNER: {len(winners)} renamed:{renamed_today}")
for w in winners[:10]:
    print(f"   {w}")
print(f"✅ AUTO-ON: {len(auto_unpause_candidates)}")
for a in auto_unpause_candidates[:10]:
    print(f"   {a}")
print(f"💰 LC eligible: {len(lc_eligible)}")
for l in lc_eligible[:10]:
    print(f"   {l}")
print(f"⚠️ Meta rules: (not checked this run)")
print("="*60)
print(f"\nReport saved to {OUT}")
