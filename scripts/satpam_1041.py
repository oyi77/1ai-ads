#!/usr/bin/env python3
"""SATPAM 1041 nightly minimum-v3 (stdlib only, 2026-06-13 fixes)."""
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.parse import urlencode

ENGINE_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ACT_ID = "act_380721031313330"
API_BASE = f"https://graph.facebook.com/v22.0/{ACT_ID}"

FIELDS_LIMIT = "id,name,status,daily_budget,effective_status,start_time,stop_time,lifetime_budget,spend,cpc"

def load_token():
    env_path = os.path.join(ENGINE_ROOT, ".env")
    if not os.path.exists(env_path):
        raise RuntimeError(f".env not found: {env_path}")
    for line in open(env_path, encoding="utf-8").read().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN missing in .env")

def api_get(endpoint, params, timeout=30):
    url = f"{API_BASE}/{endpoint.lstrip('/')}"
    if params:
        url = f"{url}?{urlencode(params)}"
    req = Request(url, headers={"Authorization": f"Bearer {load_token()}"})
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())

def api_post(endpoint, body, timeout=30):
    url = f"{API_BASE}/{endpoint.lstrip('/')}"
    data = dict(body)
    data["access_token"] = load_token()
    for k in list(data.keys()):
        if isinstance(data[k], (dict, list)):
            data[k] = json.dumps(data[k])
    req = Request(url, data=urlencode(data).encode(), method="POST")
    try:
        with urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"_error": str(e)}

def pause_campaign(cid):
    return bool(api_post(cid, {"status": "PAUSED"}).get("success"))

def rename_campaign(cid, new_name):
    return bool(api_post(cid, {"name": new_name}).get("success"))

def bump_budget(cid, pct=0.20, cap=50000):
    c = api_get(f"{cid}", {"fields": "daily_budget"})
    old_budget = c.get("daily_budget")
    old = int(old_budget) if old_budget is not None else 0
    if old <= 0:
        return 0
    new = int(min(old * (1 + pct), cap))
    if new == old:
        return old
    return new if api_post(cid, {"daily_budget": str(new)}).get("success") else old

def extract_taglink(name):
    known = [
        "rakpiringpengering",
        "setelanbajukaosmihugajah",
        "setelangajahthaialand",
        "rakdapur3",
        "rakdapur",
        "atayasetelankaosanak",
        "abera",
        "pintulipatgeser",
        "hijab",
        "organizerpullout",
        "kitchenrack",
        "dapur",
        "rak",
        "baju",
        "rakpiring",
        "setelan",
        "gajah",
        "kaos",
    ]
    n = name.strip()
    blob = n.lower().replace(" ", "_")
    for pfx in ("off_", "dead_", "\U0001f31f_", "on_lc_", "scale_", "lc_", "tc_", "bc_", "bidcap_", "cbo_", "abo_", "test_", "testing_", "bid_", "prof", "glw", "id", "my"):
        if blob.startswith(pfx):
            blob = blob[len(pfx):]
    parts = [p for p in blob.split("_") if p]
    for p in parts:
        if p in known:
            return p
    return parts[0] if parts else n

def chunker(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]

def now_wib():
    return datetime.now(timezone(timedelta(hours=7)))

def ins_keyed(ids):
    out = {}
    since = (now_wib() - timedelta(days=6)).strftime("%Y-%m-%d")
    until = now_wib().strftime("%Y-%m-%d")
    fields = "campaign_id,spend,cpc,clicks,ctr,impressions,actions"
    for batch in chunker(ids, 25):
        body = {
            "time_range": json.dumps({"since": since, "until": until}),
            "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": batch}]),
            "level": "campaign",
            "fields": fields,
            "limit": "200",
        }
        try:
            rows = api_get("insights", body).get("data", []) or []
        except Exception:
            rows = []
        for r in rows:
            cid = r.get("campaign_id")
            if cid:
                out[cid] = r
        time.sleep(1.5)
    return out

def global_cpc_today():
    today = now_wib().strftime("%Y-%m-%d")
    body = {
        "time_range": json.dumps({"since": today, "until": today}),
        "level": "account",
        "fields": "spend,clicks,cpc",
    }
    data = api_get("insights", body).get("data", []) or []
    acct = data[0] if data else {}
    spend = float(acct.get("spend") or 0)
    clicks = float(acct.get("clicks") or 0)
    return spend / clicks if clicks > 0 else 0.0

