/**
 * tests/webhooks.test.js
 * GDPR webhook handler tests (FOUND-01)
 *
 * Tests verify HMAC authentication and correct behavior for the three
 * mandatory GDPR webhook endpoints required for Shopify App Store listing.
 */
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

// Set test secret before requiring the router
process.env.SHOPIFY_API_SECRET = 'test-secret';

const webhookRouter = require('../routes/webhooks');
const { prisma } = require('../lib/prisma');

// Build a minimal test app that mirrors the server.js middleware order
const app = express();
app.use(express.raw({ type: 'application/json' }));
app.use('/webhooks', webhookRouter);

/**
 * Generate a valid Shopify HMAC signature for the given body string.
 */
function computeHmac(body) {
  return crypto
    .createHmac('sha256', 'test-secret')
    .update(Buffer.isBuffer(body) ? body : Buffer.from(body))
    .digest('base64');
}

describe('GDPR webhook handlers (FOUND-01)', () => {
  // ------------------------------------------------------------------ //
  // customers/redact
  // ------------------------------------------------------------------ //
  describe('POST /webhooks/customers/redact', () => {
    const body = JSON.stringify({
      shop_domain: 'test.myshopify.com',
      customer: { id: 12345 },
    });

    it('with valid HMAC returns 200', async () => {
      const hmac = computeHmac(body);
      const res = await request(app)
        .post('/webhooks/customers/redact')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .send(body);

      expect(res.status).toBe(200);
    });

    it('with invalid HMAC returns 401', async () => {
      const res = await request(app)
        .post('/webhooks/customers/redact')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', 'invalid-hmac')
        .send(body);

      expect(res.status).toBe(401);
    });
  });

  // ------------------------------------------------------------------ //
  // shop/redact
  // ------------------------------------------------------------------ //
  describe('POST /webhooks/shop/redact', () => {
    const body = JSON.stringify({ myshopify_domain: 'test.myshopify.com' });

    it('with valid HMAC calls prisma.shopSession.deleteMany and returns 200', async () => {
      const hmac = computeHmac(body);
      const res = await request(app)
        .post('/webhooks/shop/redact')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .send(body);

      expect(res.status).toBe(200);
      expect(prisma.shopSession.deleteMany).toHaveBeenCalledWith({
        where: { shop: 'test.myshopify.com' },
      });
    });
  });

  // ------------------------------------------------------------------ //
  // customers/data_request
  // ------------------------------------------------------------------ //
  describe('POST /webhooks/customers/data_request', () => {
    const body = JSON.stringify({ shop_domain: 'test.myshopify.com' });

    it('with valid HMAC returns 200', async () => {
      const hmac = computeHmac(body);
      const res = await request(app)
        .post('/webhooks/customers/data_request')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .send(body);

      expect(res.status).toBe(200);
    });
  });
});
