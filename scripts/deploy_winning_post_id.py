import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = "act_380721031313330"
NEW_ADSET_ID = "120245619478650121"
WINNING_POST_ID = "122109158625125943"


def deploy_winning_post():
    print(f"--- DEPLOYING WINNING POST ID: {WINNING_POST_ID} ---")

    # Step 1: Create Ad Creative from Post ID
    creative_payload = {
        "access_token": ACCESS_TOKEN,
        "name": f"Winner_Creative_Post_{WINNING_POST_ID}",
        "object_story_id": WINNING_POST_ID,  # Using object_story_id for existing post
    }

    # Note: Some APIs prefer 'effective_object_story_id' or 'object_id' depending on type.
    # We try creating the creative first.
    cr_res = requests.post(
        f"https://graph.facebook.com/v11.0/{AD_ACCOUNT_ID}/adcreatives",
        data=creative_payload,
    ).json()

    if "id" in cr_res:
        creative_id = cr_res["id"]
        print(f"Ad Creative Created: {creative_id}")

        # Step 2: Create Ad in the Bid Cap Ad Set
        ad_payload = {
            "access_token": ACCESS_TOKEN,
            "name": "Ad_RakDapur_WinningPost_VILONA",
            "adset_id": NEW_ADSET_ID,
            "creative": json.dumps({"creative_id": creative_id}),
            "status": "ACTIVE",
        }
        ad_res = requests.post(
            f"https://graph.facebook.com/v11.0/{AD_ACCOUNT_ID}/ads", data=ad_payload
        ).json()
        print(f"AD Deployment Result: {ad_res}")
    else:
        print(f"Creative Creation Failed: {cr_res}")
        # Trying backup field: 'object_id' if object_story_id failed
        print("Retrying with object_id field...")
        creative_payload_v2 = {
            "access_token": ACCESS_TOKEN,
            "name": f"Winner_Creative_Post_v2_{WINNING_POST_ID}",
            "object_id": WINNING_POST_ID,
        }
        cr_res_v2 = requests.post(
            f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/adcreatives",
            data=creative_payload_v2,
        ).json()
        print(f"Retry Result: {cr_res_v2}")


if __name__ == "__main__":
    deploy_winning_post()
