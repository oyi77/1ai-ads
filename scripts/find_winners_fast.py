import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_1439536310038458"


def get_winners_fast():
    # 1. Get insights for all ads in last 90 days
    url_ins = f"https://graph.facebook.com/v19.0/{ACCOUNT_ID}/insights"
    params_ins = {
        "access_token": ACCESS_TOKEN,
        "level": "ad",
        "date_preset": "last_90d",
        "fields": "ad_id,ad_name,spend,inline_link_clicks,inline_link_click_ctr,actions",
        "limit": 50,
    }
    insights = requests.get(url_ins, params=params_ins).json().get("data", [])

    if not insights:
        params_ins["date_preset"] = "today"
        insights = requests.get(url_ins, params=params_ins).json().get("data", [])

    # Sort insights by spend to look at most active ones
    insights.sort(key=lambda x: float(x.get("spend", 0)), reverse=True)

    winners = []
    # Only check top 15 most active/spent ads
    for ins in insights[:15]:
        ad_id = ins["ad_id"]

        # Parse actions
        purchases = 0
        leads = 0
        actions = ins.get("actions", [])
        for action in actions:
            if action["action_type"] == "purchase":
                purchases = int(action["value"])
            if action["action_type"] == "lead":
                leads = int(action["value"])

        # 2. Get Ad & Creative Details
        url_ad = f"https://graph.facebook.com/v19.0/{ad_id}"
        ad_info = requests.get(
            url_ad,
            params={
                "access_token": ACCESS_TOKEN,
                "fields": "creative{id,name,body,title,object_story_spec,object_id,effective_object_story_id},adset{name},campaign{name}",
            },
        ).json()

        creative = ad_info.get("creative", {})
        oss = creative.get("object_story_spec", {})
        lp = (
            oss.get("link_data", {}).get("link")
            or oss.get("video_data", {})
            .get("call_to_action", {})
            .get("value", {})
            .get("link")
            or "N/A"
        )

        post_id = creative.get("effective_object_story_id") or creative.get("object_id")

        winners.append(
            {
                "ad_name": ins["ad_name"],
                "campaign": ad_info.get("campaign", {}).get("name"),
                "purchases": purchases,
                "leads": leads,
                "spend": float(ins.get("spend", 0)),
                "ctr": float(ins.get("inline_link_click_ctr", 0)),
                "post_id": post_id,
                "body": creative.get("body"),
                "landing_page": lp,
            }
        )

    winners.sort(key=lambda x: (x["purchases"], x["leads"], x["spend"]), reverse=True)
    return winners


print(json.dumps(get_winners_fast(), indent=2))
