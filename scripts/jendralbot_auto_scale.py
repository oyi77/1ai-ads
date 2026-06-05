#!/usr/bin/env python3
"""
Auto-Scale Script for JENDRALBOT Campaigns
Scales budget toward top performers and shifts away from underperforming platforms.

Strategy:
- Use completed + pending revenue as economic signal
- Prefer scaling platforms and tags with actual commission
- Outputs scale_plan.json for apply_scale
"""

import json
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "outputs" / "jendralbot_autoscaler"
DATA_DIR = REPO_ROOT / "data" / "shopee"
TAGLINK_MAP_PATH = DATA_DIR / "taglink_mapping_2026-06-04.json"

for path in (OUTPUT_DIR, DATA_DIR):
    path.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, fallback):
    if path.exists():
        with open(path, "r") as f:
            return json.load(f)
    return fallback


def load_platform_data():
    # Prefer dashboard, then dedicated mapping file
    for name in ("nyamiresep_dashboard_live.json", "platform_mapping.json"):
        candidate = DATA_DIR / name
        if candidate.exists():
            data = load_json(candidate, [])
            if name.endswith(".json") and isinstance(data, dict) and "paused_platforms" in data:
                return candidate, data
            if isinstance(data, list) and data:
                return candidate, data
    return None, []


def main():
    print("=" * 60)
    print("🚀 JENDRALBOT AUTO-SCALE SCRIPT")
    print("=" * 60)

    mapping_path, platform_context = load_platform_data()

    taglink_map = load_json(TAGLINK_MAP_PATH, {"tags": []}).get("tags", [])
    metrics_path = OUTPUT_DIR / "campaign_metrics.json"
    top_products_path = OUTPUT_DIR / "top_products.csv"
    metrics = load_json(metrics_path, {})
    top_products = []

    if top_products_path.exists():
        import csv
        with open(top_products_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                top_products.append(row)
                break
        if not top_products:
            top_products = []

    total_completed_revenue = float(metrics.get("completed_revenue", 0) or 0)
    total_pending_revenue = float(metrics.get("pending_revenue", 0) or 0)
    total_revenue = total_completed_revenue + total_pending_revenue

    if not total_revenue:
        for tag in taglink_map:
            total_revenue += float(tag.get("comm_total", 0) or 0)
            total_completed_revenue += float(tag.get("comm_done", 0) or 0)
            total_pending_revenue += float(tag.get("comm_pending", 0) or 0)

    print(f"\nTotal realized revenue : IDR {total_completed_revenue:,.0f}")
    print(f"Total pending revenue  : IDR {total_pending_revenue:,.0f}")
    print(f"Total economic signal  : IDR {total_revenue:,.0f}")

    if not top_products:
        sorted_tags = sorted(taglink_map, key=lambda x: float(x.get("comm_total", 0) or 0), reverse=True)
        for tag in sorted_tags[:5]:
            top_products.append(
                {
                    "Product Name": tag.get("taglink", "Unknown"),
                    "Total Commission": tag.get("comm_total", 0),
                    "orders": tag.get("orders", 0),
                    "platforms": "; ".join(f"{p['Platform']}:{p['orders']}" for p in tag.get("platform_split", [])[:3]),
                }
            )

    print("\n=== PRIMARY SCALE TARGETS ===")
    for i, item in enumerate(top_products[:5], 1):
        name = item.get("Product Name") or item.get("product", "Unknown")
        commission = float(item.get("Total Commission", item.get("commission", 0)) or 0)
        orders = item.get("orders", item.get("Order Count", 0))
        print(f"{i}. {name} | orders={orders} | commission=IDR {commission:,.0f}")

    recommended_top5 = int(total_revenue * 0.60)
    recommended_test = int(total_revenue * 0.15)
    recommended_monitor = int(total_revenue * 0.25)

    scale_plan = {
        "budget": {
            "top_5": recommended_top5,
            "test": recommended_test,
            "monitor": recommended_monitor,
            "total": recommended_top5 + recommended_test + recommended_monitor,
        },
        "primary_targets": [
            {
                "name": item.get("Product Name") or item.get("product", "Unknown"),
                "commission": float(item.get("Total Commission", item.get("commission", 0)) or 0),
                "orders": item.get("orders", item.get("Order Count", 0)),
                "platforms": item.get("platforms", ""),
            }
            for item in top_products[:5]
        ],
        "platforms": {
            "context_source": str(mapping_path) if mapping_path else None,
            "data": platform_context if isinstance(platform_context, list) else platform_context,
        },
        "timestamp": datetime.now().isoformat(),
    }

    save_file = OUTPUT_DIR / "scale_plan.json"
    with open(save_file, "w") as f:
        json.dump(scale_plan, f, indent=2)

    print(f"\nScale plan saved -> {save_file}")

    print("\n=== BUDGET RECOMMENDATION ===")
    print(f"Top 5 products  : IDR {recommended_top5:,}")
    print(f"Test budget     : IDR {recommended_test:,}")
    print(f"Monitor budget  : IDR {recommended_monitor:,}")
    print(f"Total           : IDR {recommended_top5 + recommended_test + recommended_monitor:,}")
    print("\nNext: review taglink mapping and target active adsets before applying.")


if __name__ == "__main__":
    main()
