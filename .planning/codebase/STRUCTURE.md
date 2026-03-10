# Codebase Structure

**Analysis Date:** 2026-03-10

## Directory Layout

```
profit-tracker/
├── server.js                  # Express app entry point and main routes
├── package.json              # Project dependencies and scripts
├── Dockerfile                # Container configuration
├── prisma/
│   └── schema.prisma         # Database schema (Prisma ORM)
├── lib/
│   └── prisma.js             # Prisma Client singleton initialization
├── routes/
│   ├── auth.js               # OAuth flow endpoints
│   └── webhooks.js           # Shopify webhook handlers
├── public/
│   ├── privacy.html          # Privacy policy page
│   └── terms.html            # Terms of service page
└── .planning/
    └── codebase/             # GSD analysis documents
```

## Directory Purposes

**Root Directory:**
- Purpose: Project configuration, server entry point, and Docker setup
- Contains: Express server, npm scripts, deployment config
- Key files: `server.js`, `package.json`, `Dockerfile`

**prisma/:**
- Purpose: Database schema definition and ORM configuration
- Contains: Prisma schema with models, database provider configuration
- Key files: `schema.prisma`

**lib/:**
- Purpose: Shared utility libraries and infrastructure
- Contains: Prisma Client initialization and singleton management
- Key files: `prisma.js`

**routes/:**
- Purpose: HTTP route handlers organized by feature/domain
- Contains: OAuth authentication flow, Shopify webhook handlers
- Key files: `auth.js`, `webhooks.js`

**public/:**
- Purpose: Static HTML assets served directly to clients
- Contains: Legal pages (privacy, terms) and HTML templates
- Key files: `privacy.html`, `terms.html`

## Key File Locations

**Entry Points:**
- `server.js`: Main Express application initialization and route registration
- `lib/prisma.js`: Database client initialization (called by all route handlers)

**Configuration:**
- `package.json`: Dependencies, scripts, project metadata
- `prisma/schema.prisma`: Database schema, models, provider config
- `.env`: Environment variables (not committed; see .env.example)

**Core Logic:**
- `routes/auth.js`: OAuth authorization flow, token exchange, session persistence
- `routes/webhooks.js`: Webhook signature verification, app lifecycle event handling
- `lib/prisma.js`: Prisma Client singleton pattern with dev-mode global caching

**Testing:**
- No test files present in codebase

**Database:**
- `prisma/schema.prisma`: ShopSession model (shop, access token, scope, metadata)
- `prisma/schema.prisma`: OAuthState model (state token, shop, expiration)

## Naming Conventions

**Files:**
- Route handlers: `routes/[feature].js` (e.g., `auth.js`, `webhooks.js`)
- Library utilities: `lib/[service].js` (e.g., `prisma.js`)
- Prisma schema: `prisma/schema.prisma` (standard Prisma convention)
- Express routes: Lowercase with hyphens in URLs, no file extension in import paths

**Directories:**
- Plural for collections: `routes/`, `lib/`, `public/`
- Feature-based organization: Routes grouped by feature domain (auth, webhooks)
- Standard structure: `prisma/`, `public/`, `.planning/`

**Functions/Variables:**
- Handlers: Descriptive names like `verifyWebhookHmac`, `verifyHmac`
- Routes: HTTP method + resource (e.g., `GET /auth`, `POST /webhooks/app_uninstalled`)
- Variables: camelCase (e.g., `normalizedShop`, `storedState`, `generatedHmac`)

**Database Models:**
- Model names: PascalCase (e.g., `ShopSession`, `OAuthState`)
- Field names: camelCase in code, snake_case in database via @map (e.g., `accessToken` → `access_token`)
- Table names: snake_case in database (e.g., `shop_sessions`, `oauth_states`)

## Where to Add New Code

**New Feature:**
- Primary code: Create new file in `routes/[feature].js` and require/mount in `server.js`
- Tests: Create `routes/[feature].test.js` or `routes/[feature].spec.js` (currently no tests)
- Database: Add models to `prisma/schema.prisma`, run `npm run db:push`
- Example: Adding product data endpoints would go in `routes/products.js`

**New Component/Module:**
- Implementation: Create new file in `lib/[service].js` for utilities
- Exports: Use CommonJS `module.exports` pattern (consistent with codebase)
- Dependencies: Require other lib files as needed in route handlers
- Example: Adding Shopify GraphQL client would go in `lib/shopify-client.js`

**Utilities/Helpers:**
- Shared helpers: `lib/[function].js` (e.g., `lib/webhook-verifier.js`)
- Path structure: Keep utilities isolated in `lib/`, require in routes as needed
- Naming: Function name should match or describe utility purpose

**Database Queries:**
- Where: Currently co-located within route handlers (e.g., `routes/auth.js` calls `prisma.shopSession.upsert()`)
- Pattern: Access Prisma via `require('../lib/prisma').prisma`
- Models: Define in `prisma/schema.prisma`, access via Prisma Client generated types

**Static Assets:**
- Where: `public/` directory
- Served: Automatically via Express static middleware in `server.js` line 31
- Paths: Reference as `/filename` in HTML (e.g., `/privacy.html` serves from `public/privacy.html`)

## Special Directories

**node_modules/:**
- Purpose: Third-party dependencies installed via npm
- Generated: Yes (created by `npm install`)
- Committed: No (listed in .gitignore)

**.planning/codebase/:**
- Purpose: GSD analysis documentation generated during codebase mapping
- Generated: Yes (by GSD mapping commands)
- Committed: Yes (documents for reference)

**prisma/migrations/ (if present):**
- Purpose: Database migration history
- Generated: Yes (created by `prisma migrate` commands)
- Committed: Yes (for reproducible database state)

## Import Pattern

**CommonJS Module System:**
- Use `const { module } = require('../path/to/module')` for named exports
- Use `const module = require('../path/to/module')` for default exports
- Path resolution: Relative paths from importing file location
- Examples:
  - `const { prisma } = require('../lib/prisma')` in routes
  - `const express = require('express')` for npm packages
  - `const path = require('path')` for Node.js builtins

**Environment Variables:**
- Load in `server.js`: `require('dotenv').config()` at line 1
- Access: `process.env.VARIABLE_NAME`
- Required vars: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `DATABASE_URL`, `SHOPIFY_SCOPES`
- Optional vars: `PORT` (defaults to 3000), `NODE_ENV`

---

*Structure analysis: 2026-03-10*
