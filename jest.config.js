module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  roots: ['<rootDir>'],
  moduleNameMapper: {
    '^../lib/prisma$': '<rootDir>/tests/__mocks__/prisma.js',
    '^./lib/prisma$': '<rootDir>/tests/__mocks__/prisma.js',
    '^./prisma$': '<rootDir>/tests/__mocks__/prisma.js',
    '^../lib/shopifyClient$': '<rootDir>/tests/__mocks__/shopifyClient.js',
    '^./lib/shopifyClient$': '<rootDir>/tests/__mocks__/shopifyClient.js',
    '^./shopifyClient$': '<rootDir>/tests/__mocks__/shopifyClient.js',
    // billing: createBillingSubscription/checkBillingStatus are jest.fn(); billingWebhookRouter uses real impl
    '^../routes/billing$': '<rootDir>/tests/__mocks__/billing.js',
    // profitEngine is NOT mapped globally — tests that need a mock use jest.mock() inline (see sync.test.js)
    // profit.test.js, fees.test.js, cogs.test.js import the real lib/profitEngine directly
  },
};
