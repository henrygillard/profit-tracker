// tests/fees.test.js
// TDD tests for FEES-01 (plan fee rates), FEES-02 (Shopify Payments),
// FEES-03 (shipping cost), SYNC-04 (payout attribution).
// FEES-01 and FEES-02 become GREEN when lib/profitEngine.js is implemented.
// FEES-03 and SYNC-04 remain RED until their respective modules are implemented.

const { getThirdPartyFeeRate, calculateOrderProfit } = require('../lib/profitEngine');

describe('Shopify plan fee rates (FEES-01)', () => {
  test('getThirdPartyFeeRate returns 0.02 for Basic, 0.01 for Grow, 0.006 for Advanced', () => {
    expect(getThirdPartyFeeRate('Basic')).toBe(0.02);
    expect(getThirdPartyFeeRate('Grow')).toBe(0.01);
    expect(getThirdPartyFeeRate('Advanced')).toBe(0.006);
  });

  test('getThirdPartyFeeRate returns 0.02 default for unknown plan', () => {
    expect(getThirdPartyFeeRate('UnknownPlan')).toBe(0.02);
    expect(getThirdPartyFeeRate(undefined)).toBe(0.02);
  });
});

describe('Shopify Payments processor fee (FEES-02)', () => {
  test('calculateOrderProfit uses payout fee amount when order uses Shopify Payments', () => {
    // When paymentGateway includes 'shopify_payments', use shopifyPaymentsFee directly
    const order = {
      currentTotalPrice: '100',
      totalRefunded: '0',
      lineItems: [{ variantId: 'v1', quantity: 1, unitPrice: '100', cogs: 50 }],
      paymentGateway: 'shopify_payments',
      shippingCost: '0',
      shopifyPaymentsFee: 3.50,
    };
    const result = calculateOrderProfit(order);
    expect(result.feesTotal).toBe(3.50);
    // netProfit = 100 - 50 - 3.50 - 0 = 46.50
    expect(result.netProfit).toBeCloseTo(46.50, 5);
  });
});

