import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNT_ID = 'act_1439536310038458'

# Test creating adset first
adset_url = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/adsets'
adset_params = {
    'name': 'ADFORGE_Purwoceng_DirectWA_V13',
    'optimization_goal': 'REACH',
    'billing_event': 'IMPRESSIONS',
    'bid_amount': 30000,
    'start_time': '2026-05-12T00:00:00+0700',
    'end_time': '2026-05-20T00:00:00+0700',
    'campaign_id': '120245223059800444',
    'targeting': json.dumps({
        'geo_locations': {
            'countries': ['ID']
        }
    }),
    'is_budget_sharing_enabled': True,
    'access_token': ACCESS_TOKEN
}
r = requests.post(adset_url, params=adset_params)
result = r.json()

if 'id' in result:
    ADSET_ID = result['id']
    print(f"✅ Adset Created: {ADSET_ID}")
    
    # Now create ad under this adset
    ad_url = f'https://graph.facebook.com/v19.0/{ADSET_ID}/ads'
    ad_params = {
        'name': 'ADFORGE_Purwoceng_CTR15_V1',
        'creative': {
            'object_story_spec': json.dumps({
                'page_id': '61904553',
                'link_data': {
                    'caption': 'Purwoceng Herbal - Solusi herbal alami untuk stamina Anda!',
                    'link': 'https://wa.me/6281284839183',
                    'description': 'Purwoceng Herbal - Obat herbal alami untuk meningkatkan stamina dan vitalitas.'
                }
            })
        },
        'adlabels': json.dumps([{'name': 'ADFORGE_Purwoceng'}]),
        'access_token': ACCESS_TOKEN
    }
    r2 = requests.post(ad_url, params=ad_params)
    print(f"Ad Creation: {r2.json()}")
else:
    print(f"❌ Adset Failed: {result}")
