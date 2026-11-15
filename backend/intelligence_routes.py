"""
FastAPI routes for Relista pack intelligence.
Include in main.py:

  from intelligence_routes import router as intelligence_router
  app.include_router(intelligence_router)

Or merge the two endpoints into chat_routes.py.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from pack_intelligence import MAX_INTELLIGENCE, enrich_company, enrich_pack

try:
    from leads_store import get_lead, list_leads, load_one_pager
except ImportError:
    def get_lead(orgnr: str):  # type: ignore
        return None

    def list_leads():  # type: ignore
        return []

    def load_one_pager():  # type: ignore
        return ""

try:
    from brreg_search import fetch_company
except ImportError:
    def fetch_company(orgnr: str):  # type: ignore
        return None

router = APIRouter(tags=["intelligence"])


class EnrichOneIn(BaseModel):
    language: str = "en"


class EnrichPackIn(BaseModel):
    orgnrs: Optional[list[str]] = None
    language: str = "en"
    max_companies: int = Field(default=MAX_INTELLIGENCE, ge=1, le=25)


@router.post("/leads/{orgnr}/intelligence")
async def api_enrich_one(orgnr: str, body: EnrichOneIn = EnrichOneIn()):
    """Enrich a single company. Returns intelligence object for the pack row."""
    lead = get_lead(orgnr)
    if not lead:
        lead = fetch_company(orgnr)
        if hasattr(lead, "__await__"):
            lead = await lead
    if not lead:
        return {"error": "Company not found.", "orgnr": orgnr}
    offer = load_one_pager() or ""
    intel = enrich_company(lead, offer_text=offer, language=body.language)
    return {"intelligence": intel, "brreg": lead}


@router.post("/pack/enrich")
async def api_enrich_pack(body: EnrichPackIn = EnrichPackIn()):
    """
    Enrich a list of companies (weekly pack intelligence).
    If orgnrs is empty, uses current leads store (capped).
    Async-friendly: call from a background job in production.
    """
    offer = load_one_pager() or ""
    leads: list[dict[str, Any]] = []
    if body.orgnrs:
        for orgnr in body.orgnrs:
            lead = get_lead(orgnr)
            if not lead:
                lead = fetch_company(orgnr)
                if hasattr(lead, "__await__"):
                    lead = await lead
            if lead:
                leads.append(lead)
    else:
        leads = list_leads()

    results = enrich_pack(
        leads,
        offer_text=offer,
        language=body.language,
        max_companies=body.max_companies,
    )
    return {
        "count": len(results),
        "max": body.max_companies,
        "intelligence": results,
        "note": "AI-generated — review before use. No messages were sent.",
    }
