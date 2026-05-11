# MIKE Handoff: Dashboard Shows All Zeros

**Date:** 2026-05-11  
**From:** Claude (session with Jeremiah)  
**Priority:** HIGH — the Command Center is live but non-functional  
**Owner:** jeremiahvanwagner@gmail.com

---

## TL;DR

The OpenClaw Portfolio Operations dashboard at `openclaw-dashboard.vercel.app` shows **all zeros** for every metric (Total Agents, Active Agents, Business Scopes, Dedicated GHL Scopes, Automation Target, Events/Hour). The data is confirmed present in DB1 — **109 agents (103 active), 108 events, 10 businesses**. The problem is between Vercel and the deployed code/config.

---

## What Was Done This Session

### Database (DB1 = `aagqvfwuixpxtdcrdxmv` — CONFIRMED HEALTHY)

| Item | Status |
|------|--------|
| `agents` table | 109 rows, 103 active, 6 inactive |
| `agent_events` table | 108 rows |
| `business_registry` table | 10 rows (seeded this session) |
| AI engine tables (`projects`, `generated_content`, `email_logs`, `assets`, `ghl_sync`) | Created this session via migration |
| `healing_circuit_breaker` RLS | Enabled this session (was the only table missing RLS) |
| RLS on `agents` / `agent_events` | Service-role-only policy — working as designed |

### Code Changes (committed & pushed)

**`openclaw` repo — commit `c2390a7` on `main`:**
- `dashboard/app/page.tsx` — Removed direct Supabase anon-key queries. Now fetches from `/api/dashboard` and `/api/portfolio` server routes (which use service role key).
- `dashboard/app/api/portfolio/route.ts` — Replaced 503 stub with real handler that queries `business_registry` via `getServiceSupabase()`.
- `dashboard/vercel.json` — Removed `"git": { "deploymentEnabled": false }` that was blocking auto-deploys.

**`tjb-umbrella` repo — commit `58a2265` on `main`:**
- `supabase/migrations/20260511000000_fix_healing_circuit_breaker_rls.sql` — New migration
- `supabase/seed.sql` — 10-business seed file for `business_registry`

---

## Why It's Still Broken — Suspects in Priority Order

### 1. `/api/dashboard` returns 403 because `DASHBOARD_ADMIN_EMAILS` is missing or wrong

This is the **most likely** cause.

**The auth chain:**
```
page.tsx → fetch("/api/dashboard")
  → route.ts → requireAdminUser()
    → requireAuthenticatedUser()  // reads Supabase auth cookie → gets user
    → isUserAdmin(user)           // checks DASHBOARD_ADMIN_EMAILS env var
      → if user.email NOT in that var → returns null → route returns 403
```

**`page.tsx` behavior on 403:** Sets `errorMessage` state but continues rendering — all metric cards fall through to `?? 0` defaults. The error banner renders at the top of the page but could be missed if it's subtle or the screenshot cropped it.

**Fix:** In Vercel project settings → Environment Variables, set:
```
DASHBOARD_ADMIN_EMAILS = jeremiahvanwagner@gmail.com
```
Must match the email on the Supabase auth account exactly (case-insensitive, but must be the same address).

### 2. `SUPABASE_SERVICE_ROLE_KEY` is missing or wrong in Vercel

Even if admin auth passes, the data queries use `getServiceSupabase()` which tries keys in this order:
1. `SUPABASE_SERVICE_ROLE_KEY`
2. `SUPABASE_SERVICE_KEY`
3. `SUPABASE_ANON_KEY`
4. `NEXT_PUBLIC_SUPABASE_ANON_KEY`

If only the anon key is set, `getServiceSupabase()` will use it — but RLS on `agents` and `agent_events` only allows `service_role`. The anon key will return 0 rows (no error, just empty results). This produces exactly the "all zeros, no error banner" symptom.

**Fix:** In Vercel env vars, set:
```
SUPABASE_SERVICE_ROLE_KEY = <the service_role key from Supabase DB1 project aagqvfwuixpxtdcrdxmv>
```

Get it from: Supabase Dashboard → Project `aagqvfwuixpxtdcrdxmv` → Settings → API → `service_role` (secret).

### 3. Vercel root directory is wrong

The `openclaw` repo is a monorepo. The Next.js dashboard lives in `dashboard/`. If Vercel's "Root Directory" setting is `./` (the repo root), the build either fails or deploys the wrong thing.

**Fix:** Vercel project settings → General → Root Directory → set to `dashboard`

### 4. Vercel hasn't deployed commit `c2390a7`

Earlier screenshots showed commit `77a7bc6` deployed. The fix commit is `c2390a7`. If `deploymentEnabled: false` was cached or the push didn't trigger a deploy, Vercel is running old code that still queries Supabase directly with the anon key.

**Fix:** Go to Vercel → Deployments → verify the latest deployment is from commit `c2390a7`. If not, trigger a manual redeploy from the `main` branch.

---

## Required Vercel Environment Variables

All of these must be set in the Vercel project for the dashboard to function:

