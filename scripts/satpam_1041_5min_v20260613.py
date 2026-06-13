#!/usr/bin/env python3
"""SATPAM 1041 — 5 MINIT patrol (v2026-06-13)
Rules:
- Global CPC gate from account insights (today)
- AMAN (global_cpc < 120): NO kill/pause. Report MONSTER + WINNER candidate + LC SCALE + spend.
- WASPADA (global_cpc >= 120): MONSTER pause+OFF, WATCH pause, WINNER report.
- Always report. No silent runs.
"""
import json
import os
import time
import urllib.request
import urllib.parse
import datetime
from pathlib import Path

API = "https://graph.facebook.com/v22.0"
ACT_ID = "act_380721031313330"
OUT_PATH = "/tmp/_sATPAM_1041_5min.txt"
DAILY_BUDGET_LC = 20000
BUDGET_INCREASE_PCT = 20
BUDGET_MAX = 50000
CPC_MONSTER = 500
SPEND_MONSTER = 1000
CPC_MONSTER2 = 1000
SPEND_MONSTER2 = 500
CPC_WATCH = 200
SPEND_WATCH = 500
CPC_WINNER = 120
CLICKS_WINNER = 5
SPEND_WINNER = 10000
CPC_GLOBAL_GATE = 120


def log(msg):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)


def load_token():
    path = "/home/openclaw/projects/1ai-ads/.env"
    for line in Path(path, encoding="utf-8").read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN missing from .env")


TOKEN = load_token()


def fb_get(endpoint, fields=None, params=None):
    url = f"{API}/{endpoint}"
    q = {"access_token": TOKEN}
    if fields:
        q["fields"] = fields
    if params:
        q.update(params)
    url = f"{url}?{urllib.parse.urlencode(q)}"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def fb_post(endpoint, data):
    url = f"{API}/{endpoint}"
    data["access_token"] = TOKEN
    qs = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=qs, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def today_range():
    today = datetime.date.today().isoformat()
    return today, today


def adset_lc_like(name: str) -> bool:
    n = (name or "").upper()
    return "LC" in n


def set_budget(campaign_id, old_budget, tag):
    new_budget = int(old_budget * (1 + BUDGET_INCREASE_PCT / 100.0))
    new_budget = min(new_budget, BUDGET_MAX)
    if new_budget == old_budget:
        return old_budget, False
    try:
        fb_post(f"{campaign_id}", {"daily_budget": new_budget})
        return new_budget, True
    except Exception as e:
        log(f"❌ Budget update failed for {tag or campaign_id}: {e}")
        return old_budget, False


