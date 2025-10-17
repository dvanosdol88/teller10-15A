# Teller Cached Dashboard UI Verification — 2025-10-17

This report captures the baseline behavior of the `teller-codex10-9-devinUI/visual-only` frontend prior to any integration work. Each scenario lists the network activity observed (from the static server logs) and includes a full-page screenshot for reference.

## 1. Default visual-only experience
- **Setup:** Served with `python -m http.server` (no backend available). Navigated to `/index.html`.
- **Observed behavior:** The dashboard renders both demo accounts using only mock data. Only the static assets and a failing `GET /api/config` request were issued; no `/api/db/*` calls were attempted.
- **Network evidence:** Static server log shows requests for `index.html`, `styles.css`, `index.js`, and a `404` response for `/api/config`, with no additional API traffic.【b94b6b†L1-L26】
- **Screenshot artifact:** `browser:/invocations/cauzsnbz/artifacts/artifacts/default.png`

## 2. Backend flag enabled with backend unreachable
- **Setup:** Same static server. In the console `window.FEATURE_USE_BACKEND = true` followed by `init()`.
- **Observed behavior:** The UI attempted to fetch cached data (`/api/db/accounts`, balances, transactions, and manual data`) but gracefully fell back to the mock dataset when every call returned `404`.
- **Network evidence:** Server log records each `/api/db/*` request returning `404`, confirming retry-once behavior without breaking the UI.【61b37a†L1-L23】
- **Screenshot artifact:** `browser:/invocations/jhijspaz/artifacts/artifacts/backend_unreachable.png`

## 3. Backend reachable (mock service)
- **Setup:** Served via a temporary handler that returned canned JSON for `/api/config` and `/api/db/*` while still hosting the static assets.
- **Observed behavior:** The dashboard populated from the mocked backend responses, displaying the API-specific balances, transactions, and manual data strings.
- **Network evidence:** Log shows the full cascade of `/api/db/*` calls succeeding with `200` responses, indicating the frontend consumed backend data paths as documented.【e5f691†L1-L11】
- **Screenshot artifact:** `browser:/invocations/ntznrryb/artifacts/artifacts/backend_reachable.png`

These observations confirm the documented progressive enhancement path: mock data renders instantly, failures fall back gracefully, and valid backend responses override the defaults without issues.
