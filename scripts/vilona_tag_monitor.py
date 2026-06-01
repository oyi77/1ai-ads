import asyncio
from playwright.async_api import async_playwright
import os
import json
from datetime import datetime

COOKIE_FILE = 'config/shopee_cookies_nyamirespedapur.json'

async def monitor_tags():
    print(f"[{datetime.now()}] 🛡️ VILONA REAL-TIME TAG MONITOR...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, 'r') as f:
                cookies = json.load(f)
                await context.add_cookies(cookies)
        
        page = await context.new_page()
        try:
            # 1. ORDER RECORD (Data Pemesanan)
            print("Accessing Data Pemesanan...")
            await page.goto("https://affiliate.shopee.co.id/order_record", timeout=60000)
            await page.wait_for_timeout(10000)
            
            # Extract rows and find columns that look like tags
            # We look for text matching the user's tag pattern
            order_data = await page.evaluate("""() => {
                const rows = document.querySelectorAll('tr');
                return Array.from(rows).map(row => row.innerText).filter(t => t.length > 20);
            }""")
            
            print(f"Total Rows in Order Record: {len(order_data)}")
            tag_performance = {}
            for row in order_data:
                # User's tags usually look like 'nyamiresep-xxx' or similar
                # Let's search for tags specifically
                words = row.split()
                for word in words:
                    if '-' in word and any(char.isdigit() for char in word) == False: # Simple heuristic
                        # Basic tag check: if it looks like a tag (lowercase-with-dashes)
                        if word.islower() and '-' in word:
                            tag_performance[word] = tag_performance.get(word, 0) + 1
            
            print(f"Current Order Count by Tag: {tag_performance}")
            
            # 2. CLICK REPORT (Laporan Klik)
            print("\nAccessing Laporan Klik...")
            await page.goto("https://affiliate.shopee.co.id/click_report", timeout=60000)
            await page.wait_for_timeout(10000)
            click_data = await page.evaluate("""() => {
                const rows = document.querySelectorAll('tr');
                return Array.from(rows).map(row => row.innerText).filter(t => t.length > 20);
            }""")
            
            click_stats = {}
            for row in click_data:
                words = row.split()
                for word in words:
                    if word.islower() and '-' in word and len(word) > 4:
                        click_stats[word] = click_stats.get(word, 0) + 1
            
            print(f"Current Click Count by Tag: {click_stats}")

        except Exception as e:
            print(f"Monitor Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(monitor_tags())
