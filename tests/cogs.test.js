// tests/cogs.test.js
// TDD tests for COGS-01 (manual entry), COGS-02 (auto-populate),
// COGS-03 (CSV import), COGS-04 (time-series lookup).
// COGS-04 getCOGSAtTime becomes GREEN when lib/profitEngine.js is implemented.

const request = require('supertest');
const express = require('express');

// Set required env vars before requiring JWT-dependent modules
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test-key';
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-secret';

// Build a test app with mocked JWT middleware (always authenticated)
function makeApp() {
  const app = express();
  app.use(express.json());
  // Mock JWT middleware: always sets shopDomain for authenticated calls
  app.use('/api', (req, res, next) => {
    req.shopDomain = 'test-shop.myshopify.com';
    next();
  });
  app.use('/api', require('../routes/api'));
  return app;
}

// Build a test app with REAL JWT middleware (for 401 tests)
function makeAppWithRealAuth() {
  const verifySessionToken = require('../lib/verifySessionToken');
  const app = express();
  app.use(express.json());
  app.use('/api', verifySessionToken);
  app.use('/api', require('../routes/api'));
  return app;
}

// Mock the prisma module — routes/api.js requires('../lib/prisma')
const { prisma } = require('../lib/prisma');

describe('manual COGS entry (COGS-01)', () => {
  let app;

  beforeAll(() => {
    app = makeApp();
  });

  test('POST /api/cogs with valid JWT and body returns 201 with ProductCost', async () => {
    prisma.productCost = {
      create: jest.fn().mockResolvedValue({
        id: 1,
        variantId: 'gid://shopify/ProductVariant/12345',
        sku: 'SHIRT-RED-M',
        costAmount: '12.50',
        effectiveFrom: new Date().toISOString(),
        source: 'manual',
      }),
    };

    const res = await request(app)
      .post('/api/cogs')
      .send({ variantId: 'gid://shopify/ProductVariant/12345', sku: 'SHIRT-RED-M', costAmount: 12.50 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, variantId: 'gid://shopify/ProductVariant/12345' });
    expect(prisma.productCost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'manual' }),
      })
    );
  });

  test('POST /api/cogs without auth returns 401', async () => {
    const authApp = makeAppWithRealAuth();
    const res = await request(authApp)
      .post('/api/cogs')
      .send({ variantId: 'gid://shopify/ProductVariant/12345', costAmount: 12.50 });

    expect(res.status).toBe(401);
  });

  test('POST /api/cogs with missing variantId returns 400', async () => {
    const res = await request(app)
      .post('/api/cogs')
      .send({ sku: 'SHIRT-RED-M', costAmount: 12.50 });

    expect(res.status).toBe(400);
  });

  test('POST /api/cogs with missing costAmount returns 400', async () => {
    const res = await request(app)
      .post('/api/cogs')
      .send({ variantId: 'gid://shopify/ProductVariant/12345', sku: 'SHIRT-RED-M' });

    expect(res.status).toBe(400);
  });
});

describe('auto-populate from Shopify unitCost (COGS-02)', () => {
  const { extractCOGS } = require('../lib/syncOrders');

  test('extractCOGS returns inventoryItem.unitCost.amount as a float when present', () => {
    const lineItem = {
      variant: {
        id: 'gid://shopify/ProductVariant/1',
        sku: 'SHIRT-M',
        inventoryItem: { unitCost: { amount: '12.50' } },
      },
    };
    expect(extractCOGS(lineItem)).toBe(12.50);
  });

  test('extractCOGS returns null when inventoryItem.unitCost is absent', () => {
    const lineItemNoVariant = {};
    expect(extractCOGS(lineItemNoVariant)).toBeNull();

    const lineItemNoCost = { variant: { inventoryItem: {} } };
    expect(extractCOGS(lineItemNoCost)).toBeNull();

    const lineItemNoInventory = { variant: {} };
    expect(extractCOGS(lineItemNoInventory)).toBeNull();
  });
});

describe('CSV import (COGS-03)', () => {
  let app;

  beforeAll(() => {
    app = makeApp();
  });

  test('POST /api/cogs/csv with valid CSV file returns 200 with { imported, skipped }', async () => {
    prisma.productCost = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    };

    const csvContent = 'sku,cost\nSHIRT-RED-M,12.50\nPANTS-BLUE-L,18.00\n';

    const res = await request(app)
      .post('/api/cogs/csv')
      .attach('file', Buffer.from(csvContent), { filename: 'cogs.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.skipped).toBe(0);
  });

  test('CSV row with non-numeric cost is skipped with error logged', async () => {
    prisma.productCost = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    };

    const csvContent = 'sku,cost\nGOOD-SKU,10.00\nBAD-SKU,not-a-number\n';

    const res = await request(app)
      .post('/api/cogs/csv')
      .attach('file', Buffer.from(csvContent), { filename: 'cogs.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toContain('BAD-SKU');
  });
});

describe('COGS time-series lookup (COGS-04)', () => {
  test('getCOGSAtTime returns cost effective at order.processedAt, not current cost', async () => {
    const { getCOGSAtTime } = require('../lib/profitEngine');

    // Mock prisma: DB has two costs — $5 effective Jan 1 and $8 effective Feb 1
    // processedAt = Jan 15 → should return 5 (not 8)
    const mockPrisma = {
      productCost: {
        findFirst: jest.fn().mockImplementation(({ where, orderBy }) => {
          // Simulate time-series lookup: return the cost effective at processedAt
          // Only the $5 row has effectiveFrom <= Jan 15
          const jan1 = new Date('2025-01-01T00:00:00Z');
          const processedAt = where.effectiveFrom.lte;
          if (processedAt >= jan1) {
            return Promise.resolve({ costAmount: '5' });
          }
          return Promise.resolve(null);
        }),
      },
    };

    const processedAt = new Date('2025-01-15T00:00:00Z');
    const result = await getCOGSAtTime(mockPrisma, 'test.myshopify.com', 'variant_123', processedAt);
    expect(result).toBe(5);

    // Verify the query used the correct pattern: effectiveFrom lte processedAt
    expect(mockPrisma.productCost.findFirst).toHaveBeenCalledWith({
      where: {
        shop: 'test.myshopify.com',
        variantId: 'variant_123',
        effectiveFrom: { lte: processedAt },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  });

  test('getCOGSAtTime returns null when no ProductCost row exists', async () => {
    const { getCOGSAtTime } = require('../lib/profitEngine');

    const mockPrisma = {
      productCost: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const result = await getCOGSAtTime(mockPrisma, 'test.myshopify.com', 'unknown_variant', new Date());
    expect(result).toBeNull();
  });
});
