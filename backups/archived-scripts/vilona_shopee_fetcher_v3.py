import asyncio
from playwright.async_api import async_playwright
import os
import json
from datetime import datetime, timedelta

COOKIE_FILE_NYAMI = './config/shopee_cookies.json'
COOKIE_FILE_KAKRIPUT = './config/shopee_affiliate_cookies_acc_4356.json'

async def get_shopee_data(cookie_path, account_label):
    print(f"--- FETCHING SHOPEE DATA: {account_label} ---")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        if os.path.exists(cookie_path):
            with open(cookie_path, 'r') as f:
                data = json.load(f)
                # Playwright expects a list. If it's a dict from EditThisCookie, convert or handle.
                if isinstance(data, list):
                    await context.add_cookies(data)
                elif isinstance(data, dict):
                    print(f"DEBUG: Cookie file is a dict, might be incompatible. Attempting extraction...")
                    # Common structure from some exporters is a list inside a dict
                    for key in ['cookies', 'data']:
                        if key in data and isinstance(data[key], list):
                            await context.add_cookies(data[key])
                            break
        
        page = await context.new_page()
        try:
            # Go to Shopee Dashboard
            print(f"Navigating to Shopee...")
            await page.goto("https://affiliate.shopee.co.id/conversion_report", timeout=60000)
            await page.wait_for_timeout(5000)
            
            if "login" in page.url:
                print(f"❌ {account_label}: SESSION EXPIRED. Update cookies needed.")
                return None
            
            print(f"✅ {account_label}: LOGGED IN.")
            
            # Scrape basic summary from the dashboard dashboard
            # Note: This is an example, real selectors may vary based on ID Shopee UI
            await page.screenshot(path=f"reports/shopee_{account_label}_dashboard.png")
            print(f"Dashboard captured: reports/shopee_{account_label}_dashboard.png")
            
            return True
            
        except Exception as e:
            print(f"Error {account_label}: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    os.makedirs('reports', exist_ok=True)
    asyncio.run(get_shopee_data(COOKIE_FILE_NYAMI, "NyamiResep"))
    asyncio.run(get_shopee_data(COOKIE_FILE_KAKRIPUT, "Kakriput"))
