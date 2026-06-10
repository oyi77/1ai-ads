#!/usr/bin/env python3
"""Meta Ads Patrol for act_380721031313330 (1041 Nyamiresep)
API Version: v22.0
Output: /home/openclaw/projects/1ai-ads/data/brain/laporan_patrol_1041_2026-06-10.json
"""
import json
import sys
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

ACT_ID = "act_380721031313330"
API_VERSION = "v22.0"
OUT_PATH = "/home/openclaw/projects/1ai-ads/data/brain/laporan_patrol_1041_2026-06-10.json"
CLEAN_TK_PATH = "/tmp/_tk_clean.txt"
FALLBACK_TK_PATH = "/tmp/_meta_token.txt"

# Campaign-level thresholds
PAUSE_CPC = 120
PAUSE_SPEND = 50000
PAUSE_RUNNING_DAYS = 3

# Taglink targets
TAGLINK_TARGETS = ["rakdapur", "rakdapur3", "atayasetelankaosanak"]

# Scale opportunity thresholds
SCALE_CPC_LIMIT = 80
SCALE_SPEND_LIMIT = 100000
SCALE_CLICKS_LIMIT = 100


def log(msg):
    print(f"[patrol] {msg}")


def read_token(path):
    try:
        with open(path, "r") as f:
            token = f.read().strip()
        if token:
            return token
    except Exception:
        pass
    return None


