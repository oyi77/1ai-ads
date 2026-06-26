#!/usr/bin/env python3
"""
ads_daily_report.py — Daily Ads Performance Report
Aggregates all accounts, formats for Telegram, saves to file.

Usage:
  python3 scripts/ads_daily_report.py              # print report
  python3 scripts/ads_daily_report.py --days 7      # last 7 days instead of yesterday
"""

import requests, json, os, sys
from datetime import datetime, timedelta
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
API_BASE = "https://graph.facebook.com/v19.0"

ACCOUNTS = [
    ("act_380721031313330", "Selow ID 1041"),
    ("act_1439536310038458", "Selow ID 1208"),
    ("act_1773760133153789", "Selow ID 1134"),
    ("act_1181078009580337", "Selow ID 1340"),
    ("act_435670549443081", "Selow ID 0858"),
    ("act_1204208138534580", "Produk Digital"),
    ("act_2125021885010866", "GlowScent"),
]

os.makedirs("reports", exist_ok=True)


def api_get(path, params=None):
    if params is None:
        params = {}
    params["access_token"] = ACCESS_TOKEN
    try:
        r = requests.get(f"{API_BASE}/{path}", params=params, timeout=15)
        return r.json()
    except Exception as e:
        return {"error": str(e)}


def get_account_data(act_id, label, date_preset="yesterday"):
    """Get comprehensive data for one account."""
    result = {"label": label, "id": act_id, "error": None}

    # Account-level insights
    insights = api_get(
        f"{act_id}/insights",
        {
            "date_preset": date_preset,
            "fields": "spend,impressions,clicks,ctr,cpc,cpm,cost_per_action_type,actions,reach,frequency",
            "level": "account",
        },
    )

    if "error" in insights:
        result["error"] = insights["error"].get("message", str(insights["error"]))
        return result

    data = insights.get("data", [{}])[0] if insights.get("data") else {}
    result["spend"] = float(data.get("spend", 0))
    result["impressions"] = int(data.get("impressions", 0))
    result["clicks"] = int(data.get("clicks", 0))
    result["ctr"] = data.get("ctr", "0%")
    result["cpc"] = data.get("cpc", "0")
    result["cpm"] = data.get("cpm", "0")
    result["reach"] = int(data.get("reach", 0))
    result["frequency"] = data.get("frequency", "0")

    # Extract conversions from actions
    actions = data.get("actions", [])
    conversions = {}
    for a in actions:
        atype = a.get("action_type", "")
        avalue = int(a.get("value", 0))
        conversions[atype] = avalue
    result["purchases"] = conversions.get("purchase", 0)
    result["leads"] = conversions.get("lead", 0)
    result["add_to_carts"] = conversions.get("add_to_cart", 0)

    # Top campaigns by spend
    camp_insights = api_get(
        f"{act_id}/insights",
        {
            "date_preset": date_preset,
            "fields": "campaign_name,spend,impressions,ctr,cpc,actions",
            "level": "campaign",
            "limit": 10,
            "sort": "spend_desc",
        },
    )

    result["top_campaigns"] = []
    for c in camp_insights.get("data", []):
        result["top_campaigns"].append(
            {
                "name": c.get("campaign_name", "?"),
                "spend": float(c.get("spend", 0)),
                "ctr": c.get("ctr", "0%"),
                "cpc": c.get("cpc", "0"),
            }
        )

    # ROAS calculation (if purchase conversion value available)
    cost_per = data.get("cost_per_action_type", [])
    for cp in cost_per:
        if cp.get("action_type") == "purchase":
            result["cpa_purchase"] = cp.get("value", "0")

    return result


