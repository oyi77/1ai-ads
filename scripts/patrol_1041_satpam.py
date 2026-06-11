import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
import urllib.request
import urllib.parse

ACT_ID="act_380721031313330"
API="https://graph.facebook.com/v22.0"
WIB=timezone(timedelta(hours=7))

def _env_token():
    paths = [
        "/home/openclaw/projects/1ai-ads/.env",
        "/home/openclaw/.env",
        "/home/openclaw/projects/1ai-ads/.env.example",
    ]
    found = {}
    for path in paths:
        p = Path(path)
        if not p.exists():
            continue
        for line in p.read_text(errors="ignore").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                found.setdefault(k.strip(), v.strip())
    return found.get("META_ACCESS_TOKEN", "")

TOKEN = _env_token()
if not TOKEN:
    print("ERR TOKEN_MISSING")
    sys.exit(1)


def api_get(url, params=None, retries=3):
    qs = urllib.parse.urlencode(params or {})
    full = f"{url}?{qs}" if qs else url
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(full, method="GET")
            req.add_header("Accept", "application/json")
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read())
        except Exception as exc:
            wait = (attempt + 1) * 4
            last = exc
            print(f"ERR GET: {exc.__class__.__name__}: {exc} wait={wait}s", file=sys.stderr)
            time.sleep(wait)
    print(f"ERR GET FAILED: {last}", file=sys.stderr)
    return {}


def get_campaigns():
    url = f"{API}/{ACT_ID}/campaigns"
    params = {
        "fields": "id,name,status,spend",
        "limit": 200,
        "access_token": TOKEN,
    }
    data = api_get(url, params)
    return data.get("data", [])


def get_insights(since, until):
    url = f"{API}/{ACT_ID}/insights"
    params = {
        "fields": "campaign_id,campaign_name,spend,clicks,ctr,impressions,cpc",
        "time_range": json.dumps({"since": since, "until": until}),
        "level": "campaign",
        "limit": "200",
        "access_token": TOKEN,
    }
    data = api_get(url, params)
    return data.get("data", [])


def detect_shopee_dates():
    since = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    until = datetime.now().strftime("%Y-%m-%d")
    dates = []
    for p in Path("/home/openclaw/projects/1ai-ads/data/shopee").glob("nyamiresep_*.csv"):
        m = __import__("re").search(r"(\d{4}-\d{2}-\d{2})", p.name)
        if m:
            dates.append(m.group(1))
    if dates:
        since = min(dates)
        until = max(dates)
    return since, until


def is_cbo(name):
    n = name.upper()
    return any(p in n for p in ["CBO", "BC_", "LC_", "TC_", "🌟_", "ON_LC_", "ON_BC"])


def main():
    since, until = detect_shopee_dates()
    print(f"DATE_RANGE {since} -> {until}")

    camps = get_campaigns()
    print(f"CAMPAIGNS_FETCHED {len(camps)}")
    ins = get_insights(since, until)
    print(f"INSIGHTS_FETCHED {len(ins)}")
    by_id = {}
    for row in ins:
        cid = row.get("campaign_id") or row.get("id")
        if not cid:
            continue
        by_id[cid] = row

    off_ = 0
    active_low = 0
    killed = 0
    winners = []
    watches = []
    total_spend = 0.0
    tagged = ["rakdapur3", "atayasetelankaosanak"] # known tracked tags

    rows = []
    for c in camps:
        name = c.get("name", "")
        status = c.get("status", "PAUSED")
        if status == "PAUSED" or name.startswith("OFF_") or name.startswith("DEAD_"):
            off_ += 1
            continue

        try:
            spend = float(c.get("spend") or 0)
        except Exception:
            spend = 0.0
        i = by_id.get(c.get("id", ""), {})
        raw_ins_spend = i.get("spend")
        try:
            ins_spend = float(raw_ins_spend or 0)
        except Exception:
            ins_spend = 0.0

        # use insight spend if present else campaign object spend
        use_spend = ins_spend if ins_spend else spend

        cpc = float(i.get("cpc") or 0)
        clicks = int(i.get("clicks") or 0)
        impr = int(i.get("impressions") or 0)
        ctr = float(i.get("ctr") or 0)

        total_spend += use_spend

        cpc_kill = 200
        cpc_danger = 120 if is_cbo(name) else 250

        if cpc > cpc_kill and use_spend > 2000:
            killed += 1
            watches.append(f"{name} [PAUSED/CPC {cpc:.0f} spend {use_spend:,.0f}]")
            continue

        if cpc > cpc_danger and use_spend > 5000:
            watches.append(f"{name} [WATCH_CPC {cpc:.0f}]")
            active_low += 1
            continue

        if ctr < 1 and impr > 1000:
            watches.append(f"{name} [WATCH_CTR {ctr:.2f}%]")
            active_low += 1
            continue

        if clicks and use_spend > 50000 and cpc and cpc < 120:
            winners.append(f"{name} (spend {use_spend:,.0f}, cpc {cpc:.0f}, clicks {clicks}, ctr {ctr:.2f}%)")
            active_low += 1
        else:
            active_low += 1

        rows.append((name, use_spend, cpc, clicks, ctr))

    # dead-tag alert for tracked extinct campaigns
    tag_presence = {t: False for t in ["rakdapur3", "atayasetelankaosanak"]}
    for c in camps:
        low = c.get("name", "").lower()
        for t in tag_presence:
            if t in low:
                tag_presence[t] = True
    dead_tags = [t for t, hit in tag_presence.items() if not hit]

    top = sorted(rows, key=lambda x: (x[3], x[1]), reverse=True)[:20]
    top_lines = []
    for idx, (n, sp, cpc, clk, ctr) in enumerate(top, 1):
        top_lines.append(f"{idx:2d}. {n} | spend {sp:>10,.0f} | clk {clk:>5} | cpc {cpc:>7,.1f} | ctr {ctr:>5.2f}%")

    timestamp = datetime.now(WIB).strftime("%Y-%m-%d %H:%M")
    report = "\n".join([
        f"🛡️ SATPAM 1041 — {timestamp}",
        f"ACTIVE/SCAN: {active_low} | OFF: {off_} | WINNERS: {len(winners)}",
        f"⚠️ ISSUE: {len(watches)} items",
        f"Watch items: {watches}",
        f"🌟 WINNERS: {winners}",
        f"Top campaigns by clicks:",
        *top_lines,
        f"Spend_total(7d insight): Rp{total_spend:,.0f}",
        f"DEAD_TAGLINK_1041: {dead_tags}",
    ])
    print(report)
    Path("/home/openclaw/projects/1ai-ads/outputs").mkdir(parents=True, exist_ok=True)
    Path("/home/openclaw/projects/1ai-ads/outputs/satpam_1041_report.txt").write_text(report)


if __name__ == "__main__":
    raise SystemExit(main())
