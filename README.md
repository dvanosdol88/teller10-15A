Teller 10-15A Backend (FastAPI)

Overview
- Python FastAPI service that powers the SPA via a simple, secure API surface.
- Implements config and health endpoints expected by the SPA, plus /api/db/* using a static dataset for now.
- Supports optional bearer auth for SPA→backend calls, and feature flags to control behavior.

Endpoints
- GET /api/healthz
- GET /api/config
- GET /api/db/accounts
- GET /api/db/accounts/{account_id}/balances
- GET /api/db/accounts/{account_id}/transactions?limit=N

Auth
- Authorization: Bearer <BACKEND_API_TOKEN> (required if REQUIRE_AUTH=true)

Environment Variables
- BACKEND_API_TOKEN, REQUIRE_AUTH, FEATURE_STATIC_DB, FEATURE_MANUAL_DATA, PORT

Local Run
- python -m venv .venv && source .venv/bin/activate
- pip install -r requirements.txt
- export FEATURE_STATIC_DB=true BACKEND_API_TOKEN=dev-token PORT=3001
- uvicorn teller:app --host 0.0.0.0 --port ${PORT:-3001}

Render
- Build: pip install -r requirements.txt
- Start: python teller.py
- Health: /api/healthz

