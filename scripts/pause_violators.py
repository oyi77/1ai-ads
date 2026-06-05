#!/usr/bin/env python3
import json, requests

def get_token():
    import os
    return os.environ.get('META_ACCESS_TOKEN', '').strip() or None

TOKEN = get_token()
if not TOKEN:
    exit('No token')

TARGETS = [
    ('pertanian_rakdapur', 'CPC Rp137 > Rp130'),
    ('benihsayuran_abo', 'ROAS 0.30x loss'),
    ('action_movies', 'ROAS 0.00x no taglink'),
]

r = requests.get('https://graph.facebook.com/v19.0/act_380721031313330/campaigns',
    params={'access_token': TOKEN, 'fields': 'id,name,status', 'limit': 500}, timeout=15)
camps = r.json().get('data', [])

paused = 0
for keyword, reason in TARGETS:
    for c in camps:
        if keyword in c['name'].lower() and c['status'] == 'ACTIVE':
            resp = requests.post(f'https://graph.facebook.com/v19.0/{c["id"]}',
                params={'access_token': TOKEN}, json={'status': 'PAUSED'}, timeout=10)
            ok = resp.json().get('success', False)
            print(f'{"OK" if ok else "FAIL"} PAUSED: {c["name"][:70]}')
            paused += 1
            break

active = [c for c in camps if c['status'] == 'ACTIVE' and 'OFF_' not in c['name'][:10]]
print(f'\nPaused: {paused} | Remaining active: {len(active)}')
