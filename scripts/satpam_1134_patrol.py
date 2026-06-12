#!/usr/bin/env python3
import sys
import json
import os
import urllib.request
import urllib.parse
from datetime import datetime, timedelta

API = "https://graph.facebook.com/v22.0"
ACT = "2125021885010866"
TOKEN_PATH = "/tmp/_tk_1134.txt"
REPORT_PATH = "/home/openclaw/projects/1ai-ads/data/shopee/satpam_1134_latest.json"
SINCE = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
UNTIL = datetime.now().strftime("%Y-%m-%d")


def load_token():
    with open(TOKEN_PATH) as f:
        return f.read().strip()


def fb_get(path, fields=None, **kwargs):
    token = load_token()
    params = {"access_token": token, "limit": 200}
    if fields:
        params["fields"] = fields
    qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    url = f"{API}/{path}?{qs}"
    for k, v in kwargs.items():
        if isinstance(v, (dict, list)):
            url += f"&{k}={urllib.parse.quote(json.dumps(v))}"
        else:
            url += f"&{k}={urllib.parse.quote(str(v))}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e), "data": []}


def classify(name, spend, cpc, ctr, impr, clicks):
    prefix = name.startswith
    if prefix("OFF_") or prefix("DEAD_"):
        return "OFF", ""
    if prefix(("🌟_", "⭐_", "🌙_")):
        return "STAR", ""
    upper_name = name.upper()
    is_cbo = any(p in upper_name for p in ("ON_LC_", "BC_", "LC_", "TC_", "CBO"))
    if cpc > 400 and spend > 2000:
        return "KILL", "CPC>400"
    danger_cbo = 140
    danger_abo = 250
    if is_cbo and cpc > danger_cbo and spend > 5000:
        return "WATCH", f"CPC_DANGER_CBO({cpc:.1f})"
    if not is_cbo and cpc > danger_abo and spend > 5000:
        return "WATCH", f"CPC_DANGER_ABO({cpc:.1f})"
    if ctr < 1 and impr > 1000:
        return "WATCH", "CTR<1%"
    if cpc < 140 and spend > 50000 and clicks > 0:
        return "STAR", "CPC<140+high_spend"
    return "ACTIVE", ""


def main():
    if not os.path.exists(TOKEN_PATH):
        print(f"MISSING_TOKEN:{TOKEN_PATH}")
        sys.exit(2)
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)

    camps = fb_get(
        f"act_{ACT}/campaigns",
        fields="id,name,status,effective_status,daily_budget,lifetime_budget,spend",
    )
    if camps.get("error"):
        report = {
            "timestamp": datetime.now().isoformat(),
            "error": camps["error"],
            "active_count": 0,
            "off_count": 0,
            "star_count": 0,
            "kill": [],
            "watch": [],
            "winners": [],
            "tag_active": {},
            "total_spend_7d": 0,
        }
        with open(REPORT_PATH, "w") as f:
            json.dump(report, f, indent=2)
        print(json.dumps(report, indent=2))
        sys.exit(0)

    all_camps = camps.get("data", [])
    print(f"Total campaigns: {len(all_camps)}")

    insights = fb_get(
        f"act_{ACT}/insights",
        fields="campaign_id,campaign_name,spend,cpc,ctr,clicks,impressions",
        time_range=json.dumps({"since": SINCE, "until": UNTIL}),
        level="campaign",
        limit=200,
    ).get("data", [])

    ins_map = {i["campaign_id"]: i for i in insights}

    active, off, stars, kill, watch = [], [], [], [], []
    total_spend = 0.0

    for c in all_camps:
        cid = c["id"]
        name = c.get("name", "")
        status = c.get("status", "")
        i = ins_map.get(cid, {})
        spend = float(i.get("spend", 0))
        cpc = float(i.get("cpc", 0))
        ctr = float(i.get("ctr", 0))
        clicks = int(i.get("clicks", 0))
        impr = int(i.get("impressions", 0))
        total_spend += spend

        verdict, reason = classify(name, spend, cpc, ctr, impr, clicks)

        if verdict == "OFF":
            off.append(name)
        elif verdict == "STAR":
            stars.append(name)
        elif verdict == "KILL":
            kill.append({
                "name": name,
                "cpc": round(cpc, 1),
                "spend": round(spend, 0),
                "reason": reason,
            })
        elif verdict == "WATCH":
            watch.append({
                "name": name,
                "cpc": round(cpc, 1),
                "spend": round(spend, 0),
                "reason": reason,
            })
        else:
            active.append(name)

    taglinks = ["abera", "pintulipatgeser", "hijab"]
    tag_active = {}
    for t in taglinks:
        matches = [
            c
            for c in all_camps
            if t in c.get("name", "").lower()
            and not c.get("name", "").startswith(("OFF_", "DEAD_", "🌟", "⭐", "🌙"))
            and c.get("status") != "PAUSED"
        ]
        tag_active[t] = len(matches)

    winners = []
    for c in all_camps:
        if c.get("name", "").startswith(("🌟_", "⭐_", "🌙_")):
            cid = c["id"]
            i = ins_map.get(cid, {})
            spend = float(i.get("spend", 0))
            cpc = float(i.get("cpc", 0))
            clicks = int(i.get("clicks", 0))
            ctr = float(i.get("ctr", 0))
            winners.append(
                {
                    "name": c["name"],
                    "spend": round(spend, 0),
                    "cpc": round(cpc, 1),
                    "clicks": clicks,
                    "ctr": round(ctr, 2),
                }
            )

    report = {
        "timestamp": datetime.now().isoformat(),
        "active_count": len(active),
        "off_count": len(off),
        "star_count": len(stars),
        "kill": kill,
        "watch": watch,
        "winners": winners,
        "tag_active": tag_active,
        "total_spend_7d": round(total_spend, 0),
    }

    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2)

    print(
        f"🛡️ SATPAM 1134 — {report['timestamp']}\n"
        f"ACTIVE: {len(active)} | OFF_: {len(off)} | 🌟: {len(stars)}\n"
        f"⚠️ KILL ({len(kill)}):\n"
        + "\n".join(
            [
                f"  {x['name']} | CPC={x['cpc']} spend=Rp{x['spend']:,.0f} | {x['reason']}"
                for x in kill[:10]
            ]
        )
        + (f"\n  ... +{len(kill)-10} more" if len(kill) > 10 else "")
        + f"\n👀 WATCH ({len(watch)}):\n"
        + "\n".join(
            [
                f"  {x['name']} | CPC={x['cpc']} spend=Rp{x['spend']:,.0f} | {x['reason']}"
                for x in watch[:10]
            ]
        )
        + (f"\n  ... +{len(watch)-10} more" if len(watch) > 10 else "")
        + f"\n🌟 WINNERS:\n"
        + "\n".join(
            [
                f"  {x['name']} | CPC={x['cpc']} ctr={x['ctr']}% clicks={x['clicks']} spend=Rp{x['spend']:,.0f}"
                for x in winners[:10]
            ]
        )
        + (f"\n  ... +{len(winners)-10} more" if len(winners) > 10 else "")
        + f"\n🏷️ TAG STATUS (active campaigns per tag): {tag_active}\n"
        + f"💰 Spend 7d: Rp{total_spend:,.0f}\n"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FATAL: {e}", file=sys.stderr)
        sys.exit(1)
