// tests/__mocks__/shopifyClient.js
// Jest mock for lib/shopifyClient.js — prevents real Shopify GraphQL calls in tests.
// Override shopifyGraphQL.mockResolvedValue({...}) in individual tests.
const shopifyGraphQL = jest.fn().mockResolvedValue({});
module.exports = { shopifyGraphQL };
