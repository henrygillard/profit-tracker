---
phase: 07-margin-alerts
verified: 2026-03-19T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
human_verification:
  - test: "Dismissible warning banner on Overview with at-risk SKUs"
    expected: "Yellow/orange banner appears listing product names with margin % and threshold; dismiss button removes it; reloading brings it back"
    why_human: "Banner visibility depends on live data having SKUs below threshold; interaction requires browser session"
  - test: "CRITICAL section (negative margin) cannot be dismissed"
    expected: "Red CRITICAL section has no dismiss button; dismissing WARNING leaves CRITICAL visible"
    why_human: "Two-section rendering separation and button absence require visual inspection in browser"
  - test: "Threshold setting persists across hard reload"
    expected: "Changing threshold to 15, saving, and hard-reloading still shows 15 in Settings input"
    why_human: "Session persistence requires a real browser load cycle against the live database"
  - test: "Products tab badge visible before navigating to Products view"
    expected: "Red numeric badge appears on Products tab while viewing Overview; badge count matches at-risk SKU count; other tabs have no badge"
    why_human: "Nav badge visibility and count accuracy require live data and visual inspection"
---

# Phase 7: Margin Alerts Verification Report

**Phase Goal:** Merchants are proactively notified when any SKU's margin falls below their configured threshold — without needing to go looking for the problem
**Verified:** 2026-03-19
**Status:** human_needed (all automated checks passed; 4 items require browser verification)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | A dismissible banner appears on the dashboard listing every SKU below the merchant's configured threshold, showing product name, current margin %, and the threshold | ? HUMAN NEEDED | MarginAlertBanner.jsx exists, substantive (81 lines), wired in Overview.jsx line 208 with dateRange and onAtRiskCount props; calls `/api/alerts/margin`; splits into WARNING (dismissible) and CRITICAL (not dismissible) sections; browser verification required for live data |
| 2 | Merchant can set a shop-wide margin alert threshold (default 20%) from a settings screen; the setting persists across browser sessions | ? HUMAN NEEDED | SettingsScreen.jsx exists, substantive (108 lines); GET /api/settings on mount, PUT /api/settings on Save; imported and rendered in App.jsx `case 'settings'`; all 5 ALERT-02 tests GREEN; persistence requires browser + DB round-trip |
| 3 | SKUs with negative margin always appear as CRITICAL alerts regardless of configured threshold — this cannot be suppressed | ? HUMAN NEEDED | ALERT-03 invariant confirmed in routes/api.js (isCritical = marginPct < 0, isAtRisk = marginPct < threshold OR isCritical); test "SKU with marginPct < 0 appears even when threshold is 0" passes GREEN; MarginAlertBanner.jsx renders CRITICAL section as separate JSX element with no dismissed condition; browser verification required |
| 4 | The Products nav tab shows a badge with the count of at-risk SKUs so the problem is visible before navigating to the Products view | ? HUMAN NEEDED | App.jsx line 64: `const [atRiskCount, setAtRiskCount] = useState(0)`; line 117–118: conditional badge render on Products tab using `pt-tab-badge` class; onAtRiskCount callback chain: MarginAlertBanner → Overview → App wired correctly; styles.css lines 193–208: `.pt-tab-badge` rule with absolute positioning; browser verification required |

