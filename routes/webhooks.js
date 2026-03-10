const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { prisma } = require('../lib/prisma');

function verifyWebhookHmac(rawBody, hmacHeader) {
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');
  return digest === hmacHeader;
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

// Privacy compliance stubs (required for App Store listing)
router.post('/customers/redact', (_req, res) => res.status(200).send('OK'));
router.post('/customers/data_request', (_req, res) => res.status(200).send('OK'));
router.post('/shop/redact', (_req, res) => res.status(200).send('OK'));

module.exports = router;
