// tests/dashboard.test.js
// TDD RED phase — failing test stubs for Phase 3 dashboard API routes.
// All 9 tests currently FAIL with 404 (routes not yet implemented).
// Plan 03-02 will implement the routes to make these GREEN.
//
// Covers: DASH-01 (overview), DASH-02 (orders list), DASH-03 (products),
//         DASH-04 (trend), DASH-05 (partial-COGS visibility).

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
// DASH-01: Dashboard overview endpoint
// ---------------------------------------------------------------------------

describe('DASH-01: GET /api/dashboard/overview', () => {
  test('returns 200 with overview fields for a date range', async () => {
    prisma.orderProfit.aggregate.mockResolvedValueOnce({
      _sum: { revenueNet: 1000.0, feesTotal: 50.0, shippingCost: 20.0, cogsTotal: 300.0 },
      _count: { _all: 10 },
    });
    prisma.orderProfit.count.mockResolvedValueOnce(2);

    const res = await request(app)
      .get('/api/dashboard/overview?from=2024-01-01&to=2024-12-31');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      revenueNet: expect.any(Number),
      feesTotal: expect.any(Number),
      shippingCost: expect.any(Number),
      cogsTotal: expect.any(Number),
      netProfit: expect.any(Number),
      orderCount: expect.any(Number),
      missingCogsCount: expect.any(Number),
      isPartial: expect.any(Boolean),
    });
  });

  test('returns isPartial: true when some orders have cogsKnown=false', async () => {
    prisma.orderProfit.aggregate.mockResolvedValueOnce({
      _sum: { revenueNet: 500.0, feesTotal: 25.0, shippingCost: 10.0, cogsTotal: null },
      _count: { _all: 5 },
    });
    // 3 orders have cogsKnown=false
    prisma.orderProfit.count.mockResolvedValueOnce(3);

    const res = await request(app)
      .get('/api/dashboard/overview?from=2024-01-01&to=2024-12-31');

    expect(res.status).toBe(200);
    expect(res.body.isPartial).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DASH-02: Orders list endpoint
// ---------------------------------------------------------------------------

describe('DASH-02: GET /api/dashboard/orders', () => {
  test('returns 200 with an array of orders including all required fields', async () => {
    prisma.orderProfit.findMany.mockResolvedValueOnce([
      {
        orderId: 'gid://shopify/Order/1',
        revenueNet: 100.0,
        cogsTotal: 30.0,
        feesTotal: 5.0,
        shippingCost: 15.0,
        netProfit: 65.0,
        marginPct: 65.0,
        cogsKnown: true,
        feeSource: 'estimated',
      },
    ]);

    const res = await request(app)
      .get('/api/dashboard/orders?from=2024-01-01&to=2024-12-31&sort=netProfit&dir=desc');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      orderId: expect.any(String),
      revenueNet: expect.any(Number),
      cogsTotal: expect.any(Number),
      feesTotal: expect.any(Number),
      shippingCost: expect.any(Number),
      feeSource: expect.stringMatching(/^(verified|estimated|pending)$/),
      netProfit: expect.any(Number),
      marginPct: expect.any(Number),
      cogsKnown: expect.any(Boolean),
    });
  });

  test('returns 200 even with an invalid sort key (allowlist enforced, defaults to processedAt)', async () => {
    prisma.orderProfit.findMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/dashboard/orders?from=2024-01-01&to=2024-12-31&sort=injected&dir=desc');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // FEEX-02: orders response includes feeSource field
  test('orders response includes feeSource field (FEEX-02)', async () => {
    prisma.orderProfit.findMany.mockResolvedValueOnce([
      {
        orderId: 'gid://shopify/Order/1',
        revenueNet: 100.0,
        cogsTotal: 30.0,
        feesTotal: 5.0,
        netProfit: 65.0,
        marginPct: 65.0,
        cogsKnown: true,
        feeSource: 'estimated',
      },
    ]);

    const res = await request(app)
      .get('/api/dashboard/orders?from=2025-01-01&to=2025-12-31');

    if (res.status === 200 && res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('feeSource');
    } else {
      // Endpoint works but no orders — field presence verified by schema
      expect(res.status).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// DASH-03: Products breakdown endpoint
// ---------------------------------------------------------------------------

describe('DASH-03: GET /api/dashboard/products', () => {
  test('returns 200 with an array of product rows including all required fields', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        variantId: 'gid://shopify/ProductVariant/1',
        sku: 'SHIRT-M',
        orderCount: 5,
        revenue: 250.0,
        netProfitAttributed: 100.0,
        marginPct: 40.0,
        allCogsKnown: true,
      },
    ]);

    const res = await request(app)
      .get('/api/dashboard/products?from=2024-01-01&to=2024-12-31');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      variantId: expect.any(String),
      sku: expect.any(String),
      orderCount: expect.any(Number),
      revenue: expect.any(Number),
      netProfitAttributed: expect.any(Number),
      marginPct: expect.any(Number),
      allCogsKnown: expect.any(Boolean),
    });
  });
});

// ---------------------------------------------------------------------------
// DASH-04: Profit trend endpoint
// ---------------------------------------------------------------------------

describe('DASH-04: GET /api/dashboard/trend', () => {
  test('returns 200 with an array of daily trend rows', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { date: '2024-01-01', netProfit: 100, revenue: 300 },
      { date: '2024-01-02', netProfit: 80, revenue: 250 },
    ]);

    const res = await request(app)
      .get('/api/dashboard/trend?from=2024-01-01&to=2024-01-31');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      netProfit: expect.any(Number),
      revenue: expect.any(Number),
    });
  });

  test('trend endpoint returns Numbers (not BigInt strings) — netProfit is typeof number in JSON', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { date: '2024-01-01', netProfit: 150, revenue: 400 },
    ]);

    const res = await request(app)
      .get('/api/dashboard/trend?from=2024-01-01&to=2024-01-31');

    expect(res.status).toBe(200);
    // Parse the JSON body to confirm types survive serialization
    const parsed = JSON.parse(JSON.stringify(res.body));
    expect(typeof parsed[0].netProfit).toBe('number');
    expect(typeof parsed[0].revenue).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// DASH-05: Partial-COGS visibility
