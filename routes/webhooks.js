const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { prisma } = require('../lib/prisma');
const { timingSafeEqual } = require('../lib/utils');
const { upsertOrder, parseOrderFromShopify } = require('../lib/syncOrders');
const { calculateOrderProfit } = require('../lib/profitEngine');
const { checkBillingStatus } = require('./billing');

// In-memory deduplication for Shopify webhook retries (MVP: covers 15-min retry window)
const processedWebhooks = new Set();
// Clean up every 30 minutes to prevent unbounded growth
setInterval(() => processedWebhooks.clear(), 30 * 60 * 1000);

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

/**
 * POST /webhooks/orders/paid — Real-time order ingestion (SYNC-02)
 * Responds 200 immediately; processes order asynchronously to stay within Shopify's 5s timeout.
 */
router.post('/orders/paid', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) return res.status(401).send('Unauthorized');

  const webhookId = req.headers['x-shopify-webhook-id'];
  if (webhookId && processedWebhooks.has(webhookId)) return res.status(200).send('OK');
  if (webhookId) processedWebhooks.add(webhookId);

  res.status(200).send('OK'); // Respond before async work

  setImmediate(async () => {
    try {
      const rawOrder = JSON.parse(req.body.toString());
      const shop = rawOrder.myshopify_domain || new URL(rawOrder.order_status_url || 'https://unknown').hostname;
      const session = await prisma.shopSession.findFirst({ where: { shop } });
      const config = await prisma.shopConfig.findFirst({ where: { shop } });
      if (!session) return;
      const parsed = parseOrderFromShopify(rawOrder);
      await upsertOrder(prisma, shop, parsed, 0, config?.shopifyPlan || null);
    } catch (err) {
      console.error('orders/paid processing error:', err.message);
    }
  });
});

/**
 * POST /webhooks/orders/updated — Order update sync (SYNC-02)
 * Same processing path as orders/paid — full order object from Shopify.
 */
router.post('/orders/updated', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) return res.status(401).send('Unauthorized');

  const webhookId = req.headers['x-shopify-webhook-id'];
  if (webhookId && processedWebhooks.has(webhookId)) return res.status(200).send('OK');
  if (webhookId) processedWebhooks.add(webhookId);

  res.status(200).send('OK');

  setImmediate(async () => {
    try {
      const rawOrder = JSON.parse(req.body.toString());
      const shop = rawOrder.myshopify_domain;
      if (!shop) return;
      const session = await prisma.shopSession.findFirst({ where: { shop } });
      const config = await prisma.shopConfig.findFirst({ where: { shop } });
      if (!session) return;
      const parsed = parseOrderFromShopify(rawOrder);
      await upsertOrder(prisma, shop, parsed, 0, config?.shopifyPlan || null);
    } catch (err) {
      console.error('orders/updated processing error:', err.message);
    }
  });
});

/**
 * POST /webhooks/orders/cancelled — Order cancellation sync (SYNC-02)
 * Same path as updated — upsertOrder stores 'CANCELLED' as financialStatus.
 */
router.post('/orders/cancelled', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) return res.status(401).send('Unauthorized');

  const webhookId = req.headers['x-shopify-webhook-id'];
  if (webhookId && processedWebhooks.has(webhookId)) return res.status(200).send('OK');
  if (webhookId) processedWebhooks.add(webhookId);

  res.status(200).send('OK');

  setImmediate(async () => {
    try {
      const rawOrder = JSON.parse(req.body.toString());
      const shop = rawOrder.myshopify_domain;
      if (!shop) return;
      const session = await prisma.shopSession.findFirst({ where: { shop } });
      const config = await prisma.shopConfig.findFirst({ where: { shop } });
      if (!session) return;
      const parsed = parseOrderFromShopify(rawOrder);
      await upsertOrder(prisma, shop, parsed, 0, config?.shopifyPlan || null);
    } catch (err) {
      console.error('orders/cancelled processing error:', err.message);
    }
  });
});

/**
 * POST /webhooks/refunds/create — Profit reversal on refund (FEES-04)
 * Recalculates OrderProfit for the parent order with updated refund amounts.
 */
