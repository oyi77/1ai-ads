import json, time, urllib.request, urllib.parse
from datetime import datetime, timedelta

TOKEN_PATH = "/home/openclaw/projects/1ai-ads/.env"
API = "https://graph.facebook.com/v22.0"
ACT = "act_380721031313330"

def load_token():
    for line in open(TOKEN_PATH).read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("token missing")

TOKEN = load_token()

def fb_get(endpoint, params=None):
    params = params or {}
    params["access_token"] = TOKEN
    url = f"{API}/{endpoint}?{urllib.parse.urlencode(params)}"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 400 and attempt < 2:
                time.sleep(2)
            else:
                raise

def fb_post(endpoint, payload):
    payload["access_token"] = TOKEN
    qs = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(f"{API}/{endpoint}", data=qs, method="POST")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

end_date = datetime.now().strftime("%Y-%m-%d")
start_date = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
time_range = f'{{"since":"{start_date}","until":"{end_date}"}}'

campaigns = fb_get(f"{ACT}/campaigns", {"fields": "id,name,status", "limit": "200"}).get("data", [])
insights = fb_get(f"{ACT}/insights", {
    "fields": "campaign_id,campaign_name,spend,clicks,cpc,ctr",
    "time_range": time_range,
    "level": "campaign",
    "limit": "200",
}).get("data", [])

ins_map = {row["campaign_id"]: row for row in insights if "campaign_id" in row}

merged = []
for c in campaigns:
    ins = ins_map.get(c["id"], {})
    merged.append({
        "id": c["id"],
        "name": c["name"],
        "status": c["status"],
        "spend": float(ins.get("spend", 0) or 0),
        "clicks": int(ins.get("clicks", 0) or 0),
        "cpc": float(ins.get("cpc", 0) or 0),
        "ctr": float(ins.get("ctr", 0) or 0),
    })

active_norm = [m for m in merged if m["status"] == "ACTIVE" and not m["name"].startswith(("OFF_", "DEAD_"))]
total_spend = sum(m["spend"] for m in active_norm)
total_clicks = sum(m["clicks"] for m in active_norm)
global_cpc = total_spend / total_clicks if total_clicks > 0 else 0.0

now = datetime.now().strftime("%Y-%m-%d %H:%M")
active_count = len(active_norm)
off_count = sum(1 for m in merged if m["name"].startswith("OFF_"))
star_count = sum(1 for m in merged if m["name"].startswith("🌟_"))

if global_cpc < 120:
    print(
        f"🛡️ SATPAM 1041 {now}\n"
        f"ACTIVE:{active_count} | OFF_:{off_count} | 🌟:{star_count} | Global CPC:Rp{int(global_cpc)} | Mode:AMAN\n"
        f"💰 Spend 3d: Rp{int(total_spend)}\n"
        "AMAN — global CPC sehat, tidak ada kill/watch/scale."
    )
    raise SystemExit(0)

monsters = []
watch_paused = []
winners = []
lc_scaled = []

for m in merged:
    name = m["name"]
    if name.startswith(("OFF_", "DEAD_")):
        continue

    if m["cpc"] >= 500 and m["spend"] > 1000:
        monsters.append(name)
        try:
            time.sleep(1.5)
            fb_post(m["id"], {"status": "PAUSED"})
        except Exception:
            pass
        try:
            time.sleep(1.5)
            fb_post(m["id"], {"name": f"OFF_{name}"})
        except Exception:
            pass
        continue

    if m["cpc"] > 200 and m["clicks"] == 0 and m["spend"] > 500:
        watch_paused.append(name)
        try:
            time.sleep(1.5)
            fb_post(m["id"], {"status": "PAUSED"})
        except Exception:
            pass
        continue

    if m["cpc"] < 120 and m["clicks"] > 5 and m["spend"] > 10000:
        winners.append(name)
        if not name.startswith("🌟"):
            try:
                time.sleep(1.5)
                fb_post(m["id"], {"name": f"🌟_{name}"})
            except Exception:
                pass
        continue

    if "LC" in name.upper() and m["cpc"] < 120:
        try:
            time.sleep(1.5)
            adset_resp = fb_get(f"{m['id']}/adsets", {"fields": "id,daily_budget", "limit": "10"})
            old_budget = 0
            target_id = None
            if adset_resp.get("data"):
                ads = adset_resp["data"][0]
                old_budget = int(ads.get("daily_budget", 0))
                target_id = ads["id"]
            new_budget = min(int(old_budget * 1.2), 100000)
            if new_budget > old_budget and target_id:
                fb_post(target_id, {"daily_budget": str(new_budget)})
                lc_scaled.append(f"{name} -> Rp{new_budget}")
            else:
                lc_scaled.append(name)
        except Exception:
            lc_scaled.append(name)
        continue

print(
    f"🛡️ SATPAM 1041 {now}\n"
    f"ACTIVE:{active_count} | Global CPC:Rp{int(global_cpc)} | Mode:AKTIF\n"
    f"💀 MONSTER KILLED:{len(monsters)}\n"
    f"👀 WATCH PAUSED:{len(watch_paused)}\n"
    f"🌟 WINNER:{len(winners)} renamed:{len(winners)}\n"
    f"⚡ LC SCALED:{len(lc_scaled)}\n"
    f"💰 Spend 3d: Rp{int(total_spend)}"
)
