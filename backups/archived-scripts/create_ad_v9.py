import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_1439536310038458"
PAGE_ID = "705227266006359"

ADSET_ID = "120245223232030444"

# Try creating ad with object_story_spec (image + link)
ad_url = f"https://graph.facebook.com/v19.0/{ACCOUNT_ID}/ads"
ad_data = {
    "name": "ADFORGE_Purwoceng_DirectWA_V6",
    "adset_id": ADSET_ID,
    "status": "PAUSED",
    "creative": json.dumps(
        {
            "object_story_spec": {
                "page_id": PAGE_ID,
                "link_data": {
                    "message": "Purwoceng Herbal - Solusi herbal alami untuk stamina Anda!",
                    "link": "https://wa.me/6281284839183",
                    "caption": "WhatsApp Only - Langsung chat admin",
                    "description": "Purwoceng Herbal - Obat herbal alami untuk meningkatkan stamina dan vitalitas.",
                },
            }
        }
    ),
    "access_token": ACCESS_TOKEN,
}
r = requests.post(ad_url, data=ad_data)
result = r.json()
print(f"Ad Creation Result: {json.dumps(result, indent=2)}")
