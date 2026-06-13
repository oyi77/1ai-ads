#!/usr/bin/env python3
"""SATPAM 0858 Kakriput cron patrol."""
import json, time, urllib.request, urllib.parse
from datetime import datetime, timedelta

ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"
ACT_ID = "435670549443081"
API = "https://graph.facebook.com/v22.0"
SINCE = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
UNTIL = datetime.now().strftime("%Y-%m-%d")


def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN missing")


TOKEN = load_token()
print(f"Token loaded len={len(TOKEN)}")


def fb_get(endpoint, fields=None, params=None):
    url = f"{API}/{endpoint}"
    qs = {"access_token": TOKEN}
    if fields:
        qs["fields"] = fields
    if params:
        qs.update(params)
    full = url + "?" + urllib.parse.urlencode(qs)
    req = urllib.request.Request(full)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def fb_post(endpoint, data=None):
    url = f"{API}/{endpoint}"
    payload = {"access_token": TOKEN}
    if data:
        payload.update(data)
    qs = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(url, data=qs, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


print("Fetching campaigns...")
campaigns = fb_get(f"act_{ACT_ID}/campaigns", fields="id,name,status")["data"]
print(f"Total campaigns: {len(campaigns)}")

print("Fetching insights...")
insights_raw = fb_get(
    f"act_{ACT_ID}/insights",
    fields="campaign_id,campaign_name,spend,cpc,clicks,ctr",
    params={
        "time_range": json.dumps({"since": SINCE, "until": UNTIL}),
        "level": "campaign",
        "limit": "200",
    },
)

insights = {}
for row in insights_raw.get("data", []):
    cid = row["campaign_id"]
    insights[cid] = {
        "name": row.get("campaign_name", ""),
        "spend": float(row.get("spend", 0)),
        "cpc": float(row.get("cpc", 0)) if row.get("cpc") else 0.0,
        "clicks": int(row.get("clicks", 0)),
        "ctr": float(row.get("ctr", 0)) if row.get("ctr") else 0.0,
    }

while "next" in insights_raw.get("paging", {}):
    nxt = insights_raw["paging"]["next"]
    time.sleep(1.5)
    req = urllib.request.Request(nxt)
    with urllib.request.urlopen(req, timeout=20) as r:
        insights_raw = json.loads(r.read())
    for row in insights_raw.get("data", []):
        cid = row["campaign_id"]
        insights[cid] = {
            "name": row.get("campaign_name", ""),
            "spend": float(row.get("spend", 0)),
            "cpc": float(row.get("cpc", 0)) if row.get("cpc") else 0.0,
            "clicks": int(row.get("clicks", 0)),
            "ctr": float(row.get("ctr", 0)) if row.get("ctr") else 0.0,
        }

all_active = [c for c in campaigns if c["status"] == "ACTIVE"]
all_paused = [c for c in campaigns if c["status"] == "PAUSED"]

total_spend = 0.0
total_clicks = 0
for c in campaigns:
    ins = insights.get(c["id"], {})
    total_spend += ins.get("spend", 0)
    total_clicks += ins.get("clicks", 0)

global_cpc = total_spend / total_clicks if total_clicks > 0 else 0.0
mode = "AMAN" if global_cpc < 120 else "NORMAL"
print(f"Global CPC: Rp{global_cpc:.0f} | Mode: {mode}")

monsters = []
winners = []
watch = []
auto_on = []
lc = []

for c in campaigns:
    ins = insights.get(c["id"], {})
    name = c["name"]
    spend = ins.get("spend", 0)
    cpc = ins.get("cpc", 0)
    clicks = ins.get("clicks", 0)
    ctr = ins.get("ctr", 0)

    if name.startswith("OFF_") or name.startswith("DEAD_"):
        continue

    if cpc >= 500 and spend > 1000:
        monsters.append((c["id"], name, cpc, spend))
    elif cpc > 200 and clicks == 0 and spend > 500:
        monsters.append((c["id"], name, cpc, spend))

    if cpc > 200 and clicks > 0 and spend > 2000:
        watch.append((c["id"], name, cpc, spend))

    if cpc < 120 and clicks > 5 and spend > 10000:
        winners.append((c["id"], name, cpc, spend))

    if c["status"] == "PAUSED" and cpc < 200 and clicks > 3 and spend > 2000:
        auto_on.append((c["id"], name, cpc, spend))

    if "LC" in name.upper() and cpc < 120:
        lc.append((c["id"], name, cpc, spend))

renamed = []
activated = []
paused_monsters = []

for cid, name, cpc, spend in monsters:
    if mode == "NORMAL":
        print(f"MONSTER pause {cid}: {name} CPC={cpc:.0f}")
        try:
            time.sleep(1.5)
            fb_post(cid, data={"status": "PAUSED"})
            off_name = f"OFF_{name}"
            time.sleep(1.5)
            fb_post(cid, data={"name": off_name})
            paused_monsters.append((name, cpc))
        except Exception as e:
            print(f"ERROR pausing {cid}: {e}")

for cid, name, cpc, spend in winners:
    if mode == "NORMAL":
        try:
            time.sleep(1.5)
            fb_post(cid, data={"name": f"\u2b50_{name}"})
            renamed.append(name)
        except Exception as e:
            print(f"ERROR renaming {cid}: {e}")

for cid, name, cpc, spend in auto_on:
    if mode == "NORMAL":
        try:
            time.sleep(1.5)
            fb_post(cid, data={"status": "ACTIVE"})
            activated.append(name)
        except Exception as e:
            print(f"ERROR activating {cid}: {e}")

rules = fb_get(f"act_{ACT_ID}/adrules_library", fields="id,name,execution_spec")["data"]
pause_rules = [r for r in rules if "PAUSE" in r.get("name", "").upper() or "STOP" in r.get("name", "").upper()]
print(f"Meta PAUSE rules: {len(pause_rules)}")

ts = datetime.now().strftime("%Y-%m-%d %H:%M")
lines = [
    f"\U0001f6e1\ufe0f SATPAM 0858 {ts}",
    f"ACTIVE:{len(all_active)} | Global CPC:Rp{global_cpc:.0f} | Mode:{mode}",
    f"Total campaigns: {len(campaigns)}",
]
if monsters:
    lines.append("\U0001f480 MONSTER: " + "; ".join([f"{n} (CPC Rp{c:.0f})" for n, c, _ in paused_monsters]))
else:
    lines.append("\U0001f480 MONSTER: —")

if watch:
    lines.append("\U0001f440 WATCH: " + "; ".join([f"{n} (CPC Rp{c:.0f})" for n, c, _ in watch[:5]]))
else:
    lines.append("\U0001f440 WATCH: —")

lines.append(f"\u2b50 WINNER: {len(renamed)} — {', '.join(renamed) if renamed else 'none'}")
lines.append(f"\u2705 AUTO-ON: {len(activated)}")
lines.append(f"\U0001f4b0 LC: {len(lc)}")
if pause_rules:
    lines.append(f"\u26a0\ufe0f Meta rules: {len(pause_rules)} PAUSE rules found")
else:
    lines.append("\u26a0\ufe0f Meta rules: 0")

print("\n".join(lines))
