#!/bin/bash
# Post rak dapur content to all FB pages via curl
TOKEN="EAAKA2OT1FroBRot0MWOi39slvmVLfZAPYWFFYoSO4ZAYvZAq0X7wnLBvAmgp0vai9KHZBOjXQ5VmvWYZCwNDJkUhrdlDwSUXGvb0LZACz9v4DkQj33B2cDrizSrH49UCIDnoebkQPaRg3YoxDwgwT6nrgZA2IvZAXQ77A99YS1hm6VVbA9i2Dn3PPgD794QJNZCAMqyYEGXqOyzmOUc7IirP4KMXWxUzwZBtOSgQIx5v19Mz8oB2GB4TKcPQZDZD"
BASE="https://graph.facebook.com/v19.0"

# Get page tokens
PAGES_JSON=$(curl -s "${BASE}/me/accounts?access_token=${TOKEN}&limit=100")
echo "$PAGES_JSON" | python3 -c "
import json, sys, random, subprocess, time, urllib.parse

pages = json.load(sys.stdin).get('data', [])
print(f'Got {len(pages)} pages\n')

products = [
    {'name': 'Rak Dapur Plastik Aesthetic 4 Layer', 'hook': 'Dapur makin rapi dalam 5 menit! 🔥', 'desc': 'Rak susun aesthetic 4 layer dengan roda. Bikin dapur langsung upgrade!', 'link': 'https://s.shopee.co.id/3B4kbrOqD7'},
    {'name': 'Rak Piring Stainless Wastafel', 'hook': 'Rak piring stainless AUTO KERING! ✨', 'desc': 'Dish rack stainless multifungsi. Piring kering, bebas lembab!', 'link': 'https://s.shopee.co.id/3qKRP5MIrB'},
    {'name': 'Rel Panci Gantung + Cantolan', 'hook': 'PANCI BERANTAKAN? SOLUSINYA! 🍳', 'desc': 'Rel panci tarik dorong + free 5 cantolan!', 'link': 'https://s.shopee.co.id/6AiMBNDQ7P'},
    {'name': 'OKK Rak Bumbu Vertikal 3 Susun', 'hook': 'Bumbu berantakan? LIAT INI! 🧅', 'desc': 'Rak bumbu OKK Official. Kuat, minimalis, estetik!', 'link': 'https://s.shopee.co.id/60Ovz4E3SM'},
    {'name': 'OKK Rak Dapur Tempel Tanpa Bor', 'hook': 'TEMPEL AJA! Gak perlu bor! 🔧', 'desc': 'Rak dapur tempel anti karat. Praktis, kuat!', 'link': 'https://s.shopee.co.id/2g8U0wQkE2'},
    {'name': 'Rak Dapur Susun Sudut 3 Tingkat', 'hook': 'Sudut kosong? SULAP JADI INI! 🪄', 'desc': 'Manfaatin space mati jadi storage keren!', 'link': 'https://s.shopee.co.id/5fm5aSFK8K'},
    {'name': 'Rak Cobek Talenan Besi Anti Karat', 'hook': 'COBEK GAK BERSERAKAN LAGI! 🔪', 'desc': 'Rak cobek talenan kokoh. Komisi 16%!', 'link': 'https://s.shopee.co.id/2LVdcKS0u0'},
    {'name': 'Rak Troli 4 Tingkat Serbaguna', 'hook': 'RAK TROLI CUMA 29RB?! 🤯', 'desc': 'Square rak troli serbaguna dengan roda!', 'link': 'https://s.shopee.co.id/gNPdGYMGp'},
]

templates = [
    '{hook}\n\n{desc}\n\n🛒 Cek produk & harga 👇\n{link}\n\n#RakDapur #DapurMinimalis #OrganizerDapur #RekomendasiProduk',
    '🔥 {hook}\n\n{desc}\n\n👉 Cek di sini: {link}\n\n#PerabotanDapur #DapurRapi #ProdukViral',
    'Yang butuh {name} merapat! 🎯\n\n{desc}\n\nLink produk: {link}\n\n#RacunShopee #BeliDiShopee #DapurViral',
    'Rekomendasi dapur estetik ✨\n\n{name}\n✨ {desc}\n\n🛍️ {link}\n\n#DapurEstetik #HomeOrganizer #RakDapur',
]

ok = 0
fail = 0
results = []

for i, p in enumerate(pages):
    prod = random.choice(products)
    caption = random.choice(templates).format(**prod)
    
    # URL encode
    enc = urllib.parse.urlencode({
        'message': caption,
        'access_token': p['access_token']
    })
    
    cmd = f\"curl -s -X POST 'https://graph.facebook.com/v19.0/{p['id']}/feed' -d '{enc}' --connect-timeout 8 --max-time 10\"
    out = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode()
    
    try:
        d = json.loads(out)
        if 'id' in d:
            ok += 1
            results.append({'page': p['name'], 'post_id': d['id'], 'product': prod['name']})
            print(f'✅ {i+1}/{len(pages)} {p[\"name\"][:30]}')
        else:
            fail += 1
            err = d.get('error',{}).get('message','?')
            print(f'⚠️ {i+1}/{len(pages)} {p[\"name\"][:25]}: {err[:70]}')
    except:
        fail += 1
        print(f'❌ {i+1}/{len(pages)} {p[\"name\"][:25]}: parse error')
    
    time.sleep(0.5)

print(f'\n📊 DONE: {ok}/{len(pages)} success, {fail} failed')
# Save results
with open('/home/openclaw/projects/1ai-ads/data/rakdapur_posts.json', 'w') as f:
    json.dump({'success': ok, 'failed': fail, 'posts': results}, f, indent=2)
print('📁 Saved to rakdapur_posts.json')
"
