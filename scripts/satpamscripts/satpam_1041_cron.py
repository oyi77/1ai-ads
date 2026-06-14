import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from vilona_trakpro_engine import fb_get, fb_post, ACCESS_TOKEN
import json, time
from datetime import datetime, timedelta

ACT_ID = "380721031313330"
ACT = f"act_{ACT_ID}"

today = datetime.now().date()
since = (today - timedelta(days=3)).isoformat()
until = today.isoformat()


def fb_get_paged(endpoint, params):
    out = []
    nxt = None
    while True:
        current = params.copy()
        q = {"access_token": ACCESS_TOKEN, "limit": "200"}
        q.update(current)
        if nxt:
            base = nxt.split("?")[0]
            url = f"{base}?{q}" if False else f"{base}?{q}"
            url = nxt + ("&" if "?" in nxt else "?") + "access_token=" + ACCESS_TOKEN
            with urllib.request.urlopen(url, timeout=30) as r:
                data = json.loads(r.read())
        else:
            data = fb_get(f"{ACT}/{endpoint}", current)
        out.extend(data.get("data", []))
        nxt = data.get("paging", {}).get("next")
        if not nxt:
            break
        time.sleep(1.5)
    return out


def main():
    campaigns = fb_get(f"{ACT}/campaigns", {
        "fields": "id,name,status",
        "limit": "200",
    }).get("data", [])

    insights = fb_get(f"{ACT}/insights", {
        "fields": "campaign_id,campaign_name,spend,clicks,cpc,ctr",
        "time_range": json.dumps({"since": since, "until": until}),
        "level": "campaign",
        "limit": "200",
itr.td('.get("data", [])))

    by = {}
    for c in campaigns:
        by[c["id"]] = {
            "id": c["id"],
            "name": c.get("name", ""),
            "status": c.get("status", ""),
            "spend": 0.0,
            "clicks": 0,
            "cpc": 0.0,
        }
    for i in insights:
        cid = i.get("campaign_id")
        if cid and cid in by:
            by[cid]["spend"] = float(i.get("spend", 0) or 0)
            by[cid]["clicks"] = int(i.get("clicks", 0) or 0)
            by[cid]["cpc"] = float(i.get("cpc", 0) or 0)

    apps = list(by.values())
    total_spend = sum(a["spend"] for a in apps)
    total_clicks = sum(a["clicks"] for a in apps)
    global_cpc = total_spend / total_clicks if total_clicks > 0 else 0.0

    active_count = sum(1 for a in apps if a["status"] == "ACTIVE")
    off_count = sum(1 for a in apps if a["name"].startswith("OFF_"))
    star_count = sum(1 for a in apps if a["name"].startswith("🌟_"))
    mode = "AMAN" if global_cpc < 120 else "AKTIF"

    monster_killed = []
    watch_paused = []
    winners = []
    lc_scaled = []

    if global_cpc >= 120:
        for a in apps:
            cid = a["id"]
            name = a["name"]
            cpc = a["cpc"]
            spend = a["spend"]
            clicks = a["clicks"]
            status = a["status"]

            if status != "ACTIVE" or name.startswith("OFF_") or name.startswith("DEAD_"):
                continue

            try:
                if cpc >= 500 and spend > 1000:
                    fb_post(cid, {"name": f"OFF_{name}"})
                    fb_post(cid, {"status": "PAUSED"})
                    monster_killed.append(name)
                    time.sleep(1.5)
                    continue
                if cpc > 200 and clicks == 0 and spend > 500:
                    fb_post(cid, {"status": "PAUSED"})
                    watch_paused.append(name)
                    time.sleep(1.5)
                    continue
                if cpc < 120 and clicks > 5 and spend > 10000:
                    new_name = f"🌟_{name}" if not name.startswith("🌟_") else name
                    if new_name != name:
                        fb_post(cid, {"name": new_name})
                    winners.append(new_name)
                    time.sleep(1.5)
                    continue
                if "LC" in name.upper() and cpc < 120:
                    info = fb_get(f"{ACT}/{cid}", {"fields": "daily_budget"}).get("daily_budget")
                    if info is not None:
                        old = float(info)
                        if old > 0:
                            new_b = min(old * 1.2, 50000)
                            fb_post(cid, {"daily_budget": int(new_b)})
                            lc_scaled.append(name)
                            time.sleep(1.5)
            except Exception as e:
                print("ERR", cid, name, e)

    line = f"🛡️ SATPAM 1041 {until}\nACTIVE:{active_count} | OFF_:{off_count} | 🌟:{star_count} | Global CPC:Rp{int(global_cpc)} | Mode:{mode}\n💀 MONSTER KILLED: {len(monster_killed)}\n👀 WATCH PAUSED: {len(watch_paused)}\n🌟 WINNER: {len(winners)}\n⚡ LC SCALED: {len(lc_scaled)}\n💰 Spend 3d: Rp{int(total_spend)}"
    print(line)

if __name__ == "__main__":
    main()