router.post('/refunds/create', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) return res.status(401).send('Unauthorized');

  const webhookId = req.headers['x-shopify-webhook-id'];
  if (webhookId && processedWebhooks.has(webhookId)) return res.status(200).send('OK');
  if (webhookId) processedWebhooks.add(webhookId);

  res.status(200).send('OK');

  setImmediate(async () => {
    try {
      const payload = JSON.parse(req.body.toString());
      const shop = payload.order_id
        ? await (async () => {
            const order = await prisma.order.findUnique({ where: { id: `gid://shopify/Order/${payload.order_id}` } });
            return order?.shop || null;
          })()
        : null;
      if (!shop) return;

      // Re-fetch the full order from DB and recalculate profit
      const order = await prisma.order.findUnique({
        where: { id: `gid://shopify/Order/${payload.order_id}` },
        include: { lineItems: true, profit: true },
      });
      if (!order) return;

      const config = await prisma.shopConfig.findFirst({ where: { shop } });
      const updatedTotalRefunded = parseFloat(payload.transactions?.reduce((s, t) => s + parseFloat(t.amount || 0), 0) || 0);
      const updatedCurrentTotal = parseFloat(order.totalPrice) - updatedTotalRefunded;

      const parsedForRecalc = {
        ...order,
        currentTotalPrice: updatedCurrentTotal,
        totalRefunded: updatedTotalRefunded,
        lineItems: order.lineItems.map(li => ({
          ...li,
          cogs: null, // Will be re-looked up by upsertOrder via profitEngine
        })),
      };

      const existingFee = order.profit ? parseFloat(order.profit.feesTotal) : 0;
      const existingFeeSource = order.profit?.feeSource || null;  // preserve verified status
      await upsertOrder(prisma, shop, parsedForRecalc, existingFee, config?.shopifyPlan || null, existingFeeSource);
    } catch (err) {
      console.error('refunds/create processing error:', err.message);
    }
  });
});

/**
 * POST /webhooks/bulk/finish — Bulk operation complete (SYNC-01)
 * Downloads and processes the JSONL result of the historical order sync.
 */
router.post('/bulk/finish', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) return res.status(401).send('Unauthorized');

  res.status(200).send('OK'); // Respond immediately — JSONL processing can take minutes

  setImmediate(async () => {
    try {
      const payload = JSON.parse(req.body.toString());
      const bulkOpGid = payload.admin_graphql_api_id;
      if (!bulkOpGid) return;

      // Find which shop triggered this bulk op
      const config = await prisma.shopConfig.findFirst({ where: { bulkOpId: bulkOpGid } });
      if (!config) {
        console.log(`bulk/finish: no config found for bulkOpId ${bulkOpGid} — skipping`);
        return;
      }

      const session = await prisma.shopSession.findFirst({ where: { shop: config.shop } });
      if (!session) return;

      // Get the JSONL download URL from Shopify
      const { shopifyGraphQL } = require('../lib/shopifyClient');
      const BULK_OP_STATUS_QUERY = `
        query($id: ID!) {
          node(id: $id) {
            ... on BulkOperation {
              id status url errorCode objectCount
            }
          }
        }
      `;
      const data = await shopifyGraphQL(config.shop, session.accessToken, BULK_OP_STATUS_QUERY, { id: bulkOpGid });
      const bulkOp = data?.node;

      if (bulkOp?.status !== 'COMPLETED') {
        console.error(`bulk/finish: operation ${bulkOpGid} status=${bulkOp?.status} errorCode=${bulkOp?.errorCode}`);
        return;
      }

      if (!bulkOp.url) {
        console.log(`bulk/finish: no data URL for ${bulkOpGid} (store may have 0 orders)`);
        await prisma.shopConfig.update({ where: { shop: config.shop }, data: { bulkOpId: null } });
        return;
      }

      console.log(`bulk/finish: processing ${bulkOp.objectCount} objects for ${config.shop}`);
      const { processBulkResult } = require('../lib/syncOrders');
      await processBulkResult(prisma, config.shop, session.accessToken, bulkOp.url);
      console.log(`bulk/finish: completed for ${config.shop}`);
    } catch (err) {
      console.error('bulk/finish processing error:', err.message);
    }
  });
});

/**
 * POST /webhooks/app_subscriptions/update — Billing status change (BILL-01)
 * Fires on subscription cancellation, expiry, or freeze.
 * NOTE: Payload may be empty ({}) since Shopify API 2024-07 — always read shop
 * from x-shopify-shop-domain header and query live status via GraphQL.
 * Registered programmatically (NOT via TOML — known Shopify CLI delivery bug).
 */
router.post('/app_subscriptions/update', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) return res.status(401).send('Unauthorized');

  res.status(200).send('OK'); // Respond immediately — webhook must 200 within 5s

  setImmediate(async () => {
    try {
      // Payload may be empty since API 2024-07 — use header for shop, not body
      const shop = req.headers['x-shopify-shop-domain'];
      if (!shop) return;

      const session = await prisma.shopSession.findFirst({ where: { shop } });
      if (!session) return;

      // Live query — don't trust empty payload
      const isActive = await checkBillingStatus(shop, session.accessToken);

      await prisma.shopSession.update({
        where: { shop },
        data: { billingStatus: isActive ? 'ACTIVE' : 'INACTIVE' },
      });

      console.log(`app_subscriptions/update: ${shop} billingStatus → ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
    } catch (err) {
      console.error('app_subscriptions/update error:', err.message);
    }
  });
});

module.exports = router;
