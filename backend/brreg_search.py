"""Live Brreg Enhetsregisteret search for Relista."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx

BRREG = "https://data.brreg.no/enhetsregisteret/api/enheter"
SOURCE = "Brreg Enhetsregisteret"

NACE_SOFTWARE = [
    "58.29",
    "62.01",
    "62.02",
    "62.03",
    "62.09",
    "63.11",
    "63.12",
]

KOMMUNE_POSTSTED = {
    "0301": ["oslo"],
    "4601": ["bergen"],
    "5001": ["trondheim"],
    "1103": ["stavanger"],
    "4204": ["kristiansand"],
    "3201": ["bærum", "baerum", "bekkestua", "sandvika", "lysaker", "haslum"],
    "3203": ["asker", "billingstad", "hvalstad", "heer"],
    "3305": ["hønefoss", "honefoss", "ringerike"],
    "1874": ["moskenes", "reine", "sørvågen", "sorvagen", "hamnøy", "hamnoy"],
}

CITY_KOMMUNE = {
    "oslo": "0301",
    "bergen": "4601",
    "trondheim": "5001",
    "stavanger": "1103",
    "kristiansand": "4204",
    "drammen": "3301",
    "fredrikstad": "3103",
    "sarpsborg": "3105",
    "moss": "3103",
    "halden": "3101",
    "asker": "3203",
    "baerum": "3201",
    "bærum": "3201",
    "lillestrom": "3205",
    "lillestrøm": "3205",
    "lorenskog": "3205",
    "lørenskog": "3205",
    "sandnes": "1108",
    "haugesund": "1106",
    "alesund": "1508",
    "ålesund": "1508",
    "molde": "1506",
    "kristiansund": "1505",
    "tromso": "5501",
    "tromsø": "5501",
    "bodo": "1804",
    "bodø": "1804",
    "harstad": "5503",
    "narvik": "1806",
    "alta": "5601",
    "hammerfest": "5603",
    "honefoss": "3305",
    "hønefoss": "3305",
    "hanefoss": "3305",
    "ringerike": "3305",
    "tonsberg": "3803",
    "tønsberg": "3803",
    "sandefjord": "3804",
    "larvik": "3805",
    "skien": "3807",
    "porsgrunn": "3806",
    "arendal": "4203",
    "grimstad": "4202",
    "lillehammer": "3405",
    "gjovik": "3407",
    "gjøvik": "3407",
    "hamar": "3403",
    "elverum": "3420",
    "kongsberg": "3303",
    "horten": "3801",
    "notodden": "3808",
    "flesberg": "3334",
    "kongsvinger": "3401",
    "jessheim": "3203",
    "ullensaker": "3203",
    "ski": "3207",
    "nordre follo": "3207",
    "as": "3218",
    "ås": "3218",
    "mo i rana": "1833",
    "rana": "1833",
    "mosjoen": "1824",
    "mosjøen": "1824",
    "svolvaer": "1865",
    "svolvær": "1865",
    "vagan": "1865",
    "vågan": "1865",
    "leknes": "1860",
    "vestvagoy": "1860",
    "vestvågøy": "1860",
    "moskenes": "1874",
    "reine": "1874",
    "flakstad": "1859",
    "varoy": "1857",
    "værøy": "1857",
    "rost": "1856",
    "røst": "1856",
    "lofoten": "1874",
    "sortland": "1870",
    "stokmarknes": "1868",
    "fauske": "1841",
    "levanger": "5037",
    "steinkjer": "5006",
    "namsos": "5007",
    "orkanger": "5059",
    "bronnoysund": "1813",
    "brønnøysund": "1813",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def parse_query(q: str) -> tuple[str, str]:
    raw = (q or "").strip() or "Oslo, programvare"
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    city = parts[0] if parts else "Oslo"
    sector = parts[1] if len(parts) > 1 else "programvare"
    return city, sector


def _kommune(city: str) -> str | None:
    key = _norm(city)
    key = key.replace(" municipality", "").replace(" kommune", "")
    return CITY_KOMMUNE.get(key)


def _is_software_nace(code: str) -> bool:
    c = str(code or "")
    return any(c == n or c.startswith(n) for n in NACE_SOFTWARE)


def _location_ok(city: str, poststed: str, kommune: str | None) -> bool:
    shown = _norm(poststed)
    wanted = _norm(city)
    if not shown:
        return False
    aliases = KOMMUNE_POSTSTED.get(kommune or "", [])
    if not aliases:
        aliases = [wanted]
    aliases = list({*aliases, wanted})
    return any(a and (a in shown or shown in a) for a in aliases)


def _map_unit(unit: dict[str, Any]) -> dict[str, Any]:
    addr = unit.get("forretningsadresse") or {}
    nace = ""
    nace_text = ""
    codes = unit.get("naeringskode1") or {}
    if isinstance(codes, dict):
        nace = str(codes.get("kode") or "")
        nace_text = str(codes.get("beskrivelse") or "")
    email = unit.get("epostadresse") or unit.get("epost") or ""
    orgnr = str(unit.get("organisasjonsnummer") or "")
    return {
        "company": unit.get("navn") or "",
        "orgnr": orgnr,
        "city": (addr.get("poststed") or "").upper(),
        "employees": unit.get("antallAnsatte"),
        "founded": unit.get("stiftelsesdato") or "",
        "nace": nace,
        "nace_text": nace_text,
        "purpose": unit.get("vedtektsfestetFormaal") or unit.get("aktivitet") or "",
        "email": email,
        "brreg_url": f"https://data.brreg.no/enhetsregisteret/oppslag/enheter/{orgnr}" if orgnr else "",
    }


def search_companies(q: str, page: int = 0, size: int = 50) -> dict[str, Any]:
    city, sector = parse_query(q)
    kommune = _kommune(city)
    size = max(1, min(int(size or 50), 50))
    page = max(0, int(page or 0))

    base = {
        "city": city,
        "sector": sector,
        "company_form": "AS",
        "source": SOURCE,
        "retrieved_at": _now(),
        "page": page,
        "size": size,
        "kommune": kommune,
    }

    if not kommune:
        return {
            **base,
            "items": [],
            "total": 0,
            "unmapped_city": True,
            "message": (
                f"{city} is not mapped to a kommune number yet. "
                "Relista only searches a known Norwegian kommune so it does not dump a nationwide list."
            ),
        }

    nace_param = ",".join(NACE_SOFTWARE)
    params = (
        f"organisasjonsform=AS"
        f"&naeringskode={quote(nace_param)}"
        f"&kommunenummer={kommune}"
        f"&page={page}"
        f"&size={size}"
    )
    url = f"{BRREG}?{params}"

    try:
        with httpx.Client(timeout=25.0, headers={"Accept": "application/json"}) as client:
            res = client.get(url)
            res.raise_for_status()
            data = res.json()
    except Exception:
        return {**base, "items": [], "total": 0, "error": "brreg_unavailable"}

    embedded = (data.get("_embedded") or {}).get("enheter") or []
    page_meta = data.get("page") or {}
    raw_total = int(page_meta.get("totalElements") or len(embedded) or 0)
    items = []
    for unit in embedded:
        row = _map_unit(unit)
        label = f"{row.get('nace_text') or ''} {row.get('nace') or ''}"
        if not _is_software_nace(row.get("nace")):
            continue
        if "inkasso" in label.lower() or "kredittopplys" in label.lower():
            continue
        if not _location_ok(city, row.get("city") or "", kommune):
            continue
        items.append(row)
    return {
        **base,
        "items": items,
        "total": raw_total,
        "location_rule": "Registered business address only",
        "sector_rule": "Configured software NACE codes only",
    }


def fetch_company(orgnr: str) -> dict[str, Any] | None:
    orgnr = re.sub(r"\D", "", str(orgnr or ""))
    if not orgnr:
        return None
    url = f"{BRREG}/{orgnr}"
    try:
        with httpx.Client(timeout=20.0, headers={"Accept": "application/json"}) as client:
            res = client.get(url)
            res.raise_for_status()
            return _map_unit(res.json())
    except Exception:
        return None