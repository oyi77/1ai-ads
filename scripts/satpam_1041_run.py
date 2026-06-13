#!/usr/bin/env python3
"""SATPAM 1041 — 5-minute patrol for act_380721031313330"""
import json, os, sys, time, urllib.request, urllib.parse
from pathlib import Path
from datetime import datetime, timezone, timedelta

WIB = timezone(timedelta(hours=7))
API = "https://graph.facebook.com/v22.0"
ACT = "act_380721031313330"

# Token: prefer /tmp/fb_token.txt (direct file read), then env
TOKEN_FILE = Path("/tmp/fb_token.txt")
token = None
if TOKEN_FILE.exists():
    token = TOKEN_FILE.read_text().strip()
if not token:
    token = os.getenv("META_ACCESS_TOKEN") or os.getenv("ACCESS_TOKEN")
if not token:
    print("ERROR: No Meta token available")
    sys.exit(2)

def fb_get(endpoint, **params):
    params["access_token"] = token
    qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
    url = f"{API}/{endpoint}?{qs}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def fb_post(endpoint, **params):
    params["access_token"] = token
    data = urllib.parse.urlencode(params).encode()
    url = f"{API}/{endpoint}"
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

# ── Fetch campaigns ─────────────────────────────────────────────────────
camp_params = "fields=id,name,status&limit=200"
camp_url = f"{API}/{ACT}/campaigns?{camp_params}&access_token={token}"
with urllib.request.urlopen(urllib.request.Request(camp_url), timeout=20) as resp:
    camp_data = json.loads(resp.read())

campaigns = camp_data.get("data", [])
# handle paging if needed
while camp_data.get("paging", {}).get("next"):
    time.sleep(0.5)
    with urllib.request.urlopen(urllib.request.Request(camp_data["paging"]["next"]), timeout=20) as resp:
        camp_data = json.loads(resp.read())
    campaigns.extend(camp_data.get("data", []))

# ── Fetch insights 7h? skill says 7-day ────────────────────────────────
# time_range=last_7d
insights_url = (
    f"{API}/{ACT}/insights?"
    f"fields=campaign_id,campaign_name,spend,clicks,cpc,ctr"
    f"&time_range={{'since':'{(datetime.now(WIB)-timedelta(days=7)).strftime('%Y-%m-%d')}','until':'{datetime.now(WIB).strftime('%Y-%m-%d')}'}}"
    f"&level=campaign&access_token={token}"
)
with urllib.request.urlopen(urllib.request.Request(insights_url), timeout=20) as resp:
    ins_data = json.loads(resp.read())

insights_raw = ins_data.get("data", [])
while ins_data.get("paging", {}).get("next"):
    time.sleep(0.5)
    with urllib.request.urlopen(urllib.request.Request(ins_data["paging"]["next"]), timeout=20) as resp:
        ins_data = json.loads(resp.read())
    insights_raw.extend(ins_data.get("data", []))

# Build indexed insights by campaign_id
insights = {r["campaign_id"]: r for r in insights_raw}

# ── Compute global CPC ─────────────────────────────────────────────────
total_spend = 0.0
total_clicks = 0
for c in campaigns:
    i = insights.get(c["id"], {})
    try:
        total_spend += float(i.get("spend", "0") or "0")
    except Exception:
        pass
    try:
        total_clicks += int(i.get("clicks", "0") or "0")
    except Exception:
        pass

global_cpc = (total_spend / total_clicks) if total_clicks > 0 else 0.0

# Determine mode
if global_cpc <= 80:
    mode = "SAFE"
elif global_cpc <= 120:
    mode = "WATCH"
else:
    mode = "FULL"

# Only process active campaigns
active = [c for c in campaigns if (c.get("status") or "").upper() == "ACTIVE"]
# Also include PAUSED for reporting
paused = [c for c in campaigns if (c.get("status") or "").upper() == "PAUSED"]

monster_list = []
watch_list = []
winner_list = []
scale_list = []
killed_status = []

# Helper to format rupiah
def rp(v):
    try:
        return f"Rp{int(float(v)):,}"
    except Exception:
        return "Rp0"

now_ts = datetime.now(WIB).strftime("%Y-%m-%d %H:%M:%S")

# If global CPC < 120 : keep winners only
run_kill = global_cpc >= 120

