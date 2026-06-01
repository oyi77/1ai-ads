#!/usr/bin/env python3
"""
CPC Monitor v4 — Multi-Account (1041 + 0858)
Every 5 min:
1. PAUSE campaign with CPC > 150
2. REACTIVATE paused campaigns if CPC recovered (60min cooling)
3. REACTIVATE DEAD/OFF campaigns if TODAY's data shows CPC ≤ 150 (rename to CBO_ON)
4. Set ALL active campaigns to Rp 500K budget (not divided)
5. Alert via Telegram

Rules:
  CPC > 150 → PAUSE
  CPC ≤ 100 + CTR ≥ 5% → GAS reactivate
  CPC 100-130 + CTR > 3% → REACTIVE
  CPC 130-150 + CTR > 3.5% → CAUTIOUS reactivate
  2 strikes → DEAD permanent
  DEAD/OFF with good CPC today → CBO_ON + reactivate
"""

import json, requests, sys, os, re
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meta_base import TOKEN, api_get, api_post, log, ACCOUNTS

# ─── CONFIG ───
STATE_FILE = "/tmp/cpc_monitor_state.json"
LOG_FILE = os.path.join(os.path.dirname(__file__), "..", "logs", "cpc_monitor.log")
DEFAULT_BUDGET = 500000  # Rp 500K per campaign (Veris rule)

CPC_LIMIT = 150
COOLING_MIN = 60
DEATH_LIMIT = 2

GAS_CPC = 100
OK_CPC = 130
WARN_CPC = 150
CTR_GAS = 5.0
CTR_OK = 3.0
CTR_WARN = 3.5


# ─── STATE ───
def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"paused": {}, "death_count": {}}


def save_state(state):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)


def get_insights(cid, preset="today"):
    data = api_get(
        f"{cid}/insights",
        {
            "fields": "spend,cpc,ctr,impressions,clicks",
            "date_preset": preset,
            "limit": 1,
        },
    )
    rows = data.get("data", [])
    return rows[0] if rows else None


def alert(msg):
    print(f"📱 {msg}")


def clean_name(name):
    """Remove prefixes for clean naming"""
    for prefix in ["DEAD_", "OFF_", "OFF", "PAUSED_", "P1_", "P2_", "CPC178_", "CPC"]:
        if name.startswith(prefix):
            name = name[len(prefix) :]
    return name.strip("_ ")


# ─── CHECK DEAD/OFF CAMPAIGNS ───
def scan_dead_campaigns(act_id, act_label, state):
    """Check DEAD/OFF campaigns — use ONE API call for all campaigns (account-level insights)"""
    # Single API call to get today's data for ALL campaigns at once
    insights = api_get(
        f"{act_id}/insights",
        {
            "fields": "campaign_id,campaign_name,spend,cpc,ctr,impressions,clicks",
            "date_preset": "today",
            "level": "campaign",
            "limit": 50,
        },
    )

    rows = insights.get("data", [])
    if not rows:
        return

    reactivated_count = 0
    for d in rows:
        if reactivated_count >= 5:
            break

        cid = d.get("campaign_id", "")
        cname = d.get("campaign_name", "")

        # Only check campaigns with DEAD/OFF in name
        if not any(p in cname for p in ["DEAD", "OFF"]):
            continue
        # Skip if already tracked in paused state
        if cid in state.get("paused", {}):
            continue

        cpc = float(d.get("cpc", 0))
        ctr = float(d.get("ctr", 0))
        impr = int(d.get("impressions", 0))

        if impr > 0 and cpc > 0 and cpc <= CPC_LIMIT and ctr >= CTR_OK:
            new_name = f"CBO_ON_{clean_name(cname)}"[:50]
            result = api_post(
                cid,
                {"name": new_name, "status": "ACTIVE", "daily_budget": DEFAULT_BUDGET},
            )
            if result.get("success"):
                reactivated_count += 1
                log(
                    f"🔄 [{act_label}] DEAD→CBO_ON: {cname[:40]:40s} | CPC {cpc:.0f} | CTR {ctr:.2f}%",
                    LOG_FILE,
                )
                alert(f"🔄 [{act_label}] {cname[:30]} → CBO_ON (CPC {cpc:.0f})")


# ─── PAUSE ───
def check_and_pause(cid, cname, act_label, state):
    insights = get_insights(cid)
    if not insights:
        return False

    cpc = float(insights.get("cpc", 0))
    ctr = float(insights.get("ctr", 0))
    impr = int(insights.get("impressions", 0))
    spend = int(float(insights.get("spend", 0)))

    if impr == 0:
        return False

    if cpc > CPC_LIMIT:
        dc = state.get("death_count", {}).get(cid, 0) + 1
        if "death_count" not in state:
            state["death_count"] = {}
        state["death_count"][cid] = dc
        if "paused" not in state:
            state["paused"] = {}
        state["paused"][cid] = {
            "paused_at": datetime.now().isoformat(),
            "cpc": cpc,
            "ctr": ctr,
            "spend": spend,
            "death_count": dc,
            "account": act_label,
            "name": cname,
        }

        result = api_post(
            cid,
            {
                "name": f"PAUSED_CPC{cpc:.0f}_{clean_name(cname)}"[:50],
                "status": "PAUSED",
            },
        )
        if result.get("success"):
            log(
                f"🛑 [{act_label}] PAUSED: {cname[:40]} | CPC {cpc:.0f} | Strike {dc}",
                LOG_FILE,
            )
            if dc >= DEATH_LIMIT:
                alert(f"💀 [{act_label}] {cname[:30]} DEAD — {dc}x pause")
            return spend
    else:
        log(
            f"  ✅ [{act_label}] {cname[:45]:45s} | CPC {cpc:>5.0f} | CTR {ctr:>5.2f}%",
            LOG_FILE,
        )

    return False


