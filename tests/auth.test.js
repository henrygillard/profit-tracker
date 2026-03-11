/**
 * tests/auth.test.js
 * JWT session-token middleware tests (FOUND-04)
 *
 * Tests verify that the verifySessionToken middleware correctly validates
 * Shopify App Bridge session tokens (HS256 JWTs).
 *
 * These tests will fail until Plan 03 creates lib/verifySessionToken.js.
 * The try/catch pattern prevents import errors from crashing the test suite.
 */
const express = require('express');
const request = require('supertest');

// Provide required env vars before attempting any imports
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test-key';
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-secret';

let verifySessionToken = null;
let moduleLoaded = false;

try {
  verifySessionToken = require('../lib/verifySessionToken');
  moduleLoaded = true;
} catch (_err) {
  // lib/verifySessionToken.js does not exist yet — tests will fail clearly below
  moduleLoaded = false;
}

/**
 * Build a minimal express app with the JWT middleware applied to /api/* routes.
 * Returns null if the module isn't loaded yet.
 */
function buildApp() {
  if (!moduleLoaded) return null;
  const app = express();
  app.use(express.json());
  app.use('/api', verifySessionToken);
  app.get('/api/health', (req, res) => {
    res.status(200).json({ shop: req.shopDomain });
  });
  return app;
}

/**
 * Generate a test JWT signed with the test secret.
 */
function makeJwt(overrides = {}, options = {}) {
  const jwt = require('jsonwebtoken');
  const payload = {
    iss: 'https://test.myshopify.com/admin',
    dest: 'https://test.myshopify.com',
    aud: process.env.SHOPIFY_API_KEY,
    ...overrides,
  };
  return jwt.sign(payload, process.env.SHOPIFY_API_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
    ...options,
  });
}

describe('JWT session-token middleware (FOUND-04)', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  it('GET /api/health without Authorization header returns 401', async () => {
    if (!moduleLoaded) {
      // Fail clearly: module not yet implemented
      expect('lib/verifySessionToken not implemented').toBe('lib/verifySessionToken implemented');
      return;
    }
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(401);
  });

  it('GET /api/health with valid JWT returns 200 and sets shopDomain', async () => {
    if (!moduleLoaded) {
      expect('lib/verifySessionToken not implemented').toBe('lib/verifySessionToken implemented');
      return;
    }
    const token = makeJwt();
    const res = await request(app)
      .get('/api/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.shop).toBe('test.myshopify.com');
  });

  it('GET /api/health with expired JWT returns 401', async () => {
    if (!moduleLoaded) {
      expect('lib/verifySessionToken not implemented').toBe('lib/verifySessionToken implemented');
      return;
    }
    const token = makeJwt({}, { expiresIn: '-1s' });
    const res = await request(app)
      .get('/api/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('GET /api/health with wrong aud claim returns 401', async () => {
    if (!moduleLoaded) {
      expect('lib/verifySessionToken not implemented').toBe('lib/verifySessionToken implemented');
      return;
    }
    const token = makeJwt({ aud: 'wrong-key' });
    const res = await request(app)
      .get('/api/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
