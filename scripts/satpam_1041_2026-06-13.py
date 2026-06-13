import urllib.request, urllib.parse, json, datetime, sys
from time import sleep

API = "https://graph.facebook.com/v22.0"
ACT = "act_380721031313330"
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"

for line in open(ENV_PATH).read().splitlines():
    if not line or line.startswith("#"):
        continue
    if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
        token = line.split("=", 1)[1].strip()
        break
else:
    raise RuntimeError("META_ACCESS_TOKEN not found")

def fb_get(endpoint, params=None):
    if not endpoint.startswith("act_") and not endpoint.startswith("http"):
        endpoint = f"{ACT}/{endpoint}"
    qs = f"?access_token={urllib.parse.quote(token)}"
    if params:
        qs += "&" + urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{API}/{endpoint}{qs}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

# Account-level insights today
acc_ins = fb_get("insights", {
    "time_range": json.dumps({"since": str(datetime.date.today()), "until": str(datetime.date.today())}),
    "level": "account",
    "fields": "spend,clicks,cpc"
})
acc = acc_ins["data"][0]
global_spend = float(acc["spend"])
global_clicks = float(acc["clicks"]) if float(acc["clicks"]) > 0 else 0.0
global_cpc = float(acc["cpc"]) if "cpc" in acc and float(acc["cpc"]) > 0 else (global_spend / global_clicks if global_clicks > 0 else 0.0)

mode = "AMAN" if global_cpc < 120 else "WASPADA"

# Campaign insights
ins = fb_get("insights", {
    "time_range": json.dumps({"since": str(datetime.date.today()), "until": str(datetime.date.today())}),
    "level": "campaign",
    "fields": "campaign_id,campaign_name,spend,cpc,clicks,impressions,ctr",
    "limit": "200"
})
rows = ins.get("data", [])

# Fetch campaigns for status mapping
camps = fb_get("campaigns", {"fields": "id,name,status", "limit": "200"})
camp_map = {c["id"]: c for c in camps["data"]}

# LC scale targets: name contains "LC" case-insensitive, active, not OFF/DEAD, cpc < 120, clicks > 0
lc_targets = []
for row in rows:
    name = row.get("campaign_name", "")
    cid = row.get("campaign_id")
    status = (camp_map.get(cid) or {}).get("status")
    if not status or status != "ACTIVE":
        continue
    if name.upper().startswith("OFF_") or name.upper().startswith("DEAD_"):
        continue
    cpc = float(row.get("cpc") or 0)
    clicks = float(row.get("clicks") or 0)
    if "LC" in name.upper() and cpc < 120 and clicks > 0:
        lc_targets.append(row)

# Scale +20% up to max 50000; daily_budget in api params is not from insights, fetch adset/campaign budget separately.
# Build budget map from campaigns list: daily_budget or default. Note budget might be campaign-level or adset-level.
FB_BASE = f"{API}/{ACT}"
def _q(**kw):
    return urllib.parse.urlencode(kw)

def rename_campaign(cid, new_name):
    data = _q(name=new_name, access_token=token).encode()
    req = urllib.request.Request(f"{FB_BASE}/{cid}", data=data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def update_campaign_budget(cid, new_budget):
    data = _q(daily_budget=new_budget, access_token=token).encode()
    req = urllib.request.Request(f"{FB_BASE}/{cid}", data=data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def pause_campaign(cid):
    data = _q(status="PAUSED", access_token=token).encode()
    req = urllib.request.Request(f"{FB_BASE}/{cid}", data=data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

scaled = []
for row in lc_targets:
    cid = row["campaign_id"]
    cpc = float(row.get("cpc") or 0)
    clicks = float(row.get("clicks") or 0)
    spend = float(row.get("spend") or 0)
    # Determine current budget
    info = camp_map.get(cid, {})
    budget_raw = info.get("daily_budget")
    cur_budget = None
    if budget_raw:
        try:
            cur_budget = float(budget_raw)
        except Exception:
            cur_budget = None
    # Fallback: use spend as weak proxy not good; skip if no budget
    if cur_budget is None:
        continue
    new_budget = int(min(cur_budget * 1.2, 50000))
    new_budget = max(new_budget, cur_budget)
    if new_budget <= cur_budget:
        continue
    try:
        update_campaign_budget(cid, str(new_budget))
        scaled.append({"name": row["campaign_name"], "old": int(cur_budget), "new": new_budget, "cpc": cpc, "clicks": clicks, "spend": int(spend)})
    except Exception as e:
        print("budget update failed", cid, e)
    sleep(1.5)

# Classification for report
monster, watch, winners = [], [], []
for c in camps["data"]:
    if c["status"] != "ACTIVE":
        continue
    name = c["name"]
    if name.startswith("OFF_") or name.startswith("DEAD_"):
        continue
    cid = c["id"]
    ins_row = next((r for r in rows if r.get("campaign_id") == cid), {})
    spend = float(ins_row.get("spend") or 0)
    cpc = float(ins_row.get("cpc") or 0)
    clicks = float(ins_row.get("clicks") or 0)
    if cpc >= 500 and spend > 1000:
        monster.append({"name": name, "cpc": cpc, "spend": int(spend)})
    if cpc > 200 and clicks == 0 and spend > 500:
        watch.append({"name": name, "cpc": cpc, "spend": int(spend)})
    if cpc < 120 and clicks > 5 and spend > 10000:
        winners.append({"name": name, "cpc": cpc, "spend": int(spend), "clicks": int(clicks)})

now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
mode_label = "AMAN" if mode == "AMAN" else "WASPADA"
print(f"🛡️ SATPAM 1041 {now}")
print(f"ACTIVE:{len([c for c in camps['data'] if c['status']=='ACTIVE'])} | Global CPC:Rp{int(global_cpc)} | Mode:{mode_label}")
print(f"💀 MONSTER: {', '.join(x['name'] for x in monster) if monster else 'none'}")
print(f"👀 WATCH: {', '.join(x['name'] for x in watch) if watch else 'none'}")
print("🌟 WINNER: " + ", ".join("%s (Rp%.0f)" % (x["name"], x["cpc"]) for x in winners))
print(f"💰 LC SCALE: {len(scaled)} naik budget")