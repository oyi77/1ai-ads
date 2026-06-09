#!/usr/bin/env python3
"""
Kakriput (act_435670549443081) Smart Rules Engine
Based on: CVR + 7-day rolling commission + Shopee Sale Calendar
"""

import json
from datetime import datetime, timedelta

# =============================================
# SHOPEE SALE CALENDAR 2026
# =============================================
SALE_EVENTS = {
    # Tanggal Kembar - Komisi DOUBLE/Triple
    "2026-06-07": {"event": "6.6 Sale", "boost": 2.0, "type": "kembar"},
    "2026-06-08": {"event": "6.6 Sale", "boost": 2.0, "type": "kembar"},
    "2026-07-07": {"event": "7.7 Sale", "boost": 2.5, "type": "kembar"},
    "2026-08-08": {"event": "8.8 Sale", "boost": 2.5, "type": "kembar"},
    "2026-09-09": {"event": "9.9 Super Shopping Day", "boost": 3.0, "type": "kembar"},
    "2026-10-10": {"event": "10.10 Brands Festival", "boost": 2.5, "type": "kembar"},
    "2026-11-11": {"event": "11.11 Big Sale", "boost": 3.0, "type": "kembar"},
    "2026-12-12": {"event": "12.12 Year-End Sale", "boost": 3.0, "type": "kembar"},
    # Gajian + Co-Creation
    "2026-06-25": {"event": "Gajian + Co-Creation", "boost": 2.0, "type": "gajian"},
    "2026-06-26": {"event": "Gajian + Co-Creation", "boost": 2.0, "type": "gajian"},
    "2026-06-27": {"event": "Gajian + Co-Creation", "boost": 2.0, "type": "gajian"},
    "2026-07-25": {"event": "Gajian Sale", "boost": 2.0, "type": "gajian"},
    "2026-07-26": {"event": "Gajian Sale", "boost": 2.0, "type": "gajian"},
    "2026-07-27": {"event": "Gajian Sale", "boost": 2.0, "type": "gajian"},
    "2026-08-25": {"event": "Gajian Sale", "boost": 2.0, "type": "gajian"},
    "2026-09-25": {"event": "Gajian Sale", "boost": 2.0, "type": "gajian"},
    "2026-10-25": {"event": "Gajian Sale", "boost": 2.0, "type": "gajian"},
    "2026-11-25": {"event": "Gajian Sale", "boost": 2.0, "type": "gajian"},
    "2026-12-25": {"event": "Gajian Sale", "boost": 2.0, "type": "gajian"},
    # Special months
    "2026-06-01": {"event": "Early June", "boost": 1.5, "type": "general"},
    "2026-06-02": {"event": "Early June", "boost": 1.5, "type": "general"},
}

