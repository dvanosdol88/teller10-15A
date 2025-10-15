# Manual Data Implementation Plan - Cost-Optimized v1

## Overview

This document defines the implementation plan for adding manual data persistence to the Teller Cached Dashboard, incorporating approved cost-saving measures to minimize complexity while delivering core functionality for a 2-user LLC scenario.

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
- Resource: `ManualDataResource` at `/api/db/accounts/{id}/manual-data`
  - `GET`: Return `{rent_roll: Decimal|null, updated_at: ISO8601|null}`
  - `PUT`: Accept `{rent_roll: number|null}`, validate, upsert, return updated record
- Validation: rent_roll must be numeric or null, no negative values
- No authentication required (2-user trusted scenario)

**Frontend (teller-codex10-9-devinUI):**
- Update card back: toggle between "Transactions" and "Manual Data" views
- Manual Data view: displays current rent_roll value with "Edit" button
- Edit modal: simple form with single number input for rent_roll
- Save flow: PUT → show spinner → re-fetch → close modal → update display
- Display "Last updated: X ago" timestamp when rent_roll exists

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
- Multi-currency or timezone handling
- Dynamic form schema engine
- User authentication/authorization
- Audit trail beyond single timestamp

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
    updated_at TIMESTAMP NOT NULL,
    updated_by VARCHAR NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX ix_manual_data_updated_at ON manual_data(updated_at);
```

### API Contract

**Endpoint:** `/api/db/accounts/{account_id}/manual-data`

**GET Response (200):**
```json
{
  "account_id": "acc_abc123",
  "rent_roll": 2500.00,
  "updated_at": "2025-10-15T14:30:00Z"
}
```

**GET Response (404):** No manual data exists for account
```json
{
  "account_id": "acc_abc123",
  "rent_roll": null,
  "updated_at": null
}
```

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

**PUT Error (400):**
```json
{
  "error": "rent_roll must be a non-negative number or null"
}
```

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
def get_manual_data(session, account_id: str) -> dict:
    """Fetch manual data for account, return dict with null defaults if not found"""
    
def upsert_manual_data(session, account_id: str, rent_roll: Decimal | None) -> dict:
    """Insert or update manual data, return updated record"""
```

**Resource (python/resources.py):**
```python
class ManualDataResource:
    def on_get(self, req, resp, account_id):
        # Fetch from repo, return JSON
        
    def on_put(self, req, resp, account_id):
        # Validate payload
        # Call repo upsert
        # Return updated JSON
```

**Validation:**
- rent_roll must be: numeric (Decimal) or None
- If numeric: >= 0 (no negative rents)
- Round to 2 decimal places

**Migration (Alembic):**
- Create `manual_data` table
- Add foreign key constraint with CASCADE delete
- Add index on `updated_at`

### Frontend Implementation Details

**BackendAdapter additions (visual-only/index.js):**
```javascript
async fetchManualData(accountId) {
  // GET /api/db/accounts/{accountId}/manual-data
  // Return {rent_roll, updated_at} or fallback to {rent_roll: null, updated_at: null}
}

async saveManualData(accountId, rentRoll) {
  // PUT /api/db/accounts/{accountId}/manual-data
  // Body: {rent_roll: rentRoll}
  // Return updated record
}
```

**UI Components:**
- Toggle buttons on card back
- Manual data display panel
- Edit modal with form
- Timestamp formatter ("X ago" using simple time diff)

**State Management:**
- Keep manual data in memory per account
- Refetch on card flip to manual data view
- No localStorage caching (always fetch from server)

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
- GET returns null defaults for new accounts
- PUT creates/updates records
- PUT with null clears rent_roll
- Validation rejects negative numbers
- Tests pass

### Phase 2: Frontend UI (Read-Only Display)

**Tasks:**
1. Add toggle buttons to card back
2. Create manual data display panel (read-only)
3. Wire BackendAdapter.fetchManualData()
4. Add "Last updated" timestamp display
5. Handle loading and error states
6. Test with mock data

**Acceptance:**
- Toggle switches between Transactions and Manual Data
- Manual data panel shows rent_roll or "No data"
- Timestamp displays correctly
- Loading spinner shows while fetching
- Graceful fallback on errors

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
- Form validates numeric input
- Save updates backend and UI
- Clear sets to null
- Cancel discards changes
- Errors show toast, keep modal open

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

**Version:** 1.0.0  
**Created:** 2025-10-15  
**Author:** David Van Osdol (@dvanosdol88)  
**Devin Session:** https://app.devin.ai/sessions/166f3d0bf2f641e9b934b186a9454859
