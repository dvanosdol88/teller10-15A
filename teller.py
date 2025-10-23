import os
from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import json
from pathlib import Path

FEATURE_STATIC_DB = os.getenv("FEATURE_STATIC_DB", "false").lower() == "true"
FEATURE_MANUAL_DATA = os.getenv("FEATURE_MANUAL_DATA", "false").lower() == "true"
BACKEND_API_TOKEN = os.getenv("BACKEND_API_TOKEN", "").strip()
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "").lower() or ("true" if BACKEND_API_TOKEN else "false")
REQUIRE_AUTH = REQUIRE_AUTH == "true"

BASE_CONFIG = {
    "apiBaseUrl": "/api",
    "FEATURE_USE_BACKEND": True,
    "FEATURE_MANUAL_DATA": FEATURE_MANUAL_DATA,
    "FEATURE_STATIC_DB": FEATURE_STATIC_DB,
}

def compute_backend_mode(cfg):
    if cfg.get("FEATURE_STATIC_DB"):
        return "static"
    if not cfg.get("FEATURE_USE_BACKEND", True):
        return "disabled"
    return "live"

def load_static_db():
    data_path = Path(__file__).parent / "data" / "db.json"
    with data_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)

def require_auth_or_401(authorization: Optional[str]):
    if not REQUIRE_AUTH:
        return
    if not BACKEND_API_TOKEN:
        raise HTTPException(status_code=401, detail="Backend token not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization.split(" ", 1)[1]
    if token != BACKEND_API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")

app = FastAPI(title="Teller 10-15A Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/healthz")
def healthz():
    try:
        db = load_static_db()
        assets = 0.0
        for acc in db.get("balances", {}).values():
            bal = acc.get("balance", {})
            available = bal.get("available", 0) or 0
            assets += available
        resp = {
            "ok": True,
            "backendUrl": os.getenv("RENDER_EXTERNAL_URL", "self"),
            "manualData": {
                "enabled": FEATURE_MANUAL_DATA,
                "readonly": False,
                "dryRun": False,
                "connected": None,
                "summary": {"assets": assets}
            }
        }
        return JSONResponse(resp)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.get("/api/config")
def config():
    cfg = dict(BASE_CONFIG)
    cfg["backendMode"] = compute_backend_mode(cfg)
    return JSONResponse(cfg)

@app.get("/api/db/accounts")
def list_accounts(Authorization: Optional[str] = Header(default=None)):
    require_auth_or_401(Authorization)
    db = load_static_db()
    return JSONResponse({"accounts": db.get("accounts", [])})

@app.get("/api/db/accounts/{account_id}/balances")
def account_balance(account_id: str, Authorization: Optional[str] = Header(default=None)):
    require_auth_or_401(Authorization)
    db = load_static_db()
    balances = db.get("balances", {})
    if account_id not in balances:
        raise HTTPException(status_code=404, detail="Balance not found")
    return JSONResponse(balances[account_id])

@app.get("/api/db/accounts/{account_id}/transactions")
def account_transactions(account_id: str, limit: Optional[int] = None, Authorization: Optional[str] = Header(default=None)):
    require_auth_or_401(Authorization)
    db = load_static_db()
    tx = db.get("transactions", {}).get(account_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transactions not found")
    if limit and isinstance(limit, int) and limit > 0:
        tx = {**tx, "transactions": tx.get("transactions", [])[:limit]}
    return JSONResponse(tx)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "3001"))
    uvicorn.run(app, host="0.0.0.0", port=port)

