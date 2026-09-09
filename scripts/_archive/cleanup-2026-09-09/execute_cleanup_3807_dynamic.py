import requests
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = "act_380721031313330"


def handle_cleanup():
    # Fetch current insights to get correct IDs
    i_url = f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights"
    i_params = {
        "access_token": ACCESS_TOKEN,
        "level": "campaign",
        "fields": "campaign_id,campaign_name,cost_per_inline_link_click",
        "date_preset": "today",
    }
    insights = requests.get(i_url, params=i_params).json().get("data", [])

    for ins in insights:
        cid = ins["campaign_id"]
        name = ins["campaign_name"]
        cpc = float(ins.get("cost_per_inline_link_click", 0))

        # Rule 1: CPC > 250 -> Pause
        if cpc > 250:
            print(f"Pausing {name} (ID: {cid}) due to CPC {cpc}")
            requests.post(
                f"https://graph.facebook.com/v19.0/{cid}",
                params={"access_token": ACCESS_TOKEN, "status": "PAUSED"},
            )

        # Rule 2: Spesific Winners to Activate (Manual pick from previous report)
        if "Rak Dapur_1-3-1" in name:
            print(f"Activating {name} (ID: {cid}) as promising winner")
            requests.post(
                f"https://graph.facebook.com/v19.0/{cid}",
                params={"access_token": ACCESS_TOKEN, "status": "ACTIVE"},
            )


if __name__ == "__main__":
    handle_cleanup()