for c in active:
    cid = c["id"]
    name = c.get("name", "")
    i = insights.get(cid, {})
    cpc = None
    spend = 0.0
    clicks = 0
    ctr = None
    try:
        cpc = float(i.get("cpc", "0") or "0")
    except Exception:
        cpc = None
    try:
        spend = float(i.get("spend", "0") or "0")
    except Exception:
        spend = 0.0
    try:
        clicks = int(i.get("clicks", "0") or "0")
    except Exception:
        clicks = 0
    try:
        ctr = float(i.get("ctr", "0") or "0")
    except Exception:
        ctr = None

    # ─ MONSTER (always)
    if cpc >= 1000 and spend > 1000:
        new_name = f"OFF_{name}" if not name.startswith("OFF_") else name
        if not name.startswith("OFF_"):
            try:
                fb_post(f"{cid}", name=new_name)
                time.sleep(1.5)
            except Exception as e:
                print(f"ERROR rename monster {cid}: {e}")
        try:
            fb_post(f"{cid}", status="PAUSED")
            time.sleep(1.5)
        except Exception as e:
            print(f"ERROR pause monster {cid}: {e}")
        monster_list.append((cid, name, rp(spend), rp(cpc) if cpc else "N/A"))
        continue

    if cpc >= 500 and spend > 2000:
        new_name = f"OFF_{name}" if not name.startswith("OFF_") else name
        if not name.startswith("OFF_"):
            try:
                fb_post(f"{cid}", name=new_name)
                time.sleep(1.5)
            except Exception as e:
                print(f"ERROR rename monster2 {cid}: {e}")
        try:
            fb_post(f"{cid}", status="PAUSED")
            time.sleep(1.5)
        except Exception as e:
            print(f"ERROR pause monster2 {cid}: {e}")
        monster_list.append((cid, name, rp(spend), rp(cpc) if cpc else "N/A"))
        continue

    # ─ CPC > 200 + 0 clicks + spend > 500 → PAUSE (no OFF_)
    if run_kill and cpc and cpc > 200 and clicks == 0 and spend > 500:
        try:
            fb_post(f"{cid}", status="PAUSED")
            time.sleep(1.5)
        except Exception as e:
            print(f"ERROR pause high-cpc-zero-clicks {cid}: {e}")
        watch_list.append((cid, name, rp(spend), rp(cpc) if cpc else "N/A"))
        continue

    # ─ CPC > 200 + clicks > 0 → WATCH (report only, no pause)
    if run_kill and cpc and cpc > 200 and clicks > 0:
        watch_list.append((cid, name, rp(spend), rp(cpc) if cpc else "N/A"))

    # ─ WINNER (only if global CPC < 120)
    if global_cpc < 120 and cpc and cpc < 120 and clicks > 5 and spend > 10000:
        renamed = False
        if not name.startswith("🌟"):
            try:
                fb_post(f"{cid}", name=f"🌟_{name}")
                time.sleep(1.5)
                renamed = True
            except Exception as e:
                print(f"ERROR rename winner {cid}: {e}")
        winner_list.append((cid, f"{'🌟_' if renamed else ''}{name}", rp(spend), rp(cpc) if cpc else "N/A"))

    # ─ LC SCALE: campaign with "LC" in name, CPC < 120 and clicks > 0 → bump toward cap
    if "LC" in name and cpc is not None and cpc < 120 and clicks > 0:
        try:
            cur = fb_get(cid, fields="daily_budget")
            cur_budget = int(cur.get("daily_budget", 0))
            if cur_budget > 0:
                new_budget = int(cur_budget * 1.20)
                if new_budget < 18000:
                    new_budget = 18000
                if new_budget > 100000:
                    new_budget = 100000
                if new_budget == cur_budget:
                    # already hit cap or floor drift; stabilize quietly
                    continue
                fb_post(cid, daily_budget=str(new_budget))
                time.sleep(1.5)
                scale_list.append((cid, name, rp(cur_budget), rp(new_budget)))
        except Exception as e:
            print(f"ERROR scale LC {cid}: {e}")

# ── Report ─────────────────────────────────────────────────────────────
lines = [
    f"🛡️ SATPAM 1041 {now_ts}",
    f"ACTIVE:{len(active)} | PAUSED:{len(paused)} | Mode:{mode} | Global CPC:Rp{global_cpc:,.0f}",
]
if monster_list:
    lines.append("💀 MONSTER:")
    for cid, name, spend_str, cpc_str in monster_list:
        # trim name to 50 chars
        short = name[:50]
        lines.append(f"  OFF_+PAUSE {short[:35]} | spend {spend_str} | CPC {cpc_str}")
if watch_list:
    lines.append("👀 WATCH:")
    for cid, name, spend_str, cpc_str in watch_list:
        short = name[:50]
        lines.append(f"  {short[:35]} | spend {spend_str} | CPC {cpc_str}")
if winner_list:
    lines.append("🌟 WINNER:")
    for cid, name, spend_str, cpc_str in winner_list:
        short = name[:50]
        lines.append(f"  {short[:35]} | spend {spend_str} | CPC {cpc_str}")
if scale_list:
    lines.append("💰 LC SCALE:")
    for cid, name, old_b, new_b in scale_list:
        short = name[:50]
        lines.append(f"  +20% {short[:35]} | {old_b} → {new_b}")
if not (monster_list or watch_list or winner_list or scale_list):
    lines.append("✨ No actions taken.")

report = "\n".join(lines)
print(report)
