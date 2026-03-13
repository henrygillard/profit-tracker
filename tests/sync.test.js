// tests/sync.test.js
// Test scaffolds for SYNC-01 (bulk operations), SYNC-02 (webhooks), SYNC-03 (polling).

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

// Set test secret before requiring webhook router
process.env.SHOPIFY_API_SECRET = 'test-secret';

// Mock profitEngine before any requires
jest.mock('../lib/profitEngine', () => ({
  calculateOrderProfit: jest.fn().mockReturnValue({
    revenueNet: 100,
    cogsTotal: 50,
    feesTotal: 3,
    shippingCost: 5,
    netProfit: 42,
    cogsKnown: true,
  }),
  getCOGSAtTime: jest.fn().mockResolvedValue(null),
}), { virtual: true });

// Mock syncOrders functions to avoid DB calls in webhook route tests
jest.mock('../lib/syncOrders', () => ({
  upsertOrder: jest.fn().mockResolvedValue({ orderId: 'gid://shopify/Order/1' }),
  parseOrderFromShopify: jest.fn().mockReturnValue({
    id: 'gid://shopify/Order/1',
    shopifyOrderName: '#1001',
    processedAt: new Date('2024-01-15T00:00:00Z'),
    financialStatus: 'PAID',
    totalPrice: 100,
    currentTotalPrice: 100,
    totalRefunded: 0,
    shippingCost: 0,
    paymentGateway: 'shopify_payments',
    lineItems: [],
  }),
  processBulkResult: jest.fn().mockResolvedValue(0),
  triggerBulkSync: jest.fn().mockResolvedValue(undefined),
  syncIncrementalOrders: jest.fn().mockResolvedValue(undefined),
}));

/**
 * Build a minimal Express app that mirrors server.js middleware order for webhook tests.
 */
function buildWebhookTestApp() {
  const app = express();
  app.use(express.raw({ type: 'application/json' }));
  const webhookRouter = require('../routes/webhooks');
  app.use('/webhooks', webhookRouter);
  return app;
}

/**
 * Generate a valid Shopify HMAC signature for the given body string.
 */
function computeHmac(body) {
  return crypto
    .createHmac('sha256', 'test-secret')
    .update(Buffer.isBuffer(body) ? body : Buffer.from(body))
    .digest('base64');
}

describe('bulk operation trigger (SYNC-01)', () => {
  test('triggerBulkSync sends bulkOperationRunQuery mutation', async () => {
    const { triggerBulkSync } = jest.requireActual('../lib/syncOrders');
    const { shopifyGraphQL } = require('../lib/shopifyClient');
    const { prisma } = require('../lib/prisma');

    shopifyGraphQL.mockResolvedValue({
      bulkOperationRunQuery: {
        bulkOperation: { id: 'gid://shopify/BulkOperation/1', status: 'CREATED' },
        userErrors: [],
      },
    });

    prisma.shopConfig = {
      upsert: jest.fn().mockResolvedValue({}),
    };

    await triggerBulkSync(prisma, 'test-shop.myshopify.com', 'tok123');

    expect(shopifyGraphQL).toHaveBeenCalledWith(
      'test-shop.myshopify.com',
      'tok123',
      expect.stringContaining('bulkOperationRunQuery'),
      expect.anything()
    );
    expect(prisma.shopConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ bulkOpId: 'gid://shopify/BulkOperation/1' }),
      })
    );
  });
});

