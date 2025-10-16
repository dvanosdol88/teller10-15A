# Render Deployment Instructions for teller10-15A
**Date:** October 16, 2024  
**For:** Dev-Ops Team  
**Repository:** https://github.com/dvanosdol88/teller10-15A

---

## Overview

You will be deploying the updated Teller backend (`teller10-15A`) to Render. This replaces the old backend (`teller-codex10-9A`) while reusing the existing PostgreSQL database.

**What's New:**
- Phase 4/5 backend integration with `FEATURE_USE_BACKEND` flag
- Runtime toggling of backend data integration
- New comprehensive documentation

---

## Prerequisites

Before starting, gather these items:

1. **GitHub Repository Access**
   - Repository: `dvanosdol88/teller10-15A`
   - Branch: `main` (recently merged PR #4)

2. **Render Account Access**
   - Dashboard: https://dashboard.render.com
   - Organization: [Your Render account]

3. **Existing Database Credentials** (you provided these):
   - Database name: `teller_codex10_9a_db`
   - Database user: `teller_codex10_9a_db_user`
   - Internal hostname: `dpg-d3n27v8dl3ps73foailg-a`
   - Port: `5432`
   - Internal Database URL: [You have this - keep it secure]

4. **Teller API Credentials** (required):
   - Application ID
   - Certificate (PEM format)
   - Private Key (PEM format)
   - Environment: `development` or `production`

---

## Step-by-Step Deployment

### Step 1: Create New Web Service in Render

1. Log into Render Dashboard: https://dashboard.render.com

2. Click **"New +"** → **"Web Service"**

3. **Connect Repository:**
   - Choose **"Build and deploy from a Git repository"**
   - Click **"Connect account"** if GitHub isn't connected
   - Select repository: `dvanosdol88/teller10-15A`
   - Click **"Connect"**

4. **Configure Service Settings:**

   | Field | Value |
   |-------|-------|
   | **Name** | `teller10-15a` (or your preferred name) |
   | **Region** | Same as your database (for performance) |
   | **Branch** | `main` |
   | **Root Directory** | (leave blank) |
   | **Environment** | `Python 3` |
   | **Build Command** | `pip install -r python/requirements.txt` |
   | **Start Command** | `python python/teller.py` |
   | **Plan** | Choose your preferred plan (Starter or higher) |

5. Click **"Advanced"** to expand advanced settings

---

### Step 2: Configure Environment Variables

In the **Environment Variables** section, add the following:

#### Required Variables

| Key | Value | Notes |
|-----|-------|-------|
| `TELLER_APPLICATION_ID` | `[Your Teller App ID]` | From Teller dashboard |
| `TELLER_ENVIRONMENT` | `development` or `production` | Match your Teller setup |
| `TELLER_CERTIFICATE` | `[Your Certificate PEM content]` | Full PEM content including header/footer |
| `TELLER_PRIVATE_KEY` | `[Your Private Key PEM content]` | Full PEM content including header/footer |
| `DATABASE_INTERNAL_URL` | `[Your Internal Database URL]` | The one you provided above |
| `DATABASE_SSLMODE` | `require` | For secure database connection |
| `TELLER_APP_API_BASE_URL` | `/api` | Default API base path |
| `PORT` | `8001` | Port for the service (Render sets this) |

#### Feature Flags (New!)

| Key | Value | Notes |
|-----|-------|-------|
| `FEATURE_USE_BACKEND` | `false` | **Start with false for safety!** Set to `true` when ready |
| `FEATURE_MANUAL_DATA` | `true` | Enable manual data fields |

#### Optional (if using webhooks)

| Key | Value | Notes |
|-----|-------|-------|
| `TELLER_WEBHOOK_SECRETS` | `[comma-separated secrets]` | From Teller webhook settings |
| `TELLER_WEBHOOK_TOLERANCE_SECONDS` | `180` | Signature timestamp tolerance |

**Important Notes:**
- Certificate and Private Key: Copy the entire PEM content including `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----` lines
- Keep Database URL exactly as provided (starts with `postgresql://` or `postgres://`)
- Double-check there are no extra spaces or line breaks in credentials

---

### Step 3: Connect to Existing Database

1. In the same **Advanced** section, find **"Add from Database"**

2. Click **"Add from Database"** (NOT "Add Disk")

3. Select your existing database: `teller_codex10_9a_db`

4. Render will automatically add `DATABASE_URL` environment variable

5. **Verify:** You should now see both:
   - `DATABASE_INTERNAL_URL` (you manually added)
   - `DATABASE_URL` (auto-added by Render)

**Note:** The application prioritizes `DATABASE_INTERNAL_URL` over `DATABASE_URL` for internal connections.

---

### Step 4: Create the Service

1. Review all settings one more time

2. Click **"Create Web Service"** at the bottom

3. Render will start the build process:
   - Installing dependencies
   - Building the application
   - Starting the service

4. **First deployment will fail** - this is expected! We need to run migrations first.

---

### Step 5: Run Database Migrations (Critical!)

The database schema needs to be updated before the service can start properly.

**Option A: One-off Job (Recommended)**

1. In your service dashboard, click **"Shell"** tab

2. Or click **"Manual Deploy"** → **"Run Command"**

3. Run this command:
   ```bash
   python python/teller.py migrate
   ```

4. Wait for it to complete (should show "Database migrations completed successfully")

**Option B: From Local Machine (Alternative)**

If you have the External Database URL:

```bash
# On your local machine
git clone https://github.com/dvanosdol88/teller10-15A.git
cd teller10-15A
python3 -m venv .venv
source .venv/bin/activate
pip install -r python/requirements.txt

export DATABASE_INTERNAL_URL="[Your External Database URL]"
python python/teller.py migrate
```

---

### Step 6: Redeploy the Service

1. After migrations complete, go back to your service dashboard

2. Click **"Manual Deploy"** → **"Deploy latest commit"**

3. Wait for deployment to complete

4. Check the **Logs** tab for any errors

5. Look for: `"Listening on http://0.0.0.0:8001"`

---

### Step 7: Verify Deployment

1. **Check Health Endpoint:**
   - Find your service URL: `https://[your-service-name].onrender.com`
   - Visit: `https://[your-service-name].onrender.com/api/healthz`
   - Should return: `{"status": "ok", "environment": "development"}`

2. **Check Config Endpoint:**
   - Visit: `https://[your-service-name].onrender.com/api/config`
   - Should return JSON with:
     ```json
     {
       "applicationId": "...",
       "environment": "development",
       "apiBaseUrl": "/api",
       "FEATURE_MANUAL_DATA": true,
       "FEATURE_USE_BACKEND": false
     }
     ```

3. **Check Logs:**
   - Go to **Logs** tab in Render dashboard
   - Look for any errors or warnings
   - Should see successful database connection messages

---

### Step 8: Enable Backend Integration (When Ready)

**Only do this after verifying the service is running correctly!**

1. Go to **Environment** tab in your service dashboard

2. Find `FEATURE_USE_BACKEND` variable

3. Change value from `false` to `true`

4. Click **"Save Changes"**

5. Service will automatically restart

6. Verify the config endpoint now returns:
   ```json
   {
     ...
     "FEATURE_USE_BACKEND": true
   }
   ```

---

### Step 9: Update Frontend (if needed)

If you have a separate UI deployment:

1. Update the UI to point to the new backend URL:
   - Update any environment variables
   - Update API base URL configuration

2. The UI (from `teller-codex10-9-devinUI` repo) should automatically:
   - Read the `/api/config` endpoint
   - Detect `FEATURE_USE_BACKEND: true`
   - Switch from mock data to real backend data

---

## Troubleshooting

### Service Won't Start

**Check:**
1. Logs tab for specific error messages
2. All environment variables are set correctly
3. Database migrations completed successfully
4. Certificate and Private Key are valid PEM format

**Common Issues:**
- Missing `TELLER_APPLICATION_ID` → Add the variable
- Database connection failed → Check `DATABASE_INTERNAL_URL` is correct
- Certificate errors → Verify PEM content includes header/footer lines
- Migration not run → Run `python python/teller.py migrate`

### `/api/config` Returns 404

- Service hasn't started properly
- Check logs for startup errors
- Verify Start Command is: `python python/teller.py`

### Database Connection Errors

```
Error: could not connect to server
```

**Solutions:**
1. Verify `DATABASE_INTERNAL_URL` is correct
2. Check `DATABASE_SSLMODE=require` is set
3. Ensure database and service are in same region
4. Verify database is running (check database dashboard)

### FEATURE_USE_BACKEND Not Working

1. Verify environment variable is set to `true` (lowercase)
2. Check service restarted after changing variable
3. Visit `/api/config` to confirm it returns `true`
4. Check UI is reading from correct backend URL

---

## Rollback Plan

If something goes wrong:

### Quick Rollback (Keep New Service)

1. Set `FEATURE_USE_BACKEND=false` in environment variables
2. Service restarts automatically
3. UI reverts to static/mock data behavior
4. No data loss, no downtime

### Full Rollback (Revert to Old Service)

1. Keep old service (`teller-codex10-9A`) running
2. Don't delete it until new service is fully verified
3. Point UI back to old service URL if needed
4. Database is unchanged - safe to revert anytime

---

## Post-Deployment Checklist

- [ ] Service is running and healthy (`/api/healthz` returns 200)
- [ ] Config endpoint works (`/api/config` returns expected JSON)
- [ ] Database migrations completed successfully
- [ ] All environment variables are set
- [ ] `FEATURE_USE_BACKEND` is set to desired value
- [ ] Logs show no errors
- [ ] UI can connect to backend (if frontend is deployed)
- [ ] Test enrollment flow works (connect a test bank account)
- [ ] Test cached data endpoints return data
- [ ] Old service (`teller-codex10-9A`) kept running as backup

---

## Important Files & Documentation

- **Integration Phases:** `docs/20251016_INTEGRATION_PHASES.md`
- **Main README:** `README.md`
- **Render Guide:** `docs/render_deployment_guide.md`
- **Webhooks:** `docs/webhooks.md`
- **Tests:** `tests/` directory

---

## Support & Questions

- **Repository:** https://github.com/dvanosdol88/teller10-15A
- **Recent PR:** https://github.com/dvanosdol88/teller10-15A/pull/4
- **Devin Session:** https://app.devin.ai/sessions/ecf03294c0ae447285168cc1f221f58e

For questions, check the documentation files or contact the development team.

---

## Security Notes

- Never commit certificates or private keys to repository
- Keep database URLs secure
- Use Render's secret management for sensitive values
- Set `DATABASE_SSLMODE=require` for secure database connections
- Keep `FEATURE_USE_BACKEND=false` until ready to enable

---

**Good luck with the deployment!** 🚀
