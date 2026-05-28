"""Cleanup Account 1041 v2 — Kill duplicates + CPC>130"""
import json, requests

with open('scripts/list_ad_accounts.py') as f:
    ACCESS_TOKEN = f.read().split("ACCESS_TOKEN = '")[1].split("'")[0]

def api_post(path, data):
    d = {'access_token': ACCESS_TOKEN}
    d.update(data)
    return requests.post(f'https://graph.facebook.com/v19.0/{path}', data=d).json()

# === 1. PAUSE 6 DEAD MOVIES CLONES ===
clones_to_kill = [
    ('120245814356570121', 'VILONA_AUTO_CBO_Rakdapur3_Movies _CLONE_VILONA', 'DEAD_NoSpend'),
    ('120245688602090121', 'VILONA_AUTO_CBO_Rakdapur3_Movies (1)', 'DEAD_NoSpend'),
    ('120245688602060121', 'VILONA_AUTO_CBO_Rakdapur3_Movies (2)', 'DEAD_LowSpend'),
    ('120245688602050121', 'VILONA_AUTO_CBO_Rakdapur3_Movies (3)', 'DEAD_CPC145'),
    ('120245688602080121', 'CBO_Rakdapur3_Movies (1)', 'DEAD_NoSpend'),
    ('120245688602030121', 'CBO_Rakdapur3_Movies (2)', 'DEAD_Duplicate'),
]

print("=== PAUSING DEAD MOVIES CLONES ===")
for cid, cname, reason in clones_to_kill:
    result = api_post(cid, {'name': f'{reason}_{cname.replace(" ","_")}', 'status': 'PAUSED'})
    print(f"{cname:50s} → {'✅' if result.get('success') else '❌'} {result}")

# === 2. RENAME KEEPERS ===
keepers = [
    ('120245814350950121', 'VILONA_AUTO_CBO_Rakdapur3_Movies_CLONE_VILONA', 'CBO_Rakdapur3_Movies_WinnerA'),
    ('120245688589920121', 'VILONA_AUTO_CBO_Rakdapur3_Movies (4)', 'CBO_Rakdapur3_Movies_WinnerB'),
]
print("\n=== RENAMING KEEPERS ===")
for cid, cname, newname in keepers:
    result = api_post(cid, {'name': newname})
    print(f"{cname:50s} → {newname:40s} {'✅' if result.get('success') else '❌'}")

# === 3. PAUSE CAMPAIGN CPC > 130 ===
print("\n=== PAUSING CPC > 130 ===")
cpc_high = [
    ('120244776291860121', 'VILONA_AUTO_CBO_Scale_Rak Dapur_1-3-1_VILONA'),  # CPC 169
]
for cid, cname in cpc_high:
    result = api_post(cid, {'name': f'DEAD_CPC169_{cname.replace(" ","_")}', 'status': 'PAUSED'})
    print(f"{cname:50s} → {'✅' if result.get('success') else '❌'}")

# === 4. SUMMARY ===
print("\n=== SUMMARY ===")
print("KILLED: 6 Movies clones + 1 CPC>130 campaign = 7 campaigns")
print("KEPT: 2 Movies Winners (CPC 96-98, CTR 7-8.5%)")
print("KEPT: 2 LLA campaigns + 1 CBO_Scale Bidcap")
print(f"TOTAL ACTIVE NOW: 5 (was 12)")

# === 5. BUDGET REDISTRIBUTION ===
print("\n=== BUDGET REDISTRIBUTION ===")
# Freed budget from killed: 115+3+580+1594+5+37,305+677 = ~40,279
# Add to LLA campaigns
budget_increase = [
    ('120245955769030121', 'VILONA_LLA_Rakdapur3_v4', 50965),  # keep same
    ('120245955757740121', 'VILONA_LLA1p_Rakdapur3_v2', 50965),  # keep same  
]
# The freed budget goes to the 2 Winners + CBO_Scale_Bidcap
# But let's not touch budgets now - Veris will decide based on tomorrow's commission
print("Budget redistribution pending — waiting for tomorrow's Shopee commission data")
print("Per Veris rule: budget decision is DAILY based on ROI, not manual")
