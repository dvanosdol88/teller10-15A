# Manual Data Implementation Plan - Cost-Optimized v1.1

## Overview

This document defines the implementation plan for adding manual data persistence to the Teller Cached Dashboard, incorporating approved cost-saving measures and backend consistency patterns to minimize complexity while delivering core functionality for a 2-user LLC scenario.

**Updated 2025-10-15:** Revised to align with existing backend authentication patterns and ensure consistent API semantics.

## Project Context

**Repositories:**
- Backend: `dvanosdol88/teller10-15A` (Falcon API + DB)
- Frontend: `dvanosdol88/teller-codex10-9-devinUI` (Static UI)

**Current State:**
- Working Teller integration fetching balances and transactions
- PostgreSQL database with users, accounts, balances, transactions tables
- Card-based UI with flip animation (balances front, transactions back)

**Goal:**
Add ability to manually enter and persist `rent_roll` values per account with minimal complexity and maximum reliability.

## Approved Cost-Savings Applied

### High-Impact Simplifications

1. **✅ Single manual type only**: Implement `rent_roll` only; other fields (cap_rate, property_value, etc.) deferred to phase 2
2. **✅ Modal editor**: Edit in a focused modal popup, not inline on card
3. **✅ Backend-only computation**: No client-side business logic; server handles all validation and storage
4. **✅ No overrides/adjustments**: rent_roll is a simple editable field with no computed value complexity
5. **✅ No optimistic updates**: Save → spinner → server response → re-render (blocking PUT, no autosave)
6. **✅ Stable minimal schema**: USD only, ISO date strings, no multi-currency or timezone handling
7. **✅ Single simple endpoint**: `PUT/GET /api/db/accounts/{id}/manual-data` (no data_type routing)
8. **✅ Same-origin only**: UI and API served together; relative `/api/...` paths (no CORS)

### Low-Impact Simplifications

9. **✅ No ETag in v1**: Last-write-wins; show "updated X ago" for awareness
10. **✅ Hardcoded form**: HTML form for rent_roll; defer schema-driven forms to phase 2
11. **✅ Simple toggle UI**: Use button toggle for Transactions/Manual Data (no tab framework)
12. **✅ No delete**: Only upsert; "clear" sends null value (soft-clear pattern)

## Scope Definition

### In Scope (Phase 1)

**Database:**
- New table: `manual_data` with columns:
  - `account_id` (PK, FK to accounts.id)
  - `rent_roll` (Numeric(18,2), nullable)
  - `updated_at` (DateTime)
  - `updated_by` (String, nullable - for future audit)

**Backend (teller10-15A):**
- Migration to create `manual_data` table
- Repository layer: `upsert_manual_data(account_id, rent_roll)`, `get_manual_data(account_id)`
- Resource: `ManualDataResource` (extends `BaseResource`) at `/api/db/accounts/{id}/manual-data`
  - `GET`: Return `{account_id, rent_roll, updated_at}` (always 200, nulls when no record)
  - `PUT`: Accept `{rent_roll: number|null}`, validate, upsert, return updated record
- Validation: rent_roll must be numeric or null, >= 0, rounded to 2 decimals
- Authentication: **Required** - uses existing `BaseResource.authenticate()` and Bearer token pattern
- Ownership check: Verify `account.user_id == authenticated_user.id` (404 if not owned)
- Feature flag: Add `FEATURE_MANUAL_DATA` to `/api/config` for UI toggle

**Frontend (teller-codex10-9-devinUI):**
- Feature flag: Check `FEATURE_MANUAL_DATA` from `/api/config` (hide UI if false)
- Update card back: toggle between "Transactions" and "Manual Data" views
- Manual Data view: displays current rent_roll value with "Edit" button
- Edit modal: simple form with `<input type="number" step="0.01" min="0">` for rent_roll
- Save flow: PUT with Bearer token → show spinner → re-fetch → close modal → update display
- Display "Last updated: X ago" timestamp when rent_roll exists
- Error handling: Show toast on 400/404/5xx, keep modal open for retry

**User Stories:**
- **P1**: As a user, I can view the current rent_roll value for an account
- **P1**: As a user, I can edit and save a rent_roll value for an account
- **P1**: As a user, I can clear the rent_roll value (set to null)
- **P2**: As a user, I see when rent_roll was last updated

