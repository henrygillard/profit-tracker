// tests/ads.test.js
// TDD RED phase — failing stubs for Phase 8 Meta Ads routes.
// All tests currently FAIL (routes not yet implemented).
// Plan 08-02 will implement routes/ads-auth.js (ADS-01 connect/disconnect).
// Plan 08-03 will implement routes/ads.js (ADS-02 spend, ADS-03 campaigns, ADS-07 ROAS).
//
// Covers: ADS-01 (OAuth auth page, connect, disconnect),
//         ADS-02 (ad spend summary), ADS-03 (campaign list), ADS-07 (ROAS calculation).

// Set required env vars before requiring any JWT-dependent modules
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test-key';
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-secret';
process.env.ADS_ENCRYPTION_KEY = process.env.ADS_ENCRYPTION_KEY ||
  require('crypto').randomBytes(32).toString('base64');

const request = require('supertest');
const express = require('express');

// Attempt to load routes that don't exist yet — they'll be undefined until Plans 02/03
let adsAuthRouter = null;
let adsApiRouter = null;

try {
  adsAuthRouter = require('../routes/ads-auth');
} catch (e) {
  // routes/ads-auth.js not yet implemented (Plan 08-02)
}

try {
  adsApiRouter = require('../routes/ads');
} catch (e) {
  // routes/ads.js not yet implemented (Plan 08-03)
}

// Build a minimal Express app mounting both ads routers
function makeApp() {
  const app = express();
  app.use(express.json());

  // Mount ads-auth routes at /ads (non-API, OAuth callback routes)
  if (adsAuthRouter) {
    app.use('/ads', adsAuthRouter);
  }

  // Mock JWT middleware: always authenticates as test shop
  app.use('/api', (req, res, next) => {
    req.shopDomain = 'test-shop.myshopify.com';
    next();
  });

  // Mount ads API routes under /api/ads
  if (adsApiRouter) {
    app.use('/api/ads', adsApiRouter);
  }

  // Also mount the main api router for any shared routes
  app.use('/api', require('../routes/api'));

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
// ADS-01: OAuth auth page — GET /ads/auth?host=x
// ---------------------------------------------------------------------------

describe('ADS-01: GET /ads/auth — Meta OAuth auth page', () => {
  test('returns 200 with HTML containing a form that submits to Meta OAuth', async () => {
    if (!adsAuthRouter) {
      // RED: route not implemented yet
      expect(false).toBe(true); // Force failure until Plan 08-02
      return;
    }
    const res = await request(app).get('/ads/auth?host=dGVzdC1zaG9wLm15c2hvcGlmeS5jb20v');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/form/i);
    expect(res.text).toMatch(/submit/i);
  });
});

// ---------------------------------------------------------------------------
// ADS-01: POST /ads/connect — Store AdConnection after OAuth callback
// ---------------------------------------------------------------------------

