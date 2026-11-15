"""
Relista Weekly Pack Intelligence Layer (P0)
===========================================
Research signals → ICP match High/Medium/Low + rationale → 1–2 drafts.
Never invents emails, phones, personal details, acquisitions, or launches.
Never sends. Human copies only.
"""

from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

try:
    from openai import AzureOpenAI
except ImportError:
    AzureOpenAI = None  # type: ignore

ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
API_KEY = os.getenv("AZURE_OPENAI_API_KEY", "")
DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")
MAX_INTELLIGENCE = int(os.getenv("RELISTA_MAX_INTELLIGENCE", "25"))

SYSTEM = (
    "You are Relista intelligence for Norwegian B2B prospecting. "
    "You only use the Brreg fields and research notes provided. "
    "Never invent email addresses, phone numbers, personal names, or contact details. "
    "Never invent acquisitions, product launches, funding, hiring, or expansion. "
    "If research notes say no news was found, you must say so and not invent a trigger. "
    "Never claim a message was sent. Drafts are for a human to copy and send. "
    "Sign every draft body with exactly:\nBest regards,\nUsman\nFounder, Relista\n"
    "Return valid JSON only, matching the schema exactly."
)


def _client():
    if not AzureOpenAI or not ENDPOINT or not API_KEY:
        return None
    return AzureOpenAI(
        azure_endpoint=ENDPOINT,
        api_key=API_KEY,
        api_version=API_VERSION,
    )


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _facts(lead: dict[str, Any]) -> str:
    parts = [
        f"Company: {_as_text(lead.get('company') or lead.get('navn'))}",
        f"Org number: {_as_text(lead.get('orgnr') or lead.get('organisasjonsnummer'))}",
        f"City: {_as_text(lead.get('city') or lead.get('poststed'))}",
        f"Employees: {_as_text(lead.get('employees') or lead.get('ansatte'))}",
        f"Founded: {_as_text(lead.get('founded') or lead.get('stiftelsesdato'))}",
        f"Purpose: {_as_text(lead.get('purpose') or lead.get('formaal') or lead.get('nace'))}",
        f"Email published: {_as_text(lead.get('email') or lead.get('epostadresse')) or 'none'}",
        f"Website: {_as_text(lead.get('website') or lead.get('hjemmeside')) or 'none'}",
    ]
    return "\n".join(parts)


