#!/usr/bin/env python3
"""
SATPAM UNIFIED — 3 Account Patrol
==================================
Standalone script for all 3 ad accounts.
Can run via cron or manually.

Rules (CPR = Cost Per Outbound Click, data = last 7 days excluding today):
  1. CPR 7d < 130 AND clicks 7d > 1  → ON
  2. CPR 7d > 130 AND clicks 7d > 5  → OFF
  3. clicks 7d > 0 AND CPR 7d < 130  → ON
  4. spend 7d > 130 AND clicks 7d = 0 → OFF

Spend cap: Rp 300,000/day per account (today's data)
OFF_ campaigns = never touched
"""
import json
import time
import datetime
import urllib.request
import urllib.parse
import urllib.error
import sys
import sqlite3

# ── Ad Accounts ──────────────────────────────────────────────
ACCOUNTS = [
    {"id": "435670549443081", "name": "0858"},
    {"id": "380721031313330", "name": "1041"},
    {"id": "1181078009580337", "name": "1340"},
]

API_BASE = "https://graph.facebook.com/v22.0"
DB_PATH = "/home/openclaw/projects/1ai-ads/db/users/adforge_user_899de8e4.db"

# ── Thresholds ───────────────────────────────────────────────
CPR_THRESHOLD = 130  # Rp 130 per click
SPEND_KILL = 130  # Rp 130 spend with 0 clicks
SPEND_CAP = 300_000  # Rp 300K per day per account

TOKEN = None


def load_token():
    """Load token from database."""
    global TOKEN
    if TOKEN:
        return TOKEN
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        'SELECT credentials FROM platform_accounts WHERE platform = ? AND is_active = 1 LIMIT 1',
        ('meta',)
    ).fetchone()
    conn.close()
    if row and row[0]:
        TOKEN = row[0]
        return TOKEN
    raise RuntimeError("No active Meta token found in database")


def api_get(act_id, endpoint, params=None):
    token = load_token()
    qs = urllib.parse.urlencode(params or {})
    url = f"{API_BASE}/act_{act_id}/{endpoint}?{qs}&access_token={urllib.parse.quote(token)}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"_http_error": e.code, "_body": e.read().decode()}


def api_post(act_id, campaign_id, data):
    token = load_token()
    payload = dict(data)
    payload["access_token"] = token
    url = f"{API_BASE}/{campaign_id}"
    qs = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(url, data=qs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"_http_error": e.code, "_body": e.read().decode()}


def fetch_campaigns(act_id):
    """Fetch all campaigns with status."""
    data = api_get(act_id, "campaigns", {"fields": "id,name,status", "limit": "500"})
    return data.get("data", [])


def fetch_insights_today(act_id):
    """Fetch today's insights with outbound_clicks."""
    today = datetime.date.today().isoformat()
    data = api_get(act_id, "insights", {
        "fields": "campaign_id,spend,outbound_clicks,cost_per_outbound_click",
        "level": "campaign",
        "time_range": json.dumps({"since": today, "until": today}),
        "limit": "500",
    })
    return data.get("data", [])



def fetch_insights_7d(act_id):
    """Fetch last 7 days (excluding today) for CPR trend."""
    today = datetime.date.today()
    since = (today - datetime.timedelta(days=7)).isoformat()
    until = (today - datetime.timedelta(days=1)).isoformat()
    data = api_get(act_id, "insights", {
        "fields": "campaign_id,spend,outbound_clicks,cost_per_outbound_click",
        "level": "campaign",
        "time_range": json.dumps({"since": since, "until": until}),
        "limit": "500",
    })
    return data.get("data", [])



def parse_outbound_clicks(row):
    """Parse outbound_clicks from API response."""
    clicks = 0
    outbound = row.get("outbound_clicks", [])
    if isinstance(outbound, list):
        for entry in outbound:
            if entry.get("action_type") == "outbound_click":
                clicks = int(float(entry.get("value", 0)))
                break
    elif isinstance(outbound, (int, float)):
        clicks = int(outbound)
    return clicks


