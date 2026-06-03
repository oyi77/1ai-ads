#!/usr/bin/env python3
"""
📅 RAK DAPUR CONTENT SCHEDULER
Posts 3-5 videos/day spread across 16 FB pages
Natural timing: morning (7-9am), afternoon (1-3pm), evening (7-9pm)
Uses existing edited videos + proper product matching
"""
import json, random, subprocess, time
from pathlib import Path
from datetime import datetime

BASE_FB = 'https://graph.facebook.com/v19.0'
STATE_FILE = Path.home() / 'projects/1ai-ads/data/rakdapur_schedule_state.json'

def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {'posted_videos': [], 'last_run': None, 'total_posted': 0}

def save_state(state):
    state['last_run'] = datetime.now().isoformat()
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def get_pages():
    with open(Path.home() / '.openclaw/workspace/data/fb_page_tokens.json') as f:
        data = json.load(f)
    return [(pid, d['token'], d['name']) for pid, d in data.items()]

def load_video_product_map():
    with open(Path.home() / 'projects/1ai-content/data/rakdapur_video_product_map.json') as f:
        return json.load(f)

def get_available_videos(state):
    processed_dir = Path.home() / 'projects/1ai-content/videos/rakdapur/processed'
    all_videos = list(processed_dir.glob('*_EDITED.mp4'))
    mapping = load_video_product_map()
    
    available = []
    for v in all_videos:
        vname = v.stem.replace('_EDITED', '')
        if vname not in state['posted_videos']:
            # Find matching product
            match = next((m for m in mapping if m['video'] == vname), None)
            available.append({'path': v, 'vname': vname, 'match': match})
    
    return available

def post_video(video_path, page_id, page_token, page_name, product_info):
    """Upload a single video to FB page with curl"""
    name = product_info['product'][:60]
    link = product_info['link']
    harga = product_info.get('harga', 0)
    komisi = product_info.get('komisi', 0)
    
    caption = f"{name} 🔥\n\nHarga mulai Rp{harga:,} | Komisi Rp{komisi:,}\n\n🛒 Cek & beli di Shopee:\n{link}\n\n#RakDapur #DapurMinimalis #RekomendasiProduk"
    
    try:
        result = subprocess.run([
            'curl', '-s', '--connect-timeout', '10', '--max-time', '90',
            '-X', 'POST', f'{BASE_FB}/{page_id}/videos',
            '-F', f'source=@{video_path}',
            '-F', f'description={caption}',
            '-F', f'access_token={page_token}',
        ], capture_output=True, text=True, timeout=95)
        
        d = json.loads(result.stdout)
        if 'id' in d:
            return {'success': True, 'post_id': d['id'], 'page': page_name}
        else:
            err = d.get('error',{}).get('message','?')
            return {'success': False, 'error': err}
    except Exception as e:
        return {'success': False, 'error': str(e)[:100]}

def run_schedule(dry_run=False):
    """Main scheduler entry point"""
    state = load_state()
    pages = get_pages()
    available = get_available_videos(state)
    
    if not available:
        print("🔄 All videos already posted. Reset needed.")
        # Reset state to cycle through again
        state['posted_videos'] = []
        available = get_available_videos(state)
        if not available:
            print("❌ No videos available at all!")
            return
    
    # Pick 3-5 videos for this run
    count = min(random.randint(3, 5), len(available), len(pages))
    selected = random.sample(available, count)
    target_pages = random.sample(pages, count)
    
    print(f"📅 Schedule run: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"   Posting {count} videos to {count} pages\n")
    
    if dry_run:
        for i, (vid, (pid, ptok, pname)) in enumerate(zip(selected, target_pages)):
            m = vid['match']
            pname_short = (m['product'][:50] if m else '?')
            print(f"   [DRY] V{i+1}: {vid['vname'][:30]} → {pname[:25]} ({pname_short})")
        print(f"\n   Total budget: Rp0 (dry run)")
        return
    
    posted = 0
    for i, (vid, (pid, ptok, pname)) in enumerate(zip(selected, target_pages)):
        m = vid['match']
        if not m:
            print(f"   ⚠️ V{i+1}: {vid['vname'][:30]} - no product match, skipping")
            continue
        
        print(f"   📤 V{i+1}: {vid['vname'][:30]} → {pname[:25]}...", end=' ', flush=True)
        result = post_video(vid['path'], pid, ptok, pname, m)
        
        if result['success']:
            posted += 1
            state['posted_videos'].append(vid['vname'])
            print(f"✅")
        else:
            print(f"❌ {result['error'][:50]}")
        
        time.sleep(3)  # Rate limit
    
    state['total_posted'] += posted
    save_state(state)
    print(f"\n✅ Posted: {posted}/{count}")
    print(f"📊 Total posted since start: {state['total_posted']}")

if __name__ == '__main__':
    import sys
    dry = '--dry' in sys.argv
    run_schedule(dry_run=dry)
