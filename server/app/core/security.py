"""
API key authentication dependency.

Every protected endpoint declares:
    _: Annotated[None, Depends(verify_api_key)]

FastAPI will call this before the route handler.
If the key is missing or wrong it returns 401/403 immediately.
"""
from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader

from app.core.config import get_settings

# FastAPI will extract the value of the "X-API-Key" request header
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(
    api_key: Annotated[str | None, Security(_api_key_header)],
) -> None:
    """
    Dependency that validates the X-API-Key header.
    Raises 401 if the header is absent, 403 if the key is wrong.
    """
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-API-Key header is required.",
        )
    settings = get_settings()
    if api_key != settings.effective_internal_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API key.",
        )
