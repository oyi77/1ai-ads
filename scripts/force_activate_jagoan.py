import requests
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")


def reactivate():
    # Rak Dapur 2 (120244776291840121) & Rak Dapur 3 (120244919716960121)
    to_activate = ["120244776291840121", "120244919716960121"]
    for cid in to_activate:
        res = requests.post(
            f"https://graph.facebook.com/v19.0/{cid}",
            params={"access_token": ACCESS_TOKEN, "status": "ACTIVE"},
        ).json()
        print(f"Activating {cid}: {res}")


if __name__ == "__main__":
    reactivate()
