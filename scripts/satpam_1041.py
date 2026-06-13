import sys
import json
import time
import urllib.parse
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))


def load_token():
    env_path = "/home/openclaw/projects/1ai-ads/.env"
    for line in open(env_path, "r", encoding="utf-8").read().splitlines():
        if not line or line.startswith("#"):
            continue
        key = line.split("=", 1)[0]
        if key == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN not found")


TOKEN = load_token()
API = "https://graph.facebook.com/v22.0"
ACT = "act_380721031313330"
TODAY = "2026-06-13"

import importlib.util
spec = importlib.util.spec_from_file_location("engine", str(HERE / "vilona_trakpro_engine.py"))
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
fb_get = engine.fb_get
fb_post = engine.fb_post

# 1) Account-level insights -> global CPC
acc_ins = fb_get(
    f"{ACT}/insights",
    fields="spend,clicks,cpc",
    time_range=json.dumps({"since": TODAY, "until": TODAY}),
    level="account",
    limit="1",
)
acc_spend = 0.0
acc_clicks = 0
acc_cpc = None
if acc_ins and acc_ins.get("data"):
    row = acc_ins["data"][0]
    acc_spend = float(row.get("spend", 0) or 0)
    acc_clicks = int(row.get("clicks", 0) or 0)
    acc_cpc = row.get("cpc")
    if acc_cpc is not None:
        try:
            acc_cpc = float(acc_cpc)
        except Exception:
            acc_cpc = None

if acc_cpc is None or acc_clicks <= 0:
    global_cpc = 0.0
else:
    global_cpc = acc_spend / acc_clicks

mode = "AMAN" if global_cpc < 120 else "WASPADA"
ts = datetime.now().strftime("%H:%M")

# 2) Campaign list + insights
camp_ins = fb_get(
    f"{ACT}/insights",
    fields="campaign_id,campaign_name,spend,clicks,cpc,ctr",
    time_range=json.dumps({"since": TODAY, "until": TODAY}),
    level="campaign",
    limit="200",
)
ins_map = {}
if camp_ins and camp_ins.get("data"):
    for r in camp_ins["data"]:
        cid = r.get("campaign_id")
        if cid:
            ins_map[cid] = {
                "spend": float(r.get("spend", 0) or 0),
                "clicks": int(r.get("clicks", 0) or 0),
                "cpc": float(r.get("cpc", 0) or 0),
                "ctr": float(r.get("ctr", 0) or 0),
                "name": r.get("campaign_name", ""),
            }

campaigns = fb_get(f"{ACT}/campaigns", fields="id,name,status", limit="200")
active_n = 0
off_n = 0
star_n = 0
monsters = []
watches = []
winners = []
lc_targets = []

if campaigns and campaigns.get("data"):
    for c in campaigns["data"]:
        st = c.get("status", "")
        nm = c.get("name", "")
        if st == "ACTIVE":
            active_n += 1
        if nm.startswith("OFF_"):
            off_n += 1
        if nm.startswith("\u2605_"):
            star_n += 1
        info = ins_map.get(c["id"], {})
        cpc = info.get("cpc", 0)
        spend = info.get("spend", 0)
        clicks = info.get("clicks", 0)
        if mode == "WASPADA":
            if cpc >= 500 and spend > 1000:
                monsters.append((nm, cpc, spend))
            if cpc > 200 and clicks == 0 and spend > 500:
                watches.append((nm, cpc, spend))
        if cpc < 120 and clicks > 5 and spend > 10000:
            winners.append((nm, cpc, spend, clicks))
        if "LC" in nm and cpc < 120 and clicks > 0:
            lc_targets.append((c["id"], nm, spend))

# 3) LC scale +20% up to 50k
lc_scaled = 0
for cid, nm, spend in lc_targets:
    try:
        if spend <= 0:
            continue
        new_budget = min(50000, int(spend * 1.2))
        if new_budget <= spend:
            new_budget = min(50000, spend + 2000)
        if new_budget > 50000:
            new_budget = 50000
        res = fb_post(cid, daily_budget=new_budget, access_token=TOKEN)
        if res is not None:
            lc_scaled += 1
        time.sleep(1.2)
    except Exception as e:
        print(f"LC scale failed {nm}: {e}", file=sys.stderr)

# 4) Report
monster_names = ", ".join([f"{n} (Rp{cpc:.0f}, Rp{spend:.0f})" for n,cpc,spend in monsters]) if monsters else "none"
watch_names = ", ".join([f"{n} (Rp{cpc:.0f}, Rp{spend:.0f})" for n,cpc,spend in watches]) if watches else "none"
winner_names = ", ".join([f"{n} Rp{cpc:.0f} {clicks}kl" for n,cpc,spend,clicks in winners[:10]]) if winners else "none"

report = f"\U0001f6e1\ufe0f SATPAM 1041 {TODAY} {ts}\n"
report += f"ACTIVE:{active_n} | Global CPC:Rp{global_cpc:.0f} | Mode:{mode}\n"
report += f"\U0001f480 MONSTER: {len(monsters)}: {monster_names}\n"
report += f"\U0001f441\ufe0f WATCH: {len(watches)}: {watch_names}\n"
report += f"\u2605\ufe0f WINNER: {len(winners)}: {winner_names}\n"
report += f"\U0001f4b0 LC SCALE: {lc_scaled} naik budget\n"
print(report)