def parse_cpr(row, clicks):
    """Parse cost_per_outbound_click from API response."""
    cpr = 0.0
    cpc_data = row.get("cost_per_outbound_click", [])
    if isinstance(cpc_data, list):
        for entry in cpc_data:
            if entry.get("action_type") == "outbound_click":
                cpr = float(entry.get("value", 0))
                break
    elif isinstance(cpc_data, (int, float)):
        cpr = float(cpc_data)

    # Fallback: calculate
    if cpr == 0 and clicks > 0:
        spend = float(row.get("spend", 0))
        cpr = spend / clicks

    return cpr


def patrol_account(account):
    """Run satpam rules for one account."""
    act_id = account["id"]
    name = account["name"]

    print(f"\n{'='*60}")
    print(f"🛡️ SATPAM {name} (act_{act_id})")
    print(f"{'='*60}")

    # Fetch data
    campaigns = fetch_campaigns(act_id)
    insights_today = fetch_insights_today(act_id)
    insights_7d = fetch_insights_7d(act_id)

    # Build 7d lookup by campaign ID (PRIMARY data source for rules)
    seven_d_map = {}
    for row in insights_7d:
        cid = row.get("campaign_id", "")
        if cid:
            seven_d_map[cid] = {
                "spend": float(row.get("spend", 0)),
                "clicks": parse_outbound_clicks(row),
                "cpr": parse_cpr(row, parse_outbound_clicks(row)),
            }

    # Build today's map (for spend cap check only)
    today_map = {}
    for row in insights_today:
        cid = row.get("campaign_id", "")
        if cid:
            today_map[cid] = {
                "spend": float(row.get("spend", 0)),
                "clicks": parse_outbound_clicks(row),
                "cpr": parse_cpr(row, parse_outbound_clicks(row)),
            }

    # Stats
    active_camps = [c for c in campaigns if c.get("status") == "ACTIVE"]
    paused_camps = [c for c in campaigns if c.get("status") == "PAUSED"]
    off_camps = [c for c in campaigns if c.get("name", "").upper().startswith("OFF_")]

    total_spend_7d = sum(seven_d_map.get(c["id"], {}).get("spend", 0) for c in campaigns)
    total_spend_today = sum(today_map.get(c["id"], {}).get("spend", 0) for c in campaigns)

    print(f"📊 Total campaigns: {len(campaigns)}")
    print(f"   ACTIVE: {len(active_camps)} | PAUSED: {len(paused_camps)} | OFF_: {len(off_camps)}")
    print(f"💰 Spend 7d: Rp {total_spend_7d:,.0f} | Today: Rp {total_spend_today:,.0f}")

    # Spend cap check (using today's data)
    if total_spend_today > SPEND_CAP:
        print(f"\n🚨 SPEND CAP EXCEEDED! Rp {total_spend_today:,.0f} > Rp {SPEND_CAP:,}")
        print(f"   Should pause all active campaigns (except OFF_)")

    # Process each campaign using 7-day data
    actions_taken = []
    skipped = []

    for camp in campaigns:
        cid = camp["id"]
        cname = camp.get("name", cid) or cid
        status = camp.get("status", "UNKNOWN")

        # Skip OFF_ and OFF campaigns
        if cname.upper().startswith("OFF"):
            continue

        # Get 7d data (PRIMARY for all rules)
        data_7d = seven_d_map.get(cid, {"spend": 0, "clicks": 0, "cpr": 0})
        spend_7d = data_7d["spend"]
        clicks_7d = data_7d["clicks"]
        cpr_7d = data_7d["cpr"]


        action = None
        reason = ""

        # ── Rule 4: Early Kill (7d spend > 130, 0 clicks) ──
        if status == "ACTIVE" and spend_7d > SPEND_KILL and clicks_7d == 0:
            action = "PAUSE"
            reason = f"Rule 4: Spend 7d Rp {spend_7d:,.0f} > {SPEND_KILL} tapi 0 clicks"

        # ── Rule 2: Stop-Loss (CPR 7d > 130, clicks 7d > 5)
        elif status == "ACTIVE" and cpr_7d > CPR_THRESHOLD and clicks_7d > 5:
            action = "PAUSE"
            reason = f"Rule 2: CPR 7d Rp {cpr_7d:,.0f} > {CPR_THRESHOLD} dengan {clicks_7d} clicks"

        # ── Rule 1: Re-Activate (CPR 7d < 130, clicks 7d > 1)
        elif status == "PAUSED" and cpr_7d < CPR_THRESHOLD and cpr_7d > 0 and clicks_7d > 1:
            action = "ON"
            reason = f"Rule 1: CPR 7d Rp {cpr_7d:,.0f} < {CPR_THRESHOLD} dengan {clicks_7d} clicks"

        # ── Rule 3: Re-Activate (clicks 7d > 0, CPR 7d < 130)
        elif status == "PAUSED" and clicks_7d > 0 and cpr_7d < CPR_THRESHOLD:
            action = "ON"
            reason = f"Rule 3: CPR 7d Rp {cpr_7d:,.0f} < {CPR_THRESHOLD} dengan {clicks_7d} clicks"

        if action:
            actions_taken.append({
                "id": cid,
                "name": cname,
                "status": status,
                "action": action,
                "reason": reason,
                "spend_7d": spend_7d,
                "clicks_7d": clicks_7d,
                "cpr_7d": cpr_7d,
            })

            # Execute action
            if action == "PAUSE":
                result = api_post(act_id, cid, {"status": "PAUSED"})
                if "_http_error" in result:
                    print(f"   ❌ GAGAL PAUSE {cname}: {result}")
                else:
                    print(f"   🛑 PAUSE: {cname}")
                    print(f"      {reason}")
            elif action == "ON":
                result = api_post(act_id, cid, {"status": "ACTIVE"})
                if "_http_error" in result:
                    print(f"   ❌ GAGAL ON {cname}: {result}")
                else:
                    print(f"   ⚡ ON: {cname}")
                    print(f"      {reason}")
        else:
            skipped.append(cname)

    # Summary
    print(f"\n📋 Summary:")
    print(f"   Actions: {len(actions_taken)}")
    print(f"   Skipped: {len(skipped)}")

    if actions_taken:
        print(f"\n📝 Detail actions:")
        for a in actions_taken:
            emoji = "🛑" if a["action"] == "PAUSE" else "⚡"
            print(f"   {emoji} [{a['action']}] {a['name']}")
            print(f"      Spend 7d: Rp {a['spend_7d']:,.0f} | Clicks 7d: {a['clicks_7d']} | CPR 7d: Rp {a['cpr_7d']:,.0f}")

    return actions_taken


