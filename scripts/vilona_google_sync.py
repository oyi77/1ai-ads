import gspread
from google.oauth2.service_account import Credentials
import pandas as pd
import os
from datetime import datetime

# CONFIG
SHEET_ID = '1o6Gjaz17FaTeo6x-0u36SPDn-QK18yEOnVbtt7W_ZY4'
DATA_FILE = 'reports/nyamiresep_report_final.csv'
SERVICE_ACCOUNT_FILE = 'credentials.json' # Mengasumsikan mas sudah taruh disini atau kita pakai file yang ada

def sync_data():
    print(f"--- VILONA GOOGLE SYNC STARTING ---")
    if not os.path.exists(DATA_FILE):
        print("Data file not found.")
        return

    try:
        # 1. Setup Auth
        scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
        # Playwright service account usually is better for this, 
        # but for now we attempt to reach the sheet using local credentials
        gc = gspread.service_account(filename=SERVICE_ACCOUNT_FILE)
        sh = gc.open_by_key(SHEET_ID)
        worksheet = sh.get_worksheet(0) # Ambil sheet pertama

        # 2. Load Data from CSV
        df = pd.read_csv(DATA_FILE).fillna('')
        
        # 3. Clear and Update
        # Kita update mulai dari baris 1
        worksheet.clear()
        worksheet.update([df.columns.values.tolist()] + df.values.tolist())
        
        print(f"✅ SUCCESS: Sheet updated at {datetime.now()}")

    except Exception as e:
        print(f"❌ SYNC ERROR: {e}")
        print("💡 Make sure to SHARE the sheet with: vilona-bot@gen-lang-client-0872904908.iam.gserviceaccount.com")

if __name__ == "__main__":
    sync_data()