# =============================================
# CAMPAIGN PROFITABILITY DATA (1-7 Juni 2026)
# =============================================
TAGLINK_DATA = {
    "rakpiringpengering": {
        "name": "Rak Piring Pengering",
        "campaigns": ["BIDCAP_GEO_rakpiringpengering_INT04", "BIDCAP_GEO_rakpiringpengering_INT07",
                      "BIDCAP_GEO_rakpiringpengering_INT08", "BIDCAP_GEO_rakpiringpengering_INT10"],
        "clicks_7day": 9083,
        "orders_7day": 1409,
        "cvr_pct": 15.51,
        "commission_total": 3827208,
        "commission_cair": 1389080,
        "pending": 2438129,
        "epc": 421,
        "primary_platform": "Instagram",
        "secondary_platform": "Facebook",
        "avg_order_value": 2716,
        "status": "PAUSED",
        "priority": 1,
        "budget_daily": 50000,
        "budget_sale": 100000
    },
    "organizerpullout": {
        "name": "Organizer Pullout",
        "campaigns": ["BIDCAP_Organizer_organizerpullout_DapurShop_0603",
                      "BIDCAP_Organizer_organizerpullout_Dapur_0603",
                      "BIDCAP_Organizer_organizerpullout_Travel_0603"],
        "clicks_7day": 5182,
        "orders_7day": 597,
        "cvr_pct": 11.52,
        "commission_total": 1518662,
        "commission_cair": 484845,
        "pending": 1033817,
        "epc": 293,
        "primary_platform": "Instagram",
        "secondary_platform": "Facebook",
        "avg_order_value": 2544,
        "status": "PAUSED",
        "priority": 2,
        "budget_daily": 30000,
        "budget_sale": 60000
    },
    "setelanbajukaosmihugajah": {
        "name": "Setelan Baju Kaos Mihugajah",
        "campaigns": ["0858_setelanbajukaosmihugajah_fashionBelanja_BID",
                      "0858_setelanbajukaosmihugajah_fashionShopping_BID"],
        "clicks_7day": 3309,
        "orders_7day": 328,
        "cvr_pct": 9.91,
        "commission_total": 939626,
        "commission_cair": 214274,
        "pending": 725353,
        "epc": 284,
        "primary_platform": "Facebook",
        "secondary_platform": "Instagram",
        "avg_order_value": 2865,
        "status": "PAUSED",
        "priority": 3,
        "budget_daily": 25000,
        "budget_sale": 50000
    },
    "setelangajahthaialand": {
        "name": "Setelan Gajah Thailand",
        "campaigns": ["0858_gajahThailand_fashion_BID", "ON_BIDCAP_gajahThailand_fashion"],
        "clicks_7day": 5031,
        "orders_7day": 363,
        "cvr_pct": 7.22,
        "commission_total": 789117,
        "commission_cair": 20879,
        "pending": 768238,
        "epc": 157,
        "primary_platform": "Facebook",
        "secondary_platform": "Instagram",
        "avg_order_value": 2174,
        "status": "PAUSED",
        "priority": 4,
        "budget_daily": 15000,
        "budget_sale": 30000
    }
}

# =============================================
# DECISION RULES
# =============================================
RULES = {
    "primary_metric": "CVR",
    "secondary_metric": "7day_pending_commission",
    "tertiary_metric": "EPC",
    
    # DONT PAUSE rules
    "dont_pause_if": {
        "cvr_above_pct": 5.0,            # Don't pause if CVR > 5%
        "pending_commission_above": 50000,  # Don't pause if pending > Rp 50k
        "has_completed_orders": True       # Don't pause if any completed orders exist
    },
    
    # Only pause if ALL conditions met
    "pause_if_all": {
        "cvr_below_pct": 3.0,             # CVR < 3%
        "zero_orders_7days": True,         # No orders in 7 days
        "zero_completed_ever": True,       # Never had a completed order
        "spend_exceeds": 50000             # Spent > Rp 50k with 0 return
    },
    
    # Budget rules
    "budget_management": {
        "base_multiplier": 1.0,
        "sale_event_multiplier": 2.0,      # Double budget during sale
        "cvr_good_multiplier": 1.5,        # 1.5x if CVR > 10%
        "cvr_excellent_multiplier": 2.0,   # 2x if CVR > 15%
        "max_daily_rakpiringpengering": 100000,
        "max_daily_other": 60000
    },
    
    # Taglink-specific targeting
    "platform_strategy": {
        "rakpiringpengering": {
            "platform": "Instagram",
            "audience": "Wanita 25-45, Ibu Rumah Tangga",
            "interest": "Dapur, Memasak, Organizer Rumah"
        },
        "organizerpullout": {
            "platform": "Instagram",
            "audience": "Wanita 25-45",
            "interest": "Organizer, Dekorasi Rumah, Dapur Minimalis"
        },
        "setelanbajukaosmihugajah": {
            "platform": "Facebook",
            "audience": "Pria & Wanita 20-40",
            "interest": "Fashion, Kaos, Pakaian Pria"
        },
        "setelangajahthaialand": {
            "platform": "Facebook",
            "audience": "Wanita 20-40",
            "interest": "Fashion Wanita, Baju Thailand, Hijab"
        }
    }
}

# =============================================
# SHOPEE SALE DAY CHECKER
# =============================================
def is_sale_period():
    """Check if today is a Shopee sale period"""
    today = datetime.now().strftime("%Y-%m-%d")
    if today in SALE_EVENTS:
        return SALE_EVENTS[today]
    
    day = datetime.now().day
    
    # Weekend booster (Sabtu-Minggu)
    if datetime.now().weekday() >= 5:
        return {"event": "Weekend", "boost": 1.3, "type": "weekend"}
    
    return None

