import asyncio
from playwright.async_api import async_playwright
import pandas as pd
import os
import time

# Config
SHEET_URL = "https://docs.google.com/spreadsheets/d/1o6Gjaz17FaTeo6x-0u36SPDn-QK18yEOnVbtt7W_ZY4/edit?usp=sharing"
CSV_DATA = "reports/nyamiresep_report_final.csv"

async def push_final():
    if not os.path.exists(CSV_DATA):
        return

    df = pd.read_csv(CSV_DATA)
    # Get last 15 rows
    df_tail = df.tail(15)
    
    async with async_playwright() as p:
        user_data_dir = os.path.expanduser('~/.openclaw/browser/openclaw/user-data')
        browser = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        page = await browser.new_page()
        
        try:
            print(f"Opening Sheet: {SHEET_URL}")
            await page.goto(SHEET_URL, wait_until="networkidle", timeout=90000)
            await page.wait_for_timeout(15000) # Wait for Canvas to fully render
            
            # Use keyboard shortcuts to clear and paste
            # Ctrl+A then Delete
            await page.keyboard.press("Control+A")
            await page.wait_for_timeout(500)
            await page.keyboard.press("Backspace")
            await page.wait_for_timeout(1000)
            
            # Type headers
            header_str = " \t ".join(df.columns.tolist())
            await page.keyboard.type(header_str)
            await page.keyboard.press("Enter")
            
            # Type rows
            for _, row in df_tail.iterrows():
                row_str = " \t ".join([str(x) for x in row.values])
                await page.keyboard.type(row_str)
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(200)

            print("Data points pushed successfully.")
            await page.screenshot(path="reports/final_sheet_push_success.png")
            
        except Exception as e:
            print(f"Push Meta Error: {e}")
            await page.screenshot(path="reports/push_error.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(push_final())
