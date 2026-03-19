// tests/google-ads.test.js
// TDD RED phase — failing stubs for Phase 9 Google Ads OAuth routes.
// All tests currently FAIL (routes not yet implemented).
// Plan 09-02 will implement routes/google-ads-auth.js (ADS-04 OAuth flow).
//
// Covers: ADS-04 (GET /google-ads/auth iframe escape, GET /google-ads/auth?shop= redirect,
//          GET /google-ads/callback token upsert, DELETE /api/ads/disconnect?platform=google)

// Set required env vars before requiring any modules
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test-key';
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-secret';
process.env.ADS_ENCRYPTION_KEY = process.env.ADS_ENCRYPTION_KEY ||
  require('crypto').randomBytes(32).toString('base64');
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-dev-token';
process.env.GOOGLE_ADS_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_ADS_CLIENT_SECRET = 'test-client-secret';

const request = require('supertest');
const express = require('express');
const { OAuth2Client } = require('google-auth-library');

// Attempt to load google-ads-auth route — fails RED until Plan 09-02
let googleAdsAuthRouter = null;
try {
  googleAdsAuthRouter = require('../routes/google-ads-auth');
} catch (e) {
  // routes/google-ads-auth.js not yet implemented (Plan 09-02)
}

// Build a minimal Express app mounting both google-ads-auth and ads routers
function makeApp() {
  const app = express();
  app.use(express.json());

  // Mount google-ads-auth routes at /google-ads (non-API, OAuth routes)
  if (googleAdsAuthRouter) {
    app.use('/google-ads', googleAdsAuthRouter);
  }

  // Mock JWT middleware: always authenticates as test shop
  app.use('/api', (req, res, next) => {
    req.shopDomain = 'test-shop.myshopify.com';
    next();
  });

  // Mount ads API routes under /api/ads (for DELETE /disconnect test)
  app.use('/api/ads', require('../routes/ads'));

  return app;
}

// Import the mocked prisma (resolved via jest.config.js moduleNameMapper)
const { prisma } = require('../lib/prisma');

let app;

beforeAll(() => {
  app = makeApp();
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ADS-04: GET /google-ads/auth?host=xxx — iframe escape HTML
// ---------------------------------------------------------------------------

describe('ADS-04: GET /google-ads/auth?host=xxx — iframe escape HTML', () => {
  test('returns 200 with HTML containing a form and submit for iframe escape', async () => {
    if (!googleAdsAuthRouter) {
      expect(false).toBe(true); // RED until Plan 09-02
      return;
    }
    const res = await request(app)
      .get('/google-ads/auth?host=dGVzdC1zaG9wLm15c2hvcGlmeS5jb20v');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/form/i);
    expect(res.text).toMatch(/submit/i);
  });
});

// ---------------------------------------------------------------------------
// ADS-04: GET /google-ads/auth?shop=xxx — redirect to Google OAuth URL
// ---------------------------------------------------------------------------

describe('ADS-04: GET /google-ads/auth?shop=xxx — redirect to Google OAuth', () => {
  test('redirects to accounts.google.com with required OAuth params', async () => {
    if (!googleAdsAuthRouter) {
      expect(false).toBe(true); // RED until Plan 09-02
      return;
    }
    prisma.oAuthState.deleteMany.mockResolvedValueOnce({ count: 0 });
    prisma.oAuthState.create.mockResolvedValueOnce({
      id: 1,
      state: 'test-state',
      shop: 'test-shop.myshopify.com',
    });

    const res = await request(app)
      .get('/google-ads/auth?shop=test-shop.myshopify.com');

    expect(res.status).toBe(302);
    const location = res.headers.location || '';
    expect(location).toMatch(/accounts\.google\.com|oauth2\.googleapis\.com/);
    expect(location).toContain('access_type=offline');
    expect(location).toContain('prompt=consent');
    expect(location).toMatch(/scope=.*adwords/i);
  });
});

// ---------------------------------------------------------------------------
// ADS-04: GET /google-ads/callback — stores encrypted refresh token
// ---------------------------------------------------------------------------

describe('ADS-04: GET /google-ads/callback — stores encrypted refresh token in AdConnection', () => {
  test('exchanges code for tokens, upserts AdConnection, redirects to /admin', async () => {
    if (!googleAdsAuthRouter) {
      expect(false).toBe(true); // RED until Plan 09-02
      return;
    }

    // Mock oAuthState lookup (state validation)
    prisma.oAuthState.findUnique.mockResolvedValueOnce({
      state: 'test-state',
      shop: 'test-shop.myshopify.com',
    });
    prisma.oAuthState.delete.mockResolvedValueOnce({});
    prisma.adConnection.upsert.mockResolvedValueOnce({
      id: 1,
      shop: 'test-shop.myshopify.com',
      platform: 'google',
      accountId: '1234567890',
    });

    // Mock google-auth-library OAuth2Client.getToken (token exchange)
    const getTokenSpy = jest
      .spyOn(OAuth2Client.prototype, 'getToken')
      .mockResolvedValue({
        tokens: { refresh_token: 'rtoken', access_token: 'atoken' },
      });

    // Mock global.fetch for listAccessibleCustomers Google Ads API call
    global.fetch = jest.fn().mockResolvedValueOnce({
      json: async () => ({
        resourceNames: ['customers/1234567890'],
      }),
    });

    const res = await request(app)
      .get('/google-ads/callback?code=test-auth-code&state=test-state');

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/admin');
    expect(res.headers.location).toContain('shop=test-shop.myshopify.com');

    expect(prisma.adConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          platform: 'google',
          accountId: '1234567890',
        }),
      })
    );

    getTokenSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// ADS-04: DELETE /api/ads/disconnect?platform=google — removes Google AdConnection
// ---------------------------------------------------------------------------

describe('ADS-04: DELETE /api/ads/disconnect?platform=google — removes Google AdConnection', () => {
  test('deletes Google AdConnection and returns 200 { ok: true }', async () => {
    prisma.adConnection.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete('/api/ads/disconnect?platform=google');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(prisma.adConnection.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: 'test-shop.myshopify.com',
          platform: 'google',
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// ADS-04: DELETE /api/ads/disconnect (no platform param) — returns 400
// ---------------------------------------------------------------------------

describe('ADS-04: DELETE /api/ads/disconnect (no platform) — returns 400', () => {
  test('returns 400 with error about platform param required', async () => {
    const res = await request(app)
      .delete('/api/ads/disconnect');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringMatching(/platform/i),
    });
  });
});
