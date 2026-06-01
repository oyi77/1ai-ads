import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_1439536310038458"

CAMPAIGN_ID = "120245223059800444"
ADSET_ID = "120245223232030444"

# Create ad at account level with adset指定
ad_url = f"https://graph.facebook.com/v19.0/{ACCOUNT_ID}/ads"
ad_params = {
    "name": "ADFORGE_Purwoceng_DirectWA_V1",
    "adset_id": ADSET_ID,
    "status": "PAUSED",
    "creative": {
        "object_story_spec": json.dumps(
            {
                "page_id": "61904553",
                "link_data": {
                    "caption": "Purwoceng Herbal - Solusi herbal alami untuk stamina Anda!",
                    "link": "https://wa.me/6281284839183",
                    "description": "Purwoceng Herbal - Obat herbal alami untuk meningkatkan stamina dan vitalitas. Hubungi admin via WhatsApp sekarang!",
                },
            }
        )
    },
    "adlabels": json.dumps([{"name": "ADFORGE_Purwoceng"}]),
    "access_token": ACCESS_TOKEN,
}
r = requests.post(ad_url, params=ad_params)
result = r.json()
print(f"Ad Creation: {json.dumps(result, indent=2)}")
