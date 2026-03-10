const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const { prisma } = require('../lib/prisma');

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

    // Verify state
    const storedState = await prisma.oAuthState.findUnique({ where: { state } });
    if (!storedState || storedState.shop !== shop) {
      return res.status(400).send('Invalid OAuth state');
    }
    await prisma.oAuthState.delete({ where: { state } });

    // Verify HMAC
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

    if (generatedHmac !== hmac) {
      return res.status(400).send('HMAC verification failed');
    }

    // Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });

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

    // Redirect to admin UI
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