| Variable | Value | Where to get it |
|----------|-------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://aagqvfwuixpxtdcrdxmv.supabase.co` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (anon/public key) | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (service_role secret key) | Supabase → Settings → API → service_role |
| `DASHBOARD_ADMIN_EMAILS` | `jeremiahvanwagner@gmail.com` | Static config |

**Optional but helpful:**
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Fallback for server-side URL resolution |

---

## Diagnostic Steps

### Quick browser check (takes 30 seconds)
1. Open the deployed dashboard in Chrome
2. Open DevTools → Network tab
3. Reload the page
4. Look for requests to `/api/dashboard` and `/api/portfolio`
5. Check the response status codes:
   - **403** on `/api/dashboard` → `DASHBOARD_ADMIN_EMAILS` is the problem
   - **500** on `/api/dashboard` → `SUPABASE_SERVICE_ROLE_KEY` is missing or invalid
   - **200** with `totalAgents: 0` → anon key is being used instead of service role (RLS filtering)
   - **200** with `totalAgents: 109` → data is flowing; check if the page is rendering it

### Vercel function logs
1. Vercel Dashboard → Project → Deployments → latest → Function Logs
2. Filter for `/api/dashboard` and `/api/portfolio`
3. Look for error messages from `getServiceSupabase()` or `requireAdminUser()`

### Direct API test (if you have Vercel CLI or curl access)
```bash
# After logging in and getting cookies:
curl -v https://openclaw-dashboard.vercel.app/api/portfolio
curl -v https://openclaw-dashboard.vercel.app/api/dashboard
```

---

## Architecture Reference

```
User Browser
  ├── GET / (page.tsx - client component)
  │     ├── fetch("/api/portfolio")  →  portfolio/route.ts  →  getServiceSupabase()  →  DB1.business_registry
  │     └── fetch("/api/dashboard")  →  dashboard/route.ts  →  requireAdminUser() + getServiceSupabase()  →  DB1.agents + DB1.agent_events
  │
  ├── Auth: Supabase Auth via middleware.ts (cookie-based, anon key)
  │         middleware checks auth on all routes except /login, /auth/*
  │
  └── Admin gate: /api/dashboard requires isUserAdmin(user)
                  Checks DASHBOARD_ADMIN_EMAILS env var (comma-separated)
                  OR user_metadata/app_metadata roles = admin|owner|super_admin
```

**Key insight:** The middleware auth (line 46-59 of `middleware.ts`) does NOT gate `/api/dashboard` or `/api/portfolio` as admin-only. Those paths are not in `ADMIN_ONLY_PREFIXES`. BUT `/api/dashboard/route.ts` itself calls `requireAdminUser()` at line 21 and returns 403 if it fails. `/api/portfolio/route.ts` does NOT require admin — it just needs a working service role key.

So if **only** the portfolio card is showing data but agents/events are zero → admin auth is the issue.  
If **everything** is zero → service role key is missing (or Vercel hasn't deployed the fix yet).

---

## Files That Matter

| File | Role |
|------|------|
| `dashboard/app/page.tsx` | Main dashboard UI, fetches `/api/dashboard` + `/api/portfolio` |
| `dashboard/app/api/dashboard/route.ts` | Server route: agents + events (requires admin) |
| `dashboard/app/api/portfolio/route.ts` | Server route: business_registry (no admin required) |
| `dashboard/lib/server-auth.ts` | `getServiceSupabase()` + `requireAdminUser()` |
| `dashboard/lib/admin.ts` | `isUserAdmin()` — checks `DASHBOARD_ADMIN_EMAILS` |
| `dashboard/middleware.ts` | Auth gate (redirects to /login if not authenticated) |
| `dashboard/app/supabase-server.ts` | Server-side Supabase client (uses anon key + cookies for auth) |
| `dashboard/vercel.json` | Minimal — just schema ref, no overrides |

---

## What NOT To Do

- **Do NOT change RLS policies.** The service-role-only policy on `agents` is correct and intentional — agent configs contain model IDs, escalation paths, and potentially sensitive data. The fix is using the service role key server-side, not opening up RLS.
- **Do NOT re-seed or re-create agents.** All 109 agents are present and correct in DB1.
- **Do NOT touch the VPS (177.7.32.224).** The webhook/API gateway (Caddy + systemd on port 18789/8788) is separate from the dashboard and is working fine.
- **Do NOT connect `tjb-umbrella` repo to Vercel.** The dashboard code lives in `openclaw/dashboard/`. The `tjb-umbrella` repo is for Supabase migrations only.

---

## Expected End State

After fixing the Vercel config, the dashboard should show:
- **Total Agents:** 109
- **Active Agents:** 103 (~95% healthy)
- **Business Scopes:** 10
- **Dedicated GHL Scopes:** 0 (all 10 businesses use shared/incubator/internal scopes)
- **Automation Target:** 86% (portfolio average)
- **Events/Hour:** varies (108 total events in DB)
- **Division Status:** D1–D9 cards with agent counts
- **Business Scope Map:** 10 cards with scope family badges (shared/internal)
- **Recent Agent Activity:** 8 most recent heartbeats
- **System Health:** Event success rate bar