def main():
    print("🛡️ SATPAM UNIFIED — 3 Account Patrol")
    print(f"⏰ {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"📏 Rules: CPR threshold Rp {CPR_THRESHOLD} | Spend cap Rp {SPEND_CAP:,}/account")
    print(f"📅 Data: Last 7 days (excluding today)")

    all_actions = []

    for account in ACCOUNTS:
        try:
            actions = patrol_account(account)
            all_actions.extend(actions)
        except Exception as e:
            print(f"\n❌ ERROR on {account['name']}: {e}")
            import traceback
            traceback.print_exc()

    # Final summary
    print(f"\n{'='*60}")
    print(f"📊 FINAL SUMMARY")
    print(f"{'='*60}")
    print(f"Total actions: {len(all_actions)}")

    pauses = [a for a in all_actions if a["action"] == "PAUSE"]
    ons = [a for a in all_actions if a["action"] == "ON"]

    if pauses:
        print(f"\n🛑 PAUSED ({len(pauses)}):")
        for a in pauses:
            print(f"   • {a['name']} — CPR 7d: Rp {a['cpr_7d']:,.0f}, Clicks: {a['clicks_7d']}")

    if ons:
        print(f"\n⚡ ACTIVATED ({len(ons)}):")
        for a in ons:
            print(f"   • {a['name']} — CPR 7d: Rp {a['cpr_7d']:,.0f}, Clicks: {a['clicks_7d']}")

    if not all_actions:
        print("\n✅ Semua campaign dalam kondisi baik. Tidak ada aksi yang diperlukan.")


if __name__ == "__main__":
    main()
