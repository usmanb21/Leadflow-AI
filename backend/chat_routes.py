from __future__ import annotations

import json
import os
import re
import ssl
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from openai import AzureOpenAI
from pydantic import BaseModel

from brreg_search import fetch_company, search_companies
from file_routes import latest_doc_text
from leads_store import get_lead, list_leads, load_one_pager, replace_leads, save_one_pager

router = APIRouter()

client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
)
DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

_SSL = ssl.create_default_context()

DOC_HINTS = (
    "summar", "document", "pdf", "docx", "upload", "file",
    "what does this", "read this", "attached",
)
WEB_HINTS = (
    "website", "web site", "webpage", "web page", "url", "http", "www.",
    "check their", "check the site", "open the site", "look up the site",
    "visit", "migrationsverket",
)
WEATHER_HINTS = (
    "weather", "temperature", "forecast", "rain", "snow", "outside",
    "vÃ¦r", "temperatur", "climate",
)
ABBR = {
    "pak": "Pakistan",
    "pk": "Pakistan",
    "uk": "United Kingdom",
    "usa": "United States",
    "us": "United States",
    "uae": "United Arab Emirates",
    "aus": "Australia",
}
WMO = {
    0: "clear", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "rime fog", 51: "light drizzle", 53: "drizzle",
    55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
    71: "light snow", 73: "snow", 75: "heavy snow",
    80: "rain showers", 81: "rain showers", 82: "heavy rain showers",
    95: "thunderstorm",
}


class Turn(BaseModel):
    sender: str = ""
    text: str = ""


class ChatIn(BaseModel):
    message: str
    history: list[Turn] = []


class PagerIn(BaseModel):
    text: str = ""


def _now_oslo() -> str:
    return datetime.now(ZoneInfo("Europe/Oslo")).strftime("%A, %B %d, %Y, %H:%M %Z")


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(x).strip() for x in value if x)
    return str(value).strip()


def _facts(lead: dict[str, Any]) -> str:
    return (
        f"Company: {lead.get('company')}\n"
        f"Org.nr: {lead.get('orgnr')}\n"
        f"City: {_as_text(lead.get('city'))}\n"
        f"Address: {_as_text(lead.get('address'))}\n"
        f"NACE: {lead.get('nace')} {_as_text(lead.get('nace_text'))}\n"
        f"Form: {lead.get('orgform')}\n"
        f"Founded: {lead.get('founded')}\n"
        f"Employees: {lead.get('employees')}\n"
        f"Website: {_as_text(lead.get('website'))}\n"
        f"Purpose: {_as_text(lead.get('purpose'))}\n"
        f"Email: {_as_text(lead.get('email')) or 'empty'}\n"
    )


def _short_name(lead: dict[str, Any]) -> str:
    name = _as_text(lead.get("company")) or "there"
    upper = name.upper()
    for end in (" ASA", " AS"):
        if upper.endswith(end):
            name = name[: -len(end)].strip()
            break
    if name.isupper():
        name = name.title()
    return name.replace(" Og ", " og ").replace(" And ", " and ")


def _write(system: str, user: str) -> str:
    resp = client.chat.completions.create(
        model=DEPLOYMENT,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.2,
    )
    return (resp.choices[0].message.content or "").strip()


def _purpose_short(lead: dict[str, Any]) -> str:
    raw = _as_text(lead.get("purpose") or lead.get("nace_text"))
    raw = raw.replace(" ,", ",")
    for cut in ("sÃ¥ vel som", "vel som", "samt", "deltakelse", "som naturlig"):
        i = raw.lower().find(cut)
        if i > 8:
            raw = raw[:i]
    raw = raw.split(".")[0].strip().rstrip(",")
    low = raw.lower()
    for prefix in (
        "utvikling og salg av", "utvikling av", "salg av",
        "drift av", "drive forretning innen", "bistand til",
    ):
        if low.startswith(prefix):
            raw = raw[len(prefix) :].strip()
            break
    if not raw:
        return "software"
    try:
        phrase = _write(
            "Translate this Norwegian company purpose into one English noun phrase. "
            "Maximum 8 words. No sentence. No company name.",
            raw,
        )
        phrase = " ".join(phrase.strip().strip("\"'.").split()[:8])
        return phrase or "software"
    except Exception:
        return "software"


