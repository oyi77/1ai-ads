import asyncio
from playwright.async_api import async_playwright
import os
import json

COOKIE_FILE = 'config/shopee_cookies_nyamirespedapur.json'

async def check_login():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, 'r') as f:
                cookies = json.load(f)
                await context.add_cookies(cookies)
        
        page = await context.new_page()
        await page.goto("https://affiliate.shopee.co.id/order_record")
        await page.wait_for_timeout(5000)
        content = await page.content()
        if "login" in page.url or "Login" in content:
            print("STATUS: NOT LOGGED IN")
        else:
            print("STATUS: LOGGED IN")
            # Try to find Sub_IDs
            sub_ids = await page.evaluate("""() => {
                const text = document.body.innerText;
                const matches = text.match(/nyamiresep-[a-z0-9-]+/g);
                return matches ? [...new Set(matches)] : [];
            }""")
            print(f"Detected Tags/SubIDs: {sub_ids}")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(check_login())
