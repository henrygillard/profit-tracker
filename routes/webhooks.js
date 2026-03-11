const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { prisma } = require('../lib/prisma');
const { timingSafeEqual } = require('../lib/utils');

// IMPORTANT: This route requires raw body (set in server.js middleware order).
// Do not move or reorder the raw body middleware — HMAC verification will silently break.
function verifyWebhookHmac(rawBody, hmacHeader) {
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');
  return timingSafeEqual(digest, hmacHeader);
}

/**
 * POST /webhooks/app_uninstalled — Clean up sessions when app is uninstalled
 */
router.post('/app_uninstalled', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const payload = JSON.parse(req.body.toString());
    const shop = payload.myshopify_domain;
    if (shop) {
      await prisma.shopSession.deleteMany({ where: { shop } });
      console.log(`Cleaned up sessions for uninstalled shop: ${shop}`);
    }
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Webhook processing failed');
  }
});

/**
 * POST /webhooks/customers/redact — GDPR: Delete customer PII on request
 * Phase 1: No customer PII stored. Log receipt for compliance audit trail.
 * Phase 2+: Delete order-linked customer records here when order data is stored.
 */
router.post('/customers/redact', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const payload = JSON.parse(req.body.toString());
    // Phase 1: No customer PII stored. Log receipt for compliance audit trail.
    // Phase 2+: Delete order-linked customer records here when order data is stored.
    console.log('customers/redact received', {
      shop: payload.shop_domain,
      customerId: payload.customer?.id,
    });
    res.status(200).send('OK');
  } catch (err) {
    console.error('customers/redact error:', err);
    res.status(500).send('Error');
  }
});

/**
 * POST /webhooks/shop/redact — GDPR: Delete all shop data on uninstall + redact request
 * Deletes all ShopSession records for the shop (same operation as app_uninstalled).
 */
router.post('/shop/redact', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const { myshopify_domain } = JSON.parse(req.body.toString());
    if (myshopify_domain) {
      await prisma.shopSession.deleteMany({ where: { shop: myshopify_domain } });
      console.log(`shop/redact: deleted all data for ${myshopify_domain}`);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('shop/redact error:', err);
    res.status(500).send('Error');
  }
});

/**
 * POST /webhooks/customers/data_request — GDPR: Export customer data on request
 * Phase 1: No customer PII stored. Log receipt for compliance audit trail.
 * Phase 2+: Export order-linked customer records here when order data is stored.
 */
router.post('/customers/data_request', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const payload = JSON.parse(req.body.toString());
    // Phase 1: No customer PII stored. Log receipt for compliance audit trail.
    // Phase 2+: Export order-linked customer records here when order data is stored.
    console.log('customers/data_request received', {
      shop: payload.shop_domain,
      customerId: payload.customer?.id,
    });
    res.status(200).send('OK');
  } catch (err) {
    console.error('customers/data_request error:', err);
    res.status(500).send('Error');
  }
});

module.exports = router;
