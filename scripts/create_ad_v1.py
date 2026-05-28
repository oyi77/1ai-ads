import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNT_ID = 'act_1439536310038458'

ADSET_ID = '120245223169530444'

# Create ad with Direct WhatsApp objective
ad_url = f'https://graph.facebook.com/v19.0/{ADSET_ID}/ads'
ad_params = {
    'name': 'ADFORGE_Purwoceng_CTR15_V1',
    'creative': {
        'object_story_spec': json.dumps({
            'page_id': '61904553',
            'video_data': {
                'caption': 'Purwoceng Herbal - Solusi herbal alami untuk stamina Anda! Dapatkan kini di WhatsApp saja.',
                'link': 'https://wa.me/6281284839183',  # Direct WhatsApp link
                'description': 'Purwoceng Herbal - Obat herbal alami untuk meningkatkan stamina dan vitalitas. Hubungi admin via WhatsApp untuk info lebih lanjut.'
            }
        })
    },
    'adlabels': json.dumps([{'name': 'ADFORGE_Purwoceng'}]),
    'access_token': ACCESS_TOKEN
}
r = requests.post(ad_url, params=ad_params)
result = r.json()
print(f"Ad Creation Result: {json.dumps(result, indent=2)}")
