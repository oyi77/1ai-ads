import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_380721031313330"

# List Jagoan berdasarkan DATA REVENUE (yang paling banyak menghasilkan komisi)
WINNERS = [
    "120245463966210121",  # CBO_Scale_Rakdapur_Menikah_1
    "120245455749660121",  # CBO_Scale_Family&relations_Rakdapur
    "120245455213560121",  # CBO_Scale_Rak Dapur_Pernikahan 1
]


def launch_adforge():
    actions = []
    for cid in WINNERS:
        url = f"https://graph.facebook.com/v19.0/{cid}"
        # Ambil nama asli
        r_get = requests.get(
            url, params={"access_token": ACCESS_TOKEN, "fields": "name"}
        ).json()
        old_name = r_get.get("name", "Campaign")

        # Rename ke ADFORGE_
        new_name = f"ADFORGE_{old_name}"
        res = requests.post(
            url,
            params={"access_token": ACCESS_TOKEN, "name": new_name, "status": "ACTIVE"},
        ).json()

        if res.get("success"):
            actions.append(f"LAUNCHED: {new_name}")

    return actions


if __name__ == "__main__":
    print(json.dumps(launch_adforge(), indent=2))
