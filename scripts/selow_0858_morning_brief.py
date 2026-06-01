#!/usr/bin/env python3
import os
import datetime
import sys

# CONFIGURATION
AD_ACCOUNT_ID = "act_435670549443081"


def get_now_wib():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))


def get_yesterday_date():
    return (get_now_wib() - datetime.timedelta(days=1)).strftime("%Y-%m-%d")


def run_morning_brief():
    now = get_now_wib()
    yesterday = get_yesterday_date()

    # MOCK DATA - In production, this pulls from Meta Insights API for 'yesterday'
    data_yesterday = {
        "total_spend": 145250,
        "total_clicks": 1120,
        "avg_cpc": 130,
        "campaigns": [
            {
                "name": "CBO_WinningScale_BIDCAP180",
                "spend": 65000,
                "clicks": 540,
                "ctr": 7.8,
                "cpc": 120,
            },
            {
                "name": "CBO_Dongkrakelektrik_All",
                "spend": 45000,
                "clicks": 380,
                "ctr": 5.2,
                "cpc": 118,
            },
            {
                "name": "CBO_1-1-1_rakpiringpengering",
                "spend": 25000,
                "clicks": 180,
                "ctr": 0.45,
                "cpc": 139,
            },
            {
                "name": "ADFORGE_Testing_Rak",
                "spend": 10250,
                "clicks": 20,
                "ctr": 0.8,
                "cpc": 512,
            },
        ],
    }

    print("━━━━━━━━━━━━━━━━━━━━━━")
    print(f"🌅 MORNING BRIEF 0858")
    print(f"{now.strftime('%d %B %Y')}")
    print("━━━━━━━━━━━━━━━━━━━━━━")
    print(f"💰 Spend kemarin: Rp{data_yesterday['total_spend']:,} / Rp800.000")
    print(
        f"🖱 Total klik: {data_yesterday['total_clicks']:,} | CPC avg: Rp{data_yesterday['avg_cpc']}"
    )
    print("\nCAMPAIGN STATUS:")

    recommendations = []

    for c in data_yesterday["campaigns"]:
        status = "✅"
        if c["cpc"] > 300 or c["ctr"] < 0.5:
            status = "🚨"
        elif 150 <= c["cpc"] <= 300 or 0.5 <= c["ctr"] <= 1.0:
            status = "⚠️"

        print(f"{c['name']} → {status} | CPC:Rp{c['cpc']} CTR:{c['ctr']}%")

        # Recommendation logic
        if "rakpiringpengering" in c["name"].lower() and c["cpc"] > 100:
            recommendations.append(
                f"PAUSE/Turun Budget: {c['name']} - Intel CVR 0.3% (Zonasi Merah)."
            )
        if status == "✅" and (
            "tiplessalad" in c["name"].lower()
            or "kancingjepit" in c["name"].lower()
            or "WinningScale" in c["name"]
        ):
            recommendations.append(
                f"SCALE UP: {c['name']} - Performa joss + Intel CVR bagus."
            )
        if status == "🚨":
            recommendations.append(f"REVIEW CREATIVE: {c['name']} - CTR/CPC jeblok.")

    print("\n💡 REKOMENDASI:")
    if not recommendations:
        print("- Monitor manual, performa overall stabil.")
    for rec in recommendations:
        print(f"- {rec}")
    print("━━━━━━━━━━━━━━━━━━━━━━")


if __name__ == "__main__":
    run_morning_brief()
