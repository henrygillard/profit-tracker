// tests/__mocks__/profitEngine.js
// Jest mock for lib/profitEngine.js — prevents real profit calculations requiring full Prisma in tests.
// Override calculateOrderProfit.mockReturnValue({...}) in individual tests.
const calculateOrderProfit = jest.fn().mockReturnValue({
  revenueNet: 100,
  cogsTotal: 50,
  feesTotal: 3,
  shippingCost: 5,
  netProfit: 42,
  cogsKnown: true,
});
const getCOGSAtTime = jest.fn().mockResolvedValue(null);
module.exports = { calculateOrderProfit, getCOGSAtTime };
