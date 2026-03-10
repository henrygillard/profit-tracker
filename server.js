require('dotenv').config({ path: require('path').join(process.cwd(), '.env') });

const express = require('express');
const path = require('path');
const { prisma } = require('./lib/prisma');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway
app.set('trust proxy', 1);

// CSP frame-ancestors scoped per shop (required for Shopify embedded apps)
app.use((req, res, next) => {
  const shop = req.query.shop || '';
  const shopDomain = shop.includes('.') ? shop : shop ? `${shop}.myshopify.com` : null;
  if (shopDomain) {
    res.setHeader(
      'Content-Security-Policy',
      `frame-ancestors https://${shopDomain} https://admin.shopify.com`
    );
  } else {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  }
  next();
});

// CRITICAL: raw body for webhooks BEFORE json parser — do not change order
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes/auth'));
app.use('/webhooks', require('./routes/webhooks'));

/**
 * GET /admin — Main embedded admin UI
 * Shopify opens this in an iframe inside the admin after OAuth.
 */
app.get('/admin', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop parameter');

  const session = await prisma.shopSession.findFirst({ where: { shop } });
  if (!session) {
    return res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>profit tracker</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f6f6f7;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 48px 56px;
      text-align: center;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04);
      max-width: 480px;
      width: 100%;
    }
    h1 { font-size: 28px; color: #1a1a2e; margin-bottom: 12px; }
    p { font-size: 15px; color: #6b7280; line-height: 1.5; }
    .shop { margin-top: 24px; font-size: 13px; color: #9ca3af; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Welcome to profit tracker</h1>
    <p>Your app is installed and ready. Start building features here.</p>
    <div class="shop">${shop}</div>
  </div>
</body>
</html>`);
});

// Root redirect: if shop param present, go to /admin; else show install prompt
app.get('/', (req, res) => {
  const shop = req.query.shop;
  if (shop) return res.redirect(`/admin?shop=${encodeURIComponent(shop)}`);
  res.send(`<!DOCTYPE html>
<html><head><title>profit tracker</title></head>
<body style="font-family:sans-serif;padding:40px;text-align:center">
  <h1>profit tracker</h1>
  <p>Install this app from the Shopify App Store.</p>
</body></html>`);
});

app.listen(PORT, () => {
  console.log(`profit tracker server running on port ${PORT}`);
});
