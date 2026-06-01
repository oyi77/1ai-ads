import asyncio
from playwright.async_api import async_playwright
import os
import json

COOKIE_FILE = 'config/shopee_cookies_nyamirespedapur.json'

async def visual_audit():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, 'r') as f:
                cookies = json.load(f)
                await context.add_cookies(cookies)
        
        page = await context.new_page()
        try:
            print("Audit Data Pemesanan...")
            await page.goto("https://affiliate.shopee.co.id/order_record", timeout=60000)
            await page.wait_for_timeout(10000)
            await page.screenshot(path="temp/shopee_orders.png")
            
            print("Audit Laporan Klik...")
            await page.goto("https://affiliate.shopee.co.id/click_report", timeout=60000)
            await page.wait_for_timeout(10000)
            await page.screenshot(path="temp/shopee_clicks.png")
            
            print("Audit Completed. Files at temp/shopee_orders.png and temp/shopee_clicks.png")
        except Exception as e:
            print(f"Visual Audit Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(visual_audit())
