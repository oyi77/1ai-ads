import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_1439536310038458"


def get_full_insights(level_id):
    url = f"https://graph.facebook.com/v19.0/{level_id}/insights"
    # fields: spend, clicks, ctr, reach, impressions, cost_per_unique_click, purchase_roas, actions
    fields = "spend,inline_link_clicks,inline_link_click_ctr,reach,impressions,actions,cost_per_inline_link_click"

    results = {}
    for pg in ["today", "yesterday", "last_7d"]:
        r = requests.get(
            url,
            params={"access_token": ACCESS_TOKEN, "date_preset": pg, "fields": fields},
        ).json()
        results[pg] = r.get("data", [])
    return results


# Get Campaigns
url_c = f"https://graph.facebook.com/v19.0/{ACCOUNT_ID}/campaigns"
camps = (
    requests.get(
        url_c,
        params={"access_token": ACCESS_TOKEN, "fields": "id,name,status,daily_budget"},
    )
    .json()
    .get("data", [])
)

analysis = []
for c in camps:
    if c["status"] != "ACTIVE":
        continue
    insights = get_full_insights(c["id"])

    # Process Actions (Leads/Purchases)
    def parse_actions(data):
        if not data:
            return {}
        actions = data[0].get("actions", [])
        return {a["action_type"]: a["value"] for a in actions}

    summary = {
        "name": c["name"],
        "budget": c.get("daily_budget"),
        "today": insights["today"][0] if insights["today"] else None,
        "yesterday": insights["yesterday"][0] if insights["yesterday"] else None,
        "last_7d": insights["last_7d"][0] if insights["last_7d"] else None,
    }
    analysis.append(summary)

print(json.dumps(analysis, indent=2))
