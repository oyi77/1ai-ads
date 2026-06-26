import asyncio
from playwright.async_api import async_playwright
import os
import json

COOKIE_FILE = 'config/shopee_cookies_nyamirespedapur.json'

async def scrape_deep():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, 'r') as f:
                cookies = json.load(f)
                await context.add_cookies(cookies)
        
        page = await context.new_page()
        try:
            print("Landing on Dashboard...")
            await page.goto("https://affiliate.shopee.co.id/", timeout=60000)
            await page.wait_for_timeout(15000)
            
            print(f"Current URL: {page.url}")
            # Look for sidebar menu items
            menu_items = await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('.ant-menu-item, .ant-menu-submenu-title')).map(m => m.innerText);
            }""")
            print(f"Menu Items: {menu_items}")
            
            # Navigasi ke Laporan Pesanan
            print("Trying to find 'Laporan Pesanan' or similar...")
            # If we know the URL is /order_record, let's just go there but wait for real elements
            await page.goto("https://affiliate.shopee.co.id/order_record", timeout=60000)
            await page.wait_for_selector('table', timeout=30000)
            
            rows = await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('tr')).map(r => r.innerText).filter(t => t.trim().length > 0);
            }""")
            print(f"Table Rows Found: {len(rows)}")
            for r in rows[:10]:
                print(f"Data: {r[:100]}...")

        except Exception as e:
            print(f"Deep Scrape Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(scrape_deep())
