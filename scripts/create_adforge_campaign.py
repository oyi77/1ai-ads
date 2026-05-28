import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNT_ID = 'act_1439536310038458'

def create_direct_wa_campaign():
    # 1. Create Campaign with OUTCOME_LEADS (direct WA objective) - with budget
    url_c = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/campaigns'
    c_params = {
        'name': 'ADFORGE_Purwoceng_LeadGen_V1',
        'objective': 'OUTCOME_LEADS',
        'status': 'PAUSED',
        'special_ad_categories': ['NONE'],
        'daily_budget': 100000,
        'access_token': ACCESS_TOKEN
    }
    r_c = requests.post(url_c, params=c_params).json()
    
    if 'id' in r_c:
        campaign_id = r_c['id']
        print(f"✅ Campaign Created: {r_c['id']}")
        
        # 2. Create Adset for Direct WhatsApp Leads (no budget sharing)
        url_as = f'https://graph.facebook.com/v19.0/{campaign_id}/adsets'
        as_params = {
            'name': 'ADFORGE_Purwoceng_WhatsApp_V1',
            'optimization_goal': 'OFFSITE_CONVERSIONS',
            'billing_event': 'IMPRESSIONS',
            'bid_amount': 30000,
            'daily_budget': 100000,
            'start_time': '2026-05-12T00:00:00+0700',
            'promoted_object': {'page_id': '61904553'},
            'targeting': {
                'geo_countries': ['ID'],
                'age_range': {'min': 25, 'max': 55},
                'user_os': ['android', 'ios'],
                'interests': ['herbal', 'wellness']
            },
            'is_budget_sharing_enabled': False,
            'access_token': ACCESS_TOKEN
        }
        r_as = requests.post(url_as, params=as_params).json()
        
        if 'id' in r_as:
            print(f"✅ Adset Created: {r_as['id']}")
            
            # 3. Create Ad
            url_ad = f'https://graph.facebook.com/v19.0/{r_as["id"]}/ads'
            ad_params = {
                'name': 'ADFORGE_Purwoceng_CTR15_V1',
                'creative': {'object_id': '120245102877610444'},
                'adlabels': [{'name': 'ADFORGE_Purwoceng'}],
                'access_token': ACCESS_TOKEN
            }
            r_ad = requests.post(url_ad, params=ad_params).json()
            
            if 'id' in r_ad:
                print(f"✅ Ad Created: {r_ad['id']}")
                return r_ad
            else:
                print(f"❌ Ad Creation Failed: {r_ad}")
        else:
            print(f"❌ Adset Creation Failed: {r_as}")
    else:
        print(f"❌ Campaign Creation Failed: {r_c}")
    
    return None

# Execute
if __name__ == "__main__":
    result = create_direct_wa_campaign()
    print("\n=== Campaign Summary ===")
    print(json.dumps(result, indent=2) if result else "Failed to create campaign chain")