**Score:** 4/4 truths pass automated checks; all 4 require human browser verification for live-data behaviors

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/alerts.test.js` | 10 failing stubs for ALERT-01 through ALERT-04 | VERIFIED | 212 lines; 10 tests across 5 describe blocks covering ALERT-01, ALERT-02, ALERT-03, ALERT-04; all 10 pass GREEN after 07-02 implementation |
| `prisma/schema.prisma` | marginAlertThreshold column on ShopConfig | VERIFIED | Line 122: `marginAlertThreshold   Decimal  @default(20) @map("margin_alert_threshold") @db.Decimal(6, 2)` present |
| `prisma/migrations/20260318_add_margin_alert_threshold/migration.sql` | SQL migration adding margin_alert_threshold column | VERIFIED | File exists; contains `ALTER TABLE "shop_configs" ADD COLUMN "margin_alert_threshold" DECIMAL(6,2) NOT NULL DEFAULT 20` |
| `routes/api.js` | GET /api/settings, PUT /api/settings, GET /api/alerts/margin | VERIFIED | Lines 364–458; all three handlers present with full implementation; shopConfig.findFirst, shopConfig.upsert, $queryRaw wired correctly |
| `web/src/components/MarginAlertBanner.jsx` | Dismissible banner calling /api/alerts/margin | VERIFIED | 81 lines; imports apiFetch; useEffect on dateRange; separate CRITICAL/WARNING sections; dismissed state only on WARNING |
| `web/src/components/SettingsScreen.jsx` | Settings view with threshold input and Save button | VERIFIED | 108 lines; imports apiFetch; GET on mount, PUT on Save; number input with min/max/step; Saved/error confirmation |
| `web/src/App.jsx` | Settings tab in nav, atRiskCount badge on Products tab | VERIFIED | Line 32: settings in TABS; line 64: atRiskCount state; line 95: SettingsScreen case; lines 117–118: conditional badge |
| `web/src/styles.css` | .pt-tab-badge class for nav badge | VERIFIED | Lines 193–208: .pt-tab-badge with absolute positioning, red background (#danger), pointer-events:none; position:relative on .pt-tab at line 189–191 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tests/alerts.test.js` | `routes/api.js` | supertest GET /api/alerts/margin | WIRED | Pattern `alerts/margin` found at test line 119; routes/api.js line 394–458 implements handler |
| `tests/alerts.test.js` | `routes/api.js` | supertest GET/PUT /api/settings | WIRED | Pattern `settings` found at test lines 48, 77; routes/api.js lines 365, 378 implement handlers |
| `routes/api.js GET /api/alerts/margin` | `prisma.shopConfig.findFirst` | threshold lookup | WIRED | Line 399: `prisma.shopConfig.findFirst({ where: { shop: req.shopDomain }, select: { marginAlertThreshold: true } })` |
| `routes/api.js GET /api/alerts/margin` | `prisma.$queryRaw` | at-risk SKU SQL | WIRED | Line 411: tagged template literal with full JOIN query; result mapped to atRiskSkus |
| `routes/api.js PUT /api/settings` | `prisma.shopConfig.upsert` | threshold persistence | WIRED | Line 384: `prisma.shopConfig.upsert({ where: { shop: req.shopDomain }, update: {...}, create: {...} })` |
| `web/src/components/MarginAlertBanner.jsx` | `/api/alerts/margin` | apiFetch in useEffect | WIRED | Line 18: `apiFetch('/api/alerts/margin?' + params)` inside useEffect on dateRange change |
| `web/src/App.jsx` | `MarginAlertBanner` | onAtRiskCount callback prop | WIRED | App.jsx line 99 passes `onAtRiskCount={setAtRiskCount}` to Overview; Overview.jsx line 208 passes it to MarginAlertBanner; banner calls `onAtRiskCount(result.atRiskCount)` at line 21 |
| `web/src/App.jsx Products tab` | `atRiskCount` state | conditional badge render | WIRED | Lines 117–118: `tab.id === 'products' && atRiskCount > 0` conditional renders `pt-tab-badge` span |
| `web/src/components/SettingsScreen.jsx` | `/api/settings` | GET on mount + PUT on Save | WIRED | Line 10: `apiFetch('/api/settings')` in useEffect; line 28: `apiFetch('/api/settings', { method: 'PUT', body: ... })` in handleSave |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| ALERT-01 | 07-01, 07-02, 07-03 | Dashboard displays dismissible banner listing SKUs below threshold | SATISFIED | MarginAlertBanner.jsx renders WARNING section with dismiss button; GET /api/alerts/margin filters SKUs below threshold; test "atRiskSkus contains SKUs where marginPct is below threshold" GREEN |
| ALERT-02 | 07-01, 07-02, 07-03 | Merchant configures shop-wide threshold (default 20%) from settings screen; persists across sessions | SATISFIED | SettingsScreen.jsx with GET/PUT /api/settings; ShopConfig schema with @default(20); all 5 ALERT-02 tests GREEN; browser persistence needs human check |
| ALERT-03 | 07-01, 07-02, 07-03 | Negative-margin SKUs always appear as CRITICAL regardless of threshold | SATISFIED | isCritical logic in routes/api.js (lines 439–440); MarginAlertBanner.jsx CRITICAL section has no dismissed condition; test "SKU with marginPct < 0 appears even when threshold is 0" GREEN |
| ALERT-04 | 07-01, 07-02, 07-03 | Products nav tab shows badge with at-risk SKU count | SATISFIED | App.jsx atRiskCount state + conditional badge; onAtRiskCount callback chain fully wired; .pt-tab-badge CSS rule present |

