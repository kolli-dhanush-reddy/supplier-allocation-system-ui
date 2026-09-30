"""
Application configuration — reads all settings from environment variables.
Values are loaded from server/.env at startup (never hardcoded here).
"""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Nova API (outbound — calls Aczen's external API) ──────
    nova_api_key: str  # Bearer token for Nova API. Required.
    nova_api_base_url: str = "https://www.aczen.in/nova-api/v1"

    # ── Internal API protection ───────────────────────────────
    # Separate key used to protect YOUR own FastAPI routes.
    # Defaults to nova_api_key if not explicitly set.
    internal_api_key: str = ""

    # ── CORS ──────────────────────────────────────────────────
    allowed_origins: str = "http://localhost:3000"

    # ── App ───────────────────────────────────────────────────
    app_env: str = "development"
    app_name: str = "NexusFlow Procurement API"
    app_version: str = "1.0.0"

    # ── Server ────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def cors_origins(self) -> List[str]:
        """Return ALLOWED_ORIGINS as a list (splits on comma)."""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def effective_internal_key(self) -> str:
        """
        The key checked on incoming requests to YOUR API.
        Falls back to nova_api_key if INTERNAL_API_KEY is not set,
        keeping backward compatibility with the original setup.
        """
        return self.internal_api_key or self.nova_api_key


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — settings are read once and reused."""
    return Settings()
