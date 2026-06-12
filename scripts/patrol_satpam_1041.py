#!/usr/bin/env python3
"""SATPAM PATROL 1041 Nyamiresep — cron patrol using engine paths."""
import json
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path

API = "https://graph.facebook.com/v22.0"
ACT_ID = "380721031313330"
ENV_PATH = Path("/home/openclaw/projects/1ai-ads/.env")

def load_token():
    for line in ENV_PATH.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        key = line.split("=", 1)[0]
        if key == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("token missing")

def _meta_path(path):
    if not path.startswith("act_") and "/" in path:
        first = path.split("/", 1)[0]
        if first.isdigit():
            return f"act_{path}"
    return path

def fb_get(path, fields="id,name,status"):
    token = load_token()
    params = {"fields": fields, "access_token": token}
    url = f"{API}/{_meta_path(path)}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "HermesPatrol/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def fb_post(path, data):
    token = load_token()
    data["access_token"] = token
    req = urllib.request.Request(f"{API}/{_meta_path(path)}", data=urllib.parse.urlencode(data).encode(), method="POST", headers={"User-Agent": "HermesPatrol/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def detect_type(name):
    n = name.upper()
    if "TEST" in n or "TESTING" in n:
        return "TEST"
    if n.startswith("ABO") or n.startswith("BIDCAP"):
        return "ABO"
    return "CBO"

def verdict(cpc, spend, camp_type):
    if cpc is None:
        return "UNDEFINED"
    if cpc > 200 and spend > 2000:
        return "KILL"
    if ((camp_type == "CBO" and cpc > 120) or (camp_type != "CBO" and cpc > 250)) and spend > 5000:
        return "WATCH"
    return "SAFE"

now = datetime.now()
since = (now - timedelta(days=7)).strftime("%Y-%m-%d")
until = now.strftime("%Y-%m-%d")
ts = now.strftime("%Y-%m-%d %H:%M:%S")

# 1. Campaign inventory
all_camps=[]; next_url=f"act_{ACT_ID}/campaigns"
while next_url:
    data=fb_get(next_url,"id,name,status")
    all_camps.extend(data.get("data",[]))
    nxt=data.get("paging",{}).get("next")
    next_url=(nxt.split(API+"/",1)[1] if nxt and nxt.startswith(API+"/") else None)
    if next_url: time.sleep(1.5)

active = [c for c in all_camps if c.get("status") == "ACTIVE"]
off = [c for c in all_camps if c.get("name", "").startswith("OFF_")]
stars = [c for c in all_camps if c.get("name", "").startswith("🌟")]
if not active and not off and not stars:
    print("[SILENT]")
    raise SystemExit

# 2. Insights
insights = {}
ids = [c["id"] for c in all_camps]
for i in range(0, len(ids), 20):
    batch = ids[i:i+20]
    filt = json.dumps([{"field": "campaign.id", "operator": "IN", "value": batch}])
    params = {
        "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
        "time_range": json.dumps({"since": since, "until": until}),
        "level": "campaign",
        "filtering": filt,
        "limit": "50",
        "access_token": load_token(),
    }
    url = f"{API}/{ACT_ID}/insights?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "HermesPatrol/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    for row in data.get("data", []):
        cid = row.get("campaign_id")
        if cid:
            insights[cid] = row
    time.sleep(1.5)

kills = []
watches = []
winners = []
actions = []
for c in active:
    cid = c["id"]
    name = c["name"]
    i = insights.get(cid, {})
    spend = float(i.get("spend", 0) or 0)
    cpc_raw = i.get("cpc")
    cpc = float(cpc_raw) if cpc_raw is not None else None
    ctr = float(i.get("ctr", 0) or 0)
    impr = float(i.get("impressions", 0) or 0)
    clicks = float(i.get("clicks", 0) or 0)
    v = verdict(cpc, spend, detect_type(name))
    if v == "KILL":
        kills.append(f"{name} [CPC {cpc:.0f} | Rp{spend:,.0f}]")
        for body in [{"status": "PAUSED"}, {"name": f"OFF_{name}"}]:
            try:
                fb_post(cid, body)
                time.sleep(1.5)
            except Exception as e:
                actions.append(f"ERR {body}: {e}")
        actions.append(f"PAUSE+OFF_: {name}")
    elif v == "WATCH":
        watches.append(f"{name} [CPC {cpc:.0f} | Rp{spend:,.0f}]")
    else:
        if ctr < 1.0 and impr > 1000:
            watches.append(f"{name} [CTR {ctr:.2f}% | impr {int(impr)}]")
        elif cpc is not None and cpc < 120 and spend > 50000 and clicks > 0:
            if not name.startswith("🌟"):
                try:
                    fb_post(cid, {"name": f"🌟_{name}"})
                    time.sleep(1.5)
                    actions.append(f"STAR: {name}")
                except Exception as e:
                    actions.append(f"ERR star {name}: {e}")
            winners.append(f"{name} [CPC {cpc:.0f} | Rp{spend:,.0f}]")

total_spend = sum(float(insights.get(c["id"], {}).get("spend", 0) or 0) for c in active)
lines = [
    f"🛡️ SATPAM 1041 — {ts}",
    f"ACTIVE: {len(active)} | OFF_: {len(off)} | 🌟: {len(stars)}",
]
if kills:
    lines.append(f"⚠️ KILL ({len(kills)}):\n  • " + "\n  • ".join(kills[:20]))
if watches:
    lines.append(f"👀 WATCH ({len(watches)}):\n  • " + "\n  • ".join(watches[:20]))
if winners:
    lines.append(f"🌟 WINNERS ({len(winners)}):\n  • " + "\n  • ".join(winners[:20]))
lines.append(f"💰 Spend 7d: Rp{total_spend:,.0f}")
if actions:
    lines.append("AKSI:\n  • " + "\n  • ".join(actions[:30]))
print("\n".join(lines))
