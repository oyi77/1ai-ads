import requests
import json
from datetime import datetime, timedelta

ACCESS_TOKEN = '***'
ACCOUNT_ID = 'act_1439536310038458'

def get_best_ads():
    # Get all ads to find their names and IDs
    url_ads = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/ads'
    params_ads = {
        'access_token': ACCESS_TOKEN,
        'fields': 'id,name,creative{id,name,object_story_spec,body,title,thumbnail_url},effective_status,adset{name}',
        'limit': 100
    }
    ads_data = requests.get(url_ads, params=params_ads).json().get('data', [])
    
    # Get insights for the last 30 days
    url_ins = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/insights'
    params_ins = {
        'access_token': ACCESS_TOKEN,
        'level': 'ad',
        'date_preset': 'last_30d',
        'fields': 'ad_id,spend,inline_link_clicks,inline_link_click_ctr,reach,impressions,actions,cost_per_action_type',
        'limit': 100
    }
    insights_data = requests.get(url_ins, params=params_ins).json().get('data', [])
    
    # Map insights to ad details
    results = []
    ads_map = {ad['id']: ad for ad in ads_data}
    
    for ins in insights_data:
        ad_id = ins['ad_id']
        ad_info = ads_map.get(ad_id, {})
        
        # Parse purchases
        purchases = 0
        actions = ins.get('actions', [])
        for action in actions:
            if action['action_type'] == 'purchase':
                purchases = int(action['value'])
        
        # Parse link clicks
        clicks = int(ins.get('inline_link_clicks', 0))
        ctr = float(ins.get('inline_link_click_ctr', 0))
        spend = float(ins.get('spend', 0))
        
        result = {
            'ad_id': ad_id,
            'name': ad_info.get('name'),
            'adset': ad_info.get('adset', {}).get('name'),
            'spend': spend,
            'purchases': purchases,
            'clicks': clicks,
            'ctr': ctr,
            'cpa': spend / purchases if purchases > 0 else 0,
            'creative_id': ad_info.get('creative', {}).get('id'),
            'body': ad_info.get('creative', {}).get('body'),
            'title': ad_info.get('creative', {}).get('title'),
            'landing_page': ad_info.get('creative', {}).get('object_story_spec', {}).get('link_data', {}).get('link') or \
                            ad_info.get('creative', {}).get('object_story_spec', {}).get('video_data', {}).get('call_to_action', {}).get('value', {}).get('link')
        }
        results.append(result)
        
    # Sort by purchases then clicks
    results.sort(key=lambda x: (x['purchases'], x['clicks']), reverse=True)
    return results

print(json.dumps(get_best_ads(), indent=2))
