---
phase: 03-profit-dashboard
plan: 03
subsystem: ui
tags: [vite, react, recharts, shopify-app-bridge, polaris, spa, frontend]

# Dependency graph
requires:
  - phase: 03-profit-dashboard
    plan: 02
    provides: Four GET /api/dashboard/* Express routes that the React SPA will consume

provides:
  - web/ directory with Vite 4 + React 18 + Recharts project scaffold
  - web/vite.config.js with base=/app/ and outDir=../public/app
  - web/index.html with App Bridge CDN as first script, Polaris CDN, shopify-api-key meta tag
  - web/src/api.js: apiFetch with 5-second idToken timeout using Promise.race
  - web/src/App.jsx: layout shell with dateRange state, view routing via ?view= URL param
  - public/app/ build output (index.html + JS bundle)

affects:
  - 03-profit-dashboard plan 04 (dashboard components slot into App.jsx shell)

# Tech tracking
tech-stack:
  added: [vite@4, react@18, react-dom@18, recharts@3, @vitejs/plugin-react@4]
  patterns:
    - App Bridge CDN as first script in head (mandatory for window.shopify global)
    - apiFetch with Promise.race idToken timeout (5 seconds)
    - View routing via URLSearchParams(?view=) with popstate listener for browser back
    - No @shopify npm packages (CDN-only approach)
    - No React StrictMode (App Bridge embedded context compatibility)

key-files:
  created:
    - web/package.json
    - web/vite.config.js
    - web/index.html
    - web/src/api.js
    - web/src/App.jsx
    - web/src/main.jsx
    - public/app/index.html
  modified: []

key-decisions:
  - "Used create-vite@4 (not latest v9) — Node 16.20.2 requires Vite 4.x; v9 requires Node 20+"
  - "Removed StrictMode from main.jsx — App Bridge initialization in embedded Shopify context is incompatible with double-invoke behavior"
  - "App Bridge CDN script is FIRST in head before Polaris — sets window.shopify global that Polaris and apiFetch depend on"
  - "VITE_SHOPIFY_API_KEY in .env is gitignored placeholder — substituted at build time, real key set in deployment environment"

patterns-established:
  - "Pattern: apiFetch wraps window.shopify.idToken() in Promise.race with 5s timeout — all API calls in Plan 04 components use this wrapper"
  - "Pattern: view routing via ?view= URL param with popstate listener — browser back/forward works without React Router"

requirements-completed: [DASH-01, DASH-02, DASH-03, DASH-04, DASH-05]

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 3 Plan 03: Vite+React SPA Scaffold Summary

**Vite 4 + React 18 SPA with App Bridge CDN, Polaris web components, authenticated apiFetch wrapper, and view-routing shell ready for dashboard component integration**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T03:02:26Z
- **Completed:** 2026-03-14T03:05:50Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Scaffolded web/ directory with Vite 4 + React 18 + Recharts; build exits 0 producing public/app/
- Wired App Bridge and Polaris CDN into index.html with correct script ordering (App Bridge first)
- Implemented api.js with 5-second idToken timeout and authenticated fetch wrapper
- Created App.jsx layout shell with dateRange state (last 30 days), four-view routing via ?view= param

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Vite+React project in web/ and configure build output** - `d770cf8` (feat)
2. **Task 2: Wire App Bridge CDN, implement api.js and App.jsx layout shell** - `cbd6648` (feat)

**Plan metadata:** (committed with this summary)

## Files Created/Modified

- `web/package.json` - Vite 4 + React 18 + Recharts dependencies (no @shopify npm packages)
- `web/vite.config.js` - base=/app/, outDir=../public/app, proxy /api to localhost:3000
- `web/index.html` - App Bridge CDN first script, Polaris CDN, shopify-api-key meta tag
- `web/src/api.js` - apiFetch export with 5-second idToken timeout via Promise.race
- `web/src/App.jsx` - Layout shell: dateRange state, four-view routing via ?view= param, error banner
- `web/src/main.jsx` - Minimal entry: ReactDOM.createRoot render App without StrictMode
- `public/app/index.html` - Built output with CDN scripts and shopify-api-key meta tag

## Decisions Made

- Used `create-vite@4` instead of latest `create-vite@9` — the latest version requires Node 20+ (`node:util` `styleText` export), but the project runs Node 16.20.2. Vite 4.x supports Node 14.18+.
- Removed `React.StrictMode` from main.jsx per plan specification — App Bridge initialization in an embedded Shopify iframe context can conflict with StrictMode's double-invoke behavior in development.
- App Bridge CDN script placed as the absolute first `<script>` tag in `<head>` — this is a hard Shopify requirement since `window.shopify` global must be available before any app code runs.
- `.env` file is gitignored (standard security practice) — placeholder `VITE_SHOPIFY_API_KEY=your_api_key_here` substituted at build time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used create-vite@4 instead of create-vite@latest**
- **Found during:** Task 1 (scaffold Vite+React project)
- **Issue:** `npm create vite@latest` attempted to install create-vite@9.0.2 which requires Node 20+. Project runs Node 16.20.2. Error: `node:util` does not provide export named `styleText`.
- **Fix:** Used `npm create vite@4` which installs create-vite@4.4.1 — the last major Vite version supporting Node 14.18+.
- **Files modified:** web/package.json (vite@4.4.5 instead of vite@6.x)
- **Verification:** Build exits 0 with Vite v4.5.14
- **Committed in:** d770cf8 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking issue)
**Impact on plan:** Vite 4.x vs 5/6.x has no material impact on the SPA scaffold — same plugins, same build output structure, same dev server proxy. All plan success criteria met.

## Issues Encountered

None beyond the Vite version deviation above.

## User Setup Required

None - no external service configuration required. The `VITE_SHOPIFY_API_KEY` is set as a real value in the deployment environment (Render/Railway env vars), not in source code.

## Next Phase Readiness

- App.jsx layout shell is ready: Plan 04 components replace the placeholder `<p>` elements per view
- api.js is ready: Plan 04 components import `apiFetch` to call the four dashboard API routes
- Build pipeline verified: `cd web && npm run build` produces public/app/ output served by the Express server
- No blockers for Plan 04

## Self-Check: PASSED

- web/package.json: FOUND
- web/vite.config.js: FOUND
- web/index.html: FOUND
- web/src/api.js: FOUND
- web/src/App.jsx: FOUND
- web/src/main.jsx: FOUND
- public/app/index.html: FOUND
- 03-03-SUMMARY.md: FOUND
- Commit d770cf8 (Task 1): FOUND
- Commit cbd6648 (Task 2): FOUND

---
*Phase: 03-profit-dashboard*
*Completed: 2026-03-14*
