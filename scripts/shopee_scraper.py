"""
Shopee order scraper using CloakBrowser (sync API).
Scrapes affiliate.shopee.co.id for conversion reports and seller.shopee.co.id for order data.
Uses cookies from config/shopee_seller_cookies.json.
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path

COOKIE_FILE = Path(__file__).parent.parent / "config" / "shopee_seller_cookies.json"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "shopee"


def load_cookies():
    """Load cookies from config file."""
    with open(COOKIE_FILE) as f:
        data = json.load(f)
    cookies = data.get("cookies", [])
    pw_cookies = []
    for c in cookies:
        pw_cookies.append({
            "name": c["name"],
            "value": c["value"],
            "domain": c.get("domain", ".shopee.co.id"),
            "path": "/",
        })
    return pw_cookies


def scrape_affiliate_orders():
    """Scrape affiliate conversion report."""
    from cloakbrowser import launch

    browser = launch(headless=True)
    page = browser.new_page()

    cookies = load_cookies()
    for c in cookies:
        page.context.add_cookies([c])

    try:
        page.goto("https://affiliate.shopee.co.id/conversion_report", timeout=60000)
        page.wait_for_timeout(8000)

        content = page.evaluate("""() => {
            const tables = document.querySelectorAll('table');
            const results = [];
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                for (const row of rows) {
                    const cells = Array.from(row.querySelectorAll('td, th'));
                    results.push(cells.map(c => c.innerText.trim()));
                }
            }
            return {
                fullText: document.body.innerText.substring(0, 5000),
                tableData: results.slice(0, 100)
            };
        }""")

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        out_file = OUTPUT_DIR / f"affiliate_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(out_file, "w") as f:
            json.dump(content, f, indent=2, ensure_ascii=False)

        print(f"Affiliate data saved: {out_file}")
        return content

    except Exception as e:
        print(f"Affiliate scrape error: {e}")
        return None
    finally:
        browser.close()


def scrape_seller_orders():
    """Scrape seller orders via API in browser context."""
    from cloakbrowser import launch

    browser = launch(headless=True)
    page = browser.new_page()

    cookies = load_cookies()
    for c in cookies:
        page.context.add_cookies([c])

    try:
        page.goto("https://seller.shopee.co.id/portal/sale", timeout=60000)
        page.wait_for_timeout(5000)

        # Call seller API from browser context (has cookies)
        orders_data = page.evaluate("""async () => {
            try {
                const resp = await fetch('/api/v3/order/search_order_list', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({page_number: 1, page_size: 50}),
                });
                const data = await resp.json();
                return data?.data?.order_list || [];
            } catch(e) {
                return [{error: e.message}];
            }
        }""")

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        out_file = OUTPUT_DIR / f"seller_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(out_file, "w") as f:
            json.dump(orders_data, f, indent=2, ensure_ascii=False)

        print(f"Seller orders saved: {out_file} ({len(orders_data)} orders)")
        return orders_data

    except Exception as e:
        print(f"Seller scrape error: {e}")
        return []
    finally:
        browser.close()


def main():
    """Run both scrapers."""
    print(f"=== Shopee Scraper ({datetime.now().isoformat()}) ===")

    print("\n[1] Scraping affiliate conversion report...")
    affiliate = scrape_affiliate_orders()

    print("\n[2] Scraping seller orders...")
    orders = scrape_seller_orders()

    print(f"\nDone. Affiliate: {bool(affiliate)}, Orders: {len(orders)}")


if __name__ == "__main__":
    main()
