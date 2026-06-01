#!/usr/bin/env python3
"""
CPC Monitor v2 — Account 1041 (Selow ID 1041)
Runs every 5 minutes.
1. PAUSE any active campaign with CPC > 130
2. REACTIVATE paused campaigns if CPC recovered + 1h cooling period

State file: /tmp/cpc_monitor_state.json — tracks pause/reactivation history
"""

import json, requests, sys, os, time
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(os.path.dirname(__file__), "list_ad_accounts.py")) as f:
    ACCESS_TOKEN = f.read().split("ACCESS_TOKEN = '")[1].split("'")[0]

ACT_ID = "act_380721031313330"
CPC_LIMIT = 200
STATE_FILE = "/tmp/cpc_monitor_1041_state.json"
LOG_FILE = os.path.join(os.path.dirname(__file__), "..", "logs", "cpc_monitor_1041.log")

# Reactivation thresholds
REACTIVATE_GAS_CPC = 100  # CPC ≤ 100 + CTR ≥ 5% → GAS
REACTIVATE_OK_CPC = 150  # CPC 100-150 + CTR > 3% → REACTIVE
REACTIVATE_WARN_CPC = 150  # CPC 130-150 + CTR > 5% → cautious reactivate
DEAD_CONFIRMED_CPC = 150  # CPC > 150 → DEAD
CTR_MIN_GAS = 5.0
CTR_MIN_OK = 3.0
CTR_MIN_WARN = 5.0
COOLING_MINUTES = 60
DEATH_PENALTY = 2  # How many times a campaign can be paused before DEAD


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"paused": {}, "reactivated": {}, "death_count": {}}


def save_state(state):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)


def api_get(path, params=None):
    url = f"https://graph.facebook.com/v19.0/{path}"
    p = {"access_token": ACCESS_TOKEN}
    if params:
        p.update(params)
    return requests.get(url, params=p).json()


def api_post(path, data):
    d = {"access_token": ACCESS_TOKEN}
    d.update(data)
    return requests.post(f"https://graph.facebook.com/v19.0/{path}", data=d).json()


