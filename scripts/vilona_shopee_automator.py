import asyncio
from playwright.async_api import async_playwright
import os
import json
from datetime import datetime, timedelta

COOKIE_FILE = 'config/shopee_cookies_nyamirespedapur.json'

async def fetch_shopee_data_cleaned():
    target_date_str = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    print(f"--- AUTO-FETCH START: {target_date_str} ---")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, 'r') as f:
                cookies = json.load(f)
                # Clean up sameSite for Playwright compatibility
                for cookie in cookies:
                    if cookie.get('sameSite') is None:
                        cookie['sameSite'] = 'Lax' # Default to Lax if null
                await context.add_cookies(cookies)
        
        page = await context.new_page()
        try:
            print("Accessing Affiliate Dashboard...")
            await page.goto("https://affiliate.shopee.co.id/conversion_report", timeout=90000)
            await page.wait_for_timeout(8000)
            
            if "login" in page.url:
                print("🚨 SESSION EXPIRED.")
                return
            
            print("✅ Logged In. Fetching API Data...")
            api_url = f"https://affiliate.shopee.co.id/api/v3/report/order/list?start_date={target_date_str}&end_date={target_date_str}&page_offset=0&page_size=20"
            
            response_data = await page.evaluate(f"""async () => {{
                try {{
                    const res = await fetch("{api_url}");
                    return await res.json();
                }} catch (e) {{ return {{error: e.message}}; }}
            }}""")
            
            if response_data.get('data'):
                orders = response_data['data'].get('list', [])
                print(f"SUCCESS: Found {len(orders)} orders via API.")
                print(f"DATA_JSON: {json.dumps(response_data['data'])}")
            else:
                 print(f"API Error or No Data: {response_data}")

        except Exception as e:
            print(f"Fetch Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(fetch_shopee_data_cleaned())
