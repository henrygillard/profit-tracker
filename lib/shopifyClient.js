// lib/shopifyClient.js
// Reusable Shopify Admin GraphQL API caller.
// All Phase 2 modules use this for Shopify API calls.

const API_VERSION = '2025-10';

/**
 * Send a GraphQL request to the Shopify Admin API.
 * @param {string} shop - Shop domain e.g. 'example.myshopify.com'
 * @param {string} accessToken - Shopify offline access token
 * @param {string} query - GraphQL query or mutation string
 * @param {object} variables - GraphQL variables (optional)
 * @returns {Promise<object>} - json.data from the Shopify response
 * @throws {Error} - on non-200 HTTP status or GraphQL errors array
 */
async function shopifyGraphQL(shop, accessToken, query, variables = {}) {
  const url = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL ${res.status}: ${text}`);
  }

  const json = await res.json();

  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }

  return json.data;
}

module.exports = { shopifyGraphQL };
