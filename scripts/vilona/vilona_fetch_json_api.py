import asyncio
from playwright.async_api import async_playwright
import os
import json
from datetime import datetime

COOKIE_FILE = 'config/shopee_cookies_nyamirespedapur.json'

async def fetch_api():
    print(f"--- 🛰️ VILONA API FETCH: ORDER RECORD ---")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, 'r') as f:
                cookies = json.load(f)
                await context.add_cookies(cookies)
        
        page = await context.new_page()
        try:
            # Landing dulu biar cookie valid di domain
            await page.goto("https://affiliate.shopee.co.id/order_record", timeout=60000)
            await page.wait_for_timeout(5000)
            
            # Hari ini
            today = datetime.now().strftime('%Y-%m-%d')
            api_url = f"https://affiliate.shopee.co.id/api/v3/report/order/list?start_date={today}&end_date={today}&page_offset=0&page_size=100"
            
            print(f"Fetching: {api_url}")
            data = await page.evaluate(f"async () => {{ const r = await fetch('{api_url}'); return await r.json(); }}")
            
            if data.get('data'):
                orders = data['data'].get('list', [])
                print(f"SUCCESS: {len(orders)} orders found for today.")
                for o in orders:
                    # Kita cari Sub_ID (Tag)
                    tag = o.get('sub_ids', [])
                    print(f"Order {o.get('order_id')} | Tag: {tag} | Status: {o.get('status_name')}")
            else:
                print(f"Empty API Result: {data}")

        except Exception as e:
            print(f"API Fetch Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(fetch_api())
