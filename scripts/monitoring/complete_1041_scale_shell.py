#!/usr/bin/env python3
import json, os, time, urllib.parse, urllib.request, urllib.error, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from vilona_trakpro_engine import ACCESS_TOKEN, API, fb_get, ACCOUNTS

ACT = ACCOUNTS['1041']['id']
SHELL_ID = '120247752336020121'
ORIG_NAME_PREFIX = 'ON_BIDCAP_atayasetelankaosanak_Anak_0306'
POST_ID = '1014428148422867_122114371641125943'

def post(endpoint, **params):
    params['access_token'] = ACCESS_TOKEN
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(f'{API}/{endpoint}', data=data, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        print('HTTPERROR', e.code, body)
        raise

# Check if already complete
adsets = fb_get(f'{SHELL_ID}/adsets', fields='id,name,status', limit='10')
ads = fb_get(f'{SHELL_ID}/ads', fields='id,name,status', limit='10')
print('before', adsets.get('data',[]), ads.get('data',[]))
if adsets.get('data') and ads.get('data'):
    print('already complete')
    sys.exit(0)

# Use simple safe targeting (Belanja seed) for first clone, with v22 required flag
seed = [
    {"id": "6003263791114", "name": "Belanja"},
    {"id": "6003346592981", "name": "Belanja online"},
    {"id": "6016343989160", "name": "Lazada"},
    {"id": "6003220634758", "name": "Toko diskon"},
    {"id": "6849890049601", "name": "Situs web belanja online"},
]
targeting = {
    "geo_locations": {"countries": ["ID"]},
    "age_min": 25,
    "age_max": 55,
    "genders": [1],
    "publisher_platforms": ["facebook", "instagram"],
    "facebook_positions": ["feed", "facebook_reels", "story"],
    "instagram_positions": ["stream", "story", "reels"],
    "device_platforms": ["mobile"],
    "targeting_automation": {"advantage_audience": 0},
    "flexible_spec": [{"interests": seed}],
}

print('creating adset...')
adset = post(f'{ACT}/adsets',
    name='Scale_atayasetelankaosanak_Belanja_2555',
    campaign_id=SHELL_ID,
    targeting=json.dumps(targeting),
    optimization_goal='LINK_CLICKS',
    billing_event='IMPRESSIONS',
    bid_strategy='LOWEST_COST_WITHOUT_CAP',
    daily_budget='500000',
    status='PAUSED')
print('adset', adset)
time.sleep(2)

print('creating ad...')
ad = post(f'{ACT}/ads',
    name='atayasetelankaosanak_Vdo1_v1',
    adset_id=adset['id'],
    creative=json.dumps({"object_story_id": POST_ID, "call_to_action_type": "SHOP_NOW"}),
    status='PAUSED')
print('ad', ad)

time.sleep(2)
print('after adsets', fb_get(f'{SHELL_ID}/adsets', fields='id,name,status,effective_status', limit='10').get('data', []))
print('after ads', fb_get(f'{SHELL_ID}/ads', fields='id,name,status,effective_status,creative{id,object_story_id}', limit='10').get('data', []))
