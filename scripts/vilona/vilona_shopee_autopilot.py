import asyncio
from playwright.async_api import async_playwright
import os
import json
from datetime import datetime, timedelta

COOKIE_FILE = 'config/shopee_cookies_nyamirespedapur.json'

async def fetch_shopee_data_final():
    target_date_str = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    print(f"--- AUTO-FETCH START: {target_date_str} ---")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, 'r') as f:
                cookies = json.load(f)
                # Playwright deep cleaning for sameSite and other strict fields
                cleaned_cookies = []
                for c in cookies:
                    # Map 'strict' to 'Strict', 'lax' to 'Lax', None to 'Lax'
                    ss = str(c.get('sameSite', 'Lax')).capitalize()
                    if ss not in ['Strict', 'Lax', 'None']:
                        ss = 'Lax'
                    
                    cleaned_c = {
                        'name': c['name'],
                        'value': c['value'],
                        'domain': c['domain'],
                        'path': c['path'],
                        'secure': c.get('secure', True),
                        'httpOnly': c.get('httpOnly', False),
                        'sameSite': ss
                    }
                    cleaned_cookies.append(cleaned_c)
                
                await context.add_cookies(cleaned_cookies)
        
        page = await context.new_page()
        try:
            print("Navigating to Shopee Dashboard...")
            await page.goto("https://affiliate.shopee.co.id/conversion_report", timeout=90000)
            await page.wait_for_timeout(10000)
            
            if "login" in page.url:
                print("🚨 SESSION EXPIRED. Update cookies needed.")
                return
            
            print("✅ Logged In. Triggering API Fetch...")
            # We fetch May 11 (Yesterday) first to verify sync
            api_url = f"https://affiliate.shopee.co.id/api/v3/report/order/list?start_date={target_date_str}&end_date={target_date_str}&page_offset=0&page_size=100"
            
            data = await page.evaluate(f"""async () => {{
                try {{
                    const res = await fetch("{api_url}");
                    return await res.json();
                }} catch (e) {{ return {{error: e.message}}; }}
            }}""")
            
            if data.get('data'):
                print(f"SUCCESS: Auto-Fetch obtained {len(data['data'].get('list', []))} records.")
                # We will process this and update the Google Sheet automagically
                print(f"COMMISSION_REALTIME: {json.dumps(data['data'].get('summary', {}))}")
            else:
                print(f"API result empty: {data}")

        except Exception as e:
            print(f"Automation Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(fetch_shopee_data_final())
