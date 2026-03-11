// tests/profit.test.js
// TDD tests for profit engine pure functions — refund reversal and null COGS handling.
// These tests become GREEN when lib/profitEngine.js is implemented.

const { calculateOrderProfit } = require('../lib/profitEngine');

describe('refund profit reversal (FEES-04)', () => {
  test('calculateOrderProfit with refunded order reduces revenueNet by refund amount', () => {
    // $100 currentTotalPrice, $20 totalRefunded
    // revenueNet = 100 - 20 = 80
    // lineItems totalPrice = 1 * 80 = 80, proportionRetained = 80/80 = 1.0
    // cogsTotal = 30 * 1.0 = 30
    // feesTotal = shopifyPaymentsFee = 3 (Shopify Payments)
    // shippingCost = 5
    // netProfit = 80 - 30 - 3 - 5 = 42
    const order = {
      currentTotalPrice: '100',
      totalRefunded: '20',
      lineItems: [{ variantId: 'v1', quantity: 1, unitPrice: '80', cogs: 30 }],
      paymentGateway: 'shopify_payments',
      shippingCost: '5',
      shopifyPaymentsFee: '3',
    };
    const result = calculateOrderProfit(order);
    expect(result.revenueNet).toBe(80);
    expect(result.cogsTotal).toBe(30);
    expect(result.feesTotal).toBe(3);
    expect(result.shippingCost).toBe(5);
    expect(result.netProfit).toBe(42);
    expect(result.cogsKnown).toBe(true);
  });

  test('partial refund adjusts cogsTotal proportionally', () => {
    // $100 currentTotalPrice, $10 refunded
    // revenueNet = 100 - 10 = 90
    // lineItems totalPrice = 1 * 100 = 100
    // proportionRetained = 90/100 = 0.9
    // cogsTotal = 40 * 0.9 = 36
    const order = {
      currentTotalPrice: '100',
      totalRefunded: '10',
      lineItems: [{ variantId: 'v1', quantity: 1, unitPrice: '100', cogs: 40 }],
      paymentGateway: 'shopify_payments',
      shippingCost: '0',
      shopifyPaymentsFee: '0',
    };
    const result = calculateOrderProfit(order);
    expect(result.revenueNet).toBe(90);
    expect(result.cogsKnown).toBe(true);
    // cogsTotal proportionally reduced: 40 * (90/100) = 36
    expect(result.cogsTotal).toBeCloseTo(36, 5);
  });
});

describe('unknown COGS (COGS-04 / DASH-05 contract)', () => {
  test('calculateOrderProfit with null COGS sets cogsKnown=false and netProfit=null', () => {
    const order = {
      currentTotalPrice: '50',
      totalRefunded: '0',
      lineItems: [
        { variantId: 'v1', quantity: 1, unitPrice: '30', cogs: 10 },
        { variantId: 'v2', quantity: 1, unitPrice: '20', cogs: null }, // unknown COGS
      ],
      paymentGateway: 'manual',
      shippingCost: '5',
      shopifyPaymentsFee: null,
      planDisplayName: 'Basic',
    };
    const result = calculateOrderProfit(order);
    expect(result.cogsKnown).toBe(false);
    expect(result.cogsTotal).toBeNull();
    expect(result.netProfit).toBeNull();
  });
});