def _company_block(lead: dict[str, Any]) -> str:
    short = _short_name(lead)
    city = _as_text(lead.get("city")).title()
    purpose = _purpose_short(lead)
    year = (_as_text(lead.get("founded")) or "")[:4]
    staff = lead.get("employees")
    site = _as_text(lead.get("website")).replace("https://", "").replace("http://", "").strip("/")
    line = f"{short} builds {purpose}"
    if city:
        line += f" in {city}"
    line += "."
    extra = []
    if year:
        extra.append(f"registered in {year}")
    if staff not in (None, "", 0, "0"):
        extra.append(f"{staff} people")
    if site:
        extra.append(site)
    if extra:
        extra[0] = extra[0][0].upper() + extra[0][1:]
        line += " " + ", ".join(extra) + "."
    return line


DRAFT_RULES = (
    "You write a short outreach email for Relista. "
    "Use only official Brreg facts and the user's saved offer fields. "
    "Start with Hi there. "
    "One factual line from the registry. Summarise long legal purpose text. Do not paste raw vedtekter. "
    "One cautious relevance line from the offer. Do not claim you know this company's priorities. "
    "Never say they need clients, partners, leads, growth, or a specific product unless the user wrote that in the offer. "
    "Never invent email addresses, people, funding, hiring, or website claims. "
    "Forbidden phrases: I can run, 15 minutes this week, I see that, innovative, ChatGPT, like yours, synergy, "
    "identify potential clients, find partners, grow your pipeline."
)


def _help_line(offer: dict[str, str]) -> str:
    who = offer.get("who") or "Norwegian B2B SaaS teams"
    outcome = offer.get("outcome") or "build a verified prospect list faster"
    outcome = outcome.rstrip(".")
    if outcome.lower().startswith("they "):
        outcome = outcome[5:]
    return f"I help {who} {outcome} using official company data."


def _relevance_line(offer: dict[str, str]) -> str:
    why = (offer.get("why") or "").strip()
    if why and not re.search(
        r"enhetsregisteret|search table|clients|partners|leads|grow",
        why,
        re.I,
    ):
        first = why.split(".")[0].strip().rstrip(".")
        if 20 < len(first) < 180:
            return f"{first}. Based on your registered activity, I thought this might be relevant."
    return "Based on your registered activity, I thought this might be relevant."


def _offer_map(pager: str) -> dict[str, str]:
    out = {
        "who": "",
        "problem": "",
        "outcome": "",
        "why": "",
        "cta": "",
        "language": "English",
    }
    for line in (pager or "").splitlines():
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        k = key.strip().lower()
        if k in out:
            out[k] = val.strip()
        elif k == "lang":
            out["language"] = val.strip()
    if not any(out[k] for k in ("who", "problem", "outcome", "why")):
        out["why"] = (pager or "").strip()
    return out


def _noticed(lead: dict[str, Any]) -> str:
    short = _short_name(lead)
    city = _as_text(lead.get("city")).title()
    purpose = _purpose_short(lead).lower()
    article = "an" if city[:1].lower() in "aeiou" else "a"
    if city and purpose:
        return f"I noticed that {short} is {article} {city}-based company working with {purpose}."
    if city:
        return f"I noticed that {short} is {article} {city}-based company."
    if purpose:
        return f"I noticed that {short} works with {purpose}."
    return f"I noticed that {short} is a registered Norwegian company."


def _http_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "Relista/1.0"})
    with urllib.request.urlopen(req, timeout=10, context=_SSL) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _normalize_place(place: str) -> str:
    words = place.replace(",", " ").split()
    return " ".join(ABBR.get(w.lower(), w) for w in words if w)


def _places_from_message(msg: str) -> list[str]:
    low = msg.lower().strip()
    match = re.search(
        r"(?:weather|forecast|temperature|temperatur|vÃ¦r|time|date|climate).*(?:in|for|at|i)\s+(.+)",
        low,
    )
    rest = match.group(1) if match else low
    rest = re.sub(r"\s+tell me both.*$", "", rest)
    parts = re.split(r"\s+and in\s+|\s+and\s+|\s+og\s+|,\s+", rest)
    places = []
    for part in parts:
        part = re.sub(r"^(in|for|at|i|city|the city)\s+", "", part.strip())
        part = re.sub(r"[?.!].*$", "", part).strip()
        part = _normalize_place(part)
        if part and part.lower() not in {"outside", "both", "today", "now"}:
            places.append(part)
    seen = []
    for p in places:
        if p not in seen:
            seen.append(p)
    return seen[:3] or ["Oslo"]


