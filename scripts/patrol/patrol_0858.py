#!/usr/bin/env python3
"""
PROTOCOL 13 — Circuit Breaker & CPC Kill for 0858 (Kakriput act_435670549443081)
"""
import json, os, sys, urllib.request, urllib.parse
from datetime import datetime, timedelta

# Import from project — cron runs with workdir set
PROJECT = os.path.expanduser('~/projects/1ai-ads')
sys.path.insert(0, os.path.join(PROJECT, 'scripts'))
from vilona_trakpro_engine import ACCESS_TOKEN, API, ACCOUNTS, log

WIB = timedelta(hours=7)
DT = lambda: datetime.utcnow() + WIB
today = DT().strftime("%Y-%m-%d")
CB_STATE = os.path.join('/tmp', '0858_cb_state.json')
ACC = ACCOUNTS["0858"]
ACT_ID = ACC["id"]
CAP = 200000
CPC_KILL = 120  # SOP: CPC > 120 → kill

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
        data = d.get("data", [])
        if not data:
            return 0  # No active campaigns = no spend = 0
        return int(float(data[0].get("spend", 0)))
    except Exception as e:
        print(f"⚠️ get_today_spend FAILED: {e}")
        return -1  # -1 = unknown, not 0

def save_cb_state(paused_ids):
    with open(CB_STATE, 'w') as f:
        json.dump({"ts": DT().isoformat(), "paused_ids": paused_ids}, f)

def cb_trip(spend):
    """CB trip — uses spend from MAIN to avoid double-fetch race condition."""
    if spend < 0:
        return "⚠️ CB-0858: Spend UNKNOWN — API error, skip CB this cycle"
    if spend < CAP:
        return None
    camps = fb_get(f"{ACT_ID}/campaigns", fields="id,name,status", limit=200)
    active = [c for c in camps.get("data", []) 
              if c.get("status") == "ACTIVE" and not c["name"].startswith("OFF_")]
    paused = []
    errors = []
    for c in active:
        try:
            resp = fb_post(c["id"], status="PAUSED")
            paused.append(c["id"])
        except Exception as e:
            errors.append(f"{c['id']}:{c['name'][:30]} → {e}")
    if not paused and active:
        return f"🚨 CB-0858 TRIP FAILED: Spend Rp{spend:,} > Rp{CAP:,} | 0/{len(active)} paused | ERRORS: {errors[:3]}"
    save_cb_state(paused)
    return f"🚨 CB-0858 TRIP: Spend Rp{spend:,} > Rp{CAP:,} | {len(paused)} paused"

def cpc_kill():
    protected = ACC.get("manual_managed", [])
    camps = fb_get(f"{ACT_ID}/campaigns", fields="id,name,status", limit=200)
    active = [c for c in camps.get("data", []) 
              if c.get("status") == "ACTIVE" and not c["name"].startswith("OFF_")
              and not any(mm in c["name"] for mm in protected)]
    if not active:
        return []
    since = (DT() - timedelta(days=2)).strftime("%Y-%m-%d")
    insights = fb_get(f"{ACT_ID}/insights",
        fields="campaign_id,campaign_name,spend,clicks,cpc,ctr,actions",
        time_range=json.dumps({"since": since, "until": today}),
        level="campaign", limit=200)
    by_id = {}
    for d in insights.get("data", []):
        lc = 0
        for a in d.get("actions", []):
            if a.get("action_type") in ("link_click", "outbound_click"):
                lc += int(float(a.get("value", 0)))
        spend = int(float(d.get("spend", 0)))
        dcpc = int(spend / max(lc, 1)) if lc > 0 else int(float(d.get("cpc", 0)))
        by_id[d["campaign_id"]] = {
            "spend": spend,
            "clicks": int(d.get("clicks", 0)),
            "cpc": float(d.get("cpc", 0)),
            "link_clicks": lc,
            "dcpc": dcpc,
        }
    killed = []
    for c in active:
        ci = by_id.get(c["id"], {})
        dcpc = ci.get("dcpc", ci.get("cpc", 0))
        spend = ci.get("spend", 0)
        if dcpc > CPC_KILL and spend > 2000:
            try:
                fb_post(c["id"], status="PAUSED")
                killed.append(f"💀 {c['name'][:40]} — CPC Rp{int(dcpc)}")
            except Exception as e:
                print(f"⚠️ CPC kill failed: {c['name'][:30]} → {e}")
    return killed

# MAIN — single spend fetch, shared with cb_trip
spend = get_today_spend()
camps = fb_get(f"{ACT_ID}/campaigns", fields="id,name,status", limit=200)
active = [c for c in camps.get("data", []) 
          if c.get("status") == "ACTIVE" and not c["name"].startswith("OFF_")]
paused_non_off = [c for c in camps.get("data", [])
                  if c.get("status") == "PAUSED" and not c["name"].startswith("OFF_")]
off_count = sum(1 for c in camps.get("data", []) if c["name"].startswith("OFF_"))

trip_msg = cb_trip(spend)  # Pass spend — no double fetch!
if trip_msg:
    print(trip_msg)
else:
    killed = cpc_kill()
    total_camps = len(camps.get("data", []))
    msg = f"🛡️ 0858 — {DT().strftime('%H:%M')} | ACTIVE:{len(active)} PAUSED:{len(paused_non_off)} OFF:{off_count}/{total_camps} | Spend:Rp{spend:,}/{CAP:,}"
    if killed:
        msg += f" | KILLS:{len(killed)}"
    print(msg)
