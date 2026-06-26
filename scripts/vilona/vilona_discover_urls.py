import asyncio
from playwright.async_api import async_playwright
import os
import json

COOKIE_FILE = 'config/shopee_cookies_nyamirespedapur.json'

async def discover():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, 'r') as f:
                cookies = json.load(f)
                await context.add_cookies(cookies)
        
        page = await context.new_page()
        await page.goto("https://affiliate.shopee.co.id/")
        await page.wait_for_timeout(10000)
        
        links = await page.evaluate("""() => {
            return Array.from(document.querySelectorAll('a')).map(a => ({text: a.innerText, href: a.href}));
        }""")
        for l in links:
            if "Pesanan" in l['text'] or "Klik" in l['text'] or "Order" in l['text'] or "Click" in l['text']:
                print(f"Found: {l['text']} -> {l['href']}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(discover())