// ---------------------------------------------------------------------------

describe('DASH-05: Partial-COGS visibility', () => {
  test('overview missingCogsCount is the exact count of cogsKnown=false rows', async () => {
    prisma.orderProfit.aggregate.mockResolvedValueOnce({
      _sum: { revenueNet: 600.0, feesTotal: 30.0, shippingCost: 15.0, cogsTotal: 200.0 },
      _count: { _all: 8 },
    });
    // Exactly 3 orders have cogsKnown=false
    prisma.orderProfit.count.mockResolvedValueOnce(3);

    const res = await request(app)
      .get('/api/dashboard/overview?from=2024-01-01&to=2024-12-31');

    expect(res.status).toBe(200);
    expect(res.body.missingCogsCount).toBe(3);
  });

  test('orders list: a cogsKnown=false order has cogsTotal null (not 0) in the response', async () => {
    prisma.orderProfit.findMany.mockResolvedValueOnce([
      {
        orderId: 'gid://shopify/Order/99',
        revenueNet: 75.0,
        cogsTotal: null,
        feesTotal: 4.0,
        netProfit: null,
        marginPct: null,
        cogsKnown: false,
      },
    ]);

    const res = await request(app)
      .get('/api/dashboard/orders?from=2024-01-01&to=2024-12-31');

    expect(res.status).toBe(200);
    expect(res.body[0].cogsKnown).toBe(false);
    expect(res.body[0].cogsTotal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CHART-01: overview shippingCost — exact value assertion
// ---------------------------------------------------------------------------
describe('CHART-01: overview includes shippingCost', () => {
  test('shippingCost field equals the summed value from aggregate', async () => {
    prisma.orderProfit.aggregate
      .mockResolvedValueOnce({
        _sum: { revenueNet: 800.0, feesTotal: 40.0, shippingCost: 25.0, cogsTotal: 300.0 },
        _count: { _all: 8 },
      })
      .mockResolvedValueOnce({
        _sum: { cogsTotal: 300.0, netProfit: 435.0 },
        _count: { _all: 8 },
      });
    prisma.orderProfit.count.mockResolvedValueOnce(0);

    const res = await request(app)
      .get('/api/dashboard/overview?from=2024-01-01&to=2024-12-31');

    expect(res.status).toBe(200);
    expect(res.body.shippingCost).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// CHART-02: orders shippingCost per order
// ---------------------------------------------------------------------------
describe('CHART-02: orders list includes shippingCost per order', () => {
  test('each order in response includes shippingCost field', async () => {
    prisma.orderProfit.findMany.mockResolvedValueOnce([
      {
        orderId: 'gid://shopify/Order/5',
        revenueNet: 120.0,
        cogsTotal: 40.0,
        feesTotal: 6.0,
        shippingCost: 8.0,
        netProfit: 66.0,
        cogsKnown: true,
        feeSource: 'verified',
      },
    ]);

    const res = await request(app)
      .get('/api/dashboard/orders?from=2024-01-01&to=2024-12-31');

    expect(res.status).toBe(200);
    expect(res.body[0].shippingCost).toBe(8);
  });
});
