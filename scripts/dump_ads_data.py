import requests
import json
from datetime import datetime
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'

def get_insights(level_id):
    url = f'https://graph.facebook.com/v19.0/{level_id}/insights'
    # Ambil data hari ini (today) dan range 7 hari terakhir (last_7d)
    fields = 'spend,inline_link_clicks,inline_link_click_ctr,reach,impressions'
    
    res = {}
    for preset in ['today', 'last_7d', 'yesterday']:
        params = {'access_token': ACCESS_TOKEN, 'date_preset': preset, 'fields': fields}
        try:
            r = requests.get(url, params=params).json()
            data = r.get('data', [])
            if data:
                res[preset] = data[0]
            else:
                res[preset] = {'spend': 0, 'clicks': 0}
        except Exception:
            res[preset] = {'error': True}
    return res

output = []

# Fetch All Campaigns
url_c = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns'
camps = requests.get(url_c, params={'access_token': ACCESS_TOKEN, 'fields': 'id,name,status,daily_budget'}).json().get('data', [])

for c in camps:
    if c['status'] != 'ACTIVE': continue
    insights = get_insights(c['id'])
    
    # Fetch Adsets for this campaign
    url_as = f'https://graph.facebook.com/v19.0/{c["id"]}/adsets'
    adsets = requests.get(url_as, params={'access_token': ACCESS_TOKEN, 'fields': 'id,name,status'}).json().get('data', [])
    adset_data = []
    for as_ in adsets:
        if as_['status'] != 'ACTIVE': continue
        as_insights = get_insights(as_['id'])
        adset_data.append({'name': as_['name'], 'insights': as_insights})

    output.append({
        'campaign_name': c['name'],
        'daily_budget': c.get('daily_budget'),
        'campaign_insights': insights,
        'adsets': adset_data
    })

with open('temp_ads_analysis.json', 'w') as f:
    json.dump(output, f, indent=2)