# ─── REACTIVATE ───
def check_and_reactivate(state):
    now = datetime.now()
    for cid, info in list(state.get("paused", {}).items()):
        dc = info.get("death_count", 1)
        paused_at = datetime.fromisoformat(info["paused_at"])
        mins = (now - paused_at).total_seconds() / 60
        label = info.get("account", "?")
        name = info.get("name", cid)

        if dc > DEATH_LIMIT:
            continue
        if mins < COOLING_MIN:
            continue

        insights = get_insights(cid)
        if not insights:
            continue

        cpc = float(insights.get("cpc", 0))
        ctr = float(insights.get("ctr", 0))
        impr = int(insights.get("impressions", 0))

        if impr == 0 or cpc == 0:
            continue

        if cpc <= GAS_CPC and ctr >= CTR_GAS:
            new_name = f"CBO_ON_{clean_name(name)}"[:50]
            api_post(
                cid,
                {"name": new_name, "status": "ACTIVE", "daily_budget": DEFAULT_BUDGET},
            )
            del state["paused"][cid]
            log(
                f"🟢 [{label}] GAS: {name[:30]} → CPC {cpc:.0f} | CTR {ctr:.2f}%",
                LOG_FILE,
            )
        elif cpc <= OK_CPC and ctr >= CTR_OK:
            new_name = f"CBO_ON_{clean_name(name)}"[:50]
            api_post(
                cid,
                {"name": new_name, "status": "ACTIVE", "daily_budget": DEFAULT_BUDGET},
            )
            del state["paused"][cid]
            log(f"🟡 [{label}] REACTIVATE: {name[:30]} → CPC {cpc:.0f}", LOG_FILE)
        elif cpc <= WARN_CPC and ctr >= CTR_WARN:
            new_name = f"CBO_ON_{clean_name(name)}"[:50]
            api_post(
                cid,
                {"name": new_name, "status": "ACTIVE", "daily_budget": DEFAULT_BUDGET},
            )
            del state["paused"][cid]
            log(f"⚠️ [{label}] CAUTIOUS: {name[:30]} → CPC {cpc:.0f}", LOG_FILE)
        else:
            new_name = f"DEAD_{clean_name(name)}"[:50]
            api_post(cid, {"name": new_name, "status": "PAUSED"})
            del state["paused"][cid]
            log(f"💀 [{label}] DEAD: {name[:30]} | CPC {cpc:.0f} still > 150", LOG_FILE)


# ─── ENSURE BUDGET ───
def ensure_budgets(act_id, act_label):
    """Set ALL active campaigns to Rp 500K"""
    camps = api_get(
        f"{act_id}/campaigns", {"fields": "id,name,status,daily_budget", "limit": 100}
    )
    active = [c for c in camps.get("data", []) if c["status"] == "ACTIVE"]

    for c in active:
        current = int(c.get("daily_budget", 0))
        if current != DEFAULT_BUDGET:
            result = api_post(c["id"], {"daily_budget": DEFAULT_BUDGET})
            if result.get("success"):
                log(
                    f"💰 [{act_label}] {c['name'][:35]:35s} Rp{current:,} → Rp{DEFAULT_BUDGET:,}",
                    LOG_FILE,
                )


# ─── MAIN ───
def main():
    state = load_state()
    log("=" * 50, LOG_FILE)
    log("🚀 CPC MONITOR v4", LOG_FILE)

    for act_id, act_cfg in ACCOUNTS.items():
        label = act_cfg["name"]
        camps = api_get(
            f"{act_id}/campaigns",
            {"fields": "id,name,status,daily_budget", "limit": 100},
        )
        active = [c for c in camps.get("data", []) if c["status"] == "ACTIVE"]

        log(f"\n── {label} — {len(active)} active ──", LOG_FILE)

        # Step 1: Check DEAD/OFF campaigns for good data today
        scan_dead_campaigns(act_id, label, state)

        # Step 2: Check ACTIVE campaigns for CPC > limit
        for c in active:
            check_and_pause(c["id"], c["name"], label, state)

        # Step 3: Ensure budgets
        ensure_budgets(act_id, label)

    # Step 4: Reactivate cooled-off campaigns
    check_and_reactivate(state)

    save_state(state)
    log("✅ Monitor complete", LOG_FILE)


if __name__ == "__main__":
    main()
