import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_380721031313330"


# ROI Threshold: Kita matikan yang CTR < 4% atau yang confirmed boncos
def cleanup_3807_final():
    url_c = f"https://graph.facebook.com/v19.0/{ACCOUNT_ID}/campaigns"
    camps = (
        requests.get(
            url_c, params={"access_token": ACCESS_TOKEN, "fields": "id,name,status"}
        )
        .json()
        .get("data", [])
    )

    actions = []
    for c in camps:
        # Cari yang confirm jelek dari data shopee/historis
        is_bad = False
        if "Test_Baru" in c["name"] or "Sofa" in c["name"] or "Piring" in c["name"]:
            is_bad = True

        # Rename yang jelek ke OFF_
        if is_bad and not c["name"].startswith("OFF_"):
            new_name = f"OFF_{c['name']}"
            requests.post(
                f'https://graph.facebook.com/v19.0/{c["id"]}',
                params={
                    "name": new_name,
                    "status": "PAUSED",
                    "access_token": ACCESS_TOKEN,
                },
            )
            actions.append(f"KILLED: {c['name']} -> {new_name}")

    return actions


if __name__ == "__main__":
    print(json.dumps(cleanup_3807_final(), indent=2))
