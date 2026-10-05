from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

STORE = Path(__file__).resolve().parent / "leads_store.json"
PAGER = Path(__file__).resolve().parent / "one_pager.txt"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_leads() -> list[dict]:
    if not STORE.exists():
        return []
    try:
        data = json.loads(STORE.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("leads"), list):
            return data["leads"]
        return []
    except Exception:
        return []


def save_leads(rows: list[dict]) -> None:
    STORE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def list_leads() -> list[dict]:
    return load_leads()


def get_lead(orgnr: str) -> dict | None:
    orgnr = str(orgnr or "")
    for row in load_leads():
        if str(row.get("orgnr") or "") == orgnr:
            return row
    return None


def replace_leads(rows: list[dict]) -> list[dict]:
    cleaned, seen = [], set()
    now = _now()
    for r in rows:
        orgnr = str(r.get("orgnr") or "")
        if not orgnr or orgnr in seen:
            continue
        seen.add(orgnr)
        item = dict(r)
        item.setdefault("saved_at", now)
        cleaned.append(item)
    save_leads(cleaned)
    return cleaned


def add_leads(rows: list[dict]) -> list[dict]:
    existing = load_leads()
    seen = {str(r.get("orgnr") or "") for r in existing if r.get("orgnr")}
    now = _now()
    for r in rows:
        orgnr = str(r.get("orgnr") or "")
        if not orgnr or orgnr in seen:
            continue
        seen.add(orgnr)
        item = dict(r)
        item.setdefault("saved_at", now)
        existing.append(item)
    save_leads(existing)
    return existing


def save_one_pager(text: str) -> None:
    PAGER.write_text((text or "").strip(), encoding="utf-8")


def load_one_pager() -> str:
    if not PAGER.exists():
        return ""
    return PAGER.read_text(encoding="utf-8").strip()