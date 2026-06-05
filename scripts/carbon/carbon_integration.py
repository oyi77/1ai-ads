"""Hermes <-> Carbon API integration orchestrator.

This module is the integration boundary.
It exposes lifecycle hooks and wraps the Carbon client
with idempotency, retries, and safe failure semantics.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

from carbon.client import CarbonApiError, CarbonClient, CarbonClientConfig
from carbon.idempotency import LedgerRecord, append_ledger, find_ledger, mark_ledger, make_idempotency_key
from carbon.key_rotation import KeyRotationPolicy


@dataclass(frozen=True)
class CarbonIntegrationConfig:
    enabled: bool = os.getenv("CARBON_ENABLED", "false").lower() in ("1", "true", "yes")
    agent_id: str = os.getenv("CARBON_AGENT_ID", "hermes-default")
    user_id: str = os.getenv("CARBON_USER_ID", "hermes-default")
    dry_run: bool = os.getenv("CARBON_DRY_RUN", "true").lower() in ("1", "true", "yes")


class CarbonIntegration:
    def __init__(self, cfg: Optional[CarbonIntegrationConfig] = None) -> None:
        self.cfg = cfg or CarbonIntegrationConfig()
        self._client = CarbonClient(CarbonClientConfig())
        self._keys = KeyRotationPolicy.from_env()
        self._calls: int = 0

    @property
    def enabled(self) -> bool:
        return self.cfg.enabled

    def boot(self) -> Dict[str, Any]:
        result = {
            "enabled": self.enabled,
            "dry_run": self.cfg.dry_run,
            "agent_id": self.cfg.agent_id,
        }
        if not self.enabled:
            return result
        try:
            payload = {
                "agent_id": self.cfg.agent_id,
                "user_id": self.cfg.user_id,
            }
            key = make_idempotency_key("boot", self.cfg.agent_id, payload)
            rec = find_ledger(str(key))
            if rec and rec.status == "executed":
                return {**result, "credits": rec.result.get("credits")}

            if self.cfg.dry_run:
                record = LedgerRecord(
                    key=str(key),
                    operation="boot",
                    entity_id=self.cfg.agent_id,
                    status="dry_run",
                )
                append_ledger(record)
                return {**result, "credits": None, "dry_run": True}

            data = self._client.post("/agent/boot", payload)
            record = LedgerRecord(
                key=str(key),
                operation="boot",
                entity_id=self.cfg.agent_id,
                status="executed",
                result=data,
            )
            append_ledger(record)
            return {**result, "credits": data.get("credits")}
        except CarbonApiError as e:
            raise RuntimeError(f"Carbon boot failed: {e}") from e

    def tool_call_start(self, tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        self._calls += 1
        result = {"tool": tool_name, "call": self._calls}
        if not self.enabled or self.cfg.dry_run:
            return {**result, "status": "dry_run"}

        try:
            payload = {
                "agent_id": self.cfg.agent_id,
                "user_id": self.cfg.user_id,
                "tool": tool_name,
                "params": params,
            }
            key = make_idempotency_key("tool_call.start", tool_name, payload)
            rec = find_ledger(str(key))
            if rec and rec.status == "executed":
                return {**result, "status": "idempotent", "credits_delta": rec.result.get("credits_delta")}

            data = self._client.post(
                "/agent/tool_call.start",
                payload,
                headers={"X-Idempotency-Key": str(key)},
            )
            record = LedgerRecord(
                key=str(key),
                operation="tool_call.start",
                entity_id=tool_name,
                status="executed",
                result=data,
            )
            append_ledger(record)
            return {**result, "status": "ok", "credits_delta": data.get("credits_delta")}
        except CarbonApiError as e:
            raise RuntimeError(f"Carbon tool_call_start failed: {e}") from e

    def tool_call_end(self, tool_name: str, params: Dict[str, Any], success: bool) -> Dict[str, Any]:
        result = {"tool": tool_name, "success": success}
        if not self.enabled or self.cfg.dry_run:
            return {**result, "status": "dry_run"}

        try:
            payload = {
                "agent_id": self.cfg.agent_id,
                "user_id": self.cfg.user_id,
                "tool": tool_name,
                "params": params,
                "success": success,
            }
            key = make_idempotency_key("tool_call.end", tool_name, payload)
            data = self._client.post(
                "/agent/tool_call.end",
                payload,
                headers={"X-Idempotency-Key": str(key)},
            )
            record = LedgerRecord(
                key=str(key),
                operation="tool_call.end",
                entity_id=tool_name,
                status="executed",
                result=data,
            )
            append_ledger(record)
            return {**result, "status": "ok", "credits_delta": data.get("credits_delta")}
        except CarbonApiError as e:
            raise RuntimeError(f"Carbon tool_call_end failed: {e}") from e

    def shutdown(self) -> Dict[str, Any]:
        result = {"calls": self._calls}
        if not self.enabled:
            return result
        try:
            payload = {
                "agent_id": self.cfg.agent_id,
                "user_id": self.cfg.user_id,
                "calls": self._calls,
            }
            data = self._client.post("/agent/shutdown", payload)
            return {**result, "finalized": data}
        except CarbonApiError as e:
            raise RuntimeError(f"Carbon shutdown failed: {e}") from e