def _one_weather(city: str) -> str:
    queries = [city]
    first = city.split()[0]
    if first.lower() != city.lower():
        queries.append(first)
    hit = None
    for q in queries:
        geo = _http_json(
            "https://geocoding-api.open-meteo.com/v1/search?"
            + urllib.parse.urlencode({"name": q, "count": 1, "language": "en"})
        )
        hits = geo.get("results") or []
        if hits:
            hit = hits[0]
            break
    if not hit:
        return f"No weather station found for {city}."
    wx = _http_json(
        "https://api.open-meteo.com/v1/forecast?"
        + urllib.parse.urlencode(
            {
                "latitude": hit["latitude"],
                "longitude": hit["longitude"],
                "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation",
                "timezone": "auto",
            }
        )
    )
    cur = wx.get("current") or {}
    kind = WMO.get(int(cur.get("weather_code") or 0), "unknown conditions")
    place = ", ".join(p for p in (hit.get("name"), hit.get("admin1"), hit.get("country")) if p)
    return (
        f"Live weather for {place}: {kind}, {cur.get('temperature_2m')}Â°C "
        f"(feels like {cur.get('apparent_temperature')}Â°C), "
        f"wind {cur.get('wind_speed_10m')} km/h, "
        f"precipitation {cur.get('precipitation')} mm, "
        f"local time {cur.get('time')}."
    )


def _live_weather(msg: str) -> str:
    try:
        return "\n".join(_one_weather(p) for p in _places_from_message(msg))
    except Exception:
        return f"Weather lookup failed. Time now: {_now_oslo()}."


URL_RE = re.compile(
    r"(https?://[^\s<>\"']+)|((?:www\.)[^\s<>\"']+)|\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:/[^\s<>\"']*)?)",
    re.I,
)


def _extract_urls(*texts: str) -> list[str]:
    found: list[str] = []
    skip = {"example.com", "gmail.com", "outlook.com", "hotmail.com"}
    for text in texts:
        for group in URL_RE.findall(text or ""):
            raw = next((g for g in group if g), "")
            raw = raw.rstrip(").,];'")
            if not raw or "@" in raw:
                continue
            host = raw.lower().replace("https://", "").replace("http://", "").split("/")[0]
            if host in skip:
                continue
            url = raw if raw.lower().startswith("http") else "https://" + raw
            if url not in found:
                found.append(url)
    return found[:3]


def _related_urls(url: str, msg: str) -> list[str]:
    low = (msg or "").lower()
    base = url.rstrip("/")
    extras: list[str] = []
    if any(w in low for w in ("master", "stud", "program", "course", "degree", "studie")):
        extras.extend(
            [
                f"{base}/studier",
                f"{base}/studier/studieoversikt",
                f"{base}/en/studies",
                f"{base}/en/study/master",
                f"{base}/master",
            ]
        )
    return extras


def _abs_link(base: str, href: str) -> str:
    href = href.strip()
    if href.startswith("#") or href.startswith("mailto:") or href.startswith("javascript:"):
        return ""
    if href.startswith("http://") or href.startswith("https://"):
        return href
    if href.startswith("/"):
        parts = urllib.parse.urlparse(base)
        return f"{parts.scheme}://{parts.netloc}{href}"
    return ""


def _study_links(html: str, base: str) -> list[str]:
    found: list[str] = []
    for href in re.findall(r'href=["\']([^"\']+)["\']', html or "", re.I):
        if not re.search(r"master|studieoversikt|/studier|/study", href, re.I):
            continue
        url = _abs_link(base, href.split("#")[0])
        if url and url not in found and url.rstrip("/") != base.rstrip("/"):
            found.append(url)
    return found[:3]


