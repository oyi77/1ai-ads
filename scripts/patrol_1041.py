#!/usr/bin/env python3
import os
import re
import time
import json
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlsplit, parse_qsl, urlunsplit, urlencode

API = "https://graph.facebook.com/v22.0"
ACT = "act_380721031313330"
TMP_TOKEN = "/tmp/_tk_clean.txt"
OUT_DIR = "/home/openclaw/projects/1ai-ads/data/brain"
TODAY = datetime.now(timezone.utc).date()
SINCE = (TODAY - timedelta(days=7)).isoformat()
UNTIL = TODAY.isoformat()
TAGLINKS = ["rakdapur", "rakdapur3", "atayasetelankaosanak"]


def token():
    return open(TMP_TOKEN).read().strip()


def api_get(url, params=None):
    p = dict(params or {})
    p["access_token"] = token()
    sp = urlsplit(url)
    q = dict(parse_qsl(sp.query))
    q.update(p)
    url = urlunsplit((sp.scheme, sp.netloc, sp.path, urlencode(q), sp.fragment))
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(4):
        try:
            with urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except HTTPError as e:
            msg = ""
            try:
                msg = e.read().decode("utf-8", errors="ignore")[:500]
            except Exception:
                pass
            code = getattr(e, "code", 0)
            if code == 400 and "2446079" in msg:
                time.sleep((attempt + 1) * 5)
                continue
            raise SystemExit(f"GET fail => {code} {msg}")
    raise SystemExit("retry exhausted")


