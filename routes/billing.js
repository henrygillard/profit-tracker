/**
 * routes/billing.js
 * Core billing helpers for the Shopify Billing API.
 * Also exports billingWebhookRouter for the app_subscriptions/update webhook handler.
 *
 * Exports:
 *   createBillingSubscription(shop, accessToken) → { confirmationUrl } | { confirmationUrl: null, error }
 *   checkBillingStatus(shop, accessToken) → boolean (true = ACTIVE subscription exists)
 *   billingWebhookRouter — Express router with POST /app_subscriptions/update handler
 */

const express = require('express');
const crypto = require('crypto');
const { shopifyGraphQL } = require('../lib/shopifyClient');
const { prisma } = require('../lib/prisma');
const { timingSafeEqual } = require('../lib/utils');

// ---------------------------------------------------------------------------
// GraphQL strings — verbatim from 04-RESEARCH.md
// ---------------------------------------------------------------------------

const CREATE_SUBSCRIPTION_MUTATION = `
  mutation AppSubscriptionCreate(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: URL!
    $trialDays: Int
  ) {
    appSubscriptionCreate(
      name: $name
      lineItems: $lineItems
      returnUrl: $returnUrl
      trialDays: $trialDays
    ) {
      userErrors { field message }
      appSubscription { id status trialDays }
      confirmationUrl
    }
  }
`;

const ACTIVE_SUBSCRIPTIONS_QUERY = `
  query {
    currentAppInstallation {
      activeSubscriptions {
        id
        status
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// createBillingSubscription
// ---------------------------------------------------------------------------

/**
 * Create a $29/month Shopify recurring subscription with a 7-day trial.
 * Stores subscriptionId in DB on success.
 *
 * @param {string} shop - Shop domain e.g. 'example.myshopify.com'
 * @param {string} accessToken - Shopify offline access token
 * @returns {Promise<{ confirmationUrl: string } | { confirmationUrl: null, error: string }>}
 */
async function createBillingSubscription(shop, accessToken) {
  try {
    const variables = {
      name: 'Profit Tracker $29/month',
      returnUrl: `${process.env.SHOPIFY_APP_URL}/admin?shop=${encodeURIComponent(shop)}`,
      trialDays: 7,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: 29, currencyCode: 'USD' },
              interval: 'EVERY_30_DAYS',
            },
          },
        },
      ],
    };

    const data = await shopifyGraphQL(shop, accessToken, CREATE_SUBSCRIPTION_MUTATION, variables);
    const { confirmationUrl, appSubscription, userErrors } = data.appSubscriptionCreate;

    if (userErrors && userErrors.length > 0) {
      console.error('createBillingSubscription userErrors:', userErrors);
      return { confirmationUrl: null, error: userErrors[0].message };
    }

    // Store subscriptionId in DB for webhook correlation
    await prisma.shopSession.update({
      where: { shop },
      data: { subscriptionId: appSubscription.id },
    });

    return { confirmationUrl };
  } catch (err) {
    console.error('createBillingSubscription error:', err.message);
    return { confirmationUrl: null, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// checkBillingStatus
// ---------------------------------------------------------------------------

/**
 * Query Shopify for the shop's current active subscriptions.
 * Returns true if any subscription has status 'ACTIVE', false otherwise.
 * Fails closed on exception (returns false) — never grants access on error.
 *
 * @param {string} shop - Shop domain e.g. 'example.myshopify.com'
 * @param {string} accessToken - Shopify offline access token
 * @returns {Promise<boolean>}
 */
async function checkBillingStatus(shop, accessToken) {
  try {
    const data = await shopifyGraphQL(shop, accessToken, ACTIVE_SUBSCRIPTIONS_QUERY);
    const activeSubscriptions = data?.currentAppInstallation?.activeSubscriptions ?? [];
    return activeSubscriptions.some(s => s.status === 'ACTIVE');
  } catch (err) {
    console.error('checkBillingStatus error:', err.message);
    return false; // Fail closed — don't grant access on exception
  }
}

// ---------------------------------------------------------------------------
// billingWebhookRouter — app_subscriptions/update handler
// ---------------------------------------------------------------------------

/**
 * HMAC verification helper (same algorithm as routes/webhooks.js).
 * rawBody must be a Buffer (Express raw body middleware required upstream).
 */
function verifyWebhookHmac(rawBody, hmacHeader) {
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');
  return timingSafeEqual(digest, hmacHeader);
}

const billingWebhookRouter = express.Router();

/**
 * POST /app_subscriptions/update
 *
 * Fires on any subscription status change (cancellation, expiry, freeze).
 * NOTE: Payload may be empty ({}) since Shopify API 2024-07 — read shop from
 * x-shopify-shop-domain header, then query currentAppInstallation.activeSubscriptions
 * for the live status rather than trusting the body.
 *
 * Responds 200 immediately (Shopify requires response within 5s).
 * Async work runs in setImmediate to avoid blocking the response.
 */
billingWebhookRouter.post('/app_subscriptions/update', async (req, res) => {
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

module.exports = { createBillingSubscription, checkBillingStatus, billingWebhookRouter };
