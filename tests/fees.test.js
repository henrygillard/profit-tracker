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
  test('upsertOrder stores shippingLines.originalPriceSet.shopMoney.amount as shippingCost', () => {
    // RED: lib/syncOrders.js not yet created
    expect(false).toBe(true, 'implement shipping extraction in lib/syncOrders.js');
  });
});

describe('payout fee attribution (SYNC-04)', () => {
  test('syncPayouts writes fee amount to OrderProfit.feesTotal for Shopify Payments orders', async () => {
    // RED: lib/syncPayouts.js not yet created
    expect(false).toBe(true, 'implement syncPayouts in lib/syncPayouts.js');
  });
});
