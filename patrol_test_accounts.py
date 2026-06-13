#!/usr/bin/env python3
"""
TEST SATPAM — 1134 Selow (act_1773760133153789) + 681 Glowscent (act_2125021885010866)
Reports only, no auto-pause in testing. Hard cap Rp 20rb.
"""
import json, sys, urllib.request, urllib.parse
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR / "scripts"))
from vilona_trakpro_engine import ACCESS_TOKEN, API

WIB = timedelta(hours=7)
DT = lambda: datetime.utcnow() + WIB
today = DT().strftime("%Y-%m-%d")

ACCOUNTS = {
    "1134": {"id": "act_1773760133153789", "name": "Selow", "cap": 20000},
    "681": {"id": "act_2125021885010866", "name": "Glowscent", "cap": 20000},
}

def fb_get(endpoint, **params):
    params["access_token"] = ACCESS_TOKEN
    qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    url = f"{API}/{endpoint}?{qs}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

for key, acc in ACCOUNTS.items():
    title = f"🧪 SATPAM {key} ({acc['name']})"
    try:
        camps = fb_get(f"{acc['id']}/campaigns", fields="id,name,status", limit=100)
        cd = camps.get("data", [])
        active = [c for c in cd if c.get("status") == "ACTIVE" and not c["name"].startswith("OFF_")]
        paused = [c for c in cd if c.get("status") == "PAUSED" and not c["name"].startswith("OFF_")]

        try:
            since = (DT() - timedelta(days=7)).strftime("%Y-%m-%d")
            ins = fb_get(f"{acc['id']}/insights",
                fields="spend,clicks,cpc",
                time_range=json.dumps({"since": since, "until": today}),
                level="account")
            d = ins.get("data", [{}])[0]
            spend = int(float(d.get("spend", 0)))
            clicks = int(d.get("clicks", 0))
            cpc = int(float(d.get("cpc", 0)))
        except:
            spend = clicks = cpc = 0

        print(f"{title} — {DT().strftime('%H:%M')} | ACTIVE:{len(active)} PAUSED:{len(paused)} | 7D Spend:Rp{spend:,} Clicks:{clicks} CPC:Rp{cpc}")
    except Exception as e:
        print(f"{title} — ERROR: {e}")
