# Teller Cached Dashboard: Complete Integration Phases
**Document Date:** October 16, 2025  
**Last Updated:** October 16, 2025

## Overview

This document consolidates all phases of the Teller Cached Dashboard backend integration in chronological order. The integration connects the database-backed backend (teller10-15A) with the visual UI (teller-codex10-9-devinUI), ensuring zero regressions and instant rollback capability at every step.

## Integration Principles

- **Additive and non-breaking**: Default remains static with no network calls
- **Feature-flagged rollout**: Gate all backend usage behind a global flag
- **Safe fallbacks**: If backend unavailable or errors occur, silently fall back to mock data
- **Clear rollback**: Flip the flag off to revert to purely static behavior
- **Small, reviewable PRs per phase**

## Global Flags and Conventions

- `window.FEATURE_USE_BACKEND`: boolean. Default false; gates all backend usage
- `window.TEST_BEARER_TOKEN`: optional string for testing Authorization: Bearer
- API base: default `/api`; may be overridden by `/api/config` response

---

## Phase 0: Baseline Documentation (No Code Changes)

**Status:** ✅ Complete  
**Timeline:** Initial phase  
**Repository:** Both UI and Backend

### Objectives
- Document backend endpoints, response shapes, auth requirements
- Confirm DB schema stability for read-only use
- Establish integration roadmap

### Deliverables
- Integration plan documentation (INTEGRATION_PLAN.md)
- Endpoint specifications
- Security and rollback procedures

### Acceptance Criteria
- Development team understands phases, flags, endpoints, and rollback procedures
- Documentation accessible and linked from README

---

## Phase 1: UI Fetch Adapter (Additive, Feature-Flagged)

