import json, urllib.request, urllib.parse, time, re
from datetime import datetime, timedelta

ACT_ID = "act_380721031313330"
TOKEN_FILE = "/home/openclaw/projects/1ai-ads/.env"
BASE = f"https://graph.facebook.com/v22.0/{ACT_ID}"

def load_token():
    with open(TOKEN_FILE, "r") as f:
        for line in f:
            line = line.strip()
            if line.startswith("FB_SYSTEM_TOKEN="):
                return line.split("=", 1)[1]
            if line.startswith("META_ACCESS_TOKEN="):
                return line.split("=", 1)[1]
    raise SystemExit("Token not found")

TOKEN = load_token()

def api_get(params):
    p = dict(params)
    p["access_token"] = TOKEN
    req = urllib.request.Request(BASE + "?" + urllib.parse.urlencode(p, doseq=True), method="GET")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

# Fetch campaigns
time.sleep(0.5)
camps_resp = api_get({"fields": "id,name,status", "limit": 200})
campaigns = {c["id"]: c for c in camps_resp.get("data", [])}
active_ids = [cid for cid, c in campaigns.items() if c.get("status") == "ACTIVE" and not (c.get("name") or "").startswith(("OFF_", "DEAD_"))]
print(f"Total campaigns: {len(campaigns)}, Active: {len(active_ids)}")

# Fetch insights 7d
time_range = json.dumps({"since": "2026-06-06", "until": "2026-06-13"})
time.sleep(0.5)
insights_resp = api_get({
    "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
    "time_range": time_range,
    "level": "campaign",
    "limit": 200,
})
rows = []
for row in insights_resp.get("data", []):
    try:
        spend = float(row.get("spend", 0) or 0)
    except Exception:
        spend = 0.0
    try:
        clicks = int(row.get("clicks", 0) or 0)
    except Exception:
        clicks = 0
    cpc_raw = row.get("cpc")
    try:
        cpc = float(cpc_raw) if cpc_raw not in (None, "", "0") else None
    except Exception:
        cpc = None
    ctr_raw = row.get("ctr")
    try:
        ctr = float(ctr_raw) if ctr_raw not in (None, "", "0") else None
    except Exception:
        ctr = None
    try:
        impressions = int(row.get("impressions", 0) or 0)
    except Exception:
        impressions = 0
    rows.append({
        "campaign_id": row.get("campaign_id", ""),
        "campaign_name": row.get("campaign_name", ""),
        "spend": spend,
        "cpc": cpc,
        "clicks": clicks,
        "ctr": ctr,
        "impressions": impressions,
    })

print(f"Insight rows: {len(rows)}")

# Aggregate by campaign
metrics = {}
for r in rows:
    cid = r["campaign_id"]
    if cid not in metrics:
        metrics[cid] = {"spend": 0.0, "clicks": 0, "cpc": r["cpc"], "ctr": r["ctr"], "impressions": 0, "name": r["campaign_name"]}
    metrics[cid]["spend"] += r["spend"]
    metrics[cid]["clicks"] += r["clicks"]
    metrics[cid]["impressions"] += r["impressions"]
    if r["cpc"] is not None:
        metrics[cid]["cpc"] = r["cpc"]
    if r["ctr"] is not None:
        metrics[cid]["ctr"] = r["ctr"]

for cid, m in metrics.items():
    if m["clicks"] > 0:
        derived = m["spend"] / m["clicks"]
        if m["cpc"] is None:
            m["cpc"] = derived
    else:
        if m["cpc"] is None:
            m["cpc"] = None

# Global CPC
active_metrics = {cid: m for cid, m in metrics.items() if cid in active_ids}
total_spend = sum(m["spend"] for m in active_metrics.values())
total_clicks = sum(m["clicks"] for m in active_metrics.values())
global_cpc = total_spend / total_clicks if total_clicks > 0 else 0.0
print(f"Global spend Rp{total_spend:,.0f} clicks={total_clicks} cpc=Rp{global_cpc:,.0f}")

mode = "AMAN" if global_cpc < 120 else "NORMAL"
hour_min = datetime.now().strftime("%H:%M")

actions_monster = []
actions_pause = []
actions_watch = []
actions_winner = []
actions_lc_scale = []

if mode == "NORMAL":
    for cid in active_ids:
        m = metrics.get(cid)
        if not m:
            continue
        cpc = m["cpc"] if m["cpc"] is not None else (m["spend"] / m["clicks"] if m["clicks"] > 0 else 0)
        spend = m["spend"]
        clicks = m["clicks"]
        name = m["name"] or cid
        # MONSTER
        if cpc >= 1000 and spend > 1000:
            actions_monster.append((cid, name, "CPC>=1000+spend>1K"))
        elif cpc >= 500 and spend > 2000:
            actions_monster.append((cid, name, "CPC>=500+spend>2K"))
        # CPC
        if cpc > 200 and clicks == 0 and spend > 500:
            actions_pause.append((cid, name, "CPC>200+0clicks+spend>500"))
        elif cpc > 200 and clicks > 0:
            actions_watch.append((cid, name, "CPC>200+clicks>0"))

# Winners / LC scale (report only)
for cid in active_ids:
    m = metrics.get(cid)
    if not m:
        continue
    cpc = m["cpc"] if m["cpc"] is not None else (m["spend"] / m["clicks"] if m["clicks"] > 0 else 0)
    spend = m["spend"]
    clicks = m["clicks"]
    name = m["name"] or cid
    if global_cpc < 120 and cpc < 120 and clicks > 5 and spend > 10000:
        actions_winner.append((cid, name, "CPC<120+clicks>5+spend>10K"))
    if "LC" in (name or "") and cpc < 120 and clicks > 0:
        actions_lc_scale.append((cid, name, "LC+CPC<120+clicks>0"))

report = (
    f"🛡️ 1041 {hour_min} | Active:{len(active_ids)} | CPC:Rp{int(global_cpc):,} | {mode}\n"
    f"💀:{len(actions_monster)} 👀:{len(actions_pause)+len(actions_watch)} 🌟:{len(actions_winner)} 💰LC:{len(actions_lc_scale)}\n"
)
print("\n=== REPORT ===")
print(report)

# If AMAN and no problems, explicit
if mode == "AMAN" and not (actions_monster or actions_pause or actions_watch) and not (actions_winner or actions_lc_scale):
    report += "AMAN - gak ada aksi"
else:
    report += f"👀 pause candidates: {', '.join(n for _, n, _ in actions_pause) or 'None'}\n"
    report += f"👀 watch candidates: {', '.join(n for _, n, _ in actions_watch) or 'None'}\n"
    report += f"🌟 winners: {', '.join(n for _, n, _ in actions_winner) or 'None'}\n"
    report += f"💰 LC scale candidates: {', '.join(n for _, n, _ in actions_lc_scale) or 'None'}\n"

with open("/home/openclaw/projects/1ai-ads/reports/satpat_1041_last.md", "w") as f:
    f.write(report)

# Save payload for review
with open("/home/openclaw/projects/1ai-ads/.tmp_satpat1041_payload.json", "w") as f:
    json.dump({
        "active_ids": active_ids,
        "metrics": {cid: {k: (float(v) if isinstance(v, float) else v) for k, v in m.items()} for cid, m in active_metrics.items()},
        "global": {"spend": total_spend, "clicks": total_clicks, "cpc": global_cpc, "mode": mode},
        "actions": {
            "monster": actions_monster,
            "pause": actions_pause,
            "watch": actions_watch,
            "winner": actions_winner,
            "lc_scale": actions_lc_scale,
        },
        "hour_min": hour_min,
    }, f, indent=2)
