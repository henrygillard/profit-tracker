# Coding Conventions

**Analysis Date:** 2026-03-10

## Naming Patterns

**Files:**
- Lowercase with no extensions for directories: `routes/`, `lib/`, `public/`
- Camel case for feature files: `auth.js`, `webhooks.js`
- Pascal case for Prisma models in schema: `ShopSession`, `OAuthState`
- Snake case for database tables (auto-mapped in Prisma): `shop_sessions`, `oauth_states`

**Functions:**
- Camel case for all function definitions: `verifyWebhookHmac()`, `findUnique()`, `upsert()`
- Async functions use `async` keyword: `async (req, res) => {...}`
- Arrow functions preferred for Express route handlers and callbacks

**Variables:**
- Camel case: `shop`, `normalizedShop`, `redirectUrl`, `accessToken`, `shopDomain`
- All caps with underscores for constants (environment variables): `SHOPIFY_APP_URL`, `PORT`, `DATABASE_URL`
- Short variable names in loops: `p`, `k`, `kv` (seen in inline form parsing in `routes/auth.js`)

**Types:**
- Destructured imports from libraries: `const { PrismaClient } = require('@prisma/client')`
- Object destructuring in parameters: `const { shop, code, state, hmac } = req.query`
- Destructured prisma queries: `const { access_token, scope } = await tokenRes.json()`

## Code Style

**Formatting:**
- No linter/formatter detected (no `.eslintrc`, `.prettierrc`, `eslint.config.*` files)
- Implicit formatting: 2-space indentation
- Inline HTML strings in route handlers (see `server.js` lines 50-87)
- Template literals for dynamic content: `` `${variable}` ``

**Linting:**
- No linting framework configured

## Import Organization

**Order:**
1. Node.js core modules: `const express = require('express'); const crypto = require('crypto');`
2. Third-party libraries: `const { PrismaClient } = require('@prisma/client');`
3. Local modules: `const { prisma } = require('../lib/prisma');`

**Path Aliases:**
- No path aliases configured
- Relative paths use `../` for parent directories: `require('../lib/prisma')`
- Absolute paths with `__dirname` for file serving: `path.join(__dirname, 'public')`

## Error Handling

**Patterns:**
- Try-catch blocks in async route handlers: `try { ... } catch (error) { ... }`
- Error logging to console: `console.error('OAuth begin error:', error)`
- Generic error messages to client: `res.status(500).send('OAuth callback failed: ' + error.message)`
- Validation checks before operations: `if (!shop) return res.status(400).send('Missing shop parameter')`
- HMAC verification pattern (custom validation): `if (generatedHmac !== hmac) { return res.status(400).send(...) }`

**Example from `routes/auth.js` (lines 49-66):**
```javascript
try {
  const state = crypto.randomBytes(16).toString('hex');
  await prisma.oAuthState.create({ data: { state, shop: normalizedShop } });
  // ... operation
  res.redirect(authUrl);
} catch (error) {
  console.error('OAuth begin error:', error);
  res.status(500).send('Failed to initiate OAuth');
}
```

## Logging

**Framework:** `console` (built-in Node.js logging)

**Patterns:**
- `console.log()` for informational messages: `console.log(`OAuth completed for ${shop}`)`
- `console.error()` for error conditions: `console.error('OAuth callback error:', error)`
- Template literals for contextual information: `` console.log(`Cleaned up sessions for uninstalled shop: ${shop}`) ``
- Error object passed directly: `console.error('Webhook error:', error)`

## Comments

**When to Comment:**
- Single-line comments before critical or non-obvious operations
- Multi-line block comments for feature documentation (see `server.js` lines 37-40)
- Critical order notes: `// CRITICAL: raw body for webhooks BEFORE json parser — do not change order` (line 28 in `server.js`)
- Inline comments for complex logic: `// Trust proxy for Railway` (line 10 in `server.js`)

**JSDoc/TSDoc:**
- Minimal JSDoc used
- Block comments for route documentation:
```javascript
/**
 * GET /auth — Initiate OAuth flow
 */
```

## Function Design

**Size:**
- Route handlers are inline within route definitions
- Utility functions extracted when used multiple times: `verifyWebhookHmac()` (4 lines, reused in webhook handlers)
- Functions typically 15-50 lines

**Parameters:**
- Express route handlers use standard `(req, res)` pattern
- Destructuring used to extract needed fields: `const { shop, code, state, hmac } = req.query`
- Named parameters preferred over positional arguments

**Return Values:**
- Express responses (res.status, res.redirect, res.send) used directly
- Async functions return Promises implicitly
- No explicit return for middleware functions (rely on `next()`)

## Module Design

**Exports:**
- CommonJS `module.exports`: `module.exports = router;`
- Express Router objects exported from route files
- Destructured named exports: `module.exports = { prisma };`

**Barrel Files:**
- No barrel files (index.js pattern) used
- Direct imports of modules: `require('./routes/auth')`, `require('./routes/webhooks')`

## Prisma Patterns

**Schema Location:** `prisma/schema.prisma`

**Model Naming:**
- PascalCase model names: `ShopSession`, `OAuthState`
- Snake case database mapping: `@@map("shop_sessions")`, `@map("access_token")`
- Standard timestamps: `createdAt`, `updatedAt` with `@default(now())` and `@updatedAt`

**Query Patterns (from actual usage in `routes/auth.js` and `routes/webhooks.js`):**
```javascript
// Create
await prisma.oAuthState.create({ data: { state, shop: normalizedShop } });

// Find
await prisma.oAuthState.findUnique({ where: { state } });
await prisma.shopSession.findFirst({ where: { shop } });

// Upsert
await prisma.shopSession.upsert({
  where: { shop },
  update: { accessToken: access_token, scope, isOnline: false },
  create: { ... },
});

// Delete
await prisma.oAuthState.delete({ where: { state } });
await prisma.shopSession.deleteMany({ where: { shop } });
```

---

*Convention analysis: 2026-03-10*