**Status:** ✅ Complete (Merged PR #2)  
**Timeline:** First implementation phase  
**Repository:** teller-codex10-9-devinUI

### Objectives
Add feature-flagged BackendAdapter in visual-only/index.js with:
- Methods: `loadConfig`, `fetchAccounts`, `fetchCachedBalance`, `fetchCachedTransactions`, `refreshLive`
- Explicit mock fallbacks on errors or when flag is false
- Initialize flags in visual-only/index.html with default false

### Implementation Details
```javascript
// BackendAdapter structure
class BackendAdapter {
  loadConfig()           // GET /api/config
  fetchAccounts()        // GET /api/db/accounts
  fetchCachedBalance()   // GET /api/db/accounts/{id}/balances
  fetchCachedTransactions() // GET /api/db/accounts/{id}/transactions
  refreshLive()          // Live data refresh
}
```

### Acceptance Criteria
- [x] With default settings, UI identical to main branch, zero network calls
- [x] When flag is toggled on manually, adapter still returns mock data if backend is unreachable
- [x] No console errors in any configuration

---

## Phase 2: Runtime Configuration via /api/config

**Status:** ✅ Complete (Merged PR #4)  
**Timeline:** Second implementation phase  
**Repository:** teller-codex10-9-devinUI (UI) + teller10-15A (Backend)

### Objectives
- BackendAdapter.loadConfig() attempts GET /api/config and safely falls back
- If successful: set state.apiBaseUrl (string; trimmed) and FEATURE_USE_BACKEND if boolean
- On error: do not throw; return defaults

### Backend Endpoint
```
GET /api/config
Response: {
  "applicationId": string,
  "environment": string,
  "apiBaseUrl": string,
  "FEATURE_MANUAL_DATA": boolean,
  "FEATURE_USE_BACKEND": boolean
}
```

### Acceptance Criteria
- [x] Missing/failed /api/config leaves UI unchanged
- [x] No storage usage, no CORS issues for same-origin
- [x] No behavior change until loadConfig() is invoked by future phases

---

## Phase 3: Token Handling Strategy

**Status:** ✅ Complete (Merged PR #6, included in Phase 4 PR)  
**Timeline:** Third implementation phase  
**Repository:** teller-codex10-9-devinUI

### Objectives

**Short-term:**
- Accept `window.TEST_BEARER_TOKEN` when present
- Include `Authorization: Bearer` in adapter headers()
- Do not persist; no localStorage/sessionStorage writes

**Medium-term (optional):**
- Transition to HttpOnly session cookies via backend auth flow

### Implementation
```javascript
headers() {
  const headers = { 'Content-Type': 'application/json' };
  if (window.TEST_BEARER_TOKEN) {
    headers['Authorization'] = `Bearer ${window.TEST_BEARER_TOKEN}`;
  }
  return headers;
}
```

### Acceptance Criteria
- [x] With flag off: unchanged behavior
- [x] With flag on but missing token: only public endpoints hit; failures fall back to mocks without errors
- [x] With token set: endpoints authorize successfully
- [x] No persistence of tokens in browser storage

---

## Phase 4: Non-Breaking Progressive Rollout of Cached Reads

**Status:** ✅ Complete (Merged PR #7)  
**Timeline:** Fourth implementation phase  
**Repository:** teller-codex10-9-devinUI

### Objectives
Gate cached endpoints (safe reads) under `isBackendEnabled()`:
- GET `/api/db/accounts`
- GET `/api/db/accounts/{id}/balances`
- GET `/api/db/accounts/{id}/transactions?limit=10`

Maintain silent fallback to mock data with optional toast "Using demo data" on fallback.

### Implementation Details
```javascript
async fetchAccounts() {
  if (!this.isBackendEnabled()) {
    return mockAccounts;
  }
  try {
    const response = await fetch(`${this.state.apiBaseUrl}/db/accounts`, {
      headers: this.headers()
    });
    if (!response.ok) throw new Error('Failed to fetch');
    return await response.json();
  } catch (error) {
    console.warn('Backend unavailable, using mock data', error);
    return mockAccounts;
  }
}
```

### Acceptance Criteria
- [x] Backend down: UI renders with mocks, no visible errors
- [x] Backend up: cached data displays; zero regressions
- [x] Optional toast notification when falling back to demo data
- [x] Wire adapter calls into render path with guards and fallbacks

---

## Phase 5: Backend Configuration (Render)

**Status:** ✅ Complete (This implementation)  
**Timeline:** Fifth implementation phase  
**Repository:** teller10-15A

### Objectives
- Backend environment on Render configured for DB + TLS as needed
- Confirm `/api/config` returns all required fields including `FEATURE_USE_BACKEND`
- Add environment variable support for runtime feature toggling

### Backend Implementation
**File:** `python/teller.py` (line 215-221)
```python
runtime_config = {
    "applicationId": args.application_id,
    "environment": args.environment,
    "apiBaseUrl": args.app_api_base_url,
    "FEATURE_MANUAL_DATA": os.getenv("FEATURE_MANUAL_DATA", "true").lower() == "true",
    "FEATURE_USE_BACKEND": os.getenv("FEATURE_USE_BACKEND", "false").lower() == "true",
}
```

### Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `FEATURE_USE_BACKEND` | Enable backend integration for UI | `false` |
| `TELLER_APPLICATION_ID` | Teller application identifier | Required |
| `TELLER_ENVIRONMENT` | development/production | `development` |
| `TELLER_APP_API_BASE_URL` | API base URL for frontend | `/api` |
| `DATABASE_INTERNAL_URL` | Postgres connection string | Required |
| `DATABASE_SSLMODE` | SSL mode for Postgres | Optional |
| `TELLER_CERTIFICATE` | TLS certificate path or PEM | Required |
| `TELLER_PRIVATE_KEY` | TLS private key path or PEM | Required |

### Cached Endpoints (Available)
All required endpoints are implemented and ready:
- GET `/api/db/accounts` → `AccountsResource`
- GET `/api/db/accounts/{account_id}/balances` → `CachedBalanceResource`
- GET `/api/db/accounts/{account_id}/transactions` → `CachedTransactionsResource`

### Live Endpoints (Available)
- GET `/api/accounts/{account_id}/balances` → `LiveBalanceResource`
- GET `/api/accounts/{account_id}/transactions` → `LiveTransactionsResource`

### Acceptance Criteria
- [x] Config endpoint stable and safe
- [x] Toggling flag flips UI data source without redeploying UI
- [x] Documentation updated in README.md
- [x] Tests added for config endpoint (test_config.py)

### Testing
**File:** `tests/test_config.py`
```python
def test_config_endpoint_default_feature_flag(client):
    """Test that FEATURE_USE_BACKEND defaults to false."""
    result = client.simulate_get("/api/config")
    assert result.status_code == 200
    assert "FEATURE_USE_BACKEND" in result.json
    assert result.json["FEATURE_USE_BACKEND"] is False
```

---

## Phase 6: Monitoring, Validation, Rollback

**Status:** ✅ Complete  
**Timeline:** Ongoing / Final phase  
**Repository:** Both UI and Backend

### Objectives
- Validate at each step: console free of errors, network calls correct, UI parity intact
- Establish rollback procedure: flip `FEATURE_USE_BACKEND=false` in `/api/config`
- Logging/metrics (backend): monitor request rate, latency, errors
- Documentation: troubleshooting guide and validation procedures

### Validation Procedures

**Local (UI):**
1. Serve the repo over HTTP from the root; open `/visual-only/index.html`
2. With default flags:
   - Network tab: 0 requests
   - Console: 0 errors
3. With `FEATURE_USE_BACKEND=true` and no backend:
   - Network: requests may 404/500 but UI remains stable via fallbacks
   - Console: no uncaught errors
4. With backend reachable:
   - loadConfig sets feature and apiBaseUrl
   - Cached data endpoints return 200 and UI shows backend data

**Server (Backend):**
- Confirm `/api/config` returns valid JSON with apiBaseUrl and FEATURE_USE_BACKEND
- Monitor request logs for cached endpoints
- Verify database connection health
- Check authentication flow for Bearer tokens

### Rollback Procedure

**Instant Rollback (No Deployment Required):**
1. Set environment variable: `FEATURE_USE_BACKEND=false`
2. Restart backend service (Render auto-restarts on env var change)
3. UI automatically reverts to purely static behavior
4. No frontend redeployment needed
5. No database changes required

**Alternative Rollback:**
- Remove the `/api/config` endpoint entirely
- UI falls back to default mock behavior

### Monitoring Checklist
- [x] Backend request logging in place
- [x] Error tracking for API endpoints
- [x] Database query performance monitoring
- [x] Frontend console error monitoring
- [x] Network failure fallback verification

### Documentation
- [x] Troubleshooting guide created
- [x] Validation procedures documented
- [x] Rollback path verified and documented
- [x] Environment variable reference complete

---

## Endpoints Summary

### Configuration
- **GET** `/api/config`
  - Returns: `{ applicationId, environment, apiBaseUrl, FEATURE_MANUAL_DATA, FEATURE_USE_BACKEND }`

### Cached Data (Fast, Database Reads)
- **GET** `/api/db/accounts`
  - Returns: List of user's cached accounts
- **GET** `/api/db/accounts/{id}/balances`
  - Returns: Cached balance for account
- **GET** `/api/db/accounts/{id}/transactions?limit=10`
  - Returns: Cached transactions for account

### Live Data (Fresh, Teller API Calls)
- **GET** `/api/accounts/{id}/balances`
  - Fetches fresh balance from Teller API, updates cache
- **GET** `/api/accounts/{id}/transactions?count=10`
  - Fetches fresh transactions from Teller API, updates cache

### Authentication
- **POST** `/api/connect/token`
  - Creates Teller Connect token
- **POST** `/api/enrollments`
  - Processes new user enrollment

### Manual Data
- **GET** `/api/db/accounts/{id}/manual-data`
  - Returns manual data fields (rent_roll, etc.)
- **PUT** `/api/db/accounts/{id}/manual-data`
  - Updates manual data fields

---

## Implementation Timeline

| Phase | Description | Status | PR |
|-------|-------------|--------|-----|
| Phase 0 | Baseline Documentation | ✅ Complete | N/A |
| Phase 1 | UI Fetch Adapter | ✅ Complete | #2 |
| Hotfix | Robust Asset Paths | ✅ Complete | #3 |
| Phase 2 | Runtime Config Loader | ✅ Complete | #4 |
| Phase 3 | Token Handling | ✅ Complete | #6 |
| Phase 4 | Cached Reads Rollout | ✅ Complete | #7 |
| Phase 5 | Backend Configuration | ✅ Complete | This PR |
| Phase 6 | Monitoring & Validation | ✅ Complete | N/A |

---

## Testing Strategy

### Unit Tests
- Config endpoint tests (test_config.py)
- Webhook signature verification (test_webhooks.py)
- Manual data operations (test_manual_data.py)
- Database operations (test_smoke.py)

### Integration Tests
- UI with backend enabled/disabled
- Fallback behavior on backend failure
- Token authentication flow
- Config endpoint availability

### Manual Verification
1. **Static Mode** (`FEATURE_USE_BACKEND=false`):
   - No network calls from UI
   - Mock data renders correctly
   - No console errors

2. **Backend Mode** (`FEATURE_USE_BACKEND=true`):
   - Config loaded from `/api/config`
   - Cached data fetched from database
   - Graceful fallback on errors

3. **Rollback Scenario**:
   - Toggle flag from true to false
   - Verify UI reverts to static mode
   - No user data loss

---

## Security Considerations

### Authentication
- Bearer token authentication for all protected endpoints
- Token stored in memory only (no persistence)
- Secure session management

### TLS/SSL
- Mutual TLS for Teller API communication
- Certificate and private key stored securely (Google Secret Manager or Render secrets)
- Database connections use SSL (configurable via `DATABASE_SSLMODE`)

### CORS
- Same-origin requests preferred (no CORS needed)
- If cross-origin required: strict origin whitelist, dev-only

### Secrets Management
- No secrets in repository
- Environment variables or Google Secret Manager
- Render dashboard for production secrets

---

## Deployment Instructions

### Render Environment Setup
1. **Create PostgreSQL Database**
   - Provision via Render dashboard
   - Note `DATABASE_INTERNAL_URL`

2. **Configure Environment Variables**
   ```bash
   TELLER_APPLICATION_ID=<your-app-id>
   TELLER_ENVIRONMENT=development  # or production
   TELLER_CERTIFICATE=<certificate-pem-or-path>
   TELLER_PRIVATE_KEY=<private-key-pem-or-path>
   DATABASE_INTERNAL_URL=<postgres-url>
   DATABASE_SSLMODE=require
   FEATURE_USE_BACKEND=false  # Start disabled for safety
   FEATURE_MANUAL_DATA=true
   ```

3. **Run Database Migrations**
   ```bash
   python python/teller.py migrate
   ```

4. **Deploy Web Service**
   - Connect GitHub repository
   - Auto-deploy on push to main
   - Health check: `/api/healthz`

5. **Enable Backend Integration** (when ready)
   ```bash
   FEATURE_USE_BACKEND=true
   ```

---

## Troubleshooting

### UI Shows Mock Data Despite Backend Enabled
- Check `/api/config` returns `FEATURE_USE_BACKEND: true`
- Verify backend is reachable from UI
- Check browser console for network errors
- Verify Bearer token is present (if auth required)

### Backend Errors on Cached Endpoints
- Verify database connection (`DATABASE_INTERNAL_URL`)
- Check migrations are up to date: `python python/teller.py migrate`
- Review backend logs for SQL errors
- Verify user has accounts enrolled

### CORS Errors
- Ensure UI and backend are same-origin
- Check `TELLER_APP_API_BASE_URL` is relative path (`/api`)
- If different origins required: add CORS middleware (dev only)

### Authentication Failures
- Verify Bearer token format: `Authorization: Bearer <token>`
- Check token exists in database (users table)
- Test with `window.TEST_BEARER_TOKEN` in console

---

## Future Enhancements

### Potential Phase 7: Live Data Integration
- Wire "Refresh" button to live endpoints
- Real-time balance updates
- Transaction feed with live refresh

### Potential Phase 8: Enhanced Manual Data
- Additional custom fields
- Bulk data operations
- CSV import/export

### Potential Phase 9: Advanced Monitoring
- Performance metrics dashboard
- Error rate tracking
- User analytics

### Potential Phase 10: Production Hardening
- Rate limiting
- Enhanced logging
- Automated alerts
- Disaster recovery procedures

---

## References

- **Integration Plan:** `docs/INTEGRATION_PLAN.md` (UI repo)
- **Render Deployment:** `docs/render_deployment_guide.md`
- **Webhooks:** `docs/webhooks.md`
- **Database Migrations:** `docs/postgres_migration_plan.md`
- **Validation:** `docs/VALIDATION.md` (UI repo)
- **Troubleshooting:** `docs/TROUBLESHOOTING.md` (UI repo)

---

## Credits

**Requested by:** David Van Osdol (@dvanosdol88)  
**Implementation:** Devin AI  
**Repositories:**
- Backend: https://github.com/dvanosdol88/teller10-15A
- UI: https://github.com/dvanosdol88/teller-codex10-9-devinUI

**Devin Run:** https://app.devin.ai/sessions/ecf03294c0ae447285168cc1f221f58e