### Out of Scope (Phase 1)

- Other manual data types (cap_rate, property_value, etc.)
- Computed fields or adjustments
- Concurrent edit protection (ETag/optimistic locking)
- Autosave or draft state
- Delete endpoint (only PUT with null)
- Multi-currency handling (USD only)
- Dynamic form schema engine
- Advanced audit trail (basic timestamp + updated_by included)

### Deferred to Phase 2

- Additional manual data types behind feature flags
- Schema-driven form generation
- Advanced validation rules
- User-specific permissions
- ETag-based conflict detection
- DELETE endpoint
- Multi-user audit trail

## Technical Design

### Database Schema

```sql
CREATE TABLE manual_data (
    account_id VARCHAR NOT NULL PRIMARY KEY,
    rent_roll NUMERIC(18, 2) NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by VARCHAR NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX ix_manual_data_updated_at ON manual_data(updated_at);
```

**Key decisions:**
- `TIMESTAMPTZ` with `DEFAULT now()` ensures automatic timestamp on insert and avoids timezone ambiguity
- `updated_at` must be explicitly set in application code on updates
- `ON DELETE CASCADE` ensures cleanup when accounts are removed

### API Contract

**Endpoint:** `/api/db/accounts/{account_id}/manual-data`

**Authentication:** Requires `Authorization: Bearer <access_token>` header (same as other `/api/db/*` endpoints)

**GET Response (200)** - Record exists:
```json
{
  "account_id": "acc_abc123",
  "rent_roll": 2500.00,
  "updated_at": "2025-10-15T14:30:00Z"
}
```

**GET Response (200)** - No record yet (nulls):
```json
{
  "account_id": "acc_abc123",
  "rent_roll": null,
  "updated_at": null
}
```

**GET Response (404)** - Account not found or not owned by authenticated user

**PUT Request:**
```json
{
  "rent_roll": 2500.00
}
```
Or to clear:
```json
{
  "rent_roll": null
}
```

**PUT Response (200):**
```json
{
  "account_id": "acc_abc123",
  "rent_roll": 2500.00,
  "updated_at": "2025-10-15T14:35:00Z"
}
```

**PUT Error (400)** - Validation failure:
```json
{
  "title": "Invalid request",
  "description": "rent_roll must be a non-negative number or null"
}
```

**PUT Error (404)** - Account not found or not owned

**Headers (all responses):**
- `Cache-Control: no-store` (consistent with other API endpoints)

### Frontend UI Flow

**Card Back Toggle:**
- Two buttons: [Transactions] [Manual Data]
- Default: Transactions view (existing behavior)
- Click "Manual Data" → show manual data panel

**Manual Data Panel:**
```
Manual Data
-----------
Rent Roll: $2,500.00
Last updated: 2 hours ago

[Edit]
```

**Edit Modal (opens on "Edit" click):**
```
Edit Manual Data
----------------
Rent Roll: [    2500.00    ]  (number input)

[Cancel] [Clear] [Save]
```

- Cancel: close modal, no changes
- Clear: set to null, save
- Save: PUT to endpoint, show spinner, wait for response, re-fetch, close

**Loading States:**
- Fetching: show skeleton/spinner in manual data panel
- Saving: disable form, show "Saving..." on button
- Error: show toast "Failed to save. Please try again."

### Backend Implementation Details

**Repository Layer (python/repository.py or similar):**
```python
from decimal import Decimal
from datetime import datetime, timezone

def get_manual_data(self, account_id: str) -> dict:
    """Fetch manual data for account, return dict with null defaults if not found.
    
    Returns:
        {account_id, rent_roll, updated_at} - rent_roll/updated_at are None if no record
    """
    record = session.query(ManualData).filter_by(account_id=account_id).first()
    if not record:
        return {"account_id": account_id, "rent_roll": None, "updated_at": None}
    return {
        "account_id": record.account_id,
        "rent_roll": record.rent_roll,
        "updated_at": record.updated_at
    }
    
def upsert_manual_data(self, account_id: str, rent_roll: Decimal | None) -> dict:
    """Insert or update manual data, return updated record.
    
    Validates and rounds rent_roll to 2 decimals. Sets updated_at to UTC now().
    """
    if rent_roll is not None:
        rent_roll = Decimal(str(rent_roll)).quantize(Decimal("0.01"))
        if rent_roll < 0:
            raise ValueError("rent_roll must be non-negative")
    
    record = session.query(ManualData).filter_by(account_id=account_id).first()
    if record:
        record.rent_roll = rent_roll
        record.updated_at = datetime.now(timezone.utc)
    else:
        record = ManualData(
            account_id=account_id,
            rent_roll=rent_roll,
            updated_at=datetime.now(timezone.utc)
        )
        session.add(record)
    session.flush()
    
    return {
        "account_id": record.account_id,
        "rent_roll": record.rent_roll,
        "updated_at": record.updated_at
    }
```

