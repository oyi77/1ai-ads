#!/usr/bin/env python3
"""Daily Content Kingdom report → sends to Veris via @Berkahkaryaautosalesbot at midnight"""
import json, requests
from pathlib import Path
from datetime import datetime

BASE = Path.home()
BOT_TOKEN = '8665546627:AAFp6SSBasBcpN3tGf1jNSpRPotMYwM8DEM'
CHAT_ID = 157228659

state = {}
sf = BASE / 'projects/1ai-ads/data/rakdapur_kingdom_state.json'
if sf.exists():
    with open(sf) as f: state = json.load(f)

pages_data = {}
pf = BASE / '.openclaw/workspace/data/fb_page_tokens.json'
if pf.exists():
    with open(pf) as f: pages_data = json.load(f)

today = datetime.now().strftime('%Y-%m-%d')
pn = {pid: d.get('name',pid[:10]) for pid,d in pages_data.items()}
assigned = state.get('products_assigned', {})
vids = state.get('videos_posted', {})

r_proc = len(list((BASE/'projects/1ai-content/videos/rakdapur/processed').glob('*_EDITED.mp4'))) if (BASE/'projects/1ai-content/videos/rakdapur/processed').exists() else 0
k_proc = len(list((BASE/'projects/1ai-content/videos/kacamatabaca/processed').glob('*_EDITED.mp4'))) if (BASE/'projects/1ai-content/videos/kacamatabaca/processed').exists() else 0

# Summary
lines = [f"📊 CONTENT KINGDOM — {today}", "", f"🏠 Rak Dapur: {r_proc} video", f"👓 Kacamata: {k_proc} video", f"📈 Total posts: {state.get('total_posts',0)}", f"🔄 Runs: {state.get('runs',0)}", "", "📱 PAGE STATUS:", ""]

for pid, pids in assigned.items():
    lines.append(f"  {pn.get(pid,pid[:10])}: {len(pids)} produk, {len(vids.get(pid,[]))} video")

lines += ["", "⏰ BESOK: 08:00 | 14:00 | 20:00", "", "🤖 Auto-report by Content Kingdom"]
report = '\n'.join(lines)

try:
    r = requests.post(f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage', json={'chat_id': CHAT_ID, 'text': report}, timeout=10)
    print(f"Report sent: {r.json().get('ok')} at {datetime.now().strftime('%H:%M')}")
except Exception as e:
    print(f"Failed: {e}")
