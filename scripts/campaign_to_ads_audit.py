import requests
import json

ACCESS_TOKEN = '***'
BC_ID = 'act_1439536310038458'

def investigate_active_campaigns():
    # 1. Get active campaigns
    url_c = f'https://graph.facebook.com/v19.0/{BC_ID}/campaigns'
    c_data = requests.get(url_c, params={'access_token': ACCESS_TOKEN, 'fields': 'id,name,status'}).json().get('data', [])
    
    performance_map = {}
    
    for camp in c_data:
        cid = camp['id']
        cname = camp['name']
        
        # 2. Get ads in this campaign with performance
        url_ins = f'https://graph.facebook.com/v19.0/{cid}/insights'
        params_ins = {
            'access_token': ACCESS_TOKEN,
            'level': 'ad',
            'date_preset': 'last_30d',
            'fields': 'ad_id,ad_name,spend,inline_link_clicks,inline_link_click_ctr,actions',
        }
        ins_data = requests.get(url_ins, params=params_ins).json().get('data', [])
        
        for ins in ins_data:
            ad_id = ins['ad_id']
            
            # 3. Get creative info
            url_ad = f'https://graph.facebook.com/v19.0/{ad_id}'
            ad_info = requests.get(url_ad, params={'access_token': ACCESS_TOKEN, 'fields': 'creative{id,name,body,title,object_story_spec}'}).json()
            
            p = {
                'campaign': cname,
                'ad_id': ad_id,
                'name': ins['ad_name'],
                'spend': float(ins.get('spend', 0)),
                'clicks': int(ins.get('inline_link_clicks', 0)),
                'ctr': float(ins.get('inline_link_click_ctr', 0)),
                'purchases': sum([int(a['value']) for a in ins.get('actions', []) if a['action_type'] == 'purchase']),
                'leads': sum([int(a['value']) for a in ins.get('actions', []) if a['action_type'] == 'lead']),
                'creative': ad_info.get('creative', {})
            }
            performance_map[ad_id] = p
            
    return sorted(performance_map.values(), key=lambda x: (x['purchases'], x['leads'], x['spend']), reverse=True)

print(json.dumps(investigate_active_campaigns(), indent=2))
