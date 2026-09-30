"""
Server entry point — run this file directly with Python:
    python main.py

Or use uvicorn directly:
    uvicorn app.main:app --reload --port 8000
"""
import uvicorn
from app.core.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.app_env == "development",
        log_level="info",
    )
