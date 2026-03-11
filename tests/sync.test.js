// tests/sync.test.js
// Test scaffolds for SYNC-01 (bulk operations), SYNC-02 (webhooks), SYNC-03 (polling).

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

describe('bulk operation trigger (SYNC-01)', () => {
  test('triggerBulkSync sends bulkOperationRunQuery mutation', async () => {
    const { triggerBulkSync } = require('../lib/syncOrders');
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
    const { parseOrderFromShopify } = require('../lib/syncOrders');

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
    const { upsertOrder } = require('../lib/syncOrders');
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
  test('POST /webhooks/orders/paid with valid HMAC upserts order and returns 200', async () => {
    // RED: webhook handler not yet added to routes/webhooks.js
    expect(false).toBe(true, 'add orders/paid handler to routes/webhooks.js');
  });
  test('POST /webhooks/orders/paid with invalid HMAC returns 401', async () => {
    // RED: webhook handler not yet added
    expect(false).toBe(true, 'add orders/paid handler to routes/webhooks.js');
  });
});

describe('refunds/create webhook (SYNC-02)', () => {
  test('POST /webhooks/refunds/create recalculates profit and returns 200', async () => {
    // RED: webhook handler not yet added
    expect(false).toBe(true, 'add refunds/create handler to routes/webhooks.js');
  });
});

describe('scheduler (SYNC-03)', () => {
  test('startScheduler registers a cron job that calls syncFn for each shop', () => {
    // RED: lib/scheduler.js not yet created
    expect(false).toBe(true, 'implement startScheduler in lib/scheduler.js');
  });
});
