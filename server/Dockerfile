# ── NexusFlow FastAPI Backend Dockerfile ──────────────────────
FROM python:3.12-slim

# System deps for PuLP/CBC solver
RUN apt-get update && apt-get install -y --no-install-recommends \
    glpk-utils \
    coinor-cbc \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
