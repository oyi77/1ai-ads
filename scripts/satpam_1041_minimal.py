import json, time, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

WIB = timezone(timedelta(hours=7))
API = "https://graph.facebook.com/v22.0"
ACT = "380721031313330"
ACT_PREFIX = "act_" + ACT

def tk(path):
    for line in open(path).read().splitlines():
        if line.startswith("META_ACCESS_TOKEN="):
            return line.split("=", 1)[1].strip()
    return ""
token = tk("/home/openclaw/projects/1ai-ads/.env")

def fb_get(endpoint, fields=None, params=None):
    url = "%s/%s" % (API, endpoint)
    q = {"access_token": token}
    if fields:
        q["fields"] = fields
    if params:
        q.update(params)
    req = urllib.request.Request("%s?%s" % (url, urllib.parse.urlencode(q)))
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def fb_post(endpoint, data):
    url = "%s/%s" % (API, endpoint)
    data["access_token"] = token
    for k in list(data.keys()):
        if isinstance(data[k], (list, dict)):
            data[k] = json.dumps(data[k])
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

print("account: %s" % fb_get(ACT_PREFIX, fields="name").get("name"), flush=True)
since = (datetime.now(WIB) - timedelta(days=7)).strftime("%Y-%m-%d")
until = datetime.now(WIB).strftime("%Y-%m-%d")
all_camps = fb_get(ACT_PREFIX + "/campaigns", fields="id,name,status")
print("total campaigns: %d" % len(all_camps.get("data", [])), flush=True)

lands = [c for c in all_camps.get("data", []) if c["status"] == "ACTIVE" and not c["name"].startswith(("OFF_", "DEAD_"))]
offs = [c for c in all_camps.get("data", []) if c["name"].startswith("OFF_")]
stars = [c for c in all_camps.get("data", []) if c["name"].startswith("\U0001f31f_")]
print("ACTIVE: %d | OFF_: %d | \U0001f31f: %d" % (len(lands), len(offs), len(stars)), flush=True)

page_insights = []
params = {
    "time_range": json.dumps({"since": since, "until": until}),
    "level": "campaign",
    "limit": "200",
    "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
}
req = urllib.request.Request("%s/%s/insights?%s" % (API, ACT_PREFIX, urllib.parse.urlencode(params)))
with urllib.request.urlopen(req, timeout=15) as r:
    first = json.loads(r.read())
page_insights.extend(first.get("data", []))
while first.get("paging", {}).get("next"):
    req2 = urllib.request.Request(first["paging"]["next"])
    with urllib.request.urlopen(req2, timeout=15) as r2:
        first = json.loads(r2.read())
    page_insights.extend(first.get("data", []))
print("insights rows: %d" % len(page_insights), flush=True)

insights_map = {}
for row in page_insights:
    cid = row.get("campaign_id")
    if not cid:
        continue
    insights_map[cid] = {
        "name": row.get("campaign_name", ""),
        "spend": float(row.get("spend", 0) or 0),
        "cpc": float(row.get("cpc", 0) or 0),
        "clicks": int(row.get("clicks", 0) or 0),
        "ctr": float(row.get("ctr", 0) or 0),
        "impr": int(row.get("impressions", 0) or 0),
    }

def detect_type(name):
    n = name.upper()
    if any(n.startswith(p) for p in ("CBO", "BC_", "LC_", "TC_", "GLW", "ON_LC_", "ON_BC_", "\U0001f31f")):
        return "CBO"
    if any(n.startswith(p) for p in ("ABO", "TEST", "TESTING", "BIDCAP")):
        return "ABO"
    return "CBO"

