import asyncio
from playwright.async_api import async_playwright
import os
import time

# File target
FILE_TO_UPLOAD = os.path.abspath("vilona_extension_v1.tar.gz")
TARGET_EMAIL = "grahainsanmandiri@gmail.com"

async def upload_to_drive():
    print(f"--- STARTING GOOGLE DRIVE UPLOAD FOR {TARGET_EMAIL} ---")
    
    # Gunakan profile 'openclaw' kalau-kalau sudah ada session login di sana
    user_data_dir = os.path.expanduser('~/.openclaw/browser/openclaw/user-data')
    
    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        page = await browser.new_page()
        
        try:
            print("Accessing Google Drive...")
            await page.goto("https://drive.google.com/drive/my-drive", timeout=90000)
            await page.wait_for_timeout(10000)
            
            # Cek apakah sudah login sebagai grahainsanmandiri
            # Jika belum login, gue butuh intervensi manual atau Mas 'Share' folder ke email bot gue saja
            if "login" in page.url or "signin" in page.url:
                print("🚨 GAGAL: Akun Google Drive belum login di browser server gue.")
                print(f"Saran: Mas Share folder di Drive Mas ke email ini: vilona-bot@gen-lang-client-0872904908.iam.gserviceaccount.com")
                await page.screenshot(path="reports/drive_login_failed.png")
                return False

            # Proses Upload (Jika sudah login)
            print("Mulai proses upload file...")
            # Simulasi klik tombol 'New' -> 'File upload'
            # Karena UI Drive kompleks (Canvas/JS), cara tercepat adalah drag-and-drop
            # Tapi Playwright headless butuh metode input[type=file]
            
            # TODO: Implement upload mechanism here
            await page.screenshot(path="reports/drive_state_check.png")
            print("Status Drive tersimpan di reports/drive_state_check.png")

        except Exception as e:
            print(f"Error Drive: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    if os.path.exists(FILE_TO_UPLOAD):
        asyncio.run(upload_to_drive())
    else:
        print("File tidak ditemukan.")
