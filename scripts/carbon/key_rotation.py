"""Key rotation policy for Carbon API keys.

Rules:
- Primary key is configured via CARBON_API_KEY.
- Optional fallback is configured via CARBON_API_KEY_FALLBACK.
- When a 401 occurs, rotate to the next key.
- We never retry indefinitely; once exhausted, surface failure upstream.
"""
from __future__ import annotations

from typing import List


class KeyRotationPolicy:
    def __init__(self, keys: List[str]) -> None:
        self._keys = [k for k in keys if k]
        self._index = 0

    @property
    def active(self) -> str:
        if not self._keys:
            raise RuntimeError("No Carbon API keys configured")
        return self._keys[self._index % len(self._keys)]

    def rotate(self) -> str:
        if len(self._keys) <= 1:
            raise RuntimeError(
                "Key rotation requested, but no fallback key configured"
            )
        self._index = (self._index + 1) % len(self._keys)
        return self.active

    @property
    def keys(self) -> List[str]:
        return list(self._keys)

    @property
    def index(self) -> int:
        return self._index

    @classmethod
    def from_env(cls) -> "KeyRotationPolicy":
        primary = (__import__("os").getenv("CARBON_API_KEY") or "").strip()
        fallback = (__import__("os").getenv("CARBON_API_KEY_FALLBACK") or "").strip()
        return cls([primary, fallback])