**Resource (python/resources.py):**
```python
class ManualDataResource(BaseResource):
    """Handles manual data for accounts (rent_roll, etc.)."""
    
    def on_get(self, req: Request, resp: Response, account_id: str) -> None:
        with self.session_scope() as session:
            repo = Repository(session)
            user = self.authenticate(req, repo)  # Bearer token required
            
            account = repo.get_account(account_id)
            if not account or account.user_id != user.id:
                raise falcon.HTTPNotFound()
            
            manual_data = repo.get_manual_data(account_id)
            resp.media = ensure_json_serializable(manual_data)
            LOGGER.info("db.manual_data.get %s", {"user_id": user.id, "account_id": account_id})
        
        self.set_no_cache(resp)
    
    def on_put(self, req: Request, resp: Response, account_id: str) -> None:
        body = req.media or {}
        rent_roll = body.get("rent_roll")
        
        # Validate rent_roll
        if rent_roll is not None:
            try:
                rent_roll = Decimal(str(rent_roll))
                if rent_roll < 0:
                    raise ValueError("negative value")
            except (ValueError, DecimalException):
                raise falcon.HTTPBadRequest(
                    "invalid-rent-roll",
                    "rent_roll must be a non-negative number or null"
                )
        
        with self.session_scope() as session:
            repo = Repository(session)
            user = self.authenticate(req, repo)
            
            account = repo.get_account(account_id)
            if not account or account.user_id != user.id:
                raise falcon.HTTPNotFound()
            
            manual_data = repo.upsert_manual_data(account_id, rent_roll)
            resp.media = ensure_json_serializable(manual_data)
            LOGGER.info(
                "db.manual_data.put %s", 
                {"user_id": user.id, "account_id": account_id, "rent_roll": rent_roll}
            )
        
        self.set_no_cache(resp)
```

**Key Implementation Points:**
- Extends `BaseResource` to inherit `authenticate()` and `session_scope()`
- Uses existing `ensure_json_serializable()` helper for Decimal → float conversion
- Follows same ownership check pattern as `CachedBalanceResource` and `CachedTransactionsResource`
- Always returns 200 with nulls for missing data (not 404)
- Sets `Cache-Control: no-store` like all other API endpoints
- Validates and rounds to 2 decimals using `Decimal.quantize()`
- Explicitly sets `updated_at` to UTC on every update

**Migration (Alembic):**
- Create `manual_data` table with `TIMESTAMPTZ` and `DEFAULT now()`
- Add foreign key constraint with `ON DELETE CASCADE`
- Add index on `updated_at`

### Frontend Implementation Details

**BackendAdapter additions (visual-only/index.js):**
```javascript
async fetchManualData(accountId) {
  // GET /api/db/accounts/{accountId}/manual-data
  // Headers: Authorization: Bearer ${token}
  // Return {account_id, rent_roll, updated_at}
  // Fallback to {account_id, rent_roll: null, updated_at: null} on error
}

async saveManualData(accountId, rentRoll) {
  // PUT /api/db/accounts/{accountId}/manual-data
  // Headers: Authorization: Bearer ${token}
  // Body: {rent_roll: rentRoll}
  // Return updated record or throw on error
}
```

**Authentication:**
- Use existing Bearer token from localStorage (same as balances/transactions fetches)
- No new auth mechanism required

**UI Components:**
- Feature flag check: Only show "Manual Data" toggle if `FEATURE_MANUAL_DATA === true`
- Toggle buttons on card back
- Manual data display panel
- Edit modal with form (`<input type="number" step="0.01" min="0">`)
- Timestamp formatter ("X ago" using simple time diff)

