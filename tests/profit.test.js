// tests/profit.test.js
// Test scaffolds for profit engine pure functions — refund reversal and null COGS handling.
// All tests are RED until lib/profitEngine.js is implemented.

describe('refund profit reversal (FEES-04)', () => {
  test('calculateOrderProfit with refunded order reduces revenueNet by refund amount', () => {
    // RED: lib/profitEngine.js not yet created
    expect(false).toBe(true, 'implement calculateOrderProfit in lib/profitEngine.js');
  });
  test('partial refund adjusts cogsTotal proportionally', () => {
    // RED: lib/profitEngine.js not yet created
    expect(false).toBe(true, 'implement calculateOrderProfit in lib/profitEngine.js');
  });
});

describe('unknown COGS (COGS-04 / DASH-05 contract)', () => {
  test('calculateOrderProfit with null COGS sets cogsKnown=false and netProfit=null', () => {
    // RED: lib/profitEngine.js not yet created
    expect(false).toBe(true, 'implement calculateOrderProfit in lib/profitEngine.js');
  });
});
