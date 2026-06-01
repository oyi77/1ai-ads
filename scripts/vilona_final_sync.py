import asyncio
from playwright.async_api import async_playwright
import pandas as pd
import os

# Link Sheet Mas Veris
SHEET_URL = "https://docs.google.com/spreadsheets/d/1o6Gjaz17FaTeo6x-0u36SPDn-QK18yEOnVbtt7W_ZY4/edit?usp=sharing"
DATA_PATH = "reports/nyamiresep_report_final.csv"

async def force_sync():
    if not os.path.exists(DATA_PATH):
        return
    
    df = pd.read_csv(DATA_PATH)
    # Focus on the most important data point: May 11 entries
    row_11 = df[df['Tanggal'] == '2026-05-11'].iloc[0]
    
    # We will try to type the summary info directly into the sheet visually
    print(f"--- ROBOT VILONA SYNCING TO SHEET ---")
    async with async_playwright() as p:
        user_data_dir = os.path.expanduser('~/.openclaw/browser/openclaw/user-data')
        browser = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=True,
            args=['--no-sandbox']
        )
        page = await browser.new_page()
        
        try:
            await page.goto(SHEET_URL, timeout=90000)
            await page.wait_for_timeout(10000) # Wait for canvas
            
            # Click upper left to start
            await page.mouse.click(150, 250) 
            
            # Brute force typing headers and data summary
            summary_text = (
                f"VILONA SYNC: 11-MAY | FB Spend: {row_11['Spend FB + 11% PPN']} | "
                f"Shopee Click: {row_11['Shopee Real Clicks']} | "
                f"Prob: {row_11['Probability (%)']} | Net Comm: {row_11['Comm Net (-3%)']} | "
                f"ROI: {row_11['ROI (%)']}"
            )
            
            await page.keyboard.type(summary_text)
            await page.keyboard.press("Enter")
            
            print("Sync Summary Typed into Sheet.")
            await page.screenshot(path="reports/sync_visual_confirm.png")

        except Exception as e:
            print(f"Sync error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(force_sync())
