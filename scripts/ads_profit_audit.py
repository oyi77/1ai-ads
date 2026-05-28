import pandas as pd
import json

# Data Input dari User
hpp_per_bungkus = 20000
komisi_cs_per_closing = 5000
gaji_pokok_cs = 1000000 # per bulan (asumsi 30 hari)
gaji_cs_per_hari = gaji_pokok_cs / 30

# Data Closing & Sales (Diringkas dari laporan chat user)
# Tanggal, Produk, Jumlah Closing, Qty Terjual (estimasi), Total Revenue
sales_data = [
    {"date": "2026-04-29", "product": "BAWANG LANANG", "closing": 2, "qty": 2, "revenue": 150000}, # Asumsi harga jual rata-rata
    {"date": "2026-04-30", "product": "PURWOCENG", "closing": 2, "qty": 2, "revenue": 180000},
    {"date": "2026-05-02", "product": "HERBALIS WEDANG", "closing": 2, "qty": 2, "revenue": 140000},
    {"date": "2026-05-02", "product": "PURWOCENG", "closing": 1, "qty": 1, "revenue": 90000},
    {"date": "2026-05-10", "product": "HERBALIS WEDANG", "closing": 1, "qty": 1, "revenue": 70000}
]

# Ads Spend Data (Ditarik dari FB API sebelumnya untuk periode yang sama)
ads_spend = {
    "HERBALIS WEDANG": 526451,
    "PURWOCENG": 168046,
    "BAWANG LANANG": 221585
}

df_sales = pd.DataFrame(sales_data)
summary = df_sales.groupby('product').agg({'closing': 'sum', 'qty': 'sum', 'revenue': 'sum'}).reset_index()

# Hitung Profitabilitas
results = []
for index, row in summary.iterrows():
    prod = row['product']
    spend = ads_spend.get(prod, 0)
    total_revenue = row['revenue']
    total_hpp = row['qty'] * hpp_per_bungkus
    total_komisi_cs = row['closing'] * komisi_cs_per_closing
    
    # Net Profit = Revenue - HPP - Komisi CS - Ads Spend
    net_profit = total_revenue - total_hpp - total_komisi_cs - spend
    
    results.append({
        "Product": prod,
        "Revenue": total_revenue,
        "Ads_Spend": spend,
        "HPP": total_hpp,
        "CS_Fee": total_komisi_cs,
        "Net_Profit": net_profit,
        "Status": "PROFIT" if net_profit > 0 else "LOSS"
    })

print(json.dumps(results, indent=2))
