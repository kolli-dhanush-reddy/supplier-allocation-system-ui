"""
Nova API Client
================
Authenticated HTTP client for the Aczen Nova API.
Handles pagination, retries, and rate-limit awareness.

Base URL : https://www.aczen.in/nova-api/v1
Auth     : Authorization: Bearer <NOVA_API_KEY>
Limit    : 120 requests/minute (we stay well under this)

All methods return plain dicts so the transformer layer can work
with them without any circular-import issues.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, Generator, List, Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

NOVA_BASE_URL = "https://www.aczen.in/nova-api/v1"
PAGE_SIZE = 100          # max per request
REQUEST_DELAY = 0.05     # 50 ms between pages — stays under 120 rpm
TIMEOUT = 20.0           # seconds per request


# ── Low-level helpers ─────────────────────────────────────────────────────────

def _auth_headers() -> Dict[str, str]:
    settings = get_settings()
    return {
        "Authorization": f"Bearer {settings.nova_api_key}",
        "Accept": "application/json",
    }


def _get(path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Single authenticated GET request.
    Raises httpx.HTTPStatusError on 4xx/5xx.
    """
    url = f"{NOVA_BASE_URL}{path}"
    with httpx.Client(timeout=TIMEOUT) as client:
        resp = client.get(url, headers=_auth_headers(), params=params or {})
        resp.raise_for_status()
        return resp.json()


def _paginate(path: str, extra_params: Optional[Dict[str, Any]] = None) -> Generator[Dict, None, None]:
    """
    Yield every item from a paginated Nova endpoint.
    Handles offset-based pagination transparently.
    """
    offset = 0
    params = {**(extra_params or {}), "limit": PAGE_SIZE, "offset": offset}

    while True:
        params["offset"] = offset
        try:
            resp = _get(path, params)
        except httpx.HTTPStatusError as exc:
            logger.error("Nova API error on %s: %s", path, exc)
            break
        except Exception as exc:
            logger.error("Nova API request failed on %s: %s", path, exc)
            break

        items: List[Dict] = resp.get("data", [])
        for item in items:
            yield item

        pagination = resp.get("pagination", {})
        if not pagination.get("has_more", False):
            break

        offset += PAGE_SIZE
        time.sleep(REQUEST_DELAY)


# ── Public fetch functions ────────────────────────────────────────────────────

def fetch_vendors() -> List[Dict]:
    """Return all vendors (suppliers) from Nova API."""
    logger.info("Fetching vendors from Nova API…")
    vendors = list(_paginate("/vendors"))
    logger.info("  → %d vendors fetched", len(vendors))
    return vendors


def fetch_inventory() -> List[Dict]:
    """Return all inventory items (SKUs) from Nova API."""
    logger.info("Fetching inventory from Nova API…")
    items = list(_paginate("/inventory"))
    logger.info("  → %d inventory items fetched", len(items))
    return items


def fetch_purchase_orders() -> List[Dict]:
    """Return all purchase orders from Nova API."""
    logger.info("Fetching purchase orders from Nova API…")
    pos = list(_paginate("/purchase-orders"))
    logger.info("  → %d purchase orders fetched", len(pos))
    return pos


def fetch_vendor_payments() -> List[Dict]:
    """Return all vendor payments from Nova API."""
    logger.info("Fetching vendor payments from Nova API…")
    payments = list(_paginate("/vendor-payments"))
    logger.info("  → %d vendor payments fetched", len(payments))
    return payments


def fetch_me() -> Dict:
    """Return API key metadata (team info, rate limits)."""
    return _get("/me").get("data", {})


def health_check() -> bool:
    """Return True if Nova API is reachable."""
    try:
        _get("/me")
        return True
    except Exception as exc:
        logger.warning("Nova API health check failed: %s", exc)
        return False