describe('ADS-01: POST /ads/connect — store AdConnection', () => {
  test('stores AdConnection record via upsert and returns 200', async () => {
    if (!adsAuthRouter) {
      expect(false).toBe(true); // Force failure until Plan 08-02
      return;
    }
    prisma.adConnection.upsert.mockResolvedValueOnce({
      id: 1,
      shop: 'test-shop.myshopify.com',
      platform: 'meta',
      accountId: 'act_123456',
      accountName: 'Test Ad Account',
    });

    const res = await request(app)
      .post('/ads/connect')
      .send({
        shop: 'test-shop.myshopify.com',
        platform: 'meta',
        accessToken: 'EAABsbCS_fake_token',
        accountId: 'act_123456',
        accountName: 'Test Ad Account',
      });

    expect(res.status).toBe(200);
    expect(prisma.adConnection.upsert).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ADS-01: DELETE /ads/disconnect — Remove AdConnection row
// ---------------------------------------------------------------------------

describe('ADS-01: DELETE /ads/disconnect — remove AdConnection', () => {
  test('calls deleteMany for shop+platform and returns 200', async () => {
    if (!adsAuthRouter) {
      expect(false).toBe(true); // Force failure until Plan 08-02
      return;
    }
    prisma.adConnection.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete('/ads/disconnect')
      .send({ shop: 'test-shop.myshopify.com', platform: 'meta' });

    expect(res.status).toBe(200);
    expect(prisma.adConnection.deleteMany).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ADS-02: GET /api/ads/spend — Ad spend summary for a date range
// ---------------------------------------------------------------------------

describe('ADS-02: GET /api/ads/spend — ad spend summary', () => {
  test('returns { total, revenueNet, roas } for the requested date range (blended)', async () => {
    if (!adsApiRouter) {
      expect(false).toBe(true); // Force failure until Plan 08-03
      return;
    }
    prisma.adSpend.groupBy.mockResolvedValueOnce([
      { platform: 'meta', _sum: { spend: 250.00 } },
    ]);

    const res = await request(app)
      .get('/api/ads/spend?from=2024-01-01&to=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: expect.any(Number),
      revenueNet: expect.any(Number),
    });
    // platform field removed in Phase 9 — response is blended across all platforms
    expect(res.body).not.toHaveProperty('platform');
  });
});

// ---------------------------------------------------------------------------
// ADS-03: GET /api/ads/campaigns — Campaign-level spend breakdown
// ---------------------------------------------------------------------------

describe('ADS-03: GET /api/ads/campaigns — campaign spend list', () => {
  test('returns an array of campaign rows for the requested date range', async () => {
    if (!adsApiRouter) {
      expect(false).toBe(true); // Force failure until Plan 08-03
      return;
    }
    prisma.adSpend.groupBy.mockResolvedValueOnce([
      { campaignId: 'cmp_1', campaignName: 'Summer Sale', platform: 'meta', _sum: { spend: 100.00 } },
      { campaignId: 'cmp_2', campaignName: 'Retargeting', platform: 'meta', _sum: { spend: 75.00 } },
    ]);

    const res = await request(app)
      .get('/api/ads/campaigns?from=2024-01-01&to=2024-01-31');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toMatchObject({
      campaignId: expect.any(String),
      campaignName: expect.any(String),
      spend: expect.any(Number),
    });
  });
});

// ---------------------------------------------------------------------------
// ADS-07: ROAS calculation — revenueNet / adSpend
// ---------------------------------------------------------------------------

describe('ADS-07: ROAS — Return on Ad Spend calculation', () => {
  test('returns ROAS = revenueNet / adSpend when adSpend > 0', async () => {
    if (!adsApiRouter) {
      expect(false).toBe(true); // Force failure until Plan 08-03
      return;
    }
    const res = await request(app)
      .get('/api/ads/spend?from=2024-01-01&to=2024-01-31');

    // When route is implemented, response should include roas field
    expect(res.status).toBe(200);
    // roas should be a number (or null)
    expect(res.body).toHaveProperty('roas');
  });

  test('returns roas: null when adSpend = 0 (no division by zero)', async () => {
    if (!adsApiRouter) {
      expect(false).toBe(true); // Force failure until Plan 08-03
      return;
    }
    prisma.adSpend.groupBy.mockResolvedValueOnce([]); // no spend records

    const res = await request(app)
      .get('/api/ads/spend?from=2024-01-01&to=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.body.roas).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ADS-04: DELETE /api/ads/disconnect?platform=google — Google disconnect
// ---------------------------------------------------------------------------

describe('ADS-04: DELETE /api/ads/disconnect?platform=google', () => {
  test('deletes Google AdConnection and returns 200 { ok: true }', async () => {
    if (!adsApiRouter) {
      expect(false).toBe(true); // RED until Plan 09-03 adds ?platform= support
      return;
    }
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
// ADS-06: GET /api/ads/campaigns — includes Google rows
// ---------------------------------------------------------------------------

describe('ADS-06: GET /api/ads/campaigns — includes Google rows', () => {
  test('returns campaign rows for both meta and google platforms', async () => {
    if (!adsApiRouter) {
      expect(false).toBe(true); // RED until Plan 09-03
      return;
    }
    prisma.adSpend.groupBy.mockResolvedValueOnce([
      { campaignId: 'cmp_1', campaignName: 'Brand', platform: 'meta', _sum: { spend: 100.00 } },
      { campaignId: 'cmp_2', campaignName: 'Google Brand', platform: 'google', _sum: { spend: 50.00 } },
    ]);

    const res = await request(app)
      .get('/api/ads/campaigns?from=2024-01-01&to=2024-12-31');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    const googleRow = res.body.find(r => r.platform === 'google');
    expect(googleRow).toBeDefined();
  });
});
