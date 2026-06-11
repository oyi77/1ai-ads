import json, os, time, urllib.request, urllib.parse, urllib.error

ACT_ID = "2125021885010866"
API = "https://graph.facebook.com/v22.0"

def load_token():
    lines=open("/home/openclaw/projects/1ai-ads/.env").read().splitlines()
    for line in lines:
        if line.startswith("META_ACCESS_TOKEN="):
            return line.split("=",1)[1].strip()
    raise RuntimeError("token not found")

TOKEN=load_token()

def fb_get(endpoint, params=None):
    url = f"{API}/{endpoint}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"_http_err": e.code, "_body": e.read().decode() if e.fp else ""}

def fb_post(endpoint, params):
    url = f"{API}/{endpoint}"
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={"Authorization": f"Bearer {TOKEN}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"_http_err": e.code, "_body": e.read().decode() if e.fp else ""}

def rename_campaign(cid, new_name):
    return fb_post(str(cid), {"name": new_name, "access_token": TOKEN})

def pause_campaign(cid):
    return fb_post(str(cid), {"status": "PAUSED", "access_token": TOKEN})

# 1. Fetch campaigns
all_camps = []
resp = fb_get(f"act_{ACT_ID}/campaigns", {"fields": "id,name,status", "limit": "200"})
if "data" in resp:
    all_camps = resp["data"]
    page = 2
    while resp.get("paging", {}).get("next"):
        time.sleep(1.3)
        next_url = resp["paging"]["next"]
        parsed = urllib.parse.urlparse(next_url)
        qs = urllib.parse.parse_qs(parsed.query)
        qs["access_token"] = [TOKEN]
        new_qs = urllib.parse.urlencode(qs, doseq=True)
        new_url = urllib.parse.urlunparse(parsed._replace(query=new_qs))
        req = urllib.request.Request(new_url, headers={"Authorization": f"Bearer {TOKEN}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                resp = json.loads(r.read())
                all_camps.extend(resp.get("data", []))
                page += 1
        except Exception as e:
            print(f"[WARN] paging error page {page}: {e}")
            break

print(f"Fetched {len(all_camps)} campaigns")

# 2. Fetch insights 7d
camp_ids = [c["id"] for c in all_camps if c["status"] not in ("ARCHIVED", "DELETED")]
insights = {}
for i in range(0, len(camp_ids), 50):
    batch = camp_ids[i:i+50]
    fstr = json.dumps([{"field": "campaign.id", "operator": "IN", "value": batch}])
    resp = fb_get(f"act_{ACT_ID}/insights", {
        "fields": "campaign_id,campaign_name,spend,cpc,ctr,clicks,impressions",
        "time_range": json.dumps({"since": "2026-06-04", "until": "2026-06-11"}),
        "level": "campaign",
        "limit": "200",
        "filtering": fstr
    })
    if "data" in resp:
        for row in resp["data"]:
            insights[row["campaign_id"]] = row
    time.sleep(1.6)

print(f"Fetched insights for {len(insights)} campaigns")

# 3. Classify + act
active_count = sum(1 for c in all_camps if c["status"] == "ACTIVE")
off_count = sum(1 for c in all_camps if c["name"].startswith("OFF_"))
star_count = sum(1 for c in all_camps if c["name"].startswith("🌟_"))

kills = []
watch = []
winners = []
total_spend = 0.0
dry_run = os.getenv("DRY_RUN", "true").lower() in ("true", "1", "yes")

actions_log = []

for c in all_camps:
    cid = c["id"]
    ins = insights.get(cid, {})
    spend = float(ins.get("spend", 0) or 0)
    cpc = float(ins.get("cpc", 0) or 0)
    ctr = float(ins.get("ctr", 0) or 0)
    clicks = int(ins.get("clicks", 0) or 0)
    impr = int(ins.get("impressions", 0) or 0)
    name = c["name"]
    status = c["status"]
    total_spend += spend

    is_off = name.startswith("OFF_")
    is_dead = name.startswith("DEAD_")
    if is_off or is_dead:
        continue

    is_cbo = any(p in name.upper() for p in ["ON_LC_", "BC_", "LC_", "TC_", "CBO", "🌟_"])
    cpc_danger = 140 if is_cbo else 250

    kill = False
    pause = False
    star = False

    # Layer 1: CPC
    if cpc > 400 and spend > 2000:
        kill = True
        kills.append(name)
    elif cpc > cpc_danger and spend > 5000:
        pause = True
        watch.append(name)

    # Layer 2: CTR (only if NOT already killed/paused)
    if not kill and not pause:
        if ctr < 1.0 and impr > 1000:
            pause = True
            watch.append(name)

    # Layer 3: Star (CPC < 140 + spend > 50K + clicks > 0)
    if not kill and not pause:
        if cpc < 140 and spend > 50000 and clicks > 0:
            star = True
            winners.append(name)

    # Execute
    if kill and not is_off:
        new_name = f"OFF_{name}"
        if not dry_run:
            r = rename_campaign(cid, new_name)
            actions_log.append(f"[OFF+RENAME] {name} -> {new_name}: {r}")
        else:
            actions_log.append(f"[DRY_RUN] would OFF_ {name}")
        if status == "ACTIVE":
            if not dry_run:
                r = pause_campaign(cid)
                actions_log.append(f"[PAUSE] {name}: {r}")
            else:
                actions_log.append(f"[DRY_RUN] would pause {name}")

    elif pause and status == "ACTIVE":
        if not dry_run:
            r = pause_campaign(cid)
            actions_log.append(f"[PAUSE] {name}: {r}")
        else:
            actions_log.append(f"[DRY_RUN] would pause {name}")

    elif star and not name.startswith("🌟_"):
        new_name = f"🌟_{name}"
        if not dry_run:
            r = rename_campaign(cid, new_name)
            actions_log.append(f"[STAR] {name} -> {new_name}: {r}")
        else:
            actions_log.append(f"[DRY_RUN] would star {name}")

star_count += len(winners)

report = f"""🛡️ SATPAM 1134 — 2026-06-11
ACTIVE: {active_count} | OFF_: {off_count} | 🌟: {star_count}
⚠️ KILL: {len(kills)} kampanye tindak lanjut OFF_
👀 WATCH: {len(watch)} kampanye di-pause
🌟 WINNERS: {len(winners)} kampanye naik prefix 🌟_
💰 Spend 7d: Rp{total_spend:,.0f}

KILL: {'; '.join(kills) if kills else 'Tidak ada'}
WATCH: {'; '.join(watch) if watch else 'Tidak ada'}
WINNERS: {'; '.join(winners) if winners else 'Tidak ada'}
DRY_RUN={dry_run}
---
ACTIONS:
""" + "\n".join(actions_log)

print(report)