def _fetch_page(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "nb-NO,nb;q=0.9,en-US;q=0.8,en;q=0.7",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=12, context=_SSL) as res:
            raw = res.read(250_000)
            final = res.geturl()
    except Exception as exc:
        return (
            f"PAGE FETCH FAILED for {url}: {exc}. "
            "Tell the user this site blocked Relista. "
            "Ask them to paste the page text or try another public URL. "
            "Do not say Relista cannot access websites in general."
        )
    html = raw.decode("utf-8", errors="ignore")
    extra_links = _study_links(html, final)
    text = re.sub(r"(?is)<(script|style|noscript).*?>.*?</\1>", " ", html)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        body = f"PAGE TEXT from {final}: the page had no readable text."
    else:
        body = f"PAGE TEXT from {final}:\n{text[:12000]}"
    if extra_links:
        more = []
        for link in extra_links:
            try:
                req2 = urllib.request.Request(link, headers=req.headers)
                with urllib.request.urlopen(req2, timeout=12, context=_SSL) as res2:
                    raw2 = res2.read(200_000).decode("utf-8", errors="ignore")
                    final2 = res2.geturl()
                t2 = re.sub(r"(?is)<(script|style|noscript).*?>.*?</\1>", " ", raw2)
                t2 = re.sub(r"(?is)<[^>]+>", " ", t2)
                t2 = re.sub(r"\s+", " ", t2).strip()
                more.append(f"PAGE TEXT from {final2}:\n{t2[:8000]}")
            except Exception:
                continue
        if more:
            body += "\n\n" + "\n\n".join(more)
    return body


def _live_pages(msg: str, history: list[Turn]) -> str:
    texts = [msg] + [t.text for t in (history or [])[-8:]]
    urls = _extract_urls(*texts)
    if not urls:
        return "No URL was found in the chat. Ask for a full website address."
    to_fetch: list[str] = []
    for url in urls:
        if url not in to_fetch:
            to_fetch.append(url)
        for extra in _related_urls(url, msg):
            if extra not in to_fetch:
                to_fetch.append(extra)
    return "\n\n".join(_fetch_page(url) for url in to_fetch[:4])


def _system_prompt(extra: str = "") -> str:
    base = (
        "You are Relista. Calm, direct, professional. "
        "Answer in short paragraphs. No slogans, no hype, no filler. "
        f"Current date and time in Europe/Oslo: {_now_oslo()}. "
        "Use that clock for Norway date and time questions. Do not say 2023. "
        "If LIVE WEATHER is provided, use those numbers for those cities. "
        "Do not say you lack weather for other countries when LIVE WEATHER is present. "
        "If PAGE TEXT is provided, Relista already opened the page. Answer from that text. "
        "List concrete programme names if they appear in PAGE TEXT. Do not invent a catalogue. "
        "Never say you cannot browse websites, cannot access websites, or cannot open a site. "
        "If the page does not contain the requested section, say the fetched page did not include that section and ask for the exact URL."
        "If a file is attached, summarise or answer from that file. "
        "Do not invent Enhetsregisteret facts."
    )
    return base if not extra else base + "\n\n" + extra


def _parse_q(q: str) -> tuple[str, str]:
    parts = [p.strip() for p in (q or "").split(",") if p.strip()]
    city = parts[0].title() if parts else "Norway"
    city = city.replace(" S", "").replace(" s", "")
    sector = parts[1].lower() if len(parts) > 1 else "programvare"
    return city, sector


@router.get("/search")
async def api_search(q: str = "Oslo, programvare", page: int = 0, size: int = 50):
    city, sector = _parse_q(q)
    try:
        data = search_companies(q, page=page, size=size)
    except TypeError:
        data = search_companies(q)
    if hasattr(data, "__await__"):
        data = await data
    if isinstance(data, dict):
        items = data.get("items") or data.get("leads") or []
        if page == 0 and items:
            replace_leads(items)
        out = dict(data)
        out.setdefault("q", q)
        out.setdefault("items", items)
        out.setdefault("leads", items)
        out.setdefault("city", city)
        out.setdefault("sector", sector)
        out.setdefault("company_form", "AS")
        out.setdefault("source", "Brreg Enhetsregisteret")
        out.setdefault("retrieved_at", datetime.now(ZoneInfo("Europe/Oslo")).isoformat(timespec="seconds"))
        out.setdefault("count", len(items))
        return out
    leads = data or []
    if page == 0 and leads:
        replace_leads(leads)
    return {
        "q": q,
        "items": leads,
        "leads": leads,
        "total": len(leads),
        "page": page,
        "size": size,
        "city": city,
        "sector": sector,
        "company_form": "AS",
        "source": "Brreg Enhetsregisteret",
        "retrieved_at": datetime.now(ZoneInfo("Europe/Oslo")).isoformat(timespec="seconds"),
        "count": len(leads),
    }


