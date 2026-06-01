import asyncio
from playwright.async_api import async_playwright
import pandas as pd
import os

# Link Sheet Mas Veris
SHEET_URL = "https://docs.google.com/spreadsheets/d/1o6Gjaz17FaTeo6x-0u36SPDn-QK18yEOnVbtt7W_ZY4/edit?usp=sharing"
DATA_PATH = "reports/nyamiresep_report_final.csv"

async def brute_force_fill():
    if not os.path.exists(DATA_PATH):
        print("Data CSV tidak ditemukan.")
        return

    df = pd.read_csv(DATA_PATH)
    # Ambil 10 data terakhir biar gak nge-lag
    df_rows = df.tail(15)
    headers = df.columns.tolist()

    print(f"--- STARTING AGGRESSIVE SHEET UPDATE (PLAYWRIGHT) ---")
    async with async_playwright() as p:
        user_data_dir = os.path.expanduser('~/.openclaw/browser/openclaw/user-data')
        browser = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        page = await browser.new_page()
        
        try:
            print(f"Loading Sheet...")
            await page.goto(SHEET_URL, timeout=120000)
            await page.wait_for_timeout(20000) # Sabar nunggu canvas raksasa Google

            # Klik sel A1 (Perkiraan koordinat)
            await page.mouse.click(180, 270)
            
            # Select All and Clear
            print("Cleaning old data...")
            await page.keyboard.press("Control+A")
            await page.wait_for_timeout(500)
            await page.keyboard.press("Backspace")
            await page.wait_for_timeout(2000)

            # Type Headers
            print("Typing Headers...")
            await page.keyboard.type(" \t ".join(headers))
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(1000)

            # Type Rows
            print(f"Typing {len(df_rows)} data rows...")
            for _, row in df_rows.iterrows():
                # Format angka biar gampang dibaca
                row_vals = [str(x) for x in row.values]
                await page.keyboard.type(" \t ".join(row_vals))
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(300)

            print("✅ PUSH SUCCESSFUL.")
            await page.screenshot(path="reports/final_sync_confirmation.png")

        except Exception as e:
            print(f"❌ Automation Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(brute_force_fill())
