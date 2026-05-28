#!/usr/bin/env python3
"""Deploy remaining 3 videos from @trendsandang.idn to all 10 FB Pages."""
import json, requests, time, subprocess, hashlib
from pathlib import Path
from datetime import datetime

# Load existing videos
videos = json.loads(Path("temp/batch_videos_24may.json").read_text())
remaining = videos[2:]  # skip first 2 (already deployed)
print(f"🎬 {len(remaining)} videos to deploy")

# Load pages
cfg = json.loads(open("config/affiliate_pipeline_config.json").read())
pages = requests.get("https://graph.facebook.com/v19.0/me/accounts",
    params={"access_token": cfg["meta"]["access_token"], "limit": 15}).json()["data"]

# Process remaining videos
processed_dir = Path("temp/processed")
processed_dir.mkdir(exist_ok=True)

captions = [
    "Daster lowo gresik rayon jumbo kekinian! 🔥\n\nModel terbaru, nyaman, adem. Cocok buat daily wear.\n\n👇 Link:\nhttps://lynk.id/jendralbot\n\n#daster #dasterlowo #fashion #rekomendasi #ootd",
    "Daster lowo jumbo kekinian — WAJIB PUNYA! ✨\n\nBahan premium, jahitan rapi, model kekinian. Review jujur di video.\n\n👇 Link produk:\nhttps://lynk.id/jendralbot\n\n#dasterlowo #fashionhijab #ootdhijab #dasterkekinian",
    "Blazer kerah scuba lengan panjang — elegan & profesional! 👔\n\nCocok buat kerja, meeting, atau acara formal. Kancing 1, cutting slim fit.\n\n👇 Cek link:\nhttps://lynk.id/jendralbot\n\n#blazer #fashion #ootd #bajuwawancara #blazerwanita",
]

results = []
for i, v in enumerate(remaining):
    # Hash modify if not done
    input_path = Path(v["local_path"])
    output_path = processed_dir / f"mod_{v['id']}.mp4"
    
    if not output_path.exists():
        subprocess.run([
            "ffmpeg", "-y", "-i", str(input_path),
            "-c:v", "copy", "-af", "volume=-0.05dB",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", str(output_path),
        ], capture_output=True, timeout=60)
        print(f"🔧 Hash mod: {input_path.name}")
    
    caption = captions[i]
    
    for p in pages:
        page_id, page_name, page_token = p["id"], p["name"], p["access_token"]
        
        try:
            url = f"https://graph.facebook.com/v19.0/{page_id}/videos"
            with open(output_path, "rb") as f:
                r = requests.post(url,
                    params={"access_token": page_token, "description": caption},
                    files={"source": f}, timeout=120)
            data = r.json()
            now = datetime.now().strftime("%H:%M:%S")
            
            if "id" in data:
                permalink = f"https://facebook.com/{data['id']}"
                print(f"✅ [{now}] {page_name} — [{v['id'][:12]}] {permalink}")
                results.append({"time": now, "page": page_name, "status": "success", "url": permalink, "video": v["id"]})
            else:
                err = data.get("error", {}).get("message", str(data))[:120]
                print(f"⚠️ [{now}] {page_name} — [{v['id'][:12]}] ERROR: {err}")
                results.append({"time": now, "page": page_name, "status": "failed", "error": err, "video": v["id"]})
        except Exception as e:
            print(f"⚠️ [{datetime.now().strftime('%H:%M:%S')}] {page_name} — EXCEPTION: {str(e)[:80]}")
        
        time.sleep(4)

Path("logs/video_upload_full_24may.json").write_text(json.dumps(results, indent=2))
ok = sum(1 for r in results if r["status"] == "success")
print(f"\n📊 DONE — ✅ {ok} ⚠️ {len(results)-ok} | Total {len(results)} video posts")
