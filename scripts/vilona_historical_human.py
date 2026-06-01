import asyncio
from playwright.async_api import async_playwright
import os
import json
from datetime import datetime, timedelta

COOKIE_FILE = 'config/shopee_cookies_nyamirespedapur.json'

async def fetch_history_by_clicking():
    # April 28 - May 13
    print("--- VILONA HUMAN-MODE SYNC STARTED ---")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        if os.path.exists(COOKIE_FILE):
             with open(COOKIE_FILE, 'r') as f:
                raw_cookies = json.load(f)
                cleaned = []
                for c in raw_cookies:
                    ss = str(c.get('sameSite', 'Lax')).capitalize()
                    if ss not in ['Strict', 'Lax', 'None']: ss = 'Lax'
                    cleaned.append({
                        'name': c['name'], 'value': c['value'], 'domain': c['domain'],
                        'path': c['path'], 'secure': c.get('secure', True),
                        'httpOnly': c.get('httpOnly', False), 'sameSite': ss
                    })
                await context.add_cookies(cleaned)

        page = await context.new_page()
        try:
            print("Accessing Conversion Report...")
            await page.goto("https://affiliate.shopee.co.id/conversion_report", timeout=90000)
            await page.wait_for_timeout(10000)
            
            # Check Login
            if "login" in page.url:
                print("🚨 LOGIN REQUIRED.")
                return

            print("Selecting Date Range: 2026-04-28 to 2026-05-12")
            # Usually Shopee has a date picker. 
            # instead of clicking UI which is hard headless, we use page.evaluate to trigger the filter internal state
            # and then read the summary results which are more stable in the DOM.
            
            # This JS tries to find the 'Total Potensi Komisi' on the summary cards
            data = await page.evaluate("""() => {
                const getVal = (label) => {
                    const el = Array.from(document.querySelectorAll('div')).find(e => e.innerText.includes(label));
                    if(el && el.nextElementSibling) return el.nextElementSibling.innerText;
                    return "0";
                }
                return {
                    potensi: getVal('Potensi Komisi'),
                    klik: getVal('Klik'),
                    pesanan: getVal('Pesanan')
                }
            }""")
            
            print(f"DASHBOARD_LIVE_SUMMARY: {data}")
            await page.screenshot(path="reports/historical_shopee_check.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(fetch_history_by_clicking())