def api_get(path, params=None):
    token = read_token(CLEAN_TK_PATH) or read_token(FALLBACK_TK_PATH)
    if not token:
        raise RuntimeError("No access token available")
    url = f"https://graph.facebook.com/{API_VERSION}/{path}"
    p = {"access_token": token}
    if params:
        p.update(params)
    qs = urllib.parse.urlencode(p)
    req = urllib.request.Request(url + "?" + qs, headers={"User-Agent": "patrol/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def to_float(val):
    try:
        return float(val)
    except Exception:
        return 0.0


def to_int(val):
    try:
        return int(float(val))
    except Exception:
        return 0


def campaign_age_days(campaign):
    """Rough age from created_time if available."""
    created = campaign.get("created_time")
    if not created:
        return 0
    try:
        dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        return max(0, (datetime.now(dt.tzinfo) - dt).days)
    except Exception:
        return 0


def matches_taglink(text):
    if not text:
        return False
    lower = text.lower()
    return any(t.lower() in lower for t in TAGLINK_TARGETS)


def analyze_campaign(campaign, insights):
    camp_name = campaign.get("name", "")
    camp_id = campaign.get("id", "")
    status = campaign.get("status", "")

    spend = to_float(insights.get("spend", 0))
    cpc = to_float(insights.get("cpc", 0))
    ctr = to_float(insights.get("ctr", 0))
    clicks = to_int(insights.get("clicks", 0))
    impressions = to_int(insights.get("impressions", 0))

    # CPC Sweep: pause check
    pause_triggered = False
    pause_reason = []
    if status == "ACTIVE":
        age = campaign_age_days(campaign)
        if cpc > PAUSE_CPC and spend > PAUSE_SPEND and age >= PAUSE_RUNNING_DAYS:
            pause_triggered = True
            pause_reason.append(f"CPC {cpc:.1f}>120, spend {spend:.0f}>50000, age {age}d>=3")

    # Scale opportunity
    scale_opportunity = (
        cpc < SCALE_CPC_LIMIT and spend > SCALE_SPEND_LIMIT and clicks > SCALE_CLICKS_LIMIT
    )

    return {
        "id": camp_id,
        "name": camp_name,
        "status": status,
        "spend": spend,
        "cpc": cpc,
        "ctr": ctr,
        "clicks": clicks,
        "impressions": impressions,
        "age_days": campaign_age_days(campaign),
        "pause_triggered": pause_triggered,
        "pause_reason": pause_reason,
        "scale_opportunity": scale_opportunity,
    }


def main():
    log(f"Starting patrol for {ACT_ID} via {API_VERSION}")

    # Fetch campaigns
    campaigns_data = api_get(
        f"{ACT_ID}/campaigns",
        {"fields": "id,name,status,created_time", "limit": 100},
    )
    campaigns = campaigns_data.get("data", [])
    log(f"Fetched {len(campaigns)} campaigns")

    # Fetch ads + insights per campaign
    # We'll gather campaign-level 7d insights via campaign insights endpoint for efficiency.
    # Also collect ads to scan names for taglinks.
    results = []
    taglink_campaigns = []
    all_ads_flat = []

    for camp in campaigns:
        camp_id = camp["id"]
        camp_name = camp.get("name", "")

        # Campaign insights (last 7d)
        try:
            insights_resp = api_get(
                f"{camp_id}/insights",
                {
                    "fields": "spend,cpc,ctr,impressions,clicks,date_start,date_stop",
                    "date_preset": "last_7d",
                    "limit": 1,
                },
            )
            insight_data = insights_resp.get("data", [{}])[0]
        except Exception as e:
            log(f"Insights fetch failed for {camp_id}: {e}")
            insight_data = {}

        analyzed = analyze_campaign(camp, insight_data)
        results.append(analyzed)

        # Taglink scan at campaign level
        if matches_taglink(camp_name):
            taglink_campaigns.append(analyzed)

        # Fetch ads for this campaign for taglink scan (pitfall 38)
        try:
            ads_resp = api_get(
                f"{camp_id}/ads",
                {"fields": "id,name,status", "limit": 100},
            )
            ads = ads_resp.get("data", [])
        except Exception as e:
            log(f"Ads fetch failed for {camp_id}: {e}")
            ads = []

        taglink_ads = [a for a in ads if matches_taglink(a.get("name", ""))]
        if taglink_ads:
            taglink_campaigns.append(
                {
                    "id": camp_id,
                    "name": f"(ad-level) {camp_name}",
                    "taglink_ads": len(taglink_ads),
                    "ad_names": [a["name"] for a in taglink_ads[:10]],
                }
            )

    # Taglink health summary
    taglink_health = []
    for target in TAGLINK_TARGETS:
        relevant = []
        for c in results:
            if target.lower() in c["name"].lower():
                relevant.append(c)
        active = [c for c in relevant if c["status"] == "ACTIVE"]
        avg_cpc = (
            sum(c["cpc"] for c in active) / len(active) if active else 0.0
        )
        total_spend = sum(c["spend"] for c in active)
        taglink_health.append(
            {
                "target": target,
                "campaign_name_match": len(relevant),
                "active_count": len(active),
                "avg_cpc": round(avg_cpc, 2),
                "total_spend": round(total_spend, 2),
                "dead": len(active) == 0,
            }
        )

    # Identical scan for ad-level taglink names
    ad_level_taglink_campaigns = []
    for camp in campaigns:
        camp_id = camp["id"]
        try:
            ads_resp = api_get(
                f"{camp_id}/ads",
                {"fields": "id,name,status", "limit": 100},
            )
            ads = ads_resp.get("data", [])
        except Exception:
            ads = []
        matching_ads = [a for a in ads if any(t.lower() in a.get("name", "").lower() for t in TAGLINK_TARGETS)]
        if matching_ads:
            ad_level_taglink_campaigns.append(
                {
                    "campaign_id": camp_id,
                    "campaign_name": camp.get("name"),
                    "matching_ad_count": len(matching_ads),
                    "ad_names": [a["name"] for a in matching_ads[:20]],
                }
            )

    # CPC Sweep alerts
    cpc_sweep_alerts = [
        r
        for r in results
        if r["pause_triggered"]
    ]

    # Scale opportunities
    scale_opportunities = [
        {
            "id": r["id"],
            "name": r["name"],
            "cpc": r["cpc"],
            "spend": r["spend"],
            "clicks": r["clicks"],
        }
        for r in results
        if r["scale_opportunity"]
    ]

    report = {
        "generated_at": datetime.now().isoformat(),
        "account": ACT_ID,
        "account_name": "1041 Nyamiresep",
        "api_version": API_VERSION,
        "rules": {
            "pause_if": {
                "cpc_gt": PAUSE_CPC,
                "spend_gt": PAUSE_SPEND,
                "running_days_ge": PAUSE_RUNNING_DAYS,
            },
            "taglink_targets": TAGLINK_TARGETS,
            "scale_if": {
                "cpc_lt": SCALE_CPC_LIMIT,
                "spend_gt": SCALE_SPEND_LIMIT,
                "clicks_gt": SCALE_CLICKS_LIMIT,
            },
        },
        "summary": {
            "total_campaigns": len(campaigns),
            "total_ads_scanned": len(all_ads_flat),
            "taglink_campaign_active_count": sum(
                1 for th in taglink_health if not th["dead"]
            ),
        },
        "cpc_sweep_alerts": cpc_sweep_alerts,
        "taglink_health": taglink_health,
        "taglink_ad_level_matches": ad_level_taglink_campaigns,
        "scale_opportunities": scale_opportunities,
        "campaigns": results,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    log(f"Report saved to {OUT_PATH}")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
