import asyncio
from playwright.async_api import async_playwright
import os
import json
from datetime import datetime, timedelta

COOKIE_FILE_KAKRIPUT = './config/shopee_affiliate_cookies_acc_4356.json'

async def scrape_kakriput_details():
    print("--- SCRAPING KAKRIPUT DATA VIA PLAYWRIGHT ---")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        if os.path.exists(COOKIE_FILE_KAKRIPUT):
            with open(COOKIE_FILE_KAKRIPUT, 'r') as f:
                cookies = json.load(f)
                await context.add_cookies(cookies)
        
        page = await context.new_page()
        try:
            # Conversion Report
            # Select yesterday
            yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
            url = f"https://affiliate.shopee.co.id/conversion_report"
            await page.goto(url, timeout=60000)
            await page.wait_for_timeout(8000)
            
            # Simple text extraction for commission/orders
            # We look for common labels like 'Komisi Total' or values with 'Rp'
            summary = await page.evaluate("""() => {
                const bodyText = document.body.innerText;
                // Finding commission might be tricky without specific selectors, 
                // but let's try to get all div contents that look like currency
                const elements = Array.from(document.querySelectorAll('div, span, td'));
                const results = elements.filter(el => el.innerText.includes('Rp') || el.innerText.includes('Komisi')).map(el => el.innerText);
                return {
                    fullText: bodyText.substring(0, 2000), 
                    interesting: results.slice(0, 20)
                };
            }""")
            
            print("--- DATA SNIPPET ---")
            print(summary['fullText'])
            print("--- INTERESTING ELEMENTS ---")
            print(summary['interesting'])
            
        except Exception as e:
            print(f"Scrape Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(scrape_kakriput_details())
