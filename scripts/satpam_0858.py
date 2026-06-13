#!/usr/bin/env python3
"""SATPAM 0858 (Kakriput) — patrol cron for Meta Ads account."""

import json
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta

# === CONFIG ===
ACT_ID = "435670549443081"
API_VER = "v22.0"
API_BASE = f"https://graph.facebook.com/{API_VER}"
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"
OUTPUT_PATH = "/tmp/_sATPAM_0858.txt"

# === TOKEN LOADER (pitfall #56) ===
def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN not found in .env")

TOKEN = load_token()

# === HELPERS ===
def api_get(endpoint, params=None):
    """GET request with token auto-injected."""
    url = f"{API_BASE}/{endpoint}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    url += "&access_token=" + urllib.parse.quote(TOKEN)
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"_http_error": e.code, "_body": body}
    except Exception as e:
        return {"_exception": str(e)}

def api_post(endpoint, data):
    """POST request with token auto-injected."""
    url = f"{API_BASE}/{endpoint}"
    data["access_token"] = TOKEN
    # Serialize nested dicts/lists as JSON strings
    for k in list(data.keys()):
        if isinstance(data[k], (dict, list)):
            data[k] = json.dumps(data[k])
    qs = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=qs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"_http_error": e.code, "_body": body}
    except Exception as e:
        return {"_exception": str(e)}

def pause_campaign(cid):
    return api_post(f"{cid}", {"status": "PAUSED"})

def activate_campaign(cid):
    return api_post(f"{cid}", {"status": "ACTIVE"})

def rename_campaign(cid, new_name):
    return api_post(f"{cid}", {"name": new_name})

# === DATE RANGE ===
today = datetime.now().date()
since = (today - timedelta(days=7)).isoformat()
until = today.isoformat()

# === FETCH CAMPAIGNS ===
campaigns = []
next_url = f"act_{ACT_ID}/campaigns?fields=id,name,status&limit=200"
while next_url:
    result = api_get(next_url)
    if isinstance(result, dict) and "data" in result:
        campaigns.extend(result["data"])
        next_url = result.get("paging", {}).get("next")
        if next_url:
            # Append token to raw next URL (pitfall #69)
            sep = "&" if "?" in next_url else "?"
            next_url = next_url + sep + "access_token=" + urllib.parse.quote(TOKEN)
    else:
        break
    time.sleep(0.6)

# === FETCH INSIGHTS ===
insights = []
next_url = (
    f"act_{ACT_ID}/insights?fields=campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions"
    f"&time_range={{\"since\":\"{since}\",\"until\":\"{until}\"}}"
    f"&level=campaign&limit=200"
)
while next_url:
    result = api_get(next_url)
    if isinstance(result, dict) and "data" in result:
        insights.extend(result["data"])
        next_url = result.get("paging", {}).get("next")
        if next_url:
            sep = "&" if "?" in next_url else "?"
            next_url = next_url + sep + "access_token=" + urllib.parse.quote(TOKEN)
    else:
        break
    time.sleep(0.6)

# === BUILD INSIGHTS MAP ===
ins_map = {}
for row in insights:
    cid = row.get("campaign_id")
    if cid:
        ins_map[cid] = row

# === CAMP MAP ===
camp_map = {c["id"]: c for c in campaigns}

# === GLOBAL CPC ===
total_spend = 0.0
total_clicks = 0
for row in insights:
    try:
        total_spend += float(row.get("spend", 0) or 0)
        total_clicks += int(row.get("clicks", 0) or 0)
    except (ValueError, TypeError):
        pass

global_cpc = total_spend / total_clicks if total_clicks > 0 else 0.0
mode = "AMAN" if global_cpc < 120 else "NORMAL"

# === CLASSIFY ===
monster_list = []
watch_list = []
winner_list = []
auto_on_list = []
lc_list = []

for cid, camp in camp_map.items():
    name = camp.get("name", "")
    status = camp.get("status", "")
    ins = ins_map.get(cid, {})
    cpc = float(ins.get("cpc", 0) or 0)
    clicks = int(ins.get("clicks", 0) or 0)
    spend = float(ins.get("spend", 0) or 0)

    # Skip OFF_ prefix campaigns entirely
    if name.startswith("OFF_"):
        continue

    if status != "ACTIVE":
        continue

    # MONSTER
    if cpc >= 500 and spend > 1000:
        monster_list.append((cid, name, cpc, spend, "CPC>=500+spend>1K"))
    elif cpc > 200 and clicks == 0 and spend > 500:
        monster_list.append((cid, name, cpc, spend, "CPC>200+0clicks+spend>500"))

    # WATCH
    elif cpc > 200 and clicks > 0 and spend > 2000:
        watch_list.append((cid, name, cpc, spend))

    # WINNER
    elif cpc < 120 and clicks > 5 and spend > 10000:
        winner_list.append((cid, name, cpc, spend))

    # LC SCALE (has "LC" in name and CPC < 120)
    if "LC" in name.upper() and cpc < 120 and spend > 0:
        lc_list.append((cid, name, cpc, spend))

# AUTO-ON: PAUSED non-OFF_ + CPC < 200 + clicks > 3 + spend > 2000
for cid, camp in camp_map.items():
    name = camp.get("name", "")
    status = camp.get("status", "")
    if status != "PAUSED" or name.startswith("OFF_"):
        continue
    ins = ins_map.get(cid, {})
    cpc = float(ins.get("cpc", 0) or 0)
    clicks = int(ins.get("clicks", 0) or 0)
    spend = float(ins.get("spend", 0) or 0)
    if cpc < 200 and clicks > 3 and spend > 2000:
        auto_on_list.append((cid, name, cpc, spend))

# === ACTIONS ===
renamed_winners = []
action_count = 0

if mode == "NORMAL":
    # MONSTER: pause + rename OFF_
    for cid, name, cpc, spend, reason in monster_list:
        pause_campaign(cid)
        time.sleep(1.5)
        new_name = f"OFF_{name}"
        rename_campaign(cid, new_name)
        time.sleep(1.5)
        renamed_winners.append(f"OFF_{name}")
        action_count += 2

    # AUTO-ON: activate
    for cid, name, cpc, spend in auto_on_list:
        activate_campaign(cid)
        time.sleep(1.5)
        action_count += 1

# === REPORT ===
lines = []
lines.append(f"🛡️ SATPAM 0858 {datetime.now().strftime('%Y-%m-%d %H:%M')}")
lines.append(f"ACTIVE:{len([c for c in campaigns if c['status']=='ACTIVE'])} | Global CPC:Rp{global_cpc:.0f} | Mode:{mode}")
lines.append(f"💀 MONSTER: {'; '.join([f'{n} (Rp{cpc:.0f})' for _,n,cpc,_,_ in monster_list]) if monster_list else '—'}")
lines.append(f"👀 WATCH: {'; '.join([f'{n} (Rp{cpc:.0f})' for _,n,cpc,_ in watch_list]) if watch_list else '—'}")
lines.append(f"🌟 WINNER: {len(winner_list)} — {'; '.join([n for _,n,_,_ in winner_list]) if winner_list else '—'}")
lines.append(f"✅ AUTO-ON: {len(auto_on_list)}")
lines.append(f"💰 LC: {len(lc_list)}")
lines.append(f"⚠️ Meta rules: 0 — DELETE jika ada PAUSE rules")

report = "\n".join(lines)

with open(OUTPUT_PATH, "w") as f:
    f.write(report)

print(report)
