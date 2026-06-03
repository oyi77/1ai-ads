#!/usr/bin/env python3
"""Upload TikTok videos to FB pages with affiliate captions"""
import requests, json, time, random
from pathlib import Path

BASE = 'https://graph.facebook.com/v19.0'
VIDEO_DIR = Path.home() / 'projects/1ai-content/videos/rakdapur'
TOKEN_FILE = Path.home() / '.openclaw/workspace/data/fb_page_tokens.json'

with open(TOKEN_FILE) as f:
    pages_data = json.load(f)

pages = [(pid, data['token'], data['name']) for pid, data in pages_data.items()]
print(f'Loaded {len(pages)} pages\n')

captions = {
    'rak_kayu_minimalis_63k_likes.mp4': 'Rak dapur kayu minimalis yang lagi viral! 63K+ likes di TikTok 🔥\n\nDapur langsung estetik & rapi ✨\n\n🛒 Dapatkan di sini: https://s.shopee.co.id/2qRuDFQ6t5\n\n#RakDapur #DapurMinimalis #DapurEstetik',
    'rak_dinding_aesthetic.mp4': 'Rak dinding aesthetic! Solusi dapur sempit 🔥\n\nGak perlu bor, tempel langsung! ✨\n\n🛒 Cek harga: https://s.shopee.co.id/2g8U0wQkE2\n\n#RakDinding #DapurMinimalis #HomeDecor',
    'rak_bumbu_tempel.mp4': 'Rak bumbu tempel dinding! Bye bye dapur berantakan 👋🔥\n\nBumbu rapi, masak makin semangat! ✨\n\n🛒 Link produk: https://s.shopee.co.id/60Ovz4E3SM\n\n#RakBumbu #DapurRapi #OrganizerDapur',
    'rak_gantung_unboxing.mp4': 'UNBOXING rak gantung dapur aesthetic! 😍🔥\n\nMudah dipasang, gak perlu tukang! ✨\n\n🛒 Cek di Shopee: https://s.shopee.co.id/6AiMBNDQ7P\n\n#RakGantung #DapurEstetik #Unboxing',
    'rak_susun_serbaguna.mp4': 'Rak susun serbaguna! Solusi dapur kecil 🔥\n\n4 tingkat + roda! Multifungsi ✨\n\n🛒 Beli di sini: https://s.shopee.co.id/3B4kbrOqD7\n\n#RakSusun #DapurMinimalis #StorageSolution',
    'rak_piring_aesthetic.mp4': 'Rak piring aesthetic! Dapur langsung cantik 🔥\n\nPlastik tebal, desain menarik, fungsional! ✨\n\n🛒 Cek harga: https://s.shopee.co.id/3qKRP5MIrB\n\n#RakPiring #DapurAesthetic #HomeDecor',
}

videos = sorted(VIDEO_DIR.glob('*.mp4'))
ok = 0; fail = 0

for vi, vpath in enumerate(videos):
    caption = captions.get(vpath.name, 'Rak dapur viral! 🔥\n#RakDapur')
    size_mb = vpath.stat().st_size / 1024 / 1024
    
    targets = random.sample(pages, min(2, len(pages)))
    
    for pi, (pid, ptoken, pname) in enumerate(targets):
        msg = f'V{vi+1} ({size_mb:.1f}MB) -> {pname[:25]}'
        try:
            with open(vpath, 'rb') as f:
                r = requests.post(
                    f'{BASE}/{pid}/videos',
                    files={'source': (vpath.name, f, 'video/mp4')},
                    data={'description': caption, 'access_token': ptoken},
                    timeout=120
                )
            d = r.json()
            if 'id' in d:
                ok += 1
                vid = d['id']
                print(f'✅ {msg}: {vid[:25]}')
            else:
                fail += 1
                err = d.get('error',{}).get('message','?')
                code = d.get('error',{}).get('code','')
                print(f'⚠️ {msg}: [{code}] {err[:70]}')
        except Exception as e:
            fail += 1
            print(f'❌ {msg}: {str(e)[:50]}')
        
        time.sleep(2)

print(f'\n📊 DONE: {ok} uploaded, {fail} failed')
