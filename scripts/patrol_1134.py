#!/usr/bin/env python3
"""SATPAM PATROL 1134 — Glowscent (act_2125021885010866)"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timedelta

ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"
API = "https://graph.facebook.com/v22.0"
ACT_ID = "act_2125021885010866"

def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN missing")

def api_get(endpoint, params=None, retries=3):
    url = f"{API}/{endpoint}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if e.code == 400 and "user request limit" in body.lower():
                wait = (attempt + 1) * 5
                print(f"[RATE LIMIT] waiting {wait}s (attempt {attempt+1})")
                time.sleep(wait)
                continue
            if e.code == 400 and "Tidak Bisa Mengedit" in body:
                return {}  # rule already deleted
            print(f"[API ERROR] {e.code} {body[:200]}")
            return {}
        except Exception as e:
            print(f"[NET ERROR] {e}")
            time.sleep(2)
    return {}

def api_post(endpoint, data, retries=3):
    data["access_token"] = load_token()
    qs = urllib.parse.urlencode(data).encode()
    url = f"{API}/{endpoint}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=qs, method="POST")
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if e.code == 400 and "user request limit" in body.lower():
                wait = (attempt + 1) * 5
                print(f"[RATE LIMIT POST] waiting {wait}s")
                time.sleep(wait)
                continue
            print(f"[POST ERROR] {e.code} {body[:200]}")
            return {}
        except Exception as e:
            print(f"[NET ERROR POST] {e}")
            time.sleep(2)
    return {}

def rename_campaign(cid, new_name):
    return api_post(cid, {"name": new_name})

def pause_campaign(cid):
    return api_post(cid, {"status": "PAUSED"})

def main():
    token = load_token()
    now = datetime.now()
    ts = now.strftime("%Y-%m-%d %H:%M:%S")
    since = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    until = now.strftime("%Y-%m-%d")

    print(f"[*] SATPAM 1134 — {ts}")
    print(f"[*] Token length: {len(token)}")

    # Pre-flight
    pre = api_get(f"{ACT_ID}", {"fields": "account_name", "access_token": token})
    if "error" in pre:
        print(f"[FATAL] Token/account invalid: {pre['error']}")
        # Still emit report
        print(f"\n🛡️ SATPAM 1134 — {ts}")
        print(f"ACTIVE: 0 | OFF_: 0 | 🌟: 0")
        print(f"⚠️ INVALID TOKEN / ACCOUNT ACCESS")
        print(f"💰 Spend 7d: Rp0")
        return
    print(f"[+] Account: {pre.get('account_name', ACT_ID)}")

    time.sleep(1.5)

    # Fetch campaigns
    camps = api_get(f"{ACT_ID}/campaigns", {
        "fields": "id,name,status,daily_budget,lifetime_budget,spend,cpc",
        "limit": 200,
        "access_token": token
    })
    all_camps = camps.get("data", [])
    print(f"[*] Campaigns fetched: {len(all_camps)}")

    time.sleep(1.5)

    # Fetch insights
    insights = api_get(f"{ACT_ID}/insights", {
        "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
        "level": "campaign",
        "time_range": json.dumps({"since": since, "until": until}),
        "limit": 200,
        "access_token": token
    })
    ins_data = {}
    for row in insights.get("data", []):
        cid = row.get("campaign_id")
        if cid:
            ins_data[cid] = row
    print(f"[*] Insights rows: {len(ins_data)}")

    time.sleep(1.5)

    # Classify
    TRACKED_TAGS = {"abera", "pintulipatgeser", "hijab"}
    
    active_list = []
    off_list = []
    star_list = []
    kill_list = []
    watch_list = []
    
    actions = []  # (cid, action_type, detail)
    
    for c in all_camps:
        cid = c["id"]
        name = c["name"]
        status = c["status"]
        spend = float(c.get("spend", 0) or 0)
        cpc = float(c.get("cpc", 0) or 0)
        ins = ins_data.get(cid, {})
        clicks = int(ins.get("clicks", 0) or 0)
        ctr = float(ins.get("ctr", 0) or 0)
        impr = int(ins.get("impressions", 0) or 0)
        spend_ins = float(ins.get("spend", 0) or 0)
        
        # Use insights spend if available, otherwise campaign spend
        eff_spend = spend_ins if spend_ins > 0 else spend
        
        # Determine type
        name_up = name.upper()
        if "TEST" in name_up or "TESTING" in name_up:
            camp_type = "TEST"
        elif name_up.startswith("ABO"):
            camp_type = "ABO"
        elif name_up.startswith("BIDCAP"):
            camp_type = "BIDCAP"
        elif name_up.startswith(("CBO", "BC_", "LC_", "TC_", "GLW")):
            camp_type = "CBO"
        else:
            camp_type = "CBO"  # default
        
        # OFF_ check
        if name.startswith("OFF_") or name.startswith("DEAD_"):
            off_list.append(name)
            continue
        
        # Layer 1: CPC
        hard_kill = False
        soft_pause = False
        reason = ""
        if cpc > 400 and eff_spend > 2000:
            hard_kill = True
            reason = f"CPC {cpc:.0f} > 400 + spend Rp{eff_spend:,.0f}"
        elif camp_type in ("CBO", "BIDCAP", "LC_") and cpc > 140 and eff_spend > 5000:
            soft_pause = True
            reason = f"CPC {cpc:.0f} > 140 (CBO) + spend Rp{eff_spend:,.0f}"
        elif camp_type in ("ABO", "TEST") and cpc > 250 and eff_spend > 5000:
            soft_pause = True
            reason = f"CPC {cpc:.0f} > 250 (ABO) + spend Rp{eff_spend:,.0f}"
        
        # Layer 2: CTR
        if not hard_kill and not soft_pause:
            if ctr < 1.0 and impr > 1000:
                soft_pause = True
                reason = f"CTR {ctr:.2f}% < 1% + impr {impr:,}"
        
        # Layer 3: Taglink / winner
        has_tag = any(tag in name.lower() for tag in TRACKED_TAGS)
        
        if hard_kill:
            actions.append((cid, "kill", reason))
            kill_list.append(f"{name} ({reason})")
        elif soft_pause:
            actions.append((cid, "pause", reason))
            watch_list.append(f"{name} ({reason})")
        else:
            # Healthy
            active_list.append(name)
            
            # Check winner criteria: CPC < 140 + spend > 50K + clicks > 0
            if cpc < 140 and eff_spend > 50000 and clicks > 0 and has_tag:
                new_name = f"🌟_{name}"
                actions.append((cid, "star", new_name))
                star_list.append(f"{name} → {new_name}")
    
    # Deduplicate active list
    active_list = list(dict.fromkeys(active_list))
    star_list = list(dict.fromkeys(star_list))
    kill_list = list(dict.fromkeys(kill_list))
    watch_list = list(dict.fromkeys(watch_list))
    
    print(f"[*] Actions planned: {len(actions)}")
    
    # Execute actions
    for cid, atype, detail in actions:
        time.sleep(1.5)
        if atype == "kill":
            print(f"[KILL] {cid} -> {detail}")
            rename_campaign(cid, f"OFF_{detail.split('(')[0].strip()}")
            pause_campaign(cid)
        elif atype == "pause":
            print(f"[PAUSE] {cid} -> {detail}")
            pause_campaign(cid)
        elif atype == "star":
            print(f"[STAR] {cid} -> {detail}")
            rename_campaign(cid, detail)
    
    # Compute totals
    total_spend = sum(
        float(ins_data.get(c["id"], {}).get("spend", 0) or 0)
        for c in all_camps
        if not c["name"].startswith("OFF_") and not c["name"].startswith("DEAD_")
    )
    
    report = f"""🛡️ SATPAM 1134 — {ts}
ACTIVE: {len(active_list)} | OFF_: {len(off_list)} | 🌟: {len(star_list)}
⚠️ KILL: {len(kill_list)}
👀 WATCH: {len(watch_list)}
🌟 WINNERS: {len(star_list)}
💰 Spend 7d: Rp{total_spend:,.0f}"""
    
    if kill_list:
        report += "\n\n💀 Killed:\n" + "\n".join(f"  - {k}" for k in kill_list[:20])
    if watch_list:
        report += "\n\n👀 Watch:\n" + "\n".join(f"  - {w}" for w in watch_list[:20])
    if star_list:
        report += "\n\n🌟 Winners:\n" + "\n".join(f"  - {s}" for s in star_list[:20])
    
    # Summary
    report += f"\n✅ Patrol complete. {len(actions)} actions executed."
    
    print("\n" + report)
    
    # Save report
    os.makedirs("data/shopee", exist_ok=True)
    with open(f"data/shopee/patrol_1134_{now.strftime('%Y%m%d_%H%M')}.txt", "w") as f:
        f.write(report)

if __name__ == "__main__":
    main()