def campaign_inventory():
    seen = set()
    out = []
    params = {"fields": FIELDS_LIMIT, "limit": 200}
    nxt = "campaigns"
    while nxt:
        try:
            data = api_get(nxt, params)
        except Exception as e:
            break
        if not isinstance(data, dict):
            break
        chunk = [c for c in data.get("data", []) if c.get("id") not in seen]
        out.extend(chunk)
        seen.update(c.get("id") for c in chunk)
        paging = data.get("paging") or {}
        nxt = paging.get("next")
        params = None
        time.sleep(0.6)
    return out

def main():
    ts = now_wib().strftime("%Y-%m-%d %H:%M WIB")
    try:
        act_name = api_get("", {"fields": "account_name"}).get("account_name", ACT_ID)
    except Exception:
        act_name = ACT_ID

    try:
        all_camps = campaign_inventory()
    except Exception:
        all_camps = []

    active = [c for c in all_camps if c.get("status") == "ACTIVE"]
    off_ = [c for c in all_camps if c.get("name", "").startswith("OFF_")]
    stars = [c for c in all_camps if c.get("name", "").startswith("\U0001f31f_")]
    global_cpc = 0.0
    try:
        global_cpc = global_cpc_today()
    except Exception:
        pass

    mode = "AMAN" if global_cpc < 120 else "WASPADA"

    q = [c["id"] for c in active]
    ins_map = ins_keyed(q) if q else {}

    monsters = []
    watch = []
    winners = []
    lc_scales = []

    for c in active:
        cid = c["id"]
        name = c.get("name", "")
        ins = ins_map.get(cid, {})
        cpc = float(ins.get("cpc") or 0)
        clicks = int(ins.get("clicks") or 0)
        spend = float(ins.get("spend") or 0)
        if (cpc >= 500 and spend > 1000) or (cpc >= 1000 and spend > 500):
            monsters.append({"id": cid, "name": name, "cpc": int(cpc), "spend": int(spend), "tag": extract_taglink(name)})
        if cpc > 200 and clicks == 0 and spend > 500:
            watch.append({"id": cid, "name": name, "cpc": int(cpc), "spend": int(spend), "tag": extract_taglink(name)})
        if cpc < 120 and clicks > 5 and spend > 10000:
            winners.append({"id": cid, "name": name, "cpc": int(cpc), "clicks": clicks, "spend": int(spend), "tag": extract_taglink(name)})
        if "LC" in name.upper() and cpc < 120 and clicks > 0:
            lc_scales.append({"id": cid, "name": name, "cpc": int(cpc), "clicks": clicks, "spend": int(spend)})

    monster_names = []
    watch_names = []
    winner_names = []
    lc_done = 0

    if mode == "WASPADA":
        for m in monsters:
            try:
                ok = pause_campaign(m["id"])
                if ok:
                    rename_campaign(m["id"], f"OFF_{m['name']}")
                    monster_names.append(m["name"])
            except Exception:
                pass
            time.sleep(0.7)
        for w in watch:
            try:
                if pause_campaign(w["id"]):
                    watch_names.append(w["name"])
            except Exception:
                pass
            time.sleep(0.7)
    else:
        monster_names = [f"{m['name']}(CPC Rp{m['cpc']})" for m in monsters]
        watch_names = [f"{w['name']}(CPC Rp{w['cpc']})" for w in watch]

    winner_names = [f"{x['name']} | CPC Rp{x['cpc']} | clicks {x['clicks']}" for x in winners[:20]]
    for s in lc_scales[:10]:
        try:
            new_b = bump_budget(s["id"], 0.20, 50000)
            if new_b:
                lc_done += 1
        except Exception:
            pass
        time.sleep(0.6)

    report_lines = [
        "\U0001f6e1\ufe0f SATPAM 1041 " + ts,
        f"ACTIVE:{len(active)} | Global CPC:Rp{global_cpc:.0f} | Mode:{mode}",
        "\U0001f480 MONSTER: " + (", ".join(monster_names) if monster_names else "none"),
        "\U0001f440 WATCH: " + (", ".join(watch_names) if watch_names else "none"),
        "\U0001f31f WINNER: " + (", ".join(winner_names) if winner_names else "none"),
        f"\U0001f4b0 LC SCALE: {lc_done} campaigns naik budget",
    ]
    print("\n".join(report_lines))

if __name__ == "__main__":
    main()
