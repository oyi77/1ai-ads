import requests
import json

ACCESS_TOKEN = '***'
BC_ID = 'act_1439536310038458'

def list_all_ads_and_check_insights():
    # 1. List ALL ads in the account
    url_ads = f'https://graph.facebook.com/v19.0/{BC_ID}/ads'
    params_ads = {
        'access_token': ACCESS_TOKEN,
        'fields': 'id,name,status,creative{id,name,body,title,object_story_spec},adset{name},campaign{name}',
        'limit': 100
    }
    ads = requests.get(url_ads, params=params_ads).json().get('data', [])
    
    print(f"Total ads found: {len(ads)}")
    
    detailed_results = []
    for ad in ads:
        ad_id = ad['id']
        
        # 2. Get insights for THIS SPECIFIC AD
        url_ins = f'https://graph.facebook.com/v19.0/{ad_id}/insights'
        params_ins = {
            'access_token': ACCESS_TOKEN,
            'date_preset': 'last_30d',
            'fields': 'spend,inline_link_clicks,inline_link_click_ctr,actions',
        }
        ins_data = requests.get(url_ins, params=params_ins).json().get('data', [])
        
        ins = ins_data[0] if ins_data else {}
        
        spend = float(ins.get('spend', 0))
        if spend == 0:
            # Try date_preset='today'
            params_ins['date_preset'] = 'today'
            ins_data = requests.get(url_ins, params=params_ins).json().get('data', [])
            ins = ins_data[0] if ins_data else {}
            spend = float(ins.get('spend', 0))
            
        if spend > 0:
            ad['insights'] = ins
            res = {
                'id': ad['id'],
                'name': ad['name'],
                'campaign': ad.get('campaign', {}).get('name'),
                'adset': ad.get('adset', {}).get('name'),
                'spend': spend,
                'clicks': int(ins.get('inline_link_clicks', 0)),
                'purchases': sum([int(a['value']) for a in ins.get('actions', []) if a['action_type'] == 'purchase']),
                'creative': ad.get('creative', {})
            }
            detailed_results.append(res)
            
    return detailed_results

data = list_all_ads_and_check_insights()
print(json.dumps(data, indent=2))
