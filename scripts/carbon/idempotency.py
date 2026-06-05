"""Idempotency keys + local ledger for Carbon API calls.

Design:
- Deterministic idempotency keys from (operation, entity_id, params_fingerprint)
- Local ledger JSON for replay protection and audit
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Dict, Optional


LEDGER_PATH = Path(os.getenv("CARBON_LEDGER_PATH", "/home/openclaw/projects/data/carbon_ledger.jsonl"))
LEDGER_LOCK = threading.Lock()


@dataclass(frozen=True)
class IdempotencyKey:
    operation: str
    entity_id: str
    params_fp: str

    def __str__(self) -> str:
        return f"{self.operation}:{self.entity_id}:{self.params_fp}"


def make_idempotency_key(operation: str, entity_id: str, params: Optional[Dict[str, Any]] = None) -> IdempotencyKey:
    params_fp = hashlib.sha256(json.dumps(params or {}, sort_keys=True).encode("utf-8")).hexdigest()[:16]
    return IdempotencyKey(operation=operation, entity_id=entity_id, params_fp=params_fp)


@dataclass
class LedgerRecord:
    key: str
    operation: str = ""
    entity_id: str = ""
    status: str = "pending"
    result: Dict[str, Any] = field(default_factory=dict)
    created_ts: float = field(default_factory=time.time)
    updated_ts: float = field(default_factory=time.time)


def append_ledger(record: LedgerRecord) -> None:
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    row = asdict(record)
    with LEDGER_LOCK:
        with LEDGER_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=True) + "\n")


def find_ledger(key: str) -> Optional[LedgerRecord]:
    if not LEDGER_PATH.exists():
        return None
    with LEDGER_LOCK:
        for line in LEDGER_PATH.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("key") == key:
                return LedgerRecord(**row)
    return None


def mark_ledger(key: str, *, status: str, result: Optional[Dict[str, Any]] = None) -> None:
    if not LEDGER_PATH.exists():
        return
    updated_at = time.time()
    with LEDGER_LOCK:
        lines = LEDGER_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()
        new_lines = []
        changed = False
        for line in lines:
            line_s = line.strip()
            if not line_s:
                continue
            try:
                row = json.loads(line_s)
            except json.JSONDecodeError:
                new_lines.append(line)
                continue
            if row.get("key") == key:
                row["status"] = status
                row["result"] = result if result is not None else row.get("result", {})
                row["updated_ts"] = updated_at
                new_lines.append(json.dumps(row, ensure_ascii=True))
                changed = True
            else:
                new_lines.append(line)
        if changed:
            LEDGER_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
