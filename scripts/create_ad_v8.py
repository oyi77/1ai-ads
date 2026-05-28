import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNT_ID = 'act_1439536310038458'

ADSET_ID = '120245223232030444'

# Create ad with direct link
ad_url = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/ads'
ad_data = {
    'name': 'ADFORGE_Purwoceng_LandingV1',
    'adset_id': ADSET_ID,
    'status': 'PAUSED',
    'link_url': 'https://wa.me/6281284839183',
    'creative': json.dumps({
        'object_type': 'LINK',
        'link': 'https://wa.me/6281284839183',
        'name': 'Purwoceng Herbal',
        'caption': 'WhatsApp Only -直接 WhatsApp',
        'description': 'Purwoceng Herbal - Solusi herbal alami untuk stamina Anda!'
    }),
    'access_token': ACCESS_TOKEN
}
r = requests.post(ad_url, data=ad_data)
result = r.json()
print(f"Ad Creation Result: {json.dumps(result, indent=2)}")