kill_list = []
watch_list = []
star_candidates = []
total_spend = 0.0
for c in lands:
    cid, name = c["id"], c["name"]
    inf = insights_map.get(cid, {})
    spend = inf.get("spend", 0)
    cpc = inf.get("cpc", 0)
    clicks = inf.get("clicks", 0)
    ctr = inf.get("ctr", 0)
    impr = inf.get("impr", 0)
    total_spend += spend
    action = None
    reason = ""
    ctype = detect_type(name)
    if cpc > 200 and spend > 2000:
        action = "OFF_"
        reason = "CPC %d > 200, spend %d" % (cpc, spend)
    elif (ctype == "CBO" and cpc > 120) or (ctype == "ABO" and cpc > 250):
        if spend > 5000:
            action = "PAUSE_WATCH"
            reason = "CPC %d > danger (%s), spend %d" % (cpc, ctype, spend)
    if not action and ctr < 1.0 and impr > 1000:
        action = "PAUSE_WATCH"
        reason = "CTR %.2f%% < 1, impr %d" % (ctr, impr)
    if action == "OFF_":
        kill_list.append({"id": cid, "name": name, "spend": spend, "cpc": cpc, "reason": reason})
    elif action == "PAUSE_WATCH":
        watch_list.append({"id": cid, "name": name, "spend": spend, "cpc": cpc, "ctr": ctr, "reason": reason})
    elif not action and not name.startswith("\U0001f31f") and cpc < 120 and spend > 50000 and clicks > 0:
        star_candidates.append({"id": cid, "name": name, "spend": spend, "cpc": cpc, "clicks": clicks})

actions = []
for k in kill_list:
    try:
        fb_post(k["id"], {"status": "PAUSED"})
        time.sleep(1.5)
        new_name = k["name"] if k["name"].startswith("OFF_") else "OFF_" + k["name"]
        fb_post(k["id"], {"name": new_name})
        time.sleep(1)
        actions.append("\U0001f480 OFF_+PAUSE: %s - %s" % (k["name"], k["reason"]))
    except Exception as e:
        actions.append("ERROR killing %s: %s" % (k["name"], e))
for w in watch_list:
    try:
        fb_post(w["id"], {"status": "PAUSED"})
        time.sleep(1.5)
        actions.append("\U0001f440 PAUSE_WATCH: %s - %s" % (w["name"], w["reason"]))
    except Exception as e:
        actions.append("ERROR pausing %s: %s" % (w["name"], e))
for s in star_candidates:
    try:
        fb_post(s["id"], {"name": "\U0001f31f_" + s["name"]})
        time.sleep(1)
        actions.append("\U0001f31f STAR: %s | CPC Rp%d | spend Rp%d | clicks %d" % (s["name"], s["cpc"], s["spend"], s["clicks"]))
    except Exception as e:
        actions.append("ERROR starring %s: %s" % (s["name"], e))

all2 = fb_get(ACT_PREFIX + "/campaigns", fields="id,name,status")
active_count = 0
off_count = 0
star_count = 0
for c in all2.get("data", []):
    n = c["name"]
    if c["status"] == "ACTIVE" and not n.startswith(("OFF_", "DEAD_")):
        active_count += 1
    if n.startswith("OFF_"):
        off_count += 1
    if n.startswith("\U0001f31f_"):
        star_count += 1

print("", flush=True)
print("=" * 60, flush=True)
print("\U0001f6e1\ufe0f SATPAM 1041 - %s" % datetime.now(WIB).strftime("%Y-%m-%d %H:%M WIB"), flush=True)
print("=" * 60, flush=True)
print("ACTIVE: %d | OFF_: %d | \U0001f31f: %d" % (active_count, off_count, star_count), flush=True)
print("\U0001f4b0 Spend 7d: Rp%d" % int(total_spend), flush=True)
print("\nTINDAKAN:", flush=True)
for j in actions:
    print("  %s" % j, flush=True)
if kill_list:
    print("\n\u26a0\ufe0f KILL:", flush=True)
    for k in kill_list:
        print("  \U0001f480 %s | CPC Rp%d | spend Rp%d" % (k["name"], k["cpc"], k["spend"]), flush=True)
if watch_list:
    print("\n\U0001f440 WATCH:", flush=True)
    for w in watch_list:
        print("  \U0001f440 %s | CPC Rp%d | CTR %.1f%% | spend Rp%d" % (w["name"], w["cpc"], w["ctr"], w["spend"]), flush=True)
if star_candidates:
    print("\n\U0001f31f WINNER CANDIDATES:", flush=True)
    for s in star_candidates:
        print("  \U0001f31f %s | CPC Rp%d | spend Rp%d | clicks %d" % (s["name"], s["cpc"], s["spend"], s["clicks"]), flush=True)
