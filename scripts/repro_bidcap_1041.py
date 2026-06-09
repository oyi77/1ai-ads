#!/usr/bin/env python3
"""Minimal repro for the 400 on fresh BIDCAP clone creation in 1041."""
import json, sys, time, urllib.request, urllib.parse, urllib.error

sys.path.insert(0, '/home/openclaw/projects/1ai-ads/scripts')
from vilona_trakpro_engine import ACCESS_TOKEN, API, fb_get

ACCOUNT_ID = 'act_380721031313330'
TAGLINK = 'rakdapur3'
AUDIENCE = 'IbuRumah'

minimal_targeting = {
    "geo_locations": {"countries": ["ID"], "location_types": ["home"]},
    "age_min": 18,
    "age_max": 65,
    "genders": [1],
    "publisher_platforms": ["facebook", "instagram"],
    "facebook_positions": ["feed", "story", "facebook_reels"],
    "instagram_positions": ["stream", "story", "reels"],
    "device_platforms": ["mobile", "desktop"],
    "targeting_automation": {"advantage_audience": 0},
}

from datetime import datetime, timezone, timedelta
WIB = timezone(timedelta(hours=7))
today_str = datetime.now(WIB).strftime('%m%d')
camp_name = f'BIDCAP_{TAGLINK}_{AUDIENCE}_{today_str}_fresh'
adset_name = f'BIDCAP_{TAGLINK}_{AUDIENCE}_2555_{today_str}'

def fb_post_direct(endpoint, data):
    data['access_token'] = ACCESS_TOKEN
    qs = '&'.join(f'{k}={urllib.parse.quote(str(v))}' for k,v in data.items())
    req = urllib.request.Request(f'{API}/{endpoint}', data=qs.encode(), method='POST')
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

print('Creating campaign:', camp_name)
camp = fb_post_direct(f'{ACCOUNT_ID}/campaigns', {
    'name': camp_name,
    'objective': 'OUTCOME_TRAFFIC',
    'status': 'PAUSED',
    'special_ad_categories': '[]',
    'is_adset_budget_sharing_enabled': 'false',
})
print('Campaign result:', camp)
camp_id = camp.get('id')
if not camp_id:
    sys.exit(1)

# Adset payload minimal + broader age
adset_payload = {
    'name': adset_name,
    'campaign_id': camp_id,
    'targeting': json.dumps(minimal_targeting),
    'optimization_goal': 'LINK_CLICKS',
    'billing_event': 'IMPRESSIONS',
    'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',
    'daily_budget': '500000',
    'status': 'PAUSED',
    'access_token': ACCESS_TOKEN,
}
qs = '&'.join(f'{k}={urllib.parse.quote(str(v))}' for k,v in adset_payload.items())
req = urllib.request.Request(f'{API}/{ACCOUNT_ID}/adsets', data=qs.encode(), method='POST')
try:
    with urllib.request.urlopen(req, timeout=20) as resp:
        adset = json.loads(resp.read())
    print('Adset:', adset)
except urllib.error.HTTPError as e:
    print('Adset HTTPError:', e.code, e.reason)
    print(e.read().decode('utf-8', errors='replace')[:2000])
    sys.exit(1)
adset_id = adset.get('id')
if not adset_id:
    sys.exit(1)

ad_payload = {
    'name': f'{TAGLINK}_Vdo1_v1',
    'adset_id': adset_id,
    'status': 'PAUSED',
    'access_token': ACCESS_TOKEN,
}
ad_res = fb_get(f'{ACCOUNT_ID}/ads', ad_payload, method='POST')
print('Ad result:', ad_res)
print('DONE BIDCAP CLONE:', camp_name)