def main():
    state = load_state()
    now = datetime.now()
    log("=== CPC MONITOR v2 ===")

    # PART 1: Get ALL campaigns (active + paused recently)
    campaigns = api_get(
        f"{ACT_ID}/campaigns", {"fields": "id,name,status,daily_budget", "limit": 100}
    )

    active_camps = [c for c in campaigns.get("data", []) if c["status"] == "ACTIVE"]
    log(f"Active campaigns: {len(active_camps)}")

    if not active_camps:
        log("No active campaigns.")

    # PART 1: PAUSE campaigns with CPC > 130
    paused_any = False
    for c in active_camps:
        cid = c["id"]
        cname = c["name"]

        insights = api_get(
            f"{cid}/insights",
            {
                "fields": "spend,cpc,ctr,impressions,clicks",
                "date_preset": "today",
                "limit": 1,
            },
        )

        data = insights.get("data", [])
        if data:
            d = data[0]
            spend = int(float(d.get("spend", 0)))
            cpc = float(d.get("cpc", 0))
            ctr = float(d.get("ctr", 0))
            impr = int(d.get("impressions", 0))

            if impr > 0:
                if cpc > CPC_LIMIT:
                    # PAUSE + TRACK death count
                    death_count = state.get("death_count", {}).get(cid, 0) + 1
                    if "death_count" not in state:
                        state["death_count"] = {}
                    state["death_count"][cid] = death_count

                    # Track pause time for reactivation
                    if "paused" not in state:
                        state["paused"] = {}
                    state["paused"][cid] = {
                        "paused_at": now.isoformat(),
                        "cpc_when_paused": cpc,
                        "ctr_when_paused": ctr,
                        "death_count": death_count,
                    }

                    result = api_post(
                        cid,
                        {
                            "name": f'PAUSED_CPC{cpc:.0f}_{cname.replace(" ","_")}',
                            "status": "PAUSED",
                        },
                    )
                    if result.get("success"):
                        paused_any = True
                        log(
                            f"🛑 PAUSED: {cname:50s} | CPC {cpc:.0f} > {CPC_LIMIT} | Strike {death_count}/{DEATH_PENALTY}"
                        )
                    else:
                        log(f"❌ FAILED: {cname} - {result}")
                elif cpc > 0:
                    log(
                        f"  ✅ {cname:50s} | Spend: {spend:>7,} | CPC: {cpc:>5.0f} | CTR: {ctr:>5.2f}%"
                    )

    # PART 2: REACTIVATE campaigns that were paused but might have recovered
    for cid, pause_info in list(state.get("paused", {}).items()):
        paused_at = datetime.fromisoformat(pause_info["paused_at"])
        minutes_since_pause = (now - paused_at).total_seconds() / 60
        death_count = pause_info.get("death_count", 1)

        # Skip if cooling period hasn't passed OR already DEAD (2 strikes)
        if death_count > DEATH_PENALTY:
            continue

        if minutes_since_pause < COOLING_MINUTES:
            continue

        # Check current CPC — the campaign might still be paused
        insights = api_get(
            f"{cid}/insights",
            {
                "fields": "spend,cpc,ctr,impressions,clicks",
                "date_preset": "today",
                "limit": 1,
            },
        )

        data = insights.get("data", [])
        if not data:
            continue

        d = data[0]
        cpc = float(d.get("cpc", 0))
        ctr = float(d.get("ctr", 0))
        impr = int(d.get("impressions", 0))

        if impr == 0 or cpc == 0:
            # Still no new data — skip
            continue

        cname = pause_info.get("name", cid)

        # Reactivation decision
        if cpc <= REACTIVATE_GAS_CPC and ctr >= CTR_MIN_GAS:
            # GAS — reactive + scale
            orig_name = pause_info.get(
                "original_name", cname.replace("PAUSED_", "").replace("DEAD_", "")
            )
            result = api_post(
                cid, {"name": f"REACTIVATED_{orig_name}", "status": "ACTIVE"}
            )
            if result.get("success"):
                del state["paused"][cid]
                log(
                    f"🟢 GAS REACTIVATE: {cname:50s} | CPC {cpc:.0f} | CTR {ctr:.2f}% | Strike {death_count}"
                )

        elif cpc <= REACTIVATE_OK_CPC and ctr >= CTR_MIN_OK:
            # OK — reactive normal
            result = api_post(cid, {"status": "ACTIVE"})
            if result.get("success"):
                del state["paused"][cid]
                log(
                    f"🟡 REACTIVATE: {cname:50s} | CPC {cpc:.0f} | CTR {ctr:.2f}% | Strike {death_count}"
                )

        elif cpc <= REACTIVATE_WARN_CPC and ctr >= CTR_MIN_WARN:
            # Cautious reactivate
            result = api_post(cid, {"status": "ACTIVE"})
            if result.get("success"):
                del state["paused"][cid]
                log(
                    f"⚠️ CAUTIOUS REACTIVATE: {cname:50s} | CPC {cpc:.0f} | CTR {ctr:.2f}% | Strike {death_count}"
                )

        elif cpc > DEAD_CONFIRMED_CPC or ctr < CTR_MIN_OK:
            # DEAD confirmed
            death_count_entry = state.get("death_count", {}).get(cid, 0)
            if death_count_entry >= DEATH_PENALTY:
                result = api_post(
                    cid,
                    {
                        "name": f'DEAD_CONFIRMED_CPC{cpc:.0f}_{cname.replace("PAUSED_","").replace(" ","_")}',
                        "status": "PAUSED",
                    },
                )
                if result.get("success"):
                    del state["paused"][cid]
                    log(
                        f"💀 DEAD CONFIRMED: {cname:50s} | CPC {cpc:.0f} still > {DEAD_CONFIRMED_CPC} after {COOLING_MINUTES}m"
                    )

    # PART 3: Summary
    if not paused_any:
        log("✅ No campaigns need pausing.")

    save_state(state)
    log("=== MONITOR COMPLETE ===")


if __name__ == "__main__":
    main()
