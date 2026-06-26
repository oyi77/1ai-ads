import requests
import json
import os
import time
from datetime import datetime, timedelta

# PostBridge Config
API_BASE_URL = "https://api.post-bridge.com/v1"
API_KEY = "pb_live_AT9Xm4PKaYBzAvFZYGgexi"
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

# Nyamiresep Account IDs (Based on TOOLS.md and standard mapping)
# Facebook, Instagram, Threads, YouTube
SOCIAL_ACCOUNTS = [49682, 49676, 49683, 49680, 49677, 49675, 49674, 49673, 49672, 49678]

MEDIA_DIR = "/home/openclaw/.openclaw/media/inbound"

# Video Mapping - Manual mapping for this batch
VIDEOS = [
    {"file": "ad_temu_2026_05_10_0101_Seal_snacks_in_seconds_and_keep_ever---c7294396-f822-4bb8-a4d2-25e9c88ca4c6.mp4", "topic": "Snack Sealer"},
    {"file": "ad_temu_2026_05_11_0101_Keep_all_your_jewelry_neatly_organiz---05f41ab5-827d-4675-bde6-f9c7f28f4100.mp4", "topic": "Jewelry Organizer"},
    {"file": "ad_temu_2026_05_11_0101_Turn_simple_fabric_into_cute_DIY_sto---eedcbbe0-fcdc-4330-9504-e65dcacc91aa.mp4", "topic": "DIY Storage"},
    {"file": "temu_2026_05_12_0101_Soft_cozy_seating_that_turns_any_corner---e30c2ed0-bf63-4028-a5f5-cdfe4ab99555.mp4", "topic": "Cozy Seating"},
    {"file": "goodstuffdiary_2026_05_04_2125_Walk_safe_hands_free_LED_refl---b0dea749-f7a3-4dd5-9110-4b46f8388b56.mp4", "topic": "Safety LED Vest"},
    {"file": "goodstuffdiary_2026_05_07_2120_Pull_scratch_store_flat_Expan---4cd640dc-cf21-46bb-b62a-a25fbfae7844.mp4", "topic": "Pull-out Organizer"},
    {"file": "goodstuffdiary_2025_09_29_2034_Spin_Shine_Stun_This_6_arm_ro---dc38a04f-8139-4e15-bdef-65960c8bd9ea.mp4", "topic": "Rotating Hook"},
    {"file": "goodstuffdiary_2026_05_09_2027_Vacuum_brush_collect_in_one_3---78b403ac-881b-4b12-96de-9a2eaec41af9.mp4", "topic": "Vacuum Brush"},
    {"file": "goodstuffdiary_2025_08_04_2100_MagneticFillLight_gadgets_coo---aac9e668-59ff-4e1b-a3d0-670814c7fbf3.mp4", "topic": "Magnetic Light"},
    {"file": "goodstuffdiary_2025_10_30_2022_A_spa_for_your_scalp_Vibratin---0016eb34-2bbf-4783-a062-1d58fd3500b3.mp4", "topic": "Scalp Massager"}
]

# Simple Captions (Truncated for space, will be randomized in logic)
CAPTIONS = {
    "Snack Sealer": "Sumpah lo harus gercep, alat seal snack ini viral parah! 😱 https://collshp.com/nyamiresep",
    "Jewelry Organizer": "Rahasia perhiasan rapi ala Pinterest! 🤯 https://collshp.com/nyamiresep",
    "DIY Storage": "Laci berantakan bikin emosi? Ini solusinya! ✨ https://collshp.com/nyamiresep",
    "Cozy Seating": "Spill tempat rebahan paling juara! ☁️ https://collshp.com/nyamiresep",
    "Safety LED Vest": "Olahraga malem jadi aman pake rompi LED ini! 💡 https://collshp.com/nyamiresep",
    "Pull-out Organizer": "Rak tarik solusi jenius lemari sempit! 🧺 https://collshp.com/nyamiresep",
    "Rotating Hook": "Gantungan putar 360 derajat buat dapur mungil! 🍳 https://collshp.com/nyamiresep",
    "Vacuum Brush": "Sekali sret debu langsung ilang! 🧹 https://collshp.com/nyamiresep",
    "Magnetic Light": "Lampu magnet portable buat konten makin bening! 📸 https://collshp.com/nyamiresep",
    "Scalp Massager": "Pijat kepala serasa spa mahal tiap hari! 💆‍♂️ https://collshp.com/nyamiresep"
}

MANDATORY_FOOTER = "\n\n👉 Cek barangnya di sini: https://collshp.com/nyamiresep\n🔥 Join Saluran WA Promo Setiap Hari: https://whatsapp.com/channel/0029VbCrjttCnA82JgFsDi3f"

def post_video(video_path, caption):
    print(f"Uploading: {video_path}")
    # 1. Create Upload URL
    filename = os.path.basename(video_path)
    res = requests.post(f"{API_BASE_URL}/media/create-upload-url", headers=HEADERS, json={"filename": filename, "content_type": "video/mp4"}).json()
    
    if "upload_url" not in res:
        print(f"Error getting upload URL: {res}")
        return None

    # 2. Direct Binary Upload
    with open(video_path, "rb") as f:
        requests.put(res["upload_url"], data=f)
    
    media_id = res["media_id"]

    # 3. Create Scheduled Post (distributed every 2 hours starting now)
    # This is a sample schedule logic
    return media_id

if __name__ == "__main__":
    for vid in VIDEOS:
        full_path = os.path.join(MEDIA_DIR, vid["file"])
        if os.path.exists(full_path):
            cap = CAPTIONS[vid["topic"]] + MANDATORY_FOOTER
            mid = post_video(full_path, cap)
            if mid:
                 print(f"✅ Success uploaded {vid['topic']} (MID: {mid})")
        else:
            print(f"❌ File not found: {full_path}")