**State Management:**
- Keep manual data in memory per account
- Refetch on card flip to manual data view
- No localStorage caching (always fetch from server)
- Handle 401 same as other endpoints (prompt to reconnect)

## Backend Consistency Alignment

The following design decisions ensure this feature aligns with existing backend patterns in `teller10-15A`:

### Must-Have Consistency Items

1. **Status Code Semantics (200 vs 404)**
   - **Decision:** Always return `200` with nulls when no manual_data record exists
   - **Rationale:** Simplifies UI logic; "no record yet" is a valid state, not an error
   - **Pattern:** Return `{account_id, rent_roll: null, updated_at: null}`

2. **Authentication Required**
   - **Decision:** Require Bearer token and enforce ownership check
   - **Rationale:** Maintains API consistency; `BaseResource.authenticate()` already exists
   - **Pattern:** Same as `CachedBalanceResource` and `CachedTransactionsResource`
   - **Benefit:** Makes `updated_by` field usable for future audit features

3. **Timestamp Handling**
   - **Decision:** Use `TIMESTAMPTZ NOT NULL DEFAULT now()` in schema
   - **Rationale:** Avoids local-time ambiguity; ensures automatic insert timestamp
   - **Pattern:** Explicitly set `updated_at = datetime.now(timezone.utc)` on updates

### High-Value Additions

4. **Feature Flag**
   - **Decision:** Add `FEATURE_MANUAL_DATA` to `/api/config` response
   - **Rationale:** Enables instant UI toggle without redeployment
   - **Pattern:** Mirrors existing feature flag architecture

5. **Decimal Serialization**
   - **Decision:** Use existing `ensure_json_serializable()` helper
   - **Rationale:** Consistent with all other endpoints; handles Decimal → float conversion
   - **Pattern:** Already used in `CachedBalanceResource`, `LiveBalanceResource`, etc.

6. **Upsert Pattern**
   - **Decision:** One row per account (`account_id` as PK) with `ON DELETE CASCADE`
   - **Rationale:** Simple, performant, automatic cleanup when accounts removed
   - **Pattern:** Similar to `balances` table structure

## Implementation Phases

### Phase 1: Database & Backend (Foundation)

**Tasks:**
1. Create Alembic migration for `manual_data` table
2. Implement repository layer methods (get, upsert)
3. Add `ManualDataResource` to Falcon routes
4. Add validation logic
5. Write unit tests for repository and resource
6. Run migration locally and verify schema

**Acceptance:**
- Migration runs cleanly on SQLite and PostgreSQL
- Schema uses `TIMESTAMPTZ NOT NULL DEFAULT now()`
- Repository: `get_manual_data()` returns nulls when no record (not exception)
- Repository: `upsert_manual_data()` creates/updates, sets `updated_at` to UTC
- Repository: PUT with null clears rent_roll
- Repository: Validation rejects negative numbers, rounds to 2 decimals
- Resource: GET returns 200 with nulls for missing record (not 404)
- Resource: GET/PUT require Bearer token and enforce ownership (404 if not owned)
- Resource: Uses `ensure_json_serializable()` for response
- Resource: Sets `Cache-Control: no-store`
- Tests pass for all scenarios

### Phase 2: Frontend UI (Read-Only Display)

**Tasks:**
1. Add toggle buttons to card back
2. Create manual data display panel (read-only)
3. Wire BackendAdapter.fetchManualData()
4. Add "Last updated" timestamp display
5. Handle loading and error states
6. Test with mock data

**Acceptance:**
- Feature flag: Manual Data toggle only visible if `FEATURE_MANUAL_DATA === true`
- Toggle switches between Transactions and Manual Data
- Manual data panel shows rent_roll or "No data"
- Timestamp displays correctly ("X ago")
- Loading spinner shows while fetching
- Bearer token included in fetch request headers
- Graceful fallback on errors (401 prompts reconnect)

### Phase 3: Frontend Edit Modal

**Tasks:**
1. Create modal component with form
2. Wire to BackendAdapter.saveManualData()
3. Implement save flow (spinner, re-fetch, close)
4. Add "Clear" button logic
5. Add error toast on failure
6. Test save/clear/cancel flows

