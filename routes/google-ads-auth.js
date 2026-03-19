// routes/google-ads-auth.js
// Google OAuth initiation and callback handler for Google Ads.
// Mounted at '/google-ads' in server.js (BEFORE verifySessionToken middleware).
// Routes: GET /auth, GET /callback
// Full paths when mounted: /google-ads/auth, /google-ads/callback

'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { prisma } = require('../lib/prisma');
const { encrypt } = require('../lib/encrypt');

/**
 * GET /auth (full: /google-ads/auth) — Initiate Google Ads OAuth
 *
 * With ?host= or ?embedded=1: breaks out of Shopify iframe (form.submit, target=_top)
 * Without iframe params: creates OAuthState for CSRF, redirects to Google consent URL
 *
 * Required OAuth params: access_type=offline, prompt=consent (both needed for refresh token)
 */
router.get('/auth', async (req, res) => {
  const shop = req.query.shop;

  // Iframe escape — identical pattern to routes/ads-auth.js lines 27-51
  // Must use form.submit with target=_top so Safari allows the redirect out of iframe.
  // Note: host param is a base64-encoded myshopify domain — can be present without shop.
  if (req.query.embedded === '1' || req.query.host) {
    const baseUrl = `${process.env.SHOPIFY_APP_URL || ''}/google-ads/auth`;
    const shopParam = shop ? `?shop=${encodeURIComponent(shop)}` : '';
    const redirectUrl = `${baseUrl}${shopParam}`;
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

  if (!shop) return res.status(400).send('Missing shop');

  try {
    if (!process.env.GOOGLE_ADS_CLIENT_ID) {
      console.error('google-ads/auth: GOOGLE_ADS_CLIENT_ID env var not set');
      return res.status(500).send('Google Ads integration not configured');
    }

    // Create CSRF state
    const state = crypto.randomBytes(16).toString('hex');
    await prisma.oAuthState.create({ data: { state, shop } });

    // Clean up old states (older than 10 minutes)
    await prisma.oAuthState.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
    });

    const client = new OAuth2Client(
      process.env.GOOGLE_ADS_CLIENT_ID,
      process.env.GOOGLE_ADS_CLIENT_SECRET,
      (process.env.SHOPIFY_APP_URL || '') + '/google-ads/callback'
    );

    const authUrl = client.generateAuthUrl({
      access_type: 'offline',   // required for refresh token
      prompt: 'consent',        // required to force refresh token on reconnect
      scope: ['https://www.googleapis.com/auth/adwords'],
      state,
    });

    res.redirect(authUrl);
  } catch (err) {
    console.error('google-ads/auth error:', err);
    res.status(500).send('Failed to initiate Google Ads OAuth');
  }
});

/**
 * GET /callback (full: /google-ads/callback) — Google redirects here with code + state
 *
 * Flow:
 * 1. Verify CSRF state exists in DB
 * 2. Exchange code for tokens via OAuth2Client.getToken()
 * 3. Call listAccessibleCustomers to get customer IDs
 * 4. Select first non-manager account (skip GAQL check if only 1 ID)
 * 5. Encrypt refresh_token with AES-256-GCM
 * 6. Upsert AdConnection row (platform='google')
 * 7. Delete OAuthState, redirect to /admin?shop=x
 */
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  try {
    // Verify CSRF state
    const stored = await prisma.oAuthState.findUnique({ where: { state } });
    if (!stored) return res.status(400).send('Invalid OAuth state');

    await prisma.oAuthState.delete({ where: { state } });
    const shop = stored.shop;

    // Exchange code for tokens
    const client = new OAuth2Client(
      process.env.GOOGLE_ADS_CLIENT_ID,
      process.env.GOOGLE_ADS_CLIENT_SECRET,
      (process.env.SHOPIFY_APP_URL || '') + '/google-ads/callback'
    );

    let tokens;
    try {
      const result = await client.getToken(code);
      tokens = result.tokens;
    } catch (err) {
      console.error('google-ads/callback: token exchange failed:', err);
      return res.status(500).send('Google token exchange failed');
    }

    // Discover accessible customer accounts
    const listRes = await fetch(
      'https://googleads.googleapis.com/v18/customers:listAccessibleCustomers',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        },
      }
    );
    const { resourceNames } = await listRes.json();
    const customerIds = (resourceNames || []).map(r => r.replace('customers/', ''));

    // Account selection: single ID → use directly; multiple → filter manager accounts
    let selectedId = customerIds[0] || null;

    if (customerIds.length > 1) {
      for (const customerId of customerIds) {
        const searchRes = await fetch(
          `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: 'SELECT customer.id, customer.manager FROM customer LIMIT 1',
            }),
          }
        );
        const data = await searchRes.json();
        const isManager = data.results?.[0]?.customer?.manager;
        if (!isManager) {
          selectedId = customerId;
          break;
        }
      }
      // Fallback: if all are managers, selectedId remains customerIds[0]
    }

    // Encrypt refresh token before storage
    const encryptedToken = encrypt(tokens.refresh_token);

    // Upsert AdConnection (one per shop+platform)
    await prisma.adConnection.upsert({
      where: { shop_platform: { shop, platform: 'google' } },
      update: { encryptedToken, accountId: selectedId },
      create: { shop, platform: 'google', encryptedToken, accountId: selectedId },
    });

    res.redirect(`/admin?shop=${encodeURIComponent(shop)}`);
  } catch (err) {
    console.error('google-ads/callback error:', err);
    res.status(500).send('Google Ads OAuth callback failed');
  }
});

module.exports = router;