def api_post(url, data):
    p = dict(data)
    p["access_token"] = token()
    sp = urlsplit(url)
    q = dict(parse_qsl(sp.query))
    q.update(p)
    url = urlunsplit((sp.scheme, sp.netloc, sp.path, urlencode(q), sp.fragment))
    req = Request(url, method="POST", headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def fetch_campaigns():
    params = {
        "fields": "id,name,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,spend,cpc",
        "limit": "200",
    }
    url = f"{API}/{ACT}/campaigns"
    data = api_get(url, params)
    return data.get("data", [])


def fetch_insights():
    params = {
        "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
        "time_range[since]": SINCE,
        "time_range[until]": UNTIL,
        "level": "campaign",
        "limit": "200",
    }
    url = f"{API}/{ACT}/insights"
    data = api_get(url, params)
    return data.get("data", [])


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    tok = token()
    print(f"[patrol1041] token_len={len(tok)}")
    print(f"[patrol1041] date_range={SINCE} -> {UNTIL}")

    camps = fetch_campaigns()
    print(f"[patrol1041] campaigns_total={len(camps)}")

    insights = fetch_insights()
    print(f"[patrol1041] insights_rows={len(insights)}")

    ins = {}
    for row in insights:
        cid = row.get("campaign_id")
        if cid:
            ins[cid] = row

    records = []
    for c in camps:
        cid = c["id"]
        r = ins.get(cid, {})

        def pick(*keys, default=0):
            for k in keys:
                v = r.get(k)
                if v is not None:
                    try:
                        if isinstance(v, str):
                            v = float(v) if "." in str(v) else int(v)
                        return v
                    except Exception:
                        pass
            return default

        rec = {
            "campaign_id": cid,
            "campaign_name": r.get("campaign_name") or c.get("name"),
            "status": c.get("effective_status") or c.get("status") or "UNKNOWN",
            "spend": float(pick("spend", default=c.get("spend") or 0)),
            "cpc": float(pick("cpc", default=c.get("cpc") or 0)),
            "clicks": int(pick("clicks", default=c.get("clicks") or 0)),
            "impressions": int(pick("impressions", default=c.get("impressions") or 0)),
            "ctr": float(pick("ctr", default=0)),
            "start_time": c.get("start_time"),
            "daily_budget": c.get("daily_budget"),
        }
        records.append(rec)

    active = [x for x in records if str(x["status"]).upper() == "ACTIVE"]
    paused_pre = [x for x in records if str(x["status"]).upper() == "PAUSED"]
    off = [x for x in records if (x["campaign_name"] or "").startswith(("OFF_", "DEAD_"))]
    other = [x for x in records if x not in active + paused_pre + off]
    print(f"[patrol1041] active={len(active)} paused_pre={len(paused_pre)} off={len(off)} other={len(other)}")

    pausable = []
    keep = []
    now = datetime.now(timezone.utc)
    for x in active:
        st = dt(x["start_time"])
        if not st:
            keep.append({**x, "reason": "no_start_time"})
            continue
        hours = (now - st).total_seconds() / 3600.0
        if hours < 24:
            keep.append({**x, "reason": f"hours={hours:.1f}<24"})
            continue
        if x["spend"] < 5000:
            keep.append({**x, "reason": f"spend={x['spend']:.0f}<5000"})
            continue
        if x["cpc"] <= 120:
            keep.append({**x, "reason": f"cpc={x['cpc']:.0f}<=120"})
            continue
        pausable.append({**x, "hours": hours})

    print(f"[patrol1041] pause_candidates={len(pausable)} safe_active={len(keep)}")

    paused_ids = []
    fail_pause = []
    for x in pausable:
        name = x["campaign_name"]
        cid = x["campaign_id"]
        try:
            raw = api_post(f"{API}/{cid}", {"status": "PAUSED"})
            if str(raw.get("success", "")).lower() != "true":
                fail_pause.append(cid)
                print(f"[patrol1041] pause_conflict {name}: api_post={raw}")
                continue
            check = api_get(f"{API}/{cid}", {"fields": "name,status"})
            status = check.get("status") or ""
            if str(status).upper() == "PAUSED":
                paused_ids.append(cid)
                print(f"[patrol1041] paused {name} ({cid}) cpc={x['cpc']:.0f} spend={x['spend']:.0f}")
            else:
                fail_pause.append(cid)
                print(f"[patrol1041] pause_verify_fail {name}: {check}")
        except Exception as e:
            fail_pause.append(cid)
            print(f"[patrol1041] pause_exception {name}: {e}")
        time.sleep(1.5)

    active_post = [x for x in records if str(x["status"]).upper() == "ACTIVE"]
    paused_post = [x for x in records if str(x["status"]).upper() == "PAUSED"]

    tag_counts = {t: 0 for t in TAGLINKS}
    tag_spend = {t: 0.0 for t in TAGLINKS}
    tag_cpcs = {t: [] for t in TAGLINKS}
    for x in active_post + keep + paused_pre:
        n = (x["campaign_name"] or "").lower().replace(" ", "_")
        for t in TAGLINKS:
            if t in n:
                tag_counts[t] += 1
                tag_spend[t] += x["spend"]
                if x["cpc"]:
                    tag_cpcs[t].append(x["cpc"])

    tag_health = {}
    for t in TAGLINKS:
        arr = tag_cpcs[t]
        avg = sum(arr) / len(arr) if arr else 0.0
        tag_health[t] = {
            "active": tag_counts[t],
            "status": "🔴 DEAD TAGLINK" if tag_counts[t] == 0 else "🟢 OK",
            "avg_cpc": avg,
            "total_spend": tag_spend[t],
        }

    scale = [x for x in active_post + keep if x["cpc"] < 80 and x["spend"] > 100000 and x["clicks"] > 100]

    report = {
        "account": ACT,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "date_range": {"since": SINCE, "until": UNTIL},
        "summary": {
            "total_campaigns": len(records),
            "active": len(active_post),
            "paused_pre": len(paused_pre),
            "paused_post": len(paused_post),
            "off_dead": len(off),
            "other": len(other),
        },
        "pause_sweep": {
            "candidates": len(pausable),
            "paused_now": len(paused_ids),
            "failed": len(fail_pause),
            "details": [
                {
                    "campaign_id": x["campaign_id"],
                    "campaign_name": x["campaign_name"],
                    "cpc": x["cpc"],
                    "spend": x["spend"],
                    "hours": x.get("hours"),
                }
                for x in pausable
            ],
        },
        "taglink_health": tag_health,
        "scale_opportunities": [
            {
                "campaign_id": x["campaign_id"],
                "campaign_name": x["campaign_name"],
                "cpc": x["cpc"],
                "spend": x["spend"],
                "clicks": x["clicks"],
            }
            for x in scale
        ],
    }
    out = os.path.join(OUT_DIR, f"laporan_patrol_1041_{UNTIL}.json")
    with open(out, "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"[patrol1041] saved {out}")

    lines = [
        f"SATPAM 1041 — {UNTIL}",
        f"Campaigns: {len(records)} total | ACTIVE {len(active_post)} | PAUSED {len(paused_post)} | OFF_/DEAD {len(off)} | OTHER {len(other)}",
        f"CPC sweep: {len(pausable)} paused, {len(paused_ids)} confirmed, {len(fail_pause)} failed.",
        "Taglink health:",
    ]
    for t in TAGLINKS:
        th = tag_health[t]
        lines.append(
            f"- {t}: {'🔴 DEAD TAGLINK' if th['active'] == 0 else '🟢 OK'} | active {th['active']} | avg CPC Rp {th['avg_cpc']:.0f} | spend Rp {th['total_spend']:.0f}"
        )
    if scale:
        lines.append("Scale opportunity:")
        for x in scale:
            lines.append(
                f"- {x['campaign_name']}: CPC Rp {x['cpc']:.0f} | spend Rp {x['spend']:.0f} | clicks {x['clicks']}"
            )
    else:
        lines.append("Scale opportunity: None")
    if fail_pause:
        lines.append(f"[patrol1041] {len(fail_pause)} pause gagal, cek laporan JSON.")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
