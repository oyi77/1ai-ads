import json
import os
import sys

# Mock-up data audit karena akses API sedang restrik (CORS atau Session)
# Di dunia nyata ini akan memproses .csv hasil fetch

def audit_profitability():
    print("--- VILONA TAG AUDIT ---")
    # Data Tag vs Profit (Contoh Data Hasil Scan)
    active_tags = {
        "rakdapur-winning": {"spend": 150000, "commission": 320000},
        "multistorage": {"spend": 50000, "commission": 15000}, 
        "sofaarab": {"spend": 200000, "commission": 0}
    }
    
    for tag, stats in active_tags.items():
        spend = stats['spend']
        comm = stats['commission']
        roi = (comm / spend) * 100 if spend > 0 else 0
        
        status = "✅ GASS (ROI > 200%)" if roi >= 200 else "⚠️ EVALUATE"
        if roi < 100: status = "🚨 SUNTIK MATI (BONCOS)"
        
        print(f"Tag: {tag:20} | Spend: {spend:10} | Comm: {comm:10} | ROI: {roi:6.1f}% | {status}")
        
        # Simulasi Auto-Action
        if roi < 100 or (tag == "sofaarab"):
            print(f"-> EXECUTING: Kill campaign for {tag}")

if __name__ == "__main__":
    audit_profitability()
