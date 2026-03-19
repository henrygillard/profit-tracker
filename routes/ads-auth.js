// routes/ads-auth.js
// Meta OAuth initiation, callback, disconnect, and connect endpoints.
// Mounted at '/ads' in server.js (BEFORE verifySessionToken middleware).
// Routes: GET /auth, GET /callback, POST /connect, DELETE /disconnect
// Full paths when mounted: /ads/auth, /ads/callback, /ads/connect, /ads/disconnect

'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { prisma } = require('../lib/prisma');
const { encrypt } = require('../lib/encrypt');

/**
 * GET /auth (full: /ads/auth) — Initiate Meta OAuth
 *
 * With ?host= or ?embedded=1: breaks out of Shopify iframe (form.submit, target=_top)
 * Without iframe params: creates OAuthState for CSRF, redirects to Meta OAuth URL
 */
router.get('/auth', async (req, res) => {
  const shop = req.query.shop;

  // Iframe escape — identical pattern to routes/auth.js lines 77-99
  // Must use form.submit with target=_top so Safari allows the redirect out of iframe.
  // Note: host param is a base64-encoded myshopify domain — can be present without shop.
  if (req.query.embedded === '1' || req.query.host) {
    const baseUrl = `${process.env.SHOPIFY_APP_URL || ''}/ads/auth`;
    const shopParam = shop ? `?shop=${encodeURIComponent(shop)}` : '';
    const redirectUrl = `${baseUrl}${shopParam}`;
    return res.send(`<!DOCTYPE html><html><head></head><body>Redirecting...<script>
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
    </script></body></html>`);
  }

  if (!shop) return res.status(400).send('Missing shop');

  try {
    if (!process.env.META_APP_ID) {
      console.error('ads/auth: META_APP_ID env var not set');
      return res.status(500).send('Meta Ads integration not configured');
    }

    // Create CSRF state
    const state = crypto.randomBytes(16).toString('hex');
    await prisma.oAuthState.create({ data: { state, shop } });

    // Clean up old states (older than 10 minutes)
    await prisma.oAuthState.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
    });

    const authUrl = [
      'https://www.facebook.com/v21.0/dialog/oauth',
      `?client_id=${process.env.META_APP_ID}`,
      `&redirect_uri=${encodeURIComponent((process.env.SHOPIFY_APP_URL || '') + '/ads/callback')}`,
      `&scope=ads_read`,
      `&state=${state}`,
      `&response_type=code`,
    ].join('');

    res.redirect(authUrl);
  } catch (err) {
    console.error('ads/auth error:', err);
    res.status(500).send('Failed to initiate Meta OAuth');
  }
});

/**
 * GET /callback (full: /ads/callback) — Meta redirects here with code + state
 *
 * Flow:
 * 1. Verify CSRF state exists in DB
 * 2. Exchange code for short-lived token
 * 3. Exchange short-lived token for long-lived token
 * 4. Fetch ad accounts from /me/adaccounts
 * 5. Encrypt long-lived token with AES-256-GCM
 * 6. Upsert AdConnection row
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

    // Exchange code for short-lived token
    const tokenUrl = [
      'https://graph.facebook.com/v21.0/oauth/access_token',
      `?client_id=${process.env.META_APP_ID}`,
      `&client_secret=${process.env.META_APP_SECRET}`,
      `&redirect_uri=${encodeURIComponent((process.env.SHOPIFY_APP_URL || '') + '/ads/callback')}`,
      `&code=${code}`,
    ].join('');

    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('ads/callback: short-lived token exchange failed:', body);
      return res.status(500).send('Meta token exchange failed');
    }
    const tokenData = await tokenRes.json();
    const shortToken = tokenData.access_token;

    // Exchange short-lived token for long-lived token (60-day)
    const longLivedUrl = [
      'https://graph.facebook.com/v21.0/oauth/access_token',
      `?grant_type=fb_exchange_token`,
      `&client_id=${process.env.META_APP_ID}`,
      `&client_secret=${process.env.META_APP_SECRET}`,
      `&fb_exchange_token=${shortToken}`,
    ].join('');

    const longRes = await fetch(longLivedUrl);
    if (!longRes.ok) {
      const body = await longRes.text();
      console.error('ads/callback: long-lived token exchange failed:', body);
      return res.status(500).send('Meta long-lived token exchange failed');
    }
    const longData = await longRes.json();
    const longToken = longData.access_token;

    // Discover ad accounts
    const meUrl = `https://graph.facebook.com/v21.0/me/adaccounts?fields=name,account_id&access_token=${longToken}`;
    const meRes = await fetch(meUrl);
    if (!meRes.ok) {
      const body = await meRes.text();
      console.error('ads/callback: /me/adaccounts failed:', body);
      return res.status(500).send('Failed to fetch Meta ad accounts');
    }
    const meData = await meRes.json();
    const accounts = meData.data || [];
    const firstAccount = accounts[0] || {};
    const accountId = firstAccount.account_id || firstAccount.id || null;
    const accountName = firstAccount.name || null;

    // Encrypt long-lived token before storage
    const encryptedToken = encrypt(longToken);

    // Upsert AdConnection (one per shop+platform)
    await prisma.adConnection.upsert({
      where: { shop_platform: { shop, platform: 'meta' } },
      update: { encryptedToken, accountId, accountName },
      create: { shop, platform: 'meta', encryptedToken, accountId, accountName },
    });

    res.redirect(`/admin?shop=${encodeURIComponent(shop)}`);
  } catch (err) {
    console.error('ads/callback error:', err);
    res.status(500).send(`Meta OAuth callback failed: ${err.message}`);
  }
});

/**
 * POST /connect (full: /ads/connect) — Directly store an AdConnection
 *
 * Body: { shop, platform, accessToken, accountId, accountName }
 * Returns: 200 { ok: true }
 */
router.post('/connect', async (req, res) => {
  const { shop, platform = 'meta', accessToken, accountId, accountName } = req.body;

  if (!shop || !accessToken) {
    return res.status(400).json({ error: 'Missing shop or accessToken' });
  }

  try {
    const encryptedToken = encrypt(accessToken);

    await prisma.adConnection.upsert({
      where: { shop_platform: { shop, platform } },
      update: { encryptedToken, accountId, accountName },
      create: { shop, platform, encryptedToken, accountId, accountName },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('ads/connect error:', err);
    res.status(500).json({ error: 'Failed to store ad connection' });
  }
});

/**
 * DELETE /disconnect (full: /ads/disconnect) — Remove AdConnection row for a shop
 *
 * Body: { shop, platform }
 * Returns: 200 { ok: true }
 *
 * Note: The JWT-protected production version (DELETE /api/ads/disconnect) will be
 * implemented in routes/ads.js (Plan 08-03) where JWT middleware is already applied.
 */
router.delete('/disconnect', async (req, res) => {
  const { shop, platform = 'meta' } = req.body;

  if (!shop) {
    return res.status(400).json({ error: 'Missing shop' });
  }

  try {
    await prisma.adConnection.deleteMany({
      where: { shop, platform },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('ads/disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect ad account' });
  }
});

module.exports = router;
