import asyncio
from playwright.async_api import async_playwright
import os
import json
from datetime import datetime, timedelta

# Cookies stored from Mas Veris
COOKIE_FILE_NYAMI = './config/shopee_cookies.json'
COOKIE_FILE_KAKRIPUT = './config/shopee_affiliate_cookies_acc_4356.json'

async def get_shopee_data(cookie_path, account_label):
    print(f"--- ATTEMPTING AUTO-FETCH: {account_label} ---")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        # Load Cookies
        if os.path.exists(cookie_path):
            with open(cookie_path, 'r') as f:
                cookies = json.load(f)
                await context.add_cookies(cookies)
        
        page = await context.new_page()
        try:
            # Go to Conversion Report
            # Target Yesterday (11 May)
            yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
            url = f"https://affiliate.shopee.co.id/api/v3/report/order/list?start_date={yesterday}&end_date={yesterday}&page_offset=0&page_size=20"
            
            print(f"Fetching API Data for {yesterday}...")
            await page.goto("https://affiliate.shopee.co.id/conversion_report") # Initialize session
            
            # Use page.evaluate to call the internal API if possible or scrape table
            # For quick proof: Screen check
            await page.screenshot(path=f"reports/shopee_{account_label}_check.png")
            
            # Simple scrape attempt (Total Commission element check)
            # This depends on Shopee's DOM structure
            await page.wait_for_timeout(5000)
            
            # Search for commission text in the page
            content = await page.content()
            if "login" in page.url.lower():
                print(f"❌ {account_label}: Session Expired. Cookies need update.")
            else:
                print(f"✅ {account_label}: Logged In. Extracting data...")
                # Extracting via JS to find common commission patterns
                data = await page.evaluate("""() => {
                    return {
                        url: window.location.href,
                        title: document.title
                    }
                }""")
                print(f"Data Root: {data}")

        except Exception as e:
            print(f"Error {account_label}: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    os.makedirs('reports', exist_ok=True)
    asyncio.run(get_shopee_data(COOKIE_FILE_NYAMI, "NyamiResep"))
    asyncio.run(get_shopee_data(COOKIE_FILE_KAKRIPUT, "Kakriput"))