describe('shipping cost (FEES-03)', () => {
  const { parseOrderFromShopify } = require('../lib/syncOrders');

  test('parseOrderFromShopify sums shippingLines.originalPriceSet.shopMoney.amount as shippingCost', () => {
    const rawOrder = {
      id: 'gid://shopify/Order/1',
      name: '#1001',
      processedAt: '2025-01-15T00:00:00Z',
      displayFinancialStatus: 'PAID',
      totalPriceSet: { shopMoney: { amount: '109.99', currencyCode: 'USD' } },
      currentTotalPriceSet: { shopMoney: { amount: '109.99' } },
      totalRefundedSet: { shopMoney: { amount: '0' } },
      shippingLines: [
        { originalPriceSet: { shopMoney: { amount: '9.99' } } },
      ],
      paymentGatewayNames: ['manual'],
      lineItems: { nodes: [] },
    };

    const result = parseOrderFromShopify(rawOrder);
    expect(result.shippingCost).toBe(9.99);
  });

  test('parseOrderFromShopify sums multiple shippingLines correctly', () => {
    const rawOrder = {
      id: 'gid://shopify/Order/2',
      name: '#1002',
      processedAt: '2025-01-15T00:00:00Z',
      displayFinancialStatus: 'PAID',
      totalPriceSet: { shopMoney: { amount: '120.00', currencyCode: 'USD' } },
      currentTotalPriceSet: { shopMoney: { amount: '120.00' } },
      totalRefundedSet: { shopMoney: { amount: '0' } },
      shippingLines: [
        { originalPriceSet: { shopMoney: { amount: '5.00' } } },
        { originalPriceSet: { shopMoney: { amount: '4.99' } } },
      ],
      paymentGatewayNames: ['manual'],
      lineItems: { nodes: [] },
    };

    const result = parseOrderFromShopify(rawOrder);
    expect(result.shippingCost).toBeCloseTo(9.99, 5);
  });

  test('parseOrderFromShopify returns shippingCost of 0 when shippingLines is empty', () => {
    const rawOrder = {
      id: 'gid://shopify/Order/3',
      name: '#1003',
      processedAt: '2025-01-15T00:00:00Z',
      displayFinancialStatus: 'PAID',
      totalPriceSet: { shopMoney: { amount: '50.00', currencyCode: 'USD' } },
      currentTotalPriceSet: { shopMoney: { amount: '50.00' } },
      totalRefundedSet: { shopMoney: { amount: '0' } },
      shippingLines: [],
      paymentGatewayNames: ['manual'],
      lineItems: { nodes: [] },
    };

    const result = parseOrderFromShopify(rawOrder);
    expect(result.shippingCost).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FEEX-01: feeSource in calculateOrderProfit result
// ---------------------------------------------------------------------------

describe('feeSource in calculateOrderProfit result (FEEX-01)', () => {
  test('calculateOrderProfit result includes feeSource field', () => {
    const order = {
      currentTotalPrice: '100',
      totalRefunded: '0',
      lineItems: [{ variantId: 'v1', quantity: 1, unitPrice: '100', cogs: 50 }],
      paymentGateway: 'shopify_payments',
      shippingCost: '0',
      shopifyPaymentsFee: 3.50,
    };
    const result = calculateOrderProfit(order);
    expect(result).toHaveProperty('feeSource');
  });
});

// ---------------------------------------------------------------------------
// FEEX-01 / FEEX-03: syncPayouts writes feeSource: verified
// ---------------------------------------------------------------------------

describe('syncPayouts writes feeSource: verified (FEEX-01)', () => {
  const { shopifyGraphQL } = require('../lib/shopifyClient');
  const { syncPayouts } = require('../lib/syncPayouts');

  test('syncPayouts writes feeSource: verified alongside feesTotal', async () => {
    shopifyGraphQL.mockResolvedValueOnce({
      shopifyPaymentsAccount: {
        balanceTransactions: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            { id: 'bt1', type: 'CHARGE', fee: { amount: '2.50' }, associatedOrder: { id: 'gid://shopify/Order/12345' } },
          ],
        },
      },
    });

    const mockPrisma = {
      orderProfit: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    await syncPayouts(mockPrisma, 'test-shop.myshopify.com', 'test-token');

    expect(mockPrisma.orderProfit.update).toHaveBeenCalledWith({
      where: { orderId: 'gid://shopify/Order/12345' },
      data: { feesTotal: 2.50, feeSource: 'verified' },
    });
  });
});

// ---------------------------------------------------------------------------
// FEEX-03: upsertOrder writes correct feeSource at write time
// ---------------------------------------------------------------------------

describe('upsertOrder writes correct feeSource (FEEX-03)', () => {
  const { upsertOrder } = require('../lib/syncOrders');

  const baseOrder = {
    id: 'gid://shopify/Order/55555',
    shopifyOrderName: '#1001',
    processedAt: new Date('2025-01-15T00:00:00Z'),
    financialStatus: 'PAID',
    totalPrice: 100,
    currentTotalPrice: 100,
    totalRefunded: 0,
    shippingCost: 0,
    lineItems: [],
  };

  function makeFullMockPrisma() {
    const orderProfitUpsert = jest.fn().mockResolvedValue({});
    return {
      $transaction: jest.fn(ops => Promise.all(ops)),
      order: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      lineItem: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      orderProfit: {
        upsert: orderProfitUpsert,
      },
      shopConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      _orderProfitUpsert: orderProfitUpsert,
    };
  }

  test('Shopify Payments order with no prior fee gets feeSource: pending', async () => {
    const mockPrisma = makeFullMockPrisma();

    await upsertOrder(mockPrisma, 'test.myshopify.com', { ...baseOrder, paymentGateway: 'shopify_payments' }, 0, null);

    // RED baseline: upsertOrder must write feeSource: 'pending' for Shopify Payments orders
    // This assertion will fail until Plan 02 adds feeSource to upsertOrder
    expect(mockPrisma._orderProfitUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ feeSource: 'pending' }),
      })
    );
  });

  test('Third-party gateway order gets feeSource: estimated', async () => {
    const mockPrisma = makeFullMockPrisma();

    await upsertOrder(mockPrisma, 'test.myshopify.com', { ...baseOrder, paymentGateway: 'paypal' }, 0, 'Basic');

    // RED baseline: upsertOrder must write feeSource: 'estimated' for non-Shopify-Payments orders
    // This assertion will fail until Plan 02 adds feeSource to upsertOrder
    expect(mockPrisma._orderProfitUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ feeSource: 'estimated' }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// SYNC-04 (existing — kept unchanged)
// ---------------------------------------------------------------------------

describe('payout fee attribution (SYNC-04)', () => {
  const { shopifyGraphQL } = require('../lib/shopifyClient');
  const { syncPayouts } = require('../lib/syncPayouts');

  test('syncPayouts writes fee amount to OrderProfit.feesTotal for Shopify Payments orders', async () => {
    // Setup: mock shopifyGraphQL to return one page of balance transactions
    shopifyGraphQL.mockResolvedValueOnce({
      shopifyPaymentsAccount: {
        balanceTransactions: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            { id: 'bt1', type: 'CHARGE', fee: { amount: '2.50' }, associatedOrder: { id: 'gid://shopify/Order/12345' } },
            { id: 'bt2', type: 'CHARGE', fee: { amount: '1.00' }, associatedOrder: { id: 'gid://shopify/Order/99999' } },
          ],
        },
      },
    });

    // Setup: mock prisma with orderProfit.update
    const mockPrisma = {
      orderProfit: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    // Call syncPayouts
    await syncPayouts(mockPrisma, 'test-shop.myshopify.com', 'test-token');

    // Assert: prisma.orderProfit.update called with correct fee and feeSource for order 12345
    expect(mockPrisma.orderProfit.update).toHaveBeenCalledWith({
      where: { orderId: 'gid://shopify/Order/12345' },
      data: { feesTotal: 2.50, feeSource: 'verified' },
    });

    // Assert: called twice total (once per order)
    expect(mockPrisma.orderProfit.update).toHaveBeenCalledTimes(2);

    // Assert: shopifyGraphQL was called with a query containing 'balanceTransactions'
    expect(shopifyGraphQL).toHaveBeenCalledWith(
      'test-shop.myshopify.com',
      'test-token',
      expect.stringContaining('balanceTransactions'),
      expect.any(Object),
    );
  });
});