def format_report(results, date_preset, days_label):
    """Format all accounts into Telegram-ready report."""
    now = datetime.now().strftime("%d %b %Y %H:%M WIB")
    period = (
        "Hari ini"
        if date_preset == "today"
        else "Kemarin" if date_preset == "yesterday" else days_label
    )

    lines = [f"📋 *ADS DAILY REPORT* — {now}", f"Periode: {period}", ""]

    grand_total = {
        "spend": 0,
        "impressions": 0,
        "clicks": 0,
        "purchases": 0,
        "leads": 0,
    }

    for r in results:
        label = r["label"]
        if r.get("error"):
            lines.append(f'❌ *{label}* — ⚠️ Error: {r["error"][:80]}')
            lines.append("")
            continue

        spend = r["spend"]
        impressions = r["impressions"]
        ctr = r["ctr"]
        cpc = r["cpc"]
        reach = r["reach"]
        purchases = r["purchases"]
        leads = r["leads"]
        carts = r["add_to_carts"]

        grand_total["spend"] += spend
        grand_total["impressions"] += impressions
        grand_total["clicks"] += r["clicks"]
        grand_total["purchases"] += purchases
        grand_total["leads"] += leads

        # ROAS visual
        roas_emoji = "🟢" if purchases > 0 else "⚪"

        lines.append(f"{roas_emoji} *{label}*")
        lines.append(f"  ├─ Spend: Rp{spend:,.0f}")
        if impressions:
            lines.append(f"  ├─ Tayangan: {impressions:,} | Reach: {reach:,}")
        lines.append(f"  ├─ CTR: {ctr} | CPC: Rp{cpc}")
        if purchases:
            cpa = spend / purchases
            lines.append(f"  ├─ Pembelian: {purchases} | CPA: Rp{cpa:,.0f}")
        if leads:
            lines.append(f"  ├─ Leads: {leads}")
        if carts:
            lines.append(f"  └─ Add to Cart: {carts}")

        # Top campaigns
        tops = r.get("top_campaigns", [])[:3]
        if tops:
            for t in tops:
                lines.append(
                    f'     → {t["name"][:35]}: Rp{t["spend"]:,.0f} ({t["ctr"]})'
                )

        lines.append("")

    # Grand total
    total_spend = grand_total["spend"]
    total_purchases = grand_total["purchases"]
    total_leads = grand_total["leads"]

    lines.append("━" * 30)
    lines.append(f"💰 *Total Spend:* Rp{total_spend:,.0f}")
    lines.append(f'👁️ *Total Tayangan:* {grand_total["impressions"]:,}')
    if total_purchases:
        lines.append(
            f"🛒 *Pembelian:* {total_purchases} (CPA Rp{total_spend/total_purchases:,.0f})"
        )
    if total_leads:
        lines.append(f"📝 *Leads:* {total_leads}")
    lines.append(f"")

    # Action items / insights
    lines.append("🎯 *Insight:*")
    if total_purchases == 0 and total_spend > 0:
        lines.append("⚠️  Ada spend tapi 0 pembelian — cek funnel konversi!")
    elif total_purchases > 0:
        lines.append(f"✅ Ada {total_purchases} transaksi — pantau ROAS scaling.")

    if not results:
        lines.append("❌ Tidak ada data — mungkin API error atau belum ada aktivitas.")

    lines.append(f"")
    lines.append(f"⏱️  *Report by:* Vilona — {now}")

    return "\n".join(lines)


def main():
    days = 1
    if "--days" in sys.argv:
        idx = sys.argv.index("--days")
        if idx + 1 < len(sys.argv):
            days = int(sys.argv[idx + 1])

    date_preset = "yesterday"
    days_label = "Kemarin"
    if days > 1:
        date_preset = f"last_{days}d"
        days_label = f"{days} hari terakhir"

    print(f"📋 Generating report for: {date_preset}")

    results = []
    for act_id, label in ACCOUNTS:
        sys.stdout.write(f"  {label}... ")
        sys.stdout.flush()
        r = get_account_data(act_id, label, date_preset)
        results.append(r)
        if r.get("error"):
            print(f"❌ Error")
        else:
            print(f'Rp{r["spend"]:,.0f} | {r["impressions"]:,} impressions')

    report = format_report(results, date_preset, days_label)
    print("\n" + "=" * 50)
    print(report)

    # Save report files
    report_path = "reports/latest_daily_report.txt"
    with open(report_path, "w") as f:
        f.write(report)

    json_path = "reports/latest_daily_report.json"
    with open(json_path, "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\n📁 Report saved: {report_path}")
    print(f"📁 JSON saved: {json_path}")


if __name__ == "__main__":
    main()
