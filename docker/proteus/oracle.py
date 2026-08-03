"""Proteus compatibility oracle for disposable Epiton lab databases.

This process is deliberately isolated from every Epiton runtime. It only uses
synthetic records and emits a redacted compatibility receipt.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from proteus import Model, config


SERIES = os.environ.get("EPITON_TRYTON_SERIES", "unknown")
URL = os.environ["EPITON_PROTEUS_URL"]
RECEIPT_DIR = Path(os.environ.get("EPITON_RECEIPT_DIR", "/receipts"))
CHECKS: list[dict[str, Any]] = []


def redact(value: object) -> str:
    """Remove URL credentials and keep diagnostic output bounded."""
    text = str(value)
    text = re.sub(r"(https?://)[^/@\s]+@", r"\1[redacted]@", text)
    return text[:500]


def check(check_id: str, operation: Callable[[], dict[str, Any]]) -> None:
    try:
        detail = operation()
        CHECKS.append({"id": check_id, "status": "pass", "detail": detail})
        print(f"[PASS] {check_id}")
    except Exception as exc:
        CHECKS.append({"id": check_id, "status": "fail", "detail": redact(exc)})
        print(f"[FAIL] {check_id}: {redact(exc)}", file=sys.stderr)


def main() -> int:
    state: dict[str, Any] = {"party": None, "deleted": False}

    def connect() -> dict[str, Any]:
        state["configuration"] = config.set_xmlrpc(URL)
        return {"transport": "xmlrpc", "authenticated": True}

    check("connect", connect)

    def discover_model() -> dict[str, Any]:
        party_model = Model.get("party.party")
        state["party_model"] = party_model
        fields = sorted(getattr(party_model, "_fields", {}).keys())
        required = {"name", "active"}
        missing = sorted(required.difference(fields))
        if missing:
            raise RuntimeError(f"party.party missing fields: {missing}")
        return {"model": "party.party", "field_count": len(fields)}

    if "configuration" in state:
        check("model_discovery", discover_model)

    def search() -> dict[str, Any]:
        rows = state["party_model"].find([], limit=3)
        return {"result_count": len(rows), "limit": 3}

    if "party_model" in state:
        check("search", search)

    def crud() -> dict[str, Any]:
        party_model = state["party_model"]
        party = party_model()
        party.name = f"EPITON-PROTEUS-ORACLE-{uuid4().hex}"
        party.active = True
        party.save()
        state["party"] = party

        saved_id = int(party.id)
        party.code = "EPITON-ORACLE"
        party.save()
        party.reload()
        if party.code != "EPITON-ORACLE":
            raise RuntimeError("saved value was not returned after reload")

        matches = party_model.find([("id", "=", saved_id)], limit=1)
        if len(matches) != 1:
            raise RuntimeError("saved record was not found")

        party.delete()
        state["deleted"] = True
        return {"create": True, "write": True, "reload": True, "delete": True}

    if "party_model" in state:
        check("synthetic_crud", crud)

    party = state.get("party")
    if party is not None and not state["deleted"]:
        try:
            party.delete()
            state["deleted"] = True
        except Exception as exc:
            CHECKS.append(
                {"id": "cleanup", "status": "fail", "detail": redact(exc)}
            )

    passed = sum(item["status"] == "pass" for item in CHECKS)
    failed = sum(item["status"] == "fail" for item in CHECKS)
    receipt = {
        "schema": "epiton.proteus-oracle.v1",
        "at": datetime.now(UTC).isoformat(),
        "target": {"tryton_series": SERIES, "database_kind": "disposable-lab"},
        "oracle": {"name": "proteus", "version": version("proteus")},
        "summary": {"passed": passed, "failed": failed, "total": len(CHECKS)},
        "checks": CHECKS,
    }

    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    receipt_path = RECEIPT_DIR / f"proteus-{SERIES}-latest.json"
    receipt_path.write_text(f"{json.dumps(receipt, indent=2)}\n", encoding="utf-8")
    print(f"summary pass={passed} fail={failed} receipt={receipt_path}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
