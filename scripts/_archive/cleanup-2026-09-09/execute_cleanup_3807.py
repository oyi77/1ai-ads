import requests
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = "act_380721031313330"

# CAMPAIGNS TO PAUSE (CPC > 250)
TO_PAUSE = [
    "120211516223400330",
    "23854961555540330",
]  # IDs for Rak Dapur 3 and Family&Relations
# CAMPAIGNS TO ACTIVATE (Potential CTR)
TO_ACTIVATE = ["23854992525790330"]  # ID for Rak Dapur 1-3-1


def cleanup():
    print("--- STARTING CLEANUP FOR SELOW ID 1041 ---")

    # Pause Bad Ones
    for cid in TO_PAUSE:
        r = requests.post(
            f"https://graph.facebook.com/v19.0/{cid}",
            params={"access_token": ACCESS_TOKEN, "status": "PAUSED"},
        )
        print(f"Pausing {cid}: {r.json()}")

    # Activate Good One
    for cid in TO_ACTIVATE:
        r = requests.post(
            f"https://graph.facebook.com/v19.0/{cid}",
            params={"access_token": ACCESS_TOKEN, "status": "ACTIVE"},
        )
        print(f"Activating {cid}: {r.json()}")


if __name__ == "__main__":
    cleanup()