def _research_signals(lead: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    """Lightweight public signals + metadata. Prefer grounding over invention."""
    name = _as_text(lead.get("company") or lead.get("navn"))
    city = _as_text(lead.get("city") or lead.get("poststed"))
    site = _as_text(lead.get("website") or lead.get("hjemmeside"))
    notes: list[str] = []
    sources: list[dict[str, str]] = []
    retrieved_at = datetime.now(timezone.utc).isoformat()

    if site:
        notes.append(f"Published website: {site}")

    query = f"{name} {city} Norway".strip()
    url = (
        "https://news.google.com/rss/search?q="
        + urllib.parse.quote(query)
        + "&hl=en-US&gl=US&ceid=US:en"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Relista/1.0"})
    found_news = False
    try:
        with urllib.request.urlopen(req, timeout=6) as res:
            raw = res.read(120_000).decode("utf-8", errors="ignore")
        items = re.findall(r"<item>(.*?)</item>", raw, re.S)
        for item in items[:4]:
            title_m = re.search(r"<title>(.*?)</title>", item, re.S)
            title = re.sub(r"<[^>]+>", "", title_m.group(1) if title_m else "")
            title = title.replace("&amp;", "&").replace("&#39;", "'").strip()
            source_m = re.search(r"<source[^>]*>(.*?)</source>", item, re.S)
            source = re.sub(r"<[^>]+>", "", source_m.group(1)).strip() if source_m else ""
            link_m = re.search(r"<link>(.*?)</link>", item, re.S)
            link = re.sub(r"<[^>]+>", "", link_m.group(1)).strip() if link_m else ""
            if title:
                found_news = True
                notes.append(f"News: {title}" + (f" ({source})" if source else ""))
                sources.append(
                    {
                        "title": title[:300],
                        "publisher": source[:120],
                        "url": link[:500],
                        "retrieved_at": retrieved_at,
                    }
                )
    except Exception:
        notes.append("No live news notes for this company.")

    if not found_news and not any(n.startswith("Published website") for n in notes):
        notes.append("No source-backed recent development found.")
    elif not found_news:
        notes.append("No source-backed recent development found.")

    if not notes:
        return "No extra public signals beyond Brreg.", []
    return "\n".join(notes), sources


def _llm_json(system: str, user: str) -> dict[str, Any]:
    client = _client()
    if not client:
        return {}
    resp = client.chat.completions.create(
        model=DEPLOYMENT,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.25,
        response_format={"type": "json_object"},
    )
    text = (resp.choices[0].message.content or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}


def _normalize_match(raw: Any, score_fallback: float | None = None) -> str:
    """Map model output to High / Medium / Low only."""
    if isinstance(raw, str):
        t = raw.strip().lower()
        if t in ("high", "h"):
            return "High"
        if t in ("medium", "med", "m"):
            return "Medium"
        if t in ("low", "l"):
            return "Low"
    if score_fallback is not None:
        try:
            s = float(score_fallback)
            if s >= 0.67:
                return "High"
            if s >= 0.4:
                return "Medium"
            return "Low"
        except (TypeError, ValueError):
            pass
    return "Medium"


def _ensure_signoff(body: str) -> str:
    text = (body or "").strip()
    if not text:
        return text
    if re.search(r"Usman\s*\n\s*Founder,\s*Relista", text, re.I):
        return text
    # Strip generic placeholders then append real sign-off
    text = re.sub(r"\[Your Name\]", "Usman", text, flags=re.I)
    text = re.sub(r"(Best regards,?\s*)\n?.*$", r"\1", text, flags=re.I | re.S).rstrip()
    if not re.search(r"best regards", text, re.I):
        text = text.rstrip() + "\n\nBest regards,"
    text = text.rstrip() + "\nUsman\nFounder, Relista"
    return text


def enrich_company(
    lead: dict[str, Any],
    offer_text: str = "",
    language: str = "en",
) -> dict[str, Any]:
    """
    Research → ICP match High/Medium/Low + rationale → 1–2 drafts.
    """
    research, sources = _research_signals(lead)
    retrieved_at = datetime.now(timezone.utc).isoformat()
    lang_rule = (
        "Write drafts in Norwegian Bokmål."
        if language.lower().startswith("nor") or language.lower() in ("nb", "no")
        else "Write drafts in English."
    )
    user = (
        f"OFFER / ICP:\n{(offer_text or 'Relista helps Norwegian B2B teams find relevant companies from Enhetsregisteret.').strip()}\n\n"
        f"BRREG FACTS (official register only):\n{_facts(lead)}\n\n"
        f"RESEARCH NOTES:\n{research}\n\n"
        "Return JSON with keys:\n"
        'icp_match ("High" | "Medium" | "Low"),\n'
        "match_reasons (array of 2-4 short strings based only on Brreg/ICP attributes),\n"
        "rationale (2-4 sentences: profile fit only, not buying intent; if no news evidence, include exactly: "
        '"No source-backed recent development found."),\n'
        "drafts (array of 1 or 2 objects: subject, body, language),\n"
        "research_notes (short summary of what you used).\n"
        f"{lang_rule} "
        "Never invent emails, phones, acquisitions, launches, or hiring. "
        "Sign draft body with Usman / Founder, Relista only."
    )
    data = _llm_json(SYSTEM, user)

    # Optional legacy score → band
    legacy_score = data.get("priority_score")
    try:
        legacy_score = float(legacy_score) if legacy_score is not None else None
    except (TypeError, ValueError):
        legacy_score = None

    icp_match = _normalize_match(data.get("icp_match"), legacy_score)
    reasons = data.get("match_reasons") or []
    if not isinstance(reasons, list):
        reasons = [str(reasons)]
    reasons = [_as_text(r) for r in reasons if _as_text(r)][:4]
    if not reasons:
        city = _as_text(lead.get("city")) or "Norway"
        reasons = [f"Registered in {city}", "Matches the selected sector filter"]

    rationale = _as_text(data.get("rationale"))
    if "no source-backed recent development" not in research.lower():
        pass
    elif rationale and "no source-backed recent development" not in rationale.lower():
        rationale = (rationale.rstrip() + " No source-backed recent development found.").strip()
    if not rationale:
        rationale = (
            "Profile fit is based on Brreg registration attributes and your saved offer. "
            "No source-backed recent development found."
            if "no source-backed" in research.lower()
            else "Profile fit is based on Brreg registration attributes and your saved offer. This is not buying intent."
        )

    drafts = data.get("drafts") or []
    clean_drafts = []
    for i, d in enumerate(drafts[:2]):
        if not isinstance(d, dict):
            continue
        clean_drafts.append(
            {
                "version": i + 1,
                "subject": _as_text(d.get("subject"))[:200],
                "body": _ensure_signoff(_as_text(d.get("body"))),
                "language": _as_text(d.get("language"))
                or ("nb" if language.lower().startswith("nor") else "en"),
            }
        )

    if not clean_drafts:
        name = _as_text(lead.get("company") or lead.get("navn")) or "your company"
        city = _as_text(lead.get("city")) or "Norway"
        clean_drafts = [
            {
                "version": 1,
                "subject": f"Relevant for {name}",
                "body": (
                    f"Hi there,\n\n"
                    f"I noticed {name} is registered in {city}. "
                    f"We help B2B teams find relevant Norwegian companies using official Brreg data.\n\n"
                    f"Would a short list for your market be useful this week?\n\n"
                    f"Best regards,\nUsman\nFounder, Relista"
                ),
                "language": "en",
            }
        ]

    # Numeric score kept only for optional sort compatibility; UI uses icp_match
    band_score = {"High": 0.85, "Medium": 0.55, "Low": 0.25}[icp_match]

    return {
        "company_id": _as_text(lead.get("orgnr") or lead.get("organisasjonsnummer")),
        "company": _as_text(lead.get("company") or lead.get("navn")),
        "icp_match": icp_match,
        "match_reasons": reasons,
        "priority_score": band_score,
        "rationale": rationale,
        "drafts": clean_drafts,
        "research_notes": _as_text(data.get("research_notes")) or research[:500],
        "sources": sources,
        "brreg_retrieved_at": retrieved_at,
        "generated_at": retrieved_at,
        "model": DEPLOYMENT,
        "ai_generated": True,
        "review_required": True,
    }


def enrich_pack(
    leads: list[dict[str, Any]],
    offer_text: str = "",
    language: str = "en",
    max_companies: int | None = None,
) -> list[dict[str, Any]]:
    """Enrich a pack in controlled batches. Cap at MAX_INTELLIGENCE."""
    limit = max_companies if max_companies is not None else MAX_INTELLIGENCE
    limit = max(1, min(limit, MAX_INTELLIGENCE))
    out: list[dict[str, Any]] = []
    for lead in leads[:limit]:
        try:
            out.append(enrich_company(lead, offer_text=offer_text, language=language))
        except Exception as exc:
            out.append(
                {
                    "company_id": _as_text(lead.get("orgnr")),
                    "company": _as_text(lead.get("company")),
                    "icp_match": "Low",
                    "match_reasons": [],
                    "priority_score": 0.0,
                    "rationale": "",
                    "drafts": [],
                    "research_notes": f"Intelligence skipped: {exc}",
                    "sources": [],
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "model": DEPLOYMENT,
                    "ai_generated": False,
                    "review_required": True,
                    "error": str(exc),
                }
            )
    return out
