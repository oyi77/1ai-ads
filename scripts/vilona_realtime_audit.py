import asyncio
from playwright.async_api import async_playwright
import os
import json
from datetime import datetime

COOKIE_FILE = 'config/shopee_cookies_nyamirespedapur.json'

async def audit_realtime():
    print(f"[{datetime.now()}] 🔍 VILONA REAL-TIME AUDIT...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, 'r') as f:
                cookies = json.load(f)
                await context.add_cookies(cookies)
        
        page = await context.new_page()
        try:
            # 1. SCAN ORDER RECORD
            await page.goto("https://affiliate.shopee.co.id/order_record", timeout=60000)
            await page.wait_for_timeout(10000)
            
            # Extract Sub_ID from orders
            orders = await page.evaluate("""() => {
                const rows = document.querySelectorAll('.ant-table-row');
                return Array.from(rows).map(row => {
                    const text = row.innerText;
                    // Usually Sub_ID matches a pattern like nyamiresep-xxx or is in a specific cell
                    return text;
                });
            }""")
            
            print(f"Scanned {len(orders)} order rows.")
            tag_counts = {}
            for o in orders:
                # Simple pattern match for Sub_ID in row text
                # We expect tags like 'rakdapur-winning', 'multistorage', etc.
                # User might use custom tags too.
                for word in o.split():
                    if '-' in word and (len(word) > 5): # heuristic for tag
                        tag_counts[word] = tag_counts.get(word, 0) + 1
            
            print(f"Real-time Order Stats: {tag_counts}")
            
            # 2. SCAN CLICK REPORT
            await page.goto("https://affiliate.shopee.co.id/click_report", timeout=60000)
            await page.wait_for_timeout(10000)
            clicks = await page.evaluate("""() => {
                const rows = document.querySelectorAll('.ant-table-row');
                return Array.from(rows).map(row => row.innerText);
            }""")
            print(f"Scanned {len(clicks)} click rows.")

        except Exception as e:
            print(f"Audit Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(audit_realtime())