@router.get("/leads")
def api_leads():
    data = list_leads()
    if isinstance(data, dict):
        return data
    return data


@router.get("/leads/{orgnr}")
async def api_lead(orgnr: str):
    lead = get_lead(orgnr)
    if not lead:
        lead = fetch_company(orgnr)
        if hasattr(lead, "__await__"):
            lead = await lead
    return {"lead": lead}


@router.get("/one-pager")
def api_get_pager():
    return {"text": load_one_pager()}


@router.post("/one-pager")
def api_save_pager(body: PagerIn):
    save_one_pager(body.text or "")
    return {"ok": True}


@router.post("/leads/{orgnr}/brief")
async def api_brief(orgnr: str):
    lead = get_lead(orgnr)
    if not lead:
        lead = fetch_company(orgnr)
        if hasattr(lead, "__await__"):
            lead = await lead
    if not lead:
        return {"modell": "Company not found.", "brreg": None}
    pager = load_one_pager() or ""
    modell = _write(
        "Write a 5-line sales note from Brreg facts and the offer fields only. Never invent email or phone.",
        f"OFFER:\n{pager}\n\nBRREG:\n{_facts(lead)}",
    )
    return {"modell": modell, "brreg": lead}


@router.post("/leads/{orgnr}/draft")
async def api_draft(orgnr: str):
    lead = get_lead(orgnr)
    if not lead:
        lead = fetch_company(orgnr)
        if hasattr(lead, "__await__"):
            lead = await lead
    if not lead:
        return {"modell": "Company not found.", "brreg": None}
    city = _as_text(lead.get("city")).title() or "Norway"
    pager = (load_one_pager() or "").strip()
    offer = _offer_map(pager)
    noticed = _noticed(lead)
    help_line = _help_line(offer)
    relevance = _relevance_line(offer)
    cta = offer.get("cta") or f"Would a short walkthrough of a {city} list be useful?"
    if not cta.endswith("?"):
        cta = "Would a short walkthrough be useful?"
    if offer.get("language", "").lower().startswith("nor"):
        modell = _write(
            DRAFT_RULES + " Write the full email in Norwegian BokmÃ¥l. Keep the same structure.",
            f"OFFER:\n{pager}\n\nBRREG:\n{_facts(lead)}\n\nENGLISH SHAPE:\nHi there,\n\n{noticed}\n\n{help_line}\n\n{relevance} {cta}",
        )
    else:
        modell = (
            "Hi there,\n\n"
            f"{noticed}\n\n"
            f"{help_line}\n\n"
            f"{relevance} {cta}\n\n"
            "Best regards,\n"
            "Usman\n"
            "Founder, Relista"
        )
    return {"modell": modell, "brreg": lead}


@router.post("/chat")
async def api_chat(body: ChatIn):
    msg = (body.message or "").strip()
    low = msg.lower()
    extra_bits = [f"CLOCK: {_now_oslo()}"]
    if any(w in low for w in WEATHER_HINTS) or re.search(r"\b(time|date)\b.+\b(in|at)\b", low):
        extra_bits.append("LIVE WEATHER:\n" + _live_weather(msg))
    if any(w in low for w in WEB_HINTS) or _extract_urls(msg):
        extra_bits.append(_live_pages(msg, body.history))
    if any(w in low for w in DOC_HINTS):
        doc = latest_doc_text()
        if doc:
            extra_bits.append(doc)
    extra = "\n\n".join(extra_bits)

    azure_msgs = [{"role": "system", "content": _system_prompt(extra)}]
    for turn in body.history[-16:]:
        role = "assistant" if turn.sender == "bot" else "user"
        if turn.text:
            azure_msgs.append({"role": role, "content": turn.text})
    azure_msgs.append({"role": "user", "content": msg})

    def stream():
        resp = client.chat.completions.create(
            model=DEPLOYMENT,
            messages=azure_msgs,
            stream=True,
            temperature=0.3,
        )
        for chunk in resp:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta

    return StreamingResponse(stream(), media_type="text/plain")
