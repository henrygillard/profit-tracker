module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  roots: ['<rootDir>'],
  moduleNameMapper: {
    '^../lib/prisma$': '<rootDir>/tests/__mocks__/prisma.js',
    '^./lib/prisma$': '<rootDir>/tests/__mocks__/prisma.js',
    '^../lib/shopifyClient$': '<rootDir>/tests/__mocks__/shopifyClient.js',
    '^./lib/shopifyClient$': '<rootDir>/tests/__mocks__/shopifyClient.js',
  },
};
