import asyncio
from playwright.async_api import async_playwright
import os

# Folder Target Mas Veris (Confirmed Editor Access)
DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/18MaOXvK2WAadD1as4Kq8gbj4AzW1qAMv?usp=sharing"
FILE_PATH = os.path.abspath("vilona_extension_v1.tar.gz")

async def upload_to_drive_confirmed():
    print(f"--- ATTEMPTING DRIVE UPLOAD TO EDITOR FOLDER ---")
    
    user_data_dir = os.path.expanduser('~/.openclaw/browser/openclaw/user-data')
    
    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        page = await browser.new_page()
        
        try:
            print(f"Buka Folder Drive: {DRIVE_FOLDER_URL}")
            await page.goto(DRIVE_FOLDER_URL, timeout=90000, wait_until="networkidle")
            await page.wait_for_timeout(10000)
            
            # Mendeteksi input file siluman Google Drive
            # Biasanya Google Drive punya hidden input buat handle drag-and-drop / upload
            file_input = await page.query_selector('input[type="file"]')
            if file_input:
                print("Hidden file input found. Injecting file...")
                await file_input.set_input_files(FILE_PATH)
                await page.wait_for_timeout(20000) # Kasih waktu upload sampe kelar
                print("✅ UPLOAD INJECTION COMPLETE.")
                await page.screenshot(path="reports/drive_success_check.png")
            else:
                # Backup: Coba klik tombol "New" -> "File Upload" (lewat koordinat karena Canvas)
                print("Trying coordinate-based upload...")
                await page.mouse.click(100, 200) # Posisi tombol NEW biasanya di kiri atas
                await page.wait_for_timeout(2000)
                await page.screenshot(path="reports/drive_debug_canvas.png")
                print("Check reports/drive_debug_canvas.png for UI state.")

        except Exception as e:
            print(f"Error Upload: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    if os.path.exists(FILE_PATH):
        asyncio.run(upload_to_drive_confirmed())
    else:
        print("File vilona_extension_v1.tar.gz tidak ditemukan di root.")