**Acceptance:**
- Modal opens on "Edit" click
- Form uses `<input type="number" step="0.01" min="0">`
- Client-side validation: non-negative numbers only
- Save sends PUT with Bearer token
- Save spinner disables form during request
- Clear button sends `{rent_roll: null}`
- Cancel discards changes without saving
- 400 errors show toast with validation message, keep modal open
- 401 errors prompt to reconnect
- Success closes modal and refreshes display

### Phase 4: Integration Testing & Polish

**Tasks:**
1. Test full flow end-to-end locally
2. Test with backend down (graceful fallback)
3. Test with multiple accounts
4. Verify Render deployment compatibility
5. Update INTEGRATION_PLAN.md with manual data notes
6. Update README with manual data feature

**Acceptance:**
- Full user flow works locally
- Backend errors don't crash UI
- Multiple accounts can each have manual data
- Ready for Render deployment
- Docs updated

## Rollout Strategy

### Local Development
1. Implement backend (Phase 1)
2. Run migration: `python python/teller.py migrate`
3. Test endpoints with curl/Postman
4. Implement frontend (Phases 2-3)
5. Test full integration
6. Commit to feature branch

### Render Deployment
1. Merge to main branch
2. Render auto-deploys backend
3. Run migration as one-off job or pre-deploy hook
4. Verify `/api/db/accounts/{id}/manual-data` endpoint
5. Frontend picks up changes (same-origin)
6. Validate in production with test account

### Rollback Plan
- Backend: revert migration, remove resource registration
- Frontend: toggle off manual data view (feature flag for phase 2)
- Database: manual_data table can remain (no harm if unused)

## Quality Gates

### Before Phase 1 Complete
- ✅ Migration tested on SQLite and PostgreSQL
- ✅ Repository tests pass
- ✅ Endpoint returns correct JSON shapes
- ✅ Validation rules enforced

### Before Phase 2 Complete
- ✅ UI renders manual data panel
- ✅ Toggle switches views correctly
- ✅ No console errors on load
- ✅ Graceful handling of missing data

### Before Phase 3 Complete
- ✅ Modal form works correctly
- ✅ Save/clear/cancel flows tested
- ✅ Error handling verified
- ✅ No data loss on errors

### Before Production Deployment
- ✅ Full integration test completed
- ✅ Migration tested on production-like DB
- ✅ Docs updated
- ✅ Rollback plan verified

## Success Criteria

**Functional:**
- Users can view, edit, and clear rent_roll for any account
- Data persists across sessions and refreshes
- UI shows last updated timestamp
- Errors handled gracefully without data loss

**Technical:**
- No CORS issues (same-origin architecture)
- Migration runs cleanly in all environments
- Endpoint response times < 200ms (simple queries)
- No N+1 query issues

**Operational:**
- 2-user scenario works smoothly
- No concurrent edit conflicts expected (last-write-wins acceptable)
- Clear rollback path documented
- Simple enough for future extension

## Testing Checklist (Minimal but Complete)

### Repository Layer Tests
- ✅ `get_manual_data()` returns nulls for non-existent account_id
- ✅ `get_manual_data()` returns correct data for existing record
- ✅ `upsert_manual_data()` creates new record with valid rent_roll
- ✅ `upsert_manual_data()` updates existing record
- ✅ `upsert_manual_data()` rounds to 2 decimals (e.g., 2500.999 → 2501.00)
- ✅ `upsert_manual_data()` rejects negative rent_roll
- ✅ `upsert_manual_data()` accepts null to clear
- ✅ `updated_at` set to UTC on create and update

### Resource Layer Tests
- ✅ GET returns 200 with nulls when no record exists
- ✅ GET returns 200 with data when record exists
- ✅ GET returns 404 when account doesn't exist
- ✅ GET returns 404 when account not owned by authenticated user
- ✅ GET returns 401 when no Bearer token provided
- ✅ PUT creates/updates record successfully
- ✅ PUT returns 400 for negative rent_roll
- ✅ PUT returns 400 for invalid (non-numeric) rent_roll
- ✅ PUT returns 404 for non-existent account
- ✅ PUT returns 404 when account not owned
- ✅ PUT returns 401 when no Bearer token
- ✅ PUT accepts null to clear rent_roll
- ✅ All responses include `Cache-Control: no-store`
- ✅ Response uses `ensure_json_serializable()` (Decimal → float)

