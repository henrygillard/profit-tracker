---
phase: 01-data-foundation
plan: "01"
subsystem: testing
tags: [jest, supertest, tdd, webhooks, jwt, env-validation, scopes]

# Dependency graph
requires: []
provides:
  - Jest 29 + Supertest test runner configured for Node 16
  - Mocked Prisma client for integration tests (tests/__mocks__/prisma.js)
  - Failing test scaffolds for all four Phase 1 requirements (FOUND-01 through FOUND-04)
affects:
  - 01-02 (GDPR webhook implementation — tests/webhooks.test.js defines the contract)
  - 01-03 (JWT middleware and env validation — tests/auth.test.js and tests/env.test.js define the contract)
  - 01-04 (Scope pruning — tests/scopes.test.js defines the contract)

# Tech tracking
tech-stack:
  added: [jest@29, supertest@7]
  patterns:
    - Manual Jest mock at tests/__mocks__/prisma.js intercepts require('../lib/prisma') across all test files
    - moduleNameMapper in jest.config.js maps both ../lib/prisma and ./lib/prisma to the mock
    - env.test.js uses os.tmpdir() as cwd to prevent dotenv from restoring deleted vars during spawnSync
    - auth.test.js uses try/catch module loading with moduleLoaded flag so tests fail clearly when module is absent

key-files:
  created:
    - jest.config.js
    - tests/__mocks__/prisma.js
    - tests/webhooks.test.js
    - tests/auth.test.js
    - tests/env.test.js
    - tests/scopes.test.js
  modified:
    - package.json (added jest@29, supertest@7 devDependencies, "test": "jest" script)

key-decisions:
  - "Pinned jest@29 (not 30) because jest@30 requires Node 18+ via os.availableParallelism; project runs Node 16.20.2"
  - "env.test.js uses os.tmpdir() as spawnSync cwd so dotenv cannot load the project .env file and restore deleted vars"
  - "auth.test.js uses try/catch module loading with moduleLoaded flag instead of jest.mock to allow clean test file loading before lib/verifySessionToken.js exists"

patterns-established:
  - "TDD scaffold pattern: test files written before implementation, all fail with assertion errors (not import errors)"
  - "Prisma mock: manual Jest mock at tests/__mocks__/prisma.js, referenced via moduleNameMapper"
  - "Env isolation in tests: use os.tmpdir() cwd + explicit BASE_ENV object to prevent .env leakage"

requirements-completed: [FOUND-01, FOUND-02, FOUND-03, FOUND-04]

# Metrics
duration: 7min
completed: 2026-03-11
---

# Phase 1 Plan 01: Test Infrastructure Summary

**Jest 29 + Supertest installed with 4 failing test scaffold files covering all Phase 1 GDPR, JWT, env-validation, and scope-pruning requirements**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-11T03:18:11Z
- **Completed:** 2026-03-11T03:25:20Z
- **Tasks:** 2
- **Files modified:** 6 created, 1 modified

## Accomplishments

- Installed jest@29 + supertest@7 with Node 16-compatible configuration (jest@30 would break on Node 16)
- Created mocked Prisma client that auto-intercepts require('../lib/prisma') in all test files
- Wrote 12 test cases across 4 files: all run cleanly (no import crashes), 8 fail with assertion errors as required

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Jest + Supertest and create test infrastructure** - `bbe9395` (chore)
2. **Task 2: Write failing test scaffolds for all four requirements** - `534d96e` (test)

**Plan metadata:** (to be added below)

## Files Created/Modified

- `jest.config.js` - Test runner config: testEnvironment node, testMatch tests/**/*.test.js, moduleNameMapper for prisma mock
- `tests/__mocks__/prisma.js` - Manual Jest mock exporting mocked prisma with shopSession.deleteMany and findFirst
- `tests/webhooks.test.js` - 4 tests for GDPR webhook handlers (FOUND-01); 2 currently fail (HMAC auth and deleteMany call)
- `tests/auth.test.js` - 4 tests for JWT session-token middleware (FOUND-04); all fail (module not yet created)
- `tests/env.test.js` - 3 tests for env validation (FOUND-03); 2 pass (existing feature), 1 fails (SHOPIFY_SCOPES not yet in REQUIRED_ENV)
- `tests/scopes.test.js` - 1 test for scope pruning (FOUND-02); fails (150 excess scopes in toml)
- `package.json` - Added jest@29, supertest@7 devDependencies, "test": "jest" script

## Decisions Made

- **jest@29 not jest@30:** jest@30 requires Node 18+ via `os.availableParallelism`; project runs Node 16.20.2. Pinned to jest@29 to avoid runtime error. (Rule 3 — auto-fix: blocking issue)
- **os.tmpdir() for env tests:** When spawnSync passes a controlled env to node server.js, dotenv still loads the project `.env` file from cwd and restores deleted vars. Using os.tmpdir() as cwd prevents this. (Rule 1 — auto-fix: test would never produce the desired failure without this)
- **try/catch module loading in auth.test.js:** Using try/catch + moduleLoaded flag instead of jest.mock allows the test file to load cleanly before `lib/verifySessionToken.js` exists, and produces a clear "not implemented" assertion failure rather than a MODULE_NOT_FOUND crash.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Downgraded jest@30 to jest@29 for Node 16 compatibility**
- **Found during:** Task 1 (Install Jest + Supertest)
- **Issue:** `npx jest --listTests` crashed with `TypeError: os.availableParallelism is not a function` because jest@30 requires Node 18+, project uses Node 16.20.2
- **Fix:** Ran `npm install --save-dev jest@29 supertest@7` to install the last jest major that supports Node 16
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx jest --listTests` exits 0 after downgrade
- **Committed in:** bbe9395 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed env test isolation to prevent dotenv from restoring deleted vars**
- **Found during:** Task 2 (env.test.js)
- **Issue:** `spawnServerWithout(['SHOPIFY_API_KEY'])` passed env with key deleted, but server.js calls `dotenv.config()` which reads the project `.env` file and restores any missing vars — causing all three tests to return exit code 0 (no validation error)
- **Fix:** Changed spawnSync cwd from project root to `os.tmpdir()` so dotenv cannot find the `.env` file; also replaced ad-hoc env spreading with a fully-explicit `BASE_ENV` object containing only what the test process should see
- **Files modified:** tests/env.test.js
- **Verification:** Test 1 (SHOPIFY_API_KEY) and Test 2 (DATABASE_URL) now pass; Test 3 (SHOPIFY_SCOPES) fails with correct assertion error (not yet in REQUIRED_ENV)
- **Committed in:** 534d96e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes were necessary for the test infrastructure to work correctly. No scope creep.

## Issues Encountered

- None beyond the two auto-fixed deviations above.

## User Setup Required

None — no external service configuration required for test infrastructure.

## Next Phase Readiness

- Test framework is operational: `npx jest` runs, all 4 test files load cleanly
- Implementation plans can now make tests go green one by one:
  - Plan 02 implements GDPR handlers (webhooks.test.js)
  - Plan 03 implements JWT middleware + env SHOPIFY_SCOPES (auth.test.js, env.test.js)
  - Plan 04 prunes scopes (scopes.test.js)
- Prisma mock is ready for all integration tests

---
*Phase: 01-data-foundation*
*Completed: 2026-03-11*
