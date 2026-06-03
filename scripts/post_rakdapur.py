#!/usr/bin/env python3
"""Post rak dapur content to all FB pages with fresh tokens"""
import requests, json, time, random, os, sys
from pathlib import Path
from datetime import datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from credentials import get_meta_token

TOKEN = get_meta_token()
BASE = 'https://graph.facebook.com/v19.0'

# Get fresh page tokens
r = requests.get(f'{BASE}/me/accounts', params={'access_token': TOKEN, 'limit': 100})
pages = r.json().get('data', [])
print(f'Got {len(pages)} pages with fresh tokens')

# Save fresh tokens
fresh = {}
for p in pages:
    fresh[p['id']] = {'name': p['name'], 'token': p['access_token'], 'category': p.get('category','?')}

token_file = Path.home() / '.openclaw/workspace/data/fb_page_tokens.json'
with open(token_file, 'w') as f:
    json.dump(fresh, f, indent=2)
print(f'Saved fresh tokens')

# Products
PRODUCTS = [
    {'name': 'Rak Dapur Plastik Aesthetic 4 Layer', 'hook': 'Dapur makin rapi dalam 5 menit! 🔥', 'desc': 'Rak susun aesthetic 4 layer dengan roda. Bikin dapur langsung upgrade!', 'link': 'https://s.shopee.co.id/3B4kbrOqD7'},
    {'name': 'Rak Piring Stainless Wastafel', 'hook': 'Rak piring stainless AUTO KERING! ✨', 'desc': 'Dish rack stainless multifungsi. Piring kering, bebas lembab!', 'link': 'https://s.shopee.co.id/3qKRP5MIrB'},
    {'name': 'Rel Panci Gantung + Cantolan', 'hook': 'PANCI BERANTAKAN? SOLUSINYA! 🍳', 'desc': 'Rel panci tarik dorong + free 5 cantolan. Dapur minimalis!', 'link': 'https://s.shopee.co.id/6AiMBNDQ7P'},
    {'name': 'OKK Rak Bumbu Vertikal 3 Susun', 'hook': 'Bumbu berantakan? LIAT INI! 🧅', 'desc': 'Rak bumbu OKK Official. Kuat, minimalis, estetik!', 'link': 'https://s.shopee.co.id/60Ovz4E3SM'},
    {'name': 'OKK Rak Dapur Tempel Tanpa Bor', 'hook': 'TEMPEL AJA! Gak perlu bor! 🔧', 'desc': 'Rak dapur tempel anti karat. Praktis, kuat!', 'link': 'https://s.shopee.co.id/2g8U0wQkE2'},
    {'name': 'Rak Dapur Susun Sudut 3 Tingkat', 'hook': 'Sudut kosong? SULAP JADI INI! 🪄', 'desc': 'Manfaatin space mati jadi storage keren!', 'link': 'https://s.shopee.co.id/5fm5aSFK8K'},
    {'name': 'Rak Cobek Talenan Besi Anti Karat', 'hook': 'COBEK GAK BERSERAKAN LAGI! 🔪', 'desc': 'Rak cobek talenan kokoh. Komisi 16%!', 'link': 'https://s.shopee.co.id/2LVdcKS0u0'},
    {'name': 'Rak Troli 4 Tingkat Serbaguna', 'hook': 'RAK TROLI CUMA 29RB?! 🤯', 'desc': 'Square rak troli serbaguna dengan roda!', 'link': 'https://s.shopee.co.id/gNPdGYMGp'},
]

TEMPLATES = [
    '{hook}\n\n{desc}\n\n🛒 Cek produk & harga 👇\n{link}\n\n#RakDapur #DapurMinimalis #OrganizerDapur #RekomendasiProduk',
    '🔥 {hook}\n\n{desc}\n\n👉 Cek di sini: {link}\n\n#PerabotanDapur #DapurRapi #ProdukViral',
    'Yang butuh {name} merapat! 🎯\n\n{desc}\n\nLink produk: {link}\n\n#RacunShopee #BeliDiShopee #DapurViral',
    'Rekomendasi dapur estetik ✨\n\n{name}\n✨ {desc}\n\n🛍️ {link}\n\n#DapurEstetik #HomeOrganizer #RakDapur',
]

# POST TO ALL PAGES
print(f'\n🚀 POSTING TO {len(pages)} PAGES...\n')
success = 0
failed = 0
post_ids = []

for i, p in enumerate(pages):
    pid = p['id']
    ptoken = p['access_token']
    pname = p['name']
    
    prod = random.choice(PRODUCTS)
    caption = random.choice(TEMPLATES).format(**prod)
    
    try:
        r = requests.post(f'{BASE}/{pid}/feed', params={
            'message': caption,
            'access_token': ptoken,
        }, timeout=8)
        d = r.json()
        if 'id' in d:
            success += 1
            post_ids.append({'page': pname, 'post_id': d['id'], 'product': prod['name']})
            print(f'✅ {i+1}/{len(pages)} {pname[:30]}')
        else:
            failed += 1
            err = d.get('error',{}).get('message','?')
            print(f'⚠️ {i+1}/{len(pages)} {pname[:25]}: {err[:70]}')
    except Exception as e:
        failed += 1
        print(f'❌ {i+1}/{len(pages)} {pname[:25]}: {str(e)[:50]}')
    time.sleep(0.5)

print(f'\n📊 POSTING DONE: {success}/{len(pages)} berhasil, {failed} gagal')

# Save post IDs
post_file = Path.home() / 'projects/1ai-ads/data/rakdapur_posts.json'
with open(post_file, 'w') as f:
    json.dump({'created_at': datetime.now().isoformat(), 'posts': post_ids, 'success': success, 'failed': failed}, f, indent=2)
print(f'📁 Posts saved to {post_file}')
