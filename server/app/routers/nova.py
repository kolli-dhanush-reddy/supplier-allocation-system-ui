"""
/api/nova — Nova API integration management endpoints.

GET  /api/nova/status   — current data store metadata (source, last sync, counts)
POST /api/nova/sync     — force re-fetch from Nova API and rebuild the store
GET  /api/nova/health   — check if Nova API is reachable right now
GET  /api/nova/me       — return Nova API key metadata (team info)
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import verify_api_key
from app.services import nova_seed

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/nova", tags=["Nova API"])
Auth   = Annotated[None, Depends(verify_api_key)]


@router.get("/status")
async def nova_status(_: Auth) -> dict:
    """Return metadata about the current in-memory dataset."""
    return nova_seed.status()


@router.post("/sync")
async def nova_sync(_: Auth) -> dict:
    """
    Force a fresh pull from the Nova API.
    Replaces the in-memory store with the latest vendor/inventory/PO data.
    Safe to call at any time — the swap is atomic.
    """
    logger.info("Manual Nova API sync triggered")
    return nova_seed.sync()


@router.get("/health")
async def nova_health(_: Auth) -> dict:
    """Check whether the Nova API is reachable using the configured key."""
    from app.services.nova_client import health_check
    reachable = health_check()
    return {
        "nova_api_reachable": reachable,
        "base_url": "https://www.aczen.in/nova-api/v1",
    }


@router.get("/me")
async def nova_me(_: Auth) -> dict:
    """Return Nova API key metadata — team name, slot, rate limits."""
    from app.services.nova_client import fetch_me
    return fetch_me()
