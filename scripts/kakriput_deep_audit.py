import asyncio
from playwright.async_api import async_playwright
import os
import json
from datetime import datetime, timedelta

COOKIE_FILE = "config/shopee_affiliate_cookies_acc_4356.json"


async def deep_audit():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, "r") as f:
                cookies = json.load(f)
                await context.add_cookies(cookies)

        page = await context.new_page()
        try:
            # 1. Cek Order Record Tgl 12
            yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            print(f"Checking Order Record for {yesterday} (Kak Riput)...")
            url = f"https://affiliate.shopee.co.id/order_record?start_date={yesterday}&end_date={yesterday}"
            await page.goto(url, timeout=60000)
            await page.wait_for_timeout(10000)

            orders = await page.evaluate("""() => {
                const rows = document.querySelectorAll('.ant-table-row');
                return Array.from(rows).map(r => r.innerText);
            }""")

            print(f"Orders Found for {yesterday}: {len(orders)}")

            # 2. Ambil snapshot data dashboard (untuk OCR text)
            print("Extracting Dashboard Summary...")
            await page.goto("https://affiliate.shopee.co.id/", timeout=60000)
            await page.wait_for_timeout(10000)
            summary = await page.evaluate("""() => {
                return document.body.innerText;
            }""")

            # Cari "Pesanan" dan "Klik" di text
            import re

            klik_match = re.search(r"Klik\s+([\d.]+)", summary)
            pesanan_match = re.search(r"Pesanan\s+([\d.]+)", summary)

            print(f"Dashboard - Klik: {klik_match.group(0) if klik_match else 'N/A'}")
            print(
                f"Dashboard - Pesanan: {pesanan_match.group(0) if pesanan_match else 'N/A'}"
            )

        except Exception as e:
            print(f"Deep Audit Error: {e}")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(deep_audit())
