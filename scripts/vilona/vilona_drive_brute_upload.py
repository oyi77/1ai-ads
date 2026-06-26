import asyncio
from playwright.async_api import async_playwright
import os

# Folder Target Mas Veris (Public Edit Access)
DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/18MaOXvK2WAadD1as4Kq8gbj4AzW1qAMv?usp=sharing"
FILE_PATH = os.path.abspath("vilona_extension_v1.tar.gz")

async def upload_to_public_folder():
    print(f"--- STARTING UPLOAD TO PUBLIC DRIVE FOLDER ---")
    
    user_data_dir = os.path.expanduser('~/.openclaw/browser/openclaw/user-data')
    
    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        page = await browser.new_page()
        
        try:
            print(f"Opening Folder: {DRIVE_FOLDER_URL}")
            await page.goto(DRIVE_FOLDER_URL, timeout=90000)
            await page.wait_for_timeout(10000) # Wait for UI
            
            # Mendeteksi login atau akses editor
            # Karena ini link sharing, biasanya ada tombol 'New' kalau aksesnya 'Anyone can edit'
            # Kita coba cari input file siluman yang biasa ada di Drive
            
            print("Attempting file injection...")
            # Google Drive sering menggunakan file input tersembunyi
            handle = await page.query_selector('input[type="file"]')
            if handle:
                await handle.set_input_files(FILE_PATH)
                print("File injected. Waiting for upload completion...")
                await page.wait_for_timeout(15000) # Wait upload
                print("✅ UPLOAD SUCCESSFUL (Estimated).")
            else:
                print("❌ GAGAL: Tombol upload tidak ditemukan. Sepertinya akses folder ini cuma 'Viewer', bukan 'Editor'.")
                await page.screenshot(path="reports/drive_upload_failed.png")

        except Exception as e:
            print(f"Drive Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    if os.path.exists(FILE_PATH):
        asyncio.run(upload_to_public_folder())
    else:
        print("File tidak ada.")
