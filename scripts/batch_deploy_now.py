#!/usr/bin/env python3
import json, requests, time, sys
from datetime import datetime

cfg = json.loads(open('config/affiliate_pipeline_config.json').read())
r = requests.get('https://graph.facebook.com/v19.0/me/accounts',
    params={'access_token': cfg['meta']['access_token'], 'limit': 15}).json()
pages = r['data'][:10]

LYNK = 'https://lynk.id/jendralbot'
results = []

posts = [
    ('FB3', 'Temen gue gaji 15jt/bulan. Mulai cari side hustle.\n\n1. Gaji = 1 sumber. Layoff = GAME OVER\n2. Inflasi naik. Gap makin lebar\n3. Tanggungan makin banyak\n\nDia mulai affiliate AI. Hasil 3 bulan:\n200rb ➡️ 800rb ➡️ 2.4jt\n\nJANGAN tunggu dipecat baru mulai.\n\n👇 Link GRATIS:\n{link}\n\n#sidehustle #bisnisonline #pejuangrupiah'),
    ('FB5', 'POLL: Side hustle paling realistis 2026?\n\nA) Affiliate marketing\nB) Jualan produk digital\nC) Content creator\nD) Jastip/reseller\n\nGue vote B. Produk digital = gak ada stok, margin gede, AI bikin gampang.\n\nKalian pilih apa? Drop alasan!\n\n👇 Cek tools GRATIS:\n{link}\n\n#sidehustle #bisnis2026'),
    ('FB1', 'Gue cancel 5 tools. Hemat Rp 2.1jt/bulan 🎉\n\nGanti AI tools:\n✨ Canva ➡️ AI Design\n✨ Copywriter ➡️ AI Copywriting\n✨ Ads ➡️ AI Optimizer\n✨ Data ➡️ AI Analytics\n✨ VA ➡️ AI Assistant\n\nSemua di JENDRALBOT. Mulai 0 rupiah.\n\n👇 Link GRATIS:\n{link}\n\n#aitools #bisnisonline'),
    ('FB2', 'Gue bukan orang sukses. Gue cuma GAK PERNAH BERHENTI gagal.\n\n2024: 7 bisnis gagal, hampir nyerah\n2025: Nemu affiliate digital product\n2026: Akhirnya stabil\n\nDropshipping ❌ Reseller ❌ Jastip ❌ Trading ❌\nYang works? Affiliate AI. Mulai GRATIS.\n\n👇 Link:\n{link}\n\n#storytime #pejuangrupiah'),
    ('FB4', 'Bukti bukan omong kosong 🧾\n\nChat ASLI dari user JENDRALBOT:\n\n\"Tools-nya langsung bisa pake!\"\n\"Gara2 link lu dapet 500rb pertama\"\n\"Ternyata segampang ini ya\"\n\nGak ada settingan. Test sendiri.\n\n👇 Link GRATIS:\n{link}\n\n#testimoni #aitools'),
]

for post_id, message in posts:
    for p in pages:
        try:
            r = requests.post(f'https://graph.facebook.com/v19.0/{p["id"]}/feed',
                params={'message': message.format(link=LYNK), 'access_token': p['access_token']},
                timeout=30).json()
            now = datetime.now().strftime('%H:%M:%S')
            if 'id' in r:
                print(f'✅ [{now}] {p["name"]} — [{post_id}] https://facebook.com/{r["id"]}')
                results.append({'time': now, 'page': p['name'], 'post': post_id, 'status': 'success', 'url': f'https://facebook.com/{r["id"]}'})
            else:
                err = r.get('error', {}).get('message', str(r))[:150]
                print(f'⚠️ [{now}] {p["name"]} — [{post_id}] ERROR: {err}')
                results.append({'time': now, 'page': p['name'], 'post': post_id, 'status': 'failed', 'error': err})
        except Exception as e:
            print(f'⚠️ [{datetime.now().strftime("%H:%M:%S")}] {p["name"]} — EXCEPTION: {str(e)[:100]}')
        sys.stdout.flush()
        time.sleep(3)

# Save results
import os
os.makedirs('logs', exist_ok=True)
with open('logs/fb_batch_24may.json', 'w') as f:
    json.dump(results, f, indent=2)

ok = sum(1 for r in results if r['status']=='success')
print(f'\n📊 DONE — ✅ {ok} ⚠️ {len(results)-ok} | Total {len(results)} posts')
