#!/usr/bin/env python3
"""Post all 6 videos to all 15 Facebook pages + Cross-comment on all recent posts."""
import json, requests, time, sys, os

# Setup paths
BASE = "/home/openclaw/.openclaw/workspace"
TOKENS_FILE = f"{BASE}/data/fb_page_tokens.json"
LOG_FILE = f"{BASE}/data/final_task_log.txt"

def log(msg):
    with open(LOG_FILE, "a") as f:
        f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    print(msg, flush=True)

if not os.path.exists(TOKENS_FILE):
    print("Tokens file not found!")
    sys.exit(1)

TOKENS = json.loads(open(TOKENS_FILE).read())
VIDEOS = [
    "/home/openclaw/.openclaw/media/inbound/shellalie95_2026_01_01_0613_Rebusan_akar_alang_alang_Minuman---6343e3a9-be68-4ce3-b2d7-8afbbf7563e8.mp4",
    "/home/openclaw/.openclaw/media/inbound/pandajawaanimate_2026_05_03_1229_Manfaat_akar_alang_alang_Im---8592515b-2ff0-492f-8506-44124cefed62.mp4",
    "/home/openclaw/.openclaw/media/inbound/darialam04_2026_05_07_1601_Jangan_Remehkan_Akar_Liar_Ini_Kha---c406d0ef-80a0-4694-9f2f-579b2116667f.mp4",
    "/home/openclaw/.openclaw/media/inbound/griyasarinadisehat_2024_11_22_1021_Manfaat_akar_alang_alang_---88311ace-7c3d-4f8f-a7db-d8c87b957492.mp4",
    "/home/openclaw/.openclaw/media/inbound/ssstik.io_herbarara_1778775427451---a54ab63b-4f10-48b1-b0f1-ccb6d302f79d.mp4",
    "/home/openclaw/.openclaw/media/inbound/ssstik.io_mas.wied_348_1778775400762---00ff0395-4f84-42ad-9149-8fd102624217.mp4",
]

CAPTION = """🌿 AKAR ALANG-ALANG — Rahasia Kesehatan Alami!

✅ Detoksifikasi tubuh
✅ Bersihkan ginjal
✅ Atasi panas dalam
✅ Turunkan demam alami

Produknya bisa diorder disini 👉🏻 https://s.shopee.co.id/4AwZgkxNH3

#AkarAlangAlang #HerbalAlami #KesehatanAlami #DetoksGinjal #Jendralbot #BerkahKarya"""

COMMENTS = [
    "Wah menarik banget informasinya! 😍",
    "Manfaatnya luar biasa ya kak. 🔥",
    "Recommended banget buat kesehatan! 👍",
    "Penjelasannya detail sekali. ✨",
    "Udah langganan kakek saya nih! 💯",
    "Mantap! Langsung order buat stok di rumah 🛒",
    "Ini herbal asli ya kak? 🔥",
    "Cara buatnya gampang ternyata! 💸",
    "Penasaran pengen coba buat detox 😊",
    "Testimoninya pada oke semua! 👏",
    "Wajib punya buat kesehatan keluarga! ⭐⭐⭐⭐⭐",
    "Makasih infonya min! 🙌",
    "Suka banget sama konten edukatif begini! 💕",
    "Langsung checkout di Shopee! 🛍️",
    "Gak nyesel tau info ini 😍",
]

def post_video(pid, token, video_path):
    try:
        with open(video_path, 'rb') as v:
            r = requests.post(
                f'https://graph.facebook.com/v22.0/{pid}/videos',
                files={'source': v},
                data={'description': CAPTION, 'access_token': token},
                timeout=300
            )
            return r.json().get('id')
    except Exception as e:
        return f"Error: {str(e)}"

def add_comment(post_id, token, message):
    try:
        r = requests.post(
            f'https://graph.facebook.com/v22.0/{post_id}/comments',
            data={'message': message, 'access_token': token},
            timeout=30
        )
        return r.json().get('id')
    except:
        return None

def fetch_recent_posts(pid, token):
    try:
        r = requests.get(
            f'https://graph.facebook.com/v22.0/{pid}/posts',
            params={'access_token': token, 'limit': 10},
            timeout=30
        )
        return r.json().get('data', [])
    except:
        return []

def run():
    log("🚀 TARGET: 6 VIDEOS -> 15 PAGES")
    
    # 1. POST VIDEOS
    for i, v_path in enumerate(VIDEOS):
        v_name = os.path.basename(v_path)[:40]
        log(f"📹 Posting video {i+1}/6: {v_name}")
        for pid, token in TOKENS.items():
            res = post_video(pid, token, v_path)
            if res and not str(res).startswith("Error"):
                log(f"  ✅ {pid[:10]}... Posted: {res}")
            else:
                log(f"  ❌ {pid[:10]}... Failed: {res}")
            time.sleep(2)
    
    log("✅ ALL VIDEO POSTING ATTEMPTS FINISHED")
    
    # 2. CROSS-COMMENTING
    log("💬 STARTING CROSS-COMMENTING")
    all_pages = list(TOKENS.items())
    
    for target_pid, target_token in all_pages:
        posts = fetch_recent_posts(target_pid, target_token)
        if not posts: continue
        
        log(f"🔍 Checking {len(posts)} posts for Page {target_pid[:10]}...")
        
        for post in posts:
            p_id = post['id']
            msg = post.get('message', '').lower()
            
            # Identify relevant posts (videos or products)
            if any(key in msg for key in ['shopee', 'order', 'alang', 'komisi', 'harga']):
                # Pick other pages to comment
                comment_count = 0
                other_pages = [(p, t) for p, t in all_pages if p != target_pid]
                
                # Each post gets 3-5 random comments from other accounts
                import random
                commenters = random.sample(other_pages, k=random.randint(3, 5))
                
                for c_pid, c_token in commenters:
                    cmt = random.choice(COMMENTS)
                    c_res = add_comment(p_id, c_token, cmt)
                    if c_res:
                        comment_count += 1
                        time.sleep(1)
                
                log(f"  💬 Post {p_id} ({msg[:30]}...) -> {comment_count} comments added.")
    
    log("🔥 TASK FULLY COMPLETED")

if __name__ == "__main__":
    run()
