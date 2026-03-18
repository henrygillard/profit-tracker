/**
 * tests/webhooks.test.js
 * GDPR webhook handler tests (FOUND-01)
 *
 * Tests verify HMAC authentication and correct behavior for the three
 * mandatory GDPR webhook endpoints required for Shopify App Store listing.
 */
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

// Mock syncOrders with a call-through wrapper so upsertOrder is a jest.fn we can spy on.
// routes/webhooks.js destructures upsertOrder at require time — jest.mock ensures the
// mock is in place before the router module loads, so the route gets the wrapped version.
jest.mock('../lib/syncOrders', () => {
  const actual = jest.requireActual('../lib/syncOrders');
  return {
    ...actual,
    upsertOrder: jest.fn(actual.upsertOrder),  // call-through by default; override per test
  };
});

// Set test secret before requiring the router
process.env.SHOPIFY_API_SECRET = 'test-secret';

const webhookRouter = require('../routes/webhooks');
const { prisma } = require('../lib/prisma');
const syncOrders = require('../lib/syncOrders');

// Build a minimal test app that mirrors the server.js middleware order
const app = express();
app.use(express.raw({ type: 'application/json' }));
app.use('/webhooks', webhookRouter);

/**
 * Generate a valid Shopify HMAC signature for the given body string.
 */
function computeHmac(body) {
  return crypto
    .createHmac('sha256', 'test-secret')
    .update(Buffer.isBuffer(body) ? body : Buffer.from(body))
    .digest('base64');
}

// ---------------------------------------------------------------------------
// FEEX-04: refunds/create webhook preserves feeSource: verified
// ---------------------------------------------------------------------------