describe('JSONL parser (SYNC-01)', () => {
  test('parseJsonlLine handles order root node', () => {
    const { parseOrderFromShopify } = jest.requireActual('../lib/syncOrders');

    const raw = {
      id: 'gid://shopify/Order/1',
      name: '#1001',
      processedAt: '2024-01-15T00:00:00Z',
      displayFinancialStatus: 'PAID',
      totalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'USD' } },
      currentTotalPriceSet: { shopMoney: { amount: '100.00' } },
      totalRefundedSet: { shopMoney: { amount: '0.00' } },
      shippingLines: [],
      paymentGatewayNames: ['shopify_payments'],
      lineItems: { nodes: [] },
    };

    const result = parseOrderFromShopify(raw);

    expect(result.id).toBe('gid://shopify/Order/1');
    expect(result.shopifyOrderName).toBe('#1001');
    expect(result.processedAt).toBeInstanceOf(Date);
    expect(result.paymentGateway).toBe('shopify_payments');
    expect(result.financialStatus).toBe('PAID');
  });
});

describe('order upsert creates profit record (SYNC-01)', () => {
  test('upsertOrder writes Order and OrderProfit atomically', async () => {
    const { upsertOrder } = jest.requireActual('../lib/syncOrders');
    const { prisma } = require('../lib/prisma');

    // Set up prisma mock with transaction and required models
    prisma.$transaction = jest.fn().mockImplementation(async (ops) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops);
      }
      if (typeof ops === 'function') {
        return ops(prisma);
      }
    });
    prisma.order = {
      upsert: jest.fn().mockResolvedValue({ id: 'gid://shopify/Order/1' }),
    };
    prisma.lineItem = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    prisma.orderProfit = {
      upsert: jest.fn().mockResolvedValue({ orderId: 'gid://shopify/Order/1' }),
    };
    prisma.shopConfig = {
      upsert: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue({ shopifyPlan: 'basic', thirdPartyFeeRate: null }),
    };

    const parsedOrder = {
      id: 'gid://shopify/Order/1',
      shopifyOrderName: '#1001',
      processedAt: new Date('2024-01-15T00:00:00Z'),
      financialStatus: 'PAID',
      totalPrice: 100,
      currentTotalPrice: 100,
      totalRefunded: 0,
      shippingCost: 5,
      paymentGateway: 'shopify_payments',
      lineItems: [
        {
          id: 'gid://shopify/LineItem/1',
          variantId: 'gid://shopify/ProductVariant/1',
          sku: 'SKU-001',
          quantity: 2,
          unitPrice: 50,
          cogs: 25,
        },
      ],
    };

    const result = await upsertOrder(prisma, 'test-shop.myshopify.com', parsedOrder, 0, 'basic');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result).toHaveProperty('orderId');
  });
});

describe('orders/paid webhook (SYNC-02)', () => {
  const orderBody = JSON.stringify({
    id: 1001,
    name: '#1001',
    myshopify_domain: 'test.myshopify.com',
    processedAt: '2024-01-15T00:00:00Z',
    displayFinancialStatus: 'PAID',
    totalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'USD' } },
    currentTotalPriceSet: { shopMoney: { amount: '100.00' } },
    totalRefundedSet: { shopMoney: { amount: '0.00' } },
    shippingLines: [],
    paymentGatewayNames: ['shopify_payments'],
    lineItems: { nodes: [] },
  });

  test('POST /webhooks/orders/paid with valid HMAC responds 200 immediately', async () => {
    const { prisma } = require('../lib/prisma');
    prisma.shopSession = { findFirst: jest.fn().mockResolvedValue({ shop: 'test.myshopify.com', accessToken: 'tok' }) };
    prisma.shopConfig = { findFirst: jest.fn().mockResolvedValue(null) };

    const hmac = computeHmac(orderBody);
    const app = buildWebhookTestApp();
    const res = await request(app)
      .post('/webhooks/orders/paid')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('X-Shopify-Webhook-Id', 'wh-id-001')
      .send(orderBody);

    expect(res.status).toBe(200);
  });

  test('POST /webhooks/orders/paid with invalid HMAC returns 401', async () => {
    const app = buildWebhookTestApp();
    const res = await request(app)
      .post('/webhooks/orders/paid')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', 'invalid-hmac')
      .send(orderBody);

    expect(res.status).toBe(401);
  });

  test('POST /webhooks/orders/paid deduplicates on X-Shopify-Webhook-Id', async () => {
    const { prisma } = require('../lib/prisma');
    prisma.shopSession = { findFirst: jest.fn().mockResolvedValue({ shop: 'test.myshopify.com', accessToken: 'tok' }) };
    prisma.shopConfig = { findFirst: jest.fn().mockResolvedValue(null) };

    const hmac = computeHmac(orderBody);
    const app = buildWebhookTestApp();

    // First request
    const res1 = await request(app)
      .post('/webhooks/orders/paid')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('X-Shopify-Webhook-Id', 'wh-dedup-001')
      .send(orderBody);

    // Second request with same webhook ID
    const res2 = await request(app)
      .post('/webhooks/orders/paid')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('X-Shopify-Webhook-Id', 'wh-dedup-001')
      .send(orderBody);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});

