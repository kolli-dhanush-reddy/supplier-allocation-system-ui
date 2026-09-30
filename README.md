# NexusFlow — Supplier Allocation & Procurement Intelligence

A full-stack procurement planning system with a **Next.js** frontend and a **FastAPI** backend powered by a **Mixed-Integer Linear Program (MILP)** optimization engine.

---

## Project Structure

```
supplier-allocation-system-ui/
├── app/                        # Next.js App Router (frontend)
│   ├── page.tsx                # Main UI — dashboard, optimization, scenarios, POs
│   ├── layout.tsx
│   └── globals.css
├── components/ui/              # Shadcn UI components
├── src/
│   ├── types/procurement.ts    # Shared TypeScript types (mirrors Python models)
│   └── lib/
│       ├── api.ts              # Axios API client (all endpoints, X-API-Key injected)
│       └── hooks.ts            # React hooks for data fetching
├── server/                     # FastAPI Python backend
│   ├── app/
│   │   ├── main.py             # FastAPI app entry point + CORS
│   │   ├── core/
│   │   │   ├── config.py       # Pydantic-settings (reads .env)
│   │   │   └── security.py     # X-API-Key header dependency
│   │   ├── models/             # Pydantic request/response models
│   │   ├── routers/            # API route handlers
│   │   └── services/
│   │       ├── optimizer.py    # PuLP MILP solver (4 strategies)
│   │       ├── scenario.py     # Scenario disruption simulator
│   │       └── seed_data.py    # Default suppliers, SKUs, pricing, POs
│   ├── main.py                 # Uvicorn entry point
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env                    # ⚠ Local secrets — never commit
│   └── .env.example            # Safe template to share
├── docker-compose.yml
├── Dockerfile.frontend
├── .env.local                  # ⚠ Local frontend secrets — never commit
└── .env.example                # Safe template
```

---

## Quick Start (Recommended — without Docker)

### 1. Backend

```bash
# Navigate to the server folder
cd server

# Create and activate a Python virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy the env template and fill in your key
copy .env.example .env       # Windows
# cp .env.example .env       # macOS/Linux

# Start the server
python main.py
# or: uvicorn app.main:app --reload --port 8000
```

Backend is now live at **http://localhost:8000**
Interactive API docs at **http://localhost:8000/docs**

---

### 2. Frontend

```bash
# From the project root
cd ..

# Copy and configure env
copy .env.example .env.local   # Windows
# cp .env.example .env.local   # macOS/Linux

# Edit .env.local — it should contain:
# NEXT_PUBLIC_API_URL=http://localhost:8000
# NEXT_PUBLIC_NOVA_API_KEY=your_nova_api_key_here

# Install dependencies and start
npm install
npm run dev
```

Frontend is now live at **http://localhost:3000**

---

## Quick Start (Docker)

```bash
# From the project root — builds and starts both services
docker compose up --build

# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# API docs:  http://localhost:8000/docs
```

---

## API Reference

All endpoints require the `X-API-Key` header:
```
X-API-Key: your_nova_api_key_here
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Liveness check (no auth) |
| GET | `/api/suppliers` | List all suppliers |
| GET | `/api/suppliers/{id}` | Get supplier by ID |
| GET | `/api/suppliers/capacity/all` | Capacity utilization snapshot |
| GET | `/api/demand` | Current demand plan |
| POST | `/api/demand` | Upsert demand plan |
| GET | `/api/pricing` | Full pricing matrix |
| GET | `/api/pricing/spend-breakdown` | Spend % per supplier |
| POST | `/api/optimize` | Run MILP with custom payload |
| GET | `/api/optimize/quick?strategy=` | Run MILP on seed data |
| POST | `/api/scenarios/simulate` | Run disruption scenario |
| GET | `/api/purchase-orders` | List all purchase orders |
| GET | `/api/purchase-orders/{po}` | Get single PO |
| POST | `/api/purchase-orders/generate` | Generate POs from optimization |
| PATCH | `/api/purchase-orders/{po}/status` | Update PO status |

---

## Optimization Strategies

| Strategy | Description |
|----------|-------------|
| `cost_minimization` | Minimise total cost of ownership (unit price + logistics) |
| `lead_time_minimization` | Minimise weighted average lead time across all allocations |
| `balanced_risk` | Cost minimisation with a per-supplier allocation cap (default 70%) |
| `dual_sourcing` | Enforces a secondary supplier share per SKU per period (default 20%) |

---

## Scenario Simulations

| Disruption Type | What It Does |
|-----------------|-------------|
| `supplier_disruption` | Sets selected supplier capacity to 0 and re-optimises |
| `price_inflation` | Multiplies all prices by a factor (e.g. 1.15 = +15%) |
| `demand_surge` | Multiplies all demand quantities by a factor (e.g. 1.3 = +30%) |

Returns baseline vs. simulated results with cost delta, fulfillment delta, lead time delta, and a plain-English risk assessment.

---

## Environment Variables

### Backend (`server/.env`)
| Variable | Description |
|----------|-------------|
| `NOVA_API_KEY` | API key checked on every request |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `APP_ENV` | `development` or `production` |
| `HOST` | Bind address (default `0.0.0.0`) |
| `PORT` | Port (default `8000`) |

### Frontend (`.env.local`)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | FastAPI base URL (e.g. `http://localhost:8000`) |
| `NEXT_PUBLIC_NOVA_API_KEY` | API key sent in `X-API-Key` header |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS v4, Shadcn UI, Recharts |
| API Client | Axios with typed request/response models |
| Backend | Python 3.12, FastAPI, Uvicorn |
| Optimization | PuLP + CBC (MILP solver) |
| Config | pydantic-settings, python-dotenv |
| Auth | X-API-Key header middleware |
| Containers | Docker + Docker Compose |
