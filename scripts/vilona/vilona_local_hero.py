import asyncio
from playwright.async_api import async_playwright
import os
import json
from datetime import datetime, timedelta

USER_DATA_DIR = os.path.expanduser('~/.config/vivaldi')

async def main_mission():
    print(f"--- VILONA LOCAL HERO: INFILTRATING SHOPEE FROM HOST ---")
    
    # Range tgl yang kosong
    dates = []
    start = datetime.strptime("2026-04-28", "%Y-%m-%d")
    for i in range(16): # Sampe tgl 13-05 buat jaga2
        dates.append((start + timedelta(days=i)).strftime("%Y-%m-%d"))

    async with async_playwright() as p:
        # Launching with existing profile to reuse login session
        browser = await p.chromium.launch_persistent_context(
            USER_DATA_DIR,
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        page = await browser.new_page()
        
        try:
            print("Navigating to Shopee Affiliate...")
            await page.goto("https://affiliate.shopee.co.id/conversion_report", timeout=90000)
            await page.wait_for_timeout(10000)
            
            # Check Login
            if "login" in page.url or await page.query_selector('input[type="password"]'):
                print("🚨 GAGAL: Session di PC ini ternyata belum login atau sudah expired.")
                await page.screenshot(path="reports/local_hero_failed.png")
                return

            print("✅ LOGGED IN DETECTED! Starting Deep Scrape...")
            
            scraped_results = {}
            for d in dates:
                print(f"Raiding Data for {d}...")
                api_url = f"https://affiliate.shopee.co.id/api/v3/report/order/list?start_date={d}&end_date={d}&page_offset=0&page_size=20"
                
                # Fetch via browser session
                data = await page.evaluate(f"""async () => {{
                    try {{
                        const res = await fetch("{api_url}");
                        return await res.json();
                    }} catch(e) {{ return {{error: e.message}}; }}
                }}""")
                
                if data.get('data'):
                    summary = data['data'].get('summary', {})
                    scraped_results[d] = {
                        'comm': float(summary.get('actual_commission', 0)),
                        'orders': int(summary.get('order_count', 0)),
                        'clicks': int(summary.get('click_count', 0))
                    }
                    print(f"  -> Found: Rp {scraped_results[d]['comm']} | Clicks: {scraped_results[d]['clicks']}")
                else:
                    print(f"  -> No data for {d}")
                
                await page.wait_for_timeout(2000)

            # SAVE RESULTS
            with open('reports/LOCAL_HERO_DATA.json', 'w') as f:
                json.dump(scraped_results, f, indent=2)
            
            print("--- MISSION COMPLETE: DATA SECURED ---")

        except Exception as e:
            print(f"Critical Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    os.makedirs('reports', exist_ok=True)
    asyncio.run(main_mission())