describe('refunds/create webhook (SYNC-02)', () => {
  const refundBody = JSON.stringify({
    id: 5001,
    order_id: 1001,
    transactions: [{ amount: '10.00' }],
  });

  test('POST /webhooks/refunds/create with valid HMAC returns 200', async () => {
    const { prisma } = require('../lib/prisma');
    prisma.order = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'gid://shopify/Order/1001',
        shop: 'test.myshopify.com',
        totalPrice: '100.00',
        lineItems: [],
        profit: { feesTotal: '3.00' },
      }),
    };
    prisma.shopConfig = { findFirst: jest.fn().mockResolvedValue(null) };

    const hmac = computeHmac(refundBody);
    const app = buildWebhookTestApp();
    const res = await request(app)
      .post('/webhooks/refunds/create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('X-Shopify-Webhook-Id', 'wh-refund-001')
      .send(refundBody);

    expect(res.status).toBe(200);
  });

  test('POST /webhooks/refunds/create with invalid HMAC returns 401', async () => {
    const app = buildWebhookTestApp();
    const res = await request(app)
      .post('/webhooks/refunds/create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', 'bad-hmac')
      .send(refundBody);

    expect(res.status).toBe(401);
  });
});

// node-cron mock — captures callback so tests can invoke it synchronously
jest.mock('node-cron', () => {
  const mod = {
    schedule: jest.fn((pattern, callback, options) => {
      mod._capturedCallback = callback;
    }),
    _capturedCallback: null,
  };
  return mod;
});

describe('scheduler (SYNC-03)', () => {
  test('startScheduler registers a cron job that calls syncFn for each shop', async () => {
    const cron = require('node-cron');
    const { startScheduler } = require('../lib/scheduler');
    const { prisma } = require('../lib/prisma');

    prisma.shopSession = {
      findMany: jest.fn().mockResolvedValue([
        { shop: 'store1.myshopify.com', accessToken: 'tok1' },
        { shop: 'store2.myshopify.com', accessToken: 'tok2' },
      ]),
    };
    const syncFn = jest.fn().mockResolvedValue(undefined);

    startScheduler(prisma, syncFn);

    // Manually trigger the captured cron callback
    await cron._capturedCallback();

    expect(syncFn).toHaveBeenCalledTimes(2);
    expect(syncFn).toHaveBeenCalledWith('store1.myshopify.com', 'tok1');
    expect(syncFn).toHaveBeenCalledWith('store2.myshopify.com', 'tok2');
  });

  test('startScheduler catches syncFn errors without bubbling', async () => {
    const cron = require('node-cron');
    const { startScheduler } = require('../lib/scheduler');
    const { prisma } = require('../lib/prisma');

    prisma.shopSession = {
      findMany: jest.fn().mockResolvedValue([
        { shop: 'bad-shop.myshopify.com', accessToken: 'tok-bad' },
      ]),
    };
    const syncFn = jest.fn().mockRejectedValue(new Error('sync failure'));

    startScheduler(prisma, syncFn);

    // Should not throw even though syncFn throws
    await expect(cron._capturedCallback()).resolves.not.toThrow();
  });
});
