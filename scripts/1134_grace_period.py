#!/usr/bin/env python3
"""
1134 GOVERNOR — GRACE PERIOD PATCH
Guarded relationship between:
- Shopee report maturity: grace window keeps campaigns alive if the last Shopee report is still H or H+1
- Meta-only constraints: while data is immature, pauses are allowed ONLY for:
  * CPC > Rp 500
  * CTR < 3.0% while spend > 0
  * hard-cap breach
"""

import re
from datetime import datetime, timedelta
from pathlib import Path

REPORTING_DELAY_DAYS = 1
SHOPEE_CSV_DIR = Path.home() / "projects/1ai-ads/data/shopee"


def _parse_csv_date(filepath: Path):
    name = filepath.name
    m = re.search(r"(\d{4}-\d{2}-\d{2})", name)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%Y-%m-%d").date()
    except Exception:
        return None


def get_shopee_report_maturity():
    """
    Returns (maturity_date, within_grace).
    maturity_date: date of the latest Shopee report found in SHOPEE_CSV_DIR.
    within_grace: True if (today - maturity_date) <= REPORTING_DELAY_DAYS.
    """
    today = datetime.now().date()
    candidates = []
    if SHOPEE_CSV_DIR.exists():
        for p in SHOPEE_CSV_DIR.iterdir():
            if p.is_file() and p.suffix.lower() == ".csv":
                d = _parse_csv_date(p)
                if d:
                    candidates.append((d, p))

    if not candidates:
        # no data means we can't assert Shopee-driven pauses
        return today - timedelta(days=REPORTING_DELAY_DAYS + 1), False

    maturity_date, _ = max(candidates, key=lambda x: x[0])
    within_grace = (today - maturity_date) <= timedelta(days=REPORTING_DELAY_DAYS)
    return maturity_date, within_grace


def in_grace_period() -> bool:
    _, ok = get_shopee_report_maturity()
    return ok
