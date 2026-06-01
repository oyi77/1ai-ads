"""AdForge API client for cron scripts.

Replaces direct Meta API calls with centralized AdForge backend.
Usage:
    from meta_client import AdForgeClient
    client = AdForgeClient()
    campaigns = client.get_campaigns()
    client.pause_campaign("123456")
"""

import os
import sys
import requests

BASE = os.getenv("ADFORGE_URL", "http://localhost:5000")


class AdForgeClient:
    def __init__(self, base=None, token=None):
        self.base = base or BASE
        self.token = token or os.getenv("ADFORGE_TOKEN", "")

    def _headers(self):
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _get(self, path, params=None):
        r = requests.get(
            f"{self.base}{path}", headers=self._headers(), params=params, timeout=30
        )
        r.raise_for_status()
        return r.json()

    def _post(self, path, data=None):
        r = requests.post(
            f"{self.base}{path}", headers=self._headers(), json=data, timeout=30
        )
        r.raise_for_status()
        return r.json()

    def _put(self, path, data=None):
        r = requests.put(
            f"{self.base}{path}", headers=self._headers(), json=data, timeout=30
        )
        r.raise_for_status()
        return r.json()

    # Campaigns
    def get_campaigns(self, account_id=None):
        params = {"account_id": account_id} if account_id else {}
        return self._get("/api/campaigns", params)

    def get_campaign(self, cid):
        return self._get(f"/api/campaigns/{cid}")

    def create_campaign(self, data):
        return self._post("/api/campaigns", data)

    def update_campaign(self, cid, data):
        return self._put(f"/api/campaigns/{cid}", data)

    def pause_campaign(self, cid):
        return self._post(f"/api/campaigns/{cid}/pause")

    def activate_campaign(self, cid):
        return self._post(f"/api/campaigns/{cid}/activate")

    # AdSets
    def get_adsets(self, cid):
        return self._get(f"/api/campaigns/{cid}/adsets")

    def update_adset(self, adset_id, data):
        return self._put(f"/api/adsets/{adset_id}", data)

    def set_bid_cap(self, adset_id, bid_cap):
        return self.update_adset(adset_id, {"bid_cap": bid_cap})

    # Ads
    def get_ads(self, cid):
        return self._get(f"/api/campaigns/{cid}/ads")

    def create_ad(self, data):
        return self._post("/api/ads", data)

    # Insights
    def get_insights(self, entity_id, date_preset="today"):
        return self._get(f"/api/insights/{entity_id}", {"date_preset": date_preset})

    # Autonomous
    def auto_scale(self):
        return self._post("/api/autonomous/scale")

    def get_autonomous_status(self):
        return self._get("/api/autonomous/status")

    # Health
    def health(self):
        return self._get("/health")


# Singleton
adforge = AdForgeClient()
