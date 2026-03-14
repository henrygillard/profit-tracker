const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const { prisma } = require('../lib/prisma');
const { validateShop, timingSafeEqual } = require('../lib/utils');
const { shopifyGraphQL } = require('../lib/shopifyClient');
const { createBillingSubscription } = require('./billing');

const WEBHOOK_TOPICS = [
  { topic: 'ORDERS_PAID',              uri: '/webhooks/orders/paid' },
  { topic: 'ORDERS_UPDATED',           uri: '/webhooks/orders/updated' },
  { topic: 'ORDERS_CANCELLED',         uri: '/webhooks/orders/cancelled' },
  { topic: 'REFUNDS_CREATE',           uri: '/webhooks/refunds/create' },
  { topic: 'BULK_OPERATIONS_FINISH',   uri: '/webhooks/bulk/finish' },
  { topic: 'APP_SUBSCRIPTIONS_UPDATE', uri: '/webhooks/app_subscriptions/update' },
];

const WEBHOOK_CREATE_MUTATION = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $uri: String!) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: { format: JSON, uri: $uri }
    ) {
      userErrors { field message }
      webhookSubscription { id }
    }
  }
`;

async function registerWebhooks(shop, accessToken) {
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) {
    console.error('registerWebhooks: SHOPIFY_APP_URL env var not set — skipping webhook registration');
    return;
  }
  for (const { topic, uri } of WEBHOOK_TOPICS) {
    try {
      const data = await shopifyGraphQL(shop, accessToken, WEBHOOK_CREATE_MUTATION, {
        topic,
        uri: appUrl + uri,
      });
      const result = data?.webhookSubscriptionCreate;
      if (result?.userErrors?.length) {
        console.error(`registerWebhooks: ${topic} error:`, result.userErrors[0].message);
      } else {
        console.log(`registerWebhooks: ${topic} registered (id: ${result?.webhookSubscription?.id})`);
      }
    } catch (err) {
      // Non-fatal: log but do not abort OAuth flow
      console.error(`registerWebhooks: failed to register ${topic}:`, err.message);
    }
  }
}

// Legal pages
router.get('/privacy', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'privacy.html'))
);
router.get('/terms', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'terms.html'))
);

/**
 * GET /auth — Initiate OAuth flow
 */
router.get('/auth', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop parameter');

  const normalizedShop = shop.includes('.') ? shop : `${shop}.myshopify.com`;

  if (!validateShop(normalizedShop)) {
    return res.status(400).send('Invalid shop domain');
  }

  // Break out of Shopify iframe for top-level OAuth redirect
  if (req.query.embedded === '1' || req.query.host) {
    const redirectUrl = `${process.env.SHOPIFY_APP_URL}/auth?shop=${encodeURIComponent(normalizedShop)}`;
    return res.send(`<!DOCTYPE html><html><head><script>
      var url = '${redirectUrl}';
      var parts = url.split('?');
      var form = document.createElement('form');
      form.method = 'GET';
      form.action = parts[0];
      form.target = '_top';
      if (parts[1]) {
        parts[1].split('&').forEach(function(p) {
          var kv = p.split('=');
          var input = document.createElement('input');
          input.type = 'hidden';
          input.name = decodeURIComponent(kv[0]);
          input.value = decodeURIComponent(kv[1] || '');
          form.appendChild(input);
        });
      }
      document.body.appendChild(form);
      form.submit();
    </script></head><body>Redirecting...</body></html>`);
  }

  try {
    const state = crypto.randomBytes(16).toString('hex');
    await prisma.oAuthState.create({ data: { state, shop: normalizedShop } });

    // Clean up old states (older than 10 minutes)
    await prisma.oAuthState.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
    });

    const scopes = process.env.SHOPIFY_SCOPES || '';
    const redirectUri = `${process.env.SHOPIFY_APP_URL}/auth/callback`;
    const authUrl = `https://${normalizedShop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    res.redirect(authUrl);
  } catch (error) {
    console.error('OAuth begin error:', error);
    res.status(500).send('Failed to initiate OAuth');
  }
});

/**
 * GET /auth/callback — Handle OAuth callback
 */
router.get('/auth/callback', async (req, res) => {
  try {
    const { shop, code, state, hmac } = req.query;

    if (!shop || !code || !state) {
      return res.status(400).send('Missing required parameters');
    }

    if (!validateShop(shop)) {
      return res.status(400).send('Invalid shop domain');
    }

    // Verify state
    const storedState = await prisma.oAuthState.findUnique({ where: { state } });
    if (!storedState || storedState.shop !== shop) {
      return res.status(400).send('Invalid OAuth state');
    }
    await prisma.oAuthState.delete({ where: { state } });

    // Verify HMAC using timing-safe comparison
    const queryParams = { ...req.query };
    delete queryParams.hmac;
    const message = Object.keys(queryParams)
      .sort()
      .map((k) => `${k}=${queryParams[k]}`)
      .join('&');
    const generatedHmac = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
      .update(message)
      .digest('hex');

    if (!timingSafeEqual(generatedHmac, hmac)) {
      return res.status(400).send('HMAC verification failed');
    }

    // Exchange code for access token (with timeout)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!tokenRes.ok) {
      return res.status(500).send('Failed to get access token');
    }

    const { access_token, scope } = await tokenRes.json();

    // Store session
    await prisma.shopSession.upsert({
      where: { shop },
      update: { accessToken: access_token, scope, isOnline: false },
      create: {
        id: `offline_${shop}`,
        shop,
        accessToken: access_token,
        scope,
        isOnline: false,
      },
    });

    console.log(`OAuth completed for ${shop}`);

    // Fire-and-forget — errors are logged inside registerWebhooks, not fatal to auth flow
    registerWebhooks(shop, access_token).catch(err =>
      console.error('registerWebhooks unexpected error:', err.message)
    );

    // Create billing subscription and redirect merchant to Shopify approval page
    try {
      const billing = await createBillingSubscription(shop, access_token);
      if (billing.confirmationUrl) {
        return res.send(`<!DOCTYPE html><html><head><script>window.top.location.href=${JSON.stringify(billing.confirmationUrl)};</script></head><body>Redirecting to billing...</body></html>`);
      }
    } catch (err) {
      console.error('createBillingSubscription error:', err.message);
    }
    // Fall through on billing error — don't block merchant indefinitely
    if (req.query.host) {
      res.redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`);
    } else {
      res.redirect(`/admin?shop=${encodeURIComponent(shop)}`);
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('OAuth callback failed: ' + error.message);
  }
});

module.exports = router;