def get_budget_for_tag(taglink_data):
    """Calculate optimal budget based on sale calendar & performance"""
    sale = is_sale_period()
    multiplier = 1.0
    
    if sale:
        multiplier *= sale.get("boost", 1.0)
    
    cvr = taglink_data["cvr_pct"]
    if cvr > 15:
        multiplier *= RULES["budget_management"]["cvr_excellent_multiplier"]
    elif cvr > 10:
        multiplier *= RULES["budget_management"]["cvr_good_multiplier"]
    
    base = taglink_data["budget_daily"]
    max_budget = taglink_data["budget_sale"] if sale else taglink_data["budget_daily"] * 2
    
    final_budget = min(base * multiplier, max_budget)
    return int(final_budget)

def should_pause_campaign(taglink, days_no_data=7):
    """Determine if a campaign should be paused"""
    data = TAGLINK_DATA.get(taglink)
    if not data:
        return False
    
    rules = RULES["dont_pause_if"]
    
    # DONT PAUSE if ANY condition met
    if data["cvr_pct"] >= rules["cvr_above_pct"]:
        return False
    if data.get("pending", 0) >= rules["pending_commission_above"]:
        return False
    if data.get("commission_cair", 0) > 0:
        return False
    
    # Only pause if ALL pause conditions met
    pause_rules = RULES["pause_if_all"]
    if (data["cvr_pct"] < pause_rules["cvr_below_pct"] and
        data["orders_7day"] == 0 and
        data["commission_cair"] == 0):
        return True
    
    return False

# =============================================
# ACTION PLAN
# =============================================
def generate_action_plan():
    today = datetime.now().strftime("%Y-%m-%d")
    sale = is_sale_period()
    
    print(f"KAKRIPUT SMART ENGINE — {today}")
    if sale:
        print(f"🔥 SALE TODAY: {sale['event']} (boost {sale['boost']}x)")
    else:
        print("📅 Regular day")
    print("=" * 60)
    
    print("\nCAMPAIGN STATUS & BUDGET:")
    for tag, data in sorted(TAGLINK_DATA.items(), key=lambda x: x[1]["priority"]):
        pause = should_pause_campaign(tag)
        budget = get_budget_for_tag(data)
        sale_tip = ""
        if sale:
            sale_tip = f" [SALE BOOST: {int(data['budget_daily'])} -> {budget}]"
        
        print(f"\n  {data['name']} ({tag})")
        print(f"    CVR: {data['cvr_pct']}% | Comm: Rp{data['commission_total']:,} | Pending: Rp{data['pending']:,}")
        print(f"    Status: {data['status']} -> SHOULD BE ACTIVE? {'NO' if pause else 'YES ✅'}{sale_tip}")
        print(f"    Platform: {data['primary_platform']} | Budget: Rp{budget:,}/day")
        
        if sale and sale["type"] == "kembar":
            print(f"    ⚡ TANGGAL KEMBAR — DOUBLE COMMISSION INCOMING!")
        elif sale and sale["type"] == "gajian":
            print(f"    💰 GAJIAN SALE — BOOST BUDGET +50%")

    print("\n" + "=" * 60)
    print("ACTIONS TO EXECUTE:")
    
    for tag, data in sorted(TAGLINK_DATA.items(), key=lambda x: x[1]["priority"]):
        if data["status"] == "PAUSED" and not should_pause_campaign(tag):
            budget = get_budget_for_tag(data)
            print(f"  🔄 ON -> {tag} (budget Rp{budget:,}/day, platform: {data['primary_platform']})")
    
    print("\n" + "=" * 60)
    print(f"TOTAL ESTIMATED BUDGET/DAY: Rp{sum(get_budget_for_tag(d) for d in TAGLINK_DATA.values()):,}")
    print(f"ESTIMATED DAILY ORDERS: ~{sum(d['orders_7day'] for d in TAGLINK_DATA.values()) // 7}")
    print(f"ESTIMATED DAILY COMMISSION: Rp{sum(d['commission_total'] for d in TAGLINK_DATA.values()) // 7:,}")


if __name__ == "__main__":
    generate_action_plan()
