#!/usr/bin/env python3
"""
PROTOCOL 13 — Circuit Breaker & CPC Kill for 0858 (Kakriput act_435670549443081)
"""
import json, os, sys, urllib.request, urllib.parse
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR / "scripts"))
from vilona_trakpro_engine import ACCESS_TOKEN, API, ACCOUNTS, log

WIB = timedelta(hours=7)
DT = lambda: datetime.utcnow() + WIB
today = DT().strftime("%Y-%m-%d")
CB_STATE = Path("/tmp/0858_cb_state.json")
ACC = ACCOUNTS["0858"]
ACT_ID = ACC["id"]
CAP = 200000
CPC_KILL = 250

def fb_get(endpoint, **params):
    params["access_token"] = ACCESS_TOKEN
    qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    url = f"{API}/{endpoint}?{qs}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

def fb_post(endpoint, **params):
    params["access_token"] = ACCESS_TOKEN
    data = urllib.parse.urlencode(params).encode()
    url = f"{API}/{endpoint}"
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

def get_today_spend():
    try:
        d = fb_get(f"{ACT_ID}/insights",
            fields="spend",
            time_range=json.dumps({"since": today, "until": today}),
            level="account")
        return int(float(d.get("data", [{}])[0].get("spend", 0)))
    except:
        return 0

def save_cb_state(paused_ids):
    CB_STATE.write_text(json.dumps({
        "ts": DT().isoformat(),
        "paused_ids": paused_ids,
    }))

def cb_trip():
    spend = get_today_spend()
    if spend < CAP:
        return None
    camps = fb_get(f"{ACT_ID}/campaigns", fields="id,name,status", limit=200)
    active = [c for c in camps.get("data", []) 
              if c.get("status") == "ACTIVE" and not c["name"].startswith("OFF_")]
    paused = []
    for c in active:
        try:
            fb_post(c["id"], status="PAUSED")
            paused.append(c["id"])
        except:
            pass
    save_cb_state(paused)
    return f"🚨 CB-0858 TRIP: Spend Rp{spend:,} > Rp{CAP:,} | {len(paused)} paused"

def cpc_kill():
    camps = fb_get(f"{ACT_ID}/campaigns", fields="id,name,status", limit=200)
    active = [c for c in camps.get("data", []) 
              if c.get("status") == "ACTIVE" and not c["name"].startswith("OFF_")]
    if not active:
        return []
    since = (DT() - timedelta(days=2)).strftime("%Y-%m-%d")
    insights = fb_get(f"{ACT_ID}/insights",
        fields="campaign_id,campaign_name,spend,clicks,cpc,ctr",
        time_range=json.dumps({"since": since, "until": today}),
        level="campaign", limit=200)
    by_id = {}
    for d in insights.get("data", []):
        by_id[d["campaign_id"]] = {
            "spend": int(float(d.get("spend", 0))),
            "clicks": int(d.get("clicks", 0)),
            "cpc": float(d.get("cpc", 0)),
        }
    killed = []
    for c in active:
        ci = by_id.get(c["id"], {})
        cpc = ci.get("cpc", 0)
        spend = ci.get("spend", 0)
        if cpc > CPC_KILL and spend > 2000:
            try:
                fb_post(c["id"], status="PAUSED")
                killed.append(f"💀 {c['name'][:40]} — CPC Rp{int(cpc)}")
            except:
                pass
    return killed

# MAIN
spend = get_today_spend()
camps = fb_get(f"{ACT_ID}/campaigns", fields="id,name,status", limit=200)
active = [c for c in camps.get("data", []) 
          if c.get("status") == "ACTIVE" and not c["name"].startswith("OFF_")]
paused_non_off = [c for c in camps.get("data", [])
                  if c.get("status") == "PAUSED" and not c["name"].startswith("OFF_")]
off_count = sum(1 for c in camps.get("data", []) if c["name"].startswith("OFF_"))

trip_msg = cb_trip()
if trip_msg:
    print(trip_msg)
else:
    killed = cpc_kill()
    total_camps = len(camps.get("data", []))
    msg = f"🛡️ 0858 — {DT().strftime('%H:%M')} | ACTIVE:{len(active)} PAUSED:{len(paused_non_off)} OFF:{off_count}/{total_camps} | Spend:Rp{spend:,}/{CAP:,}"
    if killed:
        msg += f" | KILLS:{len(killed)}"
    print(msg)