def main():
    now = datetime.datetime.now().isoformat(timespec="seconds")
    since, until = today_range()
    log(f"=== SATPAM 1041 5MIN | {now} ===")
    log(f"Target act: {ACT_ID}")

    # Account insights for global CPC gate
    account_cpc = None
    account_spend = 0
    account_clicks = 0
    try:
        acc = fb_get(
            f"{ACT_ID}/insights",
            fields="spend,clicks,cpc",
            params={
                "time_range": json.dumps({"since": since, "until": until}),
                "level": "account",
                "limit": 1,
            },
        )
        rows = acc.get("data", [])
        if rows:
            r = rows[0]
            account_spend = int(float(r.get("spend", 0) or 0))
            account_clicks = int(float(r.get("clicks", 0) or 0))
            if account_clicks > 0 and account_spend > 0:
                account_cpc = account_spend / account_clicks
    except Exception as e:
        log(f"⚠️ Account insights unavailable: {e}")

    report = []
    report.append(f"🛡️ SATPAM 1041 {now}")
    mode = "AMAN" if (account_cpc is None or account_cpc < CPC_GLOBAL_GATE) else "WASPADA"
    cpc_str = f"Rp{account_cpc:,.0f}" if account_cpc is not None else "Rp?"
    report.append(f"ACTIVE:- | Global CPC:{cpc_str} | Spend today:{account_spend:,} | Clicks today:{account_clicks:,} | Mode:{mode}")

    monsters = []
    watches = []
    winners = []
    lc_scaled = []

    try:
        camps = fb_get(f"{ACT_ID}/campaigns", fields="id,name,status,daily_budget", params={"limit": 200})
    except Exception as e:
        log(f"⚠️ Campaign list fetch failed: {e}")
        camps = {"data": []}

    all_ids = [c["id"] for c in camps.get("data", [])]
    insights_map = {}
    if all_ids:
        try:
            ins = fb_get(
                f"{ACT_ID}/insights",
                fields="campaign_id,campaign_name,spend,cpc,clicks,ctr",
                params={
                    "time_range": json.dumps({"since": since, "until": until}),
                    "level": "campaign",
                    "limit": 200,
                    "filtering": json.dumps([
                        {"field": "campaign.id", "operator": "IN", "value": all_ids[:50]}
                    ]),
                },
            )
            for r in ins.get("data", []):
                insights_map[r.get("campaign_id")] = r
        except Exception as e:
            log(f"⚠️ Insights fetch failed: {e}")

    for c in camps.get("data", []):
        cid = c["id"]
        if c.get("status") != "ACTIVE":
            continue
        if c.get("name", "").startswith("OFF_"):
            continue
        name = c.get("name", "")
        tag = name.split("_")[0] if "_" in name else ""
        r = insights_map.get(cid, {})
        cpc = float(r.get("cpc", 0) or 0)
        spend = int(float(r.get("spend", 0) or 0))
        clicks = int(float(r.get("clicks", 0) or 0))
        ctr = float(r.get("ctr", 0) or 0)
        budget = c.get("daily_budget")

        if adset_lc_like(name):
            if mode == "AMAN":
                lc_scaled.append((name, budget))
            else:
                if cpc < CPC_WINNER and clicks > 0:
                    winners.append((name, cpc, spend, clicks))

        if mode == "WASPADA":
            if cpc >= CPC_MONSTER and spend > SPEND_MONSTER:
                monsters.append((name, cpc, spend))
                try:
                    fb_post(f"{cid}", {"status": "PAUSED"})
                    log(f"💀 PAUSED MONSTER: {name} | CPC {cpc:.0f} | Spend {spend:,}")
                except Exception as e:
                    log(f"❌ Pause failed {name}: {e}")
                time.sleep(1.0)
            if cpc >= CPC_MONSTER2 and spend > SPEND_MONSTER2:
                monsters.append((name, cpc, spend))
                try:
                    fb_post(f"{cid}", {"status": "PAUSED"})
                    log(f"💀 PAUSED MONSTER2: {name} | CPC {cpc:.0f} | Spend {spend:,}")
                except Exception as e:
                    log(f"❌ Pause failed {name}: {e}")
                time.sleep(1.0)
            if not any(m[0] == name for m in monsters):
                if cpc > CPC_WATCH and clicks == 0 and spend > SPEND_WATCH:
                    watches.append((name, cpc, spend))
                    try:
                        fb_post(f"{cid}", {"status": "PAUSED"})
                        log(f"👀 PAUSED WATCH: {name} | CPC {cpc:.0f} | Spend {spend:,}")
                    except Exception as e:
                        log(f"❌ Watch pause failed {name}: {e}")
                    time.sleep(1.0)
                elif cpc < CPC_WINNER and clicks >= CLICKS_WINNER and spend >= SPEND_WINNER:
                    winners.append((name, cpc, spend, clicks))
        else:
            if cpc >= CPC_MONSTER and spend > SPEND_MONSTER:
                monsters.append((name, cpc, spend))
            if cpc >= CPC_MONSTER2 and spend > SPEND_MONSTER2:
                monsters.append((name, cpc, spend))

        lc_skip.append((name, budget, "matched LC target"))

    # Handle LC policy: AMAN = scale all; WASPADA = only winners
    lc_scaled = []
    lc_candidates_aman = []
    lc_candidates_waspada_winners = []
    if mode == "AMAN":
        lc_candidates_aman = lc_candidates
    else:
        lc_candidates_waspada_winners = winners

    lc_apply = lc_candidates_aman or lc_candidates_waspada_winners
    if lc_apply:
        id_by_name = {c.get("name"): c.get("id") for c in camps.get("data", [])}
        for name, old_budget, _ in lc_apply:
            try:
                cid = id_by_name.get(name)
                if not cid:
                    log(f"⚠️ LC campaign id not found for {name}")
                    continue
                old = int(old_budget) if old_budget is not None else DAILY_BUDGET_LC
                new_budget, changed = set_budget(cid, old, name)
                if changed:
                    lc_scaled.append((name, old, new_budget))
            except Exception as e:
                log(f"❌ LC scale failed {name}: {e}")
            time.sleep(1.5)

    monsters_str = "; ".join([f"{n}(CPC {c:,.0f} Spend {s:,})" for n, c, s in monsters])
    watches_str = "; ".join([f"{n}(CPC {c:,.0f} Spend {s:,})" for n, c, s in watches])
    winners_str = "; ".join([f"{n} [CPC {c:,.0f} Spend {s:,} Clicks {cl}]" for n, c, s, cl in winners])
    lc_str = f"{len(lc_scaled)} kampanye scaled"
    lc_skip_str = f"{len(lc_skip)} skipped" if lc_skip else "0"

    report.append(f"💀 MONSTER: {monsters_str}")
    report.append(f"👀 WATCH: {watches_str}")
    report.append(f"🌟 WINNER: {winners_str}")
    report.append(f"💰 LC SCALE: {lc_str}")
    report.append("----------")
    report.append(f"Global spend today: {account_spend:,} | Clicks: {account_clicks:,} | CPC: {cpc_str} | Mode: {mode}")

    final = "\n".join(report)
    Path(OUT_PATH).write_text(final, encoding="utf-8")
    log("--- REPORT ---")
    for line in report:
        log(line)
    return final


if __name__ == "__main__":
    main()
