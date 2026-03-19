---
phase: 7
slug: margin-alerts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 + supertest 7 |
| **Config file** | `jest.config.js` |
| **Quick run command** | `jest tests/alerts.test.js --no-coverage` |
| **Full suite command** | `jest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `jest tests/alerts.test.js --no-coverage`
- **After every plan wave:** Run `jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 0 | ALERT-01, ALERT-02, ALERT-03, ALERT-04 | unit (route stubs) | `jest tests/alerts.test.js --no-coverage` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 0 | ALERT-02 | schema | `npx prisma migrate dev` | ❌ W0 | ⬜ pending |
| 7-02-01 | 02 | 1 | ALERT-02 | unit (route) | `jest tests/alerts.test.js -t "ALERT-02" --no-coverage` | ✅ W0 | ⬜ pending |
| 7-02-02 | 02 | 1 | ALERT-01, ALERT-03, ALERT-04 | unit (route) | `jest tests/alerts.test.js -t "ALERT-01\|ALERT-03\|ALERT-04" --no-coverage` | ✅ W0 | ⬜ pending |
| 7-02-03 | 02 | 1 | all | regression | `jest --no-coverage` | ✅ | ⬜ pending |
| 7-03-01 | 03 | 2 | ALERT-01, ALERT-03 | manual | Browser checkpoint | N/A | ⬜ pending |
| 7-03-02 | 03 | 2 | ALERT-02 | manual | Browser checkpoint | N/A | ⬜ pending |
| 7-03-03 | 03 | 2 | ALERT-04 | manual | Browser checkpoint | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/alerts.test.js` — failing stubs for ALERT-01 through ALERT-04 (new file)
- [ ] `prisma/migrations/..._add_margin_alert_threshold/migration.sql` — schema migration for `marginAlertThreshold` column on `ShopConfig`

*No new framework install needed — Jest + supertest already present.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dismissible banner hides warning SKUs on click | ALERT-01 | DOM interaction / dismiss state | Load dashboard with at-risk SKU; click ✕ button; verify warning section disappears; reload; verify banner re-appears |
| CRITICAL banner cannot be dismissed | ALERT-03 | DOM persistence | Load dashboard with negative-margin SKU; confirm no dismiss button on CRITICAL section; dismiss warnings; confirm CRITICAL section remains |
| Settings threshold saves and persists across reload | ALERT-02 | Server round-trip + page reload | Open Settings; change threshold to 15; click Save; hard-reload page; confirm threshold shows 15 |
| Products tab badge shows at-risk count | ALERT-04 | Nav DOM render | Load dashboard with at-risk SKUs; confirm numeric badge visible on Products tab before navigating to Products view |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
