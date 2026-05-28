import requests
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNTS = ['act_380721031313330', 'act_435670549443081']

def check_active_budgets():
    for acc in ACCOUNTS:
        print(f"--- ACTIVE CAMPAIGNS FOR {acc} ---")
        url = f'https://graph.facebook.com/v19.0/{acc}/campaigns'
        params = {
            'access_token': ACCESS_TOKEN,
            'fields': 'name,status,effective_status,daily_budget,lifetime_budget',
            'limit': 100
        }
        data = requests.get(url, params=params).json().get('data', [])
        for c in data:
            if c['effective_status'] == 'ACTIVE':
                budget = c.get('daily_budget') or c.get('lifetime_budget') or "0"
                print(f"Name: {c['name']} | Status: {c['effective_status']} | Budget: {int(budget)/100 if budget != '0' else 'Not Set'}")

if __name__ == "__main__":
    check_active_budgets()
