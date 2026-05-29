import requests
import json

ACCESS_TOKEN = '***'
ACCOUNT_ID = 'act_1439536310038458'

def get_performance_history():
    # 1. Get ALL insights for the account over the last 60 days
    url_ins = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/insights'
    params_ins = {
        'access_token': ACCESS_TOKEN,
        'level': 'ad',
        'date_preset': 'last_90d',
        'fields': 'ad_id,ad_name,spend,inline_link_clicks,inline_link_click_ctr,reach,impressions,actions,cost_per_action_type',
        'limit': 500
    }
    r_ins = requests.get(url_ins, params=params_ins).json()
    insights = r_ins.get('data', [])
    
    if not insights:
        print("No insights found.")
        return []

    # 2. Extract uniquely performing Ad IDs
    ad_ids = list(set([i['ad_id'] for i in insights]))
    
    # 3. Fetch Creative Details for these ads in batches if necessary
    # For now, just fetch them for the top performers
    
    results = []
    for ins in insights:
        ad_id = ins['ad_id']
        
        # Get ad details to get landing page and specific creative data
        url_ad = f'https://graph.facebook.com/v19.0/{ad_id}'
        params_ad = {
            'access_token': ACCESS_TOKEN,
            'fields': 'name,creative{id,name,object_story_spec,body,title,thumbnail_url},effective_status,adset{name}'
        }
        ad_info = requests.get(url_ad, params=params_ad).json()
        
        # Parse actions
        purchases = 0
        leads = 0
        actions = ins.get('actions', [])
        for action in actions:
            if action['action_type'] == 'purchase':
                purchases = int(action['value'])
            if action['action_type'] == 'lead':
                leads = int(action['value'])
        
        spend = float(ins.get('spend', 0))
        clicks = int(ins.get('inline_link_clicks', 0))
        ctr = float(ins.get('inline_link_click_ctr', 0))
        
        # Extract landing page
        lp = "N/A"
        try:
            creative = ad_info.get('creative', {})
            oss = creative.get('object_story_spec', {})
            lp = oss.get('link_data', {}).get('link') or \
                 oss.get('video_data', {}).get('call_to_action', {}).get('value', {}).get('link') or \
                 "N/A"
        except Exception:
            pass

        results.append({
            'ad_id': ad_id,
            'name': ad_info.get('name'),
            'adset': ad_info.get('adset', {}).get('name', 'N/A'),
            'spend': spend,
            'purchases': purchases,
            'leads': leads,
            'clicks': clicks,
            'ctr': ctr,
            'cpa_pur': spend / purchases if purchases > 0 else 0,
            'cpa_lead': spend / leads if leads > 0 else 0,
            'body': ad_info.get('creative', {}).get('body', 'N/A'),
            'landing_page': lp
        })

    # Sort by performance
    # Primary: Purchases, Secondary: Leads, Tertiary: CTR
    results.sort(key=lambda x: (x['purchases'], x['leads'], x['ctr']), reverse=True)
    return results[:20]

data = get_performance_history()
print(json.dumps(data, indent=2))
