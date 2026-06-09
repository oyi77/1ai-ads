#!/usr/bin/env python3
import requests, json
from pathlib import Path

def get_token():
    for ep in [Path('/home/openclaw/projects/1ai-ads/scripts/.env'), Path('/home/openclaw/projects/1ai-ads/.env')]:
        if ep.exists():
            for line in ep.read_text().split('\n'):
                line = line.strip()
                if line.startswith('META_ACCESS_TOKEN='):
                    val = line.split('=', 1)[1].strip().strip('"').strip("'")
                    if len(val) > 50:
                        return val
    return None

TOKEN = get_token()
API = 'https://graph.facebook.com/v19.0'
ACT = 'act_435670549443081'
PAGE_ID = '1014428148422867'

# Get adset targeting from best performing campaigns
print("=== RAKPIRING ADSEST TARGETING (from INT08) ===")
camp_id = '120250055874940416'
adsets = requests.get(f'{API}/{camp_id}/adsets', params={
    'access_token': TOKEN,
    'fields': 'id,name,targeting,promoted_object,optimization_goal,billing_event,bid_strategy,bid_amount,daily_budget,status',
    'limit': 10
}, timeout=15).json()

for adset in adsets.get('data', []):
    print(f"\nAdset: {adset['id']} | {adset.get('name','?')}")
    print(f"  Budget: {adset.get('daily_budget')}  Bid: {adset.get('bid_strategy')} {adset.get('bid_amount')}")
    print(f"  Goal: {adset.get('optimization_goal')} Billing: {adset.get('billing_event')}")
    t = adset.get('targeting', {})
    print(f"  Targeting: {json.dumps(t, indent=4)[:500]}")
    if adset.get('promoted_object'):
        print(f"  Promoted: {adset['promoted_object']}")

print("\n=== SETELAN ADSEST TARGETING ===")
camp_id = '120250016058540416'
adsets = requests.get(f'{API}/{camp_id}/adsets', params={
    'access_token': TOKEN,
    'fields': 'id,name,targeting,promoted_object,optimization_goal,billing_event,bid_strategy,bid_amount,daily_budget,status',
    'limit': 10
}, timeout=15).json()

for adset in adsets.get('data', [])[:8]:
    print(f"\nAdset: {adset['id']} | {adset.get('name','?')}")
    print(f"  Budget: {adset.get('daily_budget')}  Bid: {adset.get('bid_strategy')} {adset.get('bid_amount')}")
    print(f"  Goal: {adset.get('optimization_goal')} Billing: {adset.get('billing_event')}")
    t = adset.get('targeting', {})
    print(f"  Targeting: {json.dumps(t, indent=4)[:600]}")
    if adset.get('promoted_object'):
        print(f"  Promoted: {adset['promoted_object']}")

# Verify post IDs are valid
print("\n=== VERIFYING POST IDs ===")
post_ids = [
    '1014428148422867_122112585633125943',
    '1014428148422867_122115151911125943',
    '1014428148422867_122115152205125943',
    '1014428148422867_122115152517125943',
]
for pid in post_ids:
    try:
        post = requests.get(f'{API}/{pid}', params={
            'access_token': TOKEN,
            'fields': 'id,message,permalink_url,created_time,attachments',
        }, timeout=10).json()
        
        if 'error' in post:
            print(f"  {pid}: ERROR - {post['error'].get('message','?')}")
        else:
            msg = (post.get('message', '') or '')[:80]
            att = post.get('attachments', {})
            media_type = ''
            if att and att.get('data'):
                d = att['data'][0]
                media_type = d.get('media_type', d.get('type', ''))
            print(f"  {pid}: OK | {media_type} | msg={msg}")
    except Exception as e:
        print(f"  {pid}: EXCEPTION - {e}")
