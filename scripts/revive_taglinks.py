#!/usr/bin/env python3
"""Revive 3 taglinks by creating new campaigns via Meta Graph API v19.0"""
import requests, json, sys, time
from pathlib import Path
from datetime import datetime

# --- CONFIG ---
API = 'https://graph.facebook.com/v19.0'
ACT = 'act_435670549443081'
PAGE_ID = '1014428148422867'

# Read token from .env
env_paths = [
    Path('/home/openclaw/projects/1ai-ads/scripts/.env'),
    Path('/home/openclaw/projects/1ai-ads/.env'),
]
TOKEN = None
for ep in env_paths:
    if ep.exists():
        for line in ep.read_text().split('\n'):
            line = line.strip()
            if line.startswith('META_ACCESS_TOKEN='):
                val = line.split('=', 1)[1].strip().strip('"').strip("'")
                if len(val) > 50:
                    TOKEN = val
                    break
    if TOKEN:
        break

if not TOKEN:
    print("ERROR: No token found")
    sys.exit(1)

print(f"Token: {TOKEN[:15]}...{TOKEN[-8:]} (len={len(TOKEN)})")

# --- DISCOVERY PHASE: Find all relevant data ---
print("\n" + "="*60)
print("PHASE 1: DISCOVERY - Finding post IDs and campaign structures")
print("="*60)

# 1. Find gajahThailand campaigns and post IDs
print("\n--- Searching for gajah/thailand ads ---")
all_ads_url = f'{API}/act_{ACT.replace("act_","")}/ads'
all_ads = requests.get(all_ads_url, params={
    'access_token': TOKEN,
    'fields': 'id,name,campaign_id,creative{effective_object_story_id,object_id,title,body,image_url}',
    'limit': 200,
}, timeout=30).json()

gajah_post_ids = set()
rakpiring_post_ids = set()
setelan_post_ids = set()

for ad in all_ads.get('data', []):
    name = (ad.get('name', '') or '').lower()
    creative = ad.get('creative', {})
    title = (creative.get('title', '') or '').lower()
    body = (creative.get('body', '') or '').lower()
    post_id = creative.get('effective_object_story_id', '') or creative.get('object_id', '')
    if not post_id:
        continue
    
    combined = name + title + body
    if any(k in combined for k in ['gajah', 'thailand', 'thaialand']):
        gajah_post_ids.add(post_id)
    if 'rak' in combined and 'piring' in combined:
        rakpiring_post_ids.add(post_id)
    if 'setelan' in combined or 'baju' in combined or 'kaos' in combined:
        setelan_post_ids.add(post_id)

print(f"Gajah/Thailand post IDs: {gajah_post_ids}")
print(f"Rakpiring post IDs: {rakpiring_post_ids}")
print(f"Setelan post IDs: {setelan_post_ids}")

# 2. If no gajah-specific posts found, look at account's deleted campaigns
if not gajah_post_ids:
    print("\n--- No gajah-specific posts found. Checking ALL ads for any post with those keywords ---")
    for ad in all_ads.get('data', []):
        creative = ad.get('creative', {})
        post_id = creative.get('effective_object_story_id', '') or creative.get('object_id', '')
        title = (creative.get('title', '') or '')
        if post_id and any(k in title.lower() for k in ['gajah', 'thai']):
            gajah_post_ids.add(post_id)
            print(f"  Found in title: PostID={post_id} Title={title}")

# If still no gajah posts, use setelan posts (same product category)
if not gajah_post_ids:
    print("\n--- Using setelan post IDs for gajahThailand (same product family) ---")
    gajah_post_ids = setelan_post_ids.copy()

print(f"\nFINAL POST ID MAPPING:")
print(f"  rakpiringpengering: {sorted(rakpiring_post_ids)}")
print(f"  setelanbajukaosmihugajah: {sorted(setelan_post_ids)}")
print(f"  setelangajahthaialand: {sorted(gajah_post_ids)}")

# 3. Check existing active campaigns for these taglinks
print("\n--- Checking existing active campaigns ---")
camps = requests.get(f'{API}/{ACT}/campaigns', params={
    'access_token': TOKEN,
    'fields': 'id,name,effective_status,daily_budget,bid_strategy',
    'limit': 200
}, timeout=15).json()

active_for_taglinks = {'rakpiringpengering': [], 'setelanbajukaosmihugajah': [], 'setelangajahthaialand': []}
for c in camps.get('data', []):
    name = c.get('name', '').lower()
    status = c.get('effective_status', '')
    if status not in ('ACTIVE', 'IN_PROCESS'):
        continue
    for tag in active_for_taglinks:
        if tag.lower() in name.replace('_',''):
            active_for_taglinks[tag].append(c['id'])

for tag, active_camps in active_for_taglinks.items():
    print(f"  {tag}: {len(active_camps)} active campaigns {active_camps}")

# 4. Get audience targeting examples from existing adsets
print("\n--- Sample audiences from existing adsets ---")
sample_camps = {
    'rakpiring': ['120250055874940416', '120248404118800416', '120250443083660416'],
    'setelan': ['120250016047830416', '120250016058540416', '120250443083700416'],
}

for prod, camp_ids in sample_camps.items():
    print(f"\n{prod}:")
    seen_targeting = set()
    for cid in camp_ids[:2]:
        adsets = requests.get(f'{API}/{cid}/adsets', params={
            'access_token': TOKEN,
            'fields': 'id,name,targeting,promoted_object,optimization_goal,billing_event',
            'limit': 5
        }, timeout=15).json()
        
        for adset in adsets.get('data', []):
            targeting = adset.get('targeting', {})
            t_key = json.dumps(targeting, sort_keys=True, default=str)
            if t_key not in seen_targeting:
                seen_targeting.add(t_key)
                geo = targeting.get('geo_locations', targeting.get('geo_countries', 'ID'))
                age = targeting.get('age_range', {})
                interests = targeting.get('interests', targeting.get('flexible_spec', []))
                print(f"  Adset={adset['id']}: geo={geo} age={age}")
                if interests:
                    if isinstance(interests, list):
                        print(f"    interests={interests[:5]}")
                    else:
                        print(f"    interests={interests}")

print("\n" + "="*60)
print("DISCOVERY COMPLETE")
print("="*60)