No orphaned requirements — all four ALERT-01 through ALERT-04 are claimed by all three plans and implementation evidence exists for each.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `MarginAlertBanner.jsx` | 28 | `return null` | INFO | Intentional conditional render when no at-risk SKUs; not a stub — guarded by `!data \|\| data.atRiskCount === 0` |

No blockers or warnings found. The `return null` is a correct early exit, not a placeholder.

### Test Suite Status

**alerts.test.js:** 10/10 tests PASS GREEN
- ALERT-02: GET /api/settings (2 tests) — PASS
- ALERT-02: PUT /api/settings (3 tests) — PASS
- ALERT-01/ALERT-04: GET /api/alerts/margin response shape (2 tests) — PASS
- ALERT-01: GET /api/alerts/margin filtering (1 test) — PASS
- ALERT-03: GET /api/alerts/margin critical flag (2 tests) — PASS

**Full suite regression:** 84/84 tests PASS across 12 test suites. No regressions in dashboard.test.js, chart.test.js, or any other file.

### Human Verification Required

#### 1. Dismissible Warning Banner (ALERT-01)

**Test:** Set threshold to 80% in Settings. Navigate to Overview. Confirm a banner appears listing SKU names with margin % and threshold value. Click the dismiss (X) button. Confirm the banner disappears. Hard-reload (Cmd+Shift+R). Confirm the banner reappears.
**Expected:** Banner visible with at-risk SKU list; dismiss clears it for the session; reload restores it.
**Why human:** Banner visibility depends on live database having SKUs below threshold in the selected date range; dismiss interaction is session-state only.

#### 2. CRITICAL Section Cannot Be Dismissed (ALERT-03)

**Test:** With a negative-margin SKU in the date range, confirm a red CRITICAL section appears above the warning section. Confirm there is no dismiss (X) button on the CRITICAL section. Dismiss the WARNING banner. Confirm the CRITICAL section remains visible.
**Expected:** CRITICAL section is permanently visible; only WARNING is dismissible; the two sections are visually distinct.
**Why human:** Two independent JSX elements rendering correctly and the absence of a dismiss button on CRITICAL requires visual inspection.

#### 3. Threshold Persists Across Sessions (ALERT-02)

**Test:** Navigate to the Settings tab. Change threshold from 20 to 15. Click Save. Confirm "Saved" confirmation appears. Hard-reload the page (Cmd+Shift+R). Navigate back to Settings. Confirm threshold still shows 15.
**Expected:** Threshold survives hard reload because it is stored in the database (ShopConfig.marginAlertThreshold), not session/localStorage.
**Why human:** Cross-session persistence requires a real browser load cycle against the live database.

#### 4. Products Tab Nav Badge (ALERT-04)

**Test:** While viewing Overview with at-risk SKUs present, look at the nav tab bar. Confirm the Products tab shows a small red numeric badge. Confirm the badge count matches the number of at-risk SKUs reported by the banner. Confirm Overview and Orders tabs have no badge. Confirm the tab layout has not shifted (badge should be superscript, not pushing other tabs).
**Expected:** Badge appears on Products tab only; count is accurate; no layout shift.
**Why human:** Badge visibility requires live atRiskCount > 0 from a real API call; layout shift absence requires visual inspection.

### Gaps Summary

No gaps. All four ALERT requirements have:
- Backend routes implemented and tested (10/10 tests GREEN, 84/84 full suite)
- Frontend components created with substantive implementation (not stubs)
- Correct wiring at every level (import → use → API call → response handling)
- CSS rules for visual presentation

The phase is pending only the browser-level human checkpoint that was built into Plan 07-03 as a blocking gate. The 07-03 SUMMARY records this checkpoint was "approved" — this automated verification confirms all code artifacts are in place to support that approval.

---

_Verified: 2026-03-19_
_Verifier: Claude (gsd-verifier)_
