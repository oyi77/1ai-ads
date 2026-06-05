"""Low-level Carbon API client.

Reads:
- CARBON_API_URL
- CARBON_API_KEY
- CARBON_API_KEY_FALLBACK
- CARBON_TIMEOUT_S
- CARBON_RETRY_MAX
- CARBON_RETRY_BACKOFF_S
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class CarbonClientConfig:
    api_url: str = os.getenv("CARBON_API_URL", "https://api.carbon.io/v1").rstrip("/")
    primary_key: str = os.getenv("CARBON_API_KEY", "")
    fallback_key: str = os.getenv("CARBON_API_KEY_FALLBACK", "")
    timeout_s: int = int(os.getenv("CARBON_TIMEOUT_S", "15"))
    retry_max: int = int(os.getenv("CARBON_RETRY_MAX", "2"))
    retry_backoff_s: float = float(os.getenv("CARBON_RETRY_BACKOFF_S", "0.5"))


class CarbonApiError(Exception):
    def __init__(self, status: Optional[int], body: str, *, retryable: bool = False):
        self.status = status
        self.body = body
        self.retryable = retryable
        super().__init__(f"Carbon API error status={status} body={body[:200]}")


class CarbonClient:
    def __init__(self, cfg: Optional[CarbonClientConfig] = None) -> None:
        self.cfg = cfg or CarbonClientConfig()
        self._keys: list[str] = [k for k in [self.cfg.primary_key, self.cfg.fallback_key] if k]
        self._key_index: int = 0

    def _active_key(self) -> str:
        if not self._keys:
            raise RuntimeError("No Carbon API keys configured")
        return self._keys[self._key_index % len(self._keys)]

    def rotate_key(self) -> None:
        if len(self._keys) > 1:
            self._key_index = (self._key_index + 1) % len(self._keys)

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Any:
        url = f"{self.cfg.api_url}/{path.lstrip('/')}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"

        last_err: Optional[CarbonApiError] = None
        tried_keys = 0
        attempts = 0
        max_attempts = max(0, self.cfg.retry_max) + 1

        while tried_keys < max(len(self._keys), 1) and attempts < max_attempts:
            key = self._active_key()
            req_headers = {
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            }
            if headers:
                req_headers.update(headers)

            data = None
            if json_body is not None:
                data = json.dumps(json_body).encode("utf-8")

            req = urllib.request.Request(
                url,
                data=data,
                headers=req_headers,
                method=method,
            )

            try:
                with urllib.request.urlopen(req, timeout=self.cfg.timeout_s) as resp:
                    raw = resp.read().decode("utf-8", errors="ignore")
                    if not raw.strip():
                        return None
                    try:
                        return json.loads(raw)
                    except json.JSONDecodeError:
                        return {"_raw": raw}
            except urllib.error.HTTPError as e:
                body = ""
                try:
                    body = e.read().decode("utf-8", errors="ignore")
                except Exception:
                    pass

                retryable = e.code in (429, 500, 502, 503, 504)
                err = CarbonApiError(e.code, body, retryable=retryable)
                last_err = err

                if retryable and attempts < max_attempts - 1:
                    time.sleep(self.cfg.retry_backoff_s * (attempts + 1))
                    attempts += 1
                    continue

                if e.code == 401 and len(self._keys) > 1:
                    self.rotate_key()
                    tried_keys += 1
                    attempts = 0
                    continue

                raise err
            except urllib.error.URLError as e:
                err = CarbonApiError(None, str(e), retryable=True)
                last_err = err
                time.sleep(self.cfg.retry_backoff_s * (attempts + 1))
                attempts += 1
                continue

        raise last_err or CarbonApiError(None, "exhausted retries")

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        return self._request("GET", path, params=params)

    def post(self, path: str, body: Dict[str, Any], *, headers: Optional[Dict[str, str]] = None) -> Any:
        return self._request("POST", path, json_body=body, headers=headers)

    def patch(self, path: str, body: Dict[str, Any]) -> Any:
        return self._request("PATCH", f"{path.rstrip('/')}", json_body=body)
