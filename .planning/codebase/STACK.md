# Technology Stack

**Analysis Date:** 2026-03-10

## Languages

**Primary:**
- JavaScript (Node.js) - Full application (server, routes, configuration)

## Runtime

**Environment:**
- Node.js 20 (as specified in `Dockerfile` - `FROM node:20-slim`)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Express.js ^4.22.1 - Web server framework, routing, middleware

**ORM & Database:**
- Prisma ^5.22.0 - Database ORM and migrations
- @prisma/client ^5.22.0 - Prisma client runtime

**Utilities:**
- dotenv ^16.6.1 - Environment variable loading from `.env`

## Key Dependencies

**Critical:**
- `express` - HTTP server and request routing for all endpoints
- `@prisma/client` - Database client for PostgreSQL queries and sessions
- `prisma` - Database toolkit for migrations and code generation
- `dotenv` - Configuration management for secrets and environment vars

## Configuration

**Environment:**
- `.env` file required at project root (see `.env.example` for template)
- Config loaded at server startup in `server.js` line 1
- Key configs required:
  - `DATABASE_URL` - PostgreSQL connection string
  - `SHOPIFY_API_KEY` - OAuth client ID from Shopify Partners Dashboard
  - `SHOPIFY_API_SECRET` - OAuth client secret from Shopify Partners Dashboard
  - `SHOPIFY_APP_URL` - Public URL of deployed app (e.g., `https://app.up.railway.app`)
  - `SHOPIFY_SCOPES` - Space-separated OAuth scopes (default: `read_products`)
  - `PORT` - Server port (default: 3000)

**Build:**
- `prisma/schema.prisma` - Database schema definition (PostgreSQL provider)
- `shopify.app.profit-tracker.toml` - Shopify app configuration (client ID, webhooks, scopes, redirect URLs)

## Platform Requirements

**Development:**
- Node.js 20+ required
- PostgreSQL database (or compatible)
- Shopify Partners account for API credentials

**Production:**
- Container deployment (Docker image provided)
- PostgreSQL database (configured via `DATABASE_URL`)
- Railway.app or similar hosting platform (reference to `railway.app` in code and config)
- HTTPS endpoint required (Shopify enforces HTTPS for OAuth redirects and embedded apps)

## Scripts

**Available Commands:**
- `npm start` - Start production server
- `npm run dev` - Start development server (same as start)
- `npm run db:push` - Sync Prisma schema with database
- `npm run db:studio` - Open Prisma Studio for database GUI

## Dependencies Summary

```
@prisma/client: ^5.22.0
prisma: ^5.22.0
express: ^4.22.1
dotenv: ^16.6.1
```

Node.js built-in modules used:
- `crypto` - HMAC verification for OAuth and webhooks
- `path` - File path utilities
- `express` - HTTP framework

---

*Stack analysis: 2026-03-10*
