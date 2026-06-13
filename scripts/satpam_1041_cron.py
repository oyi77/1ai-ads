#!/usr/bin/env python3
import json, time, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

WIB = timezone(timedelta(hours=7))
API_BASE = "https://graph.facebook.com/v22.0"
ACCOUNT = "380721031313330"
ENV = "/home/openclaw/projects/1ai-ads/.env"
DELAY = 0.5

# Load token safely — Python open+readline as required
token = ""
with open(ENV, "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("META_ACCESS_TOKEN="):
            token = line.split("=", 1)[1].strip()
            break
if not token:
    raise SystemExit("ERROR: META_ACCESS_TOKEN not found in .env")

# Meta API wrappers with rate_limit delay
def meta_get(path, params=None):
    q = {"access_token": token}
    if params:
        q.update(params)
    url = API_BASE + "/" + path + "?" + urllib.parse.urlencode(q, doseq=False)
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", "ignore")[:1000]
        except Exception:
            pass
        raise RuntimeError("HTTP %s for %s: %s" % (e.code, path, body)) from e

def rate_sleep():
    time.sleep(DELAY)

# Step 1: fetch campaigns
print("Fetching campaigns...", flush=True)
rate_sleep()
camps = meta_get(ACCOUNT + "/campaigns", {
    "fields": "id,name,status",
    "limit": "200"
}).get("data", [])
print("total campaigns: %d" % len(camps), flush=True)

now_wib = datetime.now(WIB)
since = (now_wib - timedelta(days=7)).strftime("%Y-%m-%d")
until = now_wib.strftime("%Y-%m-%d")

# Step 1b: fetch insights 7 days
print("Fetching 7d insights...", flush=True)
insights = []
page_token = None
while True:
    params = {
        "time_range": json.dumps({"since": since, "until": until}),
        "level": "campaign",
        "limit": 200,
        "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions"
    }
    if page_token:
        params["after"] = page_token
    rate_sleep()
    chunk = meta_get(ACCOUNT + "/insights", params)
    insights.extend(chunk.get("data", []))
    page = chunk.get("paging", {})
    nxt = page.get("next", "")
    if not nxt:
        break
    try:
        from urllib.parse import urlparse, parse_qs
        page_token = parse_qs(urlparse(nxt).query).get("after", [None])[0]
    except Exception:
        page_token = None
print("insights rows: %d" % len(insights), flush=True)

# Map insight by campaign id
by_cam = {}
for row in insights:
    cid = row["campaign_id"]
    by_cam[cid] = {
        "name": row.get("campaign_name", ""),
        "spend": float(row.get("spend", 0) or 0),
        "cpc": float(row.get("cpc", 0) or 0),
        "clicks": int(row.get("clicks", 0) or 0),
        "ctr": float(row.get("ctr", 0) or 0),
        "impr": int(row.get("impressions", 0) or 0)
    }

# Active candidates (ACTIVE and not already OFF_/DEAD_)
actives = [c for c in camps if c["status"] == "ACTIVE" and not c["name"].startswith(("OFF_", "DEAD_"))]

# Step 2: Global CPC for active campaigns only
total_spend = 0.0
total_clicks = 0
for c in actives:
    inf = by_cam.get(c["id"], {})
    total_spend += inf.get("spend", 0.0)
    total_clicks += inf.get("clicks", 0)
global_cpc = (total_spend / total_clicks) if total_clicks > 0 else float("inf")
print("Global CPC: Rp%.0f (spend Rp%.0f, clicks %d)" % (global_cpc, total_spend, total_clicks), flush=True)

# Collect decisions
monster_list = []
watch_list = []
winner_list = []
scale_list = []

for c in actives:
    cid = c["id"]
    name = c["name"]
    inf = by_cam.get(cid, {})
    spend = inf.get("spend", 0.0)
    cpc = inf.get("cpc", 0.0)
    clicks = inf.get("clicks", 0)
    ctr = inf.get("ctr", 0.0)
    impr = inf.get("impr", 0)

    # MONSTER: always apply regardless of global gate
    if cpc >= 1000 and spend > 500:
        monster_list.append({"id": cid, "name": name, "cpc": cpc, "spend": spend})
    elif cpc >= 500 and spend > 2000:
        monster_list.append({"id": cid, "name": name, "cpc": cpc, "spend": spend})
    else:
        # CPC > 200 cases
        if cpc > 200 and clicks == 0 and spend > 500:
            watch_list.append({"id": cid, "name": name, "cpc": cpc, "spend": spend, "type": "PAUSE"})
        elif cpc > 200 and clicks > 0:
            watch_list.append({"id": cid, "name": name, "cpc": cpc, "spend": spend, "type": "WATCH"})
        else:
            # Winner: only if global CPC < 120
            if global_cpc < 120 and cpc < 120 and clicks > 5 and spend > 10000:
                winner_list.append({"id": cid, "name": name, "cpc": cpc, "spend": spend, "clicks": clicks})

# LC scale
for c in actives:
    cid = c["id"]
    name = c["name"]
    if "LC" not in name.upper():
        continue
    if any(x["id"] == cid for x in monster_list + watch_list + winner_list):
        continue
    inf = by_cam.get(cid, {})
    cpc = inf.get("cpc", 0.0)
    clicks = inf.get("clicks", 0)
    if cpc < 120 and clicks > 0:
        scale_list.append({"id": cid, "name": name, "cpc": cpc, "clicks": clicks})

# Execute mutations with rate limit
mutations = []
for m in monster_list:
    try:
        rate_sleep()
        print("PAUSE campaign %s" % m["name"], flush=True)
        meta_post(m["id"], {"status": "PAUSED"})
        rate_sleep()
        new_name = m["name"] if m["name"].startswith("OFF_") else "OFF_" + m["name"]
        print("RENAME %s -> %s" % (m["name"], new_name), flush=True)
        meta_post(m["id"], {"name": new_name})
        rate_sleep()
        mutations.append("💀 OFF_+PAUSE: %s (CPC %d, spend %d)" % (m["name"], m["cpc"], m["spend"]))
    except Exception as e:
        mutations.append("ERROR monster %s: %s" % (m["name"], e))
for w in watch_list:
    try:
        if w.get("type") == "PAUSE":
            rate_sleep()
            print("PAUSE campaign %s" % w["name"], flush=True)
            meta_post(w["id"], {"status": "PAUSED"})
            rate_sleep()
            mutations.append("👀 PAUSE: %s (CPC %d, spend %d)" % (w["name"], w["cpc"], w["spend"]))
        else:
            mutations.append("👀 WATCH: %s (CPC %d, spend %d)" % (w["name"], w["cpc"], w["spend"]))
    except Exception as e:
        mutations.append("ERROR watch %s: %s" % (w["name"], e))
for w in winner_list:
    try:
        rate_sleep()
        new_name = "\U0001f31f_" + w["name"]
        print("RENAME winner %s -> %s" % (w["name"], new_name), flush=True)
        meta_post(w["id"], {"name": new_name})
        rate_sleep()
        mutations.append("🌟 WINNER: %s (CPC %d, spend %d, clicks %d)" % (w["name"], w["cpc"], w["spend"], w["clicks"]))
    except Exception as e:
        mutations.append("ERROR star %s: %s" % (w["name"], e))
for s in scale_list:
    mutations.append("💰 LC_SCALE: %s (CPC %d, clicks %d) — +20%% pending" % (s["name"], s["cpc"], s["clicks"]))

# Final listing
rate_sleep()
final_camps = meta_get(ACCOUNT + "/campaigns", {
    "fields": "id,name,status",
    "limit": 200
}).get("data", [])
active_final = sum(1 for c in final_camps if c["status"] == "ACTIVE" and not c["name"].startswith(("OFF_", "DEAD_")))
off_final = sum(1 for c in final_camps if c["name"].startswith("OFF_"))
star_final = sum(1 for c in final_camps if c["name"].startswith("\U0001f31f"))

ts = now_wib.strftime("%Y-%m-%d %H:%M WIB")

print("", flush=True)
print("=" * 60, flush=True)
print("🛡️ SATPAM 1041 %s" % ts, flush=True)
print("=" * 60, flush=True)
print("ACTIVE:%d | OFF_:%d | 🌟:%d" % (active_final, off_final, star_final), flush=True)
print("Global CPC:Rp%.0f" % global_cpc, flush=True)
print("💀 MONSTER: " + (", ".join(["%s (CPC %d)" % (m["name"], m["cpc"]) for m in monster_list]) or "-"), flush=True)
print("👀 WATCH: " + (", ".join(["%s (CPC %d)" % (m["name"], m["cpc"]) for m in watch_list]) or "-"), flush=True)
print("🌟: " + (", ".join(["%s" % (m["name"]) for m in winner_list]) or "-"), flush=True)
print("💰 LC: " + (", ".join(["%s" % (m["name"]) for m in scale_list]) or "-"), flush=True)
print("\nTINDAKAN:", flush=True)
for a in mutations:
    print("  %s" % a, flush=True)