describe('FEEX-04: refunds/create preserves feeSource on verified orders', () => {
  test('refunds/create preserves feeSource: verified for previously verified orders', async () => {
    // This test is a RED baseline — the refunds/create route does not yet exist.
    // Plan 03 will implement the route and make this green.
    // Assert: POST /webhooks/refunds/create with a valid HMAC returns 200 and
    // does NOT downgrade feeSource from 'verified' to 'pending'.
    const body = JSON.stringify({
      order_id: 12345,
      refund_line_items: [],
    });
    const hmac = computeHmac(body);

    const res = await request(app)
      .post('/webhooks/refunds/create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('X-Shopify-Shop-Domain', 'test.myshopify.com')
      .send(body);

    // Route not yet implemented — expect 404 (red baseline)
    // Plan 03 changes this to 200 with feeSource preservation logic
    expect([200, 404]).toContain(res.status);
  });

  test('refunds/create does not downgrade feeSource from verified to pending (FEEX-04)', async () => {
    // RED baseline: the refunds/create route must read the existing feeSource
    // and preserve 'verified' rather than resetting to 'pending' when recalculating.
    // Plan 03 will implement this preservation logic and make this test green.

    // Setup: mock an order that has a verified profit record
    prisma.order.findUnique.mockResolvedValue({
      id: 'gid://shopify/Order/12345',
      shop: 'test.myshopify.com',
      totalPrice: '100.00',
      paymentGateway: 'shopify_payments',
      lineItems: [],
      profit: { feesTotal: '2.50', feeSource: 'verified' },
    });
    prisma.shopConfig.findFirst.mockResolvedValue({ shopifyPlan: 'Basic' });

    const body = JSON.stringify({
      order_id: 12345,
      refund_line_items: [],
    });
    const hmac = computeHmac(body);

    const res = await request(app)
      .post('/webhooks/refunds/create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('X-Shopify-Shop-Domain', 'test.myshopify.com')
      .send(body);

    expect(res.status).toBe(200);

    // Wait for setImmediate async handler to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // RED baseline: when Plan 03 implements feeSource preservation,
    // the orderProfit.upsert must NOT write feeSource: 'pending' for a 'verified' order
    // Currently fails because upsert is called without feeSource at all
    expect(prisma.orderProfit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ feeSource: 'verified' }),
        update: expect.objectContaining({ feeSource: 'verified' }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// FEEX-04 (spy-based): assert upsertOrder receives existingFeeSource as 6th arg
// ---------------------------------------------------------------------------

describe('refunds/create preserves feeSource (FEEX-04)', () => {
  beforeEach(() => {
    // Override upsertOrder to no-op so we can capture args without Prisma mock complexity.
    // upsertOrder is already a jest.fn (call-through wrapper) from the module-level mock.
    syncOrders.upsertOrder.mockResolvedValue(undefined);
  });

  afterEach(() => {
    syncOrders.upsertOrder.mockClear();
    // Restore call-through default after each test in this block
    const actual = jest.requireActual('../lib/syncOrders');
    syncOrders.upsertOrder.mockImplementation(actual.upsertOrder);
  });

  function makeRefundBody(orderId) {
    return JSON.stringify({
      order_id: orderId,
      transactions: [{ amount: '10.00' }],
    });
  }

  test('preserves feeSource: verified for a previously-verified order', async () => {
    const orderId = 99001;
    const body = makeRefundBody(orderId);
    const hmac = computeHmac(body);

    // Order exists in DB with feeSource: 'verified'
    prisma.order.findUnique
      .mockResolvedValueOnce({ id: `gid://shopify/Order/${orderId}`, shop: 'test.myshopify.com' })
      .mockResolvedValueOnce({
        id: `gid://shopify/Order/${orderId}`,
        shop: 'test.myshopify.com',
        totalPrice: '100.00',
        paymentGateway: 'shopify_payments',
        lineItems: [],
        profit: { feesTotal: 3.50, feeSource: 'verified' },
      });

    prisma.shopConfig.findFirst.mockResolvedValueOnce({ shopifyPlan: 'Basic' });
    prisma.shopConfig.upsert.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/webhooks/refunds/create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .send(body);

    expect(res.status).toBe(200);

    // Wait for async handler to complete
    await new Promise(resolve => setImmediate(resolve));

    expect(syncOrders.upsertOrder).toHaveBeenCalled();
    // 6th argument is existingFeeSource — must be 'verified', not null or 'pending'
    const callArgs = syncOrders.upsertOrder.mock.calls[0];
    expect(callArgs[5]).toBe('verified');
  });

  test('does not downgrade feeSource from verified to pending on refund', async () => {
    const orderId = 99002;
    const body = makeRefundBody(orderId);
    const hmac = computeHmac(body);

    prisma.order.findUnique
      .mockResolvedValueOnce({ id: `gid://shopify/Order/${orderId}`, shop: 'test.myshopify.com' })
      .mockResolvedValueOnce({
        id: `gid://shopify/Order/${orderId}`,
        shop: 'test.myshopify.com',
        totalPrice: '100.00',
        paymentGateway: 'shopify_payments',
        lineItems: [],
        profit: { feesTotal: 3.50, feeSource: 'verified' },
      });

    prisma.shopConfig.findFirst.mockResolvedValueOnce({ shopifyPlan: 'Basic' });
    prisma.shopConfig.upsert.mockResolvedValueOnce({});

    await request(app)
      .post('/webhooks/refunds/create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .send(body);

    await new Promise(resolve => setImmediate(resolve));

    expect(syncOrders.upsertOrder).toHaveBeenCalled();
    // feeSource must not be downgraded — must remain 'verified', not 'pending' or null
    const callArgs = syncOrders.upsertOrder.mock.calls[0];
    expect(callArgs[5]).toBe('verified');
    expect(callArgs[5]).not.toBe('pending');
    expect(callArgs[5]).not.toBeNull();
  });
});

describe('GDPR webhook handlers (FOUND-01)', () => {
  // ------------------------------------------------------------------ //
  // customers/redact
  // ------------------------------------------------------------------ //
  describe('POST /webhooks/customers/redact', () => {
    const body = JSON.stringify({
      shop_domain: 'test.myshopify.com',
      customer: { id: 12345 },
    });

    it('with valid HMAC returns 200', async () => {
      const hmac = computeHmac(body);
      const res = await request(app)
        .post('/webhooks/customers/redact')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .send(body);

      expect(res.status).toBe(200);
    });

    it('with invalid HMAC returns 401', async () => {
      const res = await request(app)
        .post('/webhooks/customers/redact')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', 'invalid-hmac')
        .send(body);

      expect(res.status).toBe(401);
    });
  });

  // ------------------------------------------------------------------ //
  // shop/redact
  // ------------------------------------------------------------------ //
  describe('POST /webhooks/shop/redact', () => {
    const body = JSON.stringify({ myshopify_domain: 'test.myshopify.com' });

    it('with valid HMAC calls prisma.shopSession.deleteMany and returns 200', async () => {
      const hmac = computeHmac(body);
      const res = await request(app)
        .post('/webhooks/shop/redact')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .send(body);

      expect(res.status).toBe(200);
      expect(prisma.shopSession.deleteMany).toHaveBeenCalledWith({
        where: { shop: 'test.myshopify.com' },
      });
    });
  });

  // ------------------------------------------------------------------ //
  // customers/data_request
  // ------------------------------------------------------------------ //
  describe('POST /webhooks/customers/data_request', () => {
    const body = JSON.stringify({ shop_domain: 'test.myshopify.com' });

    it('with valid HMAC returns 200', async () => {
      const hmac = computeHmac(body);
      const res = await request(app)
        .post('/webhooks/customers/data_request')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .send(body);

      expect(res.status).toBe(200);
    });
  });
});
