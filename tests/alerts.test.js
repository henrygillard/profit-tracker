// tests/alerts.test.js
// TDD RED phase — failing stubs for Phase 7 margin alert routes.
// All tests currently FAIL with 404 (routes not yet implemented).
// Plan 07-02 will implement the routes to make these GREEN.
// Covers: ALERT-01, ALERT-02, ALERT-03, ALERT-04.

// Set required env vars before requiring any JWT-dependent modules
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test-key';
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-secret';

const request = require('supertest');
const express = require('express');

// Build a minimal Express app with mocked JWT middleware (always authenticated)
function makeApp() {
  const app = express();
  app.use(express.json());
  // Mock JWT middleware: always authenticates as test shop
  app.use('/api', (req, res, next) => {
    req.shopDomain = 'test-shop.myshopify.com';
    next();
  });
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
// ALERT-02: GET /api/settings — read margin alert threshold
// ---------------------------------------------------------------------------

describe('ALERT-02: GET /api/settings', () => {
  test('returns default marginAlertThreshold of 20 when no ShopConfig row exists', async () => {
    prisma.shopConfig.findFirst.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      marginAlertThreshold: 20,
    });
  });

  test('returns stored marginAlertThreshold of 15 when ShopConfig has threshold 15', async () => {
    prisma.shopConfig.findFirst.mockResolvedValueOnce({ marginAlertThreshold: 15.0 });

    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      marginAlertThreshold: 15,
    });
  });
});

// ---------------------------------------------------------------------------
// ALERT-02: PUT /api/settings — save margin alert threshold
// ---------------------------------------------------------------------------

describe('ALERT-02: PUT /api/settings', () => {
  test('accepts { marginAlertThreshold: 25 } and returns { marginAlertThreshold: 25 }', async () => {
    prisma.shopConfig.upsert.mockResolvedValueOnce({ marginAlertThreshold: 25.0 });

    const res = await request(app)
      .put('/api/settings')
      .send({ marginAlertThreshold: 25 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      marginAlertThreshold: 25,
    });
  });

  test('returns 400 when marginAlertThreshold is -1 (below 0)', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ marginAlertThreshold: -1 });

    expect(res.status).toBe(400);
  });

  test('returns 400 when marginAlertThreshold is 101 (above 100)', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ marginAlertThreshold: 101 });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// ALERT-01 / ALERT-04: GET /api/alerts/margin — response shape
// ---------------------------------------------------------------------------

describe('ALERT-01/ALERT-04: GET /api/alerts/margin response shape', () => {
  test('response contains threshold, atRiskCount, and atRiskSkus keys', async () => {
    prisma.shopConfig.findFirst.mockResolvedValueOnce({ marginAlertThreshold: 20.0 });
    prisma.$queryRaw.mockResolvedValueOnce([{
      variant_id: 'var-1',
      sku: 'SKU-A',
      product_name: 'Widget',
      revenue: 100.0,
      net_profit_attr: 10.0,
      all_cogs_known: true,
    }]);

    const res = await request(app).get('/api/alerts/margin');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      threshold: expect.any(Number),
      atRiskCount: expect.any(Number),
      atRiskSkus: expect.any(Array),
    });
  });

  test('atRiskCount is an integer matching atRiskSkus.length (ALERT-04)', async () => {
    prisma.shopConfig.findFirst.mockResolvedValueOnce({ marginAlertThreshold: 20.0 });
    prisma.$queryRaw.mockResolvedValueOnce([{
      variant_id: 'var-1',
      sku: 'SKU-A',
      product_name: 'Widget',
      revenue: 100.0,
      net_profit_attr: 10.0,
      all_cogs_known: true,
    }]);

    const res = await request(app).get('/api/alerts/margin');

    expect(res.status).toBe(200);
    expect(res.body.atRiskCount).toBe(res.body.atRiskSkus.length);
  });
});

// ---------------------------------------------------------------------------
// ALERT-01: GET /api/alerts/margin — filtering SKUs below threshold
// ---------------------------------------------------------------------------

describe('ALERT-01: GET /api/alerts/margin filtering', () => {
  test('atRiskSkus contains SKUs where marginPct is below threshold', async () => {
    prisma.shopConfig.findFirst.mockResolvedValueOnce({ marginAlertThreshold: 20.0 });
    // SKU with 10% margin — below 20% threshold, should appear in atRiskSkus
    prisma.$queryRaw.mockResolvedValueOnce([{
      variant_id: 'var-1',
      sku: 'SKU-A',
      product_name: 'Widget',
      revenue: 100.0,
      net_profit_attr: 10.0,  // 10% margin — below 20% threshold
      all_cogs_known: true,
    }]);

    const res = await request(app).get('/api/alerts/margin');

    expect(res.status).toBe(200);
    expect(res.body.atRiskSkus.some(s => s.sku === 'SKU-A')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ALERT-03: GET /api/alerts/margin — critical flag for negative-margin SKUs
// ---------------------------------------------------------------------------

describe('ALERT-03: GET /api/alerts/margin critical flag', () => {
  test('SKU with negative net_profit_attr has isCritical=true in response', async () => {
    prisma.shopConfig.findFirst.mockResolvedValueOnce({ marginAlertThreshold: 20.0 });
    prisma.$queryRaw.mockResolvedValueOnce([{
      variant_id: 'var-1',
      sku: 'SKU-NEG',
      product_name: 'Losing Widget',
      revenue: 100.0,
      net_profit_attr: -10.0,  // negative — must be isCritical
      all_cogs_known: true,
    }]);

    const res = await request(app).get('/api/alerts/margin');

    expect(res.status).toBe(200);
    const negSku = res.body.atRiskSkus.find(s => s.sku === 'SKU-NEG');
    expect(negSku).toBeDefined();
    expect(negSku.isCritical).toBe(true);
  });

  test('SKU with marginPct < 0 appears in atRiskSkus even when threshold is 0', async () => {
    prisma.shopConfig.findFirst.mockResolvedValueOnce({ marginAlertThreshold: 0 });
    prisma.$queryRaw.mockResolvedValueOnce([{
      variant_id: 'var-1',
      sku: 'SKU-NEG',
      product_name: 'Losing Widget',
      revenue: 100.0,
      net_profit_attr: -10.0,  // negative margin — always at-risk
      all_cogs_known: true,
    }]);

    const res = await request(app).get('/api/alerts/margin');

    expect(res.status).toBe(200);
    expect(res.body.atRiskSkus.some(s => s.sku === 'SKU-NEG')).toBe(true);
  });
});