### UI Tests (Manual)
- ✅ Manual Data toggle hidden when `FEATURE_MANUAL_DATA === false`
- ✅ Manual Data toggle visible when `FEATURE_MANUAL_DATA === true`
- ✅ Fetch includes Bearer token in Authorization header
- ✅ Display shows "No data" when rent_roll is null
- ✅ Display shows formatted currency when rent_roll exists
- ✅ Timestamp shows "X ago" correctly
- ✅ Edit modal opens with current value pre-filled
- ✅ Save button disabled during save (spinner shown)
- ✅ Clear button sends null successfully
- ✅ Cancel button closes modal without saving
- ✅ 400 error shows toast, keeps modal open
- ✅ 401 error prompts to reconnect
- ✅ Success refreshes display and closes modal

## Future Enhancements (Post-Phase 1)

**Phase 2 Candidates:**
- Additional manual data fields (cap_rate, property_value, notes)
- Feature flags per data type
- Schema-driven form generation
- Field-level permissions
- Audit history (who changed what when)
- ETag-based optimistic locking
- Export manual data to CSV
- Bulk import from spreadsheet

## References

- Tradeoff Assessment: Session b3252cefb26e46849bc65422fca5a8fc
- Constitution: `/home/ubuntu/repos/teller10-15A/constitution.md`
- Integration Plan: `/home/ubuntu/repos/teller-codex10-9-devinUI/docs/INTEGRATION_PLAN.md`
- Backend Repo: https://github.com/dvanosdol88/teller10-15A
- Frontend Repo: https://github.com/dvanosdol88/teller-codex10-9-devinUI

## Appendix: Cost Savings Summary

| Simplification | Complexity Reduction | What We Give Up |
|---------------|---------------------|-----------------|
| Single field (rent_roll only) | ~50% less work upfront | Other manual fields need phase 2 |
| Modal editor | No complex card-state sync | Extra click to edit |
| Backend-only computation | No duplicate logic in JS | N/A (we have no computation) |
| No overrides/adjustments | No toggle/restore logic | N/A (simple field) |
| No optimistic updates | Zero client state sync | Slight delay on save |
| USD/ISO only | No localization logic | Manual conversion for non-USD |
| Single endpoint | One route vs many | Less RESTful routing |
| Same-origin only | Zero CORS complexity | Can't split hosts |
| No ETag | No conflict detection code | 2 users unlikely to collide |
| Hardcoded form | No schema engine | HTML change to add fields |
| Toggle not tabs | Less CSS/JS framework | Simpler UI pattern |
| No delete endpoint | Simpler permissions | Soft-clear only |

**Net Result:** ~60% reduction in initial complexity while delivering 100% of P1 user value.

---

**Version:** 1.1.0  
**Created:** 2025-10-15  
**Updated:** 2025-10-15 (Backend consistency alignment)  
**Author:** David Van Osdol (@dvanosdol88)  
**Devin Session:** https://app.devin.ai/sessions/166f3d0bf2f641e9b934b186a9454859

## Changelog

### v1.1.0 (2025-10-15)
**Backend Consistency Fixes:**
- Changed GET semantics: Always return 200 with nulls (not 404) for missing records
- Added authentication requirement: Bearer token + ownership check (aligns with existing resources)
- Updated schema: `TIMESTAMPTZ NOT NULL DEFAULT now()` instead of `TIMESTAMP`
- Added explicit `updated_at` setting to UTC in repository upsert logic
- Specified use of `ensure_json_serializable()` helper for Decimal conversion
- Added `FEATURE_MANUAL_DATA` to `/api/config` for UI toggle
- Enhanced testing checklist with auth/ownership/validation scenarios
- Documented detailed implementation code patterns matching existing backend

**Rationale:** Maintain consistency with existing `BaseResource`, `CachedBalanceResource`, and `CachedTransactionsResource` patterns to avoid future surprises and technical debt.

### v1.0.0 (2025-10-15)
- Initial plan with 12 approved cost-saving simplifications
- Rent_roll only, modal editor, no optimistic updates, last-write-wins
- ~60% complexity reduction vs original scope
