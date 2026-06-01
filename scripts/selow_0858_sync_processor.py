import os
import csv
import json
from collections import defaultdict


def analyze_shopee_data(click_file, commission_file):
    clicks_per_tag = defaultdict(int)
    order_data = defaultdict(
        lambda: {"count": 0, "commission": 0.0, "status": defaultdict(int)}
    )

    # 1. Process Click Report
    with open(click_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            tag = row["Tag_link"].replace("----", "").strip()
            clicks_per_tag[tag] += 1

    # 2. Process Commission Report
    with open(commission_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Tag can be in Tag_link1 through Tag_link5
            tag = row.get("Tag_link1", "").strip()
            if not tag:
                continue

            status = row["Status Pesanan"]
            comm_raw = row["Komisi Bersih Affiliate (Rp)"].replace(",", "")
            try:
                comm = float(comm_raw)
            except Exception:
                comm = 0.0

            order_data[tag]["count"] += 1
            order_data[tag]["commission"] += comm
            order_data[tag]["status"][status] += 1

    # Correlation & Analysis Logic
    report = []
    for tag in set(list(clicks_per_tag.keys()) + list(order_data.keys())):
        c_count = clicks_per_tag.get(tag, 0)
        o_count = order_data[tag]["count"]
        comm = order_data[tag]["commission"]
        cvr = (o_count / c_count * 100) if c_count > 0 else 0

        status_icons = "✅" if o_count > 0 else "❌"
        if tag == "rakpiringpengering" and cvr < 1.0:
            status_icons = "🚨 (CVR Low)"

        report.append(
            {
                "tag": tag,
                "clicks": c_count,
                "orders": o_count,
                "commission": comm,
                "cvr": cvr,
                "status": status_icons,
            }
        )

    return report


if __name__ == "__main__":
    click_path = os.path.join(
        os.path.expanduser("~"),
        ".openclaw",
        "media",
        "inbound",
        "WebsiteClickReport202605131858---ed14e909-f31c-4675-8575-3e1f8c6ce0ee.csv",
    )
    comm_path = os.path.join(
        os.path.expanduser("~"),
        ".openclaw",
        "media",
        "inbound",
        "AffiliateCommissionReport202605131858---69945316-e83c-46a2-8685-6e72971399a3.csv",
    )
    results = analyze_shopee_data(click_path, comm_path)

    print("━━━━━━━━━━━━━━━━━━━━━━")
    print("📦 SHOPEE SYNC 0858 Analysis")
    print("━━━━━━━━━━━━━━━━━━━━━━")
    for r in results:
        if r["clicks"] > 0 or r["orders"] > 0:
            print(f"{r['status']} Tag: {r['tag']}")
            print(
                f"   Clicks: {r['clicks']} | Orders: {r['orders']} | CVR: {r['cvr']:.2f}%"
            )
            print(f"   Commission: Rp{r['commission']:,.0f}")
            print("-" * 20)
