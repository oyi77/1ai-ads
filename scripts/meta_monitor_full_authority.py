import requests
import json
import time
from datetime import datetime
import os

# CONFIGURATION - PERMANENT SYSTEM TOKEN
ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = "act_380721031313330"


def log_action(message):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open("logs/automation_history.log", "a") as f:
        f.write(f"[{ts}] {message}\n")
    print(f"[{ts}] {message}")


def get_insights(level_id, level="campaign"):
    url = f"https://graph.facebook.com/v19.0/{level_id}/insights"
    params = {
        "access_token": ACCESS_TOKEN,
        "date_preset": "today",
        "fields": "spend,inline_link_clicks,inline_link_click_ctr",
    }
    try:
        r = requests.get(url, params=params).json()
        data = r.get("data", [])
        if data:
            ins = data[0]
            spend = float(ins.get("spend", 0))
            clicks = int(ins.get("inline_link_clicks", 0))
            ctr = float(ins.get("inline_link_click_ctr", 0))
            cpr = spend / clicks if clicks > 0 else 0
            return {"spend": spend, "clicks": clicks, "ctr": ctr, "cpr": cpr}
    except Exception:
        pass
    return None


def scale_horizontal(adset_id, adset_name):
    """Duplikasi Adset Pemenang ke Campaign yang sama (Horizontal Scaling)"""
    url = f"https://graph.facebook.com/v19.0/{adset_id}/copy"
    # Meta API copy will create a duplicate in the same campaign by default
    params = {"access_token": ACCESS_TOKEN}
    try:
        r = requests.post(url, params=params).json()
        new_id = r.get("id")
        if new_id:
            # Rename for tracking
            requests.post(
                f"https://graph.facebook.com/v19.0/{new_id}",
                params={
                    "name": f"SCALED_DUP_{adset_name}_VILONA",
                    "status": "ACTIVE",
                    "access_token": ACCESS_TOKEN,
                },
            )
            log_action(
                f"🚀 HORIZONTAL SCALE: Duplicated Adset {adset_name} -> {new_id} (VILONA MODE)"
            )
    except Exception as e:
        log_action(f"❌ Failed to duplicate adset: {e}")


def manage_account():
    # 1. LEVEL CAMPAIGN (Vertical Scaling)
    url_c = f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns"
    camps = (
        requests.get(
            url_c,
            params={
                "access_token": ACCESS_TOKEN,
                "fields": "id,name,status,daily_budget",
            },
        )
        .json()
        .get("data", [])
    )

    for c in camps:
        if c["status"] != "ACTIVE":
            continue
        ins = get_insights(c["id"], "campaign")
        if not ins or ins["spend"] < 5000:
            continue

        # Rule: Vertical Scaler (Winning Stats)
        budget = int(c.get("daily_budget", 0))
        if ins["ctr"] > 7.0 and ins["cpr"] < 120 and budget < 2000000:
            new_budget = int(budget * 1.2)  # Scale up 20%
            new_name = c["name"] if "VILONA" in c["name"] else f"{c['name']}_VILONA"
            requests.post(
                f'https://graph.facebook.com/v19.0/{c["id"]}',
                params={
                    "daily_budget": new_budget,
                    "name": new_name,
                    "access_token": ACCESS_TOKEN,
                },
            )
            log_action(
                f'💰 VERTICAL SCALE: Campaign {new_name} ({budget} -> {new_budget}) CTR:{ins["ctr"]:.2f}% CPR:{ins["cpr"]:.0f}'
            )

    # 2. LEVEL ADSET (Horizontal Scaling & Killing)
    url_as = f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/adsets"
    adsets = (
        requests.get(
            url_as,
            params={
                "access_token": ACCESS_TOKEN,
                "fields": "id,name,status,campaign{name}",
            },
        )
        .json()
        .get("data", [])
    )

    for as_ in adsets:
        if as_["status"] != "ACTIVE":
            continue
        ins = get_insights(as_["id"], "adset")
        if not ins or ins["spend"] < 10000:
            continue

        # KILL LOST ADSETS
        if ins["cpr"] > 160:
            requests.post(
                f'https://graph.facebook.com/v19.0/{as_["id"]}',
                params={"status": "PAUSED", "access_token": ACCESS_TOKEN},
            )
            log_action(
                f'💀 KILLED ADSET: {as_["name"]} in {as_["campaign"]["name"]} (CPR: {ins["cpr"]:.0f})'
            )

        # H-SCALE (Super Winning Adset)
        if ins["ctr"] > 10.0 and ins["cpr"] < 90 and ins["spend"] > 50000:
            log_action(
                f'💎 SUPER WINNER DETECTED: {as_["name"]} - Triggering Horizontal Scale...'
            )
            scale_horizontal(as_["id"], as_["name"])

    # 3. LEVEL ADS (Micro-Optimization)
    url_ads = f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/ads"
    ads = (
        requests.get(
            url_ads, params={"access_token": ACCESS_TOKEN, "fields": "id,name,status"}
        )
        .json()
        .get("data", [])
    )
    for ad in ads:
        if ad["status"] != "ACTIVE":
            continue
        ins = get_insights(ad["id"], "ad")
        if not ins or ins["spend"] < 5000:
            continue

        # KILL POOR CREATIVES
        if ins["ctr"] < 4.0:
            requests.post(
                f'https://graph.facebook.com/v19.0/{ad["id"]}',
                params={"status": "PAUSED", "access_token": ACCESS_TOKEN},
            )
            log_action(
                f'✂️ KILLED CREATIVE: {ad["name"]} (CTR Lazy: {ins["ctr"]:.2f}%)'
            )


if __name__ == "__main__":
    log_action("CORE V2.0 ENGINE STARTED: Full Authority Mode Enabled.")
    while True:
        try:
            manage_account()
        except Exception as e:
            log_action(f"Error in cycle: {e}")
        time.sleep(300)  # Every 5 minutes
