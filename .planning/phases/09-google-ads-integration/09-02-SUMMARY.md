---
phase: 09-google-ads-integration
plan: "02"
subsystem: auth
tags: [google-ads, oauth, express, tdd]

# Dependency graph
requires:
  - phase: 09-01
    provides: oAuthState Prisma mock, google-ads.test.js RED stubs

provides:
  - Google OAuth initiation at GET /google-ads/auth (iframe escape + CSRF state creation)
  - Google OAuth callback at GET /google-ads/callback (token exchange, account selection, upsert AdConnection)
  - Router mounted in server.js at /google-ads (before verifySessionToken middleware)

affects: [frontend-ads-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Iframe escape via form.submit target=_top (identical to routes/ads-auth.js pattern)"
    - "CSRF state via OAuthState.create, cleaned up after 10 minutes"
    - "access_type=offline + prompt=consent required for refresh token on reconnect"
    - "Manager account filtering: skip accounts with customer.manager=true, use first non-manager"
    - "Fallback: if all accounts are managers, use customerIds[0]"

key-files:
  created:
    - routes/google-ads-auth.js
  modified:
    - server.js

key-decisions:
  - "Mount before verifySessionToken in server.js — OAuth callback arrives without session token"
  - "listAccessibleCustomers + GAQL manager check to select correct customer account"
  - "encrypt(tokens.refresh_token) before upsert — same pattern as Meta refresh token storage"

patterns-established:
  - "Google OAuth follows same iframe escape + CSRF + upsert pattern as Meta OAuth"

requirements-completed: [ADS-04]

# Metrics
duration: 5min
completed: 2026-03-19
---

# Phase 9 Plan 02: Google Ads OAuth Routes Summary

**Google OAuth flow fully implemented — GET /google-ads/auth and GET /google-ads/callback mounted in server.js — ADS-04 GREEN**

## Performance

- **Duration:** 5 min
- **Completed:** 2026-03-19
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `routes/google-ads-auth.js` with full OAuth flow: iframe escape HTML (form.submit target=_top), CSRF state creation via OAuthState, redirect to Google consent URL with access_type=offline/prompt=consent/adwords scope
- Callback exchanges code via OAuth2Client.getToken(), calls listAccessibleCustomers, filters manager accounts to select correct customer ID, encrypts refresh token, upserts AdConnection (platform='google')
- Mounted router in server.js at /google-ads before verifySessionToken middleware

## Task Commits

1. **Task 1: Implement google-ads-auth router** - `c52e641` (feat)
2. **Task 2: Mount router in server.js** - `e85dc7b` (feat)

## Files Created/Modified

- `routes/google-ads-auth.js` - New file: Google OAuth initiation + callback handler
- `server.js` - Mount google-ads-auth at /google-ads before auth middleware

## Issues Encountered

None.

---
*Phase: 09-google-ads-integration*
*Completed: 2026-03-19*
