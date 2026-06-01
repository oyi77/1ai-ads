import json
import os

# Update central configuration for the automation engine
config = {
    "shopee_affiliate": {
        "ads_account_id": "act_380721031313330",
        "cookie_file": os.path.join(
            os.path.expanduser("~"),
            ".openclaw",
            "workspace",
            "config",
            "shopee_affiliate_netscape_processed.json",
        ),
        "products": ["Rak Dapur", "Prabotan"],
        "reporting_schedule": "14:00 - 23:50 WIB (H+1)",
    },
    "herbal_direct": {
        "ads_account_id": "act_1439536310038458",
        "page_id": "997737406765722",
        "wa_number": "6285800620035",
        "products": ["Purwoceng", "Wedang", "Bawang Lanang"],
        "reporting_schedule": "00:10 WIB (Daily Summary)",
    },
}

path = os.path.join(
    os.path.expanduser("~"),
    ".openclaw",
    "workspace",
    "config",
    "adforge_master_config.json",
)
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as f:
    json.dump(config, f, indent=2)

print(f"✅ Master configuration locked for both branches.")
