# Teller Sample Application Hardening Plan

## Context update (October 2024)
The app now targets two trusted household users with no concurrent editing. That lets us trade deep enterprise
controls for pragmatic safeguards that keep the dashboard stable, protect credentials from casual disclosure, and stay
simple to operate on Render. The roadmap below preserves the wins already landed, highlights the lightweight measures
that still matter, and tracks the heavier items as "stretch" improvements should the risk profile change later.

## Baseline in place ✅
- [x] **Production-ready HTTP server.** Waitress has replaced the development WSGI server so the app is safe to expose on
  the public internet without manual babysitting.
- [x] **Runtime configuration from the environment.** Teller identifiers and API URLs are loaded via environment
  variables rather than compiled into the frontend bundle.
- [x] **Read-only `/api/config`.** The frontend pulls runtime configuration at startup, so deployments can change values
  without a rebuild.
- [x] **Secrets live outside the repo.** Teller credentials and database DSNs are sourced from environment variables or
  secret storage; nothing sensitive is committed.
- [x] **PostgreSQL migration path.** Alembic migrations and configuration are ready for the managed database instance.

## High-value, low-effort follow ups (Recommended)
- [ ] **Lightweight access gate.** Keep the new 4-digit passcode gate active so casual visitors cannot read cached
  financial data. (Complete once the overlay ships.)
- [ ] **Schema validation on enrollments.** Use a small validation library (e.g., `marshmallow` or `pydantic`) to reject
  malformed payloads. Even for two users, this closes off easy ways to corrupt stored enrollments.
- [ ] **Tame client token exposure.** Remove the access token from `localStorage` and the status panel when practical;
  storing it only in memory keeps the risk of shoulder surfing or saved browser state low without extra backend work.
- [ ] **Friendly health probe and structured logs.** Emit a basic JSON line per request and expose `/api/healthz` for
  Render monitoring. This improves operability without complex tooling.

## Nice-to-have (Stretch goals if risk increases)
- [ ] **Encrypt stored Teller access tokens.** Useful if the database ever lives outside the home network or the user
  count grows beyond a couple of trusted people.
- [ ] **Add rate limiting on sensitive endpoints.** Helps when deploying to the open internet, but can be deferred while
  access is invitation-only.
- [ ] **Security headers and TLS tuning.** Rely on Render's defaults for now; add explicit HSTS/CSP/X-Frame-Options only
  if the app is embedded elsewhere.
- [ ] **Dockerfile & full CI/CD hardening.** Keep this on the backlog until we need reproducible builds or automated
  scanning.
- [ ] **Backup/restore drills and incident runbooks.** Document lightweight manual procedures instead of formal playbooks
  unless the deployment scope grows.

## How to use this plan
1. Focus on the "High-value" section until every checkbox is complete.
2. Revisit the "Stretch goals" only if the threat model expands (more users, broader access, or regulatory pressure).
3. Update this document whenever scope or requirements change so it continues to reflect deliberate, right-sized
   safeguards rather than an aspirational wish list.
