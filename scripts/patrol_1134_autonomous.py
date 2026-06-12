import urllib.request, json, time
from datetime import datetime, timedelta

TOKEN_PATH = "/home/openclaw/projects/1ai-ads/.env"
ACT_ID = "1773760133153789"

def load_token():
    for line in open(TOKEN_PATH).read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("token missing")

TOKEN = load_token()
API = "https://graph.facebook.com/v22.0"


def fb_get(path, fields=None, params=None):
    url = f"{API}/{path}"
    qs = {"access_token": TOKEN}
    if fields:
        qs["fields"] = ",".join(fields) if isinstance(fields, list) else fields
    if params:
        qs.update(params)
    url = f"{url}?{'&'.join(f'{k}={v}' for k, v in qs.items())}"
    with urllib.request.urlopen(urllib.request.Request(url), timeout=15) as resp:
        return json.loads(resp.read())


def fb_post(path, data=None):
    url = f"{API}/{path}"
    qs = {"access_token": TOKEN}
    if data:
        for k in list(data.keys()):
            if isinstance(data[k], (list, dict)):
                data[k] = json.dumps(data[k])
        qs.update(data)
    url = f"{url}?{'&'.join(f'{k}={v}' for k, v in qs.items())}"
    with urllib.request.urlopen(urllib.request.Request(url, method="POST"), timeout=15) as resp:
        return json.loads(resp.read())

# Pre-flight (account_name from /me/accounts already confirms access)
with urllib.request.urlopen(f"{API}/act_{ACT_ID}/campaigns?access_token={TOKEN}&fields=id&limit=1", timeout=15) as resp:
    json.loads(resp.read())
print("Pre-flight OK: act_1773760133153789 (Glowscent/1134)")

camps = fb_get(f"act_{ACT_ID}/campaigns", fields=["id","name","status","effective_status","daily_budget","lifetime_budget","spend","cpc"])
all_campaigns = camps.get("data", [])
print("Campaign count:", len(all_campaigns))

since = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
until = datetime.now().strftime("%Y-%m-%d")
insights = fb_get(f"act_{ACT_ID}/insights", fields=["campaign_id","campaign_name","spend","cpc","clicks","ctr","impressions"], params={
    "time_range": json.dumps({"since": since, "until": until}, separators=(",",":")),
    "level": "campaign",
    "limit": "200"
})
ins_rows = {r["campaign_id"]: r for r in insights.get("data", [])}
print("Insights rows:", len(ins_rows))

merged = []
for c in all_campaigns:
    row = {
        "id": c["id"],
        "name": c["name"],
        "status": c["status"],
        "effective_status": c.get("effective_status"),
        "spend_meta": float(c.get("spend") or 0),
        "cpc_meta": float(c.get("cpc") or 0),
    }
    extra = ins_rows.get(c["id"], {})
    row.update({
        "spend": float(extra.get("spend") or 0),
        "cpc": float(extra.get("cpc") or 0) if extra.get("cpc") is not None else None,
        "clicks": int(extra.get("clicks") or 0),
        "ctr": float(extra.get("ctr") or 0) if extra.get("ctr") is not None else None,
        "impressions": int(extra.get("impressions") or 0),
    })
    merged.append(row)

active, off_count, star = [], [], []
kill, watch, winners = [], [], []
taglinks = {"abera", "pintulipatgeser", "hijab"}
flagged_dead = []

for c in merged:
    name = c["name"]
    status = c["status"]
    spend = c["spend"]
    cpc_meta = c["cpc_meta"] if c["cpc_meta"] else 0
    clicks = c["clicks"]
    ctr = c["ctr"] if c["ctr"] is not None else 0
    impressions = c["impressions"]

    if name.startswith("OFF_"):
        off_count.append({"name": name, "status": status})
        continue
    if status != "ACTIVE":
        continue

    is_tag = any(t in name.lower() for t in taglinks)
    active.append({"name": name, "spend": spend, "cpc": cpc_meta, "clicks": clicks, "ctr": ctr, "impressions": impressions, "tag": is_tag})

    eff_cpc = c["cpc"] if c.get("cpc") is not None else cpc_meta

    if eff_cpc > 400 and spend > 2000:
        kill.append(name)
        continue
    if ctr < 1 and impressions > 1000:
        watch.append({"name": name, "reason": f"CTR {ctr}% <1%, impr {impressions}"})
        continue
    if eff_cpc > 140:
        watch.append({"name": name, "reason": f"CPC Rp{eff_cpc}"})
    if eff_cpc < 140 and spend > 50000 and clicks > 0 and is_tag:
        winners.append(name)
        star.append(name)
    if spend > 50000 and not is_tag:
        watch.append({"name": name, "reason": "Non-taglink spend > 50K"})

print("Active:", len(active), "OFF_:", len(off_count), "🌟:", len(star))
print("KILL:", kill)
print("WATCH:", watch[:30])
print("WINNERS:", winners[:30])
print("Total 7d spend:", sum(x["spend"] for x in active))
print("Timestamp:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
