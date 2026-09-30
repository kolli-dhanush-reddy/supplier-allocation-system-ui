"""
NexusFlow Procurement Intelligence API
========================================
FastAPI application entry point.

Run locally:
    cd server
    uvicorn app.main:app --reload --port 8000

Interactive docs: http://localhost:8000/docs
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import demand, nova, optimization, pricing, purchase_orders, suppliers

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Backend API for NexusFlow — Supplier Allocation & Procurement "
        "Planning System. Powered by the Aczen Nova API dataset, PuLP MILP "
        "optimization, and full procurement data management."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(suppliers.router)
app.include_router(demand.router)
app.include_router(pricing.router)
app.include_router(optimization.router)
app.include_router(purchase_orders.router)
app.include_router(nova.router)          # ← Nova API management endpoints

# ── Health (no auth) ─────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
@app.get("/healthz", tags=["Health"])
async def health() -> dict:
    from app.services.nova_seed import status as nova_status
    ns = nova_status()
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
        "data_source": ns["data_source"],
        "last_synced_at": ns["last_synced_at"],
        "dataset": {
            "suppliers":       ns["suppliers"],
            "skus":            ns["skus"],
            "pricing_pairs":   ns["pricing_pairs"],
            "purchase_orders": ns["purchase_orders"],
        },
    }


@app.get("/", tags=["Health"])
async def root() -> dict:
    return {"message": f"Welcome to {settings.app_name}", "docs": "/docs"}


# ── Startup — load Nova API data ──────────────────────────────────────────────
@app.on_event("startup")
async def on_startup() -> None:
    logger.info("🚀 %s v%s — %s mode", settings.app_name, settings.app_version, settings.app_env)
    logger.info("   CORS origins: %s", settings.cors_origins)
    logger.info("   Nova API base: %s", settings.nova_api_base_url)

    # Load real data from Nova API (falls back to static seed on failure)
    from app.services.nova_seed import initialise
    initialise()
