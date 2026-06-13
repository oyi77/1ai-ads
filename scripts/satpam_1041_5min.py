import json
import os
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

API_BASE = "https://graph.facebook.com/v22.0"
ACT_ID = "380721031313330"
ENV_PATH = Path("/home/openclaw/projects/1ai-ads/.env")
WIB = timezone(timedelta(hours=7))
NOW = datetime.now(WIB)


def load_token():
    for line in ENV_PATH.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN not found in .env")


TOKEN = load_token()
DRY_RUN = os.environ.get("DRY_RUN", "true").lower() in ("true", "1", "yes")


def api_get(endpoint, params=None):
    url = f"{API_BASE}/act_{ACT_ID}/{endpoint}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode("utf-8", errors="replace")}
    except Exception as e:
        return {"_error": str(e)}


def api_post(endpoint, data):
    data["access_token"] = TOKEN
    for k in list(data.keys()):
        if isinstance(data[k], (list, dict)):
            data[k] = json.dumps(data[k])
    qs = urllib.parse.urlencode(data).encode()
    url = f"{API_BASE}/act_{ACT_ID}/{endpoint}"
    req = urllib.request.Request(url, data=qs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode("utf-8", errors="replace")}
    except Exception as e:
        return {"_error": str(e)}


def to_rp(val):
    if val is None:
        return "Rp0"
    return f"Rp{int(val):,}"


def ts_str(dt):
    if dt.tzinfo is None:
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    return dt.strftime("%Y-%m-%d %H:%M:%S %Z")


def main():
    today_str = NOW.strftime("%Y-%m-%d")
    acct_resp = api_get(
        "insights",
        {
            "time_range": json.dumps({"since": today_str, "until": today_str}),
            "level": "account",
            "fields": "spend,clicks,cpc",
            "limit": 1,
        },
    )

    global_cpc = None
    total_spend = 0.0
    total_clicks = 0.0
    account_name = "1041"
    acct_name_resp = api_get("", {"fields": "account_name"})
    if isinstance(acct_name_resp, dict) and "account_name" in acct_name_resp:
        account_name = acct_name_resp["account_name"]

    if isinstance(acct_resp, dict) and "data" in acct_resp and acct_resp["data"]:
        row = acct_resp["data"][0]
        total_spend = float(row.get("spend", 0) or 0)
        total_clicks = float(row.get("clicks", 0) or 0)
        cpc_raw = row.get("cpc")
        if cpc_raw not in (None, 0):
            global_cpc = float(cpc_raw)
    if global_cpc is None and total_clicks > 0:
        global_cpc = total_spend / total_clicks

    mode = "AMAN" if (global_cpc is None or global_cpc < 120) else "WASPADA"

    camps_resp = api_get(
        "campaigns",
        {
            "fields": "id,name,status,objective",
            "limit": 200,
            "filtering": json.dumps(
                [{"field": "status", "operator": "IN", "value": ["ACTIVE", "PAUSED"]}]
            ),
        },
    )

    campaigns = []
    if isinstance(camps_resp, dict) and "data" in camps_resp:
        campaigns = camps_resp["data"]

    active_count = sum(1 for c in campaigns if c.get("status") == "ACTIVE")
    paused_count = sum(1 for c in campaigns if c.get("status") == "PAUSED")
    off_count = sum(1 for c in campaigns if (c.get("name") or "").startswith("OFF_"))
    star_count = sum(1 for c in campaigns if (c.get("name") or "").startswith("🌟"))

    monster_list = []
    watch_list = []
    winner_list = []
    lc_scale_list = []

    if mode == "WASPADA" and campaigns:
        all_ids = [c["id"] for c in campaigns]
        insights_map = {}
        for i in range(0, len(all_ids), 50):
            batch = all_ids[i : i + 50]
            ins = api_get(
                "insights",
                {
                    "time_range": json.dumps({"since": today_str, "until": today_str}),
                    "level": "campaign",
                    "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
                    "filtering": json.dumps(
                        [{"field": "campaign.id", "operator": "IN", "value": batch}]
                    ),
                    "limit": 50,
                },
            )
            if isinstance(ins, dict) and "data" in ins:
                for row in ins["data"]:
                    insights_map[row["campaign_id"]] = row
            time.sleep(1.5)

        for c in campaigns:
            cid = c["id"]
            ins = insights_map.get(cid, {})
            cpc = float(ins.get("cpc", 0) or 0)
            spend = float(ins.get("spend", 0) or 0)
            clicks = int(float(ins.get("clicks", 0) or 0))
            name = c.get("name", "")
            status = c.get("status", "")

            if (cpc >= 500 and spend > 1000) or (cpc >= 1000 and spend > 500):
                monster_list.append(
                    f"{name} (CPC {int(cpc)}, spend {to_rp(spend)})"
                )
            if cpc > 200 and clicks == 0 and spend > 500 and not name.startswith("OFF_"):
                watch_list.append(
                    f"{name} (CPC {int(cpc)}, spend {to_rp(spend)})"
                )
            if cpc < 120 and clicks > 5 and spend > 10000:
                winner_list.append(
                    f"{name} (CPC {int(cpc)}, {clicks} clicks, {to_rp(spend)})"
                )
            if "LC" in name.upper() and cpc < 120 and clicks > 0 and status == "ACTIVE":
                new_budget = min(int(spend * 1.2), 50000)
                if new_budget > 0:
                    lc_scale_list.append((cid, name, new_budget))

    if mode == "WASPADA":
        for entry in monster_list:
            mname = entry.split(" (")[0]
            for c in campaigns:
                if c.get("name") == mname and not (c.get("name") or "").startswith("OFF_"):
                    if not DRY_RUN:
                        api_post(f"{c['id']}", {"status": "PAUSED"})
                        time.sleep(1.5)
                        api_post(f"{c['id']}", {"name": f"OFF_{c['name']}"})
                        time.sleep(1.5)
                    break

        for entry in watch_list:
            wname = entry.split(" (")[0]
            for c in campaigns:
                if c.get("name") == wname and not (c.get("name") or "").startswith("OFF_"):
                    if not DRY_RUN:
                        api_post(f"{c['id']}", {"status": "PAUSED"})
                        time.sleep(1.5)
                    break

        for cid, name, new_budget in lc_scale_list:
            if not DRY_RUN:
                api_post(f"{cid}", {"daily_budget": str(new_budget)})
                time.sleep(1.5)

    mode_label = "🟢 AMAN" if mode == "AMAN" else "🔴 WASPADA"
    cpc_display = f"{global_cpc:.0f}" if global_cpc is not None else "N/A"
    report = (
        f"🛡️ SATPAM 1041 {ts_str(NOW)}\n"
        f"ACTIVE:{active_count} | OFF_:{off_count} | 🌟:{star_count} | "
        f"Global CPC:Rp{cpc_display} | Mode:{mode_label}\n"
        f"💀 MONSTER: {', '.join(monster_list) if monster_list else 'none'}\n"
        f"👀 WATCH: {', '.join(watch_list) if watch_list else 'none'}\n"
        f"🌟 WINNER: {', '.join(winner_list) if winner_list else 'none'}\n"
        f"💰 LC SCALE: {len(lc_scale_list)} naik budget\n"
    )
    if DRY_RUN:
        report += "\n🧪 DRY_RUN=true — mutations skipped."
    print(report)


if __name__ == "__main__":
    main()
